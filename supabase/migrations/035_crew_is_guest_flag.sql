-- Supersedes 034: a "guest" is not a fee category — a guest can be a full
-- member, student, visitor, etc. who just doesn't sail regularly on THIS
-- boat. Modeling it as a 6th `type` value conflated two orthogonal things
-- (fee category vs. regular-roster membership). Correct model: keep `type`
-- restricted to the original 5 fee categories, and add a separate
-- `is_guest` boolean that the app sets when someone is recorded via the
-- self-pay "not listed? add as guest" flow instead of the skipper's roster.
--
-- Reverts crew.type's CHECK back to the 5 original values (using the same
-- pg_constraint-based drop-all approach as 034, since duplicate check
-- constraints on this column have already been seen on at least one club's
-- DB) and reclassifies any 'guest'-typed rows already written (best guess:
-- visitor, the closest fee category) before re-adding the constraint.

UPDATE crew SET type='visitor' WHERE type='guest';

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
  CHECK (type IN ('full','crew','student','visitor','kid'));

ALTER TABLE crew ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;
