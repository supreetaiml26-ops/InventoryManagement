import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutSale,
  getRecentSales,
  getSaleById,
  ServiceError,
  type PoolClientLike,
  type PoolLike,
  type QueryResult,
} from "../lib/sales-service.ts";

type StoredProduct = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

type StoredSale = {
  id: number;
  totalAmount: number;
  paymentMethod: "CASH" | "UPI" | "CARD";
  createdAt: Date;
};

type StoredSaleItem = {
  id: number;
  saleId: number;
  productId: number;
  productName: string;
  quantity: number;
  priceAtSale: number;
  subtotal: number;
};

type StoredMovement = {
  id: number;
  productId: number;
  movementType: "ADD" | "REMOVE";
  quantity: number;
  saleId: number;
};

function createMockDatabase(initialProducts: StoredProduct[]) {
  const state = {
    products: structuredClone(initialProducts),
    sales: [] as StoredSale[],
    saleItems: [] as StoredSaleItem[],
    movements: [] as StoredMovement[],
    txLog: [] as string[],
    failOnMovementInsert: false,
  };

  let snapshot: typeof state | null = null;

  async function executeQuery<T>(
    sql: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized === "BEGIN") {
      state.txLog.push("BEGIN");
      snapshot = structuredClone(state);
      return { rows: [] };
    }
    if (normalized === "COMMIT") {
      state.txLog.push("COMMIT");
      snapshot = null;
      return { rows: [] };
    }
    if (normalized === "ROLLBACK") {
      state.txLog.push("ROLLBACK");
      if (snapshot) {
        state.products = snapshot.products;
        state.sales = snapshot.sales;
        state.saleItems = snapshot.saleItems;
        state.movements = snapshot.movements;
        snapshot = null;
      }
      return { rows: [] };
    }

    if (normalized.includes("FROM products WHERE id = ANY($1::int[])")) {
      const ids = values[0] as number[];
      const rows = state.products
        .filter((p) => ids.includes(p.id))
        .sort((a, b) => a.id - b.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price.toFixed(2),
          quantity: p.quantity,
        }));
      return { rows: rows as T[] };
    }

    if (normalized.startsWith("INSERT INTO sales")) {
      const id = state.sales.length + 1;
      const createdAt = new Date("2026-11-28T12:00:00Z");
      const sale: StoredSale = {
        id,
        totalAmount: 0,
        paymentMethod: values[0] as "CASH" | "UPI" | "CARD",
        createdAt,
      };
      state.sales.push(sale);
      return { rows: [{ id, createdAt }] as T[] };
    }

    if (normalized.startsWith("INSERT INTO sale_items")) {
      const [saleId, productId, productName, quantity, price] = values as [
        number,
        number,
        string,
        number,
        string,
      ];
      const numericPrice = Number(price);
      const subtotal = numericPrice * quantity;
      const item: StoredSaleItem = {
        id: state.saleItems.length + 1,
        saleId,
        productId,
        productName,
        quantity,
        priceAtSale: numericPrice,
        subtotal,
      };
      state.saleItems.push(item);
      return {
        rows: [
          {
            productName,
            quantity,
            priceAtSale: numericPrice.toFixed(2),
            subtotal: subtotal.toFixed(2),
          },
        ] as T[],
      };
    }

    if (normalized.startsWith("UPDATE products SET quantity = quantity - $1")) {
      const [qty, productId] = values as [number, number];
      const product = state.products.find((p) => p.id === productId);
      if (product) {
        product.quantity -= qty;
      }
      return { rows: [] };
    }

    if (normalized.startsWith("INSERT INTO inventory_movements")) {
      if (state.failOnMovementInsert) {
        throw new Error("Simulated DB failure");
      }
      const [productId, quantity, saleId] = values as [number, number, number];
      state.movements.push({
        id: state.movements.length + 1,
        productId,
        movementType: "REMOVE",
        quantity,
        saleId,
      });
      return { rows: [] };
    }

    if (normalized.includes("SUM(subtotal)")) {
      const saleId = values[0] as number;
      const sum = state.saleItems
        .filter((i) => i.saleId === saleId)
        .reduce((acc, i) => acc + i.subtotal, 0);
      return { rows: [{ totalAmount: sum.toFixed(2) }] as T[] };
    }

    if (normalized.startsWith("UPDATE sales SET total_amount = $1::numeric")) {
      const [total, saleId] = values as [string, number];
      const sale = state.sales.find((s) => s.id === saleId);
      if (sale) {
        sale.totalAmount = Number(total);
      }
      return { rows: [] };
    }

    if (normalized.includes("FROM sales s LEFT JOIN sale_items si")) {
      const saleId = values[0] as number;
      const sale = state.sales.find((s) => s.id === saleId);
      if (!sale) {
        return { rows: [] };
      }
      const items = state.saleItems.filter((i) => i.saleId === sale.id);
      const rows =
        items.length === 0
          ? [
              {
                id: sale.id,
                totalAmount: sale.totalAmount.toFixed(2),
                paymentMethod: sale.paymentMethod,
                createdAt: sale.createdAt,
                productName: null,
                quantity: null,
                priceAtSale: null,
                subtotal: null,
              },
            ]
          : items.map((item) => ({
              id: sale.id,
              totalAmount: sale.totalAmount.toFixed(2),
              paymentMethod: sale.paymentMethod,
              createdAt: sale.createdAt,
              productName: item.productName,
              quantity: item.quantity,
              priceAtSale: item.priceAtSale.toFixed(2),
              subtotal: item.subtotal.toFixed(2),
            }));
      return { rows: rows as T[] };
    }

    if (normalized.includes("WITH recent_sales AS")) {
      const limit = values[0] as number;
      const recent = [...state.sales]
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
      const rows = recent.flatMap((sale) =>
        state.saleItems
          .filter((i) => i.saleId === sale.id)
          .map((item) => ({
            id: sale.id,
            totalAmount: sale.totalAmount.toFixed(2),
            paymentMethod: sale.paymentMethod,
            createdAt: sale.createdAt,
            productName: item.productName,
            quantity: item.quantity,
            priceAtSale: item.priceAtSale.toFixed(2),
            subtotal: item.subtotal.toFixed(2),
          }))
      );
      return { rows: rows as T[] };
    }

    throw new Error(`Unhandled mock query: ${normalized}`);
  }

  let releasedCount = 0;

  const client: PoolClientLike = {
    query: executeQuery,
    release() {
      releasedCount += 1;
    },
  };

  const pool: PoolLike = {
    query: executeQuery,
    async connect() {
      return client;
    },
  };

  return {
    pool,
    state,
    getReleasedCount: () => releasedCount,
  };
}

