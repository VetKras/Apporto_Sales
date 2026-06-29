
CREATE TABLE IF NOT EXISTS quote_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  name text NOT NULL,
  inputs_snapshot jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  config_version_id uuid NOT NULL REFERENCES pricing_config_versions(id),
  final_total numeric NOT NULL,
  created_by text REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quote_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_quote_snapshots" ON quote_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_quote_snapshots" ON quote_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_delete_quote_snapshots" ON quote_snapshots
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_quote_snapshots_deal_id ON quote_snapshots(deal_id);
