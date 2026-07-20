-- ============================================================
-- RCYC Racing App — Full Database Bootstrap
-- ============================================================
-- Run this ONCE, in full, against a fresh/reset RCYC Supabase project's
-- SQL Editor. It is the consolidated equivalent of running
-- supabase/schema.sql followed by every migration in
-- supabase/migrations/, in order, EXCLUDING the ones that are
-- GBSC-specific or superseded. See the exclusion list at the bottom.
--
-- After running, set (Project Settings → API):
--   sbUrl / sbKey  → CLUB_CONFIG_RCYC env var in Netlify (club-config.js)
--
-- Safe to re-run: every statement here is idempotent (IF NOT EXISTS /
-- IF EXISTS / ON CONFLICT), so re-running after a partial failure will
-- not duplicate data or error on already-created objects.
-- ============================================================


-- ============================================================
-- SECTION 1 — Base schema (supabase/schema.sql)
-- ============================================================

-- ── boats ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boats (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  icon          text NOT NULL DEFAULT '⛵',
  pin           text NOT NULL DEFAULT '0000',
  revolut_user  text NOT NULL DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boats_select" ON boats;
DROP POLICY IF EXISTS "boats_insert" ON boats;
DROP POLICY IF EXISTS "boats_update" ON boats;
DROP POLICY IF EXISTS "boats_delete" ON boats;
CREATE POLICY "boats_select" ON boats FOR SELECT USING (true);
CREATE POLICY "boats_insert" ON boats FOR INSERT WITH CHECK (
  id ~ '^[a-z0-9_-]{1,60}$'
);
CREATE POLICY "boats_update" ON boats FOR UPDATE USING (true);
CREATE POLICY "boats_delete" ON boats FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON boats TO anon;


-- ── settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id                    text PRIMARY KEY,
  stripe_link_member    text DEFAULT '',
  stripe_link_student   text DEFAULT '',
  stripe_link_visitor   text DEFAULT '',
  pre_race_window_hours int  DEFAULT 12,
  worldtides_key        text DEFAULT '',
  ro_revolut_user            text DEFAULT '',
  results_published_race_key text DEFAULT '',
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_select" ON settings;
DROP POLICY IF EXISTS "settings_insert" ON settings;
DROP POLICY IF EXISTS "settings_update" ON settings;
CREATE POLICY "settings_select" ON settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (
  id = 'club'
);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (
  id = 'club'
);

INSERT INTO settings (id) VALUES ('club') ON CONFLICT (id) DO NOTHING;


-- ── crew ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew (
  id          text PRIMARY KEY,
  boat_id     text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  first       text NOT NULL,
  last        text NOT NULL DEFAULT '',
  type        text NOT NULL DEFAULT 'full'
                   CHECK (type IN ('full','crew','student','visitor','kid')),
  join_year   int,
  outings     int DEFAULT 0,
  phone       text,
  selected    boolean DEFAULT false,
  is_guest    boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_boat_id_idx ON crew(boat_id);

ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_select" ON crew;
DROP POLICY IF EXISTS "crew_insert" ON crew;
DROP POLICY IF EXISTS "crew_update" ON crew;
DROP POLICY IF EXISTS "crew_delete" ON crew;
CREATE POLICY "crew_select" ON crew FOR SELECT USING (true);
CREATE POLICY "crew_insert" ON crew FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND boat_id <> ''
);
CREATE POLICY "crew_update" ON crew FOR UPDATE USING (true);
CREATE POLICY "crew_delete" ON crew FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON crew TO anon;


-- ── registrations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registrations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id       text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key      text NOT NULL,
  race_name     text NOT NULL,
  race_date     date NOT NULL,
  registered_at timestamptz DEFAULT now(),
  UNIQUE (boat_id, race_key)
);

CREATE INDEX IF NOT EXISTS registrations_race_key_idx ON registrations(race_key);

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "registrations_select" ON registrations;
DROP POLICY IF EXISTS "registrations_insert" ON registrations;
DROP POLICY IF EXISTS "registrations_delete" ON registrations;
CREATE POLICY "registrations_select" ON registrations FOR SELECT USING (true);
CREATE POLICY "registrations_insert" ON registrations FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_key IS NOT NULL AND race_date IS NOT NULL
);
CREATE POLICY "registrations_delete" ON registrations FOR DELETE USING (true);


-- ── published_courses ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS published_courses (
  id           text PRIMARY KEY,
  name         text NOT NULL DEFAULT '',
  marks        jsonb NOT NULL DEFAULT '[]',
  wind_deg     int,
  wind_dir     text,
  race_name    text DEFAULT '',
  notes        text DEFAULT '',
  published_at timestamptz DEFAULT now(),
  course_type  text CHECK (course_type IN ('windward_leeward','triangle','olympic')),
  laps         int
);

ALTER TABLE published_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courses_select" ON published_courses;
DROP POLICY IF EXISTS "courses_insert" ON published_courses;
DROP POLICY IF EXISTS "courses_update" ON published_courses;
CREATE POLICY "courses_select" ON published_courses FOR SELECT USING (true);
CREATE POLICY "courses_insert" ON published_courses FOR INSERT WITH CHECK (
  id = 'current'
);
CREATE POLICY "courses_update" ON published_courses FOR UPDATE USING (
  id = 'current'
);


-- ── marks ───────────────────────────────────────────────────
-- NOTE: bounds check below is corrected for RCYC in Section 3 — do not
-- worry that Cork Harbour coordinates look "wrong" against this box yet.
CREATE TABLE IF NOT EXISTS marks (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  colour      text NOT NULL DEFAULT '#00b4d8',
  description text DEFAULT '',
  active      boolean DEFAULT true,
  sort_order  int DEFAULT 99,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marks_select" ON marks;
DROP POLICY IF EXISTS "marks_insert" ON marks;
DROP POLICY IF EXISTS "marks_update" ON marks;
DROP POLICY IF EXISTS "marks_delete" ON marks;
CREATE POLICY "marks_select" ON marks FOR SELECT USING (true);
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 52.0 AND 54.0
  AND lng BETWEEN -10.5 AND -8.0
);
CREATE POLICY "marks_update" ON marks FOR UPDATE USING (true);
CREATE POLICY "marks_delete" ON marks FOR DELETE USING (true);


-- ── race_records ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS race_records (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id            text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_name          text NOT NULL,
  race_date          date NOT NULL,
  crew_snapshot      jsonb NOT NULL DEFAULT '[]',
  total_due          int NOT NULL DEFAULT 0,
  total_paid         int NOT NULL DEFAULT 0,
  payment_methods    jsonb DEFAULT '{}',
  settlement_methods jsonb DEFAULT '[]',
  settlement_note    text,
  submitted_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS race_records_race_name_idx ON race_records(race_name);

ALTER TABLE race_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_records_select" ON race_records;
DROP POLICY IF EXISTS "race_records_insert" ON race_records;
CREATE POLICY "race_records_select" ON race_records FOR SELECT USING (true);
CREATE POLICY "race_records_insert" ON race_records FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_name IS NOT NULL AND race_date IS NOT NULL
);


