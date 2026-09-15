create extension if not exists pgcrypto;

create table kids (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  pin_hash text not null,
  avatar_id text not null default 'default',
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create unique index kids_username_lower_idx on kids ((lower(username)));

alter table kids enable row level security;
