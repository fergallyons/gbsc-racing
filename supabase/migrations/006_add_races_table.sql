-- Migration 006: races table — replaces hardcoded schedule in app.js
-- Each club manages their own race calendar in this table.
-- The RO can add, edit, and cancel races in-app.

CREATE TABLE IF NOT EXISTS races (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text    NOT NULL,             -- full display name, e.g. "McSwiggans Series — Wed Apr 8"
  race_date   date    NOT NULL,             -- date only; time is stored separately
  start_hour  int     NOT NULL DEFAULT 19,  -- local hour (24h)
  start_min   int     NOT NULL DEFAULT 0,
  series      text    NOT NULL DEFAULT '',  -- group label, e.g. "Wednesday Night Racing", "King of the Bay"
  active      boolean NOT NULL DEFAULT true,-- false = cancelled / hidden
  sort_order  int     NOT NULL DEFAULT 0,   -- for display ordering within a series
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS races_date_idx  ON races(race_date);
CREATE INDEX IF NOT EXISTS races_active_idx ON races(active);

ALTER TABLE races ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can see the race schedule
CREATE POLICY "races_select" ON races FOR SELECT USING (true);

-- Insert/update/delete: open for anon (RO is anon role until Auth is added)
CREATE POLICY "races_insert" ON races FOR INSERT WITH CHECK (
  label <> '' AND race_date IS NOT NULL
);
CREATE POLICY "races_update" ON races FOR UPDATE USING (true);
CREATE POLICY "races_delete" ON races FOR DELETE USING (true);