-- ── protests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS protests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_name       text NOT NULL,
  race_date       date NOT NULL,
  protestor_id    text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  protestee_id    text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  incident_where  text NOT NULL,
  incident_time   text NOT NULL,
  flag_displayed  boolean DEFAULT false,
  protest_hailed  boolean DEFAULT false,
  rules_broken    jsonb DEFAULT '[]',
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'Pending',
  ro_notes        text DEFAULT '',
  filed_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protests_race_name_idx ON protests(race_name);

ALTER TABLE protests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protests_select" ON protests;
DROP POLICY IF EXISTS "protests_insert" ON protests;
DROP POLICY IF EXISTS "protests_update" ON protests;
DROP POLICY IF EXISTS "protests_delete" ON protests;
CREATE POLICY "protests_select" ON protests FOR SELECT USING (true);
CREATE POLICY "protests_insert" ON protests FOR INSERT WITH CHECK (
  protestor_id IS NOT NULL
  AND protestee_id IS NOT NULL
  AND protestor_id <> protestee_id
  AND description <> ''
);
CREATE POLICY "protests_update" ON protests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "protests_delete" ON protests FOR DELETE USING (true);


-- ── push_subscriptions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  boat_id    text        REFERENCES boats(id) ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'skipper' CHECK (role IN ('skipper','crew','ro')),
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_sub_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_delete" ON push_subscriptions;
CREATE POLICY "push_sub_insert" ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "push_sub_delete" ON push_subscriptions FOR DELETE USING (true);
GRANT INSERT, DELETE ON public.push_subscriptions TO anon;
-- Carried over from branch ff7ea95 (not yet merged to main) — the Edge
-- Function reads subscriptions via the service_role key; RLS bypass alone
-- doesn't grant table-level SELECT, so this needs to be explicit.
GRANT SELECT ON public.push_subscriptions TO service_role;


-- ── race_payments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS race_payments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id     text        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  crew_id     text        NOT NULL,
  race_key    text        NOT NULL,
  race_name   text        NOT NULL,
  race_date   date        NOT NULL,
  method      text        NOT NULL,
  amount      int         NOT NULL DEFAULT 0,
  paid_at     timestamptz DEFAULT now(),
  UNIQUE (crew_id, race_key)
);

ALTER TABLE race_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_payments_select" ON race_payments;
DROP POLICY IF EXISTS "race_payments_insert" ON race_payments;
DROP POLICY IF EXISTS "race_payments_update" ON race_payments;
DROP POLICY IF EXISTS "race_payments_delete" ON race_payments;
CREATE POLICY "race_payments_select" ON race_payments FOR SELECT USING (true);
CREATE POLICY "race_payments_insert" ON race_payments FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND crew_id IS NOT NULL AND race_key IS NOT NULL
);
CREATE POLICY "race_payments_update" ON race_payments FOR UPDATE USING (true);
CREATE POLICY "race_payments_delete" ON race_payments FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON race_payments TO anon;


-- ── race_attendees ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS race_attendees (
  boat_id     text        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key    text        NOT NULL,
  crew_id     text        NOT NULL,
  race_name   text        NOT NULL,
  race_date   date        NOT NULL,
  PRIMARY KEY (boat_id, race_key, crew_id)
);

CREATE INDEX IF NOT EXISTS race_attendees_boat_race_idx ON race_attendees(boat_id, race_key);

ALTER TABLE race_attendees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_attendees_select" ON race_attendees;
DROP POLICY IF EXISTS "race_attendees_insert" ON race_attendees;
DROP POLICY IF EXISTS "race_attendees_delete" ON race_attendees;
CREATE POLICY "race_attendees_select" ON race_attendees FOR SELECT USING (true);
CREATE POLICY "race_attendees_insert" ON race_attendees FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_key IS NOT NULL AND crew_id IS NOT NULL
);
CREATE POLICY "race_attendees_delete" ON race_attendees FOR DELETE USING (true);
GRANT SELECT, INSERT, DELETE ON race_attendees TO anon;


-- ── self_payments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_payments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id     text        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  crew_id     text        NOT NULL,
  race_key    text        NOT NULL,
  race_name   text        NOT NULL,
  race_date   date        NOT NULL,
  method      text        NOT NULL,
  amount      int         NOT NULL DEFAULT 0,
  paid_at     timestamptz DEFAULT now(),
  UNIQUE (crew_id, race_key)
);

ALTER TABLE self_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_payments_select" ON self_payments;
DROP POLICY IF EXISTS "self_payments_insert" ON self_payments;
CREATE POLICY "self_payments_select" ON self_payments FOR SELECT USING (true);
CREATE POLICY "self_payments_insert" ON self_payments FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND crew_id IS NOT NULL AND race_key IS NOT NULL
);
GRANT SELECT, INSERT ON self_payments TO anon;


-- ============================================================
-- SECTION 2 — Migrations 001–025 (schema-only, GBSC-agnostic)
-- ============================================================

-- 001 — Stripe links & crew selection
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS stripe_link_member   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS stripe_link_student  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS stripe_link_visitor  text DEFAULT '';
ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS selected boolean DEFAULT false;

-- 002 — pre-race window
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS pre_race_window_hours int DEFAULT 12;

-- 003 — see push_subscriptions above (already created in Section 1)

-- 004 — session logs
CREATE TABLE IF NOT EXISTS session_logs (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_type   text        NOT NULL CHECK (session_type IN ('skipper','ro','guest')),
  boat_id        text        REFERENCES boats(id) ON DELETE SET NULL,
  boat_name      text,
  logged_in_at   timestamptz NOT NULL DEFAULT now(),
  logged_out_at  timestamptz
);
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "session_insert" ON session_logs;
DROP POLICY IF EXISTS "session_update" ON session_logs;
DROP POLICY IF EXISTS "session_select" ON session_logs;
CREATE POLICY "session_insert" ON session_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "session_update" ON session_logs FOR UPDATE USING (true);
CREATE POLICY "session_select" ON session_logs FOR SELECT USING (true);
GRANT INSERT, UPDATE, SELECT ON public.session_logs TO anon;
GRANT USAGE, SELECT ON SEQUENCE session_logs_id_seq TO anon;

-- 005 — eStela URL
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS estella_url text DEFAULT '';

-- 006 (race_records_upsertable) — make race_records upsertable
ALTER TABLE race_records ADD COLUMN IF NOT EXISTS race_key text DEFAULT '';
UPDATE race_records
SET race_key = to_char(race_date, 'YYYY-MM-DD') || '_' ||
  lower(regexp_replace(race_name, '[^a-zA-Z0-9]', '', 'g'))
WHERE race_key = '' OR race_key IS NULL;
DELETE FROM race_records
WHERE id NOT IN (
  SELECT DISTINCT ON (boat_id, race_key) id
  FROM race_records
  ORDER BY boat_id, race_key, submitted_at DESC
);
ALTER TABLE race_records DROP CONSTRAINT IF EXISTS race_records_boat_race_unique;
ALTER TABLE race_records ADD CONSTRAINT race_records_boat_race_unique UNIQUE (boat_id, race_key);
DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);
GRANT UPDATE ON race_records TO anon;

