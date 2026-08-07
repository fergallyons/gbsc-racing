-- "Race day" — a calendar day's worth of racing, distinct from a `races`
-- row (a single start-to-finish contest). Most clubs have always had a
-- silent 1:1 mapping between the two (one race per night), but that broke
-- down explicitly this week: GBSC runs 2 short races back-to-back some
-- Octobers, and MSC/regattas run several races across fleets the same
-- day. id is the date itself, not a surrogate key — matches the existing
-- text-slug-PK convention (boats.id, marks.id, fleets.id) and makes
-- auto-creation (see app.js saveRace()) a single upsert with nothing to
-- read back. name/notes are reserved for a future day-level feature
-- (briefing notes, regatta day naming) — nothing writes them yet.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS race_days (
  id         date PRIMARY KEY,
  name       text,
  notes      text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE race_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_days_select" ON race_days;
DROP POLICY IF EXISTS "race_days_insert" ON race_days;
DROP POLICY IF EXISTS "race_days_update" ON race_days;
DROP POLICY IF EXISTS "race_days_delete" ON race_days;
CREATE POLICY "race_days_select" ON race_days FOR SELECT USING (true);
CREATE POLICY "race_days_insert" ON race_days FOR INSERT WITH CHECK (true);
CREATE POLICY "race_days_update" ON race_days FOR UPDATE USING (true);
CREATE POLICY "race_days_delete" ON race_days FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON race_days TO anon;

-- Which day a race belongs to. NULL = not yet tagged — auto-populated by
-- saveRace() on every Add/Edit going forward (upserts race_days for that
-- date, then sets this), so an RO never manages "race days" as a separate
-- manual step. Existing races stay NULL until next edited/re-saved.
ALTER TABLE races ADD COLUMN IF NOT EXISTS race_day_id date REFERENCES race_days(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (filename) VALUES ('054_race_days.sql')
ON CONFLICT (filename) DO NOTHING;
