-- Which fleet a scheduled race is for — lets one club night carry several
-- separate races across fleets (e.g. Ruffian 23 at 19:00 and 20:00,
-- Cruisers at 19:05 — three distinct races rows on the same date, each
-- with its own race_key). NULL = no fleet distinction, today's exact
-- existing behavior for any club that doesn't use fleets. races already
-- has a plain table-level anon grant (migration 018), so no new grant
-- statement is needed here — confirmed, same as race_starts.fleet_id.
-- Idempotent — safe to re-run.

ALTER TABLE races ADD COLUMN IF NOT EXISTS fleet_id text REFERENCES fleets(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (filename) VALUES ('053_races_fleet.sql')
ON CONFLICT (filename) DO NOTHING;
