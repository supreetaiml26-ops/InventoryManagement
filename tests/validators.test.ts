import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseInventoryAdjustmentInput,
  parseProductInput,
  parseSaleId,
  parseSaleInput,
} from "../lib/validators.ts";

describe("API payload validators", () => {
  it("validates and trims product creation payloads", () => {
    const result = parseProductInput({
      name: "  Mechanical Keyboard  ",
      category: "  Electronics ",
      barcode: "  8909991112223  ",
      price: 2499.5,
      quantity: 10,
      minimumStock: 3,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data, {
        name: "Mechanical Keyboard",
        category: "Electronics",
        barcode: "8909991112223",
        price: 2499.5,
        quantity: 10,
        minimumStock: 3,
      });
    }
  });

  it("rejects blank strings or invalid numbers in product payloads", () => {
    assert.equal(
      parseProductInput({
        name: "Item",
        price: "",
        quantity: 5,
        minimumStock: 1,
      }).ok,
      false
    );
    assert.equal(
      parseProductInput({
        name: "Item",
        price: 10,
        quantity: 1.5,
        minimumStock: 1,
      }).ok,
      false
    );
    assert.equal(
      parseProductInput({
        name: "   ",
        price: 10,
        quantity: 5,
        minimumStock: 1,
      }).ok,
      false
    );
  });

  it("validates inventory adjustment payloads", () => {
    const valid = parseInventoryAdjustmentInput({
      barcode: " 890123 ",
      movementType: "ADD",
      quantity: 4,
    });
    assert.equal(valid.ok, true);

    assert.equal(
      parseInventoryAdjustmentInput({
        barcode: "890123",
        movementType: "INVALID",
        quantity: 4,
      }).ok,
      false
    );
    assert.equal(
      parseInventoryAdjustmentInput({
        barcode: "890123",
        movementType: "REMOVE",
        quantity: 0,
      }).ok,
      false
    );
  });

  it("validates checkout payloads and rejects duplicate products", () => {
    const valid = parseSaleInput({
      paymentMethod: "UPI",
      items: [
        { productId: 1, quantity: 2 },
        { productId: 3, quantity: 1 },
      ],
    });
    assert.equal(valid.ok, true);

    assert.equal(
      parseSaleInput({
        paymentMethod: "CRYPTO",
        items: [{ productId: 1, quantity: 1 }],
      }).ok,
      false
    );

    assert.equal(
      parseSaleInput({
        paymentMethod: "CASH",
        items: [
          { productId: 1, quantity: 1 },
          { productId: 1, quantity: 2 },
        ],
      }).ok,
      false
    );
  });

  it("parses positive integer sale IDs strictly", () => {
    assert.equal(parseSaleId("42"), 42);
    assert.equal(parseSaleId("0"), null);
    assert.equal(parseSaleId("-5"), null);
    assert.equal(parseSaleId("42abc"), null);
    assert.equal(parseSaleId("1.5"), null);
  });
});
