-- Course card courses — predefined named courses for clubs that use a fixed course card
-- Used when window.CLUB.features.courseCard = true (e.g. RCYC)
-- The RO selects a course number; the rounds jsonb stores the textual mark sequence.

create table if not exists course_card_courses (
  number          int         primary key,
  wind_direction  text        not null,   -- e.g. 'S/SW or N/NE'
  name            text,                   -- e.g. "Admiral's Choice" (optional)
  grassy_walk_note boolean not null default false,  -- true = ** courses (insert DOSCO as M1 when Grassy Walk line used)
  rounds          jsonb       not null,   -- [{label, marks, distance_nm}]
  notes           text
);

alter table course_card_courses enable row level security;
create policy "anon_select" on course_card_courses
  for select to anon using (true);
-- RO (anon) can upsert course card entries
create policy "anon_insert" on course_card_courses
  for insert to anon with check (true);
create policy "anon_update" on course_card_courses
  for update to anon using (true);

-- Extend published_courses to store course card selection
alter table published_courses
  add column if not exists course_number int references course_card_courses(number),
  add column if not exists rounds jsonb;

-- Series fees — one row per boat per series per season
-- Used when window.CLUB.features.feeModel = 'per-series' (e.g. RCYC)
-- Skipper pays once per series; the RO records the payment.

create table if not exists series_fees (
  id          uuid        primary key default gen_random_uuid(),
  boat_id     text        not null references boats(id) on delete cascade,
  series_name text        not null,
  season      int         not null,
  amount      numeric(6,2) not null default 0,
  method      text        not null default 'Cash',  -- 'Cash' | 'Card' | 'Revolut'
  paid_at     timestamptz not null default now(),
  notes       text
);

create index if not exists series_fees_boat_season on series_fees(boat_id, season);

alter table series_fees enable row level security;
create policy "anon_insert" on series_fees
  for insert to anon with check (true);
create policy "anon_select" on series_fees
  for select to anon using (true);
create policy "anon_delete" on series_fees
  for delete to anon using (true);
