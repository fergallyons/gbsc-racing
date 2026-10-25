-- Club Admin sign-ins (071) are logged as session_type 'admin', which the
-- original check constraint (004: skipper / ro / guest) refused — every
-- admin sign-in failed to log with a 23514 in the console. Allow it.
-- Until this is applied, the app logs an admin sign-in as 'ro' instead.
-- Idempotent.

ALTER TABLE session_logs DROP CONSTRAINT IF EXISTS session_logs_session_type_check;
ALTER TABLE session_logs ADD CONSTRAINT session_logs_session_type_check
  CHECK (session_type IN ('skipper','ro','guest','admin'));

INSERT INTO schema_migrations (filename) VALUES ('077_session_logs_admin.sql')
ON CONFLICT (filename) DO NOTHING;
