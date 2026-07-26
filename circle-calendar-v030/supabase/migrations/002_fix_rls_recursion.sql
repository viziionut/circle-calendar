-- Fix recursive RLS checks on group_members.
-- Run once after 001_initial_schema.sql.

create or replace function public.is_group_member(check_group_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = check_group_id and user_id = check_user_id
  );
$$;

create or replace function public.has_group_role(check_group_id uuid, allowed_roles text[], check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = check_group_id
      and user_id = check_user_id
      and role = any(allowed_roles)
  );
$$;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.has_group_role(uuid, text[], uuid) to authenticated;

drop policy if exists "members can read groups" on public.groups;
create policy "members can read groups" on public.groups for select to authenticated
using (public.is_group_member(id));

drop policy if exists "owners and admins can update groups" on public.groups;
create policy "owners and admins can update groups" on public.groups for update to authenticated
using (public.has_group_role(id, array['owner','admin']))
with check (public.has_group_role(id, array['owner','admin']));

drop policy if exists "members can read group membership" on public.group_members;
create policy "members can read group membership" on public.group_members for select to authenticated
using (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists "owners admins can add members" on public.group_members;
create policy "owners admins can add members" on public.group_members for insert to authenticated
with check (user_id = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "owners admins can update members" on public.group_members;
create policy "owners admins can update members" on public.group_members for update to authenticated
using (public.has_group_role(group_id, array['owner','admin']))
with check (public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "members can leave groups" on public.group_members;
create policy "members can leave groups" on public.group_members for delete to authenticated
using (user_id = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "members can read events" on public.events;
create policy "members can read events" on public.events for select to authenticated
using (public.is_group_member(group_id));

drop policy if exists "members can create events" on public.events;
create policy "members can create events" on public.events for insert to authenticated
with check (created_by = auth.uid() and public.is_group_member(group_id));

drop policy if exists "creator admins owners can update events" on public.events;
create policy "creator admins owners can update events" on public.events for update to authenticated
using (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']))
with check (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "creator admins owners can delete events" on public.events;
create policy "creator admins owners can delete events" on public.events for delete to authenticated
using (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "members can read event media" on public.event_media;
create policy "members can read event media" on public.event_media for select to authenticated
using (public.is_group_member(group_id));

drop policy if exists "members can upload event media metadata" on public.event_media;
create policy "members can upload event media metadata" on public.event_media for insert to authenticated
with check (uploaded_by = auth.uid() and public.is_group_member(group_id));

drop policy if exists "uploader admins owners can delete event media metadata" on public.event_media;
create policy "uploader admins owners can delete event media metadata" on public.event_media for delete to authenticated
using (uploaded_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "members can read event media files" on storage.objects;
create policy "members can read event media files" on storage.objects for select to authenticated
using (bucket_id = 'event-media' and public.is_group_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members can upload event media files" on storage.objects;
create policy "members can upload event media files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-media'
  and (storage.foldername(name))[3] = auth.uid()::text
  and public.is_group_member(((storage.foldername(name))[1])::uuid)
);
