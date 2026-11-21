
import { NextResponse } from "next/server";
import pool from "@/lib/db";

// POST: Add or remove stock using a barcode
export async function POST(request: Request) {
  const client = await pool.connect();

  try {
    const body = await request.json();

    const barcode =
      typeof body.barcode === "string"
        ? body.barcode.trim()
        : "";

    const movementType = body.movementType;
    const quantity = Number(body.quantity);

    // Validate input
    if (
      !barcode ||
      barcode.length > 100 ||
      !["ADD", "REMOVE"].includes(movementType) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid barcode, movement type or quantity" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    // Find and lock the product
    const productResult = await client.query(
      `SELECT id, name, barcode, quantity
       FROM products
       WHERE barcode = $1
       FOR UPDATE`,
      [barcode]
    );

    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "No product found with this barcode" },
        { status: 404 }
      );
    }

    const product = productResult.rows[0];

    // Calculate new stock quantity
    const currentQuantity = product.quantity;

    const newQuantity =
      movementType === "ADD"
        ? currentQuantity + quantity
        : currentQuantity - quantity;

    if (newQuantity < 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Insufficient stock",
          available: currentQuantity,
        },
        { status: 400 }
      );
    }

    // Update product quantity
    await client.query(
      `UPDATE products
       SET quantity = $1
       WHERE id = $2`,
      [newQuantity, product.id]
    );

    // Record stock movement
    await client.query(
      `INSERT INTO inventory_movements
       (product_id, movement_type, quantity)
       VALUES ($1, $2, $3)`,
      [product.id, movementType, quantity]
    );

    await client.query("COMMIT");

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
    await client.query("ROLLBACK");

    console.error("Inventory update error:", error);

    return NextResponse.json(
      { error: "Could not update inventory" },
      { status: 500 }
    );

  } finally {
    client.release();
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
