-- Circle Calendar: secure application administration foundation.

alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text;

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
check (account_status in ('active', 'suspended'));

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created
on public.admin_audit_logs(created_at desc);

create index if not exists idx_admin_audit_logs_target
on public.admin_audit_logs(target_user_id, created_at desc);

create or replace function public.is_account_active(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user_id and account_status = 'active'
  );
$$;

create or replace function public.is_app_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_account_active(check_user_id)
    and exists (
      select 1 from public.app_admins
      where user_id = check_user_id and role in ('owner', 'admin')
    );
$$;

create or replace function public.is_app_owner(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_account_active(check_user_id)
    and exists (
      select 1 from public.app_admins
      where user_id = check_user_id and role = 'owner'
    );
$$;

revoke all on function public.is_account_active(uuid) from public;
revoke all on function public.is_app_admin(uuid) from public;
revoke all on function public.is_app_owner(uuid) from public;
grant execute on function public.is_account_active(uuid) to authenticated;
grant execute on function public.is_app_admin(uuid) to authenticated;
grant execute on function public.is_app_owner(uuid) to authenticated;

alter table public.app_admins enable row level security;
alter table public.admin_audit_logs enable row level security;

grant select, insert, update, delete on public.app_admins to authenticated;
grant select on public.admin_audit_logs to authenticated;

create policy "app admins can read administrators"
on public.app_admins
for select
to authenticated
using (public.is_app_admin());

create policy "app owners can add administrators"
on public.app_admins
for insert
to authenticated
with check (public.is_app_owner() and created_by = auth.uid());

create policy "app owners can update administrators"
on public.app_admins
for update
to authenticated
using (public.is_app_owner())
with check (public.is_app_owner());

create policy "app owners can remove administrators"
on public.app_admins
for delete
to authenticated
using (public.is_app_owner() and user_id <> auth.uid());

create policy "app admins can read audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_app_admin());

-- Audit writes are performed only by the server-side service-role client.
revoke insert, update, delete on public.admin_audit_logs from authenticated;

-- Users may update only normal profile/activity fields. Administrative status
-- fields can only be changed by the service-role server.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, brand, theme, last_seen_at, updated_at)
on public.profiles to authenticated;

-- Restrictive policies are combined with the existing feature policies. A
-- suspended account therefore loses access even while an old access token is
-- still valid.
create policy "active accounts can access groups"
on public.groups
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());

create policy "active accounts can access memberships"
on public.group_members
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());

create policy "active accounts can access events"
on public.events
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());

create policy "active accounts can access rsvps"
on public.event_rsvps
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());

create policy "active accounts can access event media"
on public.event_media
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());

create policy "active accounts can access vacations"
on public.vacations
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());

create policy "active accounts can access storage"
on storage.objects
as restrictive
for all
to authenticated
using (public.is_account_active())
with check (public.is_account_active());
