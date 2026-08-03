-- Sponsor logo/name/link config, keyed by a regex matched against the
-- race label (see showSponsor() in app.js). Was CLUB_CONFIG_<SLUG>.sponsors
-- (a Netlify env var) — moved here after adding one sponsor there pushed
-- GBSC's combined env vars over AWS Lambda's 4KB total-size limit and
-- silently broke every subsequent deploy (chat 2026-08-03; the build
-- failure only surfaces during the actual Lambda packaging stage, not
-- compilation, so it wasn't obvious from the error summary alone).
--
-- DB-based also means an RO can change sponsors without a code deploy at
-- all, unlike the env-var version ever did — matches settings.features'
-- existing pattern for exactly this reason. Idempotent.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS sponsors jsonb NOT NULL DEFAULT '[]'::jsonb;

-- settings has column-level (not table-level) anon grants as of migration
-- 045 — a bare table-level GRANT here would be a silent no-op, same trap
-- that migration documents. This column needs its own explicit grant.
GRANT SELECT (sponsors) ON settings TO anon;
GRANT UPDATE (sponsors) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('050_settings_sponsors.sql')
ON CONFLICT (filename) DO NOTHING;
