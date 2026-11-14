-- Safety Oversight: a digital version of Irish Sailing's "Pre-Launch Dynamic
-- Risk Assessment" form, scoped to a race day (race_days, 054).
--
-- One row per SAVE, not per day — this is explicitly a *Dynamic* RA, meant
-- to be redone through the day as conditions change (morning assessment,
-- a revised afternoon one, etc.). Nothing is ever overwritten; app.js only
-- ever shows the latest row for a given day. That's also a genuine audit
-- trail, which is the whole point of a safety record.
--
-- The 9 risk-row VALUES are stored raw (wind_kts, sea_state, etc.) — never
-- a derived Low/Medium/High label. That bucketing lives only in app.js
-- against SAFETY_RISK_THRESHOLDS there, so a future threshold tweak never
-- strands old rows with a now-wrong label baked in.
--
-- decision_go is NOT NULL: a row is only ever written at the moment the RO
-- taps "Yes — Go Afloat" or "No — Cancel Racing" (saveSafetyAssessment() in
-- app.js), so there is no "draft/undecided" row — only transient draft
-- state in the open panel before that tap.
--
-- controls is jsonb, not one column per risk row: only rows that come out
-- Medium/High ever get a control noted (the form's own printed rule — "if
-- no appropriate control is identified the decision to go afloat must be
-- no"), so this is genuinely sparse/variable data, unlike the always-present
-- risk values above. Shape: {<rowSlug>: 'control text'}.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='race_days') THEN
    RAISE EXCEPTION '082 needs migration 054 (race_days) applied first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS race_day_safety (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_day_id          date NOT NULL REFERENCES race_days(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  lead_name            text NOT NULL DEFAULT '',
  lead_phone           text NOT NULL DEFAULT '',
  shore_contact_name   text NOT NULL DEFAULT '',
  shore_contact_phone  text NOT NULL DEFAULT '',
  vhf_channel          text NOT NULL DEFAULT '',
  boats_racing         int,
  sailors_afloat       int,
  forecast_text        text NOT NULL DEFAULT '',
  other_factors        text NOT NULL DEFAULT '',
  sunset_time          time,
  wind_kts             numeric,
  sea_state            text CHECK (sea_state IN ('low','medium','high')),
  visibility_nm        numeric,
  air_temp_c           numeric,
  water_temp_c         numeric,
  competence           text CHECK (competence IN ('low','medium','high')),
  time_afloat_hrs      numeric,
  distance_nm          numeric,
  boat_ratio           text CHECK (boat_ratio IN ('low','medium','high')),
  controls             jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_go          boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS race_day_safety_race_day_id_idx ON race_day_safety(race_day_id);

-- SELECT + INSERT only — no UPDATE/DELETE policy, deliberately matching
-- `registrations`' own precedent (schema.sql: "UPDATE is never used...
-- use delete + re-insert if a registration needs changing"). Enforces the
-- immutable-log design at the DB layer, not just by JS convention: once
-- an assessment is saved, the only way to change the record is to save a
-- new one.
ALTER TABLE race_day_safety ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_day_safety_select" ON race_day_safety;
DROP POLICY IF EXISTS "race_day_safety_insert" ON race_day_safety;
CREATE POLICY "race_day_safety_select" ON race_day_safety FOR SELECT USING (true);
CREATE POLICY "race_day_safety_insert" ON race_day_safety FOR INSERT WITH CHECK (true);
GRANT SELECT, INSERT ON race_day_safety TO anon;

INSERT INTO schema_migrations (filename) VALUES ('082_race_day_safety.sql')
ON CONFLICT (filename) DO NOTHING;
