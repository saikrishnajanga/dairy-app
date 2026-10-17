-- ═══════════════════════════════════════════════════════════
--  VoiceDiary Pro — Comprehensive Database & Storage Migration
--  Run this in Supabase → SQL Editor → New query → Run.
-- ═══════════════════════════════════════════════════════════

-- 1. Diary Sync Table (Preserved & Enhanced)
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

-- 2. Documents Metadata Table
create table if not exists public.documents (
  id           text        not null primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  name         text        not null,
  file_size    bigint      not null,
  mime_type    text        not null,
  category     text        not null default 'Personal',
  storage_path text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "users manage own documents" on public.documents;
create policy "users manage own documents"
  on public.documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Private Storage Buckets Setup
-- Insert private storage buckets if they do not exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 26214400, null), -- 25MB limit
  ('voice_recordings', 'voice_recordings', false, 52428800, null) -- 50MB limit
on conflict (id) do update set
  public = false;

-- 4. Storage Row-Level Security Policies
-- Ensures users can only access/upload/delete files inside their own folder: `${auth.uid()}/*`

drop policy if exists "Users can upload their own documents" on storage.objects;
create policy "Users can upload their own documents"
  on storage.objects
  for insert
  with check (
    bucket_id in ('documents', 'voice_recordings')
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view their own documents" on storage.objects;
create policy "Users can view their own documents"
  on storage.objects
  for select
  using (
    bucket_id in ('documents', 'voice_recordings')
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own documents" on storage.objects;
create policy "Users can update their own documents"
  on storage.objects
  for update
  using (
    bucket_id in ('documents', 'voice_recordings')
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own documents" on storage.objects;
create policy "Users can delete their own documents"
  on storage.objects
  for delete
  using (
    bucket_id in ('documents', 'voice_recordings')
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
