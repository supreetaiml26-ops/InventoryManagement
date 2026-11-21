"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Product = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  price: number;
  barcode: string | null;
};

type CartItem = {
  product: Product;
  quantity: number;
};

type PaymentMethod = "CASH" | "UPI" | "CARD";

type Sale = {
  id: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: string | null;
  items: {
    productName: string;
    quantity: number;
    priceAtSale: number;
    subtotal: number;
  }[];
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [productsResponse, salesResponse] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/sales"),
      ]);

      if (!productsResponse.ok || !salesResponse.ok) {
        throw new Error("Could not load products or sales history.");
      }

      const [productData, salesData] = await Promise.all([
        productsResponse.json(),
        salesResponse.json(),
      ]);
      setProducts(productData);
      setSales(salesData);
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load products or sales history."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const matchingProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];

    return products
      .filter((product) =>
        `${product.name} ${product.category} ${product.barcode ?? ""}`
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);
  }, [products, search]);

  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  function addToCart(product: Product) {
    setError("");
    setMessage("");

    if (product.quantity < 1) {
      setError(`${product.name} is out of stock.`);
      return;
    }

    const existing = cart.find((item) => item.product.id === product.id);
    if (existing && existing.quantity >= product.quantity) {
      setError(`Only ${product.quantity} of ${product.name} are in stock.`);
      return;
    }

    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.product.id === product.id
      );

      if (existingItem) {
        return currentCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...currentCart, { product, quantity: 1 }];
    });
    setSearch("");
  }

  function addScannedProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const barcode = search.trim().toLowerCase();
    const product = products.find(
      (item) => item.barcode?.toLowerCase() === barcode
    );

    if (!product) {
      setError(`No product found for barcode "${search.trim()}".`);
      return;
    }

    addToCart(product);
  }

  function changeQuantity(productId: number, quantity: number) {
    const line = cart.find((item) => item.product.id === productId);
    if (!line) return;

    const safeQuantity = Math.min(line.product.quantity, Math.max(1, quantity));
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: safeQuantity }
          : item
      )
    );
  }

  function removeFromCart(productId: number) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.product.id !== productId)
    );
  }

  async function completeSale() {
    if (cart.length === 0) {
      setError("Add at least one product before completing the sale.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          items: cart.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not complete the sale.");
      }

      setCart([]);
      setMessage(`Sale #${data.sale.id} completed successfully.`);
      await loadData();
    } catch (saleError) {
      console.error(saleError);
      setError(
        saleError instanceof Error
          ? saleError.message
          : "Could not complete the sale."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-3 text-white">📦</div>
            <div>
              <h1 className="text-xl font-bold">StockPilot</h1>
              <p className="text-sm text-slate-500">Billing and checkout</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100"
            >
              Inventory
            </Link>
            <Link
              href="/sales"
              className="rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700"
            >
              New sale
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div>
          <h2 className="text-3xl font-bold">New sale</h2>
          <p className="mt-2 text-slate-500">
            Scan a barcode or search for products, then complete checkout.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {message}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold">Find products</h3>
            <p className="mb-4 text-sm text-slate-500">
              Barcode scanners work like a keyboard: scan into the field and press Enter.
            </p>
            <form onSubmit={addScannedProduct}>
              <label className="sr-only" htmlFor="product-search">
                Search products or scan barcode
              </label>
              <input
                id="product-search"
                autoFocus
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setError("");
                }}
                placeholder="Search product name or scan barcode..."
                className="w-full rounded-lg border px-4 py-3 outline-none focus:border-indigo-500"
              />
            </form>

            <div className="mt-4 divide-y">
              {loading ? (
                <p className="py-5 text-center text-sm text-slate-500">
                  Loading products...
                </p>
              ) : matchingProducts.length > 0 ? (
                matchingProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-slate-500">
                        {product.barcode || "No barcode"} · Stock {product.quantity} ·{" "}
                        {currency.format(product.price)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={product.quantity < 1}
                      onClick={() => addToCart(product)}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {product.quantity > 0 ? "Add to sale" : "Out of stock"}
                    </button>
                  </div>
                ))
              ) : (
                <p className="py-5 text-center text-sm text-slate-500">
                  {search.trim()
                    ? "No matching products. For a barcode, press Enter to look it up."
                    : "Start typing a product name or scan a barcode."}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold">Shopping cart</h3>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No products in this sale yet.
              </p>
            ) : (
              <div className="mt-3 divide-y">
                {cart.map(({ product, quantity }) => (
                  <div key={product.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-sm text-slate-500">
                          {currency.format(product.price)} each
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                        aria-label={`Remove ${product.name} from sale`}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Decrease ${product.name} sale quantity`}
                          disabled={quantity <= 1}
                          onClick={() => changeQuantity(product.id, quantity - 1)}
                          className="rounded border px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40"
                        >
                          −
                        </button>
                        <input
                          aria-label={`${product.name} sale quantity`}
                          type="number"
                          min="1"
                          max={product.quantity}
                          step="1"
                          value={quantity}
                          onChange={(event) => {
                            const nextQuantity = Number(event.target.value);
                            if (Number.isInteger(nextQuantity) && nextQuantity > 0) {
                              changeQuantity(product.id, nextQuantity);
                            }
                          }}
                          className="w-16 rounded border px-2 py-1 text-center"
                        />
                        <button
                          type="button"
                          aria-label={`Increase ${product.name} sale quantity`}
                          disabled={quantity >= product.quantity}
                          onClick={() => changeQuantity(product.id, quantity + 1)}
                          className="rounded border px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                      <span className="font-semibold">
                        {currency.format(product.price * quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 border-t pt-4">
              <label
                htmlFor="payment-method"
                className="text-sm font-medium text-slate-700"
              >
                Payment method
              </label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
                className="mt-1 w-full rounded-lg border bg-white p-2.5"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>

              <div className="mt-4 flex items-center justify-between text-lg font-bold">
                <span>Total amount</span>
                <span>{currency.format(total)}</span>
              </div>
              <button
                type="button"
                disabled={saving || loading || cart.length === 0}
                onClick={() => void completeSale()}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Completing sale..." : "Complete sale"}
              </button>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-xl font-bold">Sales history</h3>
            <p className="text-sm text-slate-500">
              Showing the latest 50 completed sales and payment details.
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading sales history...</p>
          ) : sales.length === 0 ? (
            <p className="text-sm text-slate-500">No sales recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3">Sale</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="p-3 font-semibold">#{sale.id}</td>
                      <td className="p-3">
                        {sale.items
                          .map((item) => `${item.productName} × ${item.quantity}`)
                          .join(", ")}
                      </td>
                      <td className="p-3">{sale.paymentMethod}</td>
                      <td className="p-3 font-medium">
                        {currency.format(sale.totalAmount)}
                      </td>
                      <td className="p-3">
                        {sale.createdAt
                          ? new Date(sale.createdAt).toLocaleString("en-IN")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
