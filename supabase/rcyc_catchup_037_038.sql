-- RCYC catch-up — migrations 037 and 038 were added after RCYC's last
-- confirmed schema_migrations check (036, on 2026-07-20) and were never
-- applied to RCYC's live project. This is the direct cause of the boat
-- photo upload 400 error: the boat-photos Storage bucket doesn't exist
-- yet. Run this once in the RCYC Supabase project's SQL Editor.
-- Fully idempotent — safe to run even if part of it already applied.

-- 037 — boat photos Storage bucket + policies + boats.photo_url column
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

-- 038 — push_subscriptions role column (skipper/crew/ro), with backfill
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'skipper'
    CHECK (role IN ('skipper','crew','ro'));

UPDATE push_subscriptions SET role='ro' WHERE boat_id IS NULL AND role='skipper';

INSERT INTO schema_migrations (filename) VALUES
  ('037_boat_photos.sql'),
  ('038_push_subscriptions_role.sql')
ON CONFLICT (filename) DO NOTHING;
