
/*
# Pricing tables: pricing_config_versions, pricing_models, pricing_validation_results

1. New Tables
   - `pricing_config_versions` — versioned snapshots of all pricing parameters.
     Exactly one row should have is_active=true at any time (enforced by app logic).
     The active V1 version is 'v1-active-defaults'. Historical versions (e.g. 80/65/50
     CoTutor workbook values) are stored as inactive reference rows.
   - `pricing_models` — individual price/cost entries per product per tier per version.
     pricing_type: 'per_student', 'per_faculty', 'per_submission', 'per_seat_day',
     'platform_fee', 'setup_fee'. All prices are configurable floats, never hardcoded.
   - `pricing_validation_results` — records of validation runs against config versions,
     used to audit whether a version's prices are consistent with known benchmarks.

2. Security
   - All authenticated users can read pricing data (internal tool, team-wide visibility).
   - Inserts allowed so the app can create new config versions and models.
   - No client-side delete of pricing data (data integrity).

3. Notes
   - pricing_models.config_version_id + product_id + tier_name + pricing_type must be
     unique per version to prevent duplicate rows for the same price point.
*/

CREATE TABLE IF NOT EXISTS pricing_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by text REFERENCES profiles(id),
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','warning','invalid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_pricing_config_versions" ON pricing_config_versions;
CREATE POLICY "auth_select_pricing_config_versions" ON pricing_config_versions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_pricing_config_versions" ON pricing_config_versions;
CREATE POLICY "auth_insert_pricing_config_versions" ON pricing_config_versions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_pricing_config_versions" ON pricing_config_versions;
CREATE POLICY "auth_update_pricing_config_versions" ON pricing_config_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- pricing_models
CREATE TABLE IF NOT EXISTS pricing_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  product_id text NOT NULL REFERENCES products(id),
  tier_name text,
  pricing_type text NOT NULL,
  unit text NOT NULL,
  default_price numeric,
  default_cost numeric,
  currency text NOT NULL DEFAULT 'USD',
  source_reference text,
  confidence text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_version_id, product_id, tier_name, pricing_type)
);

ALTER TABLE pricing_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_pricing_models" ON pricing_models;
CREATE POLICY "auth_select_pricing_models" ON pricing_models FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_pricing_models" ON pricing_models;
CREATE POLICY "auth_insert_pricing_models" ON pricing_models FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_pricing_models" ON pricing_models;
CREATE POLICY "auth_update_pricing_models" ON pricing_models FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- pricing_validation_results
CREATE TABLE IF NOT EXISTS pricing_validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid REFERENCES pricing_config_versions(id),
  source_document_id uuid REFERENCES source_documents(id),
  status text NOT NULL CHECK (status IN ('valid','warning','invalid')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  diffs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_validation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_pricing_validation_results" ON pricing_validation_results;
CREATE POLICY "auth_select_pricing_validation_results" ON pricing_validation_results FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_pricing_validation_results" ON pricing_validation_results;
CREATE POLICY "auth_insert_pricing_validation_results" ON pricing_validation_results FOR INSERT TO authenticated WITH CHECK (true);
