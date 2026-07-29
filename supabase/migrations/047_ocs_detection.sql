-- Automatic OCS (On Course Side) detection at the start line, for the same
-- "no Officer of the Day present" automated-race scenario race_finishes
-- serves (see 046). At each armed start's gun time, the detect-finishes
-- function (extended, not duplicated — see that file) checks whether each
-- tracked boat's interpolated position was on the course side of the start
-- line and, if so, writes a row here and fires a boat-scoped push alert.
--
-- This is deliberately an EVENT log, not a RESULT: rule 29.1 is a single
-- instant at the gun, but a boat can clear an OCS by returning and
-- restarting correctly (rule 30.1/30.2), so a row here is context for the
-- RO, never a final scoring status. Nothing in this app auto-writes OCS
-- into race_finishes or any results field — that stays a human judgment
-- call, same as every other protest/scoring decision. Idempotent.

-- One row per starting signal per boat — keyed on start_id (not just
-- race_key) so a re-armed start after a general recall gets a clean slate;
-- roArmStart() always cancels the old race_starts row and inserts a new one
-- with a new id, so this naturally scopes detection to "OCS at THIS gun",
-- never a stale one from an earlier attempt at the same race.
CREATE TABLE IF NOT EXISTS race_ocs (
  id          bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id     text              NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key    text              NOT NULL,
  start_id    bigint            NOT NULL REFERENCES race_starts(id) ON DELETE CASCADE,
  start_time  timestamptz       NOT NULL, -- denormalized copy of race_starts.start_time, avoids a join for the common read
  ocs_lat     double precision  NOT NULL, -- interpolated position at the gun — audit/debug + RO context
  ocs_lng     double precision  NOT NULL,
  detected_at timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (boat_id, start_id)
);
CREATE INDEX IF NOT EXISTS race_ocs_start_id_idx ON race_ocs(start_id);

ALTER TABLE race_ocs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_ocs_select" ON race_ocs;
-- Read-only for anon by design, same rationale as race_finishes — the
-- skipper's own Start Sequence view reads this to show the X-flag alert,
-- and the RO can see it as context, but only the scheduled function
-- (service role, bypasses RLS) ever writes a row.
CREATE POLICY "race_ocs_select" ON race_ocs FOR SELECT USING (true);
GRANT SELECT ON race_ocs TO anon;
-- service_role bypasses RLS but NOT the base table grant (confirmed live,
-- chat 2026-07-28, on race_finishes) — grant it up front here instead of
-- rediscovering the same 42501 the hard way a second time.
GRANT INSERT ON race_ocs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE race_ocs_id_seq TO service_role;

INSERT INTO schema_migrations (filename) VALUES ('047_ocs_detection.sql')
ON CONFLICT (filename) DO NOTHING;
