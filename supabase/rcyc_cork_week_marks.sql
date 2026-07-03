-- ============================================================
-- RCYC Marks Manager — replace with Cork Week 2026 mark list
-- Run against RCYC's Supabase project SQL Editor.
-- ============================================================
-- Source: CorkWeek2026_All_Marks_DDM.csv (degrees + decimal minutes,
-- converted to decimal degrees; West longitudes negated).
--
-- Keeps the handful of existing marks that the RCYC course card
-- (course_card_courses.rounds, migration 011) refers to by name —
-- Dosco, Ringabella, Harp, Cage, Grassy Walk — so course descriptions
-- like "Round 1: Dosco (P) – W2 (P) – Cage (S)" still have a matching
-- pin on the map. Everything else from the old seed (015) is removed
-- and replaced by the 30 Cork Week marks below.
--
-- Idempotent — safe to re-run (DELETE + INSERT ... ON CONFLICT DO UPDATE).
-- ============================================================

-- ── Remove old marks NOT referenced by the course card text ────
DELETE FROM marks WHERE id IN (
  'rcyc_east', 'rcyc_spike', 'rcyc_rochespt', 'rcyc_spitbank',
  'rcyc_buoy5', 'rcyc_buoy8', 'rcyc_daunt', 'rcyc_seabuoy'
);

-- ── Remove any previous Cork Week import (re-run safety) ────────
DELETE FROM marks WHERE id LIKE 'ck_%';

-- ── Insert the Cork Week 2026 mark list ──────────────────────────
-- Colour key: orange (#f4a261) = racing/special mark, teal (#00bcd4) =
-- start/finish reference, blue (#5c9bd6) = navigation aid / harbour mark.
INSERT INTO marks (id, name, lat, lng, colour, description, active, sort_order) VALUES

  ('ck_cork_buoy',        'Cork Buoy',         51+42.980/60, -(8+15.540/60), '#5c9bd6', 'Red & White Pillar',            true, 100),
  ('ck_daunt_rock_buoy',  'Daunt Rock Buoy',   51+43.600/60, -(8+17.590/60), '#5c9bd6', 'Red Can',                       true, 101),
  ('ck_large_sovereign_is','Large Sovereign Is',51+40.540/60, -(8+27.030/60), '#5c9bd6', 'Island',                       true, 102),
  ('ck_power_buoy',       'Power Buoy',        51+45.700/60, -(8+06.580/60), '#5c9bd6', 'South Cardinal Buoy',           true, 103),
  ('ck_offshore_laid',    'Offshore Laid',     51+44.350/60, -(8+11.050/60), '#f4a261', 'Yellow Spherical',              true, 104),
  ('ck_volvo_1',          'Volvo 1',           51+50.800/60, -(8+17.700/60), '#f4a261', 'Black Spherical',               true, 105),
  ('ck_volvo_3',          'Volvo 3',           51+46.390/60, -(8+17.780/60), '#f4a261', 'Yellow racing mark',            true, 106),
  ('ck_volvo_4',          'Volvo 4',           51+47.200/60, -(8+14.280/60), '#f4a261', 'Yellow racing mark',            true, 107),
  ('ck_volvo_5',          'Volvo 5',           51+45.600/60, -(8+16.340/60), '#f4a261', 'Yellow special mark',           true, 108),
  ('ck_volvo_6',          'Volvo 6',           51+46.180/60, -(8+14.110/60), '#f4a261', 'Yellow special mark',           true, 109),
  ('ck_no3',              'No.3',              51+47.850/60, -(8+16.100/60), '#5c9bd6', 'Harbour mark (approx)',         true, 110),
  ('ck_no5',              'No.5',              51+47.300/60, -(8+16.500/60), '#5c9bd6', 'Harbour mark (approx)',         true, 111),
  ('ck_no6',              'No.6',              51+47.200/60, -(8+15.800/60), '#5c9bd6', 'Harbour mark (approx)',         true, 112),
  ('ck_no8',              'No.8',              51+48.100/60, -(8+16.800/60), '#5c9bd6', 'Harbour mark (approx)',         true, 113),
  ('ck_no10',             'No.10',             51+48.900/60, -(8+17.100/60), '#5c9bd6', 'Harbour mark (approx)',         true, 114),
  ('ck_no11',             'No.11',             51+49.200/60, -(8+15.900/60), '#5c9bd6', 'Harbour mark (approx)',         true, 115),
  ('ck_no13',             'No.13',             51+50.100/60, -(8+16.400/60), '#5c9bd6', 'Harbour mark (approx)',         true, 116),
  ('ck_no14',             'No.14',             51+50.500/60, -(8+16.000/60), '#5c9bd6', 'Harbour mark (approx)',         true, 117),
  ('ck_no16',             'No.16',             51+50.900/60, -(8+16.800/60), '#5c9bd6', 'Harbour mark (approx)',         true, 118),
  ('ck_no18',             'No.18',             51+51.200/60, -(8+17.500/60), '#5c9bd6', 'Harbour mark (approx)',         true, 119),
  ('ck_no20',             'No.20',             51+51.500/60, -(8+18.100/60), '#5c9bd6', 'Harbour mark (approx)',         true, 120),
  ('ck_e1',               'E1',                51+46.800/60, -(8+13.500/60), '#5c9bd6', 'Harbour mark (approx)',         true, 121),
  ('ck_e2',               'E2',                51+46.500/60, -(8+13.200/60), '#00bcd4', 'Harbour mark - finish ref (approx)', true, 122),
  ('ck_w1',               'W1',                51+46.600/60, -(8+15.200/60), '#5c9bd6', 'Harbour mark (approx)',         true, 123),
  ('ck_w2',               'W2',                51+46.400/60, -(8+15.500/60), '#00bcd4', 'Harbour mark - start area (approx)', true, 124),
  ('ck_w4',               'W4',                51+47.000/60, -(8+14.800/60), '#5c9bd6', 'Harbour mark (approx)',         true, 125),
  ('ck_e4',               'E4',                51+46.700/60, -(8+13.000/60), '#00bcd4', 'Harbour mark - finish ref (approx)', true, 126),
  ('ck_corkbeg',          'Corkbeg',           51+50.300/60, -(8+15.200/60), '#00bcd4', 'Harbour finish area (approx)',  true, 127),
  ('ck_haulbowline',      'Haulbowline',       51+50.800/60, -(8+17.800/60), '#00bcd4', 'Beaufort Cup start',            true, 128),
  ('ck_roches_point',     'Roches Point',      51+47.400/60, -(8+15.300/60), '#00bcd4', 'Lighthouse - finish ref',       true, 129)

ON CONFLICT (id) DO UPDATE
  SET name        = excluded.name,
      lat         = excluded.lat,
      lng         = excluded.lng,
      colour      = excluded.colour,
      description = excluded.description,
      active      = excluded.active,
      sort_order  = excluded.sort_order;

-- ============================================================
-- Kept from the previous seed (unchanged, no action needed) because
-- the course card text names them directly:
--   rcyc_dosco, rcyc_ringabella, rcyc_harp, rcyc_cage, rcyc_grassy
-- ============================================================
