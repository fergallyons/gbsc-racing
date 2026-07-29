-- How far back from the bow a boat's tracked phone typically sits, in
-- metres. RRS 29.1 (OCS) and finish-line crossing both care about the
-- hull, not wherever the crew happens to be standing — a phone in the
-- cockpit can trail the bow by several metres, enough to matter against a
-- line. detect-finishes.js projects each GPS ping forward along its own
-- heading by this distance before running any crossing/course-side check
-- — see _geometry.js's offsetToBow(). Null/0 (the default — most boats
-- won't set this) means "use the raw GPS position unchanged", so this is
-- fully backward compatible. Idempotent.

ALTER TABLE boats ADD COLUMN IF NOT EXISTS bow_offset_m double precision;
ALTER TABLE boats DROP CONSTRAINT IF EXISTS boats_bow_offset_m_check;
ALTER TABLE boats ADD CONSTRAINT boats_bow_offset_m_check
  CHECK (bow_offset_m IS NULL OR (bow_offset_m >= 0 AND bow_offset_m <= 30));

-- boats has column-level (not table-level) anon grants as of migration 045
-- — a bare table-level GRANT here would be a silent no-op, same trap that
-- migration documents. This column needs its own explicit grant.
GRANT SELECT (bow_offset_m) ON boats TO anon;
GRANT UPDATE (bow_offset_m) ON boats TO anon;

INSERT INTO schema_migrations (filename) VALUES ('048_bow_offset.sql')
ON CONFLICT (filename) DO NOTHING;
