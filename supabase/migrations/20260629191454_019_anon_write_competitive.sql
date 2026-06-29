-- Anon write access for competitive tables (missed from migration 017)
CREATE POLICY "anon_insert_competitive_matrix" ON competitive_matrix
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_competitive_matrix" ON competitive_matrix
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_insert_competitors" ON competitors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_competitors" ON competitors
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
