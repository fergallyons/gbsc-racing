-- ============================================================
-- Migration 061: RNLI contributions
-- Run this entire script in the Supabase SQL Editor.
-- It is idempotent — safe to re-run if a previous attempt
-- partially succeeded.
--
-- Adds a crew-level, no-login-required way to contribute to the RNLI via
-- Revolut (a dedicated account, deliberately separate from ro_revolut_user
-- which is the Race Committee's own fee-forwarding account) or Card
-- (reuses the club's existing Stripe account via create-bulk-checkout.js
-- — no new Stripe setup needed). Tracked in a small immutable ledger for
-- a running total.
-- ============================================================


-- ── Step 1: settings.rnli_revolut_user ────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS rnli_revolut_user text DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='settings' AND column_name='rnli_revolut_user'
  ) THEN RAISE EXCEPTION 'Step 1 FAILED: rnli_revolut_user column not found on settings';
  END IF;
  RAISE NOTICE 'Step 1 OK: settings.rnli_revolut_user exists';
END $$;


-- ── Step 2: grant read access to the new column ───────────────
-- 045_fix_column_privilege_revokes.sql replaced settings' table-level
-- anon SELECT with an explicit per-column allowlist. A new column has NO
-- anon privileges — not even SELECT — until added here. Read-only,
-- matching ro_revolut_user's own treatment; write stays RPC-gated only.
GRANT SELECT (rnli_revolut_user) ON settings TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_name='settings' AND column_name='rnli_revolut_user'
      AND grantee='anon' AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'Step 2 FAILED: anon SELECT grant on rnli_revolut_user not found';
  END IF;
  RAISE NOTICE 'Step 2 OK: anon can SELECT rnli_revolut_user';
END $$;


-- ── Step 3: extend set_ro_payment_settings with the new field ─
-- Postgres identifies functions by name+arg-types — changing the
-- parameter list needs an explicit DROP first, or the OLD 5-arg version
-- stays callable as a silent overload that just ignores the new field.
DROP FUNCTION IF EXISTS set_ro_payment_settings(text,text,text,text,text);

CREATE OR REPLACE FUNCTION set_ro_payment_settings(
  p_current_pin text,
  p_stripe_link_member text,
  p_stripe_link_student text,
  p_stripe_link_visitor text,
  p_ro_revolut_user text,
  p_rnli_revolut_user text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET
    stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
    stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
    stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
    ro_revolut_user      = COALESCE(p_ro_revolut_user,      ro_revolut_user),
    rnli_revolut_user     = COALESCE(p_rnli_revolut_user,    rnli_revolut_user)
  WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text,text) TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='set_ro_payment_settings' AND pronargs=6
  ) THEN RAISE EXCEPTION 'Step 3 FAILED: 6-arg set_ro_payment_settings not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='set_ro_payment_settings' AND pronargs=5
  ) THEN RAISE EXCEPTION 'Step 3 FAILED: old 5-arg overload still exists';
  END IF;
  RAISE NOTICE 'Step 3 OK: set_ro_payment_settings is the single 6-arg version';
END $$;


-- ── Step 4: rnli_contributions ledger ──────────────────────────
-- Not boat/crew-scoped by design — contributing is frictionless, no
-- picker step. Immutable audit log, same doctrine as self_payments:
-- insert-only, no UPDATE/DELETE grant or policy.
CREATE TABLE IF NOT EXISTS rnli_contributions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount      int         NOT NULL CHECK (amount > 0),
  method      text        NOT NULL CHECK (method IN ('Revolut','Card')),
  boat_id     text REFERENCES boats(id) ON DELETE SET NULL,
  payment_ref text,                                    -- Stripe Checkout Session's client ref; null for Revolut
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rnli_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rnli_contributions_select" ON rnli_contributions;
DROP POLICY IF EXISTS "rnli_contributions_insert" ON rnli_contributions;
CREATE POLICY "rnli_contributions_select" ON rnli_contributions FOR SELECT USING (true);
CREATE POLICY "rnli_contributions_insert" ON rnli_contributions FOR INSERT WITH CHECK (
  amount > 0 AND method IN ('Revolut','Card')
);
GRANT SELECT, INSERT ON rnli_contributions TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name='rnli_contributions'
  ) THEN RAISE EXCEPTION 'Step 4 FAILED: rnli_contributions table not found';
  END IF;
  RAISE NOTICE 'Step 4 OK: rnli_contributions exists with SELECT+INSERT for anon';
END $$;


-- ── All done ─────────────────────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('061_rnli_contributions.sql')
ON CONFLICT (filename) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 061 complete — RNLI contributions ready';
END $$;
