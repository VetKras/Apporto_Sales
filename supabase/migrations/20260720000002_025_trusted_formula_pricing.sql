/*
# TrustEd formula-driven pricing, bottom-up from real COGS (Phase 2, part 2)

Replaces the flat 'Standalone' ($50/student/yr) and 'Bundle Add-on' ($40/student/yr) rows with a
single bottom-up cost formula, billed per assignment analyzed (not per student flat) — direct
instruction: "we do a pricing for trusted where its per assignment analyzed... we want to keep the
price on this low to get it out the door."

Source: TrustEd_Pricing_Models.xlsx ("TrustEd\TEd Beta Docs\"). That workbook models two blended
scenarios (TrustEd-only, and a CoTutor+TrustEd bundle that bills CoTutor's own $6/student/month fee
as part of the same number) — deliberately NOT ported as-is, because using the bundle model's
number as "TrustEd's line" would double-bill CoTutor whenever CoTutor is already priced as its own
separate line in the same quote. Instead this migration extracts TrustEd's own real unit costs
(storage + analysis per assignment, the sheet's un-discounted "TrustEd Only" rates — $0.10 storage,
$0.08 analysis) as true COGS, and prices up from there with an explicit, adjustable margin — same
shape as CoTutor's cotutor_pricing_assumptions.

1. New table: trusted_pricing_assumptions — one row per config version.
   - target_gross_margin: THE profit lever. Seeded at 0.40 (40%) — deliberately low relative to
     CoTutor's 82.7%, per direct instruction to keep this cheap for initial adoption. This is a
     placeholder pending an explicit go-to-market call, same as CoTutor's margin was before
     Antony's decision — do not treat 0.40 as final.
   - free_with_cotutor: boolean lever, seeded false. When true, TrustEd's price is forced to $0 on
     any deal that also includes CoTutor (still shown as a $0 line, not hidden — "thrown in as a
     freebie for every exam that uses CoTutor" was raised as a live option, not decided). Left off
     by default so today's behavior is "formula-priced," reversible by flipping one field once a
     decision is made — not re-deploying code.
   - storage_cost_per_assignment / analysis_cost_per_assignment: real per-assignment COGS.
   - fixed_infra_per_student_year: optional flat COGS component, mirrors CoTutor's shape; seeded 0
     so it doesn't inflate the deliberately-low price unless someone opts in.
   - Both the margin/freebie levers and the technical cost fields are editable from the same
     Settings > Pricing Config UI, but the margin/freebie levers are gated to Level 4/_prv only
     there (application-layer, not RLS — matches this schema's existing pattern) while the
     technical cost fields stay open to Level 3+, per direct instruction.

2. Removes the old flat 'Standalone'/'Bundle Add-on' pricing_models rows — verified zero
   quote_lines reference them before writing this as a plain DELETE.

Reference check: at 7,200 students, 3 assignments/month analyzed, 10 months/year (matching the
source sheet's own reference inputs), COGS = ($0.10+$0.08) * 7,200 * 3 * 10 = $38,880/year total
($5.40/student/year in pure COGS). See calculateTrustEdPrice() in src/lib/pricing-engine.ts.
*/

CREATE TABLE IF NOT EXISTS trusted_pricing_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  target_gross_margin numeric NOT NULL CHECK (target_gross_margin >= 0 AND target_gross_margin < 0.95),
  free_with_cotutor boolean NOT NULL DEFAULT false,
  storage_cost_per_assignment numeric NOT NULL CHECK (storage_cost_per_assignment >= 0),
  analysis_cost_per_assignment numeric NOT NULL CHECK (analysis_cost_per_assignment >= 0),
  fixed_infra_per_student_year numeric NOT NULL DEFAULT 0 CHECK (fixed_infra_per_student_year >= 0),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_version_id)
);

ALTER TABLE trusted_pricing_assumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_trusted_pricing_assumptions" ON trusted_pricing_assumptions;
CREATE POLICY "auth_select_trusted_pricing_assumptions" ON trusted_pricing_assumptions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_trusted_pricing_assumptions" ON trusted_pricing_assumptions;
CREATE POLICY "auth_insert_trusted_pricing_assumptions" ON trusted_pricing_assumptions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_trusted_pricing_assumptions" ON trusted_pricing_assumptions;
CREATE POLICY "auth_update_trusted_pricing_assumptions" ON trusted_pricing_assumptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- This app's demo auth runs every session as the anon role — see the matching comment in
-- migration 024. Writable tables need anon policies too or every save fails with an RLS violation.
DROP POLICY IF EXISTS "anon_insert_trusted_pricing_assumptions" ON trusted_pricing_assumptions;
CREATE POLICY "anon_insert_trusted_pricing_assumptions" ON trusted_pricing_assumptions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_trusted_pricing_assumptions" ON trusted_pricing_assumptions;
CREATE POLICY "anon_update_trusted_pricing_assumptions" ON trusted_pricing_assumptions FOR UPDATE TO anon USING (true) WITH CHECK (true);

INSERT INTO trusted_pricing_assumptions (
  config_version_id, target_gross_margin, free_with_cotutor,
  storage_cost_per_assignment, analysis_cost_per_assignment, fixed_infra_per_student_year,
  source_reference
) VALUES (
  'b2c3d4e5-0002-0002-0002-000000000002'::uuid,
  0.40, false,
  0.10, 0.08, 0,
  'TrustEd_Pricing_Models.xlsx "Model 2 - TrustEd Only" sheet (un-discounted per-assignment rates), captured 2026-07-20. Margin is a placeholder pending an explicit go-to-market decision.'
)
ON CONFLICT (config_version_id) DO NOTHING;

-- Remove the old flat tiers — superseded by the per-assignment formula above.
DELETE FROM pricing_models
WHERE config_version_id = 'b2c3d4e5-0002-0002-0002-000000000002'::uuid
  AND product_id = 'seed-product-trusted'
  AND tier_name IN ('Standalone', 'Bundle Add-on');
