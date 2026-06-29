
/*
# Core reference tables: profiles, authority_rules, source_documents

1. New Tables
   - `profiles` — internal Apporto team members. auth_user_id links to Supabase Auth.
     authority_level 1-4 controls conflict-handling behavior. supervisor_profile_id is a
     self-referential FK (nullable) for the org hierarchy. seed identities use a stable
     text slug as the primary key so seeds are idempotent.
   - `authority_rules` — lookup table mapping level integer → behavior label and flags.
   - `source_documents` — uploaded files (CSV, PDF, DOCX, etc.) used for knowledge ingestion.
     trust_weight and authority_level reflect the uploader's standing at upload time.

2. Security
   - RLS enabled on all three tables.
   - Authenticated users can read all records (team-wide internal tool).
   - Authenticated users can insert/update profiles (self-registration on first login).
   - authority_rules is read-only from the client; seeded by migrations only.
   - source_documents: authenticated users can insert and read; no client-side delete.

3. Notes
   - profiles.id uses text PK ('seed-antony-awaida' etc.) for idempotent seeding.
     New sign-ups created via trigger will get a gen_random_uuid() id.
   - supervisor_profile_id is nullable (CEO has no supervisor).
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auth_user_id uuid UNIQUE,
  name text NOT NULL,
  email text UNIQUE,
  title text,
  department text,
  supervisor_profile_id text REFERENCES profiles(id),
  authority_level integer NOT NULL DEFAULT 1 CHECK (authority_level BETWEEN 1 AND 4),
  authority_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_profiles" ON profiles;
CREATE POLICY "auth_select_profiles" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_profiles" ON profiles;
CREATE POLICY "auth_insert_profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_profiles" ON profiles;
CREATE POLICY "auth_update_profiles" ON profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- authority_rules
CREATE TABLE IF NOT EXISTS authority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_level integer NOT NULL UNIQUE CHECK (authority_level BETWEEN 1 AND 4),
  label text NOT NULL,
  conflict_behavior text NOT NULL,
  can_apply_updates boolean NOT NULL DEFAULT false,
  requires_confirmation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE authority_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_authority_rules" ON authority_rules;
CREATE POLICY "auth_select_authority_rules" ON authority_rules FOR SELECT TO authenticated, anon USING (true);

-- source_documents
CREATE TABLE IF NOT EXISTS source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  file_name text,
  file_type text,
  uploader_profile_id text REFERENCES profiles(id),
  authority_level integer NOT NULL DEFAULT 1 CHECK (authority_level BETWEEN 1 AND 4),
  trust_weight numeric NOT NULL DEFAULT 0.25,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsed','reviewed','rejected','archived')),
  extracted_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_source_documents" ON source_documents;
CREATE POLICY "auth_select_source_documents" ON source_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_source_documents" ON source_documents;
CREATE POLICY "auth_insert_source_documents" ON source_documents FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_source_documents" ON source_documents;
CREATE POLICY "auth_update_source_documents" ON source_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
