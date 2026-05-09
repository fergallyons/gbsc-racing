-- RCYC Race Calendar 2025–2026
-- Source: https://www.royalcork.com/wp-json/tribe/events/v1/events (May 2026)
-- Replaces the placeholder demo races from migration 008.
--
-- Start times:
--   Thursday Night League  18:00  (first gun)
--   Friday Night League    18:55  (first gun, Cork Harbour Combined League runs concurrently)
--   Autumn League          11:25
--   Saturday / Sunday      11:00  (placeholder — confirm with race committee)
--   One-off events          8:00  (placeholder — confirm with race committee)
--
-- 2026 Thursday/Friday Night League dates are extrapolated from the 2025 pattern
-- (weekly May–Sep). Update once RCYC publish the 2026 programme.
--
-- NOTE: If GBSC and RCYC share one Supabase project, add a club_slug column
-- to the races table and filter by club. For now this migration assumes a
-- dedicated RCYC project (or that GBSC races have been removed).

-- Remove placeholder demo races inserted by migration 008
DELETE FROM races WHERE series IN (
  'Wednesday Night Racing', 'Tricentennial Cup'
);

-- ── Thursday Night League 2025 ────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Thursday Night League — Thu 1 May',  '2025-05-01', 18,  0, 'Thursday Night League', 1),
  ('Thursday Night League — Thu 8 May',  '2025-05-08', 18,  0, 'Thursday Night League', 2),
  ('Thursday Night League — Thu 15 May', '2025-05-15', 18,  0, 'Thursday Night League', 3),
  ('Thursday Night League — Thu 22 May', '2025-05-22', 18,  0, 'Thursday Night League', 4),
  ('Thursday Night League — Thu 29 May', '2025-05-29', 18,  0, 'Thursday Night League', 5),
  ('Thursday Night League — Thu 5 Jun',  '2025-06-05', 18,  0, 'Thursday Night League', 6),
  ('Thursday Night League — Thu 12 Jun', '2025-06-12', 18,  0, 'Thursday Night League', 7),
  ('Thursday Night League — Thu 19 Jun', '2025-06-19', 18,  0, 'Thursday Night League', 8),
  ('Thursday Night League — Thu 26 Jun', '2025-06-26', 18,  0, 'Thursday Night League', 9),
  ('Thursday Night League — Thu 3 Jul',  '2025-07-03', 18,  0, 'Thursday Night League', 10),
  ('Thursday Night League — Thu 10 Jul', '2025-07-10', 18,  0, 'Thursday Night League', 11),
  ('Thursday Night League — Thu 17 Jul', '2025-07-17', 18,  0, 'Thursday Night League', 12),
  ('Thursday Night League — Thu 24 Jul', '2025-07-24', 18,  0, 'Thursday Night League', 13),
  ('Thursday Night League — Thu 31 Jul', '2025-07-31', 18,  0, 'Thursday Night League', 14),
  ('Thursday Night League — Thu 7 Aug',  '2025-08-07', 18,  0, 'Thursday Night League', 15),
  ('Thursday Night League — Thu 14 Aug', '2025-08-14', 18,  0, 'Thursday Night League', 16),
  ('Thursday Night League — Thu 21 Aug', '2025-08-21', 18,  0, 'Thursday Night League', 17),
  ('Thursday Night League — Thu 28 Aug', '2025-08-28', 18,  0, 'Thursday Night League', 18),
  ('Thursday Night League — Thu 4 Sep',  '2025-09-04', 18,  0, 'Thursday Night League', 19),
  ('Thursday Night League — Thu 11 Sep', '2025-09-11', 18,  0, 'Thursday Night League', 20)
ON CONFLICT DO NOTHING;

