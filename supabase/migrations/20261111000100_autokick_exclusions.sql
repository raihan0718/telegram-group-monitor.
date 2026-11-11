create table if not exists public.autokick_exclusions (
  chat_id bigint not null,
  username text not null check (username ~ '^[a-z0-9_]{5,32}$'),
  created_at timestamptz not null default now(),
  primary key (chat_id, username)
);

create index if not exists autokick_exclusions_chat_id_idx
  on public.autokick_exclusions(chat_id);

alter table public.autokick_exclusions enable row level security;
