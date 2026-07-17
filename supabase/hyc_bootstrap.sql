-- ============================================================
-- HYC Racing App — Full Database Bootstrap
-- ============================================================
-- Run this ONCE, in full, against a fresh Howth Yacht Club Supabase
-- project's SQL Editor. It is the consolidated equivalent of running
-- supabase/schema.sql followed by every migration in
-- supabase/migrations/, in order, EXCLUDING the ones that are
-- GBSC-specific or RCYC-specific seed data (none of that applies here).
--
-- After running, set (Project Settings → API):
--   sbUrl / sbKey  → CLUB_CONFIG_HYC env var in Netlify (club-config.js)
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
  estella_url           text DEFAULT '',
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
GRANT SELECT, INSERT, UPDATE, DELETE ON published_courses TO anon;


-- ── marks ───────────────────────────────────────────────────
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
  -- all-Ireland bounds — covers Howth (Dublin Bay/Irish Sea) along with
  -- every other club's home waters
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 51.0 AND 55.5
  AND lng BETWEEN -11.0 AND -5.5
);
CREATE POLICY "marks_update" ON marks FOR UPDATE USING (true);
CREATE POLICY "marks_delete" ON marks FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON marks TO anon;


-- ── race_records ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS race_records (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id            text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_name          text NOT NULL,
  race_date          date NOT NULL,
  race_key           text NOT NULL DEFAULT '',
  crew_snapshot      jsonb NOT NULL DEFAULT '[]',
  total_due          int NOT NULL DEFAULT 0,
  total_paid         int NOT NULL DEFAULT 0,
  payment_methods    jsonb DEFAULT '{}',
  settlement_methods jsonb DEFAULT '[]',
  settlement_note    text,
  submitted_at       timestamptz DEFAULT now(),
  CONSTRAINT race_records_boat_race_unique UNIQUE (boat_id, race_key)
);

CREATE INDEX IF NOT EXISTS race_records_race_name_idx ON race_records(race_name);

ALTER TABLE race_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_records_select" ON race_records;
DROP POLICY IF EXISTS "race_records_insert" ON race_records;
DROP POLICY IF EXISTS "race_records_update" ON race_records;
CREATE POLICY "race_records_select" ON race_records FOR SELECT USING (true);
CREATE POLICY "race_records_insert" ON race_records FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_name IS NOT NULL AND race_date IS NOT NULL
);
CREATE POLICY "race_records_update" ON race_records FOR UPDATE USING (true);
GRANT SELECT, INSERT, UPDATE ON race_records TO anon;


-- ── protests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS protests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_name       text NOT NULL,
  race_date       date NOT NULL,
  protestor_id    text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  protestee_id    text REFERENCES boats(id) ON DELETE CASCADE,
  incident_where  text NOT NULL,
  incident_time   text NOT NULL,
  flag_displayed  boolean DEFAULT false,
  protest_hailed  boolean DEFAULT false,
  rules_broken    jsonb DEFAULT '[]',
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'Pending',
  ro_notes        text DEFAULT '',
  filed_at        timestamptz DEFAULT now(),
  type            text NOT NULL DEFAULT 'protest'
                       CHECK (type IN ('protest','redress','scoring_enquiry'))
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
  AND (protestee_id IS NULL OR protestor_id <> protestee_id)
  AND (protestee_id IS NOT NULL OR type <> 'protest')
  AND description <> ''
);
CREATE POLICY "protests_update" ON protests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "protests_delete" ON protests FOR DELETE USING (true);


-- ── push_subscriptions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  boat_id    text        REFERENCES boats(id) ON DELETE CASCADE,
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
  payment_ref text,
  UNIQUE (crew_id, race_key)
);

CREATE INDEX IF NOT EXISTS race_payments_payment_ref_idx ON race_payments(payment_ref);

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
GRANT SELECT, INSERT, UPDATE, DELETE ON race_attendees TO anon;


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


-- ── session_logs ────────────────────────────────────────────
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_logs TO anon;
GRANT USAGE, SELECT ON SEQUENCE session_logs_id_seq TO anon;


-- ── races ───────────────────────────────────────────────────
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
GRANT SELECT, INSERT, UPDATE, DELETE ON races TO anon;


-- ── skipper_declarations ────────────────────────────────────
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
GRANT SELECT, INSERT, UPDATE, DELETE ON skipper_declarations TO anon;


-- ── course_card_courses + series_fees ───────────────────────
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
GRANT SELECT, INSERT, UPDATE, DELETE ON course_card_courses TO anon;

ALTER TABLE published_courses
  ADD COLUMN IF NOT EXISTS course_number int REFERENCES course_card_courses(number),
  ADD COLUMN IF NOT EXISTS rounds jsonb,
  ADD COLUMN IF NOT EXISTS start_line_id  text DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS finish_line_id text DEFAULT 'club';

DROP POLICY IF EXISTS "anon_update_published_courses" ON published_courses;
CREATE POLICY "anon_update_published_courses" ON published_courses FOR UPDATE TO anon USING (true);

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
GRANT SELECT, INSERT, UPDATE, DELETE ON series_fees TO anon;


-- ── start_finish_lines ──────────────────────────────────────
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


-- ── crew_available ──────────────────────────────────────────
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


-- ── news_items ───────────────────────────────────────────────
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


-- ── race_starts ──────────────────────────────────────────────
-- Start Sequence simulator (flags/countdown, no RO on the line)
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


-- ── settings: remaining columns ─────────────────────────────
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
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
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon;


-- ── boats: remaining columns ─────────────────────────────────
ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS stripe_link text NOT NULL DEFAULT '';


-- ── registrations: remaining columns ────────────────────────
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS looking_for_crew boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS "anon_update_registrations" ON registrations;
CREATE POLICY "anon_update_registrations" ON registrations FOR UPDATE USING (true) WITH CHECK (true);
GRANT UPDATE (looking_for_crew) ON registrations TO anon;


-- ============================================================
-- DONE
-- ============================================================
-- Nothing seeded — Howth starts from a clean slate:
--   boats     — skippers self-register in-app (boats_insert policy),
--               or seed manually once you have a fleet list
--   marks     — add via the RO Marks Manager once you have Howth's
--               real course-buoy positions, or hand me a mark list
--               the same way RCYC did and I'll write a seed script
--   settings.features — left at default '{}'; HYC's declaration/
--               courseCard/feeModel flags come from CLUB_CONFIG_HYC
--               in Netlify (window.CLUB.features), not this column
-- ============================================================
