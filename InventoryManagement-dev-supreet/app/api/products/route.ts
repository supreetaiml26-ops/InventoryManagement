
import { NextResponse } from "next/server";
import pool from "@/lib/db";

// GET: Retrieve all products
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        category,
        price,
        quantity,
        minimum_stock AS "minimumStock",
        barcode,
        created_at AS "createdAt"
      FROM products
      ORDER BY id DESC
    `);

    const products = result.rows.map((product) => ({
      ...product,
      price: Number(product.price),
    }));

    return NextResponse.json(products);
  } catch (error) {
    console.error("Fetch products error:", error);

    return NextResponse.json(
      { error: "Could not fetch products" },
      { status: 500 }
    );
  }
}

// POST: Add a new product
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const category =
      typeof body.category === "string"
        ? body.category.trim()
        : "Other";

    const barcode =
      typeof body.barcode === "string"
        ? body.barcode.trim()
        : "";

    const price = Number(body.price);
    const quantity = Number(body.quantity);
    const minimumStock = Number(body.minimumStock);

    if (
      !name ||
      name.length > 150 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      !Number.isInteger(minimumStock) ||
      minimumStock < 0 ||
      category.length > 100 ||
      barcode.length > 100
    ) {
      return NextResponse.json(
        { error: "Please enter valid product details" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO products
        (name, category, price, quantity, minimum_stock, barcode)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         name,
         category,
         price,
         quantity,
         minimum_stock AS "minimumStock",
         barcode,
         created_at AS "createdAt"`,
      [
        name,
        category || "Other",
        price,
        quantity,
        minimumStock,
        barcode || null,
      ]
    );

    const product = {
      ...result.rows[0],
      price: Number(result.rows[0].price),
    };

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Create product error:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "This barcode is already assigned to another product" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Could not create product" },
      { status: 500 }
    );
  }
} 
