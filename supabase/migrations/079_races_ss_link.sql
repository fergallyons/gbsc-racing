-- Races synced from Sail Scoring (netlify/functions/_sssync.js). For a club
-- whose results source is Sail Scoring, the scorer sets up series and races
-- there and the app's race list follows: each synced race carries the Sail
-- Scoring race (and series) it mirrors. Races entered in the app by hand
-- leave these null and behave exactly as before.
-- Readable by anon like every other races column (table-level grant, 018);
-- only the sync, with the service key, sets them.
-- Idempotent.

ALTER TABLE races ADD COLUMN IF NOT EXISTS ss_race_id text;
ALTER TABLE races ADD COLUMN IF NOT EXISTS ss_series_id text;
CREATE UNIQUE INDEX IF NOT EXISTS races_ss_race_id_key ON races(ss_race_id) WHERE ss_race_id IS NOT NULL;

INSERT INTO schema_migrations (filename) VALUES ('079_races_ss_link.sql')
ON CONFLICT (filename) DO NOTHING;
