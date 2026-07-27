-- Circle Calendar v6.4 - Internationalization

alter table public.profiles
  add column if not exists locale text not null default 'ro';

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check check (locale in ('ro', 'en'));

create index if not exists idx_profiles_locale on public.profiles(locale);

comment on column public.profiles.locale is
  'BCP-47 application language key. Add new supported values to this constraint.';

-- Notification copy is rendered at read time in the recipient's locale.
-- Existing installations keep the legacy columns nullable for compatibility;
-- no new trigger writes translated copy to them.
alter table public.notifications alter column title drop not null;
alter table public.notifications alter column message drop not null;
alter table public.notifications alter column message drop default;

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
    user_id, group_id, actor_id, type, entity_type, entity_id, metadata, dedupe_key
  ) values (
    target_user_id, target_group_id, source_actor_id, notification_type,
    target_entity_type, target_entity_id, coalesce(notification_metadata, '{}'::jsonb),
    notification_dedupe_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
