-- ============================================================
-- RCYC Demo Seed Data
-- Run this against the RCYC Supabase project AFTER schema.sql
-- and 006_add_races_table.sql
-- ============================================================

-- Demo fleet
INSERT INTO boats (id, name, icon, pin) VALUES
  ('silver_spray',    'Silver Spray',    '⛵', '1720'),
  ('fastnet_star',    'Fastnet Star',    '⛵', '1720'),
  ('cobh_spirit',     'Cobh Spirit',     '⛵', '1720'),
  ('celtic_wind',     'Celtic Wind',     '⛵', '1720'),
  ('sovereigns_isle', 'Sovereigns Isle', '⛵', '1720'),
  ('black_rock',      'Black Rock',      '⛵', '1720'),
  ('harbour_light',   'Harbour Light',   '⛵', '1720'),
  ('old_head',        'Old Head',        '⛵', '1720')
ON CONFLICT (id) DO NOTHING;

-- Demo race schedule — Wednesday nights, Cork Harbour, summer 2026
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Wednesday Night Racing — Wed 13 May', '2026-05-13', 18, 30, 'Wednesday Night Racing', 1),
  ('Wednesday Night Racing — Wed 20 May', '2026-05-20', 18, 30, 'Wednesday Night Racing', 2),
  ('Wednesday Night Racing — Wed 27 May', '2026-05-27', 18, 30, 'Wednesday Night Racing', 3),
  ('Wednesday Night Racing — Wed 3 Jun',  '2026-06-03', 18, 30, 'Wednesday Night Racing', 4),
  ('Wednesday Night Racing — Wed 10 Jun', '2026-06-10', 18, 30, 'Wednesday Night Racing', 5),
  ('Wednesday Night Racing — Wed 17 Jun', '2026-06-17', 18, 30, 'Wednesday Night Racing', 6),
  ('Wednesday Night Racing — Wed 24 Jun', '2026-06-24', 18, 30, 'Wednesday Night Racing', 7),
  ('Tricentennial Cup — Sat 6 Jun',       '2026-06-06', 11,  0, 'Tricentennial Cup',      1),
  ('Tricentennial Cup — Sun 7 Jun',       '2026-06-07', 11,  0, 'Tricentennial Cup',      2)
ON CONFLICT DO NOTHING;
