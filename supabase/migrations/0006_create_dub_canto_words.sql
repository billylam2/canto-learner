create table dub_canto_words (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  text text not null,
  start_time real not null,
  end_time real not null,
  created_at timestamptz not null default now()
);

alter table dub_canto_words enable row level security;
