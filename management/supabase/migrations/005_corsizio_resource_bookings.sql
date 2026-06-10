-- Lightweight resource bookings for Corsizio (external) training events.
-- Stores only what's needed for conflict detection — no copy of event content.

CREATE TABLE IF NOT EXISTS hub_corsizio_resource_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corsizio_event_id TEXT NOT NULL,
  equipment_id      UUID NOT NULL REFERENCES hub_equipment(id) ON DELETE CASCADE,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(corsizio_event_id, equipment_id)
);

ALTER TABLE hub_corsizio_resource_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read crz bookings"  ON hub_corsizio_resource_bookings FOR SELECT USING (true);
CREATE POLICY "anon write crz bookings"   ON hub_corsizio_resource_bookings FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON hub_corsizio_resource_bookings TO anon, authenticated;

CREATE INDEX IF NOT EXISTS hub_crz_bookings_event_idx ON hub_corsizio_resource_bookings (corsizio_event_id);
CREATE INDEX IF NOT EXISTS hub_crz_bookings_equip_idx ON hub_corsizio_resource_bookings (equipment_id);
CREATE INDEX IF NOT EXISTS hub_crz_bookings_dates_idx ON hub_corsizio_resource_bookings (start_date, end_date);
