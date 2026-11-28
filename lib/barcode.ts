import type { Product } from "./types.ts";

/** Normalizes a scanned or typed barcode for consistent comparison. */
export function normalizeBarcode(rawBarcode: string): string {
  return rawBarcode.trim().toLowerCase();
}

/** Finds a product whose barcode matches the scanned value (case-insensitive, trimmed). */
export function findProductByBarcode<T extends Pick<Product, "barcode">>(
  products: readonly T[],
  rawBarcode: string
): T | undefined {
  const target = normalizeBarcode(rawBarcode);
  if (!target) {
    return undefined;
  }

  return products.find(
    (product) =>
      typeof product.barcode === "string" &&
      normalizeBarcode(product.barcode) === target
  );
}

/** Filters products by name, category, or barcode. */
export function filterProducts<
  T extends Pick<Product, "name" | "category" | "barcode">,
>(products: readonly T[], query: string, limit = 8): T[] {
  const term = query.trim().toLowerCase();
  if (!term) {
    return [];
  }

  return products
    .filter((product) =>
      `${product.name} ${product.category} ${product.barcode ?? ""}`
        .toLowerCase()
        .includes(term)
    )
    .slice(0, limit);
}

/** Validates whether one more unit of `product` can be added to the active cart. */
export function canAddToCart(
  product: Pick<Product, "name" | "quantity">,
  currentCartQuantity: number
): { ok: true } | { ok: false; error: string } {
  if (product.quantity < 1) {
    return { ok: false, error: `${product.name} is out of stock.` };
  }

  if (currentCartQuantity >= product.quantity) {
    return {
      ok: false,
      error: `Only ${product.quantity} of ${product.name} are in stock.`,
    };
  }

  return { ok: true };
}
