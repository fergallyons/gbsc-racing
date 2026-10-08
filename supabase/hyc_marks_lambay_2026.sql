-- HYC racing marks — from the Lambay Race 2026 Sailing Instructions,
-- Appendix 1 "Mark Descriptions and Approximate Positions"
-- (hyc.ie/system/resources/2488/original/Lambay_2026_SI_Final01_PM_260526.pdf).
-- The SI gives these as the PLANNED positions of the marks; weather, tide
-- etc. may move them, so treat them as indicative.
--
-- HYC-only data — run once in the HYC Supabase project's SQL Editor (not a
-- migration; never run on another club). Idempotent: ON CONFLICT DO UPDATE,
-- so re-running refreshes positions.
--
-- Name is "<SI letter> · <name>" so the RO can match the SI's course letters.
-- Colour is the app's map category, not the buoy's own colour (the buoy's
-- shape and colour are in the description): orange #f4a261 = racing mark,
-- blue #5c9bd6 = navigation aid / IALA buoy.
--
-- NOT included — the SI lists them as marks but gives no position:
--   L  Lambay           (island)
--   Y  Ireland's Eye    (island)
-- Add them via Marks Manager (Club Admin) at the rounding point the RO uses
-- if they're needed on course diagrams.

insert into marks (id, name, lat, lng, colour, description, active, sort_order) values
  -- 53 26.76N 06 03.26W
  ('hyc_apex', 'A · Apex', 53.446000, -6.054333, '#f4a261',
   'SI mark A. Conical, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 0),
  -- 53 24.61N 06 05.45W
  ('hyc_cush', 'C · Cush', 53.410167, -6.090833, '#f4a261',
   'SI mark C. Cylindrical pillar, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 1),
  -- 53 24.73N 06 03.85W
  ('hyc_dunbo', 'D · Dunbo', 53.412167, -6.064167, '#f4a261',
   'SI mark D. Cylindrical pillar, yellow. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 2),
  -- 53 26.00N 06 02.20W
  ('hyc_east', 'E · East', 53.433333, -6.036667, '#f4a261',
   'SI mark E. Conical, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 3),
  -- 53 25.00N 06 02.32W
  ('hyc_garbh', 'G · Garbh', 53.416667, -6.038667, '#f4a261',
   'SI mark G. Conical, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 4),
  -- 53 25.71N 06 04.43W
  ('hyc_hub', 'H · Hub', 53.428500, -6.073833, '#f4a261',
   'SI mark H. Cylindrical pillar, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 5),
  -- 53 24.70N 06 04.36W
  ('hyc_island', 'I · Island', 53.411667, -6.072667, '#f4a261',
   'SI mark I. Cylindrical pillar, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 6),
  -- 53 23.80N 06 03.40W
  ('hyc_thulla', 'J · Thulla', 53.396667, -6.056667, '#f4a261',
   'SI mark J. Cylindrical pillar (small), black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 7),
  -- 53 24.60N 06 03.11W
  ('hyc_stack', 'K · Stack', 53.410000, -6.051833, '#f4a261',
   'SI mark K. Conical, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 8),
  -- 53 25.41N 06 03.52W
  ('hyc_osprey', 'O · Osprey', 53.423500, -6.058667, '#f4a261',
   'SI mark O. Conical, orange. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 9),
  -- 53 25.63N 06 05.80W
  ('hyc_portmarnock', 'P · Portmarnock', 53.427167, -6.096667, '#f4a261',
   'SI mark P. Cylindrical pillar, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 10),
  -- 53 23.88N 06 03.22W
  ('hyc_rowan_rocks', 'Q · Rowan Rocks', 53.398000, -6.053667, '#5c9bd6',
   'SI mark Q. IALA, black / yellow. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 11),
  -- 53 23.78N 06 03.88W
  ('hyc_south_rowan', 'R · South Rowan', 53.396333, -6.064667, '#5c9bd6',
   'SI mark R. IALA, green. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 12),
  -- 53 24.35N 06 04.48W
  ('hyc_spit', 'S · Spit', 53.405833, -6.074667, '#f4a261',
   'SI mark S. Cylindrical pillar, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 13),
  -- 53 28.20N 06 00.50W
  ('hyc_talbot', 'T · Talbot', 53.470000, -6.008333, '#f4a261',
   'SI mark T. Inflatable, orange. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 14),
  -- 53 26.22N 06 04.97W
  ('hyc_ulysses', 'U · Ulysses', 53.437000, -6.082833, '#f4a261',
   'SI mark U. Conical, orange. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 15),
  -- 53 25.12N 06 04.78W
  ('hyc_viceroy', 'V · Viceroy', 53.418667, -6.079667, '#f4a261',
   'SI mark V. Cylindrical pillar, orange. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 16),
  -- 53 24.96N 06 06.07W
  ('hyc_west', 'W · West', 53.416000, -6.101167, '#f4a261',
   'SI mark W. Cylindrical pillar, black. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 17),
  -- 53 30.13N 06 01.52W
  ('hyc_taylor_buoy', 'Taylor Buoy', 53.502167, -6.025333, '#5c9bd6',
   'Navigation aid. North Cardinal. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 48),
  -- 53 29.21N 06 02.28W
  ('hyc_burren_perch', 'Burren Perch', 53.486833, -6.038000, '#5c9bd6',
   'Navigation aid. West Cardinal. Planned position — may vary on the day (Lambay Race 2026 SI, Appendix 1).', true, 49)
on conflict (id) do update set
  name = excluded.name, lat = excluded.lat, lng = excluded.lng,
  colour = excluded.colour, description = excluded.description,
  sort_order = excluded.sort_order;

-- Check: 20 rows
select id, name, round(lat::numeric, 5) as lat, round(lng::numeric, 5) as lng, active
from marks where id like 'hyc\_%' order by sort_order;
