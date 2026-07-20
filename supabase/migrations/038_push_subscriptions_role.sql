-- push_subscriptions needs a way to tell subscription "topics" apart now
-- that RO (registration alerts) and Crew (course-published, like Skipper's
-- existing toggle) subscriptions exist alongside the original Skipper ones
-- — all three can have boat_id NULL or non-NULL in ways that no longer
-- uniquely identify which topic a row is for. Idempotent.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'skipper'
    CHECK (role IN ('skipper','crew','ro'));

-- Backfill: the only NULL-boat_id rows that could exist before this
-- migration are from the RO subscribe toggle added just before this one —
-- reclassify those; boat-scoped rows stay 'skipper' (the default), which
-- is what they always were.
UPDATE push_subscriptions SET role='ro' WHERE boat_id IS NULL AND role='skipper';

INSERT INTO schema_migrations (filename) VALUES ('038_push_subscriptions_role.sql')
ON CONFLICT (filename) DO NOTHING;
