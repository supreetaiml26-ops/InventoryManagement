import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAddToCart,
  filterProducts,
  findProductByBarcode,
  normalizeBarcode,
} from "../lib/barcode.ts";
import type { Product } from "../lib/types.ts";

const sampleProducts: Product[] = [
  {
    id: 1,
    name: "USB-C Cable",
    category: "Accessories",
    quantity: 5,
    minimumStock: 2,
    price: 299,
    barcode: "8901234567890",
  },
  {
    id: 2,
    name: "Wireless Mouse",
    category: "Electronics",
    quantity: 0,
    minimumStock: 3,
    price: 899,
    barcode: "SKU-MOUSE-02",
  },
  {
    id: 3,
    name: "Notebook A5",
    category: "Stationery",
    quantity: 12,
    minimumStock: 5,
    price: 120,
    barcode: null,
  },
];

describe("barcode lookup and cart checks", () => {
  it("normalizes whitespace and casing", () => {
    assert.equal(normalizeBarcode("  Sku-Mouse-02 \n"), "sku-mouse-02");
  });

  it("finds exact product by numeric EAN-13 barcode from scanner", () => {
    const found = findProductByBarcode(sampleProducts, "8901234567890");
    assert.equal(found?.id, 1);
    assert.equal(found?.name, "USB-C Cable");
  });

  it("matches alphanumeric barcodes case-insensitively with surrounding whitespace", () => {
    const found = findProductByBarcode(sampleProducts, "  sku-mouse-02  ");
    assert.equal(found?.id, 2);
  });

  it("returns undefined for blank or unknown barcodes", () => {
    assert.equal(findProductByBarcode(sampleProducts, "   "), undefined);
    assert.equal(findProductByBarcode(sampleProducts, "0000000"), undefined);
  });

  it("filters products by name, category, or barcode", () => {
    assert.deepEqual(
      filterProducts(sampleProducts, "890123").map((p) => p.id),
      [1]
    );
    assert.deepEqual(
      filterProducts(sampleProducts, "stationery").map((p) => p.id),
      [3]
    );
    assert.deepEqual(filterProducts(sampleProducts, "   "), []);
  });

  it("enforces stock availability before adding to cart", () => {
    assert.deepEqual(canAddToCart(sampleProducts[0], 0), { ok: true });
    assert.deepEqual(canAddToCart(sampleProducts[0], 4), { ok: true });
    assert.deepEqual(canAddToCart(sampleProducts[0], 5), {
      ok: false,
      error: "Only 5 of USB-C Cable are in stock.",
    });
    assert.deepEqual(canAddToCart(sampleProducts[1], 0), {
      ok: false,
      error: "Wireless Mouse is out of stock.",
    });
  });
});
