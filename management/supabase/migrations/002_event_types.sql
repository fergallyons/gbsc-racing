-- Update event_type values to new categories
-- Run in Supabase SQL Editor

-- Remap old values to closest new equivalents
UPDATE hub_events SET event_type = 'regattas' WHERE event_type IN ('racing');
UPDATE hub_events SET event_type = 'other'    WHERE event_type IN ('general','training','maintenance');

-- Drop old CHECK constraint and add new one
ALTER TABLE hub_events DROP CONSTRAINT IF EXISTS hub_events_event_type_check;
ALTER TABLE hub_events
  ADD CONSTRAINT hub_events_event_type_check
  CHECK (event_type IN ('cruisers','dinghys','regattas','social','other','external'));

-- Update default
ALTER TABLE hub_events ALTER COLUMN event_type SET DEFAULT 'other';
