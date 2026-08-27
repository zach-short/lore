-- lore: friend graph + pipeline-published data payload.
-- Friends power the app's crew picker (who's in the room tonight); the
-- site-data bucket lets the pipeline publish data.json so the app reads
-- fresh scores at runtime instead of a payload baked in at deploy.

-- Friend discovery needs the roster visible to every signed-in member.
-- profiles carries only letterboxd_username / display_name — nothing private.
drop policy "profiles: read own" on public.profiles;
create policy "profiles: read all" on public.profiles
  for select to authenticated
  using (true);

-- One username, one account: friend search keys on it, and the pipeline maps
-- payload members back to profiles by it.
create unique index profiles_letterboxd_username_key
  on public.profiles (lower(letterboxd_username));

-- One row per friendship edge: requester sends, addressee accepts.
-- Decline/cancel/unfriend are all delete — no tombstone states to sync.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One edge per pair, whichever direction it was sent in.
create unique index friendships_pair_key on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- Update is column-scoped: accepting must not be able to reassign the edge
-- to different people (RLS can't compare OLD vs NEW; the grant can).
grant select, insert, delete on public.friendships to authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

create policy "friendships: read own edges" on public.friendships
  for select to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

create policy "friendships: request as self" on public.friendships
  for insert to authenticated
  with check (
    (select auth.uid()) = requester_id
    and status = 'pending'
  );

create policy "friendships: addressee accepts" on public.friendships
  for update to authenticated
  using ((select auth.uid()) = addressee_id)
  with check (
    (select auth.uid()) = addressee_id
    and status = 'accepted'
  );

create policy "friendships: either side removes" on public.friendships
  for delete to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

-- Private bucket the pipeline (service role) publishes site/data.json into;
-- any signed-in member reads it. The service role bypasses RLS, so only a
-- read policy is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-data',
  'site-data',
  false,
  26214400, -- 25 MB; data.json is ~2 MB today
  array['application/json']
);

create policy "site-data: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'site-data');
