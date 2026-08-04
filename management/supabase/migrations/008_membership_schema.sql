-- Club Membership Database
--
-- Adds the actual club membership roster (contacts, dues, applications),
-- distinct from hub_members which is the *hub login whitelist* (committee
-- people allowed into this admin app, unrelated to sailing club membership).
--
-- Column choices (mobile/phone as separate fields, in_arrears as its own
-- flag, membership_number as a free-text external ref) are shaped directly
-- off a real ClubMin contact export, not guessed.
--
-- Security note: unlike the earlier hub_* tables in this file (which allow
-- anon writes gated only by a client-side PIN), these tables restrict all
-- access to `authenticated` sessions — the hub already has real Supabase
-- Auth, so this is a straightforward tightening, not a new mechanism.
-- The one exception is hub_membership_applications, which allows anon
-- INSERT only, so a future public "apply to join" form can submit without
-- a login while staff-only review stays locked down.
--
-- Run this in your Supabase SQL editor (same as migrations 001-007).

-- ── Membership Types (fee schedule) ─────────────────────────────
CREATE TABLE IF NOT EXISTS hub_membership_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  annual_fee_cents  INTEGER NOT NULL DEFAULT 0 CHECK (annual_fee_cents >= 0),
  display_order     INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Membership Roster (the actual membership database) ──────────
CREATE TABLE IF NOT EXISTS hub_membership_roster (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_number       TEXT UNIQUE,           -- external ref, e.g. ClubMin uid
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  mobile                  TEXT,
  address_line1           TEXT,
  address_line2           TEXT,
  city                    TEXT,
  county                  TEXT,
  eircode                 TEXT,
  date_of_birth           DATE,
  membership_type_id      UUID REFERENCES hub_membership_types (id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('prospective','active','lapsed','resigned')),
  in_arrears              BOOLEAN NOT NULL DEFAULT false,
  joined_date             DATE,
  renewal_date            DATE,
  primary_member_id       UUID REFERENCES hub_membership_roster (id) ON DELETE SET NULL,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_roster_last_name_idx  ON hub_membership_roster (last_name);
CREATE INDEX IF NOT EXISTS hub_roster_status_idx      ON hub_membership_roster (status);
CREATE INDEX IF NOT EXISTS hub_roster_type_idx        ON hub_membership_roster (membership_type_id);
CREATE INDEX IF NOT EXISTS hub_roster_primary_idx     ON hub_membership_roster (primary_member_id);
CREATE INDEX IF NOT EXISTS hub_roster_renewal_idx     ON hub_membership_roster (renewal_date);

-- ── Membership Payments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_membership_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES hub_membership_roster (id) ON DELETE CASCADE,
  membership_type_id  UUID REFERENCES hub_membership_types (id) ON DELETE SET NULL,
  period_year         INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
  method              TEXT NOT NULL DEFAULT 'other'
                      CHECK (method IN ('stripe','cash','bank_transfer','other')),
  stripe_payment_ref  TEXT,
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by         TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_payments_member_idx ON hub_membership_payments (member_id);
CREATE INDEX IF NOT EXISTS hub_payments_year_idx   ON hub_membership_payments (period_year DESC);

-- ── Membership Applications (schema now; UI/workflow built later) ─
CREATE TABLE IF NOT EXISTS hub_membership_applications (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name                     TEXT NOT NULL,
  last_name                      TEXT NOT NULL,
  email                          TEXT,
  phone                          TEXT,
  mobile                         TEXT,
  address_line1                  TEXT,
  address_line2                  TEXT,
  city                           TEXT,
  county                         TEXT,
  eircode                        TEXT,
  date_of_birth                  DATE,
  requested_membership_type_id   UUID REFERENCES hub_membership_types (id) ON DELETE SET NULL,
  proposer_name                  TEXT,
  seconder_name                  TEXT,
  message                        TEXT,
  status                         TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','approved','rejected')),
  submitted_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by                    TEXT,
  reviewed_at                    TIMESTAMPTZ,
  review_notes                   TEXT,
  converted_member_id            UUID REFERENCES hub_membership_roster (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS hub_applications_status_idx ON hub_membership_applications (status);

-- ── Row Level Security ────────────────────────────────────────────
ALTER TABLE hub_membership_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_membership_roster       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_membership_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_membership_applications ENABLE ROW LEVEL SECURITY;

-- Types: readable by anyone (non-sensitive; a future public application
-- form needs to show the fee schedule), writable by hub staff only.
CREATE POLICY "public read membership types"    ON hub_membership_types FOR SELECT USING (true);
CREATE POLICY "authenticated write membership types" ON hub_membership_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT ON hub_membership_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON hub_membership_types TO authenticated;

-- Roster & payments: staff (authenticated) only — no anon access at all.
CREATE POLICY "authenticated all roster" ON hub_membership_roster
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON hub_membership_roster TO authenticated;

CREATE POLICY "authenticated all payments" ON hub_membership_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON hub_membership_payments TO authenticated;

-- Applications: anyone can submit (INSERT only, no SELECT — can't read
-- other people's applications back), staff can do everything.
CREATE POLICY "public submit application" ON hub_membership_applications
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "authenticated all applications" ON hub_membership_applications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT INSERT ON hub_membership_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON hub_membership_applications TO authenticated;

-- ── schema_migrations tracking (matches root app's convention; harmless
-- no-op here since this app's migrations are applied by hand, not via
-- scripts/run-migrations.mjs — kept for consistency/future-proofing) ─
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (filename) VALUES ('008_membership_schema.sql') ON CONFLICT DO NOTHING;
