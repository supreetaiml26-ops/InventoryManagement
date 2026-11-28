import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { parseInventoryAdjustmentInput } from "@/lib/validators";

// POST: Add or remove stock using a barcode
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseInventoryAdjustmentInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { barcode, movementType, quantity } = parsed.data;

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Find and lock the product
    const productResult = await client.query<{
      id: number;
      name: string;
      barcode: string | null;
      quantity: number;
    }>(
      `SELECT id, name, barcode, quantity
       FROM products
       WHERE barcode = $1
       FOR UPDATE`,
      [barcode]
    );

    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return NextResponse.json(
        { error: "No product found with this barcode" },
        { status: 404 }
      );
    }

    const product = productResult.rows[0];
    const currentQuantity = product.quantity;
    const newQuantity =
      movementType === "ADD"
        ? currentQuantity + quantity
        : currentQuantity - quantity;

    if (newQuantity < 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return NextResponse.json(
        {
          error: "Insufficient stock",
          available: currentQuantity,
        },
        { status: 400 }
      );
    }

    await client.query(
      `UPDATE products
       SET quantity = $1
       WHERE id = $2`,
      [newQuantity, product.id]
    );

    await client.query(
      `INSERT INTO inventory_movements
       (product_id, movement_type, quantity)
       VALUES ($1, $2, $3)`,
      [product.id, movementType, quantity]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      message: "Stock updated successfully",
      product: product.name,
      barcode: product.barcode,
      movementType,
      previousQuantity: currentQuantity,
      changedBy: quantity,
      newQuantity,
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Inventory rollback error:", rollbackError);
      }
    }

    console.error("Inventory update error:", error);

    return NextResponse.json(
      { error: "Could not update inventory" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        im.id,
        p.name AS "productName",
        p.barcode,
        im.movement_type AS "movementType",
        im.quantity,
        im.created_at AS "createdAt"
      FROM inventory_movements im
      JOIN products p ON p.id = im.product_id
      ORDER BY im.created_at DESC, im.id DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("History fetch error:", error);

    return NextResponse.json(
      { error: "Could not fetch inventory history" },
      { status: 500 }
    );
  }
}
