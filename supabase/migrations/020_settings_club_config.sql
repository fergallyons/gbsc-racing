-- Move per-club configuration from Netlify env vars into the settings table.
-- All columns are idempotent (ADD COLUMN IF NOT EXISTS) and safe to run on
-- both GBSC and RCYC databases.  Default values match the app's existing
-- hard-coded fallbacks so existing behaviour is preserved until each club
-- populates the row via the admin panel.

alter table settings
  -- Branding / display
  add column if not exists logo_url          text not null default '',
  add column if not exists favicon_url       text not null default '',
  add column if not exists primary_color     text not null default '',
  add column if not exists ro_color          text not null default '',

  -- Race start position (used for weather, tides, course builder)
  add column if not exists start_lat         double precision,
  add column if not exists start_lng         double precision,

  -- Wind forecast position (defaults to start position when null)
  add column if not exists wind_lat          double precision,
  add column if not exists wind_lng          double precision,

  -- Tides
  add column if not exists tide_station      text not null default '',
  add column if not exists tide_odm_offset   double precision not null default 2.95,

  -- Race fees (cents or whole currency units, same as before)
  add column if not exists fee_full          int  not null default 4,
  add column if not exists fee_crew          int  not null default 4,
  add column if not exists fee_visitor       int  not null default 10,
  add column if not exists fee_student       int  not null default 5,
  add column if not exists fee_kid           int  not null default 0,
  add column if not exists visitor_max       int  not null default 6,
  add column if not exists crew_max_yrs      int  not null default 2,

  -- RO access PIN
  add column if not exists ro_pin            text not null default '0000',

  -- External links
  add column if not exists noticeboard_url   text not null default '',
  add column if not exists results_url       text not null default '',

  -- Integrations
  add column if not exists hal_club          int,
  add column if not exists vapid_public_key  text not null default '';
