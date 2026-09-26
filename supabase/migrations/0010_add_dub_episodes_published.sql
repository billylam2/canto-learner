-- Existing episodes are already live on the public site, so they must stay visible: backfill
-- them to published=true via the column default, then flip the column's own default to false so
-- every *new* episode created after this migration starts hidden until explicitly published.
alter table dub_episodes add column published boolean not null default true;
alter table dub_episodes alter column published set default false;
