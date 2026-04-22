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
--
-- Security note:
--   The Supabase anon key is intentionally public for client-side apps.
--   Protection comes from RLS policies below, not from hiding the key.
--   Policies follow the principle of least privilege: each operation is
--   only permitted if the app genuinely needs it.
--   Full per-user restriction (e.g. RO-only writes) would require
--   Supabase Auth — a future upgrade path if needed.
-- ============================================================


-- ── boats ───────────────────────────────────────────────────
-- Needed: SELECT all (boat grid on login), INSERT (self-register),
--         UPDATE (PIN/Revolut changes), DELETE (RO removes boat)
CREATE TABLE IF NOT EXISTS boats (
  id            text PRIMARY KEY,          -- slug, e.g. 'silver_fox'
  name          text NOT NULL,
  icon          text NOT NULL DEFAULT '⛵',
  pin           text NOT NULL DEFAULT '0000',
  revolut_user  text NOT NULL DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boats_select" ON boats FOR SELECT USING (true);
CREATE POLICY "boats_insert" ON boats FOR INSERT WITH CHECK (
  -- id must be a non-empty slug-style string (no spaces, reasonable length)
  id ~ '^[a-z0-9_-]{1,60}$'
);
CREATE POLICY "boats_update" ON boats FOR UPDATE USING (true);
CREATE POLICY "boats_delete" ON boats FOR DELETE USING (true);


-- ── settings ────────────────────────────────────────────────
-- Single club-wide config row. Only the 'club' row is meaningful.
-- No DELETE permitted — the row should never be removed.
CREATE TABLE IF NOT EXISTS settings (
  id                    text PRIMARY KEY,   -- always 'club'
  stripe_link_member    text DEFAULT '',
  stripe_link_student   text DEFAULT '',
  stripe_link_visitor   text DEFAULT '',
  pre_race_window_hours int  DEFAULT 12,    -- hours before race start to show "pending" state
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON settings FOR SELECT USING (true);
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (
  -- Only the single 'club' row may be inserted/upserted
  id = 'club'
);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (
  id = 'club'
);
-- No DELETE policy — settings row cannot be deleted via API

-- Seed the single row so it always exists
INSERT INTO settings (id) VALUES ('club') ON CONFLICT (id) DO NOTHING;


-- ── crew ────────────────────────────────────────────────────
-- Needed: SELECT all (roster), INSERT/UPDATE (manage crew), DELETE (remove member)
CREATE TABLE IF NOT EXISTS crew (
  id          text PRIMARY KEY,            -- client-generated UUID
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
CREATE POLICY "crew_select" ON crew FOR SELECT USING (true);
CREATE POLICY "crew_insert" ON crew FOR INSERT WITH CHECK (
  -- boat_id must reference a real boat (FK enforces this, but belt-and-braces)
  boat_id IS NOT NULL AND boat_id <> ''
);
CREATE POLICY "crew_update" ON crew FOR UPDATE USING (true);
CREATE POLICY "crew_delete" ON crew FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON crew TO anon;  -- required: anon only gets SELECT by default

-- ── registrations ───────────────────────────────────────────
-- Needed: SELECT all (start list), INSERT (register), DELETE (unregister/RO remove)
-- UPDATE is never used — registrations are only inserted or deleted.
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
CREATE POLICY "registrations_select" ON registrations FOR SELECT USING (true);
CREATE POLICY "registrations_insert" ON registrations FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_key IS NOT NULL AND race_date IS NOT NULL
);
CREATE POLICY "registrations_delete" ON registrations FOR DELETE USING (true);
-- No UPDATE policy — use delete + re-insert if a registration needs changing


-- ── published_courses ───────────────────────────────────────
-- Single live course, always upserted with id='current'.
-- No DELETE permitted — courses are overwritten, never deleted.
CREATE TABLE IF NOT EXISTS published_courses (
  id           text PRIMARY KEY,
  name         text NOT NULL DEFAULT '',
  marks        jsonb NOT NULL DEFAULT '[]', -- [{id, rounding}]
  wind_deg     int,
  wind_dir     text,
  race_name    text DEFAULT '',
  notes        text DEFAULT '',
  published_at timestamptz DEFAULT now()
);

ALTER TABLE published_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses_select" ON published_courses FOR SELECT USING (true);
CREATE POLICY "courses_insert" ON published_courses FOR INSERT WITH CHECK (
  -- Only the 'current' row is meaningful; block arbitrary course IDs
  id = 'current'
);
CREATE POLICY "courses_update" ON published_courses FOR UPDATE USING (
  id = 'current'
);
-- No DELETE policy — courses cannot be deleted via the API


-- ── marks ───────────────────────────────────────────────────
-- Physical bay marks managed by the RO.
-- All operations needed: RO adds, edits, toggles active, deletes marks.
CREATE TABLE IF NOT EXISTS marks (
  id          text PRIMARY KEY,            -- slug, e.g. 'inner_dolphin'
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
CREATE POLICY "marks_select" ON marks FOR SELECT USING (true);
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (
  -- id must be a slug, lat/lng must be plausible (Galway Bay bounds)
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 52.0 AND 54.0
  AND lng BETWEEN -10.5 AND -8.0
);
CREATE POLICY "marks_update" ON marks FOR UPDATE USING (true);
CREATE POLICY "marks_delete" ON marks FOR DELETE USING (true);


-- ── race_records ────────────────────────────────────────────
-- Immutable fee submission snapshots. INSERT only — no UPDATE or DELETE.
-- Once submitted, a record cannot be modified or removed via the API.
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
CREATE POLICY "race_records_select" ON race_records FOR SELECT USING (true);
CREATE POLICY "race_records_insert" ON race_records FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_name IS NOT NULL AND race_date IS NOT NULL
);
-- No UPDATE or DELETE policies — race records are an immutable audit trail


-- ── protests ────────────────────────────────────────────────
-- Filed by skippers; status/notes updated by RO; RO can delete.
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
CREATE POLICY "protests_select" ON protests FOR SELECT USING (true);
CREATE POLICY "protests_insert" ON protests FOR INSERT WITH CHECK (
  -- Both boats must be identified and a description provided
  protestor_id IS NOT NULL
  AND protestee_id IS NOT NULL
  AND protestor_id <> protestee_id   -- can't protest yourself
  AND description <> ''
);
CREATE POLICY "protests_update" ON protests FOR UPDATE USING (true) WITH CHECK (
  -- Only status and ro_notes may change after filing (immutable core fields)
  -- Enforced by app logic; RLS can't easily restrict per-column without triggers
  true
);
CREATE POLICY "protests_delete" ON protests FOR DELETE USING (true);


-- ============================================================
-- TABLE: push_subscriptions
-- Web Push API subscriptions — one row per device per boat.
-- The Edge Function (notify-course-published) reads this table
-- via the service role key and sends push notifications.
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  boat_id    text        REFERENCES boats(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_sub_insert" ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "push_sub_delete" ON push_subscriptions FOR DELETE USING (true);
-- No SELECT for anon — Edge Function reads via service role key only.


-- ============================================================
-- RECOVERY INSTRUCTIONS
-- ============================================================
-- 1. Create a new Supabase project at https://supabase.com
-- 2. Paste and run this entire file in the SQL Editor
-- 3. Project Settings → API → copy:
--      "Project URL"  → SB_URL constant in app.js
--      "anon public"  → SB_KEY constant in app.js
-- 4. No server-side functions, triggers, or Edge Functions required.
--    All logic runs in the browser via the PostgREST API.
--
-- SECURITY UPGRADE PATH (future):
--   Enable Supabase Auth for the RO login instead of a shared PIN.
--   Then tighten write policies on marks, boats, settings, and
--   published_courses to USING (auth.role() = 'authenticated').
--   Skipper logins can remain PIN-based for simplicity.
-- ============================================================
