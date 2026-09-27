-- Race Committee / Race Officer protest (RRS 60.2/60.3) — the committee
-- itself protesting a boat, alongside the existing boat-vs-boat protest
-- (RRS 60.1). A new `type` value ('ro_protest'), not a repurposed
-- 'protest' + null protestor: keeping every "who can be the protestor,
-- what workflow applies" question keyed off `type` (already the pattern
-- for protest/redress/scoring_enquiry, see 027_protest_types.sql) rather
-- than adding a second, implicit signal.
--
-- protestor_id was NOT NULL from the original schema (schema.sql) and
-- 027_protest_types.sql never touched that — only protestee_id was
-- relaxed there (for redress/scoring enquiries with no boat on the other
-- side). A committee protest has no protestor BOAT at all, so this
-- relaxes protestor_id too, but only ever actually null for 'ro_protest'
-- rows — every other type still requires a real boat, enforced below.

ALTER TABLE protests DROP CONSTRAINT IF EXISTS protests_type_check;
ALTER TABLE protests ADD CONSTRAINT protests_type_check
  CHECK (type IN ('protest','redress','scoring_enquiry','ro_protest'));

ALTER TABLE protests ALTER COLUMN protestor_id DROP NOT NULL;

DROP POLICY IF EXISTS "protests_insert" ON protests;
CREATE POLICY "protests_insert" ON protests FOR INSERT WITH CHECK (
  (protestor_id IS NOT NULL OR type = 'ro_protest')
  AND (protestor_id IS NULL OR protestee_id IS NULL OR protestor_id <> protestee_id)
  AND (protestee_id IS NOT NULL OR type NOT IN ('protest','ro_protest'))
  AND description <> ''
);

INSERT INTO schema_migrations (filename) VALUES ('067_ro_protest.sql')
ON CONFLICT (filename) DO NOTHING;
