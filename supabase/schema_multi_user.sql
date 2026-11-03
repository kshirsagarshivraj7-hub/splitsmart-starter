-- SplitSmart · Universal Multi-User Group & Expense Database
-- Safe to run in Supabase SQL Editor:
--   1. Open Supabase Dashboard (https://supabase.com/dashboard)
--   2. Left sidebar → SQL Editor → + New query
--   3. Paste this script and click Run (Cmd/Ctrl + Enter)

-- 1. Groups table (stores groups, invite codes, and member names)
create table if not exists groups (
  id text primary key,
  name text not null,
  join_code text not null unique,
  members text[] default array[]::text[],
  created_by text,
  created_at timestamptz default now()
);

-- 2. Expenses table (stores each expense linked to a group)
create table if not exists expenses (
  id text primary key,
  group_id text references groups(id) on delete cascade,
  name text not null,
  paid_by text not null,
  amount numeric not null default 0,
  emoji text default '🧾',
  created_at timestamptz default now()
);

-- 3. Enable open access policies so all invited friends can view and add expenses with the invite code
alter table groups enable row level security;
alter table expenses enable row level security;

drop policy if exists "allow_all_groups" on groups;
create policy "allow_all_groups" on groups for all using (true) with check (true);

drop policy if exists "allow_all_expenses" on expenses;
create policy "allow_all_expenses" on expenses for all using (true) with check (true);

