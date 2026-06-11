-- Add assignee to equipment issues
ALTER TABLE hub_equipment_issues ADD COLUMN IF NOT EXISTS assigned_to TEXT;
