/*
# CoTutor formula-driven pricing + ExamSpace per-student-annual repricing

1. New tables
   - `cotutor_pricing_assumptions` — one row per config version. Business levers (target margin,
     adoption rate, fixed infra) + technical usage assumptions (token counts, pass rate, cache hit
     rate) that drive the CoTutor COGS formula. Mirrors BACKEND_ASSUMPTIONS in
     CoTutor_Pricing_Final.xlsx exactly — same field names, same values.
   - `cotutor_ai_models` — curated, approved-only AI model rate table for the CoTutor quote dropdown.
     Replaces the hardcoded (and partly fabricated) COTUTOR_MODELS array in pricing-engine.ts.

2. New pricing_config_versions row
   - 'v2-cotutor-formula-examspace-annual', is_active = true. Supersedes 'v1-active-defaults'
     (flipped to is_active = false, kept for history/audit — never delete old config versions).

3. pricing_models changes (ExamSpace only in this migration)
   - Old 3 seat-day rows (Medium/Large/GPU, pricing_type='per_seat_day') are NOT carried forward
     into the new active version — this version's ExamSpace rows use pricing_type='per_student',
     unit='student/year', 6 tiers instead of 3.
   - Platform Fee ($1,200/yr) and Setup Fee ($2,500 one-time) rows ARE carried forward unchanged.
     No source document confirms or retires them — exam_desktop_cost_v2026.xlsx only models desktop
     compute cost, not platform/onboarding fees. Do not silently drop real fee line items.
   - CoTutor's 3 flat-tier rows (Departmental/Campus/Platform, pricing_type='per_student') are NOT
     carried forward — CoTutor pricing is now formula-driven (see cotutor_pricing_assumptions),
     calculateQuote() no longer looks up a CoTutor row in pricing_models at all.
   - PowerGrader/TrustEd rows carried forward unchanged onto the new version (still v1 placeholders,
     confidence='low' — Phase 2 territory, not touched by this migration).

4. Security
   - Same permissive-to-authenticated pattern as every other pricing table in this schema
     (SELECT for authenticated + anon, INSERT/UPDATE for authenticated, no client DELETE).
   - Editing rights for cotutor_pricing_assumptions gated at the application layer
     (level >= 3 || _prv, matching AdminConfigTab's existing "Product Prices & COGS" gate) — not a
     new RLS role, consistent with migration 020's established precedent.

5. Note on the pre-existing `ai_models` table
   - This database has a separate `ai_models` table (not defined in any migration in this repo,
     origin unknown, no code references it) that appears to be a much broader general-purpose model
     catalog. `cotutor_ai_models` is deliberately a small, separate, curated table — CoTutor's quote
     dropdown must only ever offer models actually verified against CoTutor_Pricing_Final.xlsx, not
     an unfiltered list from an unrelated catalog.
*/

-- ── New config version ─────────────────────────────────────────────────────────
INSERT INTO pricing_config_versions (id, version_name, effective_date, notes, is_active, validation_status, source_refs)
VALUES (
  'b2c3d4e5-0002-0002-0002-000000000002'::uuid,
  'v2-cotutor-formula-examspace-annual',
  CURRENT_DATE,
  'CoTutor: replaces flat 20/15/10 tiers with the token-COGS formula from CoTutor_Pricing_Final.xlsx (82.7% target margin, confirmed by Antony CEO 2026-07-19 — $24.01/student/yr at reference assumptions: 10k students, gpt-5.4-mini, 4 assignments/mo, 9-month contract). ExamSpace: replaces 3-tier seat-day pricing ($11/$16/$23) with 6-tier per-student-annual pricing from exam_desktop_cost_v2026.xlsx (Container/Linux/Small/Medium/Large/GPU). Platform Fee and Setup Fee carried forward unchanged.',
  true,
  'valid',
  '["CoTutor_Pricing_Final.xlsx","exam_desktop_cost_v2026.xlsx","Antony CEO decision 2026-07-19: $24/student/year"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

UPDATE pricing_config_versions SET is_active = false WHERE id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid;

-- ── cotutor_pricing_assumptions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotutor_pricing_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  -- Business levers (exec/sales leadership — Settings > Admin Config editable)
  target_gross_margin numeric NOT NULL CHECK (target_gross_margin >= 0 AND target_gross_margin < 0.95),
  active_user_adoption_rate numeric NOT NULL CHECK (active_user_adoption_rate > 0 AND active_user_adoption_rate <= 1),
  fixed_infra_per_student_year numeric NOT NULL CHECK (fixed_infra_per_student_year >= 0),
  -- Technical usage assumptions (product/eng — same tab, separate section)
  student_messages_per_assignment numeric NOT NULL,
  validation_input_tokens_per_message numeric NOT NULL,
  validation_output_tokens_per_message numeric NOT NULL,
  chat_input_tokens_per_message numeric NOT NULL,
  chat_output_tokens_per_message numeric NOT NULL,
  chat_history_tokens_per_turn numeric NOT NULL,
  validation_pass_rate numeric NOT NULL CHECK (validation_pass_rate > 0 AND validation_pass_rate <= 1),
  cache_hit_rate numeric NOT NULL CHECK (cache_hit_rate >= 0 AND cache_hit_rate < 1),
  -- Reference / display only, not used in the formula
  chatgpt_edu_benchmark_usd_per_user_year numeric,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_version_id)
);

