-- StockPilot PostgreSQL Schema
-- Matches the tables, sequences, foreign keys, and check constraints used by the API routes.

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Other',
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  barcode VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'CARD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(150) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_sale NUMERIC(12, 2) NOT NULL CHECK (price_at_sale >= 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('ADD', 'REMOVE')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
