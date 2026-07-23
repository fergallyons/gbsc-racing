-- Move boat PINs, the RO PIN, and payment-redirect fields behind server-side
-- verification instead of plaintext anon-readable/writable columns.
--
-- Before this: checkPin() in app.js fetched a boat's real `pin` with a plain
-- SELECT and compared it in the browser. That meant (a) anyone could read
-- any boat's PIN directly via REST with no auth at all, and (b) boats_update
-- / settings_update had no ownership check, so anyone could overwrite a
-- boat's pin/revolut_user, or the club's RO pin and Stripe payment links,
-- with a single unauthenticated REST call — full boat/RO takeover and a
-- path to redirect race-fee payments. See chat 2026-07-23.
--
-- Fix: PINs are hashed (pgcrypto/bcrypt), never SELECT-able by anon, and all
-- verification + sensitive writes go through SECURITY DEFINER RPC functions
-- that check the hash server-side before touching anything. This keeps the
-- existing no-login-friction PIN UX exactly as-is — it just makes the check
-- real instead of decorative. Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── boats ──────────────────────────────────────────────────────────────
ALTER TABLE boats ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS pin_is_default boolean NOT NULL DEFAULT true;
UPDATE boats SET pin_hash = crypt(pin, gen_salt('bf')) WHERE pin_hash IS NULL;
UPDATE boats SET pin_is_default = (pin = '0000') WHERE pin_hash IS NOT NULL;
ALTER TABLE boats ALTER COLUMN pin_hash SET NOT NULL;
-- New boats (RO "Add Boat", or a skipper self-registering) still INSERT via
-- the old boats_insert policy without ever knowing about pin_hash — this
-- default keeps that working, matching the old `pin DEFAULT '0000'` exactly.
ALTER TABLE boats ALTER COLUMN pin_hash SET DEFAULT crypt('0000', gen_salt('bf'));

REVOKE SELECT (pin) ON boats FROM anon;
REVOKE UPDATE (pin, revolut_user) ON boats FROM anon;
-- pin_hash / pin_is_default are new columns — anon was never granted them,
-- so there's nothing to revoke; just don't grant them below.

-- ── settings (RO pin + Stripe / payment fields) ──────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ro_pin_hash text;
UPDATE settings SET ro_pin_hash = crypt(COALESCE(ro_pin, '0000'), gen_salt('bf')) WHERE ro_pin_hash IS NULL;

REVOKE SELECT (ro_pin) ON settings FROM anon;
REVOKE UPDATE (ro_pin, stripe_link_member, stripe_link_student, stripe_link_visitor, ro_revolut_user) ON settings FROM anon;

-- ── boat PIN: verify / change (self-service) ──────────────────────────────
CREATE OR REPLACE FUNCTION verify_boat_pin(p_boat_id text, p_pin text)
RETURNS TABLE(ok boolean, is_default boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (pin_hash = crypt(p_pin, pin_hash)), pin_is_default
  FROM boats WHERE id = p_boat_id;
$$;
REVOKE ALL ON FUNCTION verify_boat_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_boat_pin(text,text) TO anon;

CREATE OR REPLACE FUNCTION change_boat_pin(p_boat_id text, p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (pin_hash = crypt(p_current_pin, pin_hash)) INTO v_ok FROM boats WHERE id = p_boat_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_boat_pin(text,text,text) TO anon;

-- RO admin override — reset a boat's forgotten PIN without knowing the old
-- one, gated by the RO's own pin instead (existing "PIN" button in the RO's
-- Manage Boats panel, openChangePinForBoat() in app.js).
CREATE OR REPLACE FUNCTION reset_boat_pin(p_ro_pin text, p_boat_id text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_ro_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION reset_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_boat_pin(text,text,text) TO anon;

CREATE OR REPLACE FUNCTION set_boat_revolut_user(p_boat_id text, p_current_pin text, p_revolut_user text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (pin_hash = crypt(p_current_pin, pin_hash)) INTO v_ok FROM boats WHERE id = p_boat_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET revolut_user = p_revolut_user WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_boat_revolut_user(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_boat_revolut_user(text,text,text) TO anon;

-- ── RO pin: verify / change ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_ro_pin(p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (ro_pin_hash = crypt(p_pin, ro_pin_hash)) FROM settings WHERE id = 'club';
$$;
REVOKE ALL ON FUNCTION verify_ro_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_ro_pin(text) TO anon;

CREATE OR REPLACE FUNCTION change_ro_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET ro_pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_ro_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_ro_pin(text,text) TO anon;

-- Stripe links + RO's own Revolut handle — same takeover-via-payment-
-- redirect risk as boats.revolut_user, gated the same way.
CREATE OR REPLACE FUNCTION set_ro_payment_settings(
  p_current_pin text,
  p_stripe_link_member text,
  p_stripe_link_student text,
  p_stripe_link_visitor text,
  p_ro_revolut_user text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET
    stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
    stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
    stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
    ro_revolut_user      = COALESCE(p_ro_revolut_user,      ro_revolut_user)
  WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text) TO anon;

INSERT INTO schema_migrations (filename) VALUES ('040_secure_pins.sql')
ON CONFLICT (filename) DO NOTHING;
