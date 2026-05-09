-- Make published_courses fully upsertable and add all extended columns.
--
-- Covers two gaps:
-- 1. The table was created before migrations existed — no UPDATE policy/grant.
--    merge-duplicates (upsert on id='current') requires UPDATE; without it PostgREST returns 403.
-- 2. start_line_id / finish_line_id added by 20260421_start_finish_lines.sql may not have been run.
--    course_number / rounds added by 010_course_card_and_series_fees.sql may not have been run.
--    Without these columns PostgREST rejects the payload with 400.
--
-- Idempotent — safe to re-run.

-- start_finish_lines table (needed for loadLines() and as a reference store)
create table if not exists start_finish_lines (
  id          text primary key,
  name        text not null,
  lat1        double precision not null,
  lng1        double precision not null,
  lat2        double precision not null,
  lng2        double precision not null,
  is_default  boolean default false,
  is_active   boolean default true,
  sort_order  integer default 0
);

alter table start_finish_lines enable row level security;

drop policy if exists "anon read lines"   on start_finish_lines;
drop policy if exists "anon insert lines" on start_finish_lines;
drop policy if exists "anon update lines" on start_finish_lines;
drop policy if exists "anon delete lines" on start_finish_lines;
create policy "anon read lines"   on start_finish_lines for select using (true);
create policy "anon insert lines" on start_finish_lines for insert with check (true);
create policy "anon update lines" on start_finish_lines for update using (true);
create policy "anon delete lines" on start_finish_lines for delete using (true);
grant select, insert, update, delete on start_finish_lines to anon;

-- Ensure all published_courses extended columns exist
alter table published_courses
  add column if not exists start_line_id  text default 'club',
  add column if not exists finish_line_id text default 'club',
  add column if not exists course_number  int,
  add column if not exists rounds         jsonb;

-- Add UPDATE policy and grant (needed for merge-duplicates upsert)
drop policy if exists "anon_update_published_courses" on published_courses;
create policy "anon_update_published_courses" on published_courses
  for update to anon using (true);

grant update on published_courses to anon;
