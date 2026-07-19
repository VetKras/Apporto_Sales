/*
# Suite Tier graduated-bracket pricing: pricing_brackets

1. New Tables
   - `pricing_brackets` — cumulative graduated seat-count brackets for the NEW "Suite Tier"
     bundle quoting concept (Tier 1 = CoTutor only, Tier 2 = +TrustEd, Tier 3 = +PowerGrader).
     This is a PARALLEL pricing concept to the existing per-product `pricing_models` table
     and does not replace or interact with it. Suite Tier pricing bills a bundle as a whole
     against total seat count using a cumulative graduated-bracket formula (see
     calculateSuiteTierPrice() in src/lib/suite-pricing.ts for the reference formula),
     fixing a revenue-cliff bug present in the prior flat-per-bracket marketing pricing sheet.

2. Bracket Formula (reference — enforced in application code, not SQL)
   Let S = total seats, R1/R2/R3 = price_per_seat for bracket_index 1/2/3 of a given tier:
     S <= 2,000              => C = S * R1
     2,000 < S <= 5,000      => C = 2,000*R1 + (S-2,000)*R2
     S > 5,000                => C = 2,000*R1 + 3,000*R2 + (S-5,000)*R3

3. Security
   - Same read/write RLS pattern as pricing_config_versions / pricing_models: all
     authenticated (and anon, matching existing internal-tool convention) can SELECT;
     authenticated can INSERT/UPDATE; no client-side DELETE.
   - Admin-only bracket EDITING is a Phase 2+ concern (UI not built yet). When
     that UI is added, gate it at the application layer using the existing hidden
     elevated-access pattern: level >= N || _prv (profiles.a43ac9 / AuthContext._prv),
     NOT a new role name. RLS stays permissive-to-authenticated for Phase 1 to match
     the rest of the pricing schema.

4. Notes
   - suite_tier values are 'tier_1' | 'tier_2' | 'tier_3' (stable slugs, extensible).
   - bracket_index is 1-based (1, 2, 3) and orders brackets within a tier/version.
   - seat_max is NULL for the open-ended top bracket (bracket_index = 3).
   - UNIQUE (config_version_id, suite_tier, bracket_index) prevents duplicate/ambiguous
     bracket rows for the same version+tier.
*/

CREATE TABLE IF NOT EXISTS pricing_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  suite_tier text NOT NULL CHECK (suite_tier IN ('tier_1', 'tier_2', 'tier_3')),
  suite_tier_label text NOT NULL,
  bracket_index integer NOT NULL CHECK (bracket_index IN (1, 2, 3)),
  seat_min integer NOT NULL,
  seat_max integer,
  price_per_seat numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  source_reference text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_version_id, suite_tier, bracket_index),
  CHECK (seat_max IS NULL OR seat_max > seat_min)
);

ALTER TABLE pricing_brackets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_pricing_brackets" ON pricing_brackets;
CREATE POLICY "auth_select_pricing_brackets" ON pricing_brackets FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_pricing_brackets" ON pricing_brackets;
CREATE POLICY "auth_insert_pricing_brackets" ON pricing_brackets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_pricing_brackets" ON pricing_brackets;
CREATE POLICY "auth_update_pricing_brackets" ON pricing_brackets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pricing_brackets_config_version_id ON pricing_brackets(config_version_id);
CREATE INDEX IF NOT EXISTS idx_pricing_brackets_suite_tier ON pricing_brackets(suite_tier);

-- Seed validated Suite Tier bracket rates onto the active config version
INSERT INTO pricing_brackets (config_version_id, suite_tier, suite_tier_label, bracket_index, seat_min, seat_max, price_per_seat, source_reference)
VALUES
  -- Tier 1 (CoTutor only): R1=20.00, R2=11.6667, R3=5.00
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_1', 'Tier 1 (CoTutor only)', 1, 1,    2000, 20.00,     'validated suite-tier pricing model'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_1', 'Tier 1 (CoTutor only)', 2, 2001, 5000, 11.66666667, 'validated suite-tier pricing model'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_1', 'Tier 1 (CoTutor only)', 3, 5001, NULL, 5.00,      'validated suite-tier pricing model'),

  -- Tier 2 (+TrustEd): R1=30.00, R2=17.50, R3=7.50
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_2', 'Tier 2 (+TrustEd)', 1, 1,    2000, 30.00, 'validated suite-tier pricing model'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_2', 'Tier 2 (+TrustEd)', 2, 2001, 5000, 17.50, 'validated suite-tier pricing model'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_2', 'Tier 2 (+TrustEd)', 3, 5001, NULL, 7.50,  'validated suite-tier pricing model'),

  -- Tier 3 (+PowerGrader): R1=40.00, R2=23.3333, R3=10.00
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_3', 'Tier 3 (+PowerGrader)', 1, 1,    2000, 40.00,   'validated suite-tier pricing model'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_3', 'Tier 3 (+PowerGrader)', 2, 2001, 5000, 23.33333333, 'validated suite-tier pricing model'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'tier_3', 'Tier 3 (+PowerGrader)', 3, 5001, NULL, 10.00,   'validated suite-tier pricing model')
ON CONFLICT (config_version_id, suite_tier, bracket_index) DO NOTHING;
