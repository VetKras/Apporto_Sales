CREATE POLICY "anon_select_competitive_matrix" ON competitive_matrix
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_select_competitors" ON competitors
  FOR SELECT TO anon USING (true);
