-- GBSC Club Hub — Initial Schema
-- Run this in your Supabase SQL editor (or via supabase db push)
--
-- Tables are prefixed with hub_ to avoid conflicts if this project
-- shares a Supabase project with other GBSC apps.

-- ── Calendar Events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  start_date   TIMESTAMPTZ NOT NULL,
  end_date     TIMESTAMPTZ,
  all_day      BOOLEAN NOT NULL DEFAULT true,
  event_type   TEXT NOT NULL DEFAULT 'general'
               CHECK (event_type IN ('general','racing','social','training','maintenance')),
  location     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_events_start_date_idx ON hub_events (start_date);

-- ── Equipment ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_equipment (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'other'
               CHECK (type IN ('tractor','rib','engine','safety_boat','other')),
  description  TEXT,
  year         INTEGER CHECK (year BETWEEN 1900 AND 2099),
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_equipment_type_idx ON hub_equipment (type);

-- ── Maintenance Records ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_maintenance_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id   UUID NOT NULL REFERENCES hub_equipment (id) ON DELETE CASCADE,
  task           TEXT NOT NULL,
  performed_by   TEXT,
  performed_date DATE NOT NULL,
  next_due_date  DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_maintenance_equipment_idx ON hub_maintenance_records (equipment_id);
CREATE INDEX IF NOT EXISTS hub_maintenance_date_idx      ON hub_maintenance_records (performed_date DESC);
CREATE INDEX IF NOT EXISTS hub_maintenance_next_due_idx  ON hub_maintenance_records (next_due_date);

-- ── SOP Documents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_sop_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  equipment_id UUID REFERENCES hub_equipment (id) ON DELETE SET NULL,
  content      TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'general'
               CHECK (category IN ('general','tractor','rib','engine','safety','launch','recovery')),
  version      TEXT NOT NULL DEFAULT '1.0',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_sop_category_idx     ON hub_sop_documents (category);
CREATE INDEX IF NOT EXISTS hub_sop_equipment_idx    ON hub_sop_documents (equipment_id);

-- ── Row Level Security ────────────────────────────────────────────
-- Public can read all tables. Writes are gated at the app level by admin PIN.
-- For production hardening, remove anon write access and route writes
-- through a Netlify function that validates the PIN server-side.

ALTER TABLE hub_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_equipment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sop_documents       ENABLE ROW LEVEL SECURITY;

-- Read: everyone
CREATE POLICY "public read events"    ON hub_events              FOR SELECT USING (true);
CREATE POLICY "public read equipment" ON hub_equipment           FOR SELECT USING (true);
CREATE POLICY "public read maint"     ON hub_maintenance_records FOR SELECT USING (true);
CREATE POLICY "public read sops"      ON hub_sop_documents       FOR SELECT USING (true);

-- Write: anon key allowed (PIN auth enforced client-side)
-- To lock down further, change these to: USING (auth.role() = 'service_role')
-- and route all writes through a server-side function with the service key.
CREATE POLICY "anon write events"    ON hub_events              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon write equipment" ON hub_equipment           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon write maint"     ON hub_maintenance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon write sops"      ON hub_sop_documents       FOR ALL USING (true) WITH CHECK (true);

-- ── Sample Data (optional — delete after setup) ─────────────────
INSERT INTO hub_equipment (name, type, year, description) VALUES
  ('Tractor 1',        'tractor',    2015, 'Main beach launch tractor'),
  ('Club RIB 1',       'rib',        2019, 'Patrol and safety boat'),
  ('Club RIB 2',       'rib',        2021, 'Race officer support boat'),
  ('Outboard 1 (60hp)','engine',     2018, 'Primary outboard for RIB 1'),
  ('Outboard 2 (40hp)','engine',     2020, 'Secondary outboard for RIB 2')
ON CONFLICT DO NOTHING;
