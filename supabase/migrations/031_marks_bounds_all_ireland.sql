-- Widen marks_insert's plausible-coordinate bounds from Galway Bay only
-- to all-Ireland, so every club's marks (Cork Harbour, Howth, etc.) can
-- be inserted through the anon/app role, not just Galway's. Idempotent.

ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_insert;
DROP POLICY IF EXISTS "marks_insert" ON marks;
CREATE POLICY "marks_insert" ON marks FOR INSERT WITH CHECK (
  id ~ '^[a-z0-9_-]{1,60}$'
  AND lat BETWEEN 51.0 AND 55.5
  AND lng BETWEEN -11.0 AND -5.5
);
