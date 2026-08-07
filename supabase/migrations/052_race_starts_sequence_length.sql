-- Alternative, shorter start-sequence length — 3 minutes (warning/prep/one-
-- minute/start compressed proportionally) alongside the existing fixed
-- 5-minute (5-4-1-0) RRS Rule 26 sequence, selectable per start. Requested
-- alongside multi-fleet support (051_fleets.sql) since a club running
-- several fleets back-to-back often wants a tighter sequence to fit the
-- night, but this has no dependency on fleets existing — any club can use
-- it. Idempotent — safe to re-run.

ALTER TABLE race_starts ADD COLUMN IF NOT EXISTS sequence_mins int NOT NULL DEFAULT 5;

ALTER TABLE race_starts DROP CONSTRAINT IF EXISTS race_starts_sequence_mins_check;
ALTER TABLE race_starts ADD CONSTRAINT race_starts_sequence_mins_check
  CHECK (sequence_mins IN (3,5));

INSERT INTO schema_migrations (filename) VALUES ('052_race_starts_sequence_length.sql')
ON CONFLICT (filename) DO NOTHING;
