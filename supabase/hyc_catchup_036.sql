-- HYC catch-up — a live read-only check against HYC's own DB on 2026-07-20
-- confirmed everything through migration 035 is already present (boats.
-- sail_number, crew.is_guest, published_courses.course_type/laps, the
-- race_starts table, protests.type, news_items — all there). This just
-- adds the new schema_migrations tracking table (see migrations/036 for
-- rationale) and backfills it accordingly. Run in the HYC Supabase
-- project's SQL Editor.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schema_migrations_select" ON schema_migrations;
CREATE POLICY "schema_migrations_select" ON schema_migrations FOR SELECT USING (true);
GRANT SELECT ON schema_migrations TO anon;

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
  ('035_crew_is_guest_flag.sql'),
  ('036_schema_migrations_tracking.sql')
ON CONFLICT (filename) DO NOTHING;
-- Not included: 034 (superseded by 035) and the GBSC/RCYC-demo-only seed
-- migrations, which HYC never runs.
