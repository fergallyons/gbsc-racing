-- Tracks which migration files have been applied to this club's DB, so
-- "is this club caught up?" is one query instead of manually checking
-- columns one by one (exactly the exercise this migration followed, after
-- RCYC turned out to be missing 033 and 035 with no way to tell short of
-- checking column-by-column).
--
-- Convention going forward, for every new migration file: end it with
--   INSERT INTO schema_migrations (filename) VALUES ('0NN_name.sql')
--   ON CONFLICT (filename) DO NOTHING;
-- so a club's tracked history stays accurate automatically as each
-- migration is applied — no separate bookkeeping step, and nothing to
-- remember to do differently as more clubs come on board.
--
-- Only genuine schema/DDL migrations are tracked here — one-off per-club
-- data seeds (e.g. seed_rcyc_demo, seed_gbsc_races_2026) aren't, since
-- "does club X have club Y's seed data" isn't a meaningful question.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schema_migrations_select" ON schema_migrations;
CREATE POLICY "schema_migrations_select" ON schema_migrations FOR SELECT USING (true);
GRANT SELECT ON schema_migrations TO anon;

-- Backfill — this DB has genuinely run every migration below already
-- (that's a precondition of running this one), so record accurate history.
INSERT INTO schema_migrations (filename) VALUES
  ('001_add_stripe_links_and_crew_selected.sql'),
  ('002_add_pre_race_window.sql'),
  ('003_add_push_subscriptions.sql'),
  ('004_add_session_logs.sql'),
  ('005_add_estela_url.sql'),
  ('006_add_races_table.sql'),
  ('006_race_records_upsertable.sql'),
  ('009_skipper_declarations.sql'),
  ('010_course_card_and_series_fees.sql'),
  ('012_settings_features.sql'),
  ('013_published_courses_upsertable.sql'),
  ('017_settings_extended_columns.sql'),
  ('018_grant_anon_all_tables.sql'),
  ('019_boats_stripe_link.sql'),
  ('020_settings_club_config.sql'),
  ('021_registrations_looking_for_crew.sql'),
  ('022_crew_available.sql'),
  ('023_restore_immutable_table_grants.sql'),
  ('024_race_records_restore_update.sql'),
  ('025_payment_ref.sql'),
  ('026_news_items.sql'),
  ('027_protest_types.sql'),
  ('028_race_starts.sql'),
  ('029_start_flag_systems_i_z.sql'),
  ('030_race_starts_postponed.sql'),
  ('031_marks_bounds_all_ireland.sql'),
  ('032_laid_course.sql'),
  ('033_boats_sail_number.sql'),
  ('034_crew_guest_type.sql'),
  ('035_crew_is_guest_flag.sql'),
  ('20260421_start_finish_lines.sql')
ON CONFLICT (filename) DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('036_schema_migrations_tracking.sql')
ON CONFLICT (filename) DO NOTHING;
