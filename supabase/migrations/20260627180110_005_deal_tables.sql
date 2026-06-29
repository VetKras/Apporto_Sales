
/*
# Deal tables: deals, deal_inputs, quote_lines, quote_outputs

1. New Tables
   - `deals` — a named customer opportunity. owner_profile_id tracks the AE/SE.
   - `deal_inputs` — the editable inputs that drive quote calculation: student/faculty
     counts, course sections, discount %, selected products, customer_status (new/existing
     matters for ExamSpace platform fee). One deal can have multiple input snapshots.
   - `quote_lines` — the calculated output of the pricing engine. NEVER written by AI;
     only written by the deterministic pricing engine. Each line stores config_version_id
     so the quote is reproducible even after pricing config changes. Formula fields:
       list_price = quantity * unit_price
       net_price = list_price - discount_amount
       total_cost = quantity * unit_cost (if unit_cost exists)
   - `quote_outputs` — Portia-generated or human-written proposal text. classification
     determines what is safe to share externally. source_trace preserves config version,
     quote calculation version, product records, and confidence at generation time.

2. Security
   - Authenticated users can create and read all deals (team sales tool).
   - Authenticated users can create quote lines and outputs.

3. Notes
   - quote_lines.config_version_id is NOT NULL — every line must record which pricing
     config version was active when it was calculated. This is critical for audit and
     reproducibility.
*/

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  owner_profile_id text REFERENCES profiles(id),
  stage text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_deals" ON deals;
CREATE POLICY "auth_select_deals" ON deals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_deals" ON deals;
CREATE POLICY "auth_insert_deals" ON deals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_deals" ON deals;
CREATE POLICY "auth_update_deals" ON deals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_deals" ON deals;
CREATE POLICY "auth_delete_deals" ON deals FOR DELETE TO authenticated USING (true);

-- deal_inputs
CREATE TABLE IF NOT EXISTS deal_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  student_count integer,
  faculty_count integer,
  course_sections integer,
  exam_days integer,
  seats_per_exam_day integer,
  customer_status text CHECK (customer_status IN ('new','existing')),
  discount_percent numeric NOT NULL DEFAULT 0,
  selected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deal_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_deal_inputs" ON deal_inputs;
CREATE POLICY "auth_select_deal_inputs" ON deal_inputs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_deal_inputs" ON deal_inputs;
CREATE POLICY "auth_insert_deal_inputs" ON deal_inputs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_deal_inputs" ON deal_inputs;
CREATE POLICY "auth_update_deal_inputs" ON deal_inputs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- quote_lines
CREATE TABLE IF NOT EXISTS quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id),
  pricing_model_id uuid REFERENCES pricing_models(id),
  quantity numeric NOT NULL,
  unit text NOT NULL,
  unit_price numeric NOT NULL,
  list_price numeric NOT NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  net_price numeric NOT NULL,
  unit_cost numeric,
  total_cost numeric,
  margin_percent numeric,
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_quote_lines" ON quote_lines;
CREATE POLICY "auth_select_quote_lines" ON quote_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_quote_lines" ON quote_lines;
CREATE POLICY "auth_insert_quote_lines" ON quote_lines FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_quote_lines" ON quote_lines;
CREATE POLICY "auth_delete_quote_lines" ON quote_lines FOR DELETE TO authenticated USING (true);

-- quote_outputs
CREATE TABLE IF NOT EXISTS quote_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  output_type text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('customer_facing','internal_only','mixed_draft')),
  content text NOT NULL,
  source_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_signal text CHECK (quality_signal IN ('accepted','rejected','modified')),
  config_version_id uuid REFERENCES pricing_config_versions(id),
  created_by text REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quote_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_quote_outputs" ON quote_outputs;
CREATE POLICY "auth_select_quote_outputs" ON quote_outputs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_quote_outputs" ON quote_outputs;
CREATE POLICY "auth_insert_quote_outputs" ON quote_outputs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_quote_outputs" ON quote_outputs;
CREATE POLICY "auth_update_quote_outputs" ON quote_outputs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
