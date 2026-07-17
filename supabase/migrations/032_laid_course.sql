-- Laid Course support: RO picks a course SHAPE (windward-leeward, triangle,
-- olympic) instead of fixed marks, for races where marks are laid on the
-- day with no known coordinates. Idempotent.

ALTER TABLE published_courses
  ADD COLUMN IF NOT EXISTS course_type text
    CHECK (course_type IN ('windward_leeward','triangle','olympic')),
  ADD COLUMN IF NOT EXISTS laps int;
