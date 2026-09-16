-- "Racing Cancelled" overlay: a single RO-toggled switch (with an optional
-- short note, e.g. "No wind" or "Storm warning") that shows a full-screen
-- notice to every skipper/crew/public viewer next time they open or reload
-- the app, instead of them finding out only by turning up at the club.
--
-- New columns on the existing settings singleton row, following the same
-- narrow, additive column-grant style as every other settings column since
-- 045_fix_column_privilege_revokes.sql locked that table down to an
-- explicit allowlist — a bare table-level GRANT here would be a no-op
-- (REVOKEd already) and, worse, wouldn't even error to say so.
--
-- Deliberately loaded via its own isolated request (see loadRacingCancelled
-- Status() in app.js), NOT folded into SETTINGS_SELECT/fullSelect — an
-- unknown column in that shared select 400s the WHOLE query and silently
-- drops every club back to a much narrower legacy fallback (confirmed live
-- 2026-09-02, see loadRnliRevolutUser()'s comment for the exact incident).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS racing_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS racing_cancelled_note text NOT NULL DEFAULT '';

GRANT SELECT (racing_cancelled, racing_cancelled_note) ON settings TO anon;
GRANT UPDATE (racing_cancelled, racing_cancelled_note) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('065_racing_cancelled.sql')
ON CONFLICT (filename) DO NOTHING;
