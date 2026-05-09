-- Seed RCYC start/finish lines.
-- Grassy Walk is the shore-based start/finish at the tip of Point Road, Crosshaven.
-- lat1/lng1 = shore/committee end (cliff at Grassy Walk viewpoint)
-- lat2/lng2 = seaward pin end (Cage buoy — position estimated, update when confirmed)
-- idempotent — ON CONFLICT DO UPDATE

insert into start_finish_lines (id, name, lat1, lng1, lat2, lng2, is_default, is_active, sort_order) values
  ('grassy', 'Grassy Walk Start/Finish',
   51 + 48.50/60, -(8 + 17.60/60),   -- shore/committee end (tip of Point Road)
   51 + 48.30/60, -(8 + 17.40/60),   -- Cage buoy pin end (estimated — update when confirmed)
   true, true, 0)
on conflict (id) do update
  set name       = excluded.name,
      lat1       = excluded.lat1,
      lng1       = excluded.lng1,
      lat2       = excluded.lat2,
      lng2       = excluded.lng2,
      is_default = excluded.is_default,
      sort_order = excluded.sort_order;
