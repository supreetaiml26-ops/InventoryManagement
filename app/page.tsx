"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BarcodeCameraScanner } from "@/app/components/BarcodeCameraScanner";
import { SiteHeader } from "@/app/components/SiteHeader";
import { formatDateTime } from "@/lib/format";
import type { Movement, Product } from "@/lib/types";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [quantity, setQuantity] = useState("10");
  const [minimum, setMinimum] = useState("5");
  const [price, setPrice] = useState("100");
  const [barcode, setBarcode] = useState("");

  // Load products from PostgreSQL
  const loadProducts = useCallback(async () => {
    try {
      setError("");

      const response = await fetch("/api/products");

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      const data = await response.json();
      setProducts(data);
    } catch (err) {
      console.error(err);
      setError("Could not load products from database.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory");

      if (!response.ok) {
        throw new Error("Could not fetch history");
      }

      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadHistory();
  }, [loadProducts, loadHistory]);

  // Add a new product to PostgreSQL
  async function addProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          category,
          quantity: Number(quantity),
          minimumStock: Number(minimum),
          price: Number(price),
          barcode: barcode.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not add product");
      }

      await loadProducts();

      setName("");
      setCategory("Electronics");
      setQuantity("10");
      setMinimum("5");
      setPrice("100");
      setBarcode("");
      setShowForm(false);

      setMessage("Product added successfully!");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Could not save product."
      );
    } finally {
      setSaving(false);
    }
  }

  const lowStock = products.filter(
    (p) => p.quantity <= p.minimumStock
  ).length;

  const totalUnits = products.reduce(
    (sum, p) => sum + p.quantity,
    0
  );

  const filteredProducts = products.filter((p) =>
    `${p.name} ${p.category} ${p.barcode ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader subtitle="Inventory Management System" activeTab="inventory" />

      <section className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div>
          <h2 className="text-3xl font-bold">Dashboard</h2>
          <p className="mt-2 text-slate-500">
            Monitor your inventory at a glance.
          </p>
        </div>

        {/* Dashboard cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total products" value={products.length} />

          <StatCard label="Total units" value={totalUnits} />

          <StatCard label="Low-stock items" value={lowStock} />
        </div>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Inventory</h3>
              <p className="text-sm text-slate-500">
                View stock levels and manage your products.
              </p>
            </div>

            <button
              onClick={() => {
                setShowForm(!showForm);
                setError("");
                setMessage("");
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700"
            >
              {showForm ? "Cancel" : "+ Add product"}
            </button>
          </div>

          {/* Error and success messages */}
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {message}
            </p>
          )}

          {/* Add product form */}
          {showForm && (
            <form
              onSubmit={addProduct}
              className="mb-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"
            >
              <label className="text-sm font-medium">
                Product name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border p-2.5"
                  placeholder="e.g. Laptop"
                />
              </label>

              <div className="space-y-2 text-sm font-medium">
                <label className="block">
                  Barcode
                  <input
                    required
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="mt-1 block w-full rounded-lg border p-2.5"
                    placeholder="Enter product barcode"
                  />
                </label>
                <BarcodeCameraScanner
                  continuous={false}
                  buttonLabel="Scan barcode (ZXing)"
                  onScan={(code) => setBarcode(code)}
                  onError={(scanError) => setError(scanError)}
                />
              </div>

              <label className="text-sm font-medium">
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 block w-full rounded-lg border bg-white p-2.5"
                >
                  <option>Electronics</option>
                  <option>Accessories</option>
                  <option>Stationery</option>
                  <option>Other</option>
                </select>
              </label>

              <label className="text-sm font-medium">
                Quantity
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 block w-full rounded-lg border p-2.5"
                />
              </label>

              <label className="text-sm font-medium">
                Minimum stock
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                  className="mt-1 block w-full rounded-lg border p-2.5"
                />
              </label>

              <label className="text-sm font-medium">
                Price (₹)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 block w-full rounded-lg border p-2.5"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-indigo-600 p-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save product"}
                </button>
              </div>
            </form>
          )}

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, category or barcode..."
            className="mb-4 w-full rounded-lg border px-4 py-3 outline-none focus:border-indigo-500"
          />

          {/* Product table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Loading products...
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td className="p-3 font-semibold">{p.name}</td>

                        <td className="p-3">{p.barcode || "—"}</td>

                        <td className="p-3">{p.category}</td>

                        <td className="p-3">
                          ₹{Number(p.price).toLocaleString("en-IN")}
                        </td>

                        <td className="p-3">{p.quantity}</td>

                        <td className="p-3">
                          {p.quantity <= p.minimumStock ? (
                            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                              Low stock
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                              In stock
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {filteredProducts.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-500"
                        >
                          No products found.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Stock Movement History */}
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold">Stock Movement History</h3>

          <p className="mb-5 text-sm text-slate-500">
            Track every addition and removal of stock.
          </p>

          {historyLoading ? (
            <p>Loading history...</p>
          ) : history.length === 0 ? (
            <p>No stock movements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Barcode</th>
                    <th className="p-3">Movement</th>
                    <th className="p-3">Quantity</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">{item.productName}</td>
                      <td className="p-3">{item.barcode || "—"}</td>
                      <td className="p-3">{item.movementType}</td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">{formatDateTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-center text-sm text-slate-400">
          StockPilot · Inventory overview
        </p>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}
