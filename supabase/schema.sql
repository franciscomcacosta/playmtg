-- Manaforge database schema for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Running it again is safe.
--
-- The game server (on your PC) is the only writer: it uses the service-role key, which bypasses Row Level Security.
-- Browsers sign in with Supabase Auth and may only READ their own rows, so balances can't be edited from a browser.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_name_lower on public.profiles (lower(name));

create table if not exists public.decks (
  id uuid primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null,
  format text not null check (format in ('standard', 'commander')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists decks_owner on public.decks (owner, updated_at desc);

-- every change to gold / embers, append-only
create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null check (currency in ('gold', 'embers')),
  delta integer not null,
  balance integer not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user on public.ledger (user_id, created_at desc);

create table if not exists public.friendships (
  a uuid not null references auth.users (id) on delete cascade, -- who asked
  b uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b)
);
create index if not exists friendships_b on public.friendships (b);

create table if not exists public.notifications (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

create table if not exists public.matches (
  id uuid primary key,
  mode text not null,
  players jsonb not null,
  winner integer,
  turns integer not null default 0,
  created_at timestamptz not null default now()
);

-- Row Level Security: read your own rows, write nothing (the server writes with the service role)
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.ledger enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.matches enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "read own decks" on public.decks;
create policy "read own decks" on public.decks for select using (auth.uid() = owner);
drop policy if exists "read own ledger" on public.ledger;
create policy "read own ledger" on public.ledger for select using (auth.uid() = user_id);
drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships for select using (auth.uid() = a or auth.uid() = b);
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select using (auth.uid() = user_id);
