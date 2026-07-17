-- Add 'postponed' as a race_starts status, for the AP (Answering Pennant)
-- flag — displayed before the warning signal to postpone a race that
-- hasn't started yet. Idempotent — safe to re-run.

ALTER TABLE race_starts DROP CONSTRAINT IF EXISTS race_starts_status_check;
ALTER TABLE race_starts ADD CONSTRAINT race_starts_status_check
  CHECK (status IN ('armed','cancelled','postponed'));
