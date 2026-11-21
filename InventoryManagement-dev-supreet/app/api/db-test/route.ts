
import { NextResponse } from "next/server";
import pool from "@/lib/db";


export async function GET() {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database_name"
    );

    return NextResponse.json({
      connected: true,
      database: result.rows[0].database_name,
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    return NextResponse.json(
      { connected: false, error: "Database connection failed" },
      { status: 500 }
    );
  }
}

