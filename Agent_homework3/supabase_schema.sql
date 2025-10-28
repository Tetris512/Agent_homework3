-- Supabase schema for Travel AI
-- Run this in the Supabase SQL editor (or via psql) to create tables used by the app.

-- =============================================================
-- 1) Enable pgcrypto so we can use gen_random_uuid()
-- =============================================================
create extension if not exists pgcrypto;

-- =============================================================
-- 2) Base tables (uuid primary keys aligned with the application)
-- =============================================================
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text,
  itinerary jsonb not null,
  summary text,
  created_at timestamptz default now()
);

create index if not exists idx_itineraries_user_id on public.itineraries(user_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  amount numeric not null,
  category text,
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_expenses_user_id on public.expenses(user_id);

-- =============================================================
-- 3) Optional: grant API access to anon key (PostgREST uses schema cache)
--    Rerun after schema changes: select pg_notify('pgrst','reload schema');
-- =============================================================
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.itineraries to anon, authenticated, service_role;
grant select, insert, update, delete on public.expenses to anon, authenticated, service_role;

-- If you previously created legacy tables with integer IDs, drop them manually:
--   drop table if exists public.itineraries cascade;
--   drop table if exists public.expenses cascade;
-- and rerun this script.
