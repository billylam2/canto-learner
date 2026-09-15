create table progress (
  kid_id uuid not null references kids(id) on delete cascade,
  level_id integer not null references levels(id) on delete cascade,
  stars_earned integer not null default 0,
  completed_game_types text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (kid_id, level_id)
);

alter table progress enable row level security;
