-- Skipper declarations — one per boat per season
-- Used when window.CLUB.features.declaration = true (e.g. RCYC)
-- Skipper must confirm they have read SIs, RRS, safety docs and accept responsibility
-- before being allowed to race each season.

create table if not exists skipper_declarations (
  id              uuid        primary key default gen_random_uuid(),
  boat_id         text        not null references boats(id) on delete cascade,
  skipper_name    text        not null,
  season          int         not null,
  read_sis        boolean     not null default false,
  read_rrs        boolean     not null default false,
  read_safety     boolean     not null default false,
  accept_responsibility boolean not null default false,
  declared_at     timestamptz not null default now()
);

-- One declaration per boat per season
create unique index if not exists skipper_declarations_boat_season
  on skipper_declarations(boat_id, season);

-- Anon RLS: skippers can insert and read their own
alter table skipper_declarations enable row level security;
create policy "anon_insert" on skipper_declarations
  for insert to anon with check (true);
create policy "anon_select" on skipper_declarations
  for select to anon using (true);
