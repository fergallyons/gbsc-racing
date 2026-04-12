-- ============================================================
-- GBSC Racing App — Supabase Database Schema
-- ============================================================
-- Run this in the Supabase SQL Editor to create (or recreate)
-- the full database from scratch.
--
-- Tables:
--   boats            — registered boats with PIN and Revolut config
--   settings         — club-wide config (single row, id='club')
--   crew             — crew members per boat
--   registrations    — boat registrations per race
--   published_courses— the most-recently published course (upserted by id)
--   marks            — physical marks in the bay (managed by RO)
--   race_records     — fee submission snapshots from skippers
--   protests         — protests filed under RRS Rule 61
-- ============================================================


-- ── boats ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boats (
  id            text PRIMARY KEY,          -- slug, e.g. 'silver_fox'
  name          text NOT NULL,
  icon          text NOT NULL DEFAULT '⛵',
  pin           text NOT NULL DEFAULT '0000',
  revolut_user  text NOT NULL DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

-- RLS: any authenticated or anon user can read; only anon key (app) can write
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boats_read"   ON boats FOR SELECT USING (true);
CREATE POLICY "boats_insert" ON boats FOR INSERT WITH CHECK (true);
CREATE POLICY "boats_update" ON boats FOR UPDATE USING (true);
CREATE POLICY "boats_delete" ON boats FOR DELETE USING (true);


-- ── settings ────────────────────────────────────────────────
-- Single club-wide config row: id must always be 'club'
CREATE TABLE IF NOT EXISTS settings (
  id                   text PRIMARY KEY,   -- always 'club'
  stripe_link_member   text DEFAULT '',    -- Stripe Payment Link for full members  (e.g. €4)
  stripe_link_student  text DEFAULT '',    -- Stripe Payment Link for students       (e.g. €5)
  stripe_link_visitor  text DEFAULT '',    -- Stripe Payment Link for visitors       (e.g. €10)
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read"   ON settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (true);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (true);

-- Seed the single row so it always exists
INSERT INTO settings (id) VALUES ('club') ON CONFLICT (id) DO NOTHING;


-- ── crew ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew (
  id          text PRIMARY KEY,            -- client-generated UUID
  boat_id     text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  first       text NOT NULL,
  last        text NOT NULL DEFAULT '',
  type        text NOT NULL DEFAULT 'full', -- 'full' | 'student' | 'visitor' | 'kid'
  join_year   int,
  outings     int DEFAULT 0,               -- used for visitor fee proration
  phone       text,
  selected    boolean DEFAULT false,       -- persisted selection for cross-device sync
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_boat_id_idx ON crew(boat_id);

ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_read"   ON crew FOR SELECT USING (true);
CREATE POLICY "crew_insert" ON crew FOR INSERT WITH CHECK (true);
CREATE POLICY "crew_update" ON crew FOR UPDATE USING (true);
CREATE POLICY "crew_delete" ON crew FOR DELETE USING (true);


-- ── registrations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registrations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id       text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key      text NOT NULL,             -- e.g. '2026-04-15_mcswiggans'
  race_name     text NOT NULL,
  race_date     date NOT NULL,
  registered_at timestamptz DEFAULT now(),
  UNIQUE (boat_id, race_key)
);

CREATE INDEX IF NOT EXISTS registrations_race_key_idx ON registrations(race_key);

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registrations_read"   ON registrations FOR SELECT USING (true);
CREATE POLICY "registrations_insert" ON registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "registrations_delete" ON registrations FOR DELETE USING (true);


-- ── published_courses ───────────────────────────────────────
-- Upserted by id — the app always uses id='current' so there is
-- effectively one live course at a time; history is preserved by
-- published_at ordering if multiple IDs are ever used.
CREATE TABLE IF NOT EXISTS published_courses (
  id           text PRIMARY KEY,           -- always 'current'
  name         text NOT NULL DEFAULT '',
  marks        jsonb NOT NULL DEFAULT '[]', -- [{id, rounding}]
  wind_deg     int,
  wind_dir     text,
  race_name    text DEFAULT '',
  notes        text DEFAULT '',
  published_at timestamptz DEFAULT now()
);

ALTER TABLE published_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses_read"   ON published_courses FOR SELECT USING (true);
CREATE POLICY "courses_insert" ON published_courses FOR INSERT WITH CHECK (true);
CREATE POLICY "courses_update" ON published_courses FOR UPDATE USING (true);


-- ── marks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marks (
  id          text PRIMARY KEY,            -- slug, e.g. 'inner_dolphin'
  name        text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  colour      text NOT NULL DEFAULT '#00b4d8',
  description text DEFAULT '',
  active      boolean DEFAULT true,        -- false = hidden from course builder grid
  sort_order  int DEFAULT 99,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marks_read"   ON marks FOR SELECT USING (true);
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (true);
CREATE POLICY "marks_update" ON marks FOR UPDATE USING (true);
CREATE POLICY "marks_delete" ON marks FOR DELETE USING (true);


-- ── race_records ────────────────────────────────────────────
-- Fee submission snapshot sent by skipper at end of race night
CREATE TABLE IF NOT EXISTS race_records (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id            text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_name          text NOT NULL,
  race_date          date NOT NULL,
  crew_snapshot      jsonb NOT NULL DEFAULT '[]', -- array of crew objects at time of submission
  total_due          int NOT NULL DEFAULT 0,      -- total fees owed (€)
  total_paid         int NOT NULL DEFAULT 0,      -- total collected before submission
  payment_methods    jsonb DEFAULT '{}',           -- {Cash: 8, Revolut: 4, ...}
  settlement_methods jsonb DEFAULT '[]',           -- ['cash','revolut','website']
  settlement_note    text,
  submitted_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS race_records_race_name_idx ON race_records(race_name);

ALTER TABLE race_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "race_records_read"   ON race_records FOR SELECT USING (true);
CREATE POLICY "race_records_insert" ON race_records FOR INSERT WITH CHECK (true);


-- ── protests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS protests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_name       text NOT NULL,
  race_date       date NOT NULL,
  protestor_id    text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  protestee_id    text NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  incident_where  text NOT NULL,
  incident_time   text NOT NULL,           -- HH:MM string as entered by skipper
  flag_displayed  boolean DEFAULT false,
  protest_hailed  boolean DEFAULT false,
  rules_broken    jsonb DEFAULT '[]',      -- ['RRS 10', 'RRS 15', ...]
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'Pending',  -- Pending | Hearing Scheduled | Upheld | Dismissed | Withdrawn
  ro_notes        text DEFAULT '',
  filed_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protests_race_name_idx ON protests(race_name);

ALTER TABLE protests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "protests_read"   ON protests FOR SELECT USING (true);
CREATE POLICY "protests_insert" ON protests FOR INSERT WITH CHECK (true);
CREATE POLICY "protests_update" ON protests FOR UPDATE USING (true);
CREATE POLICY "protests_delete" ON protests FOR DELETE USING (true);


-- ============================================================
-- NOTES FOR RECOVERY
-- ============================================================
-- 1. Create a new Supabase project at https://supabase.com
-- 2. Paste and run this entire file in the SQL Editor
-- 3. In the Supabase dashboard → Project Settings → API:
--      Copy "Project URL"  → SB_URL in app.js
--      Copy "anon public"  → SB_KEY in app.js
-- 4. In app.js update the two constants at the top:
--      const SB_URL = 'https://xxxx.supabase.co'
--      const SB_KEY = 'eyJ...'
-- 5. No server-side functions or triggers are required —
--    all logic runs in the browser via the REST API.
-- ============================================================
