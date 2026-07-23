-- ============================================================
-- Irish Sailing (demo instance, slug "is") — Full Database Bootstrap
-- ============================================================
-- Generated from supabase/NEW_CLUB_TEMPLATE.sql for a standalone RaceOps
-- Crest demo, built to show Irish Sailing's board the platform in action.
-- NOT a real operating club — seeded with the 9 boats whose "Main Club"
-- on the national ECHO/IRC ratings register is literally "Irish Sailing"
-- (no single home club), plus a demo race calendar and series fee history.
-- Location basis (start line / wind / tide) is Dun Laoghaire, home of
-- Irish Sailing's own HQ.
--
-- Run this ONCE, in full, against a fresh Supabase project's SQL Editor.
-- It is the consolidated equivalent of schema.sql + every migration,
-- PLUS a demo-seed section at the end (see SECTION 2 below) — that
-- second part is specific to this demo and not part of the reusable
-- template.
--
-- After running, set (Project Settings → API):
--   sbUrl / sbKey  → CLUB_CONFIG_IS env var in Netlify (club-config.js)
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
  -- all-Ireland bounds — covers Dun Laoghaire, Co. Dublin (Dublin Bay) along with every other
  -- club's home waters, so this line never needs touching per-club
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
-- tide_odm_offset defaults to 0 (neutral placeholder) — look up
-- IS's real nearest tide station and datum offset, then set
-- both via the Club Settings sheet (Location & Tides section) after login.
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
  ADD COLUMN IF NOT EXISTS tide_odm_offset   double precision NOT NULL DEFAULT 0,
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
  ADD COLUMN IF NOT EXISTS stripe_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sail_number text NOT NULL DEFAULT '';


-- ── registrations: remaining columns ────────────────────────
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS looking_for_crew boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS "anon_update_registrations" ON registrations;
CREATE POLICY "anon_update_registrations" ON registrations FOR UPDATE USING (true) WITH CHECK (true);
GRANT UPDATE (looking_for_crew) ON registrations TO anon;


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
-- SECURE PINS (migration 040) — see migrations/040_secure_pins.sql for
-- full rationale/comments. Hashes boat + RO PINs so they're never
-- readable/writable via plain REST, and gates payment-redirect fields
-- (revolut_user, Stripe links) behind PIN-verified RPCs.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE boats ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS pin_is_default boolean NOT NULL DEFAULT true;
UPDATE boats SET pin_hash = crypt(pin, gen_salt('bf')) WHERE pin_hash IS NULL;
UPDATE boats SET pin_is_default = (pin = '0000') WHERE pin_hash IS NOT NULL;
ALTER TABLE boats ALTER COLUMN pin_hash SET NOT NULL;
-- New boats (RO Add Boat, or a skipper self-registering) still INSERT via
-- the old boats_insert policy without ever knowing about pin_hash — this
-- default keeps that working, matching the old pin DEFAULT '0000' exactly.
ALTER TABLE boats ALTER COLUMN pin_hash SET DEFAULT crypt('0000', gen_salt('bf'));
REVOKE SELECT (pin) ON boats FROM anon;
REVOKE UPDATE (pin, revolut_user) ON boats FROM anon;
REVOKE SELECT (pin_hash, pin_is_default) ON boats FROM anon;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ro_pin_hash text;
UPDATE settings SET ro_pin_hash = crypt(COALESCE(ro_pin, '0000'), gen_salt('bf')) WHERE ro_pin_hash IS NULL;
REVOKE SELECT (ro_pin) ON settings FROM anon;
REVOKE UPDATE (ro_pin, stripe_link_member, stripe_link_student, stripe_link_visitor, ro_revolut_user) ON settings FROM anon;
REVOKE SELECT (ro_pin_hash) ON settings FROM anon;

