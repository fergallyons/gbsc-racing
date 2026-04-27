-- ============================================================
-- Migration 006: Make race_records upsertable
-- Enables continuous auto-save of race fees as payments are
-- marked, replacing the manual Submit button flow.
-- ============================================================

-- 1. Add race_key column (used as part of the unique upsert key)
ALTER TABLE race_records ADD COLUMN IF NOT EXISTS race_key text DEFAULT '';

-- 2. Populate race_key for any existing rows
UPDATE race_records
SET race_key = to_char(race_date, 'YYYY-MM-DD') || '_' ||
  lower(regexp_replace(race_name, '[^a-zA-Z0-9]', '', 'g'))
WHERE race_key = '' OR race_key IS NULL;

-- 3. Unique constraint so upsert on (boat_id, race_key) works
ALTER TABLE race_records
  DROP CONSTRAINT IF EXISTS race_records_boat_race_unique;
ALTER TABLE race_records
  ADD CONSTRAINT race_records_boat_race_unique UNIQUE (boat_id, race_key);

-- 4. Allow UPDATE — previously insert-only; now updated on every payment change
DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);
GRANT UPDATE ON race_records TO anon;
