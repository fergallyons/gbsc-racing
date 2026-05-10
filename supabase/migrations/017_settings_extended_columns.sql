-- Add columns to settings that the app reads but have no prior migration.
-- Idempotent — safe to re-run.

alter table settings
  add column if not exists worldtides_key          text not null default '',
  add column if not exists ro_revolut_user         text not null default '',
  add column if not exists results_published_race_key text;
