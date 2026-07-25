-- Migrations 040 and 042 tried to lock down sensitive columns (pin,
-- pin_hash, ro_pin, ro_pin_hash, admin_pin_hash, and the payment-redirect
-- fields revolut_user/stripe_link_*/ro_revolut_user) with statements like:
--   REVOKE SELECT (pin) ON boats FROM anon;
--   REVOKE UPDATE (pin, revolut_user) ON boats FROM anon;
--
-- Those are no-ops. In Postgres, a column-level REVOKE only removes an
-- *explicit* column-level grant — it does nothing to a broader table-level
-- grant. boats/settings only ever had table-level grants (schema.sql's
-- `GRANT SELECT, INSERT, UPDATE, DELETE ON boats TO anon`, plus Supabase's
-- own default per-schema grants covering settings), so every REVOKE (col)
-- in 040/042 silently revoked nothing. Confirmed live: anon could still
-- SELECT boats.pin and settings.admin_pin_hash directly, and could still
-- PATCH boats.revolut_user / settings.stripe_link_* without ever calling
-- the PIN-gated RPCs — the exact hole 040 was meant to close. See chat
-- 2026-07-25.
--
-- Fix: REVOKE the whole-table SELECT/UPDATE grant, then GRANT it back as
-- an explicit column allowlist — the only way to actually narrow access in
-- Postgres. Allowlists below are built from every actual read/write site
-- in app.js, not guessed. Idempotent.

-- ── boats ──────────────────────────────────────────────────────────────
REVOKE SELECT, UPDATE ON boats FROM anon;

-- Excludes: pin, pin_hash, pin_is_default (nothing in app.js reads
-- pin_is_default directly — it only ever comes back via verify_boat_pin's
-- RPC return value).
GRANT SELECT (id, name, icon, revolut_user, created_at, stripe_link, sail_number, photo_url, whatsapp)
  ON boats TO anon;

-- Excludes: pin, pin_hash, pin_is_default, revolut_user (gated via
-- set_boat_revolut_user RPC). name has no update path in app.js (only set
-- at creation) so it's deliberately left out too.
GRANT UPDATE (icon, sail_number, photo_url, whatsapp) ON boats TO anon;

-- ── settings ───────────────────────────────────────────────────────────
REVOKE SELECT, UPDATE ON settings FROM anon;

-- Excludes: ro_pin, ro_pin_hash, admin_pin_hash.
GRANT SELECT (
  id, stripe_link_member, stripe_link_student, stripe_link_visitor,
  pre_race_window_hours, worldtides_key, ro_revolut_user,
  results_published_race_key, updated_at, features, estella_url,
  logo_url, favicon_url, primary_color, ro_color,
  start_lat, start_lng, wind_lat, wind_lng, tide_station, tide_odm_offset,
  fee_full, fee_crew, fee_visitor, fee_student, fee_kid,
  visitor_max, crew_max_yrs, noticeboard_url, results_url, hal_club,
  vapid_public_key
) ON settings TO anon;

-- Excludes: ro_pin (gated via change_ro_pin RPC), ro_pin_hash,
-- admin_pin_hash, stripe_link_member/student/visitor + ro_revolut_user
-- (gated via set_ro_payment_settings RPC). Everything here matches an
-- actual field in a saveClubSettingsFields()/sbSaveClubSettings() call in
-- app.js — id is included because PostgREST's merge-duplicates upsert
-- includes it in the SET clause even though the value never changes.
GRANT UPDATE (
  id, pre_race_window_hours, worldtides_key, results_published_race_key,
  updated_at, features, estella_url, hal_club,
  fee_full, fee_crew, fee_visitor, fee_student, fee_kid,
  visitor_max, crew_max_yrs, start_lat, start_lng, wind_lat, wind_lng,
  tide_station, tide_odm_offset, noticeboard_url, vapid_public_key, results_url
) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('045_fix_column_privilege_revokes.sql')
ON CONFLICT (filename) DO NOTHING;
