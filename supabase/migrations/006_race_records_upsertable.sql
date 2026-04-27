-- ============================================================
-- Migration 006: Make race_records upsertable
-- Run this entire script in the Supabase SQL Editor.
-- It is idempotent — safe to re-run if a previous attempt
-- partially succeeded.
-- ============================================================


-- ── Step 1: Add race_key column if it doesn't exist ──────────
ALTER TABLE race_records ADD COLUMN IF NOT EXISTS race_key text DEFAULT '';

-- Verify
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='race_records' AND column_name='race_key'
  ) THEN RAISE EXCEPTION 'Step 1 FAILED: race_key column not found';
  END IF;
  RAISE NOTICE 'Step 1 OK: race_key column exists';
END $$;


-- ── Step 2: Populate race_key for any rows that lack it ──────
UPDATE race_records
SET race_key = to_char(race_date, 'YYYY-MM-DD') || '_' ||
  lower(regexp_replace(race_name, '[^a-zA-Z0-9]', '', 'g'))
WHERE race_key = '' OR race_key IS NULL;

-- Verify
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM race_records WHERE race_key = '' OR race_key IS NULL) THEN
    RAISE EXCEPTION 'Step 2 FAILED: some rows still have empty race_key';
  END IF;
  RAISE NOTICE 'Step 2 OK: all race_key values populated';
END $$;


-- ── Step 3: Remove duplicate rows, keep latest per (boat_id, race_key) ──
DELETE FROM race_records
WHERE id NOT IN (
  SELECT DISTINCT ON (boat_id, race_key) id
  FROM race_records
  ORDER BY boat_id, race_key, submitted_at DESC
);

-- Verify
DO $$ DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT boat_id, race_key, COUNT(*) AS n
    FROM race_records
    GROUP BY boat_id, race_key
    HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Step 3 FAILED: % duplicate (boat_id, race_key) groups remain', dup_count;
  END IF;
  RAISE NOTICE 'Step 3 OK: no duplicate rows remain';
END $$;


-- ── Step 4: Add unique constraint ────────────────────────────
ALTER TABLE race_records
  DROP CONSTRAINT IF EXISTS race_records_boat_race_unique;
ALTER TABLE race_records
  ADD CONSTRAINT race_records_boat_race_unique UNIQUE (boat_id, race_key);

-- Verify
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='race_records'
      AND constraint_name='race_records_boat_race_unique'
      AND constraint_type='UNIQUE'
  ) THEN RAISE EXCEPTION 'Step 4 FAILED: unique constraint not found';
  END IF;
  RAISE NOTICE 'Step 4 OK: unique constraint race_records_boat_race_unique exists';
END $$;


-- ── Step 5: Add UPDATE policy and grant ──────────────────────
DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);
GRANT UPDATE ON race_records TO anon;

-- Verify
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='race_records' AND policyname='race_records_update'
  ) THEN RAISE EXCEPTION 'Step 5 FAILED: race_records_update policy not found';
  END IF;
  RAISE NOTICE 'Step 5 OK: UPDATE policy and grant applied';
END $$;


-- ── All done ─────────────────────────────────────────────────
RAISE NOTICE '✅ Migration 006 complete — race_records is now upsertable on (boat_id, race_key)';
