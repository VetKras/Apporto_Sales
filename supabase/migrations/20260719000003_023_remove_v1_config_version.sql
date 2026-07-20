/*
# Remove v1-active-defaults now that v2 is fully active

Per instruction: v1's superseded pricing_models rows (CoTutor's old flat tiers, ExamSpace's old
seat-day tiers, and the carried-forward PowerGrader/TrustEd rows that got duplicated onto v2 in
migration 021) and the v1 config_version row itself can be removed rather than kept for history.

1. Suite Tier brackets (`pricing_brackets`, migration 020) were seeded against v1's id — re-point
   them to v2 rather than deleting, so that feature's seed data survives. Suite Tier has no
   rep-facing UI yet (per its own migration comments), so this is inert either way, but there's
   no reason to destroy it when a one-line UPDATE preserves it.

2. Delete the now-superseded v1 pricing_models rows (CoTutor flat tiers, ExamSpace seat-day
   tiers, and the v1 copies of PowerGrader/TrustEd — the v2 copies from migration 021 remain).

3. Delete the v1 pricing_config_versions row itself.

4. Deliberately NOT using ON DELETE CASCADE or force-deleting quote_lines / quote_outputs /
   quote_snapshots / pricing_validation_results that might reference v1 — if any real saved quote
   was calculated against v1 before this migration runs, step 3 will fail with a foreign key
   violation instead of silently destroying that quote's history. If that happens, stop and
   decide explicitly whether those old quotes should be re-saved against v2 or kept archived
   under v1 (in which case, don't run this migration until that's resolved) — don't just add
   CASCADE to push past the error.
*/

UPDATE pricing_brackets
SET config_version_id = 'b2c3d4e5-0002-0002-0002-000000000002'::uuid
WHERE config_version_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid;

DELETE FROM pricing_models
WHERE config_version_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid;

DELETE FROM pricing_config_versions
WHERE id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid;
