-- ============================================================
-- GBSC Racing — Marks table
-- Run in: Supabase → SQL Editor → New Query
-- ============================================================

create table if not exists marks (
  id          text primary key,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  colour      text not null default '#f4a261',
  description text,
  active      boolean not null default true,
  sort_order  integer default 99,
  created_at  timestamptz default now()
);

alter table marks enable row level security;

drop policy if exists "anon read marks"   on marks;
drop policy if exists "anon insert marks" on marks;
drop policy if exists "anon update marks" on marks;
drop policy if exists "anon delete marks" on marks;
create policy "anon read marks"   on marks for select using (true);
create policy "anon insert marks" on marks for insert with check (true);
create policy "anon update marks" on marks for update using (true);
create policy "anon delete marks" on marks for delete using (true);
grant select, insert, update, delete on marks to anon;

-- Seed existing GBSC marks (safe to re-run — uses ON CONFLICT DO NOTHING)
insert into marks (id, name, lat, lng, colour, description, active, sort_order) values
  ('BR', 'Black Rock',    53 + (14.001/60), -(9 + (6.547/60)),  '#e63946', 'Channel Red',      true, 1),
  ('C',  'Cockle',        53 + (14.537/60), -(9 + (1.886/60)),  '#f4a261', 'Club Orange',      true, 2),
  ('D',  'Dillisk',       53 + (14.665/60), -(8 + (59.991/60)), '#f4a261', 'Club Orange',      true, 3),
  ('K',  'Kilcolgan Pt',  53 + (13.320/60), -(9 + (3.850/60)),  '#f4a261', 'Club Orange',      true, 4),
  ('L',  'Leverets',      53 + (15.333/60), -(9 + (1.890/60)),  '#f0f4f8', 'Lighthouse B/W',  true, 5),
  ('MN', 'Mutton New',    53 + (15.179/60), -(9 + (2.500/60)),  '#e63946', 'Channel Red',      true, 6),
  ('O',  'Oranmore',      53 + (15.429/60), -(8 + (59.203/60)), '#f4a261', 'Club Orange',      true, 7),
  ('OF', 'Mutton Outfall',53 + (14.962/60), -(9 + (3.308/60)),  '#f4b942', 'Warning Yellow',   true, 8),
  ('S',  'Salthill',      53 + (14.873/60), -(9 + (5.447/60)),  '#f4a261', 'Club Orange',      true, 9),
  ('T',  'Tawin',         53 + (14.301/60), -(9 + (4.259/60)),  '#2dc653', 'Channel Green',    true, 10),
  ('TR', 'Trout',         53 + (15.026/60), -(9 + (1.109/60)),  '#f4a261', 'Club Orange',      true, 11),
  ('WM', 'W. Margaretta', 53 + (13.673/60), -(9 + (5.978/60)),  '#2dc653', 'Channel Green',    true, 12)
on conflict (id) do nothing;
