-- ============================================================
-- GBSC Racing — Protests table
-- Run in: Supabase → SQL Editor → New Query
-- ============================================================

create table if not exists protests (
  id              uuid default gen_random_uuid() primary key,
  race_name       text not null,
  race_date       date,
  protestor_id    text not null references boats(id),
  protestee_id    text not null references boats(id),
  incident_where  text not null,
  incident_time   text not null,
  flag_displayed  boolean not null default false,
  protest_hailed  boolean not null default false,
  rules_broken    jsonb,           -- array of rule strings
  description     text not null,
  status          text not null default 'Pending',
                  -- Pending | Hearing Scheduled | Upheld | Dismissed | Withdrawn
  ro_notes        text,
  filed_at        timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists protests_race_idx  on protests(race_name);
create index if not exists protests_status_idx on protests(status);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists protests_updated_at on protests;
create trigger protests_updated_at
  before update on protests
  for each row execute function update_updated_at();

alter table protests enable row level security;

drop policy if exists "anon read protests"   on protests;
drop policy if exists "anon insert protests" on protests;
drop policy if exists "anon update protests" on protests;
create policy "anon read protests"   on protests for select using (true);
create policy "anon insert protests" on protests for insert with check (true);
create policy "anon update protests" on protests for update using (true);

grant select, insert, update on protests to anon;
