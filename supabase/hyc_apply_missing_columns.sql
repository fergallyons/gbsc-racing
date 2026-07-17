-- HYC catch-up — hyc_bootstrap.sql was missing two columns that exist on
-- every other club's DB (found via console errors after first login):
--   settings.estella_url   — eStela live-tracking link field
--   race_records.race_key  — needed for the fee-submission upsert to work
-- Safe to re-run. Run this once against HYC's Supabase project.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS estella_url text DEFAULT '';

ALTER TABLE race_records
  ADD COLUMN IF NOT EXISTS race_key text NOT NULL DEFAULT '';

-- Backfill race_key for any rows already submitted (harmless no-op if none exist)
UPDATE race_records
SET race_key = to_char(race_date, 'YYYY-MM-DD') || '_' ||
  lower(regexp_replace(race_name, '[^a-zA-Z0-9]', '', 'g'))
WHERE race_key = '' OR race_key IS NULL;

-- Dedup safety before adding the unique constraint (harmless no-op if none exist)
DELETE FROM race_records
WHERE id NOT IN (
  SELECT DISTINCT ON (boat_id, race_key) id
  FROM race_records
  ORDER BY boat_id, race_key, submitted_at DESC
);

ALTER TABLE race_records DROP CONSTRAINT IF EXISTS race_records_boat_race_unique;
ALTER TABLE race_records ADD CONSTRAINT race_records_boat_race_unique UNIQUE (boat_id, race_key);

DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);
GRANT UPDATE ON race_records TO anon;
