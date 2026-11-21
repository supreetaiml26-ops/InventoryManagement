# InventoryManagement

StockPilot

StockPilot is a small inventory and point-of-sale (POS) application. It uses a Next.js and TypeScript web app, API routes for server-side operations, and PostgreSQL for persistent data.

What is implemented

Product listing and product creation, including name, category, price, quantity, minimum stock, and optional barcode.
Inventory dashboard with product search, total product and unit counts, and low-stock indicators.
Barcode-based stock additions and removals, recorded as inventory movements.
Stock movement history on the inventory dashboard.
A sales page for product search or barcode scanning, shopping-cart quantities, payment-method selection, and checkout.
A transactional checkout API that stores a sale and its items, reduces stock, and records the stock removals.
A sales history showing up to the latest 50 sales and their line items.
A database connection test endpoint.
Reports and analytics, receipt generation, automated tests, and deployment are not present in the checked-in application code.

How the application is organized

File	Responsibility
app/page.tsx	Inventory dashboard, product form, product search, low-stock counts, and stock movement display.
app/sales/page.tsx	Sales screen: find or scan products, manage the cart, select payment, complete checkout, and view recent sales.
app/api/products/route.ts	Reads products and validates/inserts new products.
app/api/inventory/route.ts	Updates stock by barcode and reads movement history.
app/api/sales/route.ts	Reads sales history and processes a complete sale.
app/api/db-test/route.ts	Checks whether the application can query PostgreSQL and returns the current database name.
lib/db.ts	Creates the shared PostgreSQL connection pool from environment variables.
app/layout.tsx and app/globals.css	Shared page layout and global styling.
The browser UI calls the application's API routes with fetch. The API routes use the pg package to query PostgreSQL. Database credentials are read from environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD); keep them out of source control.

Main data flow

1. Products and inventory dashboard

When the dashboard loads, app/page.tsx requests /api/products and /api/inventory. The products endpoint selects product details from products; the page uses those rows to display the inventory table, search results, total units, and the count of products whose quantity is at or below their minimum stock.

To add a product, the page sends its form values as JSON to POST /api/products. The route trims text, converts numeric fields, and rejects invalid values before inserting the product. It uses SQL parameters ($1, $2, etc.) rather than putting user input directly into SQL. A duplicate-key database error (23505) is reported as a barcode conflict.

2. Stock adjustments and movement history

POST /api/inventory accepts a barcode, a movement type (ADD or REMOVE), and a positive whole-number quantity. It starts a database transaction, finds the product by barcode using SELECT ... FOR UPDATE, and locks that row so another stock operation cannot change it at the same time.

The route calculates the new quantity, rejects a removal that would make stock negative, updates products, and inserts an inventory_movements row. It commits when both writes succeed; on failure it rolls back. The GET /api/inventory handler joins movement rows to products so the dashboard can show the product name, barcode, movement type, quantity, and date.

3. Sales screen and cart

app/sales/page.tsx loads products from /api/products and recent sales from /api/sales. Typing searches product name, category, and barcode. A barcode scanner that types into the search field and sends Enter can submit an exact barcode lookup.

The cart stores a product and quantity for each line. The page lets the user increase or decrease quantities, remove a line, and select CASH, UPI, or CARD. It displays an estimated total using product prices. The API independently checks the products, prices, and stock at checkout; it does not rely on the browser's displayed total as the authoritative amount.

4. Checkout and safe stock deduction

POST /api/sales validates that the request has a supported payment method and at least one item, that product IDs and quantities are valid positive integers, and that no product appears twice in the request.

The handler then:

Opens a PostgreSQL transaction.
Selects the requested products in ID order with FOR UPDATE, locking them for checkout.
Checks that every product exists and has enough stock.
Inserts a sales row, initially with a zero total.
Inserts one sale_items row per product, preserving the product name and price at the time of sale and calculating each line subtotal.
Decreases each product's stock and inserts a corresponding REMOVE inventory movement linked to the sale.
Calculates the sale total from the stored item subtotals and updates the sales row.
Commits all changes together.
If a validation or database operation fails after the transaction starts, the handler rolls back the transaction. This prevents a sale from being saved without its items or stock changes, or stock from being deducted for an unsaved sale.

5. Sales history

GET /api/sales selects the latest 50 sales, joins their sale items, and groups the returned rows into one sale object with an items array. The sales page displays the sale ID, products and quantities, payment method, total, and date.

Database verification

The running application was checked through its local HTTP endpoints. /api/db-test returned HTTP 200 with connected: true and database inventory_management; /api/products and /api/inventory also returned HTTP 200 with product and movement rows. /api/sales returned HTTP 200 with an empty list at the time of the check, so the sales-history endpoint works but there were no sales to display then. No sale was submitted as part of this check, to avoid changing inventory data.

