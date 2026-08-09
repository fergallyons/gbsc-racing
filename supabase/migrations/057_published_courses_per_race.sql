-- Lets an RO publish a DIFFERENT course per race instead of one club-wide
-- 'current' row shared by every fleet racing that night. Built for MSC,
-- which runs Cruisers and Ruffians as separate simultaneous races (races
-- table, migration 053) — today's single global course means one fleet's
-- marks silently overwrite the other's the moment either RO hits Publish.
--
-- New id shapes the app introduces: 'race_<races.id>' (live, visible to
-- skippers) and 'draft_race_<races.id>' (RO's in-progress edit, invisible
-- to skippers — same idea as the existing global 'draft'). The literal
-- 'current'/'draft' rows are untouched and keep working exactly as today
-- for any club/race that doesn't use this.
--
-- race_id is a convenience FK for data hygiene and future queries only —
-- the app always resolves a course by constructing the 'race_<id>' string
-- client-side (it already holds races.id in memory), never by filtering
-- on this column. ON DELETE SET NULL rather than CASCADE: deleting a race
-- should not destroy course history; an orphaned race_id=NULL row with a
-- still-race-shaped id is inert (never re-fetched, since no live race has
-- that id anymore) — the same no-janitorial-cleanup philosophy already
-- applied to 'current'/'draft' rows, which are also never deleted, only
-- overwritten or superseded.
--
-- CRITICAL FIX bundled into this migration: the original courses_insert
-- policy (unchanged since before the migrations/ system existed — not
-- touched by 013_published_courses_upsertable.sql, which only widened
-- UPDATE) is `WITH CHECK (id = 'current')`. A race's course row does not
-- exist until its first-ever publish/draft-save, so that first write is
-- always a plain INSERT (nothing to upsert-conflict against yet) — every
-- per-race id this feature introduces needs the widened check below, or
-- every first publish for every race 403s.
--
-- Also adding a real DELETE policy: DELETE has been GRANTed on this table
-- since original creation but no POLICY has ever existed for it (RLS
-- defaults to "no rows visible" with zero permissive policies), so
-- publishCourse()'s existing "delete the old draft row after publish"
-- call (app.js) has never actually removed anything. This migration's
-- per-race draft cleanup needs a working DELETE, so we add the policy —
-- which also fixes that pre-existing no-op for the legacy 'draft' row,
-- at no extra cost.
--
-- Idempotent — safe to re-run.

ALTER TABLE published_courses ADD COLUMN IF NOT EXISTS race_id bigint REFERENCES races(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "courses_insert" ON published_courses;
CREATE POLICY "courses_insert" ON published_courses FOR INSERT WITH CHECK (
  id = 'current' OR id = 'draft' OR id ~ '^(draft_)?race_[0-9]+$'
);

DROP POLICY IF EXISTS "courses_delete" ON published_courses;
CREATE POLICY "courses_delete" ON published_courses FOR DELETE USING (true);

INSERT INTO schema_migrations (filename) VALUES ('057_published_courses_per_race.sql')
ON CONFLICT (filename) DO NOTHING;
