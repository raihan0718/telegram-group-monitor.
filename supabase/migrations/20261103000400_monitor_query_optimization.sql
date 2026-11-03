-- Query indexes and bounded read RPCs for the Telegram group monitor.
-- Run this migration in the Supabase SQL Editor before using the updated commands.

create index if not exists message_events_chat_user_date_idx
  on public.message_events (chat_id, user_id, message_date desc);

create or replace function public.get_group_top_members(
  p_chat_id bigint, p_limit integer default 10
) returns table(user_id bigint, username text, first_name text, total_messages bigint, last_seen_at timestamptz)
language sql stable security definer set search_path=public as $$
  select gm.user_id,gm.username,gm.first_name,gm.total_messages,gm.last_seen_at
  from public.group_members gm
  where gm.chat_id=p_chat_id
  order by gm.total_messages desc,gm.last_seen_at desc
  limit greatest(1,least(coalesce(p_limit,10),50));
$$;

create or replace function public.get_group_inactive_members(
  p_chat_id bigint, p_days integer, p_limit integer default 30
) returns table(user_id bigint, username text, first_name text, total_messages bigint, last_seen_at timestamptz)
language sql stable security definer set search_path=public as $$
  select gm.user_id,gm.username,gm.first_name,gm.total_messages,gm.last_seen_at
  from public.group_members gm
  where gm.chat_id=p_chat_id
    and gm.last_seen_at < now() - make_interval(days=>greatest(1,p_days))
  order by gm.last_seen_at asc
  limit greatest(1,least(coalesce(p_limit,30),100));
$$;

create or replace function public.get_group_report(p_chat_id bigint)
returns table(member_count bigint,total_messages bigint)
language sql stable security definer set search_path=public as $$
  select count(*)::bigint,coalesce(sum(gm.total_messages),0)::bigint
  from public.group_members gm
  where gm.chat_id=p_chat_id;
$$;

revoke all on function public.get_group_top_members(bigint,integer) from public,anon,authenticated;
revoke all on function public.get_group_inactive_members(bigint,integer,integer) from public,anon,authenticated;
revoke all on function public.get_group_report(bigint) from public,anon,authenticated;
grant execute on function public.get_group_top_members(bigint,integer) to service_role;
grant execute on function public.get_group_inactive_members(bigint,integer,integer) to service_role;
grant execute on function public.get_group_report(bigint) to service_role;
