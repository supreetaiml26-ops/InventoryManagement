"use client";

import Link from "next/link";

type SiteHeaderProps = {
  subtitle: string;
  activeTab?: "inventory" | "sales";
};

export function SiteHeader({ subtitle, activeTab }: SiteHeaderProps) {
  return (
    <header className="no-print border-b bg-white px-6 py-5 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-3 text-white">📦</div>
          <div>
            <h1 className="text-xl font-bold">StockPilot</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>

        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-2 text-sm font-medium print:hidden"
        >
          <Link
            href="/"
            className={
              activeTab === "inventory"
                ? "rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700"
                : "rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100"
            }
          >
            Inventory
          </Link>
          <Link
            href="/sales"
            className={
              activeTab === "sales"
                ? "rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700"
                : "rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100"
            }
          >
            New sale
          </Link>
        </nav>
      </div>
    </header>
  );
}
