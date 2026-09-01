-- ============================================================
-- Migration 062: RNLI running-total base amount
-- Run this entire script in the Supabase SQL Editor.
-- It is idempotent — safe to re-run.
--
-- Adds a starting "base" amount to the RNLI running total shown on the
-- dashboard tiles (rnli_revolut_user / rnli_contributions themselves came
-- from migration 061) — GBSC has already collected real RNLI donations
-- outside this app (cash at the club, etc.) and wants the displayed total
-- to start from that credible figure rather than €0. Deliberately a
-- separate settings field rather than a fake row in rnli_contributions:
-- that table is a real, insert-only, per-gift audit ledger (amount +
-- method + timestamp, CHECK method IN ('Revolut','Card')) — a "starting
-- balance" isn't a real Revolut/Card gift and shouldn't pretend to be
-- one. The displayed total is base + SUM(rnli_contributions.amount).
-- ============================================================


-- ── Step 1: settings.rnli_base_amount ─────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS rnli_base_amount int NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='settings' AND column_name='rnli_base_amount'
  ) THEN RAISE EXCEPTION 'Step 1 FAILED: rnli_base_amount column not found on settings';
  END IF;
  RAISE NOTICE 'Step 1 OK: settings.rnli_base_amount exists';
END $$;


-- ── Step 2: grant read access to the new column ───────────────
-- Same allowlist doctrine as every other settings column since migration
-- 045 — see rnli_revolut_user's own treatment in migration 061.
GRANT SELECT (rnli_base_amount) ON settings TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_name='settings' AND column_name='rnli_base_amount'
      AND grantee='anon' AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'Step 2 FAILED: anon SELECT grant on rnli_base_amount not found';
  END IF;
  RAISE NOTICE 'Step 2 OK: anon can SELECT rnli_base_amount';
END $$;


-- ── Step 3: seed GBSC's real base amount ───────────────────────
-- €600 already raised for the RNLI outside this app, per the club.
-- GBSC-specific — every other club's row stays at the column default (0),
-- untouched by this UPDATE (WHERE id='club' matches only GBSC's single
-- settings row; harmless no-op everywhere else).
UPDATE settings SET rnli_base_amount = 600 WHERE id = 'club';

DO $$ BEGIN
  RAISE NOTICE 'Step 3 OK: settings.rnli_base_amount set to % for club row', (SELECT rnli_base_amount FROM settings WHERE id='club');
END $$;


-- ── All done ─────────────────────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('062_rnli_base_amount.sql')
ON CONFLICT (filename) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 062 complete — RNLI base amount ready';
END $$;
