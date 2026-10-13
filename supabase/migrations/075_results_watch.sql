-- "Results are up" notifications (netlify/functions/results-watch.js).
-- One row per Sail Scoring series the watcher follows: where its public
-- results file is, how many races had results last time it looked, and the
-- last race it announced. A new row is recorded WITHOUT notifying (so the
-- first run never announces a whole season's history); a later run that
-- finds more scored races pushes "Race N results are up".
--
-- Server-only: the scheduled function uses the service role. No anon
-- policies or grants, so the browser can neither read nor write it.
-- Idempotent.

CREATE TABLE IF NOT EXISTS results_watch (
  series_id           text PRIMARY KEY,   -- Sail Scoring series id (or the data URL when no API key)
  data_url            text NOT NULL,
  name                text,
  scored_races        int  NOT NULL DEFAULT 0,
  last_notified_race  int,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE results_watch ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON results_watch TO service_role;

INSERT INTO schema_migrations (filename) VALUES ('075_results_watch.sql')
ON CONFLICT (filename) DO NOTHING;
