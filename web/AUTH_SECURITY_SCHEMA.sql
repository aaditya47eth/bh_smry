-- Optional security tables for login lockout persistence and ban logs.
-- Run this in Supabase SQL editor if you want lockout state and logs persisted.

create table if not exists public.auth_login_state (
  number text primary key,
  fail_count integer not null default 0,
  post_first_ban boolean not null default false,
  locked_until timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_login_logs (
  id bigserial primary key,
  number text not null,
  user_id text null,
  lock_hours integer not null,
  lock_until timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_login_logs_number on public.auth_login_logs(number);
create index if not exists idx_auth_login_logs_created_at on public.auth_login_logs(created_at desc);

create table if not exists public.auth_sessions (
  token_hash text primary key,
  user_id text not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_sessions_user_id on public.auth_sessions(user_id);
create index if not exists idx_auth_sessions_expires_at on public.auth_sessions(expires_at);

alter table if exists public.users
  add column if not exists auth_user_id uuid,
  add column if not exists auth_email text;

create unique index if not exists idx_users_auth_user_id on public.users(auth_user_id)
  where auth_user_id is not null;
create unique index if not exists idx_users_auth_email on public.users(auth_email)
  where auth_email is not null and auth_email <> '';