-- 006 (add_races_table) — races table
CREATE TABLE IF NOT EXISTS races (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text    NOT NULL,
  race_date   date    NOT NULL,
  start_hour  int     NOT NULL DEFAULT 19,
  start_min   int     NOT NULL DEFAULT 0,
  series      text    NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  sort_order  int     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS races_date_idx  ON races(race_date);
CREATE INDEX IF NOT EXISTS races_active_idx ON races(active);
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "races_select" ON races;
DROP POLICY IF EXISTS "races_insert" ON races;
DROP POLICY IF EXISTS "races_update" ON races;
DROP POLICY IF EXISTS "races_delete" ON races;
CREATE POLICY "races_select" ON races FOR SELECT USING (true);
CREATE POLICY "races_insert" ON races FOR INSERT WITH CHECK (
  label <> '' AND race_date IS NOT NULL
);
CREATE POLICY "races_update" ON races FOR UPDATE USING (true);
CREATE POLICY "races_delete" ON races FOR DELETE USING (true);

-- [007_seed_gbsc_races_2026.sql intentionally EXCLUDED — GBSC-only race data]
-- [008_seed_rcyc_demo.sql intentionally EXCLUDED — placeholder demo boats/races, superseded by real data below]

-- 009 — skipper declarations
CREATE TABLE IF NOT EXISTS skipper_declarations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id         text        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  skipper_name    text        NOT NULL,
  season          int         NOT NULL,
  read_sis        boolean     NOT NULL DEFAULT false,
  read_rrs        boolean     NOT NULL DEFAULT false,
  read_safety     boolean     NOT NULL DEFAULT false,
  accept_responsibility boolean NOT NULL DEFAULT false,
  declared_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS skipper_declarations_boat_season
  ON skipper_declarations(boat_id, season);
ALTER TABLE skipper_declarations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert" ON skipper_declarations;
DROP POLICY IF EXISTS "anon_select" ON skipper_declarations;
CREATE POLICY "anon_insert" ON skipper_declarations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select" ON skipper_declarations FOR SELECT TO anon USING (true);

-- 010 — course card courses + series fees
CREATE TABLE IF NOT EXISTS course_card_courses (
  number          int         PRIMARY KEY,
  wind_direction  text        NOT NULL,
  name            text,
  grassy_walk_note boolean NOT NULL DEFAULT false,
  rounds          jsonb       NOT NULL,
  notes           text
);
ALTER TABLE course_card_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select" ON course_card_courses;
DROP POLICY IF EXISTS "anon_insert" ON course_card_courses;
DROP POLICY IF EXISTS "anon_update" ON course_card_courses;
CREATE POLICY "anon_select" ON course_card_courses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON course_card_courses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON course_card_courses FOR UPDATE TO anon USING (true);

ALTER TABLE published_courses
  ADD COLUMN IF NOT EXISTS course_number int REFERENCES course_card_courses(number),
  ADD COLUMN IF NOT EXISTS rounds jsonb;

CREATE TABLE IF NOT EXISTS series_fees (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id     text        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  series_name text        NOT NULL,
  season      int         NOT NULL,
  amount      numeric(6,2) NOT NULL DEFAULT 0,
  method      text        NOT NULL DEFAULT 'Cash',
  paid_at     timestamptz NOT NULL DEFAULT now(),
  notes       text
);
CREATE INDEX IF NOT EXISTS series_fees_boat_season ON series_fees(boat_id, season);
ALTER TABLE series_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert" ON series_fees;
DROP POLICY IF EXISTS "anon_select" ON series_fees;
DROP POLICY IF EXISTS "anon_delete" ON series_fees;
CREATE POLICY "anon_insert" ON series_fees FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select" ON series_fees FOR SELECT TO anon USING (true);
CREATE POLICY "anon_delete" ON series_fees FOR DELETE TO anon USING (true);

-- 012 — settings.features jsonb
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 013 — start_finish_lines table + published_courses extended columns + upsert grants
CREATE TABLE IF NOT EXISTS start_finish_lines (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  lat1        double precision NOT NULL,
  lng1        double precision NOT NULL,
  lat2        double precision NOT NULL,
  lng2        double precision NOT NULL,
  is_default  boolean DEFAULT false,
  is_active   boolean DEFAULT true,
  sort_order  integer DEFAULT 0
);
ALTER TABLE start_finish_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read lines"   ON start_finish_lines;
DROP POLICY IF EXISTS "anon insert lines" ON start_finish_lines;
DROP POLICY IF EXISTS "anon update lines" ON start_finish_lines;
DROP POLICY IF EXISTS "anon delete lines" ON start_finish_lines;
CREATE POLICY "anon read lines"   ON start_finish_lines FOR SELECT USING (true);
CREATE POLICY "anon insert lines" ON start_finish_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update lines" ON start_finish_lines FOR UPDATE USING (true);
CREATE POLICY "anon delete lines" ON start_finish_lines FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON start_finish_lines TO anon;

ALTER TABLE published_courses
  ADD COLUMN IF NOT EXISTS start_line_id  text DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS finish_line_id text DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS course_number  int,
  ADD COLUMN IF NOT EXISTS rounds         jsonb;

DROP POLICY IF EXISTS "anon_update_published_courses" ON published_courses;
CREATE POLICY "anon_update_published_courses" ON published_courses FOR UPDATE TO anon USING (true);
GRANT UPDATE ON published_courses TO anon;

-- [20260421_start_finish_lines.sql intentionally EXCLUDED — table/columns
-- fully superseded by 013 above; its seed data was GBSC's Galway Bay lines]

-- 017 — settings extended columns
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS worldtides_key          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ro_revolut_user         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS results_published_race_key text;

-- 018 — grant anon access to all app tables
GRANT SELECT, INSERT, UPDATE, DELETE ON races              TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON race_records       TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON race_payments      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON race_attendees     TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_logs       TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON skipper_declarations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_card_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON series_fees        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON marks              TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON published_courses  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON start_finish_lines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON boats              TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON crew               TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings           TO anon;

-- 019 — boats.stripe_link
ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS stripe_link text NOT NULL DEFAULT '';

-- 033 — boats.sail_number (for HalSail finish-recording CSV export)
ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS sail_number text NOT NULL DEFAULT '';

-- 020 — settings: per-club config columns
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS logo_url          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS favicon_url       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS primary_color     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ro_color          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_lat         double precision,
  ADD COLUMN IF NOT EXISTS start_lng         double precision,
  ADD COLUMN IF NOT EXISTS wind_lat          double precision,
  ADD COLUMN IF NOT EXISTS wind_lng          double precision,
  ADD COLUMN IF NOT EXISTS tide_station      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tide_odm_offset   double precision NOT NULL DEFAULT 2.95,
  ADD COLUMN IF NOT EXISTS fee_full          int  NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS fee_crew          int  NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS fee_visitor       int  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS fee_student       int  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS fee_kid           int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visitor_max       int  NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS crew_max_yrs      int  NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ro_pin            text NOT NULL DEFAULT '0000',
  ADD COLUMN IF NOT EXISTS noticeboard_url   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS results_url       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hal_club          int,
  ADD COLUMN IF NOT EXISTS vapid_public_key  text NOT NULL DEFAULT '';

-- 021 — registrations.looking_for_crew
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS looking_for_crew boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS "anon_update_registrations" ON registrations;
CREATE POLICY "anon_update_registrations" ON registrations FOR UPDATE USING (true) WITH CHECK (true);
GRANT UPDATE (looking_for_crew) ON registrations TO anon;

-- 022 — crew_available
CREATE TABLE IF NOT EXISTS crew_available (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  phone      text NOT NULL,
  experience text NOT NULL,
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone)
);
ALTER TABLE crew_available ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_available_select" ON crew_available;
DROP POLICY IF EXISTS "crew_available_insert" ON crew_available;
DROP POLICY IF EXISTS "crew_available_update" ON crew_available;
DROP POLICY IF EXISTS "crew_available_delete" ON crew_available;
CREATE POLICY "crew_available_select" ON crew_available FOR SELECT USING (true);
CREATE POLICY "crew_available_insert" ON crew_available FOR INSERT WITH CHECK (true);
CREATE POLICY "crew_available_update" ON crew_available FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "crew_available_delete" ON crew_available FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_available TO anon;
GRANT USAGE, SELECT ON SEQUENCE crew_available_id_seq TO anon;

-- 023 — restore immutable-table grants (undo part of 018's blanket grant)
REVOKE UPDATE, DELETE ON race_records FROM anon;
REVOKE UPDATE, DELETE ON self_payments FROM anon;
REVOKE SELECT, UPDATE ON push_subscriptions FROM anon;

-- 024 — re-restore race_records UPDATE (023 over-revoked it; auto-save upsert needs it)
GRANT UPDATE ON race_records TO anon;
DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);

-- 025 — race_payments.payment_ref
ALTER TABLE race_payments ADD COLUMN IF NOT EXISTS payment_ref text;
CREATE INDEX IF NOT EXISTS race_payments_payment_ref_idx ON race_payments(payment_ref);

-- 026 — news_items (was only ever run ad-hoc from the loose root file
-- gbsc-news-table.sql on GBSC's project, never in the tracked migrations
-- until now — needed for the public News ticker / RO News panel)
CREATE TABLE IF NOT EXISTS news_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  url           text,
  body          text,
  active        boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read news"   ON news_items;
DROP POLICY IF EXISTS "anon insert news" ON news_items;
DROP POLICY IF EXISTS "anon update news" ON news_items;
DROP POLICY IF EXISTS "anon delete news" ON news_items;
CREATE POLICY "anon read news"   ON news_items FOR SELECT USING (true);
CREATE POLICY "anon insert news" ON news_items FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update news" ON news_items FOR UPDATE USING (true);
CREATE POLICY "anon delete news" ON news_items FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON news_items TO anon;

-- 027 — protest types: Redress and Scoring Enquiry alongside Protest
ALTER TABLE protests
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'protest'
    CHECK (type IN ('protest','redress','scoring_enquiry'));
ALTER TABLE protests ALTER COLUMN protestee_id DROP NOT NULL;
DROP POLICY IF EXISTS "protests_insert" ON protests;
CREATE POLICY "protests_insert" ON protests FOR INSERT WITH CHECK (
  protestor_id IS NOT NULL
  AND (protestee_id IS NULL OR protestor_id <> protestee_id)
  AND (protestee_id IS NOT NULL OR type <> 'protest')
  AND description <> ''
);

-- 028 — race_starts: start sequence simulator (flags/countdown, no RO on the line)
CREATE TABLE IF NOT EXISTS race_starts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  start_time  timestamptz NOT NULL,
  flag_system text NOT NULL DEFAULT 'P' CHECK (flag_system IN ('P','U','Black','I','Z')),
  class_flag  text NOT NULL DEFAULT 'E' CHECK (class_flag IN ('E','0','1','2')),
  status      text NOT NULL DEFAULT 'armed' CHECK (status IN ('armed','cancelled','postponed')),
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_starts_status_idx ON race_starts(status, start_time);
ALTER TABLE race_starts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_starts_select" ON race_starts;
DROP POLICY IF EXISTS "race_starts_insert" ON race_starts;
DROP POLICY IF EXISTS "race_starts_update" ON race_starts;
DROP POLICY IF EXISTS "race_starts_delete" ON race_starts;
CREATE POLICY "race_starts_select" ON race_starts FOR SELECT USING (true);
CREATE POLICY "race_starts_insert" ON race_starts FOR INSERT WITH CHECK (start_time IS NOT NULL);
CREATE POLICY "race_starts_update" ON race_starts FOR UPDATE USING (true);
CREATE POLICY "race_starts_delete" ON race_starts FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON race_starts TO anon;
GRANT USAGE, SELECT ON SEQUENCE race_starts_id_seq TO anon;


-- ============================================================
-- SECTION 3 — RCYC-specific fix: geographic bounds on marks
-- ============================================================
-- The marks_insert policy created in Section 1 restricts new marks (via
-- the anon/app role — i.e. the RO's in-app Marks Manager) to Galway Bay
-- coordinates. Cork Harbour is outside that box, so RCYC's RO would be
-- silently blocked (RLS 403) from adding a NEW mark, even though this
-- script itself can seed marks fine (SQL Editor runs as postgres, which
-- bypasses RLS). Widen to cover the whole Irish coast.
DROP POLICY IF EXISTS "marks_insert" ON marks;
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 51.0 AND 55.5
  AND lng BETWEEN -11.0 AND -5.5
);


-- ============================================================
-- SECTION 4 — RCYC seed data (real, not demo)
-- ============================================================

-- 011 — RCYC Keelboat Racing Course Card (2023 edition, DOSCO-sponsored)
INSERT INTO course_card_courses (number, wind_direction, name, grassy_walk_note, rounds) VALUES

(1, 'S/SW or N/NE', 'Admiral''s Choice', false, '[
  {"label":"Round 1","marks":"Ringabella (P) – W2 (P) – Cage (S)","distance_nm":6},
  {"label":"Round 2","marks":"No.7 (S) – Cage (P)","distance_nm":8},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":9.8}
]'::jsonb),

(2, 'S/SW or N/NE', 'Vice Admiral''s Choice', false, '[
  {"label":"Round 1","marks":"Dutchman Mark (P) – W2 (P) – Cage (S)","distance_nm":4,"note":"Dutchman is a laid club mark approx. 2 cables SE of Dutchman Rock/Fennells Bay"},
  {"label":"Round 2","marks":"No.7 (S) – Cage (P)","distance_nm":6},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":8}
]'::jsonb),

(3, 'S/SE or N/NW', 'Rear Admiral''s Choice', false, '[
  {"label":"Round 1","marks":"Harp Mark (P) – E1 (P) – Cage (S)","distance_nm":8},
  {"label":"Round 2","marks":"No.7 (S) – Cage (P)","distance_nm":10},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":12}
]'::jsonb),

(4, 'N', null, true, '[
  {"label":"Round 1","marks":"No.13 (S) – No.11 (S) – No.10 (P) – Dosco (S) – Cage (P)","distance_nm":6},
  {"label":"Round 2","marks":"W4 (S) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"No.5 (P) – No.14 (S) – Dosco (S) – Finish","distance_nm":11}
]'::jsonb),

(5, 'N', null, false, '[
  {"label":"Round 1","marks":"W4 (P) – No.10 (S) – No.7 (S) – Dosco (S) – Cage (S)","distance_nm":4.4},
  {"label":"Round 2","marks":"No.12 (S) – No.5 (S) – Cage (S)","distance_nm":7.1},
  {"label":"Round 3","marks":"No.10 (S) – No.5 (S) – Finish","distance_nm":9.4}
]'::jsonb),

(6, 'NE', null, false, '[
  {"label":"Round 1","marks":"No.7 (P) – No.10 (P) – Cage (P) – No.7 (S) – Cage (S)","distance_nm":4.3},
  {"label":"Round 2","marks":"No.9 (S) – Cage (S)","distance_nm":7.7},
  {"label":"Round 3","marks":"No.7 (S) – Dosco (S) – Finish","distance_nm":10}
]'::jsonb),

(7, 'NE', null, false, '[
  {"label":"Round 1","marks":"No.11 (P) – Cage (P)","distance_nm":4},
  {"label":"Round 2","marks":"No.9 (P) – No.10 (P) – Dosco (S) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"No.7 (S) – No.5 (S) – Finish","distance_nm":10}
]'::jsonb),

(8, 'E', null, true, '[
  {"label":"Round 1","marks":"No.10 (S) – EF2 (S) – No.8 (P) – Dosco (S) – Cage (S)","distance_nm":6.4},
  {"label":"Round 2","marks":"Dosco (S) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"Dosco (P) – No.8 (P) – No.5 (S) – Finish","distance_nm":10.2}
]'::jsonb),

(9, 'E', null, true, '[
  {"label":"Round 1","marks":"No.18 (P) – No.20 (P) – No.13 (S) – No.5 (S) – Cage (S)","distance_nm":6.4},
  {"label":"Round 2","marks":"Dosco (P) – Cage (P)","distance_nm":8},
  {"label":"Round 3","marks":"W4 (P) – No.3 (P) – Finish","distance_nm":10.3}
]'::jsonb),

(10, 'SE', null, false, '[
  {"label":"Round 1","marks":"E1 (P) – Cage (S)","distance_nm":2.8},
  {"label":"Round 2","marks":"No.10 (S) – Dosco (S) – Cage (P)","distance_nm":5.3},
  {"label":"Round 3","marks":"No.3 (P) – No.10 (S) – Dosco (S) – Finish","distance_nm":9.5}
]'::jsonb),

(11, 'SE', null, false, '[
  {"label":"Round 1","marks":"E4 (P) – Cage (S) – No.10 (S) – Dosco (S) – Cage (S)","distance_nm":4.7},
  {"label":"Round 2","marks":"No.8 (S) – No.3 (P) – No.5 (P) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"No.10 (S) – Dosco (S) – Finish","distance_nm":10.5}
]'::jsonb),

(12, 'S', null, false, '[
  {"label":"Round 1","marks":"E2 (P) – No.14 (S) – Dosco (S) – Cage (S)","distance_nm":7},
  {"label":"Round 2","marks":"No.7 (S) – No.5 (S) – Cage (S)","distance_nm":9},
  {"label":"Round 3","marks":"No.7 (P) – No.13 (S) – Dosco (S) – Finish","distance_nm":12}
]'::jsonb),

(13, 'S', null, false, '[
  {"label":"Round 1","marks":"W1 (P) – No.10 (P) – Cage (P)","distance_nm":4.4},
  {"label":"Round 2","marks":"No.12 (S) – No.6 (P) – No.5 (P) – Finish","distance_nm":8.5}
]'::jsonb),

(14, 'S', null, false, '[
  {"label":"Round 1","marks":"Mark A (P) – Cage (S)","distance_nm":5.6},
  {"label":"Round 2","marks":"No.10 (S) – No.5 (S) – Finish","distance_nm":7.8}
]'::jsonb),

(15, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (S) – No.7 (P) – No.13 (S) – No.9 (S) – Cage (S)","distance_nm":6.5},
  {"label":"Round 2","marks":"No.7 (S) – Cage (S)","distance_nm":8.5},
  {"label":"Round 3","marks":"No.9 (S) – Finish","distance_nm":12}
]'::jsonb),

(16, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (S) – No.11 (S) – Cage (P)","distance_nm":5.8},
  {"label":"Round 2","marks":"No.7 (P) – Cage (P)","distance_nm":7.8},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":9.8}
]'::jsonb),

(17, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (P) – No.3 (S) – W2 (S) – No.6 (P) – Cage (S)","distance_nm":4.7},
  {"label":"Round 2","marks":"No.7 (S) – Dosco (S) – Cage (S)","distance_nm":7},
  {"label":"Round 3","marks":"No.9 (S) – Finish","distance_nm":10.6}
]'::jsonb),

(18, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (P) – No.3 (S) – W2 (S) – No.6 (P) – Cage (S)","distance_nm":5},
  {"label":"Round 2","marks":"No.9 (S) – No.5 (S) – Cage (S)","distance_nm":8.6},
  {"label":"Round 3","marks":"No.11 (P) – Finish","distance_nm":12.8}
]'::jsonb),

(19, 'SW', null, false, '[
  {"label":"Round 1","marks":"No.7 (P) – Cage (S) – No.11 (S) – Cage (P)","distance_nm":8.4},
  {"label":"Round 2","marks":"Dosco (S) – Cage (S)","distance_nm":10},
  {"label":"Round 3","marks":"No.7 (S) – Finish","distance_nm":12}
]'::jsonb),

(20, 'W', null, true, '[
  {"label":"Round 1","marks":"No.8 (S) – No.10 (S) – EF2 (P) – No.20 (P) – No.13 (S) – Dosco (S) – Cage (P)","distance_nm":8.5},
  {"label":"Round 2","marks":"Dosco (P) – Cage (S)","distance_nm":12.5},
  {"label":"Round 3","marks":"No.5 (S) – Finish","distance_nm":13.5}
]'::jsonb),

(21, 'W', null, true, '[
  {"label":"Round 1","marks":"Cage (S) – Dosco (S) – Cage (S)","distance_nm":2.5},
  {"label":"Round 2","marks":"No.8 (S) – No.5 (S) – Cage (S)","distance_nm":4},
  {"label":"Round 3","marks":"No.8 (S) – Dosco (S) – Finish","distance_nm":6}
]'::jsonb),

(22, 'W', null, true, '[
  {"label":"Round 1","marks":"No.8 (S) – No.10 (S) – No.7 (S) – Dosco (S)","distance_nm":2.7},
  {"label":"Round 2","marks":"Cage (S) – Dosco (S) – Cage (S)","distance_nm":5.2},
  {"label":"Round 3","marks":"No.8 (S) – No.5 (S) – Finish","distance_nm":6.7}
]'::jsonb),

(23, 'W', null, true, '[
  {"label":"Round 1","marks":"No.8 (P) – No.3 (S) – W4 (S) – Cage (S)","distance_nm":4.1},
  {"label":"Round 2","marks":"Dosco (P) – No.8 (P) – No.5 (S) – Finish","distance_nm":6.5}
]'::jsonb),

(24, 'NW', null, true, '[
  {"label":"Round 1","marks":"No.10 (S) – No.9 (P) – No.20 (S) – No.13 (S) – Dosco (S) – Cage (P)","distance_nm":6.5},
  {"label":"Round 2","marks":"No.3 (P) – Cage (S)","distance_nm":8.7},
  {"label":"Round 3","marks":"No.7 (S) – No.3 (S) – Finish","distance_nm":12.3}
]'::jsonb),

(25, 'NW', null, true, '[
  {"label":"Round 1","marks":"No.12 (P) – E2 (S) – No.8 (S) – No.5 (S) – Cage (P)","distance_nm":6.8},
  {"label":"Round 2","marks":"E4 (P) – Cage (P)","distance_nm":9.1},
  {"label":"Round 3","marks":"W4 (P) – Finish","distance_nm":11}
]'::jsonb),

(26, 'NW', null, false, '[
  {"label":"Round 1","marks":"No.3 (P) – No.10 (S) – No.5 (S) – Cage (P)","distance_nm":4.1},
  {"label":"Round 2","marks":"No.3 (P) – No.8 (S) – Dosco (S) – Finish","distance_nm":7.9}
]'::jsonb),

(27, 'NW', null, false, '[
  {"label":"Round 1","marks":"E1 (P) – No.6 (S) – No.3 (P) – Cage (S)","distance_nm":4.2},
  {"label":"Round 2","marks":"No.5 (P) – No.10 (S) – No.3 (S) – Finish","distance_nm":8.4}
]'::jsonb)

ON CONFLICT (number) DO UPDATE
  SET wind_direction   = excluded.wind_direction,
      name             = excluded.name,
      grassy_walk_note = excluded.grassy_walk_note,
      rounds           = excluded.rounds;


-- 014 — RCYC start/finish line (Grassy Walk)
INSERT INTO start_finish_lines (id, name, lat1, lng1, lat2, lng2, is_default, is_active, sort_order) VALUES
  ('grassy', 'Grassy Walk Start/Finish',
   51 + 48.50/60, -(8 + 17.60/60),
   51 + 48.30/60, -(8 + 17.40/60),
   true, true, 0)
ON CONFLICT (id) DO UPDATE
  SET name       = excluded.name,
      lat1       = excluded.lat1,
      lng1       = excluded.lng1,
      lat2       = excluded.lat2,
      lng2       = excluded.lng2,
      is_default = excluded.is_default,
      sort_order = excluded.sort_order;


-- 015 — RCYC race marks
INSERT INTO marks (id, name, lat, lng, colour, description, active, sort_order) VALUES

  ('rcyc_dosco',      'Dosco',         51+49.26/60, -(8+15.81/60), '#f4a261',
   'Corkbeg. Insert as M1 on Grassy Walk courses.',                            true,  0),

  ('rcyc_ringabella', 'Ringabella',    51+46.24/60, -(8+17.52/60), '#f4a261',
   '',                                                                          true,  1),

  ('rcyc_harp',       'Harp',          51+47.19/60, -(8+14.21/60), '#f4a261',
   '',                                                                          true,  2),

  ('rcyc_east',       'East Mark',     51+46.31/60, -(8+14.18/60), '#f4a261',
   'Formerly Mark B.',                                                          true,  3),

  ('rcyc_spike',      'Spike',         51+49.70/60, -(8+17.00/60), '#f4a261',
   'South side of Spike Island. Position estimated — confirm with club.',       true, 10),

  ('rcyc_cage',       'Cage',          51+48.30/60, -(8+17.40/60), '#00bcd4',
   'Seaward pin end of Grassy Walk start/finish line. Position estimated.',     true, 11),

  ('rcyc_grassy',     'Grassy Walk',   51+48.50/60, -(8+17.60/60), '#00bcd4',
   'Shore/committee end of start/finish line at tip of Point Road, Crosshaven. Position estimated.', true, 12),

  ('rcyc_rochespt',   'Roche''s Point',     51+47.586/60, -(8+15.287/60), '#5c9bd6',
   'Lighthouse Fl WR 3s. Harbour entrance reference.',                          true, 20),

  ('rcyc_spitbank',   'Spit Bank',          51+50.720/60, -(8+16.452/60), '#5c9bd6',
   'Lighthouse WR 4s at Spit Bank, upper harbour.',                             true, 21),

  ('rcyc_buoy5',      'Buoy No. 5',         51+48.997/60, -(8+16.219/60), '#5c9bd6',
   'Starboard (green) channel lateral buoy.',                                   true, 22),

  ('rcyc_buoy8',      'Buoy No. 8',         51+49.38/60,  -(8+16.66/60),  '#5c9bd6',
   'Port channel lateral buoy (turbidity reference). Position approximate.',    true, 23),

  ('rcyc_daunt',      'Daunt Rock',         51+43.531/60, -(8+17.665/60), '#5c9bd6',
   'Port lateral buoy Fl(2)R 6s. Outer harbour.',                               true, 24),

  ('rcyc_seabuoy',    'Cork Sea Buoy',      51+42.935/60, -(8+15.601/60), '#5c9bd6',
   'Safe water mark LFl 10s. Approach waypoint outside harbour.',               true, 25)

ON CONFLICT (id) DO UPDATE
  SET name        = excluded.name,
      lat         = excluded.lat,
      lng         = excluded.lng,
      colour      = excluded.colour,
      description = excluded.description,
      sort_order  = excluded.sort_order;


-- 016 — RCYC Race Calendar 2025–2026
-- Clears any placeholder demo races from an old migration 008 run — harmless
-- no-op on a fresh database.
DELETE FROM races WHERE series IN ('Wednesday Night Racing', 'Tricentennial Cup');

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Thursday Night League — Thu 1 May',  '2025-05-01', 18,  0, 'Thursday Night League', 1),
  ('Thursday Night League — Thu 8 May',  '2025-05-08', 18,  0, 'Thursday Night League', 2),
  ('Thursday Night League — Thu 15 May', '2025-05-15', 18,  0, 'Thursday Night League', 3),
  ('Thursday Night League — Thu 22 May', '2025-05-22', 18,  0, 'Thursday Night League', 4),
  ('Thursday Night League — Thu 29 May', '2025-05-29', 18,  0, 'Thursday Night League', 5),
  ('Thursday Night League — Thu 5 Jun',  '2025-06-05', 18,  0, 'Thursday Night League', 6),
  ('Thursday Night League — Thu 12 Jun', '2025-06-12', 18,  0, 'Thursday Night League', 7),
  ('Thursday Night League — Thu 19 Jun', '2025-06-19', 18,  0, 'Thursday Night League', 8),
  ('Thursday Night League — Thu 26 Jun', '2025-06-26', 18,  0, 'Thursday Night League', 9),
  ('Thursday Night League — Thu 3 Jul',  '2025-07-03', 18,  0, 'Thursday Night League', 10),
  ('Thursday Night League — Thu 10 Jul', '2025-07-10', 18,  0, 'Thursday Night League', 11),
  ('Thursday Night League — Thu 17 Jul', '2025-07-17', 18,  0, 'Thursday Night League', 12),
  ('Thursday Night League — Thu 24 Jul', '2025-07-24', 18,  0, 'Thursday Night League', 13),
  ('Thursday Night League — Thu 31 Jul', '2025-07-31', 18,  0, 'Thursday Night League', 14),
  ('Thursday Night League — Thu 7 Aug',  '2025-08-07', 18,  0, 'Thursday Night League', 15),
  ('Thursday Night League — Thu 14 Aug', '2025-08-14', 18,  0, 'Thursday Night League', 16),
  ('Thursday Night League — Thu 21 Aug', '2025-08-21', 18,  0, 'Thursday Night League', 17),
  ('Thursday Night League — Thu 28 Aug', '2025-08-28', 18,  0, 'Thursday Night League', 18),
  ('Thursday Night League — Thu 4 Sep',  '2025-09-04', 18,  0, 'Thursday Night League', 19),
  ('Thursday Night League — Thu 11 Sep', '2025-09-11', 18,  0, 'Thursday Night League', 20)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Friday Night League — Fri 2 May',   '2025-05-02', 18, 55, 'Friday Night League', 1),
  ('Friday Night League — Fri 9 May',   '2025-05-09', 18, 55, 'Friday Night League', 2),
  ('Friday Night League — Fri 16 May',  '2025-05-16', 18, 55, 'Friday Night League', 3),
  ('Friday Night League — Fri 23 May',  '2025-05-23', 18, 55, 'Friday Night League', 4),
  ('Friday Night League — Fri 30 May',  '2025-05-30', 18, 55, 'Friday Night League', 5),
  ('Friday Night League — Fri 6 Jun',   '2025-06-06', 18, 55, 'Friday Night League', 6),
  ('Friday Night League — Fri 13 Jun',  '2025-06-13', 18, 55, 'Friday Night League', 7),
  ('Friday Night League — Fri 20 Jun',  '2025-06-20', 18, 55, 'Friday Night League', 8),
  ('Friday Night League — Fri 27 Jun',  '2025-06-27', 18, 55, 'Friday Night League', 9),
  ('Friday Night League — Fri 4 Jul',   '2025-07-04', 18, 55, 'Friday Night League', 10),
  ('Friday Night League — Fri 11 Jul',  '2025-07-11', 18, 55, 'Friday Night League', 11),
  ('Friday Night League — Fri 18 Jul',  '2025-07-18', 18, 55, 'Friday Night League', 12),
  ('Friday Night League — Fri 25 Jul',  '2025-07-25', 18, 55, 'Friday Night League', 13),
  ('Friday Night League — Fri 1 Aug',   '2025-08-01', 18, 55, 'Friday Night League', 14),
  ('Friday Night League — Fri 8 Aug',   '2025-08-08', 18, 55, 'Friday Night League', 15),
  ('Friday Night League — Fri 15 Aug',  '2025-08-15', 18, 55, 'Friday Night League', 16),
  ('Friday Night League — Fri 22 Aug',  '2025-08-22', 18, 55, 'Friday Night League', 17),
  ('Friday Night League — Fri 29 Aug',  '2025-08-29', 18, 55, 'Friday Night League', 18),
  ('Friday Night League — Fri 5 Sep',   '2025-09-05', 18, 55, 'Friday Night League', 19),
  ('Friday Night League — Fri 12 Sep',  '2025-09-12', 18, 55, 'Friday Night League', 20)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Saturday Series — Sat 3 May',   '2025-05-03', 11, 0, 'Saturday Series League', 1),
  ('Saturday Series — Sat 26 Jul',  '2025-07-26', 11, 0, 'Saturday Series League', 2)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Sunday Racing — Sun 18 May', '2025-05-18', 11, 0, 'Sunday Racing', 1),
  ('Sunday Racing — Sun 15 Jun', '2025-06-15', 11, 0, 'Sunday Racing', 2)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Autumn League — Sun 28 Sep',  '2025-09-28', 11, 25, 'Autumn League', 1),
  ('Autumn League — Sun 5 Oct',   '2025-10-05', 11, 25, 'Autumn League', 2),
  ('Autumn League — Sun 12 Oct',  '2025-10-12', 11, 25, 'Autumn League', 3),
  ('Autumn League — Sun 19 Oct',  '2025-10-19', 11, 25, 'Autumn League', 4),
  ('Autumn League — Sun 26 Oct',  '2025-10-26', 11, 25, 'Autumn League', 5)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Ocean to City Race',                      '2025-05-31',  8,  0, 'Offshore Race',       1),
  ('Coolmore Race',                           '2025-06-21', 13, 30, 'Offshore Race',       2),
  ('Midsummer Madness',                       '2025-06-21',  8,  0, 'One-Off Race',        3),
  ('ICRA National Championships / Sovereigns Cup', '2025-06-25', 8, 0, 'Championship',    4),
  ('Rolex Fastnet Race',                      '2025-07-26',  8,  0, 'Offshore',            5),
  ('Race, Cruise & Stay',                     '2025-08-16',  8,  0, 'Cruising',            6),
  ('Royal Cork At Home',                      '2025-08-23',  8,  0, 'At Home Regatta',     7),
  ('ICRA Nationals 2025',                     '2025-08-30',  8,  0, 'Championship',        8),
  ('Blackrock Race',                          '2025-09-06',  8,  0, 'One-Off Race',        9),
  ('Naval Race',                              '2025-09-20',  8,  0, 'One-Off Race',        10)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Thursday Night League — Thu 7 May',  '2026-05-07', 18,  0, 'Thursday Night League', 1),
  ('Thursday Night League — Thu 14 May', '2026-05-14', 18,  0, 'Thursday Night League', 2),
  ('Thursday Night League — Thu 21 May', '2026-05-21', 18,  0, 'Thursday Night League', 3),
  ('Thursday Night League — Thu 28 May', '2026-05-28', 18,  0, 'Thursday Night League', 4),
  ('Thursday Night League — Thu 4 Jun',  '2026-06-04', 18,  0, 'Thursday Night League', 5),
  ('Thursday Night League — Thu 11 Jun', '2026-06-11', 18,  0, 'Thursday Night League', 6),
  ('Thursday Night League — Thu 18 Jun', '2026-06-18', 18,  0, 'Thursday Night League', 7),
  ('Thursday Night League — Thu 25 Jun', '2026-06-25', 18,  0, 'Thursday Night League', 8),
  ('Thursday Night League — Thu 2 Jul',  '2026-07-02', 18,  0, 'Thursday Night League', 9),
  ('Thursday Night League — Thu 9 Jul',  '2026-07-09', 18,  0, 'Thursday Night League', 10),
  ('Thursday Night League — Thu 16 Jul', '2026-07-16', 18,  0, 'Thursday Night League', 11),
  ('Thursday Night League — Thu 23 Jul', '2026-07-23', 18,  0, 'Thursday Night League', 12),
  ('Thursday Night League — Thu 30 Jul', '2026-07-30', 18,  0, 'Thursday Night League', 13),
  ('Thursday Night League — Thu 6 Aug',  '2026-08-06', 18,  0, 'Thursday Night League', 14),
  ('Thursday Night League — Thu 13 Aug', '2026-08-13', 18,  0, 'Thursday Night League', 15),
  ('Thursday Night League — Thu 20 Aug', '2026-08-20', 18,  0, 'Thursday Night League', 16),
  ('Thursday Night League — Thu 27 Aug', '2026-08-27', 18,  0, 'Thursday Night League', 17),
  ('Thursday Night League — Thu 3 Sep',  '2026-09-03', 18,  0, 'Thursday Night League', 18),
  ('Thursday Night League — Thu 10 Sep', '2026-09-10', 18,  0, 'Thursday Night League', 19)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Friday Night League — Fri 1 May',   '2026-05-01', 18, 55, 'Friday Night League', 1),
  ('Friday Night League — Fri 8 May',   '2026-05-08', 18, 55, 'Friday Night League', 2),
  ('Friday Night League — Fri 15 May',  '2026-05-15', 18, 55, 'Friday Night League', 3),
  ('Friday Night League — Fri 22 May',  '2026-05-22', 18, 55, 'Friday Night League', 4),
  ('Friday Night League — Fri 29 May',  '2026-05-29', 18, 55, 'Friday Night League', 5),
  ('Friday Night League — Fri 5 Jun',   '2026-06-05', 18, 55, 'Friday Night League', 6),
  ('Friday Night League — Fri 12 Jun',  '2026-06-12', 18, 55, 'Friday Night League', 7),
  ('Friday Night League — Fri 19 Jun',  '2026-06-19', 18, 55, 'Friday Night League', 8),
  ('Friday Night League — Fri 26 Jun',  '2026-06-26', 18, 55, 'Friday Night League', 9),
  ('Friday Night League — Fri 3 Jul',   '2026-07-03', 18, 55, 'Friday Night League', 10),
  ('Friday Night League — Fri 10 Jul',  '2026-07-10', 18, 55, 'Friday Night League', 11),
  ('Friday Night League — Fri 17 Jul',  '2026-07-17', 18, 55, 'Friday Night League', 12),
  ('Friday Night League — Fri 24 Jul',  '2026-07-24', 18, 55, 'Friday Night League', 13),
  ('Friday Night League — Fri 31 Jul',  '2026-07-31', 18, 55, 'Friday Night League', 14),
  ('Friday Night League — Fri 7 Aug',   '2026-08-07', 18, 55, 'Friday Night League', 15),
  ('Friday Night League — Fri 14 Aug',  '2026-08-14', 18, 55, 'Friday Night League', 16),
  ('Friday Night League — Fri 21 Aug',  '2026-08-21', 18, 55, 'Friday Night League', 17),
  ('Friday Night League — Fri 28 Aug',  '2026-08-28', 18, 55, 'Friday Night League', 18),
  ('Friday Night League — Fri 4 Sep',   '2026-09-04', 18, 55, 'Friday Night League', 19),
  ('Friday Night League — Fri 11 Sep',  '2026-09-11', 18, 55, 'Friday Night League', 20)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Autumn League — Sun 27 Sep', '2026-09-27', 11, 25, 'Autumn League', 1),
  ('Autumn League — Sun 4 Oct',  '2026-10-04', 11, 25, 'Autumn League', 2),
  ('Autumn League — Sun 11 Oct', '2026-10-11', 11, 25, 'Autumn League', 3),
  ('Autumn League — Sun 18 Oct', '2026-10-18', 11, 25, 'Autumn League', 4),
  ('Autumn League — Sun 25 Oct', '2026-10-25', 11, 25, 'Autumn League', 5)
ON CONFLICT DO NOTHING;

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Crosshaven House PY1000',          '2026-03-29', 15, 15, 'Open Dinghy Race',   1),
  ('1720 Southerns',                   '2026-05-16',  8,  0, 'Class Championship', 2),
  ('Ocean to City Race',               '2026-05-30',  8,  0, 'Offshore Race',      3),
  ('Mid Summer Madness Round Spike',   '2026-06-13',  8,  0, 'One-Off Race',       4),
  ('Rankin Worlds',                    '2026-06-28',  8,  0, 'Class Championship', 5),
  ('Cork Week 2026 — Mon 6 Jul',       '2026-07-06',  8,  0, 'Cork Week 2026',     1),
  ('Cork Week 2026 — Tue 7 Jul',       '2026-07-07',  8,  0, 'Cork Week 2026',     2),
  ('Cork Week 2026 — Wed 8 Jul',       '2026-07-08',  8,  0, 'Cork Week 2026',     3),
  ('Cork Week 2026 — Thu 9 Jul',       '2026-07-09',  8,  0, 'Cork Week 2026',     4),
  ('Cork Week 2026 — Fri 10 Jul',      '2026-07-10',  8,  0, 'Cork Week 2026',     5),
  ('Cock of The North (N18)',          '2026-07-24',  8,  0, 'National 18',        6),
  ('Optimist Nationals',               '2026-08-12',  8,  0, 'Championship',       7),
  ('At Home Regatta',                  '2026-08-22',  8,  0, 'At Home Regatta',    8)
ON CONFLICT DO NOTHING;


-- ── boat-photos storage bucket ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('boat-photos', 'boat-photos', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "boat_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "boat_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "boat_photos_update" ON storage.objects;
CREATE POLICY "boat_photos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'boat-photos');
CREATE POLICY "boat_photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'boat-photos');
CREATE POLICY "boat_photos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'boat-photos');
ALTER TABLE boats ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '';


-- ============================================================
-- SCHEMA MIGRATIONS TRACKING
-- ============================================================
-- Records which migration files this DB has applied, so "is this club
-- caught up?" is one query instead of checking columns one by one — see
-- migrations/036_schema_migrations_tracking.sql for the full rationale.
-- From here on, every new migration should insert its own filename too.
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
  ('036_schema_migrations_tracking.sql'),
  ('037_boat_photos.sql'),
  ('038_push_subscriptions_role.sql')
ON CONFLICT (filename) DO NOTHING;
-- Not included: 034 (buggy, superseded by 035 — see 035's own comments) and
-- the GBSC-only/superseded files excluded from this bootstrap (below).

-- ============================================================
-- DONE
-- ============================================================
-- Excluded from this script (see comments above for why):
--   007_seed_gbsc_races_2026.sql        — GBSC-only race data
--   008_seed_rcyc_demo.sql              — placeholder demo boats/races
--   20260421_start_finish_lines.sql     — superseded by 013 + 014;
--                                          its seed data was GBSC-only
--
-- Not seeded — add when ready:
--   boats                — no real RCYC boats seeded; skippers self-register
--                           in-app (boats_insert policy), or seed manually
--   settings.features    — left at default '{}'; RCYC's declaration/
--                           courseCard/feeModel flags come from
--                           CLUB_CONFIG_RCYC in Netlify (window.CLUB.features),
--                           not this column — only needed if you want the
--                           in-app Features panel to override them per-club
--
-- Verify a few estimated mark positions before racing (see 015 comments —
-- rcyc_spike, rcyc_cage, rcyc_grassy, rcyc_buoy8 are marked "estimated").
-- ============================================================
