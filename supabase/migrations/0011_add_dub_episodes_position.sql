-- Episodes need a manual, admin-controlled display order instead of always following creation
-- order. Backfill existing rows using their current created_at order so nothing visibly
-- reshuffles the moment this migration runs.
alter table dub_episodes add column position integer;

update dub_episodes set position = ordered.row_number - 1
from (
  select id, row_number() over (order by created_at asc) as row_number
  from dub_episodes
) as ordered
where dub_episodes.id = ordered.id;

alter table dub_episodes alter column position set not null;
alter table dub_episodes alter column position set default 0;
