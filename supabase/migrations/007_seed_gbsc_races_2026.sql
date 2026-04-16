-- Migration 007: seed GBSC 2026 race schedule
-- Migrated from the hardcoded buildAllRaces() function in app.js.
-- Run this once on the GBSC Supabase project only.

INSERT INTO races (label, race_date, start_hour, start_min, series, sort_order) VALUES

-- ── Wednesday Night Racing ─────────────────────────────────────
('McSwiggans Series — Wed Apr 8',  '2026-04-08', 19, 0, 'Wednesday Night Racing', 1),
('McSwiggans Series — Wed Apr 15', '2026-04-15', 19, 0, 'Wednesday Night Racing', 2),
('McSwiggans Series — Wed Apr 22', '2026-04-22', 19, 0, 'Wednesday Night Racing', 3),
('McSwiggans Series — Wed Apr 29', '2026-04-29', 19, 0, 'Wednesday Night Racing', 4),

('Grealy Stores Series — Wed May 6',  '2026-05-06', 19, 0, 'Wednesday Night Racing', 5),
('Grealy Stores Series — Wed May 13', '2026-05-13', 19, 0, 'Wednesday Night Racing', 6),
('Grealy Stores Series — Wed May 20', '2026-05-20', 19, 0, 'Wednesday Night Racing', 7),
('Grealy Stores Series — Wed May 27', '2026-05-27', 19, 0, 'Wednesday Night Racing', 8),

('Seahorse Series — Wed Jun 3',  '2026-06-03', 19, 0, 'Wednesday Night Racing', 9),
('Seahorse Series — Wed Jun 10', '2026-06-10', 19, 0, 'Wednesday Night Racing', 10),
('Seahorse Series — Wed Jun 17', '2026-06-17', 19, 0, 'Wednesday Night Racing', 11),
('Seahorse Series — Wed Jun 24', '2026-06-24', 19, 0, 'Wednesday Night Racing', 12),
('Seahorse Series — Wed Jul 1',  '2026-07-01', 19, 0, 'Wednesday Night Racing', 13),

('Aquabroker Series — Wed Jul 8',  '2026-07-08', 19, 0, 'Wednesday Night Racing', 14),
('Aquabroker Series — Wed Jul 15', '2026-07-15', 19, 0, 'Wednesday Night Racing', 15),
('Aquabroker Series — Wed Jul 22', '2026-07-22', 19, 0, 'Wednesday Night Racing', 16),
('Aquabroker Series — Wed Jul 29', '2026-07-29', 19, 0, 'Wednesday Night Racing', 17),

('GM Series — Wed Aug 5',  '2026-08-05', 19, 0, 'Wednesday Night Racing', 18),
('GM Series — Wed Aug 12', '2026-08-12', 19, 0, 'Wednesday Night Racing', 19),
('GM Series — Wed Aug 19', '2026-08-19', 19, 0, 'Wednesday Night Racing', 20),
('GM Series — Wed Aug 26', '2026-08-26', 19, 0, 'Wednesday Night Racing', 21),

('O''Tuairisg Series — Wed Sep 2',  '2026-09-02', 19, 0, 'Wednesday Night Racing', 22),
('O''Tuairisg Series — Wed Sep 9',  '2026-09-09', 19, 0, 'Wednesday Night Racing', 23),
('O''Tuairisg Series — Wed Sep 16', '2026-09-16', 19, 0, 'Wednesday Night Racing', 24),
('O''Tuairisg Series — Wed Sep 23', '2026-09-23', 19, 0, 'Wednesday Night Racing', 25),
('O''Tuairisg Series — Wed Sep 30', '2026-09-30', 19, 0, 'Wednesday Night Racing', 26),

-- ── King of the Bay ────────────────────────────────────────────
('King of the Bay: Spring Cup',      '2026-05-02', 11, 0, 'King of the Bay', 1),
('King of the Bay: Barna',           '2026-05-16', 11, 0, 'King of the Bay', 2),
('King of the Bay: Ballyvaughan',    '2026-05-30', 11, 0, 'King of the Bay', 3),
('King of the Bay: Aran Cup',        '2026-06-19', 11, 0, 'King of the Bay', 4),
('King of the Bay: Kinvara',         '2026-08-15', 11, 0, 'King of the Bay', 5),
('King of the Bay: Clarinbridge Cup','2026-08-29', 11, 0, 'King of the Bay', 6),
('King of the Bay: Morans',          '2026-09-12', 11, 0, 'King of the Bay', 7),
('King of the Bay: Oyster Festival', '2026-09-26', 11, 0, 'King of the Bay', 8),

-- ── Other ──────────────────────────────────────────────────────
('Expert Forklifts October Series',  '2026-10-07', 19, 0, 'Other', 1)

ON CONFLICT DO NOTHING;
