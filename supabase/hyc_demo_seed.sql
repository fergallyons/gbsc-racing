-- HYC demo seed — ONE obviously-fake boat + race so you can click through
-- the app before real fleet/race data exists. Safe to run after
-- hyc_bootstrap.sql. Delete statements to remove it are at the bottom —
-- run those before going live with real club data.

INSERT INTO boats (id, name, icon, pin, revolut_user)
VALUES ('hyc-demo-boat', 'TEST BOAT (delete me)', '⛵', '0000', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crew (id, boat_id, first, last, type, join_year, outings)
VALUES ('hyc-demo-crew-1', 'hyc-demo-boat', 'Test', 'Skipper', 'full', 2026, 0)
ON CONFLICT (id) DO NOTHING;

-- races has no natural unique key (auto-increment id only), so guard
-- against duplicate inserts on re-run with a WHERE NOT EXISTS check.
INSERT INTO races (label, race_date, start_hour, start_min, series, active, sort_order)
SELECT 'TEST RACE (delete me)', CURRENT_DATE + 7, 18, 0, '', true, 0
WHERE NOT EXISTS (SELECT 1 FROM races WHERE label = 'TEST RACE (delete me)');

-- ============================================================
-- To remove this demo data before going live, run:
--
-- DELETE FROM races WHERE label = 'TEST RACE (delete me)';
-- DELETE FROM crew WHERE id = 'hyc-demo-crew-1';
-- DELETE FROM boats WHERE id = 'hyc-demo-boat';
-- ============================================================