describe("sales service checkout and receipt trials", () => {
  it("completes checkout atomically, deducts stock, logs movements, and returns receipt data", async () => {
    const db = createMockDatabase([
      { id: 1, name: "USB-C Cable", price: 299, quantity: 5 },
      { id: 2, name: "Notebook A5", price: 120, quantity: 10 },
    ]);

    const sale = await checkoutSale(db.pool, {
      paymentMethod: "UPI",
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 3 },
      ],
    });

    assert.equal(sale.id, 1);
    assert.equal(sale.paymentMethod, "UPI");
    assert.equal(sale.totalAmount, 299 * 2 + 120 * 3);
    assert.equal(sale.items.length, 2);
    assert.deepEqual(db.state.txLog, ["BEGIN", "COMMIT"]);
    assert.equal(db.getReleasedCount(), 1);

    assert.equal(db.state.products[0].quantity, 3);
    assert.equal(db.state.products[1].quantity, 7);
    assert.equal(db.state.movements.length, 2);
    assert.equal(db.state.movements[0].movementType, "REMOVE");
    assert.equal(db.state.movements[0].saleId, 1);

    const receipt = await getSaleById(db.pool, 1);
    assert.equal(receipt?.id, 1);
    assert.equal(receipt?.totalAmount, 958);
    assert.equal(receipt?.items[0].productName, "USB-C Cable");

    const history = await getRecentSales(db.pool, 50);
    assert.equal(history.length, 1);
  });

  it("rolls back and returns 409 when stock is insufficient", async () => {
    const db = createMockDatabase([
      { id: 1, name: "USB-C Cable", price: 299, quantity: 1 },
    ]);

    await assert.rejects(
      () =>
        checkoutSale(db.pool, {
          paymentMethod: "CASH",
          items: [{ productId: 1, quantity: 2 }],
        }),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.status === 409 &&
        err.message.includes("Insufficient stock")
    );

    assert.deepEqual(db.state.txLog, ["BEGIN", "ROLLBACK"]);
    assert.equal(db.state.products[0].quantity, 1);
    assert.equal(db.state.sales.length, 0);
    assert.equal(db.getReleasedCount(), 1);
  });

  it("rolls back and returns 404 when a product does not exist", async () => {
    const db = createMockDatabase([
      { id: 1, name: "USB-C Cable", price: 299, quantity: 5 },
    ]);

    await assert.rejects(
      () =>
        checkoutSale(db.pool, {
          paymentMethod: "CARD",
          items: [{ productId: 999, quantity: 1 }],
        }),
      (err: unknown) => err instanceof ServiceError && err.status === 404
    );

    assert.deepEqual(db.state.txLog, ["BEGIN", "ROLLBACK"]);
    assert.equal(db.getReleasedCount(), 1);
  });

  it("rolls back all writes if an error occurs mid-transaction", async () => {
    const db = createMockDatabase([
      { id: 1, name: "USB-C Cable", price: 299, quantity: 5 },
    ]);
    db.state.failOnMovementInsert = true;

    await assert.rejects(
      () =>
        checkoutSale(db.pool, {
          paymentMethod: "CASH",
          items: [{ productId: 1, quantity: 2 }],
        }),
      /Simulated DB failure/
    );

    assert.deepEqual(db.state.txLog, ["BEGIN", "ROLLBACK"]);
    assert.equal(db.state.products[0].quantity, 5);
    assert.equal(db.state.sales.length, 0);
    assert.equal(db.state.saleItems.length, 0);
    assert.equal(db.getReleasedCount(), 1);
  });

  it("returns null when fetching a non-existent receipt ID", async () => {
    const db = createMockDatabase([]);
    const receipt = await getSaleById(db.pool, 404);
    assert.equal(receipt, null);
  });
});
