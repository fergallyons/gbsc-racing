-- When the app's race list last synced with Sail Scoring (_sssync.js). Sail
-- Scoring's database sleeps when idle and every signed-in call wakes it, so
-- syncing goes by how near racing is rather than a fixed beat: every few
-- hours around a race day, daily with racing in the next fortnight, weekly
-- otherwise (ss-sync.js) — plus once when an RO opens the app and it's
-- been a while (ss-ro.js 'sync' with maxAgeMinutes). This is the shared
-- clock both go by. Server-only, like the rest of ss_connection (076).
-- Idempotent.

ALTER TABLE ss_connection ADD COLUMN IF NOT EXISTS synced_at timestamptz;

INSERT INTO schema_migrations (filename) VALUES ('080_ss_synced_at.sql')
ON CONFLICT (filename) DO NOTHING;
