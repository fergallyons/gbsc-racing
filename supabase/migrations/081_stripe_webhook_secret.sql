-- Stripe webhook signing secret (whsec_…), per club, in the club's own
-- database instead of a Netlify env var. Read only by the stripe-webhook
-- Netlify function, using the club's service key.
--
-- Stricter than hal_api_key/ss_api_key (068/069), which anon may UPDATE
-- directly: whoever sets this secret can sign webhook events the function
-- will believe, i.e. forge "paid" records. So anon gets neither SELECT nor
-- UPDATE on the column — it's set only through set_stripe_webhook_secret(),
-- gated on the RO or Club Admin PIN like set_ro_payment_settings (071).
-- The generated stripe_webhook_secret_set flag is SELECT-able so Club
-- Settings can show "secret saved" without ever seeing it.
-- Needs 071 (_ro_or_admin_pin_ok). Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_ro_or_admin_pin_ok') THEN
    RAISE EXCEPTION '081 needs migration 071 (_ro_or_admin_pin_ok) applied first';
  END IF;
END $$;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS stripe_webhook_secret text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS stripe_webhook_secret_set boolean
  GENERATED ALWAYS AS (stripe_webhook_secret IS NOT NULL AND stripe_webhook_secret <> '') STORED;

GRANT SELECT (stripe_webhook_secret_set) ON settings TO anon;

CREATE OR REPLACE FUNCTION set_stripe_webhook_secret(p_current_pin text, p_secret text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT _ro_or_admin_pin_ok(p_current_pin) THEN RETURN false; END IF;
  -- Only a real Stripe signing secret, or '' to clear it.
  IF p_secret IS NULL OR (p_secret <> '' AND p_secret !~ '^whsec_[A-Za-z0-9]+$') THEN
    RETURN false;
  END IF;
  UPDATE settings SET stripe_webhook_secret = NULLIF(p_secret, '') WHERE id = 'club';
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION set_stripe_webhook_secret(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_stripe_webhook_secret(text, text) TO anon;

INSERT INTO schema_migrations (filename) VALUES ('081_stripe_webhook_secret.sql')
ON CONFLICT (filename) DO NOTHING;
