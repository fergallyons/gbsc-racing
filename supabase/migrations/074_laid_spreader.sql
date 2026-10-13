-- Laid windward-leeward courses: an optional spreader (offset) mark at the
-- windward end — a short distance (typically ~70 m) to the left of and
-- slightly below the windward mark, so the fleet bears away cleanly after
-- rounding and runs down from the spreader to leeward. Stored on published
-- courses and course templates (063). NULL/false = no spreader. Idempotent.

ALTER TABLE published_courses ADD COLUMN IF NOT EXISTS spreader boolean;
ALTER TABLE course_templates  ADD COLUMN IF NOT EXISTS spreader boolean;

INSERT INTO schema_migrations (filename) VALUES ('074_laid_spreader.sql')
ON CONFLICT (filename) DO NOTHING;
