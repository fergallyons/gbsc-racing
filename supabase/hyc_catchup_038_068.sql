-- HYC catch-up: migrations 038–045, 057 and 059–068.
--
-- HYC's project was created on 2026-07-17 from an early hyc_bootstrap.sql
-- (up to 037; 039–045 were folded into that file only on 2026-07-25), and
-- 046–056 were applied to it later. Checked 2026-10-08 against HYC's
-- schema_migrations: everything listed below is missing. Notably 040/042 —
-- without them the verify_ro_pin / verify_boat_pin / verify_admin_pin
-- functions the app calls for every PIN check do not exist on HYC.
--
-- Run once in the HYC Supabase project's SQL Editor. Wrapped in a single
-- transaction: if any step fails, nothing is applied. Every section is
-- idempotent, so it is also safe to re-run.
--
-- After running:
--   * 040 hashes HYC's EXISTING RO and boat PINs — nobody needs a new one.
--   * 042 creates the Admin PIN as 0000 — change it straight away (Club
--     Settings), it gates the season-setup and financial tiles.
--
-- Differences from running the migration files as-is:
--   * 058_day_scoped_race_payments.sql is NOT included — GBSC-only by its
--     own header (it dedupes/deletes payment rows and re-keys fees per day);
--     HYC keeps the per-race fee behaviour. Not recorded either.
--   * 062_rnli_base_amount.sql: its step 3 (UPDATE settings SET
--     rnli_base_amount = 600 WHERE id = 'club') is removed — every club's
--     settings row is id 'club', so it would give HYC GBSC's €600.
--   * 063_course_templates.sql: DROP POLICY IF EXISTS added before each
--     CREATE POLICY so a re-run doesn't fail.
--   * 20260421_start_finish_lines.sql: HYC's bootstrap already created the
--     table but never recorded the migration; it is only RECORDED here, so
--     the migration runner never seeds GBSC's three Galway lines into HYC.
--   * Seeds for other clubs (007, 008, 011, 014–016), 034 (superseded) and
--     069 (not adopted) are not included.

BEGIN;

-- ====================================================================
-- 038_push_subscriptions_role.sql
-- ====================================================================

-- push_subscriptions needs a way to tell subscription "topics" apart now
-- that RO (registration alerts) and Crew (course-published, like Skipper's
-- existing toggle) subscriptions exist alongside the original Skipper ones
-- — all three can have boat_id NULL or non-NULL in ways that no longer
-- uniquely identify which topic a row is for. Idempotent.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'skipper'
    CHECK (role IN ('skipper','crew','ro'));

-- Backfill: the only NULL-boat_id rows that could exist before this
-- migration are from the RO subscribe toggle added just before this one —
-- reclassify those; boat-scoped rows stay 'skipper' (the default), which
-- is what they always were.
UPDATE push_subscriptions SET role='ro' WHERE boat_id IS NULL AND role='skipper';

