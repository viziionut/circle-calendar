-- Circle Calendar - persistent Quick Plan availability
-- Safe for databases where migration 008 was already applied.

alter table public.quick_plan_votes
  add column if not exists created_at timestamptz not null default now();

alter table public.quick_plans
  drop constraint if exists quick_plans_status_check;

update public.quick_plans
set status = 'finalized'
where status = 'completed';

alter table public.quick_plans
  add constraint quick_plans_status_check
  check (status in ('draft','voting','recommended','finalized','completed','cancelled'));

drop policy if exists "creators and group managers update quick plans" on public.quick_plans;
create policy "creators and group managers update quick plans"
on public.quick_plans for update to authenticated
using (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']))
with check (
  (created_by = auth.uid() or public.has_group_role(group_id, array['owner','admin']))
  and (status <> 'finalized' or created_by = auth.uid())
);

drop policy if exists "members insert own quick plan votes" on public.quick_plan_votes;
create policy "members insert own quick plan votes"
on public.quick_plan_votes for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and qp.status in ('voting','recommended')
      and public.is_group_member(qp.group_id)
  )
);

drop policy if exists "members update own quick plan votes" on public.quick_plan_votes;
create policy "members update own quick plan votes"
on public.quick_plan_votes for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and qp.status in ('voting','recommended')
      and public.is_group_member(qp.group_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.quick_plan_options qpo
    join public.quick_plans qp on qp.id = qpo.plan_id
    where qpo.id = quick_plan_votes.option_id
      and qp.status in ('voting','recommended')
      and public.is_group_member(qp.group_id)
  )
);

create or replace function public.recalculate_quick_plan_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quick_plan_options option_to_score
  set
    available_count = (
      select count(distinct qpv.user_id)
      from public.quick_plan_votes qpv
      join public.quick_plans score_plan on score_plan.id = option_to_score.plan_id
      join public.group_members eligible
        on eligible.group_id = score_plan.group_id
       and eligible.user_id = qpv.user_id
      where qpv.option_id = option_to_score.id
        and qpv.vote in ('yes','maybe')
    ),
    total_members = (
      select count(*) from public.group_members gm
      join public.quick_plans score_plan on score_plan.group_id = gm.group_id
      where score_plan.id = option_to_score.plan_id
    ),
    score = coalesce((
      select round(
        100.0 * sum(case qpv.vote when 'yes' then 1.0 when 'maybe' then 0.5 else 0 end)
        / nullif(count(distinct eligible.user_id), 0)
      )::integer
      from public.group_members eligible
      join public.quick_plans score_plan on score_plan.group_id = eligible.group_id
      left join public.quick_plan_votes qpv
        on qpv.option_id = option_to_score.id
       and qpv.user_id = eligible.user_id
      where score_plan.id = option_to_score.plan_id
    ), 0)
  where option_to_score.id = new.option_id;

  update public.quick_plans qp
  set
    status = case
      when not exists (
        select 1
        from public.group_members gm
        where gm.group_id = qp.group_id
          and not exists (
            select 1
            from public.quick_plan_votes qpv
            join public.quick_plan_options member_option on member_option.id = qpv.option_id
            where member_option.plan_id = qp.id
              and qpv.user_id = gm.user_id
          )
      )
      and exists (
        select 1
        from public.quick_plan_options valid_option
        where valid_option.plan_id = qp.id
          and (
            select count(distinct qpv.user_id)
            from public.quick_plan_votes qpv
            join public.group_members eligible
              on eligible.group_id = qp.group_id
             and eligible.user_id = qpv.user_id
            where qpv.option_id = valid_option.id
              and qpv.vote in ('yes','maybe')
          ) >= qp.minimum_participants
      )
      then 'recommended'
      else 'voting'
    end,
    updated_at = now()
  from public.quick_plan_options changed_option
  where changed_option.id = new.option_id
    and qp.id = changed_option.plan_id
    and qp.status in ('voting','recommended');
  return new;
end;
$$;

drop trigger if exists mark_quick_plan_recommended_on_vote on public.quick_plan_votes;
drop trigger if exists recalculate_quick_plan_status_on_vote on public.quick_plan_votes;
create trigger recalculate_quick_plan_status_on_vote
after insert or update on public.quick_plan_votes
for each row execute function public.recalculate_quick_plan_status();

drop function if exists public.mark_quick_plan_recommended();

-- Recalculate existing non-final plans without deleting or rewriting responses.
update public.quick_plans qp
set status = case
  when not exists (
    select 1 from public.group_members gm
    where gm.group_id = qp.group_id
      and not exists (
        select 1
        from public.quick_plan_votes qpv
        join public.quick_plan_options member_option on member_option.id = qpv.option_id
        where member_option.plan_id = qp.id and qpv.user_id = gm.user_id
      )
  )
  and exists (
    select 1 from public.quick_plan_options valid_option
    where valid_option.plan_id = qp.id
      and (
        select count(distinct qpv.user_id)
        from public.quick_plan_votes qpv
        join public.group_members eligible
          on eligible.group_id = qp.group_id and eligible.user_id = qpv.user_id
        where qpv.option_id = valid_option.id and qpv.vote in ('yes','maybe')
      ) >= qp.minimum_participants
  )
  then 'recommended'
  else 'voting'
end
where qp.status in ('voting','recommended');

-- Keep the v6.3 notification trigger compatible with the new final state.
create or replace function public.notify_quick_plan_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare member record; actor uuid; actor_name text; ntype text; ntitle text; nmessage text;
begin
  actor := case when tg_op='INSERT' then new.created_by else coalesce(auth.uid(),new.created_by) end;
  actor_name := public.notification_actor_name(actor);
  if tg_op='INSERT' then
    ntype:='quick_plan_vote_requested'; ntitle:=actor_name||' a creat un Quick Plan';
    nmessage:='Votează variantele pentru '||new.activity_emoji||' '||new.title;
  elsif old.status is distinct from new.status and new.status in ('completed','finalized') then
    ntype:='quick_plan_confirmed'; ntitle:='Quick Plan confirmat';
    nmessage:=new.activity_emoji||' '||new.title||' are o variantă finală.';
  else return new;
  end if;
  for member in select user_id from public.group_members where group_id=new.group_id loop
    perform public.emit_notification(member.user_id,new.group_id,actor,ntype,ntitle,nmessage,
      'quick_plan',new.id,jsonb_build_object('title',new.title),ntype||':'||new.id);
  end loop;
  return new;
end $$;

notify pgrst, 'reload schema';
