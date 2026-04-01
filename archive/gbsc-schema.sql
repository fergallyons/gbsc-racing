-- ============================================================
-- GBSC Racing App — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Project: https://esqjcmwfnzkolwxfbcro.supabase.co
-- ============================================================

-- 1. BOATS
create table if not exists boats (
  id         text primary key,
  name       text not null,
  icon       text default '⛵',
  created_at timestamptz default now()
);

-- 2. CREW
create table if not exists crew (
  id         integer primary key,
  boat_id    text not null references boats(id) on delete cascade,
  first      text not null,
  last       text not null,
  type       text not null check (type in ('full','crew','visitor')),
  join_year  integer,
  outings    integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists crew_boat_idx on crew(boat_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists crew_updated_at on crew;
create trigger crew_updated_at
  before update on crew
  for each row execute function update_updated_at();

-- 3. RACE RECORDS
create table if not exists race_records (
  id             uuid default gen_random_uuid() primary key,
  boat_id        text not null references boats(id),
  race_name      text not null,
  race_date      date not null,
  crew_snapshot  jsonb,
  total_due      integer default 0,
  total_paid     integer default 0,
  submitted_at   timestamptz default now()
);

create index if not exists records_boat_idx  on race_records(boat_id);
create index if not exists records_date_idx  on race_records(race_date desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS but allow anon read/write (app uses anon key)
-- Tighten these policies once you add skipper auth
-- ============================================================

alter table boats        enable row level security;
alter table crew         enable row level security;
alter table race_records enable row level security;

-- Boats: anon can read and insert
create policy "anon read boats"   on boats for select using (true);
create policy "anon insert boats" on boats for insert with check (true);

-- Crew: anon can read, insert, update, delete
create policy "anon read crew"    on crew for select using (true);
create policy "anon insert crew"  on crew for insert with check (true);
create policy "anon update crew"  on crew for update using (true);
create policy "anon delete crew"  on crew for delete using (true);

-- Race records: anon can read and insert
create policy "anon read records"   on race_records for select using (true);
create policy "anon insert records" on race_records for insert with check (true);

-- ============================================================
-- SEED DEFAULT BOATS (optional — app will auto-insert too)
-- ============================================================
insert into boats (id, name, icon) values
  ('outoftheblue', 'Out of the Blue', '🔵'),
  ('ibaraki',      'Ibaraki',         '⚓'),
  ('woofer',       'Woofer',           '🐾'),
  ('joker',        'Joker',            '🃏'),
  ('afterfizzer',  'After Fizzer',     '🥂'),
  ('runningtide',  'Running Tide',     '🌊'),
  ('rhocstar',     'Rhocstar',         '⭐'),
  ('viking',       'Viking',           '🪓'),
  ('scorpio',      'Scorpio',          '♏')
on conflict (id) do nothing;
