-- Add features jsonb column to settings for DB-driven feature flags.
-- Replaces the env-var hide[] approach. Admin panel in RO view writes here.

alter table settings
  add column if not exists features jsonb not null default '{}'::jsonb;
