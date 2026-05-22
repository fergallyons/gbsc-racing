-- Migration 023 revoked UPDATE on race_records while restoring immutable
-- table grants, but migration 006 had deliberately added UPDATE so that
-- auto-save could upsert the record as crew payments are collected.
-- Without UPDATE, sbSaveRaceRecord() silently fails after the first INSERT,
-- leaving the RO fees report with stale or missing data.
--
-- Restore UPDATE so that the auto-save upsert (on_conflict boat_id,race_key
-- with merge-duplicates) works correctly.

GRANT UPDATE ON race_records TO anon;

-- Ensure the update policy from migration 006 is still in place
DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);
