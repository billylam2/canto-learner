create table dub_sync_waveforms (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  language text not null check (language in ('canto', 'english')),
  peaks jsonb not null,
  created_at timestamptz not null default now(),
  unique (episode_id, language)
);

alter table dub_sync_waveforms enable row level security;