ALTER TABLE cotutor_pricing_assumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions;
CREATE POLICY "auth_select_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions;
CREATE POLICY "auth_insert_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions;
CREATE POLICY "auth_update_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO cotutor_pricing_assumptions (
  config_version_id, target_gross_margin, active_user_adoption_rate, fixed_infra_per_student_year,
  student_messages_per_assignment, validation_input_tokens_per_message, validation_output_tokens_per_message,
  chat_input_tokens_per_message, chat_output_tokens_per_message, chat_history_tokens_per_turn,
  validation_pass_rate, cache_hit_rate, chatgpt_edu_benchmark_usd_per_user_year, source_reference
) VALUES (
  'b2c3d4e5-0002-0002-0002-000000000002'::uuid,
  0.827, 0.70, 2.00,
  15, 1862, 80,
  2500, 399, 500,
  0.85, 0.30, 30, 'CoTutor_Pricing_Final.xlsx BACKEND_ASSUMPTIONS sheet, captured 2026-07-19'
)
ON CONFLICT (config_version_id) DO NOTHING;

-- ── cotutor_ai_models ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotutor_ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  model_id text NOT NULL,
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'OpenAI',
  input_rate_per_1m numeric NOT NULL,
  cached_input_rate_per_1m numeric NOT NULL,
  output_rate_per_1m numeric NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_version_id, model_id)
);

ALTER TABLE cotutor_ai_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_cotutor_ai_models" ON cotutor_ai_models;
CREATE POLICY "auth_select_cotutor_ai_models" ON cotutor_ai_models FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_cotutor_ai_models" ON cotutor_ai_models;
CREATE POLICY "auth_insert_cotutor_ai_models" ON cotutor_ai_models FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_cotutor_ai_models" ON cotutor_ai_models;
CREATE POLICY "auth_update_cotutor_ai_models" ON cotutor_ai_models FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO cotutor_ai_models (config_version_id, model_id, label, provider, input_rate_per_1m, cached_input_rate_per_1m, output_rate_per_1m, is_default, sort_order)
VALUES
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.4-nano',  'GPT-5.4 Nano',  'OpenAI', 0.20, 0.02, 1.25,  false, 1),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.4-mini',  'GPT-5.4 Mini',  'OpenAI', 0.75, 0.075, 4.50, true,  2),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.4',       'GPT-5.4',       'OpenAI', 2.50, 0.25, 15.00, false, 3),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.6-luna',  'GPT-5.6 Luna',  'OpenAI', 1.00, 0.10, 6.00,  false, 4),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.6-terra', 'GPT-5.6 Terra', 'OpenAI', 2.50, 0.25, 15.00, false, 5),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.6-sol',   'GPT-5.6 Sol',   'OpenAI', 5.00, 0.50, 30.00, false, 6),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'gpt-5.5',       'GPT-5.5',       'OpenAI', 5.00, 0.50, 30.00, false, 7)
ON CONFLICT (config_version_id, model_id) DO NOTHING;

-- ── ExamSpace: new 6-tier per-student-annual pricing_models rows ────────────────
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, default_cost, currency, source_reference, confidence)
VALUES
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Container', 'per_student', 'student/year', 0.10, 0.04, 'USD', 'exam_desktop_cost_v2026.xlsx Summary sheet, captured 2026-07-19', 'high'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Linux',     'per_student', 'student/year', 0.19, 0.07, 'USD', 'exam_desktop_cost_v2026.xlsx Summary sheet, captured 2026-07-19', 'high'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Small',     'per_student', 'student/year', 0.49, 0.15, 'USD', 'exam_desktop_cost_v2026.xlsx Summary sheet, captured 2026-07-19', 'high'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Medium',    'per_student', 'student/year', 1.22, 0.37, 'USD', 'exam_desktop_cost_v2026.xlsx Summary sheet, captured 2026-07-19', 'high'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Large',     'per_student', 'student/year', 2.75, 0.69, 'USD', 'exam_desktop_cost_v2026.xlsx Summary sheet, captured 2026-07-19', 'high'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'GPU',       'per_student', 'student/year', 5.54, 1.39, 'USD', 'exam_desktop_cost_v2026.xlsx Summary sheet, captured 2026-07-19', 'high')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- ── ExamSpace: Platform Fee / Setup Fee carried forward unchanged onto the new version ──
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Platform Fee', 'platform_fee', 'year',     1200, 'USD', 'carried forward from v1-active-defaults; new customers only', 'high'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-examspace', 'Setup Fee',    'setup_fee',    'one-time', 2500, 'USD', 'carried forward from v1-active-defaults; new customers only', 'high')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- ── PowerGrader / TrustEd: carried forward unchanged onto the new version (Phase 2 territory) ──
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-powergrader', 'Per Student',    'per_student',    'student/year', 15,  'USD', 'carried forward from v1-active-defaults; unsourced, Phase 2 replaces this', 'low'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-powergrader', 'Per Faculty',    'per_faculty',    'faculty/year', 120, 'USD', 'carried forward from v1-active-defaults; unsourced, Phase 2 replaces this', 'low'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-powergrader', 'Per Submission', 'per_submission', 'submission',   4,   'USD', 'carried forward from v1-active-defaults; unsourced, Phase 2 replaces this', 'low'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-trusted',     'Standalone',     'per_student',    'student/year', 50,  'USD', 'carried forward from v1-active-defaults; Phase 2 replaces this', 'medium'),
  ('b2c3d4e5-0002-0002-0002-000000000002'::uuid, 'seed-product-trusted',     'Bundle Add-on',  'per_student',    'student/year', 40,  'USD', 'carried forward from v1-active-defaults; Phase 2 replaces this', 'low')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- ── Data fix: Veton to Level 4 ────────────────────────────────────────────────
UPDATE profiles SET authority_level = 4 WHERE id = 'seed-veton-krasniqi';
