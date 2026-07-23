-- Race Tracker: opt-in live position sharing per boat, per race, with replay
-- afterwards. Positions persist for 72h (see netlify/functions/
-- race-positions-cleanup.js for the retention job), then get purged.
-- Idempotent.

CREATE TABLE IF NOT EXISTS race_positions (
  id          bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id     text              NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key    text              NOT NULL,
  lat         double precision  NOT NULL,
  lng         double precision  NOT NULL,
  heading     double precision,
  speed_kn    double precision,
  recorded_at timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_positions_race_key_idx ON race_positions(race_key, recorded_at);
CREATE INDEX IF NOT EXISTS race_positions_boat_idx ON race_positions(boat_id, race_key);

ALTER TABLE race_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_positions_select" ON race_positions;
DROP POLICY IF EXISTS "race_positions_insert" ON race_positions;
-- Live/replay positions are open — same trust model as every other race
-- table in this app (results, registrations, etc. are all anon-readable).
-- A boat only ever appears here at all when its skipper has explicitly
-- opted in for that specific race — see registrations.tracking_enabled
-- below. Decision + rationale: chat 2026-07-22.
CREATE POLICY "race_positions_select" ON race_positions FOR SELECT USING (true);
CREATE POLICY "race_positions_insert" ON race_positions FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_key IS NOT NULL
  AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
);
GRANT SELECT, INSERT ON race_positions TO anon;
GRANT USAGE, SELECT ON SEQUENCE race_positions_id_seq TO anon;

-- Per-race, per-boat opt-in — the skipper's explicit consent for that one
-- race, not a standing account-level setting. Off by default. Reuses the
-- existing "anon_update_registrations" policy (USING true / WITH CHECK
-- true) from migration 021 — only the column-level grant is new here.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT false;
GRANT UPDATE (tracking_enabled) ON registrations TO anon;

INSERT INTO schema_migrations (filename) VALUES ('039_race_positions.sql')
ON CONFLICT (filename) DO NOTHING;
