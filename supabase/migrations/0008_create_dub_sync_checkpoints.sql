create table dub_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  canto_time real not null,
  english_time real not null,
  created_at timestamptz not null default now()
);

alter table dub_sync_checkpoints enable row level security;
