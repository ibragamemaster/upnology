-- Customer identity remains in auth.users. Pre-account quotes are claimed only after email verification.
alter table upnology.customer_profiles
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists sector text,
  add column if not exists city text;

create or replace function upnology.sync_customer_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into upnology.customer_profiles(user_id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''))
  on conflict (user_id) do nothing;
  if new.email_confirmed_at is not null and new.email is not null then
    insert into upnology.customer_leads(user_id, lead_id)
    select new.id, l.id from upnology.leads l
    where l.source = 'preventivo' and lower(l.email) = lower(new.email)
      and (l.auth_user_id is null or l.auth_user_id = new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_customer_identity on auth.users;
create trigger sync_customer_identity
after insert or update of email, email_confirmed_at on auth.users
for each row execute function upnology.sync_customer_identity();

insert into upnology.customer_profiles(user_id)
select id from auth.users on conflict (user_id) do nothing;
insert into upnology.customer_leads(user_id, lead_id)
select u.id, l.id from auth.users u join upnology.leads l on lower(l.email) = lower(u.email)
where u.email_confirmed_at is not null and l.source = 'preventivo'
  and (l.auth_user_id is null or l.auth_user_id = u.id)
on conflict do nothing;

grant select on upnology.leads, upnology.quote_requests, upnology.projects to authenticated;
grant update (display_name, last_name, phone, company, sector, city, updated_at)
  on upnology.customer_profiles to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='leads' and policyname='leads_select_own') then
    create policy leads_select_own on upnology.leads for select to authenticated
    using (auth_user_id = (select auth.uid()) or exists (
      select 1 from upnology.customer_leads cl
      where cl.lead_id = id and cl.user_id = (select auth.uid())
    ));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='quote_requests' and policyname='quotes_select_own') then
    create policy quotes_select_own on upnology.quote_requests for select to authenticated
    using (exists (
      select 1 from upnology.leads l where l.id = lead_id
        and (l.auth_user_id = (select auth.uid()) or exists (
          select 1 from upnology.customer_leads cl
          where cl.lead_id = l.id and cl.user_id = (select auth.uid())
        ))
    ));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='projects' and policyname='projects_select_own') then
    create policy projects_select_own on upnology.projects for select to authenticated
    using (customer_user_id = (select auth.uid()) or exists (
      select 1 from upnology.leads l where l.id = lead_id
        and (l.auth_user_id = (select auth.uid()) or exists (
          select 1 from upnology.customer_leads cl
          where cl.lead_id = l.id and cl.user_id = (select auth.uid())
        ))
    ));
  end if;
end $$;

create or replace function public.account_overview()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'profile', (select to_jsonb(p) from upnology.customer_profiles p where p.user_id = auth.uid()),
    'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', q.id, 'created_at', q.created_at, 'services', q.services,
      'budget', q.budget, 'timeline', q.timeline, 'status', l.status
    ) order by q.created_at desc)
      from upnology.quote_requests q join upnology.leads l on l.id = q.lead_id), '[]'::jsonb),
    'projects', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', p.id, 'title', p.title, 'status', p.status, 'updated_at', p.updated_at
    ) order by p.updated_at desc) from upnology.projects p), '[]'::jsonb)
  ) where auth.uid() is not null;
$$;

create or replace function public.update_customer_profile(p_profile jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_profile upnology.customer_profiles;
begin
  if auth.uid() is null or pg_catalog.jsonb_typeof(p_profile) is distinct from 'object'
    or pg_catalog.octet_length(p_profile::text) > 5000
    or pg_catalog.char_length(trim(coalesce(p_profile->>'first_name', ''))) not between 2 and 120
    or pg_catalog.char_length(coalesce(p_profile->>'last_name', '')) > 120
    or pg_catalog.char_length(coalesce(p_profile->>'phone', '')) > 40
    or pg_catalog.char_length(coalesce(p_profile->>'company', '')) > 120
    or pg_catalog.char_length(coalesce(p_profile->>'sector', '')) > 120
    or pg_catalog.char_length(coalesce(p_profile->>'city', '')) > 120 then
    raise exception 'Invalid profile' using errcode = '22023';
  end if;
  update upnology.customer_profiles set
    display_name = trim(p_profile->>'first_name'),
    last_name = nullif(trim(p_profile->>'last_name'), ''),
    phone = nullif(trim(p_profile->>'phone'), ''),
    company = nullif(trim(p_profile->>'company'), ''),
    sector = nullif(trim(p_profile->>'sector'), ''),
    city = nullif(trim(p_profile->>'city'), ''), updated_at = now()
  where user_id = auth.uid() returning * into v_profile;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  return to_jsonb(v_profile);
end;
$$;

revoke all on function upnology.sync_customer_identity() from public, anon, authenticated;
revoke all on function public.account_overview() from public, anon;
revoke all on function public.update_customer_profile(jsonb) from public, anon;
grant execute on function public.account_overview() to authenticated;
grant execute on function public.update_customer_profile(jsonb) to authenticated;
