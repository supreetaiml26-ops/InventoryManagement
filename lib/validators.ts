import type { PaymentMethod } from "./types.ts";

export type ParsedProductInput = {
  name: string;
  category: string;
  barcode: string | null;
  price: number;
  quantity: number;
  minimumStock: number;
};

export type ParsedInventoryAdjustmentInput = {
  barcode: string;
  movementType: "ADD" | "REMOVE";
  quantity: number;
};

export type ParsedSaleInput = {
  paymentMethod: PaymentMethod;
  items: { productId: number; quantity: number }[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Parses a positive integer ID from route params or JSON fields. */
export function parsePositiveInt(value: unknown): number | null {
  const num = toFiniteNumber(value);
  if (num === null || !Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

/** Parses a non-negative integer (e.g. stock counts). */
export function parseNonNegativeInt(value: unknown): number | null {
  const num = toFiniteNumber(value);
  if (num === null || !Number.isInteger(num) || num < 0) {
    return null;
  }
  return num;
}

/** Parses a non-negative finite number (e.g. price). */
export function parseNonNegativeNumber(value: unknown): number | null {
  const num = toFiniteNumber(value);
  if (num === null || num < 0) {
    return null;
  }
  return num;
}

/** Validates and normalizes `POST /api/products` payload. */
export function parseProductInput(
  body: unknown
): { ok: true; data: ParsedProductInput } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Please enter valid product details" };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const categoryRaw =
    typeof body.category === "string" ? body.category.trim() : "Other";
  const category = categoryRaw || "Other";
  const barcodeRaw =
    typeof body.barcode === "string" ? body.barcode.trim() : "";

  const price = parseNonNegativeNumber(body.price);
  const quantity = parseNonNegativeInt(body.quantity);
  const minimumStock = parseNonNegativeInt(body.minimumStock);

  if (
    !name ||
    name.length > 150 ||
    price === null ||
    quantity === null ||
    minimumStock === null ||
    category.length > 100 ||
    barcodeRaw.length > 100
  ) {
    return { ok: false, error: "Please enter valid product details" };
  }

  return {
    ok: true,
    data: {
      name,
      category,
      barcode: barcodeRaw || null,
      price,
      quantity,
      minimumStock,
    },
  };
}

/** Validates and normalizes `POST /api/inventory` payload. */
export function parseInventoryAdjustmentInput(
  body: unknown
):
  | { ok: true; data: ParsedInventoryAdjustmentInput }
  | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid barcode, movement type or quantity" };
  }

  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
  const movementType = body.movementType;
  const quantity = parsePositiveInt(body.quantity);

  if (
    !barcode ||
    barcode.length > 100 ||
    (movementType !== "ADD" && movementType !== "REMOVE") ||
    quantity === null
  ) {
    return { ok: false, error: "Invalid barcode, movement type or quantity" };
  }

  return {
    ok: true,
    data: { barcode, movementType, quantity },
  };
}

/** Validates and normalizes `POST /api/sales` payload. */
export function parseSaleInput(
  body: unknown
): { ok: true; data: ParsedSaleInput } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid sale details" };
  }

  const paymentMethod = body.paymentMethod;
  if (
    paymentMethod !== "CASH" &&
    paymentMethod !== "UPI" &&
    paymentMethod !== "CARD"
  ) {
    return {
      ok: false,
      error: "Choose Cash, UPI or Card as the payment method",
    };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, error: "Add at least one product to the sale" };
  }

  const items: { productId: number; quantity: number }[] = [];
  const seenProductIds = new Set<number>();

  for (const value of body.items) {
    if (!isRecord(value)) {
      return { ok: false, error: "Invalid product in sale" };
    }

    const productId = parsePositiveInt(value.productId);
    const quantity = parsePositiveInt(value.quantity);

    if (
      productId === null ||
      quantity === null ||
      seenProductIds.has(productId)
    ) {
      return {
        ok: false,
        error: "Each product must have a unique ID and a valid quantity",
      };
    }

    seenProductIds.add(productId);
    items.push({ productId, quantity });
  }

  return { ok: true, data: { paymentMethod, items } };
}

/** Parses a sale ID route parameter such as `"42"` into a positive integer. */
export function parseSaleId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) {
    return null;
  }
  return parsePositiveInt(rawId);
}
