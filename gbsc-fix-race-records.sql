-- ============================================================
-- GBSC Racing — Fix race_records table
-- Adds missing columns and ensures correct RLS policies
-- Safe to run multiple times
-- ============================================================

-- Add columns added during development that may be missing
alter table race_records add column if not exists payment_methods    jsonb;
alter table race_records add column if not exists settlement_methods jsonb;
alter table race_records add column if not exists settlement_note    text;

-- Ensure submitted_at has a default (some versions may be missing this)
alter table race_records alter column submitted_at set default now();

-- RLS
alter table race_records enable row level security;

drop policy if exists "anon read race_records"   on race_records;
drop policy if exists "anon insert race_records" on race_records;
create policy "anon read race_records"   on race_records for select using (true);
create policy "anon insert race_records" on race_records for insert with check (true);

grant select, insert on race_records to anon;
