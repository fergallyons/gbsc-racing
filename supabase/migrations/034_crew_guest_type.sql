-- Allow a 'guest' crew type — a one-off walk-up crew member recorded
-- against a boat purely so their race fee payment has a name attached.
-- Guests are excluded from the skipper's regular roster view in the app,
-- but their crew row + self_payments/race_payments rows work exactly
-- like any other crew member's. Idempotent.
--
-- Drops ALL check constraints on crew.type by inspecting pg_constraint,
-- rather than guessing a single constraint name — some installs ended up
-- with more than one (e.g. crew_type_check + crew_type_check1) from past
-- migration attempts, and a name-guessed DROP silently missed the extra one.

DO $$
DECLARE
  r record;
  col_attnum smallint;
BEGIN
  SELECT attnum INTO col_attnum FROM pg_attribute
    WHERE attrelid = 'crew'::regclass AND attname = 'type';

  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'crew'::regclass
      AND con.contype = 'c'
      AND col_attnum = ANY(con.conkey)
  LOOP
    EXECUTE format('ALTER TABLE crew DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE crew ADD CONSTRAINT crew_type_check
  CHECK (type IN ('full','crew','student','visitor','kid','guest'));
