create table if not exists public.group_settings (
  chat_id bigint primary key,
  min_messages integer not null default 20 check (min_messages >= 0),
  evaluation_days integer not null default 7 check (evaluation_days between 1 and 365),
  newcomer_grace_days integer not null default 7 check (newcomer_grace_days between 0 and 365),
  updated_at timestamptz not null default now()
);
alter table public.group_members add column if not exists joined_at timestamptz;
update public.group_members set joined_at = first_seen_at where joined_at is null;
create index if not exists group_members_joined_idx on public.group_members(chat_id, joined_at);

create or replace function public.record_group_member_join(
  p_chat_id bigint,p_user_id bigint,p_username text,p_first_name text,p_last_name text,p_joined_at timestamptz
) returns void language sql security definer set search_path=public as $$
  insert into public.group_members(chat_id,user_id,username,first_name,last_name,first_seen_at,last_seen_at,joined_at,total_messages)
  values(p_chat_id,p_user_id,p_username,coalesce(p_first_name,''),p_last_name,p_joined_at,p_joined_at,p_joined_at,0)
  on conflict(chat_id,user_id) do update set
    username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,joined_at=excluded.joined_at;
$$;

create or replace function public.get_group_inactive_people(
  p_chat_id bigint,p_min_messages integer,p_evaluation_days integer,p_grace_days integer
) returns table(user_id bigint,username text,first_name text,period_messages bigint,joined_at timestamptz)
language sql security definer set search_path=public as $$
  select gm.user_id,gm.username,gm.first_name,
    count(me.id) as period_messages,gm.joined_at
  from public.group_members gm
  left join public.message_events me
    on me.chat_id=gm.chat_id and me.user_id=gm.user_id
    and me.message_date >= now() - make_interval(days=>p_evaluation_days)
  where gm.chat_id=p_chat_id
    and coalesce(gm.joined_at,gm.first_seen_at) <= now() - make_interval(days=>p_grace_days)
  group by gm.user_id,gm.username,gm.first_name,gm.joined_at,gm.first_seen_at
  having count(me.id) < p_min_messages
  order by count(me.id) asc;
$$;
revoke all on function public.record_group_member_join(bigint,bigint,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.get_group_inactive_people(bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.record_group_member_join(bigint,bigint,text,text,text,timestamptz) to service_role;
grant execute on function public.get_group_inactive_people(bigint,integer,integer,integer) to service_role;
