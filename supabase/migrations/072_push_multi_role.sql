-- One device, several notification subscriptions. A browser has a single
-- push endpoint per site, but the same phone is often a boat's skipper AND
-- the club's RO (or crew). push_subscriptions.endpoint was UNIQUE, so the
-- second toggle's insert hit the constraint, the app treated that as
-- "already subscribed", and the row stayed the first role — an RO who had
-- ever enabled skipper notifications never received a single RO alert
-- (boat registrations, protests).
--
-- Unique per (endpoint, role, boat) instead: one row per thing the device
-- asked to hear about. send-push already selects by role (and boat), so it
-- needs no change for this. Idempotent.

DO $$
DECLARE c text;
BEGIN
  -- the endpoint-only unique constraint from 003 (name not assumed)
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'push_subscriptions'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND att.attname = 'endpoint'
  LOOP
    EXECUTE 'ALTER TABLE push_subscriptions DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_role_boat
  ON push_subscriptions (endpoint, role, COALESCE(boat_id, ''));

INSERT INTO schema_migrations (filename) VALUES ('072_push_multi_role.sql')
ON CONFLICT (filename) DO NOTHING;
