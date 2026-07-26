-- Circle Calendar v0.4: secure join-by-invite-code flow.
-- Run once in Supabase > SQL Editor after migrations 001 and 002.

create or replace function public.join_group_by_invite_code(supplied_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Trebuie să fii autentificat.';
  end if;

  select id into target_group_id
  from public.groups
  where upper(invite_code) = upper(trim(supplied_code))
  limit 1;

  if target_group_id is null then
    raise exception 'Codul de invitație nu este valid.';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return target_group_id;
end;
$$;

revoke all on function public.join_group_by_invite_code(text) from public;
grant execute on function public.join_group_by_invite_code(text) to authenticated;
