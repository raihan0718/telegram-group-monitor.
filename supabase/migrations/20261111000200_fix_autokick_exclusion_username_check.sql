create table if not exists public.autokick_exclusions (
  chat_id bigint not null,
  username text not null,
  created_at timestamptz not null default now(),
  primary key (chat_id, username)
);

alter table public.autokick_exclusions
  drop constraint if exists autokick_exclusions_username_check;

alter table public.autokick_exclusions
  add constraint autokick_exclusions_username_check
  check (username ~ '^[a-z0-9_]{1,32}$');

create index if not exists autokick_exclusions_chat_id_idx
  on public.autokick_exclusions(chat_id);

alter table public.autokick_exclusions enable row level security;
