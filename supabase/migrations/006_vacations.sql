-- Circle Calendar v5.2 Lite: group vacations.

create table if not exists public.vacations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  country text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vacations_date_range check (end_date >= start_date)
);

create index if not exists idx_vacations_group_dates
on public.vacations(group_id, start_date, end_date);

create index if not exists idx_vacations_user
on public.vacations(user_id);

create or replace function public.set_vacations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vacations_updated_at on public.vacations;
create trigger set_vacations_updated_at
before update on public.vacations
for each row execute procedure public.set_vacations_updated_at();

alter table public.vacations enable row level security;

create policy "members can read vacations"
on public.vacations for select
to authenticated
using (public.is_group_member(group_id));

create policy "members can create own vacations"
on public.vacations for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_group_member(group_id)
);

create policy "users admins owners can update vacations"
on public.vacations for update
to authenticated
using (
  user_id = auth.uid()
  or public.has_group_role(group_id, array['owner','admin'])
)
with check (
  public.is_group_member(group_id)
  and (
    user_id = auth.uid()
    or public.has_group_role(group_id, array['owner','admin'])
  )
);

create policy "users admins owners can delete vacations"
on public.vacations for delete
to authenticated
using (
  user_id = auth.uid()
  or public.has_group_role(group_id, array['owner','admin'])
);

alter publication supabase_realtime add table public.vacations;
