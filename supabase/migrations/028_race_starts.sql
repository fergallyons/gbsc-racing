-- Start sequence simulator — for when there's no RO on the line, crew see
-- the flag/countdown sequence in the app instead. The RO arms a start with
-- a time + flag system (P/U/Black) + class flag (E/0/1/2); every boat's
-- app independently renders the warning/preparatory/one-minute/starting
-- signals off its own device clock once it has this row — no further
-- server involvement needed during the countdown itself.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS race_starts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  start_time  timestamptz NOT NULL,
  flag_system text NOT NULL DEFAULT 'P' CHECK (flag_system IN ('P','U','Black')),
  class_flag  text NOT NULL DEFAULT 'E' CHECK (class_flag IN ('E','0','1','2')),
  status      text NOT NULL DEFAULT 'armed' CHECK (status IN ('armed','cancelled')),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS race_starts_status_idx ON race_starts(status, start_time);

ALTER TABLE race_starts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_starts_select" ON race_starts;
DROP POLICY IF EXISTS "race_starts_insert" ON race_starts;
DROP POLICY IF EXISTS "race_starts_update" ON race_starts;
DROP POLICY IF EXISTS "race_starts_delete" ON race_starts;
CREATE POLICY "race_starts_select" ON race_starts FOR SELECT USING (true);
CREATE POLICY "race_starts_insert" ON race_starts FOR INSERT WITH CHECK (start_time IS NOT NULL);
CREATE POLICY "race_starts_update" ON race_starts FOR UPDATE USING (true);
CREATE POLICY "race_starts_delete" ON race_starts FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON race_starts TO anon;
GRANT USAGE, SELECT ON SEQUENCE race_starts_id_seq TO anon;
