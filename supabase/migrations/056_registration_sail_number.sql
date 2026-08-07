-- Per-fleet required registration, with a mandatory sail number. Built for
-- MSC's dinghy fleet: some dinghies have regular skippers, others are
-- shared/borrowed club boats, and on a given night nobody currently knows
-- who's actually sailing which physical boat. registrations.sail_number
-- is deliberately independent of boats.sail_number (033) — the latter is
-- a boat's own default/master value set by the RO; this is what THIS
-- registration actually raced under, which can differ night to night for
-- a shared boat. "Required" stays a pure app/UX concept (see app.js
-- registerForRace()) — never DB-enforced — so this can never brick a
-- club's existing registrations; hence nullable, no default, no CHECK.
-- Idempotent — safe to re-run.

ALTER TABLE fleets ADD COLUMN IF NOT EXISTS requires_sail_number boolean NOT NULL DEFAULT false;
-- fleets has had a plain table-level anon grant since migration 051, no
-- new grant needed here (same reasoning already applied to race_starts/
-- races' own fleet_id columns).

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS sail_number text;

-- registrations has no blanket anon GRANT anywhere in this repo's tracked
-- SQL history (confirmed by direct search — unlike every other table,
-- its base SELECT/INSERT/DELETE access predates schema.sql and isn't
-- captured in any migration). What IS confirmed, by precedent: the only
-- two columns ever previously added to this table (looking_for_crew,
-- migration 021; tracking_enabled, migration 039) BOTH needed their own
-- explicit column-level grant to actually work — so this one gets the
-- same treatment rather than assuming a blanket grant covers it.
GRANT INSERT (sail_number) ON registrations TO anon;
GRANT UPDATE (sail_number) ON registrations TO anon;

INSERT INTO schema_migrations (filename) VALUES ('056_registration_sail_number.sql')
ON CONFLICT (filename) DO NOTHING;
