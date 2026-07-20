/*
# Level-based feature access control — company ceiling + L3 team-scoped restriction

1. New tables
   - `feature_flags` — catalog of what CAN be toggled (5 rows seeded: portia, competitive,
     proposal_generation, battlecard_generation, strategy_generation).
   - `feature_level_access` — L4-set company-wide ceiling per (feature, authority_level 1-3).
     No row for a (feature, level) pair means "enabled" — matches current (pre-this-migration)
     behavior exactly, so this ships with zero behavior change until someone actually unchecks
     something in the admin UI.
   - `feature_team_restrictions` — L3-manager-set restriction for their own direct reports.
     Deliberately has NO "enabled" column — a row's presence means "restricted," absence means
     "inherits the ceiling." There is no way to represent "grant beyond the ceiling" in this
     table's shape, which is what actually enforces "L3 can narrow but never widen" — a schema
     guarantee, not just an application-layer rule that a direct Supabase call could bypass.

2. Design note — not per-user
   Access is granted/restricted per authority_level (company-wide) or per-manager (their direct
   reports as a whole), never per individual person. Michael's original ask ("stop sales reps
   from generating battlecards") is satisfied by the ceiling grid if he's setting policy
   company-wide (he's L4 in this seed data), or by the team-restriction table if a specific L3
   manager wants to narrow it just for their own reports without affecting other teams at the
   same level.

3. Security
   Same permissive-to-authenticated RLS pattern as every other table in this schema. Write
   scoping is enforced at the application layer (matching this app's established pattern, see
   migration 020's precedent): feature_level_access writes only from level >= 4 || _prv UI;
   feature_team_restrictions writes only from level = 3 UI, and only with
   manager_profile_id = the acting user's own profile.id.
*/

-- ── feature_flags ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_feature_flags" ON feature_flags;
CREATE POLICY "auth_select_feature_flags" ON feature_flags FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_feature_flags" ON feature_flags;
CREATE POLICY "auth_insert_feature_flags" ON feature_flags FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO feature_flags (key, label, description) VALUES
  ('portia',                 'Portia AI Assistant',       'Entire Portia AI chat nav section'),
  ('competitive',            'Competitive Intelligence',  'Competitive Intelligence nav section'),
  ('proposal_generation',    'Proposal Generation',       '"Proposal" mode/tab inside a deal'),
  ('battlecard_generation',  'Battlecard Generation',     '"Battlecard" mode/tab inside a deal'),
  ('strategy_generation',    'Strategy Generation',       '"Strategy" mode/tab inside a deal')
ON CONFLICT (key) DO NOTHING;

-- ── feature_level_access (L4 company-wide ceiling) ─────────────────────────────
CREATE TABLE IF NOT EXISTS feature_level_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  authority_level integer NOT NULL CHECK (authority_level BETWEEN 1 AND 3),
  enabled boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_key, authority_level)
);

ALTER TABLE feature_level_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_feature_level_access" ON feature_level_access;
CREATE POLICY "auth_select_feature_level_access" ON feature_level_access FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_feature_level_access" ON feature_level_access;
CREATE POLICY "auth_insert_feature_level_access" ON feature_level_access FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_feature_level_access" ON feature_level_access;
CREATE POLICY "auth_update_feature_level_access" ON feature_level_access FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_feature_level_access" ON feature_level_access;
CREATE POLICY "auth_delete_feature_level_access" ON feature_level_access FOR DELETE TO authenticated USING (true);

-- No seed rows — absence everywhere means "fully enabled," matching current behavior exactly.

-- ── feature_team_restrictions (L3 manager, own-reports-only) ───────────────────
CREATE TABLE IF NOT EXISTS feature_team_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_profile_id text NOT NULL REFERENCES profiles(id),
  feature_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  updated_by text REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_profile_id, feature_key)
);

ALTER TABLE feature_team_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "auth_select_feature_team_restrictions" ON feature_team_restrictions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_insert_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "auth_insert_feature_team_restrictions" ON feature_team_restrictions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_feature_team_restrictions" ON feature_team_restrictions;
CREATE POLICY "auth_delete_feature_team_restrictions" ON feature_team_restrictions FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_feature_team_restrictions_manager ON feature_team_restrictions(manager_profile_id);
