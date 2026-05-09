-- Seed RCYC Keelboat Racing Course Card (2023 edition)
-- Source: Royal Cork Yacht Club Keelboat Racing Course Card (DOSCO-sponsored)
-- 27 courses organised by wind direction. ** courses require DOSCO(P) inserted as
-- Mark 1 when the Grassy Walk start line is in use.

insert into course_card_courses (number, wind_direction, name, grassy_walk_note, rounds) values

-- ── S/SW or N/NE Wind ────────────────────────────────────────────────────────
(1, 'S/SW or N/NE', 'Admiral''s Choice', false, '[
  {"label":"Round 1","marks":"Ringabella (P) – W2 (P) – Cage (S)","distance_nm":6},
  {"label":"Round 2","marks":"No.7 (S) – Cage (P)","distance_nm":8},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":9.8}
]'::jsonb),

(2, 'S/SW or N/NE', 'Vice Admiral''s Choice', false, '[
  {"label":"Round 1","marks":"Dutchman Mark (P) – W2 (P) – Cage (S)","distance_nm":4,"note":"Dutchman is a laid club mark approx. 2 cables SE of Dutchman Rock/Fennells Bay"},
  {"label":"Round 2","marks":"No.7 (S) – Cage (P)","distance_nm":6},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":8}
]'::jsonb),

-- ── S/SE or N/NW Wind ────────────────────────────────────────────────────────
(3, 'S/SE or N/NW', 'Rear Admiral''s Choice', false, '[
  {"label":"Round 1","marks":"Harp Mark (P) – E1 (P) – Cage (S)","distance_nm":8},
  {"label":"Round 2","marks":"No.7 (S) – Cage (P)","distance_nm":10},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":12}
]'::jsonb),

