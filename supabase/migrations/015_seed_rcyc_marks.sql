-- Seed RCYC race marks.
-- Coordinates from RCYC course card (degrees + decimal minutes converted to decimal degrees).
-- idempotent — ON CONFLICT (id) DO UPDATE so re-running refreshes positions.
-- Colour: orange (#f4a261) = racing mark.
-- sort_order controls display order in the marks grid.
-- Note: Grassy Walk start/finish coords are approximate — update once confirmed.

insert into marks (id, name, lat, lng, colour, description, active, sort_order) values
  ('rcyc_dosco',     'Dosco',           51 + 49.26/60, -(8 + 15.81/60), '#f4a261', 'Corkbeg. Insert as M1 on Grassy Walk courses.', true, 0),
  ('rcyc_ringabella','Ringabella',      51 + 46.24/60, -(8 + 17.52/60), '#f4a261', '',                                               true, 1),
  ('rcyc_harp',      'Harp',            51 + 47.19/60, -(8 + 14.21/60), '#f4a261', '',                                               true, 2),
  ('rcyc_east',      'East Mark',       51 + 46.31/60, -(8 + 14.18/60), '#f4a261', 'Formerly Mark B.',                               true, 3),
  ('rcyc_grassy',    'Grassy Walk',     51 + 47.50/60, -(8 + 17.80/60), '#00bcd4', 'Shore start/finish line. Update coords when confirmed.', true, 10)
on conflict (id) do update
  set name        = excluded.name,
      lat         = excluded.lat,
      lng         = excluded.lng,
      colour      = excluded.colour,
      description = excluded.description,
      sort_order  = excluded.sort_order;
