-- movienight: auth profiles + Letterboxd export uploads (app onboarding).
-- The app writes here; the pipeline reads with the service role key
-- (`movienight pull`), so no client-side update/delete policies exist.

-- One row per auth user, created during onboarding.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  letterboxd_username text not null,
  display_name text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- New projects no longer auto-expose public tables to the Data API
-- (changelog 2026-04-28) — grant explicitly, RLS scopes the rows.
grant select, insert, update on public.profiles to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- One row per uploaded export zip. `stats` is the app's client-side parse
-- summary; authoritative parsing happens in the pipeline off the raw zip.
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  object_path text not null,
  file_name text not null,
  size_bytes bigint not null,
  stats jsonb not null default '{}'::jsonb,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'imported', 'rejected')),
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

create index uploads_user_id_idx on public.uploads (user_id);
create index uploads_status_idx on public.uploads (status);

alter table public.uploads enable row level security;

grant select, insert on public.uploads to authenticated;

create policy "uploads: read own" on public.uploads
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "uploads: insert own" on public.uploads
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Private bucket for the raw zips, one folder per user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exports',
  'exports',
  false,
  52428800, -- 50 MB; real export zips are single-digit MB
  array['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
);

-- Upload (and replace) only inside your own folder; upsert needs all three ops.
create policy "exports: insert own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "exports: read own folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "exports: update own folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
