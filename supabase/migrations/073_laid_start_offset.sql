-- Laid windward-leeward courses: where the start/finish line sits. NULL (as
-- every course so far) = below the leeward mark; a number = above it, that
-- percentage of the way from the leeward mark to the windward mark (e.g.
-- 20 = a fifth of the way up the beat). Stored on published courses and on
-- course templates (063). Idempotent.

ALTER TABLE published_courses
  ADD COLUMN IF NOT EXISTS start_offset_pct int
    CHECK (start_offset_pct IS NULL OR start_offset_pct BETWEEN 1 AND 90);

ALTER TABLE course_templates
  ADD COLUMN IF NOT EXISTS start_offset_pct int
    CHECK (start_offset_pct IS NULL OR start_offset_pct BETWEEN 1 AND 90);

INSERT INTO schema_migrations (filename) VALUES ('073_laid_start_offset.sql')
ON CONFLICT (filename) DO NOTHING;
