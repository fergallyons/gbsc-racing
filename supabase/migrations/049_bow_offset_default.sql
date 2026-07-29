-- Corrects 048_bow_offset.sql's default: nullable/0 meant "no correction",
-- which is definitely wrong for virtually every boat (the whole point of
-- bow_offset_m is that a phone is never actually at the bow), so leaving
-- it unset was a worse default than a plausible guess. 6m (a reasonable
-- cockpit-to-bow distance on a typical club keelboat) is now the default
-- for any boat that hasn't set its own value. Boats can still be set to
-- exactly 0 (phone genuinely mounted at the bow) or any other value —
-- this only changes what an *unconfigured* boat gets. Idempotent.

UPDATE boats SET bow_offset_m = 6 WHERE bow_offset_m IS NULL;

ALTER TABLE boats ALTER COLUMN bow_offset_m SET DEFAULT 6;
ALTER TABLE boats ALTER COLUMN bow_offset_m SET NOT NULL;

ALTER TABLE boats DROP CONSTRAINT IF EXISTS boats_bow_offset_m_check;
ALTER TABLE boats ADD CONSTRAINT boats_bow_offset_m_check
  CHECK (bow_offset_m >= 0 AND bow_offset_m <= 30);

INSERT INTO schema_migrations (filename) VALUES ('049_bow_offset_default.sql')
ON CONFLICT (filename) DO NOTHING;
