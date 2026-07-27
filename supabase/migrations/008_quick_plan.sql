-- Circle Calendar v5.5 - Quick Plan

create table if not exists public.quick_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  activity_key text not null,
  activity_emoji text not null default '✨',
  search_start date not null,
  search_end date not null,
  duration_days integer not null check (duration_days between 1 and 31),
  preference text not null default 'any' check (preference in ('weekend','weekdays','any')),
  minimum_participants integer not null check (minimum_participants >= 2),
  status text not null default 'voting' check (status in ('voting','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (search_end >= search_start)
);

create table if not exists public.quick_plan_options (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.quick_plans(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  rank integer not null check (rank between 1 and 5),
  score integer not null check (score between 0 and 100),
  available_count integer not null default 0 check (available_count >= 0),
  total_members integer not null default 0 check (total_members >= 0),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (plan_id, rank),
  unique (plan_id, start_date, end_date),
  check (end_date >= start_date),
  check (available_count <= total_members)
);

create table if not exists public.quick_plan_votes (
  option_id uuid not null references public.quick_plan_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('yes','maybe','no')),
  comment text,
  updated_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

create index if not exists idx_quick_plans_group_status
  on public.quick_plans(group_id, status, created_at desc);
create index if not exists idx_quick_plan_options_plan_rank
  on public.quick_plan_options(plan_id, rank);
create index if not exists idx_quick_plan_votes_user
  on public.quick_plan_votes(user_id, updated_at desc);
create index if not exists idx_quick_plan_votes_option
  on public.quick_plan_votes(option_id, updated_at desc);

alter table public.quick_plans enable row level security;
alter table public.quick_plan_options enable row level security;
alter table public.quick_plan_votes enable row level security;

drop policy if exists "group members read quick plans" on public.quick_plans;
create policy "group members read quick plans"
on public.quick_plans for select to authenticated
using (public.is_group_member(group_id));

drop policy if exists "group members create quick plans" on public.quick_plans;
create policy "group members create quick plans"
on public.quick_plans for insert to authenticated
with check (created_by = auth.uid() and public.is_group_member(group_id));

drop policy if exists "creators and group managers update quick plans" on public.quick_plans;
create policy "creators and group managers update quick plans"
on public.quick_plans for update to authenticated
using (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']))
with check (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "creators and group managers delete quick plans" on public.quick_plans;
create policy "creators and group managers delete quick plans"
on public.quick_plans for delete to authenticated
using (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']));

drop policy if exists "group members read quick plan options" on public.quick_plan_options;
create policy "group members read quick plan options"
on public.quick_plan_options for select to authenticated
using (
  exists (
    select 1 from public.quick_plans qp
    where qp.id = quick_plan_options.plan_id
      and public.is_group_member(qp.group_id)
  )
);

drop policy if exists "plan creators add quick plan options" on public.quick_plan_options;
create policy "plan creators add quick plan options"
on public.quick_plan_options for insert to authenticated
with check (
  exists (
    select 1 from public.quick_plans qp
    where qp.id = quick_plan_options.plan_id
      and qp.created_by = auth.uid()
      and public.is_group_member(qp.group_id)
  )
);

drop policy if exists "plan creators manage quick plan options" on public.quick_plan_options;
create policy "plan creators manage quick plan options"
on public.quick_plan_options for all to authenticated
using (
  exists (
    select 1 from public.quick_plans qp
    where qp.id = quick_plan_options.plan_id
      and (qp.created_by = auth.uid() or public.has_group_role(qp.group_id, array['owner','admin']))
  )
)
with check (
  exists (
    select 1 from public.quick_plans qp
    where qp.id = quick_plan_options.plan_id
      and (qp.created_by = auth.uid() or public.has_group_role(qp.group_id, array['owner','admin']))
  )
);

drop policy if exists "group members read quick plan votes" on public.quick_plan_votes;
create policy "group members read quick plan votes"
on public.quick_plan_votes for select to authenticated
using (
  exists (
    select 1
    from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and public.is_group_member(qp.group_id)
  )
);

drop policy if exists "members insert own quick plan votes" on public.quick_plan_votes;
create policy "members insert own quick plan votes"
on public.quick_plan_votes for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and qp.status = 'voting'
      and public.is_group_member(qp.group_id)
  )
);

drop policy if exists "members update own quick plan votes" on public.quick_plan_votes;
create policy "members update own quick plan votes"
on public.quick_plan_votes for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and qp.status = 'voting'
      and public.is_group_member(qp.group_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and qp.status = 'voting'
      and public.is_group_member(qp.group_id)
  )
);

drop policy if exists "members delete own quick plan votes" on public.quick_plan_votes;
create policy "members delete own quick plan votes"
on public.quick_plan_votes for delete to authenticated
using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_plans'
  ) then alter publication supabase_realtime add table public.quick_plans; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_plan_options'
  ) then alter publication supabase_realtime add table public.quick_plan_options; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_plan_votes'
  ) then alter publication supabase_realtime add table public.quick_plan_votes; end if;
end $$;

-- PostgREST normally refreshes automatically after DDL. This explicit signal is
-- safe in Supabase and makes the new tables available immediately to the API.
notify pgrst, 'reload schema';
