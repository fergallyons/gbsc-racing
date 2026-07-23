-- Add Tango (T) and Whiskey (W) as additional class flag options, alongside
-- the existing E/0/1/2 — RO wants more class flags available for start
-- sequences with more than 4 classes. See chat 2026-07-24.
--
-- Drops whatever the existing class_flag CHECK constraint is actually named
-- (it was created inline without an explicit name, so relying on Postgres's
-- default naming convention is fragile) and re-adds it with the wider list.
-- Idempotent — safe to re-run.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'race_starts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%class_flag%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE race_starts DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE race_starts ADD CONSTRAINT race_starts_class_flag_check
  CHECK (class_flag IN ('E','0','1','2','T','W'));

INSERT INTO schema_migrations (filename) VALUES ('043_race_starts_more_class_flags.sql')
ON CONFLICT (filename) DO NOTHING;
