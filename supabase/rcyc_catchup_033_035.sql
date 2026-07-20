-- RCYC catch-up — confirmed missing via a live read-only check against RCYC's
-- own DB on 2026-07-20. Covers migrations 033, 035, and a safety re-run of
-- 031 (can't be verified read-only, but idempotent either way). Run in the
-- RCYC Supabase project's SQL Editor.

-- 033 — sail number per boat (needed for Finish Recording's HalSail CSV export)
ALTER TABLE boats ADD COLUMN IF NOT EXISTS sail_number text NOT NULL DEFAULT '';

-- 035 — crew.is_guest flag (needed for the Guest payment feature).
-- 034 never ran on RCYC, so there's no leftover duplicate constraint to clean
-- up first — this applies cleanly in one pass.
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

-- 031 (safety re-run) — widen marks_insert bounds to cover Cork Harbour.
-- Idempotent (DROP IF EXISTS + CREATE) — harmless if this already ran.
DROP POLICY IF EXISTS "marks_insert" ON marks;
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 51.0 AND 55.5
  AND lng BETWEEN -11.0 AND -5.5
);

-- 036 — schema_migrations tracking table (see migrations/036 for rationale),
-- backfilled with everything confirmed present on RCYC as of this check.
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
-- Not included: 034 (never ran on RCYC — confirmed, superseded by 035
-- anyway) and the GBSC/RCYC-demo-only seed migrations this club never runs.
