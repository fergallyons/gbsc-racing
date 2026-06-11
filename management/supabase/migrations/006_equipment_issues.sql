-- Equipment issue tracking

CREATE TABLE IF NOT EXISTS hub_equipment_issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id   UUID NOT NULL REFERENCES hub_equipment(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  severity       TEXT NOT NULL DEFAULT 'medium'
                 CHECK (severity IN ('low','medium','high','critical')),
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','resolved')),
  reported_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  reported_by    TEXT,
  resolved_date  DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hub_equipment_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read issues" ON hub_equipment_issues FOR SELECT USING (true);
CREATE POLICY "anon write issues"  ON hub_equipment_issues FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON hub_equipment_issues TO anon, authenticated;

CREATE INDEX IF NOT EXISTS hub_issues_equip_idx  ON hub_equipment_issues (equipment_id);
CREATE INDEX IF NOT EXISTS hub_issues_status_idx ON hub_equipment_issues (status);
CREATE INDEX IF NOT EXISTS hub_issues_date_idx   ON hub_equipment_issues (reported_date DESC);