-- ── Friday Night League 2025 ──────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Friday Night League — Fri 2 May',   '2025-05-02', 18, 55, 'Friday Night League', 1),
  ('Friday Night League — Fri 9 May',   '2025-05-09', 18, 55, 'Friday Night League', 2),
  ('Friday Night League — Fri 16 May',  '2025-05-16', 18, 55, 'Friday Night League', 3),
  ('Friday Night League — Fri 23 May',  '2025-05-23', 18, 55, 'Friday Night League', 4),
  ('Friday Night League — Fri 30 May',  '2025-05-30', 18, 55, 'Friday Night League', 5),
  ('Friday Night League — Fri 6 Jun',   '2025-06-06', 18, 55, 'Friday Night League', 6),
  ('Friday Night League — Fri 13 Jun',  '2025-06-13', 18, 55, 'Friday Night League', 7),
  ('Friday Night League — Fri 20 Jun',  '2025-06-20', 18, 55, 'Friday Night League', 8),
  ('Friday Night League — Fri 27 Jun',  '2025-06-27', 18, 55, 'Friday Night League', 9),
  ('Friday Night League — Fri 4 Jul',   '2025-07-04', 18, 55, 'Friday Night League', 10),
  ('Friday Night League — Fri 11 Jul',  '2025-07-11', 18, 55, 'Friday Night League', 11),
  ('Friday Night League — Fri 18 Jul',  '2025-07-18', 18, 55, 'Friday Night League', 12),
  ('Friday Night League — Fri 25 Jul',  '2025-07-25', 18, 55, 'Friday Night League', 13),
  ('Friday Night League — Fri 1 Aug',   '2025-08-01', 18, 55, 'Friday Night League', 14),
  ('Friday Night League — Fri 8 Aug',   '2025-08-08', 18, 55, 'Friday Night League', 15),
  ('Friday Night League — Fri 15 Aug',  '2025-08-15', 18, 55, 'Friday Night League', 16),
  ('Friday Night League — Fri 22 Aug',  '2025-08-22', 18, 55, 'Friday Night League', 17),
  ('Friday Night League — Fri 29 Aug',  '2025-08-29', 18, 55, 'Friday Night League', 18),
  ('Friday Night League — Fri 5 Sep',   '2025-09-05', 18, 55, 'Friday Night League', 19),
  ('Friday Night League — Fri 12 Sep',  '2025-09-12', 18, 55, 'Friday Night League', 20)
ON CONFLICT DO NOTHING;

-- ── Saturday Series League 2025 ───────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Saturday Series — Sat 3 May',   '2025-05-03', 11, 0, 'Saturday Series League', 1),
  ('Saturday Series — Sat 26 Jul',  '2025-07-26', 11, 0, 'Saturday Series League', 2)
ON CONFLICT DO NOTHING;

-- ── Sunday Racing 2025 ────────────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Sunday Racing — Sun 18 May', '2025-05-18', 11, 0, 'Sunday Racing', 1),
  ('Sunday Racing — Sun 15 Jun', '2025-06-15', 11, 0, 'Sunday Racing', 2)
ON CONFLICT DO NOTHING;

-- ── Autumn League 2025 ────────────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Autumn League — Sun 28 Sep',  '2025-09-28', 11, 25, 'Autumn League', 1),
  ('Autumn League — Sun 5 Oct',   '2025-10-05', 11, 25, 'Autumn League', 2),
  ('Autumn League — Sun 12 Oct',  '2025-10-12', 11, 25, 'Autumn League', 3),
  ('Autumn League — Sun 19 Oct',  '2025-10-19', 11, 25, 'Autumn League', 4),
  ('Autumn League — Sun 26 Oct',  '2025-10-26', 11, 25, 'Autumn League', 5)
ON CONFLICT DO NOTHING;

