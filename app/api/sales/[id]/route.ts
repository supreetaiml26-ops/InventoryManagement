import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSaleById } from "@/lib/sales-service";
import { parseSaleId } from "@/lib/validators";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const saleId = parseSaleId(id);

  if (saleId === null) {
    return NextResponse.json({ error: "Invalid sale ID" }, { status: 400 });
  }

  try {
    const sale = await getSaleById(pool, saleId);

    if (!sale) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    return NextResponse.json(sale);
  } catch (error) {
    console.error("Fetch sale receipt error:", error);
    return NextResponse.json(
      { error: "Could not fetch sale receipt" },
      { status: 500 }
    );
  }
}
