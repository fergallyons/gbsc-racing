-- Club branding editable in the app (Club Settings → Branding): the club
-- logo is UPLOADED to a public Storage bucket, and the logo URL plus the
-- primary and RO colours are written to settings. These columns have existed
-- since 020 (and anon can already SELECT them — 045's list), but nothing
-- could write them, so branding lived only in the CLUB_CONFIG_<SLUG> env var.
-- From this migration the DB value wins over the env var everywhere
-- (netlify/edge-functions/lib/branding.js); the env var is only the default
-- for a club that hasn't set its own.
--
-- Same open-upload trust model as the boat-photos bucket (037): the Club
-- Settings sheet is behind the RO/Admin PIN in the UI. The bucket is capped
-- at 2 MB and image types only, so it can't be used as general file hosting.
-- Idempotent.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-assets', 'club-assets', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "club_assets_select" ON storage.objects;
DROP POLICY IF EXISTS "club_assets_insert" ON storage.objects;
CREATE POLICY "club_assets_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'club-assets');
CREATE POLICY "club_assets_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'club-assets');
-- No UPDATE/DELETE policy: every upload is a new timestamped file (no stale
-- CDN copies), so nothing ever overwrites or removes one from the browser.

GRANT UPDATE (logo_url, favicon_url, primary_color, ro_color) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('070_club_branding.sql')
ON CONFLICT (filename) DO NOTHING;
