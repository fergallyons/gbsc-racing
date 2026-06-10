-- Update event_type values to new categories
-- Run in Supabase SQL Editor

-- Drop old CHECK constraint first, then remap values, then add new constraint
ALTER TABLE hub_events DROP CONSTRAINT IF EXISTS hub_events_event_type_check;

UPDATE hub_events SET event_type = 'regattas' WHERE event_type IN ('racing');
UPDATE hub_events SET event_type = 'other'    WHERE event_type IN ('general','training','maintenance');

ALTER TABLE hub_events
  ADD CONSTRAINT hub_events_event_type_check
  CHECK (event_type IN ('cruisers','dinghys','regattas','social','other','external'));

-- Update default
ALTER TABLE hub_events ALTER COLUMN event_type SET DEFAULT 'other';
