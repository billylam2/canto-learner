create table levels (
  id integer primary key,
  name text not null,
  "order" integer not null,
  unlock_threshold integer not null default 0
);

create table vocab_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  cantonese_text text not null,
  jyutping text not null,
  english_gloss text not null,
  homophone_group text,
  audio_url text,
  image_url text,
  created_at timestamptz not null default now()
);

create table level_vocab (
  level_id integer not null references levels(id) on delete cascade,
  vocab_item_id uuid not null references vocab_items(id) on delete cascade,
  primary key (level_id, vocab_item_id)
);

alter table levels enable row level security;
alter table vocab_items enable row level security;
alter table level_vocab enable row level security;

insert into storage.buckets (id, name, public) values ('vocab-audio', 'vocab-audio', true);
insert into storage.buckets (id, name, public) values ('vocab-images', 'vocab-images', true);

create policy "vocab-audio is publicly readable" on storage.objects
  for select using (bucket_id = 'vocab-audio');

create policy "vocab-images is publicly readable" on storage.objects
  for select using (bucket_id = 'vocab-images');
