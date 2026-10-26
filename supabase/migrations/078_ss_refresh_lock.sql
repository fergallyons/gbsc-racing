-- One Sail Scoring token renewal at a time per club (076's ss_connection).
-- Every renewal hands back a new refresh token and retires the old one, and
-- Sail Scoring treats a retired refresh token presented again as stolen:
-- it ends every grant the account gave RaceOps (docs/public-api.md,
-- "Getting access"). Two Netlify functions renewing at once would do
-- exactly that, so _sailscoring.js claims this lock (a conditional update)
-- before renewing, and anyone else waits for the new token instead.
-- Idempotent.

ALTER TABLE ss_connection ADD COLUMN IF NOT EXISTS refresh_lock_until timestamptz;
-- When the refresh token was last renewed — the keep-alive job renews
-- before the 180-day limit even when nobody has used the app
ALTER TABLE ss_connection ADD COLUMN IF NOT EXISTS refreshed_at timestamptz;

INSERT INTO schema_migrations (filename) VALUES ('078_ss_refresh_lock.sql')
ON CONFLICT (filename) DO NOTHING;
