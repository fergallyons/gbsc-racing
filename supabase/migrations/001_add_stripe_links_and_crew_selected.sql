-- Migration 001 — Add Stripe payment links and crew selection persistence
-- Run this against the live Supabase database if it was created before these
-- columns were added to schema.sql.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS stripe_link_member   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS stripe_link_student  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS stripe_link_visitor  text DEFAULT '';

ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS selected boolean DEFAULT false;
