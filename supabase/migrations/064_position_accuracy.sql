-- Race Tracker: capture each position ping's own GPS accuracy (metres) —
-- both sources already have this available and were just discarding it.
-- The browser's Geolocation API hands back pos.coords.accuracy on every fix
-- (see onTrackPosition() in app.js); Traccar Client's OsmAnd-protocol ping
-- carries the same thing as a plain "accuracy" query param (see
-- agent-ingest.js). Lets the tracking sailor see "is this actually working"
-- instead of silently hoping — see chat 2026-09-16 (SailPro competitive
-- review, recommendation #5).
--
-- No grant changes needed: race_positions kept its original table-level
-- `GRANT SELECT, INSERT ON race_positions TO anon` (migration 039) — unlike
-- boats/settings, it was never narrowed to column-level grants (045), so a
-- new column is covered automatically.

ALTER TABLE race_positions ADD COLUMN IF NOT EXISTS accuracy double precision;

INSERT INTO schema_migrations (filename) VALUES ('064_position_accuracy.sql')
ON CONFLICT (filename) DO NOTHING;
