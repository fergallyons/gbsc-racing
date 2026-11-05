-- One RNLI contribution per Stripe payment.
-- netlify/functions/stripe-webhook.js now records Card gifts server-side,
-- alongside the in-app return handler (handleStripeReturn() in app.js). Both
-- check for an existing row by payment_ref first, but they can land at the
-- same moment — this index makes the second insert fail (409) instead of
-- double-counting the gift in the fundraiser total.
-- Partial: old Revolut gifts have a null payment_ref and stay unconstrained.
-- Skipped (with a notice) on a club without rnli_contributions (migration
-- 061); fails if duplicate refs already exist — those need a manual look.
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rnli_contributions') THEN
    RAISE NOTICE '080: rnli_contributions not present — skipped';
  ELSIF EXISTS (
    SELECT payment_ref FROM rnli_contributions
    WHERE payment_ref IS NOT NULL GROUP BY payment_ref HAVING count(*) > 1
  ) THEN
    -- Fail (so it isn't marked applied) rather than silently skip.
    RAISE EXCEPTION '080: duplicate payment_ref rows exist in rnli_contributions — remove the extra rows, then re-run';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS rnli_contributions_payment_ref_key
      ON rnli_contributions(payment_ref) WHERE payment_ref IS NOT NULL;
  END IF;
END $$;

INSERT INTO schema_migrations (filename) VALUES ('080_rnli_payment_ref_unique.sql')
ON CONFLICT (filename) DO NOTHING;
