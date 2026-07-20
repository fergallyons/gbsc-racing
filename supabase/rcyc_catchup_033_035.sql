-- RCYC catch-up — confirmed missing via a live read-only check against RCYC's
-- own DB on 2026-07-20. Covers migrations 033, 035, and a safety re-run of
-- 031 (can't be verified read-only, but idempotent either way). Run in the
-- RCYC Supabase project's SQL Editor.

-- 033 — sail number per boat (needed for Finish Recording's HalSail CSV export)
ALTER TABLE boats ADD COLUMN IF NOT EXISTS sail_number text NOT NULL DEFAULT '';

-- 035 — crew.is_guest flag (needed for the Guest payment feature).
-- 034 never ran on RCYC, so there's no leftover duplicate constraint to clean
-- up first — this applies cleanly in one pass.
UPDATE crew SET type='visitor' WHERE type='guest';

DO $$
DECLARE
  r record;
  col_attnum smallint;
BEGIN
  SELECT attnum INTO col_attnum FROM pg_attribute
    WHERE attrelid = 'crew'::regclass AND attname = 'type';

  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'crew'::regclass
      AND con.contype = 'c'
      AND col_attnum = ANY(con.conkey)
  LOOP
    EXECUTE format('ALTER TABLE crew DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE crew ADD CONSTRAINT crew_type_check
  CHECK (type IN ('full','crew','student','visitor','kid'));

ALTER TABLE crew ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

-- 031 (safety re-run) — widen marks_insert bounds to cover Cork Harbour.
-- Idempotent (DROP IF EXISTS + CREATE) — harmless if this already ran.
DROP POLICY IF EXISTS "marks_insert" ON marks;
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 51.0 AND 55.5
  AND lng BETWEEN -11.0 AND -5.5
);
