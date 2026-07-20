-- Boat photos: a public Storage bucket for skipper-uploaded boat photos,
-- shown on the Boat Profile panel (Skipper view only). Same anon-key trust
-- model as every other table in this app — there's no per-user auth, so no
-- per-boat upload restriction either; any anon can upload/overwrite, same
-- as boats/crew/marks already work. Idempotent.

INSERT INTO storage.buckets (id, name, public)
VALUES ('boat-photos', 'boat-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "boat_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "boat_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "boat_photos_update" ON storage.objects;
CREATE POLICY "boat_photos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'boat-photos');
CREATE POLICY "boat_photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'boat-photos');
CREATE POLICY "boat_photos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'boat-photos');

ALTER TABLE boats ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '';

INSERT INTO schema_migrations (filename) VALUES ('037_boat_photos.sql')
ON CONFLICT (filename) DO NOTHING;
