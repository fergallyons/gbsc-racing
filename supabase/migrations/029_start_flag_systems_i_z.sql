-- Add I (round-the-ends) and Z (20% penalty) as further preparatory flag
-- options on race_starts, alongside the existing P/U/Black.
-- Idempotent — safe to re-run.

ALTER TABLE race_starts DROP CONSTRAINT IF EXISTS race_starts_flag_system_check;
ALTER TABLE race_starts ADD CONSTRAINT race_starts_flag_system_check
  CHECK (flag_system IN ('P','U','Black','I','Z'));
