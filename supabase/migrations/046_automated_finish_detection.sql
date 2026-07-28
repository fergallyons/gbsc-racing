-- Automatic finish-time capture from tracked GPS positions, for races run
-- with no Officer of the Day physically present to record times. An RO
-- marks a race "automated" in advance; the detect-finishes scheduled
-- function then only evaluates it once the start sequence has actually
-- fired (races.automated + a real race_starts row is the whole precondition
-- — tracking-on is already implied by a boat simply having race_positions
-- rows for that race_key, nothing extra to check there). Idempotent.

ALTER TABLE races
  ADD COLUMN IF NOT EXISTS automated boolean NOT NULL DEFAULT false;

-- One row per boat per race — the scheduled function's write is a plain
-- INSERT ... ON CONFLICT DO NOTHING against (boat_id, race_key), so a
-- boat's finish is only ever recorded once no matter how many times the
-- function re-scans the same positions on later runs.
CREATE TABLE IF NOT EXISTS race_finishes (
  id           bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id      text              NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key     text              NOT NULL,
  finish_time  timestamptz       NOT NULL, -- interpolated crossing instant, not "when the function ran"
  source       text              NOT NULL DEFAULT 'auto' CHECK (source IN ('auto')),
  crossing_lat double precision, -- audit/debug only — where the interpolated crossing point fell
  crossing_lng double precision,
  detected_at  timestamptz       NOT NULL DEFAULT now(), -- when the scheduled function actually wrote this row
  UNIQUE (boat_id, race_key)
);
CREATE INDEX IF NOT EXISTS race_finishes_race_key_idx ON race_finishes(race_key);

ALTER TABLE race_finishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_finishes_select" ON race_finishes;
-- Read-only for anon by design — the RO's Finish Line panel merges these in
-- to display and to seed local overrides, but never writes here directly.
-- Only the scheduled function (service role, bypasses RLS) ever inserts a
-- row, so a result can't be forged or altered client-side.
CREATE POLICY "race_finishes_select" ON race_finishes FOR SELECT USING (true);
GRANT SELECT ON race_finishes TO anon;
-- service_role bypasses RLS but NOT the base table grant — confirmed live
-- (chat 2026-07-28): the scheduled function's insert got a flat 42501
-- until this was added, despite using the service key correctly.
GRANT INSERT ON race_finishes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE race_finishes_id_seq TO service_role;

INSERT INTO schema_migrations (filename) VALUES ('046_automated_finish_detection.sql')
ON CONFLICT (filename) DO NOTHING;
