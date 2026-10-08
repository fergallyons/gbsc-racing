-- Club Admin as its own login (replacing the Admin PIN as a second tier
-- inside RO mode). Season-setup and financial functions — Club Settings'
-- payment links, Boat Management's PIN resets — now belong to the Club
-- Admin login, which holds the Admin PIN (042), not the RO PIN. The two
-- RPCs those screens call checked the RO PIN only; from here they accept
-- either PIN, so this migration works with both the old app (RO PIN) and
-- the new one (Admin PIN) and can be applied before the deploy.
--
-- Also adds reset_ro_pin: Club Admin manages who can be RO, so it can set a
-- new RO PIN without knowing the current one (change_ro_pin needs it).
-- Idempotent.

-- True when p_pin matches either the RO PIN or the Admin PIN
CREATE OR REPLACE FUNCTION _ro_or_admin_pin_ok(p_pin text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT COALESCE(
    (ro_pin_hash = crypt(p_pin, ro_pin_hash)) OR
    (admin_pin_hash IS NOT NULL AND admin_pin_hash = crypt(p_pin, admin_pin_hash)),
    false)
  FROM settings WHERE id = 'club';
$$;
REVOKE ALL ON FUNCTION _ro_or_admin_pin_ok(text) FROM PUBLIC;
-- Not granted to anon: only the SECURITY DEFINER functions below call it,
-- so it can't be used from the browser to test PINs outside verify_*_pin.

CREATE OR REPLACE FUNCTION reset_boat_pin(p_ro_pin text, p_boat_id text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT _ro_or_admin_pin_ok(p_ro_pin) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION reset_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_boat_pin(text,text,text) TO anon;

-- set_ro_payment_settings exists as the 6-arg version once 061 (RNLI) is
-- applied, the 5-arg one before it — replace whichever this club has.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'settings' AND column_name = 'rnli_revolut_user') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION set_ro_payment_settings(
        p_current_pin text, p_stripe_link_member text, p_stripe_link_student text,
        p_stripe_link_visitor text, p_ro_revolut_user text, p_rnli_revolut_user text
      ) RETURNS boolean
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $b$
      BEGIN
        IF NOT _ro_or_admin_pin_ok(p_current_pin) THEN RETURN false; END IF;
        UPDATE settings SET
          stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
          stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
          stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
          ro_revolut_user     = COALESCE(p_ro_revolut_user,     ro_revolut_user),
          rnli_revolut_user   = COALESCE(p_rnli_revolut_user,   rnli_revolut_user)
        WHERE id = 'club';
        RETURN true;
      END; $b$;
    $f$;
    REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text,text) TO anon;
  ELSE
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION set_ro_payment_settings(
        p_current_pin text, p_stripe_link_member text, p_stripe_link_student text,
        p_stripe_link_visitor text, p_ro_revolut_user text
      ) RETURNS boolean
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $b$
      BEGIN
        IF NOT _ro_or_admin_pin_ok(p_current_pin) THEN RETURN false; END IF;
        UPDATE settings SET
          stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
          stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
          stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
          ro_revolut_user     = COALESCE(p_ro_revolut_user,     ro_revolut_user)
        WHERE id = 'club';
        RETURN true;
      END; $b$;
    $f$;
    REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text) TO anon;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reset_ro_pin(p_admin_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (admin_pin_hash = crypt(p_admin_pin, admin_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET ro_pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION reset_ro_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_ro_pin(text,text) TO anon;

INSERT INTO schema_migrations (filename) VALUES ('071_club_admin_login.sql')
ON CONFLICT (filename) DO NOTHING;
