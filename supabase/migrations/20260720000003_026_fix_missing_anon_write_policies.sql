/*
# Fix: missing anon write policies on today's new tables (feature access + CoTutor pricing)

Bug found live: an L4 user (Antony) tried to disable a feature for L2 in Settings > Team &
Authority and got "new row violates row-level security policy for table 'feature_level_access'".

Root cause: this app's demo auth (email picker, any password accepted) never produces a real
Supabase-authenticated JWT session — every request runs as the anon role. `profiles` and
`pricing_models` both carry matching anon-role insert/update policies alongside their
authenticated-role ones (added out-of-band at some point — not present in any migration file in this
repo, but confirmed live via pg_policies) which is why writes to THOSE tables work. Every table
created today (migrations 021, 022) only got `TO authenticated` policies, so every write to them
has been silently failing the same way — CoTutor's own Business Levers/Technical Assumptions save
in Admin Config has been broken since migration 021, just not noticed until someone hit
feature_level_access specifically.

Also fixes a second, separate bug in migration 022: feature_team_restrictions never got an UPDATE
policy at all (only INSERT/DELETE/SELECT) — its writer (setTeamRestriction) does an upsert, which
issues an UPDATE on conflict and would fail even under a real authenticated session.

Migrations 024 (PowerGrader) and 025 (TrustEd) already include both authenticated and anon policies
from the start — this migration only backfills the four tables that shipped without them.
*/

-- feature_level_access
DROP POLICY IF EXISTS "anon_insert_feature_level_access" ON feature_level_access;
CREATE POLICY "anon_insert_feature_level_access" ON feature_level_access FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_feature_level_access" ON feature_level_access;
CREATE POLICY "anon_update_feature_level_access" ON feature_level_access FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- feature_team_restrictions — also backfills the missing UPDATE policy (upsert needs it even for
-- the authenticated role, which never actually got exercised until this bug surfaced).
DROP POLICY IF EXISTS "auth_update_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "auth_update_feature_team_restrictions" ON feature_team_restrictions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "anon_insert_feature_team_restrictions" ON feature_team_restrictions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "anon_update_feature_team_restrictions" ON feature_team_restrictions FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "anon_delete_feature_team_restrictions" ON feature_team_restrictions FOR DELETE TO anon USING (true);

-- cotutor_pricing_assumptions
DROP POLICY IF EXISTS "anon_insert_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions;
CREATE POLICY "anon_insert_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions;
CREATE POLICY "anon_update_cotutor_pricing_assumptions" ON cotutor_pricing_assumptions FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- cotutor_ai_models
DROP POLICY IF EXISTS "anon_insert_cotutor_ai_models" ON cotutor_ai_models;
CREATE POLICY "anon_insert_cotutor_ai_models" ON cotutor_ai_models FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cotutor_ai_models" ON cotutor_ai_models;
CREATE POLICY "anon_update_cotutor_ai_models" ON cotutor_ai_models FOR UPDATE TO anon USING (true) WITH CHECK (true);
