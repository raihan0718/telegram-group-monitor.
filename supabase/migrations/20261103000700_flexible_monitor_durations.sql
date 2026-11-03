-- Flexible monitor durations: store intervals in seconds while preserving legacy day columns.
alter table public.group_settings
  add column if not exists evaluation_seconds integer not null default 604800,
  add column if not exists newcomer_grace_seconds integer not null default 604800;

update public.group_settings
set evaluation_seconds = evaluation_days * 86400,
    newcomer_grace_seconds = newcomer_grace_days * 86400
where evaluation_seconds = 604800 and newcomer_grace_seconds = 604800;

alter table public.group_settings
  drop constraint if exists group_settings_evaluation_seconds_check,
  drop constraint if exists group_settings_newcomer_grace_seconds_check;
alter table public.group_settings
  add constraint group_settings_evaluation_seconds_check check (evaluation_seconds between 1 and 2147483647),
  add constraint group_settings_newcomer_grace_seconds_check check (newcomer_grace_seconds between 0 and 2147483647);

drop function if exists public.get_group_inactive_people(bigint,integer,integer,integer);
create function public.get_group_inactive_people(
  p_chat_id bigint,
  p_min_messages integer,
  p_evaluation_seconds integer,
  p_grace_seconds integer
) returns table(user_id bigint,username text,first_name text,period_messages bigint,joined_at timestamptz)
language sql security definer set search_path=public as $$
  select gm.user_id,gm.username,gm.first_name,count(me.id) as period_messages,gm.joined_at
  from public.group_members gm
  left join public.message_events me
    on me.chat_id=gm.chat_id and me.user_id=gm.user_id
    and me.message_date >= now() - make_interval(secs=>p_evaluation_seconds)
  where gm.chat_id=p_chat_id
    and coalesce(gm.joined_at,gm.first_seen_at) <= now() - make_interval(secs=>p_grace_seconds)
  group by gm.user_id,gm.username,gm.first_name,gm.joined_at,gm.first_seen_at
  having count(me.id) < p_min_messages
  order by count(me.id) asc;
$$;
revoke all on function public.get_group_inactive_people(bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.get_group_inactive_people(bigint,integer,integer,integer) to service_role;
