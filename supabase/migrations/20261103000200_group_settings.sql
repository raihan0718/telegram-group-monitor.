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
