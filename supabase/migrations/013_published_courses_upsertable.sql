-- Make published_courses upsertable by the anon role.
-- The table was created before migrations existed and has no UPDATE policy/grant.
-- merge-duplicates (upsert on id='current') requires UPDATE privilege; without it
-- PostgREST returns 403 and sbSaveCourse returns false.
--
-- Also re-applies the course-card columns from 010 (idempotent — safe to re-run).

-- Ensure course card columns exist (idempotent)
alter table published_courses
  add column if not exists course_number int references course_card_courses(number),
  add column if not exists rounds jsonb;

-- Add UPDATE policy (drop first so re-running is safe)
drop policy if exists "anon_update_published_courses" on published_courses;
create policy "anon_update_published_courses" on published_courses
  for update to anon using (true);

-- Grant UPDATE to anon
grant update on published_courses to anon;
