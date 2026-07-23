-- Protest workflow: hearing scheduling, an arbitration step, and a per-race
-- protest time limit — built after ICRA's commodore and a National Race
-- Officer reviewed the app and flagged the Race Committee side of protest
-- handling (informing protestees, scheduling hearings, encouraging
-- arbitration) as the highest-value gap. Maps to RRS 2025-2028 Rule 63
-- (Conduct of Hearings) and Appendix T (Arbitration). See chat 2026-07-23.
-- Idempotent.

ALTER TABLE protests
  ADD COLUMN IF NOT EXISTS hearing_at         timestamptz,
  ADD COLUMN IF NOT EXISTS hearing_location   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS arbitration_status text NOT NULL DEFAULT 'none'
    CHECK (arbitration_status IN ('none','offered','penalty_accepted','withdrawn','proceeding')),
  ADD COLUMN IF NOT EXISTS arbitration_notes  text NOT NULL DEFAULT '';

-- Per-race protest time limit (RRS 60.3 default is 2h after the last boat
-- finishes, but sailing instructions commonly set their own) — the RO sets
-- this explicitly per race rather than the app trying to infer it from
-- finish data, since finishes are often recorded downstream in HalSail,
-- not locally.
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS protest_deadline timestamptz;

-- Skipper's own WhatsApp number — a direct-contact channel for protest/
-- hearing communication alongside push notifications, for skippers who
-- don't have (or trust) browser push. Free text; digits are extracted at
-- send-time to build a wa.me link, not enforced here.
ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS whatsapp text NOT NULL DEFAULT '';

INSERT INTO schema_migrations (filename) VALUES ('041_protest_workflow.sql')
ON CONFLICT (filename) DO NOTHING;