-- ── One-off / Regattas 2025 ───────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Ocean to City Race',                      '2025-05-31',  8,  0, 'Offshore Race',       1),
  ('Coolmore Race',                           '2025-06-21', 13, 30, 'Offshore Race',       2),
  ('Midsummer Madness',                       '2025-06-21',  8,  0, 'One-Off Race',        3),
  ('ICRA National Championships / Sovereigns Cup', '2025-06-25', 8, 0, 'Championship',    4),
  ('Rolex Fastnet Race',                      '2025-07-26',  8,  0, 'Offshore',            5),
  ('Race, Cruise & Stay',                     '2025-08-16',  8,  0, 'Cruising',            6),
  ('Royal Cork At Home',                      '2025-08-23',  8,  0, 'At Home Regatta',     7),
  ('ICRA Nationals 2025',                     '2025-08-30',  8,  0, 'Championship',        8),
  ('Blackrock Race',                          '2025-09-06',  8,  0, 'One-Off Race',        9),
  ('Naval Race',                              '2025-09-20',  8,  0, 'One-Off Race',        10)
ON CONFLICT DO NOTHING;

-- ── Thursday Night League 2026 (extrapolated — update when RCYC publish programme) ──
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Thursday Night League — Thu 7 May',  '2026-05-07', 18,  0, 'Thursday Night League', 1),
  ('Thursday Night League — Thu 14 May', '2026-05-14', 18,  0, 'Thursday Night League', 2),
  ('Thursday Night League — Thu 21 May', '2026-05-21', 18,  0, 'Thursday Night League', 3),
  ('Thursday Night League — Thu 28 May', '2026-05-28', 18,  0, 'Thursday Night League', 4),
  ('Thursday Night League — Thu 4 Jun',  '2026-06-04', 18,  0, 'Thursday Night League', 5),
  ('Thursday Night League — Thu 11 Jun', '2026-06-11', 18,  0, 'Thursday Night League', 6),
  ('Thursday Night League — Thu 18 Jun', '2026-06-18', 18,  0, 'Thursday Night League', 7),
  ('Thursday Night League — Thu 25 Jun', '2026-06-25', 18,  0, 'Thursday Night League', 8),
  ('Thursday Night League — Thu 2 Jul',  '2026-07-02', 18,  0, 'Thursday Night League', 9),
  ('Thursday Night League — Thu 9 Jul',  '2026-07-09', 18,  0, 'Thursday Night League', 10),
  ('Thursday Night League — Thu 16 Jul', '2026-07-16', 18,  0, 'Thursday Night League', 11),
  ('Thursday Night League — Thu 23 Jul', '2026-07-23', 18,  0, 'Thursday Night League', 12),
  ('Thursday Night League — Thu 30 Jul', '2026-07-30', 18,  0, 'Thursday Night League', 13),
  ('Thursday Night League — Thu 6 Aug',  '2026-08-06', 18,  0, 'Thursday Night League', 14),
  ('Thursday Night League — Thu 13 Aug', '2026-08-13', 18,  0, 'Thursday Night League', 15),
  ('Thursday Night League — Thu 20 Aug', '2026-08-20', 18,  0, 'Thursday Night League', 16),
  ('Thursday Night League — Thu 27 Aug', '2026-08-27', 18,  0, 'Thursday Night League', 17),
  ('Thursday Night League — Thu 3 Sep',  '2026-09-03', 18,  0, 'Thursday Night League', 18),
  ('Thursday Night League — Thu 10 Sep', '2026-09-10', 18,  0, 'Thursday Night League', 19)
ON CONFLICT DO NOTHING;

