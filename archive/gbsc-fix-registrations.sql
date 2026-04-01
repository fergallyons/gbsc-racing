-- ============================================================
-- GBSC Racing — Fix registrations table for PostgREST upsert
-- The on_conflict=boat_id,race_key parameter requires the unique
-- constraint to exist by name. This recreates it cleanly.
-- Run in: Supabase → SQL Editor → New Query
-- ============================================================

-- Drop and recreate registrations with named unique constraint
drop table if exists registrations;

create table registrations (
  id            uuid default gen_random_uuid() primary key,
  boat_id       text not null references boats(id) on delete cascade,
  race_key      text not null,
  race_name     text,
  race_date     date,
  registered_at timestamptz default now(),
  -- Named constraint so PostgREST on_conflict works
  constraint registrations_boat_race_unique unique(boat_id, race_key)
);

create index if not exists reg_race_idx on registrations(race_key);
create index if not exists reg_boat_idx on registrations(boat_id);

alter table registrations enable row level security;

create policy "anon read registrations"   on registrations for select using (true);
create policy "anon insert registrations" on registrations for insert with check (true);
create policy "anon update registrations" on registrations for update using (true);
create policy "anon delete registrations" on registrations for delete using (true);

grant select, insert, update, delete on registrations to anon;
