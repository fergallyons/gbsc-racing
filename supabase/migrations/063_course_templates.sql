-- Course Templates: an RO can save a course built in the Course Builder
-- (mark-builder or laid-course mode) under a name, then reload it into the
-- builder for a future race instead of rebuilding it from scratch — the
-- "Wednesday windward-leeward" or "usual Cove course" gets built once.
--
-- Deliberately NOT for course-card mode (RCYC-style) — course_card_courses
-- (migration 010) already IS a reusable named library there, seeded once
-- and picked from every week; a second "template" concept over the same
-- idea would just be two ways to do the same thing.
--
-- Modeled on course_card_courses' shape/RLS style rather than
-- published_courses: published_courses.id is a routing key ('current',
-- 'draft', 'race_<id>', 'draft_race_<id>' — see 057), not a free-form name,
-- and its insert policy only accepts those exact id shapes — a template
-- needs its own identity space, not a slot in that one.

CREATE TABLE IF NOT EXISTS course_templates (
  id              bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text              NOT NULL,
  marks           jsonb             NOT NULL DEFAULT '[]',  -- [{id, rounding}, ...] — empty for a laid course
  course_type     text,                                     -- 'windward_leeward' | 'triangle' | 'trapezoid' | null (mark-builder)
  laps            int,
  start_line_id   text,
  finish_line_id  text,
  notes           text,
  created_at      timestamptz       NOT NULL DEFAULT now()
);

ALTER TABLE course_templates ENABLE ROW LEVEL SECURITY;
-- Same open trust model as marks/course_card_courses — a template is RO
-- working data, not anything requiring a security boundary beyond the PIN
-- already gating the Course Builder panel itself.
CREATE POLICY "course_templates_select" ON course_templates FOR SELECT USING (true);
CREATE POLICY "course_templates_insert" ON course_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "course_templates_update" ON course_templates FOR UPDATE USING (true);
CREATE POLICY "course_templates_delete" ON course_templates FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON course_templates TO anon;
GRANT USAGE, SELECT ON SEQUENCE course_templates_id_seq TO anon;

INSERT INTO schema_migrations (filename) VALUES ('063_course_templates.sql')
ON CONFLICT (filename) DO NOTHING;
