-- ============================================================
-- GBSC Racing — News feed table
-- Run in: Supabase → SQL Editor → New Query
-- ============================================================

create table if not exists news_items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  url           text,
  body          text,
  active        boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table news_items enable row level security;

drop policy if exists "anon read news"   on news_items;
drop policy if exists "anon insert news" on news_items;
drop policy if exists "anon update news" on news_items;
drop policy if exists "anon delete news" on news_items;
create policy "anon read news"   on news_items for select using (true);
create policy "anon insert news" on news_items for insert with check (true);
create policy "anon update news" on news_items for update using (true);
create policy "anon delete news" on news_items for delete using (true);
grant select, insert, update, delete on news_items to anon;