INSERT INTO schema_migrations (filename) VALUES ('038_push_subscriptions_role.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 039_race_positions.sql
-- ====================================================================

-- Race Tracker: opt-in live position sharing per boat, per race, with replay
-- afterwards. Positions persist for 72h (see netlify/functions/
-- race-positions-cleanup.js for the retention job), then get purged.
-- Idempotent.

CREATE TABLE IF NOT EXISTS race_positions (
  id          bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boat_id     text              NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  race_key    text              NOT NULL,
  lat         double precision  NOT NULL,
  lng         double precision  NOT NULL,
  heading     double precision,
  speed_kn    double precision,
  recorded_at timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_positions_race_key_idx ON race_positions(race_key, recorded_at);
CREATE INDEX IF NOT EXISTS race_positions_boat_idx ON race_positions(boat_id, race_key);

ALTER TABLE race_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "race_positions_select" ON race_positions;
DROP POLICY IF EXISTS "race_positions_insert" ON race_positions;
-- Live/replay positions are open — same trust model as every other race
-- table in this app (results, registrations, etc. are all anon-readable).
-- A boat only ever appears here at all when its skipper has explicitly
-- opted in for that specific race — see registrations.tracking_enabled
-- below. Decision + rationale: chat 2026-07-22.
CREATE POLICY "race_positions_select" ON race_positions FOR SELECT USING (true);
CREATE POLICY "race_positions_insert" ON race_positions FOR INSERT WITH CHECK (
  boat_id IS NOT NULL AND race_key IS NOT NULL
  AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
);
GRANT SELECT, INSERT ON race_positions TO anon;
GRANT USAGE, SELECT ON SEQUENCE race_positions_id_seq TO anon;

-- Per-race, per-boat opt-in — the skipper's explicit consent for that one
-- race, not a standing account-level setting. Off by default. Reuses the
-- existing "anon_update_registrations" policy (USING true / WITH CHECK
-- true) from migration 021 — only the column-level grant is new here.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT false;
GRANT UPDATE (tracking_enabled) ON registrations TO anon;

INSERT INTO schema_migrations (filename) VALUES ('039_race_positions.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 040_secure_pins.sql
-- ====================================================================

-- Move boat PINs, the RO PIN, and payment-redirect fields behind server-side
-- verification instead of plaintext anon-readable/writable columns.
--
-- Before this: checkPin() in app.js fetched a boat's real `pin` with a plain
-- SELECT and compared it in the browser. That meant (a) anyone could read
-- any boat's PIN directly via REST with no auth at all, and (b) boats_update
-- / settings_update had no ownership check, so anyone could overwrite a
-- boat's pin/revolut_user, or the club's RO pin and Stripe payment links,
-- with a single unauthenticated REST call — full boat/RO takeover and a
-- path to redirect race-fee payments. See chat 2026-07-23.
--
-- Fix: PINs are hashed (pgcrypto/bcrypt), never SELECT-able by anon, and all
-- verification + sensitive writes go through SECURITY DEFINER RPC functions
-- that check the hash server-side before touching anything. This keeps the
-- existing no-login-friction PIN UX exactly as-is — it just makes the check
-- real instead of decorative. Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── boats ──────────────────────────────────────────────────────────────
ALTER TABLE boats ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS pin_is_default boolean NOT NULL DEFAULT true;
UPDATE boats SET pin_hash = crypt(pin, gen_salt('bf')) WHERE pin_hash IS NULL;
UPDATE boats SET pin_is_default = (pin = '0000') WHERE pin_hash IS NOT NULL;
ALTER TABLE boats ALTER COLUMN pin_hash SET NOT NULL;
-- New boats (RO "Add Boat", or a skipper self-registering) still INSERT via
-- the old boats_insert policy without ever knowing about pin_hash — this
-- default keeps that working, matching the old `pin DEFAULT '0000'` exactly.
ALTER TABLE boats ALTER COLUMN pin_hash SET DEFAULT crypt('0000', gen_salt('bf'));

REVOKE SELECT (pin) ON boats FROM anon;
REVOKE UPDATE (pin, revolut_user) ON boats FROM anon;
-- pin_hash / pin_is_default are NEW columns, but boats already has a
-- table-level "GRANT SELECT ON boats TO anon" from the original schema —
-- in Postgres that covers every column, including ones added later, unless
-- explicitly revoked. A bcrypt hash of a 4-digit PIN is brute-forceable in
-- well under an hour if it leaks, so this isn't optional hardening.
REVOKE SELECT (pin_hash, pin_is_default) ON boats FROM anon;

-- ── settings (RO pin + Stripe / payment fields) ──────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ro_pin_hash text;
UPDATE settings SET ro_pin_hash = crypt(COALESCE(ro_pin, '0000'), gen_salt('bf')) WHERE ro_pin_hash IS NULL;

REVOKE SELECT (ro_pin) ON settings FROM anon;
REVOKE UPDATE (ro_pin, stripe_link_member, stripe_link_student, stripe_link_visitor, ro_revolut_user) ON settings FROM anon;
-- Same reasoning as pin_hash above — settings also has a pre-existing
-- table-level SELECT grant that would otherwise cover this new column too.
REVOKE SELECT (ro_pin_hash) ON settings FROM anon;

-- ── boat PIN: verify / change (self-service) ──────────────────────────────
CREATE OR REPLACE FUNCTION verify_boat_pin(p_boat_id text, p_pin text)
RETURNS TABLE(ok boolean, is_default boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT (pin_hash = crypt(p_pin, pin_hash)), pin_is_default
  FROM boats WHERE id = p_boat_id;
$$;
REVOKE ALL ON FUNCTION verify_boat_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_boat_pin(text,text) TO anon;

CREATE OR REPLACE FUNCTION change_boat_pin(p_boat_id text, p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (pin_hash = crypt(p_current_pin, pin_hash)) INTO v_ok FROM boats WHERE id = p_boat_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_boat_pin(text,text,text) TO anon;

-- RO admin override — reset a boat's forgotten PIN without knowing the old
-- one, gated by the RO's own pin instead (existing "PIN" button in the RO's
-- Manage Boats panel, openChangePinForBoat() in app.js).
CREATE OR REPLACE FUNCTION reset_boat_pin(p_ro_pin text, p_boat_id text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_ro_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET pin_hash = crypt(p_new_pin, gen_salt('bf')), pin_is_default = (p_new_pin = '0000')
    WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION reset_boat_pin(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_boat_pin(text,text,text) TO anon;

CREATE OR REPLACE FUNCTION set_boat_revolut_user(p_boat_id text, p_current_pin text, p_revolut_user text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (pin_hash = crypt(p_current_pin, pin_hash)) INTO v_ok FROM boats WHERE id = p_boat_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE boats SET revolut_user = p_revolut_user WHERE id = p_boat_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_boat_revolut_user(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_boat_revolut_user(text,text,text) TO anon;

-- ── RO pin: verify / change ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_ro_pin(p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT (ro_pin_hash = crypt(p_pin, ro_pin_hash)) FROM settings WHERE id = 'club';
$$;
REVOKE ALL ON FUNCTION verify_ro_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_ro_pin(text) TO anon;

CREATE OR REPLACE FUNCTION change_ro_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET ro_pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_ro_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_ro_pin(text,text) TO anon;

-- Stripe links + RO's own Revolut handle — same takeover-via-payment-
-- redirect risk as boats.revolut_user, gated the same way.
CREATE OR REPLACE FUNCTION set_ro_payment_settings(
  p_current_pin text,
  p_stripe_link_member text,
  p_stripe_link_student text,
  p_stripe_link_visitor text,
  p_ro_revolut_user text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET
    stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
    stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
    stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
    ro_revolut_user      = COALESCE(p_ro_revolut_user,      ro_revolut_user)
  WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text) TO anon;

INSERT INTO schema_migrations (filename) VALUES ('040_secure_pins.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 041_protest_workflow.sql
-- ====================================================================

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

-- ====================================================================
-- 042_admin_pin.sql
-- ====================================================================

-- Admin PIN — a second, more tightly-held tier above the RO PIN, for larger
-- clubs with a rotating roster of volunteer ROs. Right now the single RO
-- PIN unlocks everything: race-day operations AND season setup/financial
-- config (Stripe links, race schedule, marks library, boat/PIN management).
-- At a club with several ROs sharing that one PIN, every volunteer running
-- a Wednesday night also has full financial/structural access. This splits
-- that: race-day tiles stay behind the existing RO PIN; season-setup tiles
-- move behind this one instead. Same hash+RPC pattern as migration 040.
-- See chat 2026-07-23. Idempotent.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_pin_hash text;
UPDATE settings SET admin_pin_hash = crypt('0000', gen_salt('bf')) WHERE admin_pin_hash IS NULL;
-- No plaintext admin_pin column ever existed (this tier is new), so unlike
-- ro_pin there's no legacy value to migrate from — but settings already has
-- a table-level SELECT grant from the original schema, which covers this
-- new column too unless revoked (see migration 040's fix for the same
-- mistake made with ro_pin_hash/pin_hash).
REVOKE SELECT (admin_pin_hash) ON settings FROM anon;

CREATE OR REPLACE FUNCTION verify_admin_pin(p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT (admin_pin_hash = crypt(p_pin, admin_pin_hash)) FROM settings WHERE id = 'club';
$$;
REVOKE ALL ON FUNCTION verify_admin_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_admin_pin(text) TO anon;

CREATE OR REPLACE FUNCTION change_admin_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (admin_pin_hash = crypt(p_current_pin, admin_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET admin_pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION change_admin_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_admin_pin(text,text) TO anon;

INSERT INTO schema_migrations (filename) VALUES ('042_admin_pin.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 043_race_starts_more_class_flags.sql
-- ====================================================================

-- Add Tango (T) and Whiskey (W) as additional class flag options, alongside
-- the existing E/0/1/2 — RO wants more class flags available for start
-- sequences with more than 4 classes. See chat 2026-07-24.
--
-- Drops whatever the existing class_flag CHECK constraint is actually named
-- (it was created inline without an explicit name, so relying on Postgres's
-- default naming convention is fragile) and re-adds it with the wider list.
-- Idempotent — safe to re-run.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'race_starts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%class_flag%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE race_starts DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE race_starts ADD CONSTRAINT race_starts_class_flag_check
  CHECK (class_flag IN ('E','0','1','2','T','W'));

INSERT INTO schema_migrations (filename) VALUES ('043_race_starts_more_class_flags.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 044_rename_olympic_to_trapezoid.sql
-- ====================================================================

-- "Olympic" was never a real Appendix S course type — it's not defined
-- anywhere in the current (2025-2028) Racing Rules of Sailing, and the
-- shape the app drew for it (Windward-Wing-Leeward-Windward-Finish)
-- didn't correspond to anything real, which is why it read as confusing.
-- Replaced with Trapezoid, a genuine course type used at dinghy events:
-- windward leg, reach to a spreader/offset mark, leeward leg, then a
-- reach finish. See chat 2026-07-24.
--
-- Renames any already-published 'olympic' course rows before widening the
-- constraint (can't have rows violating a constraint that no longer
-- allows the old value), then rebuilds the CHECK — looked up by its
-- actual auto-generated name rather than guessed, same as migration 043's
-- fix for race_starts.class_flag, since this one was also created inline/
-- unnamed. Idempotent.

UPDATE published_courses SET course_type='trapezoid' WHERE course_type='olympic';

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'published_courses'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%course_type%';
  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE published_courses DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE published_courses ADD CONSTRAINT published_courses_course_type_check
  CHECK (course_type IN ('windward_leeward','triangle','trapezoid'));

INSERT INTO schema_migrations (filename) VALUES ('044_rename_olympic_to_trapezoid.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 045_fix_column_privilege_revokes.sql
-- ====================================================================

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

-- ====================================================================
-- 057_published_courses_per_race.sql
-- ====================================================================

-- Lets an RO publish a DIFFERENT course per race instead of one club-wide
-- 'current' row shared by every fleet racing that night. Built for MSC,
-- which runs Cruisers and Ruffians as separate simultaneous races (races
-- table, migration 053) — today's single global course means one fleet's
-- marks silently overwrite the other's the moment either RO hits Publish.
--
-- New id shapes the app introduces: 'race_<races.id>' (live, visible to
-- skippers) and 'draft_race_<races.id>' (RO's in-progress edit, invisible
-- to skippers — same idea as the existing global 'draft'). The literal
-- 'current'/'draft' rows are untouched and keep working exactly as today
-- for any club/race that doesn't use this.
--
-- race_id is a convenience FK for data hygiene and future queries only —
-- the app always resolves a course by constructing the 'race_<id>' string
-- client-side (it already holds races.id in memory), never by filtering
-- on this column. ON DELETE SET NULL rather than CASCADE: deleting a race
-- should not destroy course history; an orphaned race_id=NULL row with a
-- still-race-shaped id is inert (never re-fetched, since no live race has
-- that id anymore) — the same no-janitorial-cleanup philosophy already
-- applied to 'current'/'draft' rows, which are also never deleted, only
-- overwritten or superseded.
--
-- CRITICAL FIX bundled into this migration: the original courses_insert
-- policy (unchanged since before the migrations/ system existed — not
-- touched by 013_published_courses_upsertable.sql, which only widened
-- UPDATE) is `WITH CHECK (id = 'current')`. A race's course row does not
-- exist until its first-ever publish/draft-save, so that first write is
-- always a plain INSERT (nothing to upsert-conflict against yet) — every
-- per-race id this feature introduces needs the widened check below, or
-- every first publish for every race 403s.
--
-- Also adding a real DELETE policy: DELETE has been GRANTed on this table
-- since original creation but no POLICY has ever existed for it (RLS
-- defaults to "no rows visible" with zero permissive policies), so
-- publishCourse()'s existing "delete the old draft row after publish"
-- call (app.js) has never actually removed anything. This migration's
-- per-race draft cleanup needs a working DELETE, so we add the policy —
-- which also fixes that pre-existing no-op for the legacy 'draft' row,
-- at no extra cost.
--
-- Idempotent — safe to re-run.

ALTER TABLE published_courses ADD COLUMN IF NOT EXISTS race_id bigint REFERENCES races(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "courses_insert" ON published_courses;
CREATE POLICY "courses_insert" ON published_courses FOR INSERT WITH CHECK (
  id = 'current' OR id = 'draft' OR id ~ '^(draft_)?race_[0-9]+$'
);

DROP POLICY IF EXISTS "courses_delete" ON published_courses;
CREATE POLICY "courses_delete" ON published_courses FOR DELETE USING (true);

INSERT INTO schema_migrations (filename) VALUES ('057_published_courses_per_race.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 059_protest_archive.sql
-- ====================================================================

-- Adds an archive state to protests, distinct from delete. A protest
-- that's reached a decision (Upheld/Dismissed/Withdrawn) and is no longer
-- relevant can be archived instead of permanently deleted — archived_at
-- NULL = active (shows in the default list + dashboard count), non-NULL =
-- archived (excluded from both, still viewable via the Archived toggle).
-- Idempotent — safe to re-run.

ALTER TABLE protests ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='protests' AND column_name='archived_at'
  ) THEN RAISE EXCEPTION 'archived_at column not found on protests';
  END IF;
  RAISE NOTICE 'OK: protests.archived_at exists';
END $$;

INSERT INTO schema_migrations (filename) VALUES ('059_protest_archive.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 060_agent_tracking.sql
-- ====================================================================

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

-- ====================================================================
-- 061_rnli_contributions.sql
-- ====================================================================

-- ============================================================
-- Migration 061: RNLI contributions
-- Run this entire script in the Supabase SQL Editor.
-- It is idempotent — safe to re-run if a previous attempt
-- partially succeeded.
--
-- Adds a crew-level, no-login-required way to contribute to the RNLI via
-- Revolut (a dedicated account, deliberately separate from ro_revolut_user
-- which is the Race Committee's own fee-forwarding account) or Card
-- (reuses the club's existing Stripe account via create-bulk-checkout.js
-- — no new Stripe setup needed). Tracked in a small immutable ledger for
-- a running total.
-- ============================================================


-- ── Step 1: settings.rnli_revolut_user ────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS rnli_revolut_user text DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='settings' AND column_name='rnli_revolut_user'
  ) THEN RAISE EXCEPTION 'Step 1 FAILED: rnli_revolut_user column not found on settings';
  END IF;
  RAISE NOTICE 'Step 1 OK: settings.rnli_revolut_user exists';
END $$;


-- ── Step 2: grant read access to the new column ───────────────
-- 045_fix_column_privilege_revokes.sql replaced settings' table-level
-- anon SELECT with an explicit per-column allowlist. A new column has NO
-- anon privileges — not even SELECT — until added here. Read-only,
-- matching ro_revolut_user's own treatment; write stays RPC-gated only.
GRANT SELECT (rnli_revolut_user) ON settings TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_name='settings' AND column_name='rnli_revolut_user'
      AND grantee='anon' AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'Step 2 FAILED: anon SELECT grant on rnli_revolut_user not found';
  END IF;
  RAISE NOTICE 'Step 2 OK: anon can SELECT rnli_revolut_user';
END $$;


-- ── Step 3: extend set_ro_payment_settings with the new field ─
-- Postgres identifies functions by name+arg-types — changing the
-- parameter list needs an explicit DROP first, or the OLD 5-arg version
-- stays callable as a silent overload that just ignores the new field.
DROP FUNCTION IF EXISTS set_ro_payment_settings(text,text,text,text,text);

CREATE OR REPLACE FUNCTION set_ro_payment_settings(
  p_current_pin text,
  p_stripe_link_member text,
  p_stripe_link_student text,
  p_stripe_link_visitor text,
  p_ro_revolut_user text,
  p_rnli_revolut_user text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ro_pin_hash = crypt(p_current_pin, ro_pin_hash)) INTO v_ok FROM settings WHERE id = 'club';
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  UPDATE settings SET
    stripe_link_member  = COALESCE(p_stripe_link_member,  stripe_link_member),
    stripe_link_student = COALESCE(p_stripe_link_student, stripe_link_student),
    stripe_link_visitor = COALESCE(p_stripe_link_visitor, stripe_link_visitor),
    ro_revolut_user      = COALESCE(p_ro_revolut_user,      ro_revolut_user),
    rnli_revolut_user     = COALESCE(p_rnli_revolut_user,    rnli_revolut_user)
  WHERE id = 'club';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION set_ro_payment_settings(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_ro_payment_settings(text,text,text,text,text,text) TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='set_ro_payment_settings' AND pronargs=6
  ) THEN RAISE EXCEPTION 'Step 3 FAILED: 6-arg set_ro_payment_settings not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='set_ro_payment_settings' AND pronargs=5
  ) THEN RAISE EXCEPTION 'Step 3 FAILED: old 5-arg overload still exists';
  END IF;
  RAISE NOTICE 'Step 3 OK: set_ro_payment_settings is the single 6-arg version';
END $$;


-- ── Step 4: rnli_contributions ledger ──────────────────────────
-- Not boat/crew-scoped by design — contributing is frictionless, no
-- picker step. Immutable audit log, same doctrine as self_payments:
-- insert-only, no UPDATE/DELETE grant or policy.
CREATE TABLE IF NOT EXISTS rnli_contributions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount      int         NOT NULL CHECK (amount > 0),
  method      text        NOT NULL CHECK (method IN ('Revolut','Card')),
  boat_id     text REFERENCES boats(id) ON DELETE SET NULL,
  payment_ref text,                                    -- Stripe Checkout Session's client ref; null for Revolut
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rnli_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rnli_contributions_select" ON rnli_contributions;
DROP POLICY IF EXISTS "rnli_contributions_insert" ON rnli_contributions;
CREATE POLICY "rnli_contributions_select" ON rnli_contributions FOR SELECT USING (true);
CREATE POLICY "rnli_contributions_insert" ON rnli_contributions FOR INSERT WITH CHECK (
  amount > 0 AND method IN ('Revolut','Card')
);
GRANT SELECT, INSERT ON rnli_contributions TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name='rnli_contributions'
  ) THEN RAISE EXCEPTION 'Step 4 FAILED: rnli_contributions table not found';
  END IF;
  RAISE NOTICE 'Step 4 OK: rnli_contributions exists with SELECT+INSERT for anon';
END $$;


-- ── All done ─────────────────────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('061_rnli_contributions.sql')
ON CONFLICT (filename) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 061 complete — RNLI contributions ready';
END $$;

-- ====================================================================
-- 062_rnli_base_amount.sql
-- ====================================================================

-- ============================================================
-- Migration 062: RNLI running-total base amount
-- Run this entire script in the Supabase SQL Editor.
-- It is idempotent — safe to re-run.
--
-- Adds a starting "base" amount to the RNLI running total shown on the
-- dashboard tiles (rnli_revolut_user / rnli_contributions themselves came
-- from migration 061) — GBSC has already collected real RNLI donations
-- outside this app (cash at the club, etc.) and wants the displayed total
-- to start from that credible figure rather than €0. Deliberately a
-- separate settings field rather than a fake row in rnli_contributions:
-- that table is a real, insert-only, per-gift audit ledger (amount +
-- method + timestamp, CHECK method IN ('Revolut','Card')) — a "starting
-- balance" isn't a real Revolut/Card gift and shouldn't pretend to be
-- one. The displayed total is base + SUM(rnli_contributions.amount).
-- ============================================================


-- ── Step 1: settings.rnli_base_amount ─────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS rnli_base_amount int NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='settings' AND column_name='rnli_base_amount'
  ) THEN RAISE EXCEPTION 'Step 1 FAILED: rnli_base_amount column not found on settings';
  END IF;
  RAISE NOTICE 'Step 1 OK: settings.rnli_base_amount exists';
END $$;


-- ── Step 2: grant read access to the new column ───────────────
-- Same allowlist doctrine as every other settings column since migration
-- 045 — see rnli_revolut_user's own treatment in migration 061.
GRANT SELECT (rnli_base_amount) ON settings TO anon;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_name='settings' AND column_name='rnli_base_amount'
      AND grantee='anon' AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'Step 2 FAILED: anon SELECT grant on rnli_base_amount not found';
  END IF;
  RAISE NOTICE 'Step 2 OK: anon can SELECT rnli_base_amount';
END $$;


-- ── Step 3 (GBSC's €600 seed) omitted for HYC — base amount stays 0 ──


-- ── All done ─────────────────────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('062_rnli_base_amount.sql')
ON CONFLICT (filename) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 062 complete — RNLI base amount ready';
END $$;

-- ====================================================================
-- 063_course_templates.sql
-- ====================================================================

-- Course Templates: an RO can save a course built in the Course Builder
-- (mark-builder or laid-course mode) under a name, then reload it into the
-- builder for a future race instead of rebuilding it from scratch — the
-- "Wednesday windward-leeward" or "usual Cove course" gets built once.
--
-- Deliberately NOT for course-card mode (RCYC-style) — course_card_courses
-- (migration 010) already IS a reusable named library there, seeded once
-- and picked from every week; a second "template" concept over the same
-- idea would just be two ways to do the same thing.
--
-- Modeled on course_card_courses' shape/RLS style rather than
-- published_courses: published_courses.id is a routing key ('current',
-- 'draft', 'race_<id>', 'draft_race_<id>' — see 057), not a free-form name,
-- and its insert policy only accepts those exact id shapes — a template
-- needs its own identity space, not a slot in that one.

CREATE TABLE IF NOT EXISTS course_templates (
  id              bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text              NOT NULL,
  marks           jsonb             NOT NULL DEFAULT '[]',  -- [{id, rounding}, ...] — empty for a laid course
  course_type     text,                                     -- 'windward_leeward' | 'triangle' | 'trapezoid' | null (mark-builder)
  laps            int,
  start_line_id   text,
  finish_line_id  text,
  notes           text,
  created_at      timestamptz       NOT NULL DEFAULT now()
);

ALTER TABLE course_templates ENABLE ROW LEVEL SECURITY;
-- Same open trust model as marks/course_card_courses — a template is RO
-- working data, not anything requiring a security boundary beyond the PIN
-- already gating the Course Builder panel itself.
DROP POLICY IF EXISTS "course_templates_select" ON course_templates;
CREATE POLICY "course_templates_select" ON course_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "course_templates_insert" ON course_templates;
CREATE POLICY "course_templates_insert" ON course_templates FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "course_templates_update" ON course_templates;
CREATE POLICY "course_templates_update" ON course_templates FOR UPDATE USING (true);
DROP POLICY IF EXISTS "course_templates_delete" ON course_templates;
CREATE POLICY "course_templates_delete" ON course_templates FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON course_templates TO anon;
GRANT USAGE, SELECT ON SEQUENCE course_templates_id_seq TO anon;

INSERT INTO schema_migrations (filename) VALUES ('063_course_templates.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 064_position_accuracy.sql
-- ====================================================================

-- Race Tracker: capture each position ping's own GPS accuracy (metres) —
-- both sources already have this available and were just discarding it.
-- The browser's Geolocation API hands back pos.coords.accuracy on every fix
-- (see onTrackPosition() in app.js); Traccar Client's OsmAnd-protocol ping
-- carries the same thing as a plain "accuracy" query param (see
-- agent-ingest.js). Lets the tracking sailor see "is this actually working"
-- instead of silently hoping — see chat 2026-09-16 (SailPro competitive
-- review, recommendation #5).
--
-- No grant changes needed: race_positions kept its original table-level
-- `GRANT SELECT, INSERT ON race_positions TO anon` (migration 039) — unlike
-- boats/settings, it was never narrowed to column-level grants (045), so a
-- new column is covered automatically.

ALTER TABLE race_positions ADD COLUMN IF NOT EXISTS accuracy double precision;

INSERT INTO schema_migrations (filename) VALUES ('064_position_accuracy.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 065_racing_cancelled.sql
-- ====================================================================

-- "Racing Cancelled" overlay: a single RO-toggled switch (with an optional
-- short note, e.g. "No wind" or "Storm warning") that shows a full-screen
-- notice to every skipper/crew/public viewer next time they open or reload
-- the app, instead of them finding out only by turning up at the club.
--
-- New columns on the existing settings singleton row, following the same
-- narrow, additive column-grant style as every other settings column since
-- 045_fix_column_privilege_revokes.sql locked that table down to an
-- explicit allowlist — a bare table-level GRANT here would be a no-op
-- (REVOKEd already) and, worse, wouldn't even error to say so.
--
-- Deliberately loaded via its own isolated request (see loadRacingCancelled
-- Status() in app.js), NOT folded into SETTINGS_SELECT/fullSelect — an
-- unknown column in that shared select 400s the WHOLE query and silently
-- drops every club back to a much narrower legacy fallback (confirmed live
-- 2026-09-02, see loadRnliRevolutUser()'s comment for the exact incident).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS racing_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS racing_cancelled_note text NOT NULL DEFAULT '';

GRANT SELECT (racing_cancelled, racing_cancelled_note) ON settings TO anon;
GRANT UPDATE (racing_cancelled, racing_cancelled_note) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('065_racing_cancelled.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 066_boat_info.sql
-- ====================================================================

-- Boat Info: a free-text (markdown) repository of crew-facing information
-- per boat — safety gear locations, engine start procedure, WiFi code,
-- house rules, whatever a skipper wants their crew to have on hand. Edited
-- by the skipper (needs the boat PIN, same as everything else skipper-side);
-- viewing it does NOT need the PIN by default off, but the skipper can flip
-- info_public on to also show it from the public/crew "Starting Line" boat
-- summary sheet (openBoatSummary() in app.js) — no login needed there at all.
--
-- info_public is a UI-level gate, not a real security boundary — same
-- caveat that already applies to every other PIN in this app (see
-- docs/FEATURE_SPEC.md §10: "PINs are a light deterrent... not a security
-- boundary in the traditional sense"). Both columns are anon-SELECT/UPDATE
-- (below), so info_md is technically fetchable directly regardless of
-- info_public — the flag controls what the APP shows, matching how
-- everything else here already works.

ALTER TABLE boats
  ADD COLUMN IF NOT EXISTS info_md text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS info_public boolean NOT NULL DEFAULT false;

-- Additive grants — boats already narrowed anon to a column allowlist
-- (045_fix_column_privilege_revokes.sql), so a bare table-level GRANT here
-- would silently do nothing for a column that isn't already on that list.
GRANT SELECT (info_md, info_public) ON boats TO anon;
GRANT UPDATE (info_md, info_public) ON boats TO anon;

INSERT INTO schema_migrations (filename) VALUES ('066_boat_info.sql')
ON CONFLICT (filename) DO NOTHING;

-- ====================================================================
-- 067_ro_protest.sql
-- ====================================================================

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

-- ====================================================================
-- 068_hal_api_key.sql
-- ====================================================================

-- Halsail is moving its API to require a key. This only provides somewhere to
-- STORE it — nothing reads it yet (the auth scheme Halsail will use isn't
-- known), and the proxy wiring is a separate follow-up.
--
-- Unlike hal_club/worldtides_key, the key is write-only for anon: UPDATE is
-- granted, SELECT deliberately is not, so it can't be read back out of the
-- browser with the public anon key. A server-side function using the service
-- role will be what eventually reads it. The generated hal_api_key_set flag
-- is SELECT-able so the settings panel can show "key saved" without ever
-- seeing the key itself.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS hal_api_key text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS hal_api_key_set boolean
  GENERATED ALWAYS AS (hal_api_key IS NOT NULL AND hal_api_key <> '') STORED;

GRANT UPDATE (hal_api_key) ON settings TO anon;
GRANT SELECT (hal_api_key_set) ON settings TO anon;

INSERT INTO schema_migrations (filename) VALUES ('068_hal_api_key.sql')
ON CONFLICT (filename) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 20260421_start_finish_lines.sql — table already created by
-- hyc_bootstrap.sql; record it only (its seed rows are GBSC's lines)
-- ════════════════════════════════════════════════════════════════════
INSERT INTO schema_migrations (filename) VALUES ('20260421_start_finish_lines.sql')
ON CONFLICT (filename) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- Restore column grants 045 wipes when it runs after 048/050/051 (as it
-- does on HYC, which already had 046–056). Added after the first run broke
-- HYC's boat list — see hyc_fix_045_grants.sql.
-- ════════════════════════════════════════════════════════════════════
GRANT SELECT (bow_offset_m) ON boats TO anon;
GRANT UPDATE (bow_offset_m) ON boats TO anon;
GRANT SELECT (fleet_id) ON boats TO anon;
GRANT UPDATE (fleet_id) ON boats TO anon;
GRANT SELECT (sponsors) ON settings TO anon;
GRANT UPDATE (sponsors) ON settings TO anon;

COMMIT;

-- Check: everything from 001 to 068 except 007, 008, 011, 014–016, 034 and
-- 058, plus 20260421_start_finish_lines.sql
SELECT filename FROM schema_migrations ORDER BY filename;
