-- Halsail is moving its API to require a key. This only provides somewhere to
-- STORE it — nothing reads it yet (the auth scheme Halsail will use isn't
-- known), and the proxy wiring is a separate follow-up.
--
-- Unlike hal_club/worldtides_key, the key is write-only for anon: UPDATE is
-- granted, SELECT deliberately is not, so it can't be read back out of the
-- browser with the public anon key. A server-side function using the service
-- role will be what eventually reads it. The generated hal_api_key_set flag
-- is SELECT-able so the settings panel can show "key saved" without ever
-- seeing the key itself.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS hal_api_key text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hal_api_key_set boolean
  GENERATED ALWAYS AS (hal_api_key IS NOT NULL AND hal_api_key <> '') STORED;

GRANT UPDATE (hal_api_key) ON settings TO anon;
GRANT SELECT (hal_api_key_set) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('068_hal_api_key.sql')
ON CONFLICT (filename) DO NOTHING;