CREATE OR REPLACE FUNCTION verify_boat_pin(p_boat_id text, p_pin text)
RETURNS TABLE(ok boolean, is_default boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (pin_hash = crypt(p_pin, pin_hash)), pin_is_default
  FROM boats WHERE id = p_boat_id;
$$;
REVOKE ALL ON FUNCTION verify_boat_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_boat_pin(text,text) TO anon;

CREATE OR REPLACE FUNCTION change_boat_pin(p_boat_id text, p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (pin_hash = crypt(p_current_pin, pin_hash)) INTO v_ok FROM boats WHERE id = p_boat_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_boat_pin(text,text,text) TO anon;

CREATE OR REPLACE FUNCTION reset_boat_pin(p_ro_pin text, p_boat_id text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_ro_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION reset_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_boat_pin(text,text,text) TO anon;

CREATE OR REPLACE FUNCTION set_boat_revolut_user(p_boat_id text, p_current_pin text, p_revolut_user text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (pin_hash = crypt(p_current_pin, pin_hash)) INTO v_ok FROM boats WHERE id = p_boat_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET revolut_user = p_revolut_user WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_boat_revolut_user(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_boat_revolut_user(text,text,text) TO anon;

CREATE OR REPLACE FUNCTION verify_ro_pin(p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (ro_pin_hash = crypt(p_pin, ro_pin_hash)) FROM settings WHERE id = 'club';
$$;
REVOKE ALL ON FUNCTION verify_ro_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_ro_pin(text) TO anon;

CREATE OR REPLACE FUNCTION change_ro_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET ro_pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_ro_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_ro_pin(text,text) TO anon;

CREATE OR REPLACE FUNCTION set_ro_payment_settings(
  p_current_pin text, p_stripe_link_member text, p_stripe_link_student text,
  p_stripe_link_visitor text, p_ro_revolut_user text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET
    stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
    stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
    stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
    ro_revolut_user      = COALESCE(p_ro_revolut_user,      ro_revolut_user)
  WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text) TO anon;

-- ============================================================
-- ADMIN PIN (migration 042) -- see migrations/042_admin_pin.sql for full
-- rationale. Second, more tightly-held PIN tier above the RO PIN.
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_pin_hash text;
UPDATE settings SET admin_pin_hash = crypt('''0000''', gen_salt('''bf''')) WHERE admin_pin_hash IS NULL;
REVOKE SELECT (admin_pin_hash) ON settings FROM anon;

CREATE OR REPLACE FUNCTION verify_admin_pin(p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (admin_pin_hash = crypt(p_pin, admin_pin_hash)) FROM settings WHERE id = '''club''';
$$;
REVOKE ALL ON FUNCTION verify_admin_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_admin_pin(text) TO anon;

CREATE OR REPLACE FUNCTION change_admin_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (admin_pin_hash = crypt(p_current_pin, admin_pin_hash)) INTO v_ok FROM settings WHERE id = '''club''';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET admin_pin_hash = crypt(p_new_pin, gen_salt('''bf''')) WHERE id = '''club''';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_admin_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_admin_pin(text,text) TO anon;

-- ============================================================
-- SCHEMA MIGRATIONS TRACKING
-- ============================================================
-- Records which migration files this DB has applied, so "is this club
-- caught up?" is one query instead of checking columns one by one — see
-- migrations/036_schema_migrations_tracking.sql and MIGRATIONS.md for the
-- full rationale. From here on, every new migration should insert its own
-- filename here too (and be added to this template if it applies to every
-- club, not just GBSC).
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
  ('038_push_subscriptions_role.sql'),
  ('040_secure_pins.sql'),
  ('042_admin_pin.sql')
ON CONFLICT (filename) DO NOTHING;
-- Not included: 034 (buggy, superseded by 035 — see 035's own comments) and
-- migrations that are seed data specific to another club.

-- ============================================================
-- SECTION 2 — Demo seed data (specific to this instance, not the template)
-- ============================================================

-- ── settings: location + fee model ──────────────────────────
-- Dun Laoghaire Harbour (Irish Sailing HQ). Tide station is a placeholder
-- ("Dublin") — verify the exact IMI ERDDAP station name/datum offset via
-- Club Settings after first login; harmless if slightly off for a demo.
UPDATE settings SET
  start_lat = 53.2941, start_lng = -6.1350,
  wind_lat  = 53.2941, wind_lng  = -6.1350,
  tide_station = 'Dublin',
  tide_odm_offset = 0
WHERE id = 'club';

-- Feature flags: per-series billing + course-card picker, same shape as
-- RCYC's setup — everything else left at its default (on), unlike RCYC's
-- own pared-down live config, so the demo shows full platform breadth.
-- Declaration gate deliberately OFF here (would block every demo login
-- behind a safety-declaration form) — see chat, flagged as a deviation
-- from "set up like RCYC" for demo-usability reasons.
UPDATE settings SET features = '{
  "feeModel": "per-series",
  "courseCard": true,
  "declaration": false
}'::jsonb WHERE id = 'club';

-- ── boats ────────────────────────────────────────────────────
-- The 9 boats whose "Main Club" on the national ECHO/IRC ratings register
-- is "Irish Sailing" (fetched live 2026-07-21 — see chat). Boat NAME must
-- match the register exactly for the app's live ratings/model lookup
-- (_fetchBoatRatingData) to auto-match — no separate model/type column
-- exists in `boats`, it's resolved by name match at runtime.
INSERT INTO boats (id, name, sail_number) VALUES
  ('blizard',       'Blizard',       'GBR141'),
  ('dear_prudence',  'Dear Prudence', 'IRL1095'),
  ('escapade',       'Escapade',      'GBR 430X'),
  ('foxtrot',         'Foxtrot',       'GBR7797T'),
  ('gerda',            'Gerda',         'GBR144'),
  ('mojito',            'Mojito',        'GBR4822R'),
  ('prime_suspect',      'Prime Suspect', 'IRL5991'),
  ('tailte',               'Tailte',        'IRL259'),
  ('vera_may',              'Vera May',      'GBR155')
ON CONFLICT (id) DO NOTHING;

-- ── races: "Summer Series 2026" — 4 finished + 1 upcoming ───
-- Thursday evening racing (18:30), Dun Laoghaire-typical slot.
-- `races` has no unique constraint beyond its identity PK, so this is
-- guarded with NOT EXISTS rather than ON CONFLICT — re-running the whole
-- script won't create duplicate races.
INSERT INTO races (label, race_date, start_hour, start_min, series, active, sort_order)
SELECT * FROM (VALUES
  ('Race 1', '2026-06-25'::date, 18, 30, 'Summer Series 2026', true, 1),
  ('Race 2', '2026-07-02'::date, 18, 30, 'Summer Series 2026', true, 2),
  ('Race 3', '2026-07-09'::date, 18, 30, 'Summer Series 2026', true, 3),
  ('Race 4', '2026-07-16'::date, 18, 30, 'Summer Series 2026', true, 4),
  ('Race 5', '2026-07-30'::date, 18, 30, 'Summer Series 2026', true, 5)
) AS v(label, race_date, start_hour, start_min, series, active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM races WHERE series = 'Summer Series 2026');

-- ── registrations: fleet turnout across the series ──────────
-- Races 1-3 show natural variation (2 boats sitting out each week);
-- Race 4 (most recent finished) shows full 9-boat turnout, so the
-- Registrations tile has a complete list to demo against. Race 5
-- (upcoming) is deliberately left empty — see note below.
-- race_key format matches raceKey() in app.js: "<date>_<slugified label>".
INSERT INTO registrations (boat_id, race_key, race_name, race_date) VALUES
  -- Race 1 (2026-06-25) — Escapade, Mojito sat out
  ('blizard','2026-06-25_race1','Race 1','2026-06-25'),
  ('dear_prudence','2026-06-25_race1','Race 1','2026-06-25'),
  ('foxtrot','2026-06-25_race1','Race 1','2026-06-25'),
  ('gerda','2026-06-25_race1','Race 1','2026-06-25'),
  ('prime_suspect','2026-06-25_race1','Race 1','2026-06-25'),
  ('tailte','2026-06-25_race1','Race 1','2026-06-25'),
  ('vera_may','2026-06-25_race1','Race 1','2026-06-25'),
  -- Race 2 (2026-07-02) — Blizard, Tailte sat out
  ('dear_prudence','2026-07-02_race2','Race 2','2026-07-02'),
  ('escapade','2026-07-02_race2','Race 2','2026-07-02'),
  ('foxtrot','2026-07-02_race2','Race 2','2026-07-02'),
  ('gerda','2026-07-02_race2','Race 2','2026-07-02'),
  ('mojito','2026-07-02_race2','Race 2','2026-07-02'),
  ('prime_suspect','2026-07-02_race2','Race 2','2026-07-02'),
  ('vera_may','2026-07-02_race2','Race 2','2026-07-02'),
  -- Race 3 (2026-07-09) — Gerda, Prime Suspect sat out
  ('blizard','2026-07-09_race3','Race 3','2026-07-09'),
  ('dear_prudence','2026-07-09_race3','Race 3','2026-07-09'),
  ('escapade','2026-07-09_race3','Race 3','2026-07-09'),
  ('foxtrot','2026-07-09_race3','Race 3','2026-07-09'),
  ('mojito','2026-07-09_race3','Race 3','2026-07-09'),
  ('tailte','2026-07-09_race3','Race 3','2026-07-09'),
  ('vera_may','2026-07-09_race3','Race 3','2026-07-09'),
  -- Race 4 (2026-07-16) — full fleet
  ('blizard','2026-07-16_race4','Race 4','2026-07-16'),
  ('dear_prudence','2026-07-16_race4','Race 4','2026-07-16'),
  ('escapade','2026-07-16_race4','Race 4','2026-07-16'),
  ('foxtrot','2026-07-16_race4','Race 4','2026-07-16'),
  ('gerda','2026-07-16_race4','Race 4','2026-07-16'),
  ('mojito','2026-07-16_race4','Race 4','2026-07-16'),
  ('prime_suspect','2026-07-16_race4','Race 4','2026-07-16'),
  ('tailte','2026-07-16_race4','Race 4','2026-07-16'),
  ('vera_may','2026-07-16_race4','Race 4','2026-07-16')
ON CONFLICT (boat_id, race_key) DO NOTHING;
-- Race 5 (2026-07-30, upcoming) deliberately left with zero registrations —
-- register a boat live during the demo instead of showing a pre-filled list.

-- ── series_fees: 7 of 9 boats paid, 2 outstanding ───────────
-- Gives the Series Fees panel a realistic mix of "✓ Paid" and "Not yet
-- recorded" states to demo. Escapade and Mojito left unpaid on purpose.
-- `series_fees` intentionally has no unique constraint (a boat can pay a
-- series in installments), so this is guarded with NOT EXISTS rather than
-- ON CONFLICT — re-running the whole script won't create duplicate rows.
INSERT INTO series_fees (boat_id, series_name, season, amount, method, paid_at)
SELECT * FROM (VALUES
  ('blizard','Summer Series 2026',2026,120,'Card','2026-06-20T10:00:00+01'::timestamptz),
  ('dear_prudence','Summer Series 2026',2026,120,'Revolut','2026-06-21T14:30:00+01'::timestamptz),
  ('foxtrot','Summer Series 2026',2026,120,'Bank Transfer','2026-06-22T09:15:00+01'::timestamptz),
  ('gerda','Summer Series 2026',2026,120,'Cash','2026-06-23T18:00:00+01'::timestamptz),
  ('prime_suspect','Summer Series 2026',2026,120,'Card','2026-06-24T11:45:00+01'::timestamptz),
  ('tailte','Summer Series 2026',2026,120,'Revolut','2026-06-25T08:30:00+01'::timestamptz),
  ('vera_may','Summer Series 2026',2026,120,'Card','2026-06-25T17:00:00+01'::timestamptz)
) AS v(boat_id, series_name, season, amount, method, paid_at)
WHERE NOT EXISTS (SELECT 1 FROM series_fees WHERE series_name = 'Summer Series 2026');

-- ── marks: DBSC's real course buoys ─────────────────────────
-- Derived from DBSC's published bearings/distances table (dbsc.ie,
-- "DBSC_Marks_Bearings_Distances_2026_v1.pdf") — that document gives
-- each mark's position as minutes past 53°N / 6°W rather than plain
-- lat/lng directly; decoding verified against the document's own
-- bearing/distance figures (e.g. Salthill→Saoirse computes to 038°/
-- 0.83nm from these coordinates, matching the table exactly).
--
-- IDs are DBSC's own single-letter mark codes (skips I/U, avoiding
-- confusion with 1), kept as-is rather than invented mnemonics —
-- DBSC's course cards reference marks by these exact letters, so
-- matching them is what makes a future course-card import possible.
-- Single letters are valid here: marks_insert only requires 1-60 chars
-- (`^[a-z0-9_-]{1,60}$`), the Marks Manager UI's "e.g. IL" placeholder
-- is just an example, not a real minimum length.
INSERT INTO marks (id, name, lat, lng, colour, description, active, sort_order) VALUES
  ('a', 'Salthill',      53.30600, -6.15000, '#f4a261', 'DBSC mark A — Orange',          true, 1),
  ('b', 'Saoirse',       53.31700, -6.13583, '#2dc653', 'DBSC mark B — Green',           true, 2),
  ('c', 'Seapoint',      53.32467, -6.14333, '#f0f4f8', 'DBSC mark C — Black',           true, 3),
  ('d', 'South Bull',    53.33333, -6.13833, '#f4a261', 'DBSC mark D — Orange',          true, 4),
  ('e', 'South Bar',     53.33700, -6.12417, '#f4b942', 'DBSC mark E — Yellow/Black',    true, 5),
  ('f', 'Bligh',         53.33467, -6.11167, '#f4b942', 'DBSC mark F — Yellow/Orange',   true, 6),
  ('g', 'New Ross',      53.32667, -6.10500, '#f4b942', 'DBSC mark G — Yellow/Blk/Wh',   true, 7),
  ('h', 'Harbour',       53.31233, -6.12950, '#f4b942', 'DBSC mark H — Yellow',          true, 8),
  ('j', 'Asgard',        53.31850, -6.10933, '#f4b942', 'DBSC mark J — Yellow/Black',    true, 9),
  ('k', 'Boyd',          53.31417, -6.12283, '#f4a261', 'DBSC mark K — Orange',          true, 10),
  ('l', 'Merrion',       53.31467, -6.15200, '#f0f4f8', 'DBSC mark L — Black/Yellow',    true, 11),
  ('m', 'Middle',        53.32583, -6.12467, '#f4b942', 'DBSC mark M — Yellow',          true, 12),
  ('n', 'Molly',         53.30467, -6.10467, '#f4b942', 'DBSC mark N — Yellow/Black',    true, 13),
  ('o', 'Orange Start',  53.30633, -6.13200, '#f4a261', 'DBSC mark O — Orange',          true, 14),
  ('p', 'Poldy',         53.29700, -6.09000, '#f4b942', 'DBSC mark P — Yellow/Orange',   true, 15),
  ('q', 'Island',        53.29083, -6.09300, '#f0f4f8', 'DBSC mark Q — Black',           true, 16),
  ('r', 'Bulloch',       53.28800, -6.10267, '#f4a261', 'DBSC mark R — Orange',          true, 17),
  ('s', 'East',          53.30267, -6.09467, '#f4b942', 'DBSC mark S — Yellow/Green',    true, 18),
  ('t', 'Battery',       53.29200, -6.11063, '#2dc653', 'DBSC mark T — Green/White',     true, 19),
  ('v', 'Pier',          53.30167, -6.11400, '#f4a261', 'DBSC mark V — Orange',          true, 20),
  ('w', 'Bay',           53.29550, -6.11833, '#f0f4f8', 'DBSC mark W — Black',           true, 21),
  ('x', 'Turning',       53.30717, -6.13900, '#f4b942', 'DBSC mark X — Yellow Nav Mk',   true, 22),
  ('y', 'Omega',         53.29633, -6.10383, '#f4b942', 'DBSC mark Y — Yellow',          true, 23)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
-- Seeded: 9 boats (real, from the national ratings register), a 5-race
-- "Summer Series 2026" (4 finished + 1 upcoming, empty of registrations
-- on purpose), matching registrations for the 4 finished races, series
-- fee history (7 paid, 2 outstanding), and 23 real DBSC marks (single-
-- letter IDs matching DBSC's own course-card convention).
-- Not seeded: crew, and Race 5's registrations (both deliberately left
-- empty — adding crew and registering a boat live are good demo beats).
-- Still needs verifying after first login: tide_station/tide_odm_offset
-- (placeholder "Dublin"/0 above — confirm the exact IMI ERDDAP station
-- name via Club Settings), RO PIN (default 0000 — change before wider use).
-- ============================================================
