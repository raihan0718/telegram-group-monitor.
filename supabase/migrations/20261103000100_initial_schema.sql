create table if not exists public.group_members (
  id bigint generated always as identity primary key,
  chat_id bigint not null,
  user_id bigint not null,
  username text,
  first_name text not null default '',
  last_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_messages bigint not null default 0,
  unique (chat_id, user_id)
);
create index if not exists group_members_activity_idx on public.group_members (chat_id, last_seen_at desc);
create index if not exists group_members_count_idx on public.group_members (chat_id, total_messages desc);
create table if not exists public.message_events (
  id bigint generated always as identity primary key,
  chat_id bigint not null,
  user_id bigint not null,
  telegram_message_id bigint not null,
  message_date timestamptz not null,
  created_at timestamptz not null default now(),
  unique (chat_id, telegram_message_id)
);
create index if not exists message_events_chat_date_idx on public.message_events (chat_id, message_date desc);

create or replace function public.record_group_message(
  p_chat_id bigint, p_user_id bigint, p_username text, p_first_name text,
  p_last_name text, p_message_id bigint, p_message_date timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  insert into public.message_events(chat_id,user_id,telegram_message_id,message_date)
  values (p_chat_id,p_user_id,p_message_id,p_message_date)
  on conflict (chat_id,telegram_message_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;
  insert into public.group_members(chat_id,user_id,username,first_name,last_name,last_seen_at,total_messages)
  values (p_chat_id,p_user_id,p_username,coalesce(p_first_name,''),p_last_name,p_message_date,1)
  on conflict (chat_id,user_id) do update set
    username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name,
    last_seen_at=greatest(group_members.last_seen_at,excluded.last_seen_at),
    total_messages=group_members.total_messages+1;
  return true;
end; $$;
revoke all on function public.record_group_message(bigint,bigint,text,text,text,bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.record_group_message(bigint,bigint,text,text,text,bigint,timestamptz) to service_role;
