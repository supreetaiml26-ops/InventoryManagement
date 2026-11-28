import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { checkoutSale, getRecentSales, ServiceError } from "@/lib/sales-service";
import { parseSaleInput } from "@/lib/validators";

export async function GET() {
  try {
    const sales = await getRecentSales(pool);
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

  const parsed = parseSaleInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const sale = await checkoutSale(pool, parsed.data);
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Complete sale error:", error);
    return NextResponse.json(
      { error: "Could not complete the sale" },
      { status: 500 }
    );
  }
}
