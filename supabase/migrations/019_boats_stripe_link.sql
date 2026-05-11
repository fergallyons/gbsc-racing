-- Add stripe_link column to boats table.
-- Was present in the original GBSC boats table but never added via a migration,
-- causing PGRST204 on fresh databases (e.g. RCYC).
-- Idempotent — safe to re-run on GBSC where the column already exists.

alter table boats
  add column if not exists stripe_link text not null default '';
