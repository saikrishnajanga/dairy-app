-- VoiceDiary Pro — cloud sync table for Google login.
-- Run this once in Supabase → SQL Editor → New query → Run.
--
-- One row per content key per user: the value is the JSON array the
-- app already keeps locally (entries / text diary / translations).
-- Row-level security guarantees a user can only ever see their own rows.

create table if not exists public.diary_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.diary_data enable row level security;

drop policy if exists "users manage own diary data" on public.diary_data;
create policy "users manage own diary data"
  on public.diary_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
