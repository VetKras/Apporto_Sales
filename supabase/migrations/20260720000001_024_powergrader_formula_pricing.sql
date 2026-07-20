/*
# PowerGrader formula-driven pricing (Phase 2, part 1)

Replaces the 3 flat, unsourced pricing_models rows ($15/student/yr, $120/faculty/yr, $4/submission
— none of which appear in any source file, per docs/pricing/00_INDEX.md's own audit at initial
seed) with the real formula from PowerGrader_Pricing_Calculator_Customer.xlsx (the actual
customer-facing calculator currently in use — "PowerGrader\Beta PWG Customer Docs\
PowerGrader_Pricing_Calculator_Customer.xlsx"), cross-checked cell-for-cell against
PowerGrader_Pricing_Calculator_Internal.xlsx (same formula, same constants, plus the internal-only
ROI/value-analysis breakdown).

1. New table: powergrader_pricing_assumptions — one row per config version, same shape as
   cotutor_pricing_assumptions. Token pricing (GPT-4o), tokens/page, buffer multiplier, platform
   cost multiplier (the margin lever — customer price = 10x raw API+base cost, i.e. ~90% gross
   margin on the formula's own terms), PowerGrader's own added context pages per submission, base
   cost per submission, and the $100 charm-price rounding step (FLOOR(x,100)-1) baked into the
   customer-facing calculator's own formula.

   Open discrepancy, NOT resolved here: the Internal workbook's own changelog notes ("Base Cost:
   Old $0.026, New $0.03") document an intended bump to $0.03/submission that was never actually
   applied to either live calculator — both the Internal formula cell and the Customer-facing
   formula still use 0.026. Seeding 0.026 (the value actually driving quoted prices today), not
   0.03 (a documented-but-unapplied intent) — flag for Antony/whoever owns PowerGrader pricing to
   resolve explicitly, same way CoTutor's 70%-vs-82.7%-margin conflict was resolved by a direct
   decision rather than engineering guesswork.

2. Setup Fee ($2,500 one-time, from the Customer-facing calculator's cell B16) added as a
   pricing_models row, same pattern as ExamSpace's Setup Fee (migration 021) — shown for new
   customers only.

3. Removes the 3 old flat PowerGrader pricing_models rows from the active config version. Verified
   zero quote_lines reference them (this app has no real quote history yet) before writing this as
   a plain DELETE rather than a re-point-and-delete — if that's no longer true when this runs,
   quote_lines' FK to pricing_models will block the DELETE and this migration will fail loudly
   rather than orphan real quote history.

Reference check (verified against the Customer-facing calculator's own pre-filled example): 2,000
students, 0.5/6 pages assignment instruction/submission, 5 assignments/month, 0.5/1 pages quiz
instruction/submission, 1 quiz/month => $6,499/month platform cost ($3.2495/student/month), $2,500
setup fee. See calculatePowerGraderPrice() in src/lib/pricing-engine.ts for the ported formula — it
must reproduce this to the cent.
*/

CREATE TABLE IF NOT EXISTS powergrader_pricing_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  input_token_price_per_token numeric NOT NULL,
  output_token_price_per_token numeric NOT NULL,
  tokens_per_page numeric NOT NULL,
  token_buffer_multiplier numeric NOT NULL,
  platform_cost_multiplier numeric NOT NULL,
  pwg_context_pages_per_submission numeric NOT NULL,
  base_cost_per_submission numeric NOT NULL,
  charm_price_rounding_increment numeric NOT NULL DEFAULT 100,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_version_id)
);

ALTER TABLE powergrader_pricing_assumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions;
CREATE POLICY "auth_select_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions;
CREATE POLICY "auth_insert_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions;
CREATE POLICY "auth_update_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- This app's demo auth runs every session as the anon role, never a real Supabase-authenticated
-- JWT (see profiles/pricing_models' anon_* policies, added out-of-band, not in any migration file
-- in this repo — that's the actual precedent, confirmed live). Writable tables need matching anon
-- policies or every save silently fails with an RLS violation.
DROP POLICY IF EXISTS "anon_insert_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions;
CREATE POLICY "anon_insert_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions;
CREATE POLICY "anon_update_powergrader_pricing_assumptions" ON powergrader_pricing_assumptions FOR UPDATE TO anon USING (true) WITH CHECK (true);

INSERT INTO powergrader_pricing_assumptions (
  config_version_id, input_token_price_per_token, output_token_price_per_token, tokens_per_page,
  token_buffer_multiplier, platform_cost_multiplier, pwg_context_pages_per_submission,
  base_cost_per_submission, charm_price_rounding_increment, source_reference
) VALUES (
  'b2c3d4e5-0002-0002-0002-000000000002'::uuid,
  0.0000025, 0.00001, 400,
  1.3, 10, 0.5,
  0.026, 100,
  'PowerGrader_Pricing_Calculator_Customer.xlsx "Customer Cost" sheet, cell C18 formula, captured 2026-07-20'
)
ON CONFLICT (config_version_id) DO NOTHING;

-- Setup Fee, same pattern as ExamSpace (migration 021)
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES (
  'b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-powergrader', 'Setup Fee', 'setup_fee', 'one-time', 2500, 'USD',
  'PowerGrader_Pricing_Calculator_Customer.xlsx "Customer Cost" sheet, cell B16, captured 2026-07-20', 'high'
)
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- Remove the old, unsourced flat PowerGrader tiers — superseded by the formula above.
DELETE FROM pricing_models
WHERE config_version_id = 'b2c3d4e5-0002-0002-0002-000000000002'::uuid
  AND product_id = 'seed-product-powergrader'
  AND tier_name IN ('Per Student', 'Per Faculty', 'Per Submission');
