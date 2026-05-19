-- Migration 018 granted blanket UPDATE/DELETE to anon on tables that were
-- deliberately designed as insert-only audit trails. This migration restores
-- the intended access model.

-- race_records: immutable fee submission snapshots — INSERT only
revoke update, delete on race_records from anon;

-- self_payments: immutable crew-initiated payment records — INSERT only
revoke update, delete on self_payments from anon;

-- push_subscriptions: Edge Function reads via service role key; anon needs
-- INSERT (subscribe) and DELETE (unsubscribe own endpoint) but not SELECT or UPDATE
revoke select, update on push_subscriptions from anon;
