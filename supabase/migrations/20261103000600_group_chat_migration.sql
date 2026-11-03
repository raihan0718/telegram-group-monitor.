create or replace function public.migrate_group_chat_id(p_old_chat_id bigint,p_new_chat_id bigint)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_old_chat_id is null or p_new_chat_id is null or p_old_chat_id=p_new_chat_id then
    return;
  end if;

  insert into public.group_members(
    chat_id,user_id,username,first_name,last_name,first_seen_at,last_seen_at,total_messages,joined_at
  )
  select p_new_chat_id,user_id,username,first_name,last_name,first_seen_at,last_seen_at,total_messages,joined_at
  from public.group_members
  where chat_id=p_old_chat_id
  on conflict(chat_id,user_id) do update set
    username=coalesce(excluded.username,group_members.username),
    first_name=case when excluded.first_name<>'' then excluded.first_name else group_members.first_name end,
    last_name=coalesce(excluded.last_name,group_members.last_name),
    first_seen_at=least(group_members.first_seen_at,excluded.first_seen_at),
    last_seen_at=greatest(group_members.last_seen_at,excluded.last_seen_at),
    total_messages=group_members.total_messages+excluded.total_messages,
    joined_at=least(coalesce(group_members.joined_at,group_members.first_seen_at),coalesce(excluded.joined_at,excluded.first_seen_at));

  delete from public.group_members where chat_id=p_old_chat_id;

  delete from public.message_events old_event
  using public.message_events new_event
  where old_event.chat_id=p_old_chat_id
    and new_event.chat_id=p_new_chat_id
    and old_event.telegram_message_id=new_event.telegram_message_id;

  update public.message_events
  set chat_id=p_new_chat_id
  where chat_id=p_old_chat_id;

  insert into public.group_settings(chat_id,min_messages,evaluation_days,newcomer_grace_days,updated_at)
  select p_new_chat_id,min_messages,evaluation_days,newcomer_grace_days,updated_at
  from public.group_settings
  where chat_id=p_old_chat_id
  on conflict(chat_id) do update set
    min_messages=case when excluded.updated_at>group_settings.updated_at then excluded.min_messages else group_settings.min_messages end,
    evaluation_days=case when excluded.updated_at>group_settings.updated_at then excluded.evaluation_days else group_settings.evaluation_days end,
    newcomer_grace_days=case when excluded.updated_at>group_settings.updated_at then excluded.newcomer_grace_days else group_settings.newcomer_grace_days end,
    updated_at=greatest(group_settings.updated_at,excluded.updated_at);

  delete from public.group_settings where chat_id=p_old_chat_id;
end;
$$;

revoke all on function public.migrate_group_chat_id(bigint,bigint) from public,anon,authenticated;
grant execute on function public.migrate_group_chat_id(bigint,bigint) to service_role;
