create table dub_episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cantonese_video_id text not null,
  english_video_id text not null,
  canto_content_start real,
  canto_content_end real,
  english_content_start real,
  english_content_end real,
  created_at timestamptz not null default now()
);

create table dub_segments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  position integer not null,
  label text,
  canto_start real not null,
  canto_end real not null,
  english_start real not null,
  english_end real not null,
  created_at timestamptz not null default now()
);

alter table dub_episodes enable row level security;
alter table dub_segments enable row level security;
