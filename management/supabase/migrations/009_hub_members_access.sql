-- Hub login whitelist — access control for hub_members
--
-- hub_members already exists (it's how login is gated — see
-- _checkMembership() in app.js) but isn't defined in this repo's tracked
-- migrations; it was created directly in Supabase at some point, so its
-- exact current RLS/grants are unknown from the code. This migration is
-- defensive: it doesn't assume a starting state, just ensures the table
-- ends up RLS-enabled with full CRUD for authenticated sessions only
-- (no anon access at all — the login check itself already runs with the
-- user's own session token by the time it queries this table, so anon
-- access was never actually needed).
--
-- Run this in your Supabase SQL editor (same as migrations 001-008).

ALTER TABLE hub_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated all hub_members" ON hub_members;
CREATE POLICY "authenticated all hub_members" ON hub_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON hub_members TO authenticated;
REVOKE ALL ON hub_members FROM anon;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (filename) VALUES ('009_hub_members_access.sql') ON CONFLICT DO NOTHING;
