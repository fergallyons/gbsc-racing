-- Add 'dinghy' to hub_equipment type CHECK constraint
ALTER TABLE hub_equipment DROP CONSTRAINT IF EXISTS hub_equipment_type_check;
ALTER TABLE hub_equipment
  ADD CONSTRAINT hub_equipment_type_check
  CHECK (type IN ('tractor','rib','dinghy','engine','safety_boat','other'));
