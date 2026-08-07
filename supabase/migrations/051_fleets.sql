-- Fleets — an optional per-club grouping for boats and starts. Empty for
-- every club until an RO chooses to add rows (Fleets Manager panel) — a
-- club that never creates a fleet keeps its exact current single-fleet,
-- single-start behavior with zero setup. Built for MSC (Cruisers + Ruffian
-- 23 racing the same night, separate starts) but available to any club.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS fleets (
  id         text PRIMARY KEY,            -- slug, e.g. 'cruisers'
  name       text NOT NULL,
  colour     text NOT NULL DEFAULT '#00b4d8',
  sort_order int NOT NULL DEFAULT 99,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fleets_select" ON fleets;
DROP POLICY IF EXISTS "fleets_insert" ON fleets;
DROP POLICY IF EXISTS "fleets_update" ON fleets;
DROP POLICY IF EXISTS "fleets_delete" ON fleets;
CREATE POLICY "fleets_select" ON fleets FOR SELECT USING (true);
CREATE POLICY "fleets_insert" ON fleets FOR INSERT WITH CHECK (id ~ '^[a-z0-9_-]{1,60}$');
CREATE POLICY "fleets_update" ON fleets FOR UPDATE USING (true);
CREATE POLICY "fleets_delete" ON fleets FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON fleets TO anon;

-- Which fleet a boat races in. NULL = unassigned — every boat at every
-- club stays NULL forever unless an RO explicitly sets it, so this is a
-- pure opt-in with no effect on any club that doesn't use fleets.
ALTER TABLE boats ADD COLUMN IF NOT EXISTS fleet_id text REFERENCES fleets(id) ON DELETE SET NULL;

-- boats has column-level (not table-level) anon grants as of migration 045
-- — a bare table-level GRANT here would be a silent no-op, same trap that
-- migration documents. This column needs its own explicit grant.
GRANT SELECT (fleet_id) ON boats TO anon;
GRANT UPDATE (fleet_id) ON boats TO anon;

-- Which fleet a start sequence is for. NULL = "all fleets" — today's exact
-- existing behavior (one club-wide start), preserved for any club that
-- never sets this. race_starts has only ever had a plain table-level
-- anon grant (migration 028) — confirmed no later migration locked it
-- down to column-level, so no new grant needed here.
ALTER TABLE race_starts ADD COLUMN IF NOT EXISTS fleet_id text REFERENCES fleets(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (filename) VALUES ('051_fleets.sql')
ON CONFLICT (filename) DO NOTHING;
