-- Sail Scoring connected-app access (OAuth), replacing the per-club API key
-- (069) for acting in the club's Sail Scoring workspace: the RO (or Club
-- Admin) connects RaceOps from Sail Scoring Setup, signs in at Sail Scoring
-- and approves; the tokens that come back act as that person, in the one
-- workspace they chose (docs/public-api.md#getting-access in
-- github.com/sailscoring/sailscoring). Netlify functions ss-connect.js,
-- ss-oauth-callback.js and _sailscoring.js are the only readers/writers.
--
-- Server-only, like results_watch (075): no anon policies or grants, so the
-- tokens can't be read or changed from the browser at all. The app learns
-- whether the club is connected (and to which workspace) from ss-connect's
-- status action, never from these tables.
-- Idempotent.

-- The club's registration with Sail Scoring (id is always 'club'): Sail
-- Scoring registers each club's RaceOps separately and issues its client
-- id (and, for an app with a server, a secret) for the exact redirect URI
-- given at registration — the club's own callback, e.g.
-- https://racing.gbsc.ie/.netlify/functions/ss-oauth-callback. Entered in
-- Sail Scoring Setup and saved by ss-connect.js; the secret is never sent
-- back to the browser. Kept apart from ss_connection so disconnecting
-- doesn't lose it.
CREATE TABLE IF NOT EXISTS ss_client (
  id             text PRIMARY KEY DEFAULT 'club' CHECK (id = 'club'),
  client_id      text,
  client_secret  text,
  redirect_uri   text,
  scopes         text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The club's one connection (id is always 'club'). The access token lasts
-- an hour; the refresh token renews it and is replaced on every renewal.
CREATE TABLE IF NOT EXISTS ss_connection (
  id                 text PRIMARY KEY DEFAULT 'club' CHECK (id = 'club'),
  access_token       text,
  access_expires_at  timestamptz,
  refresh_token      text,
  scope              text,
  workspace_id       text,
  workspace_slug     text,
  workspace_name     text,
  status             text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','lapsed')),
  last_error         text,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- One row per sign-in in progress: the PKCE code_verifier stays here, server
-- side, and only the state's nonce travels through the browser and Sail
-- Scoring. Rows are used once and expire after 15 minutes.
CREATE TABLE IF NOT EXISTS ss_oauth_pending (
  nonce          text PRIMARY KEY,
  code_verifier  text NOT NULL,
  return_to      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ss_client ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_oauth_pending ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ss_client TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ss_connection TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ss_oauth_pending TO service_role;

INSERT INTO schema_migrations (filename) VALUES ('076_ss_connection.sql')
ON CONFLICT (filename) DO NOTHING;
