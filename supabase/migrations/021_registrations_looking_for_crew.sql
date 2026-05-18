-- Add looking_for_crew flag to registrations
-- Allows a skipper to signal they need crew for the race,
-- surfaced in the Crew Wanted panel for other sailors.

alter table registrations
  add column if not exists looking_for_crew boolean not null default false;

-- Allow anon to update this column (registrations had no UPDATE policy)
drop policy if exists "anon_update_registrations" on registrations;
create policy "anon_update_registrations" on registrations
  for update using (true) with check (true);

grant update (looking_for_crew) on registrations to anon;
