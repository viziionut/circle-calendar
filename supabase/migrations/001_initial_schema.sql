-- Circle Calendar - initial Supabase schema
-- Run this once in Supabase > SQL Editor > New query

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  brand text not null default 'bros' check (brand in ('bros','girls')),
  theme text not null default 'neon',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_time time,
  location text not null default '',
  maps_url text,
  details text,
  cover_path text,
  theme text not null default 'cyan',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('yes','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  width integer,
  height integer,
  duration_seconds numeric,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_events_group_date on public.events(group_id, event_date);
create index if not exists idx_event_media_event on public.event_media(event_id, created_at desc);
create index if not exists idx_event_media_group on public.event_media(group_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, brand)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'brand', 'bros')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.add_owner_as_group_member()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
after insert on public.groups
for each row execute procedure public.add_owner_as_group_member();

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.event_media enable row level security;

-- Profiles
create policy "profiles readable by signed-in users"
on public.profiles for select
to authenticated
using (true);

create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Groups
create policy "members can read groups"
on public.groups for select
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = groups.id and gm.user_id = auth.uid()
  )
);

create policy "users can create groups"
on public.groups for insert
to authenticated
with check (owner_id = auth.uid());

create policy "owners and admins can update groups"
on public.groups for update
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

create policy "owners can delete groups"
on public.groups for delete
to authenticated
using (owner_id = auth.uid());

-- Group members
create policy "members can read group membership"
on public.group_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.group_members self
    where self.group_id = group_members.group_id and self.user_id = auth.uid()
  )
);

create policy "owners admins can add members"
on public.group_members for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

create policy "owners admins can update members"
on public.group_members for update
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

create policy "members can leave groups"
on public.group_members for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

-- Events
create policy "members can read events"
on public.events for select
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = events.group_id and gm.user_id = auth.uid()
  )
);

create policy "members can create events"
on public.events for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.group_members gm
    where gm.group_id = events.group_id and gm.user_id = auth.uid()
  )
);

create policy "creator admins owners can update events"
on public.events for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = events.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = events.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

create policy "creator admins owners can delete events"
on public.events for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = events.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

-- RSVPs
create policy "members can read rsvps"
on public.event_rsvps for select
to authenticated
using (
  exists (
    select 1 from public.events e
    join public.group_members gm on gm.group_id = e.group_id
    where e.id = event_rsvps.event_id and gm.user_id = auth.uid()
  )
);

create policy "users manage own rsvp"
on public.event_rsvps for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Event media metadata
create policy "members can read event media"
on public.event_media for select
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = event_media.group_id and gm.user_id = auth.uid()
  )
);

create policy "members can upload event media metadata"
on public.event_media for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.group_members gm
    where gm.group_id = event_media.group_id and gm.user_id = auth.uid()
  )
);

create policy "uploader admins owners can delete event media metadata"
on public.event_media for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = event_media.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  )
);

-- Private storage bucket for event photos/videos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  false,
  104857600,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage path format: <group_id>/<event_id>/<user_id>/<filename>
create policy "members can read event media files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'event-media'
  and exists (
    select 1 from public.group_members gm
    where gm.group_id::text = (storage.foldername(name))[1]
      and gm.user_id = auth.uid()
  )
);

create policy "members can upload event media files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'event-media'
  and (storage.foldername(name))[3] = auth.uid()::text
  and exists (
    select 1 from public.group_members gm
    where gm.group_id::text = (storage.foldername(name))[1]
      and gm.user_id = auth.uid()
  )
);

create policy "uploader can update own event media files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'event-media'
  and (storage.foldername(name))[3] = auth.uid()::text
)
with check (
  bucket_id = 'event-media'
  and (storage.foldername(name))[3] = auth.uid()::text
);

create policy "uploader can delete own event media files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'event-media'
  and (storage.foldername(name))[3] = auth.uid()::text
);

-- Realtime preparation
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.event_rsvps;
alter publication supabase_realtime add table public.event_media;
