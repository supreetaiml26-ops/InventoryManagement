import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";

type PaymentMethod = "CASH" | "UPI" | "CARD";
type SaleItemInput = {
  productId: number;
  quantity: number;
};

class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const result = await pool.query(`
      WITH recent_sales AS (
        SELECT id, total_amount, payment_method, created_at
        FROM sales
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT 50
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
    `);

    type SaleHistory = {
      id: number;
      totalAmount: number;
      paymentMethod: PaymentMethod;
      createdAt: Date | null;
      items: {
        productName: string;
        quantity: number;
        priceAtSale: number;
        subtotal: number;
      }[];
    };

    const sales: SaleHistory[] = [];
    const salesById = new Map<number, SaleHistory>();

    for (const row of result.rows) {
      let sale = salesById.get(row.id);

      if (!sale) {
        sale = {
          id: row.id,
          totalAmount: Number(row.totalAmount),
          paymentMethod: row.paymentMethod,
          createdAt: row.createdAt,
          items: [],
        };
        salesById.set(sale.id, sale);
        sales.push(sale);
      }

      if (row.productName !== null) {
        sale.items.push({
          productName: row.productName,
          quantity: row.quantity,
          priceAtSale: Number(row.priceAtSale),
          subtotal: Number(row.subtotal),
        });
      }
    }

    return NextResponse.json(sales);
  } catch (error) {
    console.error("Fetch sales error:", error);
    return NextResponse.json(
      { error: "Could not fetch sales history" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid sale details" }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod;
  if (
    paymentMethod !== "CASH" &&
    paymentMethod !== "UPI" &&
    paymentMethod !== "CARD"
  ) {
    return NextResponse.json(
      { error: "Choose Cash, UPI or Card as the payment method" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "Add at least one product to the sale" },
      { status: 400 }
    );
  }

  const items: SaleItemInput[] = [];
  const seenProductIds = new Set<number>();

  for (const value of body.items) {
    if (!isRecord(value)) {
      return NextResponse.json(
        { error: "Invalid product in sale" },
        { status: 400 }
      );
    }

    const productId = Number(value.productId);
    const quantity = Number(value.quantity);

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      seenProductIds.has(productId)
    ) {
      return NextResponse.json(
        { error: "Each product must have a unique ID and a valid quantity" },
        { status: 400 }
      );
    }

    seenProductIds.add(productId);
    items.push({ productId, quantity });
  }

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const productIds = items.map((item) => item.productId).sort((a, b) => a - b);
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

    if (productResult.rows.length !== items.length) {
      throw new CheckoutError("One or more products could not be found", 404);
    }

    const productsById = new Map(
      productResult.rows.map((product) => [product.id, product])
    );

    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new CheckoutError("One or more products could not be found", 404);
      }
      if (product.quantity < item.quantity) {
        throw new CheckoutError(
          `Insufficient stock for ${product.name}. Only ${product.quantity} available.`,
          409
        );
      }
    }

    const saleResult = await client.query<{
      id: number;
      createdAt: Date | null;
    }>(
      `INSERT INTO sales (total_amount, payment_method)
       VALUES (0, $1)
       RETURNING id, created_at AS "createdAt"`,
      [paymentMethod]
    );
    const sale = saleResult.rows[0];
    const saleItems: {
      productName: string;
      quantity: number;
      priceAtSale: number;
      subtotal: number;
    }[] = [];

    for (const item of items) {
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
        [sale.id, product.id, product.name, item.quantity, product.price]
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
        [product.id, item.quantity, sale.id]
      );
    }

    const totalResult = await client.query<{ totalAmount: string }>(
      `SELECT COALESCE(SUM(subtotal), 0)::text AS "totalAmount"
       FROM sale_items
       WHERE sale_id = $1`,
      [sale.id]
    );
    const totalAmount = totalResult.rows[0].totalAmount;

    await client.query(
      `UPDATE sales
       SET total_amount = $1::numeric
       WHERE id = $2`,
      [totalAmount, sale.id]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        sale: {
          id: sale.id,
          totalAmount: Number(totalAmount),
          paymentMethod,
          createdAt: sale.createdAt,
          items: saleItems,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Sale rollback error:", rollbackError);
      }
    }

    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Complete sale error:", error);
    return NextResponse.json(
      { error: "Could not complete the sale" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
