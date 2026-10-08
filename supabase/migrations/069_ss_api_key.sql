-- Sail Scoring API key (Bearer token for app.sailscoring.ie/api/v1), issued
-- per club by Sail Scoring. Same write-only pattern as hal_api_key (068):
-- anon can UPDATE but not SELECT it, so it can't be read back out of the
-- browser with the public anon key. Only the sailscoring-api Netlify function
-- reads it, using the club's service key. The generated ss_api_key_set flag is
-- SELECT-able so a future Sail Scoring Setup field can show "key saved" without
-- ever seeing the key itself.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ss_api_key text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ss_api_key_set boolean
  GENERATED ALWAYS AS (ss_api_key IS NOT NULL AND ss_api_key <> '') STORED;

GRANT UPDATE (ss_api_key) ON settings TO anon;
GRANT SELECT (ss_api_key_set) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('069_ss_api_key.sql')
ON CONFLICT (filename) DO NOTHING;
