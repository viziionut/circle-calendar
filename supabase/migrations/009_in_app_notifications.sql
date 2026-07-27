-- Circle Calendar v6.3 - In-App Notifications

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  groups_enabled boolean not null default true,
  events_enabled boolean not null default true,
  quick_plans_enabled boolean not null default true,
  vacations_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in (
    'group_invitation','group_member_joined',
    'event_created','event_updated','event_cancelled',
    'quick_plan_created','quick_plan_vote_requested','quick_plan_voted',
    'quick_plan_last_vote','quick_plan_confirmed','quick_plan_event_created',
    'quick_plan_comment',
    'vacation_created',
    'event_tomorrow','quick_plan_response_due'
  )),
  title text not null,
  message text not null default '',
  entity_type text check (entity_type in ('group','event','quick_plan','vacation')),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists idx_notifications_dedupe
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc)
  where is_read = false;

insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

create policy "users read own notification preferences"
on public.notification_preferences for select to authenticated
using (user_id = auth.uid());

create policy "users update own notification preferences"
on public.notification_preferences for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users insert own notification preferences"
on public.notification_preferences for insert to authenticated
with check (user_id = auth.uid());

create policy "users read own notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid());

create policy "users update own notifications"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users delete own notifications"
on public.notifications for delete to authenticated
using (user_id = auth.uid());

-- No INSERT policy is exposed to authenticated users. Notifications are emitted
-- only by trusted trigger functions below.

