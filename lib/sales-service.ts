import type { PaymentMethod, Sale, SaleItem } from "./types.ts";
import type { ParsedSaleInput } from "./validators.ts";

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
};

export interface QueryExecutor {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>;
}

export interface PoolClientLike extends QueryExecutor {
  release(): void;
}

export interface PoolLike extends QueryExecutor {
  connect(): Promise<PoolClientLike>;
}

export class ServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SaleRow = {
  id: number;
  totalAmount: string | number;
  paymentMethod: PaymentMethod;
  createdAt: Date | string | null;
  productName: string | null;
  quantity: number | null;
  priceAtSale: string | number | null;
  subtotal: string | number | null;
};

function groupSaleRows(rows: SaleRow[]): Sale[] {
  const sales: Sale[] = [];
  const salesById = new Map<number, Sale>();

  for (const row of rows) {
    let sale = salesById.get(row.id);

    if (!sale) {
      const createdAt =
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt;

      sale = {
        id: row.id,
        totalAmount: Number(row.totalAmount),
        paymentMethod: row.paymentMethod,
        createdAt,
        items: [],
      };
      salesById.set(sale.id, sale);
      sales.push(sale);
    }

    if (row.productName !== null && row.quantity !== null) {
      sale.items.push({
        productName: row.productName,
        quantity: row.quantity,
        priceAtSale: Number(row.priceAtSale),
        subtotal: Number(row.subtotal),
      });
    }
  }

  return sales;
}

/** Fetches up to `limit` most recent sales with their line items. */
export async function getRecentSales(
  db: QueryExecutor,
  limit = 50
): Promise<Sale[]> {
  const result = await db.query<SaleRow>(
    `
      WITH recent_sales AS (
        SELECT id, total_amount, payment_method, created_at
        FROM sales
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT $1
      )
      SELECT
        s.id,
        s.total_amount AS "totalAmount",
        s.payment_method AS "paymentMethod",
        s.created_at AS "createdAt",
        si.product_name AS "productName",
        si.quantity,
        si.price_at_sale AS "priceAtSale",
        si.subtotal
      FROM recent_sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      ORDER BY s.created_at DESC NULLS LAST, s.id DESC, si.id
    `,
    [limit]
  );

  return groupSaleRows(result.rows);
}

/** Fetches a single sale and its line items by ID for receipt rendering. */
export async function getSaleById(
  db: QueryExecutor,
  saleId: number
): Promise<Sale | null> {
  const result = await db.query<SaleRow>(
    `
      SELECT
        s.id,
        s.total_amount AS "totalAmount",
        s.payment_method AS "paymentMethod",
        s.created_at AS "createdAt",
        si.product_name AS "productName",
        si.quantity,
        si.price_at_sale AS "priceAtSale",
        si.subtotal
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.id = $1
      ORDER BY si.id
    `,
    [saleId]
  );

  const sales = groupSaleRows(result.rows);
  return sales[0] ?? null;
}

/** Executes an atomic checkout transaction, deducting stock and recording movements. */
export async function checkoutSale(
  db: PoolLike,
  input: ParsedSaleInput
): Promise<Sale> {
  let client: PoolClientLike | null = null;
  let transactionStarted = false;

  try {
    client = await db.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const productIds = input.items
      .map((item) => item.productId)
      .sort((a, b) => a - b);

    const productResult = await client.query<{
      id: number;
      name: string;
      price: string;
      quantity: number;
    }>(
      `SELECT id, name, price::text AS price, quantity
       FROM products
       WHERE id = ANY($1::int[])
       ORDER BY id
       FOR UPDATE`,
      [productIds]
    );

    if (productResult.rows.length !== input.items.length) {
      throw new ServiceError("One or more products could not be found", 404);
    }

    const productsById = new Map(
      productResult.rows.map((product) => [product.id, product])
    );

    for (const item of input.items) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new ServiceError("One or more products could not be found", 404);
      }
      if (product.quantity < item.quantity) {
        throw new ServiceError(
          `Insufficient stock for ${product.name}. Only ${product.quantity} available.`,
          409
        );
      }
    }

    const saleResult = await client.query<{
      id: number;
      createdAt: Date | string | null;
    }>(
      `INSERT INTO sales (total_amount, payment_method)
       VALUES (0, $1)
       RETURNING id, created_at AS "createdAt"`,
      [input.paymentMethod]
    );
    const saleRow = saleResult.rows[0];
    const saleItems: SaleItem[] = [];

    for (const item of input.items) {
      const product = productsById.get(item.productId)!;

      const saleItemResult = await client.query<{
        productName: string;
        quantity: number;
        priceAtSale: string;
        subtotal: string;
      }>(
        `INSERT INTO sale_items
          (sale_id, product_id, product_name, quantity, price_at_sale, subtotal)
         VALUES ($1, $2, $3, $4, $5::numeric, ($5::numeric * $4))
         RETURNING
          product_name AS "productName",
          quantity,
          price_at_sale AS "priceAtSale",
          subtotal`,
        [saleRow.id, product.id, product.name, item.quantity, product.price]
      );
      const saleItem = saleItemResult.rows[0];

      saleItems.push({
        productName: saleItem.productName,
        quantity: saleItem.quantity,
        priceAtSale: Number(saleItem.priceAtSale),
        subtotal: Number(saleItem.subtotal),
      });

      await client.query(
        `UPDATE products
         SET quantity = quantity - $1
         WHERE id = $2`,
        [item.quantity, product.id]
      );

      await client.query(
        `INSERT INTO inventory_movements
          (product_id, movement_type, quantity, sale_id)
         VALUES ($1, 'REMOVE', $2, $3)`,
        [product.id, item.quantity, saleRow.id]
      );
    }

    const totalResult = await client.query<{ totalAmount: string }>(
      `SELECT COALESCE(SUM(subtotal), 0)::text AS "totalAmount"
       FROM sale_items
       WHERE sale_id = $1`,
      [saleRow.id]
    );
    const totalAmount = totalResult.rows[0].totalAmount;

    await client.query(
      `UPDATE sales
       SET total_amount = $1::numeric
       WHERE id = $2`,
      [totalAmount, saleRow.id]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    const createdAt =
      saleRow.createdAt instanceof Date
        ? saleRow.createdAt.toISOString()
        : saleRow.createdAt;

    return {
      id: saleRow.id,
      totalAmount: Number(totalAmount),
      paymentMethod: input.paymentMethod,
      createdAt,
      items: saleItems,
    };
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Sale rollback error:", rollbackError);
      }
    }
    throw error;
  } finally {
    client?.release();
  }
}
