-- HYC catch-up — same gap as RCYC: migrations 037 and 038 were added to
-- the migrations folder / bootstrap template after HYC's project was
-- already set up, and were never applied to HYC's live project by hand.
-- Not yet confirmed broken on HYC (no report), but the boat-photos bucket
-- and push_subscriptions.role are both prerequisites for features already
-- live in the app, so this is worth running proactively. Run once in the
-- HYC Supabase project's SQL Editor. Fully idempotent.

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
