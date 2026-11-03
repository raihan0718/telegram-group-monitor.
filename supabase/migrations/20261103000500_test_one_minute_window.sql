-- Test-only timer: both the evaluation window and newcomer grace are 1 minute.
-- This RPC is used only by the Test panel; production settings and Auto Kick stay in days.
drop function if exists public.get_group_test_inactive_people(bigint,integer,integer,integer);

create function public.get_group_test_inactive_people(
  p_chat_id bigint,
  p_min_messages integer,
  p_evaluation_minutes integer,
  p_grace_minutes integer
) returns table(user_id bigint,username text,first_name text,period_messages bigint,joined_at timestamptz)
language sql security definer set search_path=public as $$
  select gm.user_id,gm.username,gm.first_name,count(me.id) as period_messages,gm.joined_at
  from public.group_members gm
  left join public.message_events me
    on me.chat_id=gm.chat_id
    and me.user_id=gm.user_id
    and me.message_date >= now() - make_interval(mins=>p_evaluation_minutes)
  where gm.chat_id=p_chat_id
    and coalesce(gm.joined_at,gm.first_seen_at) <= now() - make_interval(mins=>p_grace_minutes)
  group by gm.user_id,gm.username,gm.first_name,gm.joined_at,gm.first_seen_at
  having count(me.id) < p_min_messages
  order by count(me.id) asc;
$$;

revoke all on function public.get_group_test_inactive_people(bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.get_group_test_inactive_people(bigint,integer,integer,integer) to service_role;
