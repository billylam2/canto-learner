create table scenes (
  id serial primary key,
  slug text not null unique,
  level_id integer not null references levels(id) on delete cascade,
  name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table scene_objects (
  id serial primary key,
  scene_id integer not null references scenes(id) on delete cascade,
  vocab_item_id uuid not null references vocab_items(id) on delete cascade,
  x_percent real not null,
  y_percent real not null,
  width_percent real not null,
  height_percent real not null,
  created_at timestamptz not null default now(),
  unique (scene_id, vocab_item_id)
);

alter table scenes enable row level security;
alter table scene_objects enable row level security;

insert into storage.buckets (id, name, public) values ('scene-images', 'scene-images', true);

create policy "scene-images is publicly readable" on storage.objects
  for select using (bucket_id = 'scene-images');
