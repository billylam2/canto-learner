create table kid_accessories (
  kid_id uuid not null references kids(id) on delete cascade,
  accessory_slug text not null,
  equipped boolean not null default true,
  purchased_at timestamptz not null default now(),
  primary key (kid_id, accessory_slug)
);

alter table kid_accessories enable row level security;
