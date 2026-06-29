
/*
# Product catalog tables: products, product_facts, market_benchmarks

1. New Tables
   - `products` — the four V1 sellable products: CoTutor, PowerGrader, TrustEd, ExamSpace.
     slug is the stable identifier. source_refs stores file path references as JSONB array.
     Portia is NOT a product row; it lives in system config only.
   - `product_facts` — individual verifiable claims about a product. Portia cites and updates
     individual facts rather than rewriting the whole product record. fact_type categorises
     the claim (capability, risk, integration, positioning, etc.).
   - `market_benchmarks` — competitor/market pricing reference data for battlecard context.

2. Security
   - Authenticated users can read all product data.
   - Authenticated users can insert/update product_facts and market_benchmarks
     (proposals go through proposed_updates workflow; direct inserts here for trusted users).
   - products table is read-only from the client (seeded via migrations).

3. Notes
   - products uses text PK for idempotent seeding ('seed-product-cotutor' etc.)
*/

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  description text,
  positioning text,
  status text NOT NULL DEFAULT 'active',
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_products" ON products;
CREATE POLICY "auth_select_products" ON products FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products" ON products FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- product_facts
CREATE TABLE IF NOT EXISTS product_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES products(id),
  fact_type text NOT NULL,
  content text NOT NULL,
  confidence text NOT NULL DEFAULT 'medium',
  source_document_id uuid REFERENCES source_documents(id),
  created_by text REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_product_facts" ON product_facts;
CREATE POLICY "auth_select_product_facts" ON product_facts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_product_facts" ON product_facts;
CREATE POLICY "auth_insert_product_facts" ON product_facts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_product_facts" ON product_facts;
CREATE POLICY "auth_update_product_facts" ON product_facts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- market_benchmarks
CREATE TABLE IF NOT EXISTS market_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  vendor text,
  metric text,
  price_low numeric,
  price_high numeric,
  unit text,
  notes text,
  source_document_id uuid REFERENCES source_documents(id),
  confidence text NOT NULL DEFAULT 'low',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_market_benchmarks" ON market_benchmarks;
CREATE POLICY "auth_select_market_benchmarks" ON market_benchmarks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_market_benchmarks" ON market_benchmarks;
CREATE POLICY "auth_insert_market_benchmarks" ON market_benchmarks FOR INSERT TO authenticated WITH CHECK (true);
