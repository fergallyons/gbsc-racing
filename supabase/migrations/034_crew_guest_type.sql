-- Allow a 'guest' crew type — a one-off walk-up crew member recorded
-- against a boat purely so their race fee payment has a name attached.
-- Guests are excluded from the skipper's regular roster view in the app,
-- but their crew row + self_payments/race_payments rows work exactly
-- like any other crew member's. Idempotent.

ALTER TABLE crew DROP CONSTRAINT IF EXISTS crew_type_check;
ALTER TABLE crew ADD CONSTRAINT crew_type_check
  CHECK (type IN ('full','crew','student','visitor','kid','guest'));
