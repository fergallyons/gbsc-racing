-- ============================================================
-- Migration 058: Day-scoped fee/payment identity
-- Run this entire script in the Supabase SQL Editor.
-- It is idempotent — safe to re-run if a previous attempt
-- partially succeeded.
--
-- Why: fee identity has always been keyed per RACE (boat_id/crew_id +
-- race_key, where race_key = date + slugified race label). That silently
-- assumed one race per calendar day, which held for every club until this
-- week — GBSC's "Expert Forklifts October Series" runs two real races per
-- Sunday, and crews pay ONCE per day regardless of race count. Re-keys
-- race_records/self_payments/race_payments onto the already-populated
-- race_date column instead — no new column, no race_days FK (race_days.id
-- is unreliable/unpopulated on historical rows, see 054's own comment).
-- race_attendees and registrations are deliberately NOT touched here —
-- attendance/outings tracking is legitimately per-race even when the fee
-- isn't, and both stay keyed on race_key exactly as before.
--
-- GBSC-only: each club runs its own separate Supabase project, so running
-- this against GBSC's project cannot touch RCYC/HYC/IS/demo data. app.js's
-- SCHEMA_HAS_DAY_SCOPED_PAYMENTS flag (set once this migration's filename
-- appears in schema_migrations) keeps every other club's code path on the
-- old per-race behavior with zero change, exactly as every other
-- SCHEMA_HAS_* flag in this codebase already works.
-- ============================================================


-- ── Step 1: Dedupe race_records onto (boat_id, race_date), keep latest ──
-- Two known real duplicates exist today (both already root-caused this
-- session): outoftheblue/2026-04-22 (a pre-dates-the-20-char-slice-change
-- key format artifact) and — in race_payments below — a direct leftover
-- of the "GM Series"→"Galway Maritime Series" mid-season rename. In both
-- cases the later row is a superset of the earlier one, so ORDER BY
-- submitted_at/paid_at DESC keeping the first is the correct rule, not
-- just a safe default.
DELETE FROM race_records
WHERE id NOT IN (
  SELECT DISTINCT ON (boat_id, race_date) id
  FROM race_records
  ORDER BY boat_id, race_date, submitted_at DESC
);

DO $$ DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT boat_id, race_date FROM race_records
    GROUP BY boat_id, race_date HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Step 1 FAILED: % duplicate (boat_id, race_date) groups remain in race_records', dup_count;
  END IF;
  RAISE NOTICE 'Step 1 OK: race_records has no duplicate (boat_id, race_date) rows';
END $$;


-- ── Step 2: Dedupe self_payments onto (crew_id, race_date), keep latest ──
DELETE FROM self_payments
WHERE id NOT IN (
  SELECT DISTINCT ON (crew_id, race_date) id
  FROM self_payments
  ORDER BY crew_id, race_date, paid_at DESC
);

DO $$ DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT crew_id, race_date FROM self_payments
    GROUP BY crew_id, race_date HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Step 2 FAILED: % duplicate (crew_id, race_date) groups remain in self_payments', dup_count;
  END IF;
  RAISE NOTICE 'Step 2 OK: self_payments has no duplicate (crew_id, race_date) rows';
END $$;


-- ── Step 3: Dedupe race_payments onto (crew_id, race_date), keep latest ──
DELETE FROM race_payments
WHERE id NOT IN (
  SELECT DISTINCT ON (crew_id, race_date) id
  FROM race_payments
  ORDER BY crew_id, race_date, paid_at DESC
);

DO $$ DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT crew_id, race_date FROM race_payments
    GROUP BY crew_id, race_date HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Step 3 FAILED: % duplicate (crew_id, race_date) groups remain in race_payments', dup_count;
  END IF;
  RAISE NOTICE 'Step 3 OK: race_payments has no duplicate (crew_id, race_date) rows';
END $$;


-- ── Step 4: Retarget race_records' unique constraint ─────────
-- Constraint name is known (added by migration 006).
ALTER TABLE race_records DROP CONSTRAINT IF EXISTS race_records_boat_race_unique;
ALTER TABLE race_records ADD CONSTRAINT race_records_boat_date_unique UNIQUE (boat_id, race_date);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='race_records' AND constraint_name='race_records_boat_date_unique' AND constraint_type='UNIQUE'
  ) THEN RAISE EXCEPTION 'Step 4 FAILED: race_records_boat_date_unique not found';
  END IF;
  RAISE NOTICE 'Step 4 OK: race_records is now unique on (boat_id, race_date)';
END $$;


-- ── Step 5: Retarget self_payments' unique constraint ────────
-- This table predates the numbered-migration system, so its unique
-- constraint's name was never pinned down anywhere in this codebase —
-- look it up rather than guess Postgres's default-naming convention.
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'self_payments'::regclass AND contype = 'u'
  LIMIT 1;
  IF con_name IS NULL THEN
    RAISE EXCEPTION 'Step 5 FAILED: no existing UNIQUE constraint found on self_payments — expected one on (crew_id, race_key)';
  END IF;
  EXECUTE 'ALTER TABLE self_payments DROP CONSTRAINT ' || quote_ident(con_name);
  ALTER TABLE self_payments ADD CONSTRAINT self_payments_crew_date_unique UNIQUE (crew_id, race_date);
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='self_payments' AND constraint_name='self_payments_crew_date_unique' AND constraint_type='UNIQUE'
  ) THEN RAISE EXCEPTION 'Step 5 verify FAILED: self_payments_crew_date_unique not found';
  END IF;
  RAISE NOTICE 'Step 5 OK: self_payments is now unique on (crew_id, race_date)';
END $$;


-- ── Step 6: Retarget race_payments' unique constraint ─────────
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'race_payments'::regclass AND contype = 'u'
  LIMIT 1;
  IF con_name IS NULL THEN
    RAISE EXCEPTION 'Step 6 FAILED: no existing UNIQUE constraint found on race_payments — expected one on (crew_id, race_key)';
  END IF;
  EXECUTE 'ALTER TABLE race_payments DROP CONSTRAINT ' || quote_ident(con_name);
  ALTER TABLE race_payments ADD CONSTRAINT race_payments_crew_date_unique UNIQUE (crew_id, race_date);
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='race_payments' AND constraint_name='race_payments_crew_date_unique' AND constraint_type='UNIQUE'
  ) THEN RAISE EXCEPTION 'Step 6 verify FAILED: race_payments_crew_date_unique not found';
  END IF;
  RAISE NOTICE 'Step 6 OK: race_payments is now unique on (crew_id, race_date)';
END $$;


-- ── Step 7: Record this migration ─────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('058_day_scoped_race_payments.sql')
ON CONFLICT (filename) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 058 complete — race_records/self_payments/race_payments are now day-scoped';
END $$;
