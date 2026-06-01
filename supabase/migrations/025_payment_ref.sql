-- Add payment_ref to race_payments to link rows from a single bulk transaction.
-- A bulk payment (one card charge or one Revolut transfer for multiple crew)
-- writes N rows that all share the same payment_ref (a UUID generated client-side).
-- Single-payment rows leave it NULL.
-- Idempotent — safe to re-run.

alter table race_payments add column if not exists payment_ref text;
create index if not exists race_payments_payment_ref_idx on race_payments(payment_ref);
