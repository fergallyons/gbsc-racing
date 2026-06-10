-- Training calendar and resource allocation

-- Distinguish club events from training sessions
ALTER TABLE hub_events
  ADD COLUMN IF NOT EXISTS calendar_type TEXT NOT NULL DEFAULT 'club'
  CHECK (calendar_type IN ('club','training'));

-- Half-day sessions for training events
ALTER TABLE hub_events
  ADD COLUMN IF NOT EXISTS session_half TEXT NOT NULL DEFAULT 'full'
  CHECK (session_half IN ('full','morning','afternoon'));

CREATE INDEX IF NOT EXISTS hub_events_caltype_idx ON hub_events (calendar_type);

-- Equipment assigned to events (RIBs, safety boats, etc.)
CREATE TABLE IF NOT EXISTS hub_event_resources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES hub_events(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES hub_equipment(id) ON DELETE CASCADE,
  role         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, equipment_id)
);

ALTER TABLE hub_event_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read resources" ON hub_event_resources FOR SELECT USING (true);
CREATE POLICY "anon write resources"  ON hub_event_resources FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON hub_event_resources TO anon, authenticated;

CREATE INDEX IF NOT EXISTS hub_resources_event_idx ON hub_event_resources (event_id);
CREATE INDEX IF NOT EXISTS hub_resources_equip_idx ON hub_event_resources (equipment_id);
