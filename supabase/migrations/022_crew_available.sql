-- Crew availability register
-- Sailors can self-register interest in crewing; only visible to skippers in the app UI.

create table if not exists crew_available (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text not null,
  experience text not null,  -- 'beginner'|'dinghy'|'cruising'|'limited_racing'|'experienced_racer'
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique(phone)
);

alter table crew_available enable row level security;

create policy "crew_available_select" on crew_available for select using (true);
create policy "crew_available_insert" on crew_available for insert with check (true);
create policy "crew_available_update" on crew_available for update using (true) with check (true);
create policy "crew_available_delete" on crew_available for delete using (true);

grant select, insert, update, delete on crew_available to anon;
grant usage, select on sequence crew_available_id_seq to anon;