-- ── Friday Night League 2026 (extrapolated) ───────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Friday Night League — Fri 1 May',   '2026-05-01', 18, 55, 'Friday Night League', 1),
  ('Friday Night League — Fri 8 May',   '2026-05-08', 18, 55, 'Friday Night League', 2),
  ('Friday Night League — Fri 15 May',  '2026-05-15', 18, 55, 'Friday Night League', 3),
  ('Friday Night League — Fri 22 May',  '2026-05-22', 18, 55, 'Friday Night League', 4),
  ('Friday Night League — Fri 29 May',  '2026-05-29', 18, 55, 'Friday Night League', 5),
  ('Friday Night League — Fri 5 Jun',   '2026-06-05', 18, 55, 'Friday Night League', 6),
  ('Friday Night League — Fri 12 Jun',  '2026-06-12', 18, 55, 'Friday Night League', 7),
  ('Friday Night League — Fri 19 Jun',  '2026-06-19', 18, 55, 'Friday Night League', 8),
  ('Friday Night League — Fri 26 Jun',  '2026-06-26', 18, 55, 'Friday Night League', 9),
  ('Friday Night League — Fri 3 Jul',   '2026-07-03', 18, 55, 'Friday Night League', 10),
  ('Friday Night League — Fri 10 Jul',  '2026-07-10', 18, 55, 'Friday Night League', 11),
  ('Friday Night League — Fri 17 Jul',  '2026-07-17', 18, 55, 'Friday Night League', 12),
  ('Friday Night League — Fri 24 Jul',  '2026-07-24', 18, 55, 'Friday Night League', 13),
  ('Friday Night League — Fri 31 Jul',  '2026-07-31', 18, 55, 'Friday Night League', 14),
  ('Friday Night League — Fri 7 Aug',   '2026-08-07', 18, 55, 'Friday Night League', 15),
  ('Friday Night League — Fri 14 Aug',  '2026-08-14', 18, 55, 'Friday Night League', 16),
  ('Friday Night League — Fri 21 Aug',  '2026-08-21', 18, 55, 'Friday Night League', 17),
  ('Friday Night League — Fri 28 Aug',  '2026-08-28', 18, 55, 'Friday Night League', 18),
  ('Friday Night League — Fri 4 Sep',   '2026-09-04', 18, 55, 'Friday Night League', 19),
  ('Friday Night League — Fri 11 Sep',  '2026-09-11', 18, 55, 'Friday Night League', 20)
ON CONFLICT DO NOTHING;

-- ── Autumn League 2026 ────────────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Autumn League — Sun 27 Sep', '2026-09-27', 11, 25, 'Autumn League', 1),
  ('Autumn League — Sun 4 Oct',  '2026-10-04', 11, 25, 'Autumn League', 2),
  ('Autumn League — Sun 11 Oct', '2026-10-11', 11, 25, 'Autumn League', 3),
  ('Autumn League — Sun 18 Oct', '2026-10-18', 11, 25, 'Autumn League', 4),
  ('Autumn League — Sun 25 Oct', '2026-10-25', 11, 25, 'Autumn League', 5)
ON CONFLICT DO NOTHING;

-- ── One-off / Regattas 2026 ───────────────────────────────────────────────────
INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES
  ('Crosshaven House PY1000',          '2026-03-29', 15, 15, 'Open Dinghy Race',   1),
  ('1720 Southerns',                   '2026-05-16',  8,  0, 'Class Championship', 2),
  ('Ocean to City Race',               '2026-05-30',  8,  0, 'Offshore Race',      3),
  ('Mid Summer Madness Round Spike',   '2026-06-13',  8,  0, 'One-Off Race',       4),
  ('Rankin Worlds',                    '2026-06-28',  8,  0, 'Class Championship', 5),
  ('Cork Week 2026 — Mon 6 Jul',       '2026-07-06',  8,  0, 'Cork Week 2026',     1),
  ('Cork Week 2026 — Tue 7 Jul',       '2026-07-07',  8,  0, 'Cork Week 2026',     2),
  ('Cork Week 2026 — Wed 8 Jul',       '2026-07-08',  8,  0, 'Cork Week 2026',     3),
  ('Cork Week 2026 — Thu 9 Jul',       '2026-07-09',  8,  0, 'Cork Week 2026',     4),
  ('Cork Week 2026 — Fri 10 Jul',      '2026-07-10',  8,  0, 'Cork Week 2026',     5),
  ('Cock of The North (N18)',          '2026-07-24',  8,  0, 'National 18',        6),
  ('Optimist Nationals',               '2026-08-12',  8,  0, 'Championship',       7),
  ('At Home Regatta',                  '2026-08-22',  8,  0, 'At Home Regatta',    8)
ON CONFLICT DO NOTHING;
