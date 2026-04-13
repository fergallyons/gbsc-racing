-- Migration 004: Session logs — track who logs in and when
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS session_logs (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_type   text        NOT NULL CHECK (session_type IN ('skipper','ro','guest')),
  boat_id        text        REFERENCES boats(id) ON DELETE SET NULL,
  boat_name      text,
  logged_in_at   timestamptz NOT NULL DEFAULT now(),
  logged_out_at  timestamptz
);

ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

-- Anon can insert (login) and update their own row (logout) — identified by id passed back to the client
CREATE POLICY "session_insert" ON session_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "session_update" ON session_logs
  FOR UPDATE USING (true);

-- Only service_role (RO uses anon key but we allow SELECT via a separate policy)
-- RO reads stats using the anon key, so we allow SELECT for all
CREATE POLICY "session_select" ON session_logs
  FOR SELECT USING (true);

GRANT INSERT, UPDATE, SELECT ON public.session_logs TO anon;
GRANT USAGE, SELECT ON SEQUENCE session_logs_id_seq TO anon;
