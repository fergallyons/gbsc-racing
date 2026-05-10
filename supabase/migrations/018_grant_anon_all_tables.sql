-- Grant anon role access to all app tables that were missing explicit grants.
-- Earlier migrations created tables with RLS policies but omitted GRANT statements,
-- causing 401 "permission denied" errors for the PostgREST anon role.
-- Idempotent — safe to re-run.

grant select, insert, update, delete on races              to anon;
grant select, insert, update, delete on race_records       to anon;
grant select, insert, update, delete on race_payments      to anon;
grant select, insert, update, delete on race_attendees     to anon;
grant select, insert, update, delete on push_subscriptions to anon;
grant select, insert, update, delete on session_logs       to anon;
grant select, insert, update, delete on skipper_declarations to anon;
grant select, insert, update, delete on course_card_courses to anon;
grant select, insert, update, delete on series_fees        to anon;
grant select, insert, update, delete on marks              to anon;
grant select, insert, update, delete on published_courses  to anon;
grant select, insert, update, delete on start_finish_lines to anon;
grant select, insert, update, delete on boats              to anon;
grant select, insert, update, delete on crew               to anon;
grant select, insert, update, delete on settings           to anon;
