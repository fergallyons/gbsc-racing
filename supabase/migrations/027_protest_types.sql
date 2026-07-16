-- Add Redress and Scoring Enquiry as protest types alongside the existing
-- Protest flow (RRS 61 / 62). Redress and scoring enquiries aren't always
-- filed against another boat (e.g. redress against a race committee error),
-- so protestee_id becomes nullable. Idempotent — safe to re-run.

ALTER TABLE protests
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'protest'
    CHECK (type IN ('protest','redress','scoring_enquiry'));

ALTER TABLE protests ALTER COLUMN protestee_id DROP NOT NULL;

DROP POLICY IF EXISTS "protests_insert" ON protests;
CREATE POLICY "protests_insert" ON protests FOR INSERT WITH CHECK (
  protestor_id IS NOT NULL
  AND (protestee_id IS NULL OR protestor_id <> protestee_id)
  AND (protestee_id IS NOT NULL OR type <> 'protest')
  AND description <> ''
);
