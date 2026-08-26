-- Adds an archive state to protests, distinct from delete. A protest
-- that's reached a decision (Upheld/Dismissed/Withdrawn) and is no longer
-- relevant can be archived instead of permanently deleted — archived_at
-- NULL = active (shows in the default list + dashboard count), non-NULL =
-- archived (excluded from both, still viewable via the Archived toggle).
-- Idempotent — safe to re-run.

ALTER TABLE protests ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='protests' AND column_name='archived_at'
  ) THEN RAISE EXCEPTION 'archived_at column not found on protests';
  END IF;
  RAISE NOTICE 'OK: protests.archived_at exists';
END $$;

INSERT INTO schema_migrations (filename) VALUES ('059_protest_archive.sql')
ON CONFLICT (filename) DO NOTHING;
