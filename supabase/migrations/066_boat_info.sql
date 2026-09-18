-- Boat Info: a free-text (markdown) repository of crew-facing information
-- per boat — safety gear locations, engine start procedure, WiFi code,
-- house rules, whatever a skipper wants their crew to have on hand. Edited
-- by the skipper (needs the boat PIN, same as everything else skipper-side);
-- viewing it does NOT need the PIN by default off, but the skipper can flip
-- info_public on to also show it from the public/crew "Starting Line" boat
-- summary sheet (openBoatSummary() in app.js) — no login needed there at all.
--
-- info_public is a UI-level gate, not a real security boundary — same
-- caveat that already applies to every other PIN in this app (see
-- docs/FEATURE_SPEC.md §10: "PINs are a light deterrent... not a security
-- boundary in the traditional sense"). Both columns are anon-SELECT/UPDATE
-- (below), so info_md is technically fetchable directly regardless of
-- info_public — the flag controls what the APP shows, matching how
-- everything else here already works.

ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS info_md text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS info_public boolean NOT NULL DEFAULT false;

-- Additive grants — boats already narrowed anon to a column allowlist
-- (045_fix_column_privilege_revokes.sql), so a bare table-level GRANT here
-- would silently do nothing for a column that isn't already on that list.
GRANT SELECT (info_md, info_public) ON boats TO anon;
GRANT UPDATE (info_md, info_public) ON boats TO anon;

INSERT INTO schema_migrations (filename) VALUES ('066_boat_info.sql')
ON CONFLICT (filename) DO NOTHING;
