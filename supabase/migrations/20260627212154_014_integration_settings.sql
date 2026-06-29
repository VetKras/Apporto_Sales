
/*
  integration_settings — org-wide key store for external integrations.

  One row per provider (hubspot, email, etc.). The edge function reads
  api_key server-side using the service role key, so the raw token is
  never returned to the browser by the action endpoints.
*/

CREATE TABLE IF NOT EXISTS integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  api_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_integration_settings" ON integration_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_integration_settings" ON integration_settings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_integration_settings" ON integration_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
