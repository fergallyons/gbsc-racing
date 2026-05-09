-- Seed RCYC start/finish lines.
-- Coordinates are approximate Cork Harbour / Crosshaven positions — update with
-- exact surveyed values once confirmed.
-- The Grassy Walk line is the standard shore-based start/finish for RCYC racing.
-- idempotent — ON CONFLICT DO NOTHING

insert into start_finish_lines (id, name, lat1, lng1, lat2, lng2, is_default, is_active, sort_order) values
  ('grassy', 'Grassy Walk Start/Finish',
   51 + 47.500/60, -(8 + 17.800/60),
   51 + 47.480/60, -(8 + 17.750/60),
   true, true, 0)
on conflict (id) do nothing;
