-- "Olympic" was never a real Appendix S course type — it's not defined
-- anywhere in the current (2025-2028) Racing Rules of Sailing, and the
-- shape the app drew for it (Windward-Wing-Leeward-Windward-Finish)
-- didn't correspond to anything real, which is why it read as confusing.
-- Replaced with Trapezoid, a genuine course type used at dinghy events:
-- windward leg, reach to a spreader/offset mark, leeward leg, then a
-- reach finish. See chat 2026-07-24.
--
-- Renames any already-published 'olympic' course rows before widening the
-- constraint (can't have rows violating a constraint that no longer
-- allows the old value), then rebuilds the CHECK — looked up by its
-- actual auto-generated name rather than guessed, same as migration 043's
-- fix for race_starts.class_flag, since this one was also created inline/
-- unnamed. Idempotent.

UPDATE published_courses SET course_type='trapezoid' WHERE course_type='olympic';

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'published_courses'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%course_type%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE published_courses DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE published_courses ADD CONSTRAINT published_courses_course_type_check
  CHECK (course_type IN ('windward_leeward','triangle','trapezoid'));

INSERT INTO schema_migrations (filename) VALUES ('044_rename_olympic_to_trapezoid.sql')
ON CONFLICT (filename) DO NOTHING;