-- ── N Wind ───────────────────────────────────────────────────────────────────
(4, 'N', null, true, '[
  {"label":"Round 1","marks":"No.13 (S) – No.11 (S) – No.10 (P) – Dosco (S) – Cage (P)","distance_nm":6},
  {"label":"Round 2","marks":"W4 (S) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"No.5 (P) – No.14 (S) – Dosco (S) – Finish","distance_nm":11}
]'::jsonb),

(5, 'N', null, false, '[
  {"label":"Round 1","marks":"W4 (P) – No.10 (S) – No.7 (S) – Dosco (S) – Cage (S)","distance_nm":4.4},
  {"label":"Round 2","marks":"No.12 (S) – No.5 (S) – Cage (S)","distance_nm":7.1},
  {"label":"Round 3","marks":"No.10 (S) – No.5 (S) – Finish","distance_nm":9.4}
]'::jsonb),

-- ── NE Wind ──────────────────────────────────────────────────────────────────
(6, 'NE', null, false, '[
  {"label":"Round 1","marks":"No.7 (P) – No.10 (P) – Cage (P) – No.7 (S) – Cage (S)","distance_nm":4.3},
  {"label":"Round 2","marks":"No.9 (S) – Cage (S)","distance_nm":7.7},
  {"label":"Round 3","marks":"No.7 (S) – Dosco (S) – Finish","distance_nm":10}
]'::jsonb),

(7, 'NE', null, false, '[
  {"label":"Round 1","marks":"No.11 (P) – Cage (P)","distance_nm":4},
  {"label":"Round 2","marks":"No.9 (P) – No.10 (P) – Dosco (S) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"No.7 (S) – No.5 (S) – Finish","distance_nm":10}
]'::jsonb),

-- ── E Wind ───────────────────────────────────────────────────────────────────
(8, 'E', null, true, '[
  {"label":"Round 1","marks":"No.10 (S) – EF2 (S) – No.8 (P) – Dosco (S) – Cage (S)","distance_nm":6.4},
  {"label":"Round 2","marks":"Dosco (S) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"Dosco (P) – No.8 (P) – No.5 (S) – Finish","distance_nm":10.2}
]'::jsonb),

(9, 'E', null, true, '[
  {"label":"Round 1","marks":"No.18 (P) – No.20 (P) – No.13 (S) – No.5 (S) – Cage (S)","distance_nm":6.4},
  {"label":"Round 2","marks":"Dosco (P) – Cage (P)","distance_nm":8},
  {"label":"Round 3","marks":"W4 (P) – No.3 (P) – Finish","distance_nm":10.3}
]'::jsonb),

-- ── SE Wind ──────────────────────────────────────────────────────────────────
(10, 'SE', null, false, '[
  {"label":"Round 1","marks":"E1 (P) – Cage (S)","distance_nm":2.8},
  {"label":"Round 2","marks":"No.10 (S) – Dosco (S) – Cage (P)","distance_nm":5.3},
  {"label":"Round 3","marks":"No.3 (P) – No.10 (S) – Dosco (S) – Finish","distance_nm":9.5}
]'::jsonb),

(11, 'SE', null, false, '[
  {"label":"Round 1","marks":"E4 (P) – Cage (S) – No.10 (S) – Dosco (S) – Cage (S)","distance_nm":4.7},
  {"label":"Round 2","marks":"No.8 (S) – No.3 (P) – No.5 (P) – Cage (S)","distance_nm":8},
  {"label":"Round 3","marks":"No.10 (S) – Dosco (S) – Finish","distance_nm":10.5}
]'::jsonb),

-- ── S Wind ───────────────────────────────────────────────────────────────────
(12, 'S', null, false, '[
  {"label":"Round 1","marks":"E2 (P) – No.14 (S) – Dosco (S) – Cage (S)","distance_nm":7},
  {"label":"Round 2","marks":"No.7 (S) – No.5 (S) – Cage (S)","distance_nm":9},
  {"label":"Round 3","marks":"No.7 (P) – No.13 (S) – Dosco (S) – Finish","distance_nm":12}
]'::jsonb),

(13, 'S', null, false, '[
  {"label":"Round 1","marks":"W1 (P) – No.10 (P) – Cage (P)","distance_nm":4.4},
  {"label":"Round 2","marks":"No.12 (S) – No.6 (P) – No.5 (P) – Finish","distance_nm":8.5}
]'::jsonb),

(14, 'S', null, false, '[
  {"label":"Round 1","marks":"Mark A (P) – Cage (S)","distance_nm":5.6},
  {"label":"Round 2","marks":"No.10 (S) – No.5 (S) – Finish","distance_nm":7.8}
]'::jsonb),

-- ── SW Wind ──────────────────────────────────────────────────────────────────
(15, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (S) – No.7 (P) – No.13 (S) – No.9 (S) – Cage (S)","distance_nm":6.5},
  {"label":"Round 2","marks":"No.7 (S) – Cage (S)","distance_nm":8.5},
  {"label":"Round 3","marks":"No.9 (S) – Finish","distance_nm":12}
]'::jsonb),

(16, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (S) – No.11 (S) – Cage (P)","distance_nm":5.8},
  {"label":"Round 2","marks":"No.7 (P) – Cage (P)","distance_nm":7.8},
  {"label":"Round 3","marks":"Dosco (P) – Finish","distance_nm":9.8}
]'::jsonb),

(17, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (P) – No.3 (S) – W2 (S) – No.6 (P) – Cage (S)","distance_nm":4.7},
  {"label":"Round 2","marks":"No.7 (S) – Dosco (S) – Cage (S)","distance_nm":7},
  {"label":"Round 3","marks":"No.9 (S) – Finish","distance_nm":10.6}
]'::jsonb),

(18, 'SW', null, true, '[
  {"label":"Round 1","marks":"Cage (P) – No.3 (S) – W2 (S) – No.6 (P) – Cage (S)","distance_nm":5},
  {"label":"Round 2","marks":"No.9 (S) – No.5 (S) – Cage (S)","distance_nm":8.6},
  {"label":"Round 3","marks":"No.11 (P) – Finish","distance_nm":12.8}
]'::jsonb),

(19, 'SW', null, false, '[
  {"label":"Round 1","marks":"No.7 (P) – Cage (S) – No.11 (S) – Cage (P)","distance_nm":8.4},
  {"label":"Round 2","marks":"Dosco (S) – Cage (S)","distance_nm":10},
  {"label":"Round 3","marks":"No.7 (S) – Finish","distance_nm":12}
]'::jsonb),

-- ── W Wind ───────────────────────────────────────────────────────────────────
(20, 'W', null, true, '[
  {"label":"Round 1","marks":"No.8 (S) – No.10 (S) – EF2 (P) – No.20 (P) – No.13 (S) – Dosco (S) – Cage (P)","distance_nm":8.5},
  {"label":"Round 2","marks":"Dosco (P) – Cage (S)","distance_nm":12.5},
  {"label":"Round 3","marks":"No.5 (S) – Finish","distance_nm":13.5}
]'::jsonb),

(21, 'W', null, true, '[
  {"label":"Round 1","marks":"Cage (S) – Dosco (S) – Cage (S)","distance_nm":2.5},
  {"label":"Round 2","marks":"No.8 (S) – No.5 (S) – Cage (S)","distance_nm":4},
  {"label":"Round 3","marks":"No.8 (S) – Dosco (S) – Finish","distance_nm":6}
]'::jsonb),

(22, 'W', null, true, '[
  {"label":"Round 1","marks":"No.8 (S) – No.10 (S) – No.7 (S) – Dosco (S)","distance_nm":2.7},
  {"label":"Round 2","marks":"Cage (S) – Dosco (S) – Cage (S)","distance_nm":5.2},
  {"label":"Round 3","marks":"No.8 (S) – No.5 (S) – Finish","distance_nm":6.7}
]'::jsonb),

(23, 'W', null, true, '[
  {"label":"Round 1","marks":"No.8 (P) – No.3 (S) – W4 (S) – Cage (S)","distance_nm":4.1},
  {"label":"Round 2","marks":"Dosco (P) – No.8 (P) – No.5 (S) – Finish","distance_nm":6.5}
]'::jsonb),

-- ── NW Wind ──────────────────────────────────────────────────────────────────
(24, 'NW', null, true, '[
  {"label":"Round 1","marks":"No.10 (S) – No.9 (P) – No.20 (S) – No.13 (S) – Dosco (S) – Cage (P)","distance_nm":6.5},
  {"label":"Round 2","marks":"No.3 (P) – Cage (S)","distance_nm":8.7},
  {"label":"Round 3","marks":"No.7 (S) – No.3 (S) – Finish","distance_nm":12.3}
]'::jsonb),

(25, 'NW', null, true, '[
  {"label":"Round 1","marks":"No.12 (P) – E2 (S) – No.8 (S) – No.5 (S) – Cage (P)","distance_nm":6.8},
  {"label":"Round 2","marks":"E4 (P) – Cage (P)","distance_nm":9.1},
  {"label":"Round 3","marks":"W4 (P) – Finish","distance_nm":11}
]'::jsonb),

(26, 'NW', null, false, '[
  {"label":"Round 1","marks":"No.3 (P) – No.10 (S) – No.5 (S) – Cage (P)","distance_nm":4.1},
  {"label":"Round 2","marks":"No.3 (P) – No.8 (S) – Dosco (S) – Finish","distance_nm":7.9}
]'::jsonb),

(27, 'NW', null, false, '[
  {"label":"Round 1","marks":"E1 (P) – No.6 (S) – No.3 (P) – Cage (S)","distance_nm":4.2},
  {"label":"Round 2","marks":"No.5 (P) – No.10 (S) – No.3 (S) – Finish","distance_nm":8.4}
]'::jsonb)

on conflict (number) do update
  set wind_direction   = excluded.wind_direction,
      name             = excluded.name,
      grassy_walk_note = excluded.grassy_walk_note,
      rounds           = excluded.rounds;
