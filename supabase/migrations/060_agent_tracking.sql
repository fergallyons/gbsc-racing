-- Location Agent pilot (Phase 0): lets a native background-GPS app (piloting
-- with Traccar Client, pointed at netlify/functions/agent-ingest.js) post
-- into the exact same race_positions table the web-based Race Tracker
-- already writes to — everything downstream (live map, replay, finish/OCS
-- detection) already reads from race_positions and doesn't need to know a
-- ping came from a phone app instead of a browser tab. Idempotent.

-- Deliberately NOT anon-readable or anon-writable, unlike almost every
-- other table in this app (the "race data is public" trust model doesn't
-- extend to device credentials). Only agent-ingest.js/agent-pair.js, using
-- the service_role key, ever touch this table. RLS enabled with zero
-- policies denies every role except service_role (which bypasses RLS) —
-- don't "fix" that later by copying the anon-open pattern from
-- race_positions/registrations.
CREATE TABLE IF NOT EXISTS agent_tokens (
  token        text        PRIMARY KEY,
  boat_id      text        NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key     text        NOT NULL,
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS agent_tokens_boat_idx ON agent_tokens(boat_id);
ALTER TABLE agent_tokens ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS but NOT the base table grant — same lesson
-- learned (and now applied up front) for race_finishes/race_ocs, 046/047.
GRANT SELECT, INSERT, UPDATE ON agent_tokens TO service_role;

-- Triage only ("did this come from the web tracker or the agent pilot") —
-- not exposed in any UI yet. anon already has a table-level INSERT grant on
-- race_positions (migration 039, not column-restricted), so no additional
-- anon grant is needed for this column; service_role needs its own grant
-- explicitly, same reasoning as agent_tokens above.
ALTER TABLE race_positions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
GRANT INSERT ON race_positions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE race_positions_id_seq TO service_role;

INSERT INTO schema_migrations (filename) VALUES ('060_agent_tracking.sql')
ON CONFLICT (filename) DO NOTHING;
