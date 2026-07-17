-- RCYC catch-up script — applies everything added to GBSC's schema since
-- RCYC's DB was bootstrapped (migrations 026-030), in one idempotent pass.
-- Safe to re-run. Run this in the RCYC Supabase project's SQL Editor.
--
--   026 — news_items table (public News ticker / RO News panel)
--   027 — protest "type" column: Redress and Scoring Enquiry alongside Protest
--   028 — race_starts table: Start Sequence simulator
--         (029 I/Z flag options and 030 postponed/AP status are folded
--          straight into this CREATE TABLE, since the table is new to RCYC)

-- 026 — news_items
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

-- 028 — race_starts: Start Sequence simulator (flags/countdown, no RO on the line)
-- includes 029 (I/Z flag systems) and 030 (postponed/AP status) already
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