A read-only schema query against the same database confirmed:

The IDs in products, inventory_movements, sales, and sale_items use PostgreSQL sequences (nextval(...)) as defaults. They are sequence-generated IDs; PostgreSQL reports them as not IDENTITY columns.
sales.payment_method is varchar, is NOT NULL, and has a CHECK constraint allowing exactly CASH, UPI, or CARD.
inventory_movements.movement_type has a CHECK constraint allowing ADD or REMOVE; its quantity must be greater than zero.
sale_items.quantity must be greater than zero.
Foreign keys connect movements and sale items to products, movements to sales, and sale items to sales. Deleting a sale cascades to its sale items.
The tables have primary keys; the product, movement, sale, and sale-item ID defaults are present.
The repository still does not contain a database schema or migration script, so these details describe the live database that was inspected, not a reproducible schema definition committed with the application.

Run locally

Install dependencies with npm install.
Configure the database environment variables listed above in a local environment file. Do not commit credentials.
Ensure the PostgreSQL database has the tables and columns expected by the API queries.
Start the development server with npm run dev, then open http://localhost:3000.
Visit /api/db-test to check the app's database connection.
Available package scripts are npm run dev, npm run build, npm run start, and npm run lint.

Project walkthrough / possible teacher questions

“What technologies did you use?”

“The frontend is built with Next.js and React, and the code is written in TypeScript. The API endpoints are Next.js route handlers. I use the pg package to connect to PostgreSQL, and Tailwind CSS utility classes for much of the page styling.”

“How does the frontend communicate with the database?”

“The browser does not connect directly to PostgreSQL. It sends HTTP requests with fetch to routes such as /api/products or /api/sales. Those server-side route handlers use the PostgreSQL connection pool in lib/db.ts to run parameterized SQL queries.”

“How do you prevent invalid product input?”

“The product POST route trims text, converts the price and quantities to numbers, and validates required names, maximum text lengths, non-negative prices, and non-negative whole-number stock values before inserting the row. The barcode duplicate database error is returned as a conflict.”

“How is a barcode used?”

“A barcode is stored on the product. For inventory adjustments, the API finds the product by barcode. On the sales page, a scanner can act like a keyboard: it types the barcode into the search field, and Enter submits an exact barcode lookup to add that product to the cart.”

“How do you make stock updates safe?”

“The inventory API starts a transaction and locks the product row with SELECT ... FOR UPDATE. It checks whether enough stock is available, updates the quantity, and records the movement before committing. If a removal would make stock negative, it rejects the request.”

“How does checkout work?”

“The sales page sends product IDs, quantities, and the selected payment method. The server validates the request, locks the product rows, checks stock, writes the sale and sale items, deducts inventory, records removal movements, computes the total from stored item subtotals, and commits everything in one transaction.”

“Why use a database transaction for checkout?”

“A checkout consists of several related writes. A transaction makes them succeed or fail as one unit. If inserting a sale item or updating inventory fails, the server rolls back, so we avoid a partially saved sale or an incorrect stock count.”

“How is the total calculated?”

“The browser shows a provisional cart total, but the server uses the current product prices read from PostgreSQL. It stores each line's price and subtotal, sums the stored subtotals, and updates the sale total. This means the client cannot choose the authoritative price by editing its request.”

“What is stored in a sale item?”

“Each sale item stores the sale ID, product ID, product name, quantity, price at the time of sale, and subtotal. Saving the name and price as a snapshot preserves what was sold even if the product is renamed or repriced later.”

“How do you track stock changes caused by sales?”

“For each sold product, checkout reduces the product quantity and inserts a REMOVE row in inventory_movements, linked to the sale. The same movement table also records manual barcode stock adjustments.”

“Which payment methods are supported?”

“The checkout route and UI support CASH, UPI, and CARD. I also checked PostgreSQL: sales.payment_method is a required varchar column with a check constraint allowing exactly those three values.”

“Are IDs automatically generated?”

“Yes. The live database supplies IDs using PostgreSQL sequences, shown by defaults like nextval('sales_id_seq'::regclass). The code leaves the ID out of the INSERT and uses RETURNING id to receive the generated ID. These columns are sequence-backed rather than SQL IDENTITY columns.”

“What has not been completed yet?”

“The checked-in code includes the sales page, checkout API, stock deduction, and sales history. The database connection and schema constraints were verified, but a checkout sale was not submitted during that check. Receipt generation, reports and analytics, and final end-to-end testing/deployment are still future work.”
