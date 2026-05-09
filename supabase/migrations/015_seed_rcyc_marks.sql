-- Seed RCYC race marks.
-- Sources:
--   ✅ Confirmed = from RCYC course card PDF
--   ~ Estimated = derived from chart geography / research, verify with club
-- Idempotent — ON CONFLICT DO UPDATE so re-running refreshes positions.
-- Colour: orange (#f4a261) = racing mark, teal (#00bcd4) = start/finish reference.

insert into marks (id, name, lat, lng, colour, description, active, sort_order) values

  -- ── Confirmed from RCYC course card ──────────────────────────────────────
  ('rcyc_dosco',      'Dosco',         51+49.26/60, -(8+15.81/60), '#f4a261',
   'Corkbeg. Insert as M1 on Grassy Walk courses.',                            true,  0),

  ('rcyc_ringabella', 'Ringabella',    51+46.24/60, -(8+17.52/60), '#f4a261',
   '',                                                                          true,  1),

  ('rcyc_harp',       'Harp',          51+47.19/60, -(8+14.21/60), '#f4a261',
   '',                                                                          true,  2),

  ('rcyc_east',       'East Mark',     51+46.31/60, -(8+14.18/60), '#f4a261',
   'Formerly Mark B.',                                                          true,  3),

  -- ── Estimated — verify positions with RCYC race committee ────────────────
  ('rcyc_spike',      'Spike',         51+49.70/60, -(8+17.00/60), '#f4a261',
   'South side of Spike Island. Position estimated — confirm with club.',       true, 10),

  ('rcyc_cage',       'Cage',          51+48.30/60, -(8+17.40/60), '#00bcd4',
   'Seaward pin end of Grassy Walk start/finish line. Position estimated.',     true, 11),

  ('rcyc_grassy',     'Grassy Walk',   51+48.50/60, -(8+17.60/60), '#00bcd4',
   'Shore/committee end of start/finish line at tip of Point Road, Crosshaven. Position estimated.', true, 12)

on conflict (id) do update
  set name        = excluded.name,
      lat         = excluded.lat,
      lng         = excluded.lng,
      colour      = excluded.colour,
      description = excluded.description,
      sort_order  = excluded.sort_order;
