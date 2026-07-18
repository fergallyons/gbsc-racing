-- Sail number per boat — needed to export finishes in HalSail's import
-- format (Sail No is the mandatory matching key for their CSV import).
-- Idempotent.

ALTER TABLE boats ADD COLUMN IF NOT EXISTS sail_number text NOT NULL DEFAULT '';