create or replace function public.notification_category(notification_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when notification_type like 'group_%' then 'groups'
    when notification_type like 'event_%' and notification_type <> 'event_tomorrow' then 'events'
    when notification_type like 'quick_plan_%' then 'quick_plans'
    when notification_type = 'vacation_created' then 'vacations'
    else 'reminders'
  end;
$$;

create or replace function public.emit_notification(
  target_user_id uuid,
  target_group_id uuid,
  source_actor_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  target_entity_type text,
  target_entity_id uuid,
  notification_metadata jsonb default '{}'::jsonb,
  notification_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prefs public.notification_preferences;
  category text;
  enabled boolean := true;
begin
  if target_user_id is null or target_user_id = source_actor_id then return; end if;
  if target_group_id is not null and not public.is_group_member(target_group_id, target_user_id) then return; end if;

  select * into prefs from public.notification_preferences where user_id = target_user_id;
  category := public.notification_category(notification_type);
  if found then
    enabled := case category
      when 'groups' then prefs.groups_enabled
      when 'events' then prefs.events_enabled
      when 'quick_plans' then prefs.quick_plans_enabled
      when 'vacations' then prefs.vacations_enabled
      else prefs.reminders_enabled
    end;
  end if;
  if not enabled then return; end if;

  insert into public.notifications (
    user_id, group_id, actor_id, type, title, message,
    entity_type, entity_id, metadata, dedupe_key
  ) values (
    target_user_id, target_group_id, source_actor_id, notification_type,
    notification_title, notification_message, target_entity_type,
    target_entity_id, coalesce(notification_metadata, '{}'::jsonb),
    notification_dedupe_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

revoke all on function public.emit_notification(uuid,uuid,uuid,text,text,text,text,uuid,jsonb,text) from public, anon, authenticated;

create or replace function public.notification_actor_name(actor uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(display_name, username, 'Un membru') from public.profiles where id = actor;
$$;

revoke all on function public.notification_actor_name(uuid) from public, anon, authenticated;

create or replace function public.create_notification_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_preferences(user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists create_notification_preferences_on_profile on public.profiles;
create trigger create_notification_preferences_on_profile
after insert on public.profiles for each row execute function public.create_notification_preferences();

create or replace function public.notify_group_member_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare member record; group_name text; owner uuid; actor_name text;
begin
  select name, owner_id into group_name, owner from public.groups where id = new.group_id;
  actor_name := public.notification_actor_name(new.user_id);
  for member in select user_id from public.group_members where group_id = new.group_id loop
    if member.user_id = new.user_id then
      perform public.emit_notification(member.user_id,new.group_id,owner,'group_invitation',
        'Bine ai venit în ' || group_name,'Invitația a fost acceptată. Acum faci parte din grup.',
        'group',new.group_id,'{}'::jsonb,'group-invitation:'||new.group_id||':'||new.user_id);
    else
      perform public.emit_notification(member.user_id,new.group_id,new.user_id,'group_member_joined',
        actor_name || ' a intrat în grup',group_name || ' are un membru nou.',
        'group',new.group_id,'{}'::jsonb,'member-joined:'||new.group_id||':'||new.user_id);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists notify_group_member_insert on public.group_members;
create trigger notify_group_member_insert after insert on public.group_members
for each row execute function public.notify_group_member_insert();

create or replace function public.notify_event_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare member record; actor uuid; actor_name text; event_row public.events; ntype text; ntitle text; nmessage text; dkey text;
begin
  event_row := case when tg_op = 'DELETE' then old else new end;
  actor := coalesce(auth.uid(), event_row.created_by);
  actor_name := public.notification_actor_name(actor);
  if tg_op = 'INSERT' then
    ntype := case when coalesce(new.details,'') like 'Creat din Quick Plan.%' then 'quick_plan_event_created' else 'event_created' end;
    ntitle := case when ntype='quick_plan_event_created' then 'Eveniment creat din Quick Plan' else actor_name || ' a creat un eveniment' end;
    nmessage := new.title || ' · ' || to_char(new.event_date,'DD Mon');
    dkey := ntype||':'||new.id;
  elsif tg_op = 'UPDATE' then
    if row(new.title,new.event_date,new.event_time,new.location,new.details) is not distinct from row(old.title,old.event_date,old.event_time,old.location,old.details) then return new; end if;
    ntype := 'event_updated'; ntitle := actor_name || ' a modificat un eveniment';
    nmessage := new.title || ' · ' || to_char(new.event_date,'DD Mon');
    dkey := ntype||':'||new.id||':'||extract(epoch from new.updated_at)::bigint;
  else
    ntype := 'event_cancelled'; ntitle := actor_name || ' a anulat un eveniment';
    nmessage := old.title; dkey := ntype||':'||old.id;
  end if;
  for member in select user_id from public.group_members where group_id=event_row.group_id loop
    perform public.emit_notification(member.user_id,event_row.group_id,actor,ntype,ntitle,nmessage,
      'event',event_row.id,jsonb_build_object('event_date',event_row.event_date),dkey);
  end loop;
  return event_row;
end $$;

drop trigger if exists notify_event_change on public.events;
create trigger notify_event_change after insert or update or delete on public.events
for each row execute function public.notify_event_change();

create or replace function public.notify_vacation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare member record; actor_name text;
begin
  actor_name := public.notification_actor_name(new.user_id);
  for member in select user_id from public.group_members where group_id=new.group_id loop
    perform public.emit_notification(member.user_id,new.group_id,new.user_id,'vacation_created',
      actor_name || ' a adăugat o vacanță',
      new.country || ' · ' || to_char(new.start_date,'DD Mon') || ' – ' || to_char(new.end_date,'DD Mon'),
      'vacation',new.id,jsonb_build_object('start_date',new.start_date,'end_date',new.end_date),
      'vacation-created:'||new.id);
  end loop;
  return new;
end $$;

drop trigger if exists notify_vacation_insert on public.vacations;
create trigger notify_vacation_insert after insert on public.vacations
for each row execute function public.notify_vacation_insert();

create or replace function public.notify_quick_plan_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare member record; actor uuid; actor_name text; ntype text; ntitle text; nmessage text;
begin
  actor := case when tg_op='INSERT' then new.created_by else coalesce(auth.uid(),new.created_by) end;
  actor_name := public.notification_actor_name(actor);
  if tg_op='INSERT' then
    ntype:='quick_plan_vote_requested'; ntitle:=actor_name||' a creat un Quick Plan';
    nmessage:='Votează variantele pentru '||new.activity_emoji||' '||new.title;
  elsif old.status is distinct from new.status and new.status='completed' then
    ntype:='quick_plan_confirmed'; ntitle:='Quick Plan confirmat';
    nmessage:=new.activity_emoji||' '||new.title||' are o variantă finală.';
  else return new;
  end if;
  for member in select user_id from public.group_members where group_id=new.group_id loop
    perform public.emit_notification(member.user_id,new.group_id,actor,ntype,ntitle,nmessage,
      'quick_plan',new.id,'{}'::jsonb,ntype||':'||new.id);
  end loop;
  return new;
end $$;

drop trigger if exists notify_quick_plan_change on public.quick_plans;
create trigger notify_quick_plan_change after insert or update on public.quick_plans
for each row execute function public.notify_quick_plan_change();

create or replace function public.notify_quick_plan_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_row public.quick_plans; option_row public.quick_plan_options; actor_name text; vote_label text;
  missing_count integer; missing_user uuid; member record;
begin
  select * into option_row from public.quick_plan_options where id=new.option_id;
  select qp.* into plan_row from public.quick_plans qp where qp.id=option_row.plan_id;
  actor_name:=public.notification_actor_name(new.user_id);
  vote_label:=case new.vote when 'yes' then 'Da' when 'maybe' then 'Poate' else 'Nu' end;

  perform public.emit_notification(plan_row.created_by,plan_row.group_id,new.user_id,'quick_plan_voted',
    actor_name||' a votat „'||vote_label||'”',plan_row.title||' · '||to_char(option_row.start_date,'DD Mon'),
    'quick_plan',plan_row.id,jsonb_build_object('option_id',new.option_id,'vote',new.vote),
    'plan-vote:'||new.option_id||':'||new.user_id||':'||new.updated_at);

  if nullif(trim(coalesce(new.comment,'')),'') is not null
     and (tg_op='INSERT' or new.comment is distinct from old.comment) then
    perform public.emit_notification(plan_row.created_by,plan_row.group_id,new.user_id,'quick_plan_comment',
      actor_name||' a adăugat un comentariu',new.comment,'quick_plan',plan_row.id,
      jsonb_build_object('option_id',new.option_id),'plan-comment:'||new.option_id||':'||new.user_id||':'||new.updated_at);
  end if;

  select count(*),min(gm.user_id) into missing_count,missing_user
  from public.group_members gm
  where gm.group_id=plan_row.group_id and not exists (
    select 1 from public.quick_plan_votes qpv
    join public.quick_plan_options qpo on qpo.id=qpv.option_id
    where qpo.plan_id=plan_row.id and qpv.user_id=gm.user_id
  );
  if missing_count=1 then
    perform public.emit_notification(missing_user,plan_row.group_id,new.user_id,'quick_plan_last_vote',
      'Mai lipsește un singur vot','Răspunde la '||plan_row.activity_emoji||' '||plan_row.title,
      'quick_plan',plan_row.id,'{}'::jsonb,'plan-last-vote:'||plan_row.id||':'||missing_user);
  end if;
  return new;
end $$;

drop trigger if exists notify_quick_plan_vote on public.quick_plan_votes;
create trigger notify_quick_plan_vote after insert or update on public.quick_plan_votes
for each row execute function public.notify_quick_plan_vote();

-- Prepared for a future Supabase Cron / Vercel Cron job. This function is not
-- scheduled by this migration and is not executable from the browser.
create or replace function public.enqueue_scheduled_notifications(run_date date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare item record; inserted_count integer := 0; before_count bigint; after_count bigint;
begin
  select count(*) into before_count from public.notifications;
  for item in
    select e.*,gm.user_id from public.events e join public.group_members gm on gm.group_id=e.group_id
    where e.event_date=run_date+1
  loop
    perform public.emit_notification(item.user_id,item.group_id,null,'event_tomorrow',
      'Evenimentul începe mâine',item.title,'event',item.id,
      jsonb_build_object('event_date',item.event_date),'event-tomorrow:'||item.id||':'||run_date);
  end loop;
  for item in
    select qp.id,qp.group_id,qp.title,qp.activity_emoji,gm.user_id from public.quick_plans qp
    join public.group_members gm on gm.group_id=qp.group_id
    where qp.status='voting' and not exists (
      select 1 from public.quick_plan_votes qpv join public.quick_plan_options qpo on qpo.id=qpv.option_id
      where qpo.plan_id=qp.id and qpv.user_id=gm.user_id
    )
  loop
    perform public.emit_notification(item.user_id,item.group_id,null,'quick_plan_response_due',
      'Un plan așteaptă răspunsul tău',item.activity_emoji||' '||item.title,
      'quick_plan',item.id,'{}'::jsonb,'plan-response:'||item.id||':'||run_date);
  end loop;
  select count(*) into after_count from public.notifications;
  return (after_count-before_count)::integer;
end $$;

revoke all on function public.enqueue_scheduled_notifications(date) from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then alter publication supabase_realtime add table public.notifications; end if;
end $$;
