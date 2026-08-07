-- Race area — WHERE a race happens (a physical course location), distinct
-- from fleet (WHO races together, migration 051). A regatta commonly runs
-- several areas at once (e.g. Optimists in the harbour, IRC offshore),
-- each with its own RO/start/line — a different axis entirely from which
-- boats are grouped together. Same shape as `fleets`/`marks` — a simple
-- RO-managed reference list, empty until an RO adds rows via the Areas
-- Manager, so every club that doesn't need this sees zero change.
--
-- Deliberately scoped to TAGGING races only for now — published_courses/
-- start_finish_lines/detect-finishes.js stay club-wide singletons,
-- unaware of area. Making those genuinely area-scoped is real, separate,
-- larger follow-on work (published_courses is a hard RLS-enforced
-- singleton — WITH CHECK (id = 'current') on INSERT, no second permissive
-- policy anywhere), not attempted here. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS race_areas (
  id         text PRIMARY KEY,            -- slug, e.g. 'harbour'
  name       text NOT NULL,
  colour     text NOT NULL DEFAULT '#00b4d8',
  sort_order int NOT NULL DEFAULT 99,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE race_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_areas_select" ON race_areas;
DROP POLICY IF EXISTS "race_areas_insert" ON race_areas;
DROP POLICY IF EXISTS "race_areas_update" ON race_areas;
DROP POLICY IF EXISTS "race_areas_delete" ON race_areas;
CREATE POLICY "race_areas_select" ON race_areas FOR SELECT USING (true);
CREATE POLICY "race_areas_insert" ON race_areas FOR INSERT WITH CHECK (id ~ '^[a-z0-9_-]{1,60}$');
CREATE POLICY "race_areas_update" ON race_areas FOR UPDATE USING (true);
CREATE POLICY "race_areas_delete" ON race_areas FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON race_areas TO anon;

-- Which area a race runs in. NULL = no area distinction — today's exact
-- existing behavior for any club that never sets this. races has had a
-- plain table-level anon grant since migration 018 (confirmed no later
-- migration ever REVOKEd it, same reasoning 053 already documented for
-- fleet_id), so no new grant statement is needed here.
ALTER TABLE races ADD COLUMN IF NOT EXISTS race_area_id text REFERENCES race_areas(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (filename) VALUES ('055_race_areas.sql')
ON CONFLICT (filename) DO NOTHING;
