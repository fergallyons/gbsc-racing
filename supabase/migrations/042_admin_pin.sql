-- Admin PIN — a second, more tightly-held tier above the RO PIN, for larger
-- clubs with a rotating roster of volunteer ROs. Right now the single RO
-- PIN unlocks everything: race-day operations AND season setup/financial
-- config (Stripe links, race schedule, marks library, boat/PIN management).
-- At a club with several ROs sharing that one PIN, every volunteer running
-- a Wednesday night also has full financial/structural access. This splits
-- that: race-day tiles stay behind the existing RO PIN; season-setup tiles
-- move behind this one instead. Same hash+RPC pattern as migration 040.
-- See chat 2026-07-23. Idempotent.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_pin_hash text;
UPDATE settings SET admin_pin_hash = crypt('0000', gen_salt('bf')) WHERE admin_pin_hash IS NULL;
-- No plaintext admin_pin column ever existed (this tier is new), so unlike
-- ro_pin there's no legacy value to migrate from — but settings already has
-- a table-level SELECT grant from the original schema, which covers this
-- new column too unless revoked (see migration 040's fix for the same
-- mistake made with ro_pin_hash/pin_hash).
REVOKE SELECT (admin_pin_hash) ON settings FROM anon;

CREATE OR REPLACE FUNCTION verify_admin_pin(p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (admin_pin_hash = crypt(p_pin, admin_pin_hash)) FROM settings WHERE id = 'club';
$$;
REVOKE ALL ON FUNCTION verify_admin_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_admin_pin(text) TO anon;

CREATE OR REPLACE FUNCTION change_admin_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (admin_pin_hash = crypt(p_current_pin, admin_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET admin_pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_admin_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_admin_pin(text,text) TO anon;

INSERT INTO schema_migrations (filename) VALUES ('042_admin_pin.sql')
ON CONFLICT (filename) DO NOTHING;
