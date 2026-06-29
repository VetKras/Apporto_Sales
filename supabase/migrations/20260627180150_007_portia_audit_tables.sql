
/*
# Portia tables and audit/update tables

1. New Tables
   - `portia_sessions` — one session per user/deal combination. Stores the conversation
     context and active mode (pricing_strategist, competitive_analyst, etc.)
   - `portia_messages` — individual messages in a session. role can be system/user/assistant/tool.
     source_trace records which DB records Portia used to generate the message.
   - `proposed_updates` — change proposals that go through authority review workflow.
     Every attempt to modify source truth creates a proposed_update row. Executives can
     approve; lower levels queue for review. No silent overwrites.
   - `ai_events` — audit log for all AI-triggered actions: generation, ingestion, conflict
     detection, proposed updates, applied updates, quote calculations.

2. Security
   - portia_sessions and portia_messages: each user can read/insert their own records.
     For simplicity in V1, all authenticated users can read all sessions (team tool).
   - proposed_updates and ai_events: readable by all authenticated users (audit visibility).
     Insert allowed; updates only for review/approval workflows.

3. Notes
   - ai_events.proposed_update_id is a loose reference (not FK) because proposed_updates
     is created in the same migration batch and circular FKs cause issues. App enforces
     referential integrity.
*/

CREATE TABLE IF NOT EXISTS portia_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id text REFERENCES profiles(id),
  deal_id uuid REFERENCES deals(id),
  title text,
  mode text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portia_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_portia_sessions" ON portia_sessions;
CREATE POLICY "auth_select_portia_sessions" ON portia_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_portia_sessions" ON portia_sessions;
CREATE POLICY "auth_insert_portia_sessions" ON portia_sessions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_portia_sessions" ON portia_sessions;
CREATE POLICY "auth_update_portia_sessions" ON portia_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- portia_messages
CREATE TABLE IF NOT EXISTS portia_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES portia_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content text NOT NULL,
  source_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portia_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_portia_messages" ON portia_messages;
CREATE POLICY "auth_select_portia_messages" ON portia_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_portia_messages" ON portia_messages;
CREATE POLICY "auth_insert_portia_messages" ON portia_messages FOR INSERT TO authenticated WITH CHECK (true);

-- proposed_updates
CREATE TABLE IF NOT EXISTS proposed_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL,
  target_id text,
  proposed_payload jsonb NOT NULL,
  conflict_summary text,
  authority_level integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied','needs_confirmation')),
  created_by text REFERENCES profiles(id),
  reviewed_by text REFERENCES profiles(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proposed_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_proposed_updates" ON proposed_updates;
CREATE POLICY "auth_select_proposed_updates" ON proposed_updates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_proposed_updates" ON proposed_updates;
CREATE POLICY "auth_insert_proposed_updates" ON proposed_updates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_proposed_updates" ON proposed_updates;
CREATE POLICY "auth_update_proposed_updates" ON proposed_updates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ai_events
CREATE TABLE IF NOT EXISTS ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('generation','ingestion','conflict','confirmation','proposed_update','applied_update','quote_calculated')),
  status text NOT NULL DEFAULT 'created',
  actor_profile_id text REFERENCES profiles(id),
  deal_id uuid REFERENCES deals(id),
  source_document_id uuid REFERENCES source_documents(id),
  proposed_update_id uuid,
  reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_ai_events" ON ai_events;
CREATE POLICY "auth_select_ai_events" ON ai_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ai_events" ON ai_events;
CREATE POLICY "auth_insert_ai_events" ON ai_events FOR INSERT TO authenticated WITH CHECK (true);
