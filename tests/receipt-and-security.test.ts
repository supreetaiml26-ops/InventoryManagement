import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

describe("Task 1: Print receipt page & navigation exclusion", () => {
  it("receipt page includes a Print button calling window.print() and hides nav/controls on print", () => {
    const receiptPage = readWorkspaceFile("app/sales/[id]/receipt/page.tsx");
    const siteHeader = readWorkspaceFile("app/components/SiteHeader.tsx");
    const globalsCss = readWorkspaceFile("app/globals.css");

    assert.match(receiptPage, /window\.print\(\)/);
    assert.match(receiptPage, /Print receipt/);
    assert.match(receiptPage, /print:hidden/);
    assert.match(siteHeader, /print:hidden/);
    assert.match(siteHeader, /no-print/);
    assert.match(globalsCss, /@media print/);
    assert.match(globalsCss, /nav\s*\{[\s\S]*display:\s*none\s*!important/);
  });

  it("sales page links to the receipt page after checkout and from sales history", () => {
    const salesPage = readWorkspaceFile("app/sales/page.tsx");
    assert.match(salesPage, /\/sales\/\$\{lastCompletedSaleId\}\/receipt/);
    assert.match(salesPage, /\/sales\/\$\{sale\.id\}\/receipt/);
  });
});

describe("Task 2: Barcode scanning (ZXing camera + keyboard scanner)", () => {
  it("integrates @zxing/browser camera reader with cleanup", () => {
    const pkg = JSON.parse(readWorkspaceFile("package.json")) as {
      dependencies: Record<string, string>;
    };
    const scanner = readWorkspaceFile(
      "app/components/BarcodeCameraScanner.tsx"
    );
    const salesPage = readWorkspaceFile("app/sales/page.tsx");

    assert.ok(pkg.dependencies["@zxing/browser"]);
    assert.match(scanner, /from "@zxing\/browser"/);
    assert.match(scanner, /BrowserMultiFormatReader/);
    assert.match(scanner, /controlsRef\.current\?\.stop\(\)/);
    assert.match(salesPage, /BarcodeCameraScanner/);
    assert.match(salesPage, /handleBarcodeScan/);
  });
});

describe("Task 5: Security and SQL parameterization checks", () => {
  it("reads DB credentials only from environment variables and uses parameterized queries", () => {
    const dbFile = readWorkspaceFile("lib/db.ts");
    assert.match(dbFile, /process\.env\.DB_HOST/);
    assert.match(dbFile, /process\.env\.DB_PASSWORD/);
    assert.doesNotMatch(dbFile, /password:\s*["'][^"']+["']/i);

    const routeFiles = [
      "app/api/products/route.ts",
      "app/api/inventory/route.ts",
      "app/api/sales/route.ts",
      "app/api/sales/[id]/route.ts",
      "lib/sales-service.ts",
    ];

    for (const file of routeFiles) {
      const content = readWorkspaceFile(file);
      assert.doesNotMatch(
        content,
        /\.query\(\s*`[^`]*\$\{/,
        `Potential unparameterized SQL interpolation in ${file}`
      );
    }
  });
});
