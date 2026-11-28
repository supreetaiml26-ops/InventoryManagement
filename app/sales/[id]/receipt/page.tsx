"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/app/components/SiteHeader";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Sale } from "@/lib/types";

export default function SaleReceiptPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id ?? "";

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReceipt() {
      setLoading(true);
      setError("");

      if (!/^\d+$/.test(rawId)) {
        setError("Invalid receipt ID.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/sales/${rawId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load receipt.");
        }

        if (active) {
          setSale(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load receipt."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReceipt();

    return () => {
      active = false;
    };
  }, [rawId]);

  const totalUnits = sale
    ? sale.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 print:min-h-0 print:bg-white">
      <SiteHeader subtitle="Sale receipt" activeTab="sales" />

      <section className="mx-auto max-w-2xl space-y-6 px-6 py-8 print:max-w-none print:p-0">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/sales"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← Back to New sale
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Inventory
            </Link>
          </div>

          <button
            type="button"
            disabled={loading || !sale}
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print receipt
          </button>
        </div>

        {loading && (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Loading receipt...
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700"
          >
            <p className="font-semibold">Unable to display receipt</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {!loading && sale && (
          <article
            aria-label={`Receipt for sale #${sale.id}`}
            className="rounded-2xl border bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
          >
            <div className="border-b border-dashed border-slate-300 pb-5 text-center">
              <h2 className="text-2xl font-bold tracking-tight">StockPilot</h2>
              <p className="mt-1 text-sm text-slate-500 print:text-slate-700">
                Point-of-Sale Receipt
              </p>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-y-2 border-b border-dashed border-slate-300 pb-5 text-sm">
              <div>
                <dt className="text-slate-500 print:text-slate-700">Receipt No.</dt>
                <dd className="font-semibold">#{sale.id}</dd>
              </div>
              <div className="text-right">
                <dt className="text-slate-500 print:text-slate-700">Payment</dt>
                <dd className="font-semibold">{sale.paymentMethod}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500 print:text-slate-700">Date &amp; Time</dt>
                <dd className="font-medium">{formatDateTime(sale.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-5">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 print:text-slate-700">
                    <th className="py-2 font-medium">Item</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((item, index) => (
                    <tr key={`${item.productName}-${index}`}>
                      <td className="py-2.5 font-medium">{item.productName}</td>
                      <td className="py-2.5 text-right">{item.quantity}</td>
                      <td className="py-2.5 text-right">
                        {formatCurrency(item.priceAtSale)}
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 space-y-2 border-t border-dashed border-slate-300 pt-5">
              <div className="flex items-center justify-between text-sm text-slate-600 print:text-slate-800">
                <span>Total items</span>
                <span>{totalUnits}</span>
              </div>
              <div className="flex items-center justify-between text-xl font-bold">
                <span>Total paid</span>
                <span>{formatCurrency(sale.totalAmount)}</span>
              </div>
            </div>

            <p className="mt-8 border-t border-dashed border-slate-300 pt-4 text-center text-xs text-slate-500 print:text-slate-700">
              Thank you for your purchase!
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
