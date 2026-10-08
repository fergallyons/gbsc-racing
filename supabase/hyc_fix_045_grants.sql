-- HYC fix: restore column grants wiped by applying 045 out of order.
--
-- hyc_catchup_038_068.sql (run 2026-10-08) applied 045_fix_column_privilege_
-- revokes.sql AFTER 046–056, which HYC already had. 045 does
-- `REVOKE SELECT, UPDATE ON boats/settings FROM anon` and then grants back a
-- fixed column list written before 048/050/051 existed — so it silently
-- removed the column grants those migrations had added:
--   boats.bow_offset_m (048), boats.fleet_id (051), settings.sponsors (050)
-- The app's boats read names bow_offset_m and fleet_id, so on HYC it failed
-- with "permission denied for table boats" and the boat list came up empty
-- (the settings read falls back to a narrower select, losing sponsors).
--
-- These are exactly the grants 048/050/051 make. Run once in the HYC
-- Supabase project's SQL Editor. Idempotent.
-- (GBSC ran the migrations in order, so it is unaffected.)

BEGIN;

GRANT SELECT (bow_offset_m) ON boats TO anon;
GRANT UPDATE (bow_offset_m) ON boats TO anon;
GRANT SELECT (fleet_id) ON boats TO anon;
GRANT UPDATE (fleet_id) ON boats TO anon;
GRANT SELECT (sponsors) ON settings TO anon;
GRANT UPDATE (sponsors) ON settings TO anon;

COMMIT;

-- Check: all six rows should be listed
SELECT table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE grantee = 'anon'
  AND ((table_name = 'boats' AND column_name IN ('bow_offset_m', 'fleet_id'))
    OR (table_name = 'settings' AND column_name = 'sponsors'))
ORDER BY table_name, column_name, privilege_type;
