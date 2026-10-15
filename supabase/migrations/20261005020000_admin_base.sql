-- Admin membership is assigned only by a privileged database operator.
alter table upnology.projects
  add column if not exists service text,
  add column if not exists description text,
  add column if not exists start_date date,
  add column if not exists due_date date,
  add column if not exists internal_notes text;

alter table upnology.projects drop constraint if exists projects_status_check;
alter table upnology.projects add constraint projects_status_check
  check (status in ('pianificato','in_lavorazione','in_revisione','completato','sospeso','attivo','archiviato'));

create or replace function upnology.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from upnology.admin_members a where a.user_id = auth.uid()
  );
$$;
revoke all on function upnology.is_admin() from public, anon;
grant execute on function upnology.is_admin() to authenticated;

grant select on upnology.contact_messages, upnology.lead_events to authenticated;
grant update (status, updated_at) on upnology.leads to authenticated;
grant insert, update on upnology.projects to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='admin_members' and policyname='admin_members_select_self') then
    create policy admin_members_select_self on upnology.admin_members
    for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='leads' and policyname='leads_admin_select') then
    create policy leads_admin_select on upnology.leads
    for select to authenticated using ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='leads' and policyname='leads_admin_update') then
    create policy leads_admin_update on upnology.leads
    for update to authenticated using ((select upnology.is_admin())) with check ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='quote_requests' and policyname='quotes_admin_select') then
    create policy quotes_admin_select on upnology.quote_requests
    for select to authenticated using ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='contact_messages' and policyname='contacts_admin_select') then
    create policy contacts_admin_select on upnology.contact_messages
    for select to authenticated using ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='customer_profiles' and policyname='profiles_admin_select') then
    create policy profiles_admin_select on upnology.customer_profiles
    for select to authenticated using ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='customer_leads' and policyname='claims_admin_select') then
    create policy claims_admin_select on upnology.customer_leads
    for select to authenticated using ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='projects' and policyname='projects_admin_select') then
    create policy projects_admin_select on upnology.projects
    for select to authenticated using ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='projects' and policyname='projects_admin_insert') then
    create policy projects_admin_insert on upnology.projects
    for insert to authenticated with check ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='projects' and policyname='projects_admin_update') then
    create policy projects_admin_update on upnology.projects
    for update to authenticated using ((select upnology.is_admin())) with check ((select upnology.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='lead_events' and policyname='events_admin_select') then
    create policy events_admin_select on upnology.lead_events
    for select to authenticated using ((select upnology.is_admin()));
  end if;
end $$;

create or replace function public.admin_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select upnology.is_admin();
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not upnology.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select pg_catalog.jsonb_build_object(
    'counts', pg_catalog.jsonb_build_object(
      'new_leads', (select count(*) from upnology.leads where status = 'nuovo'),
      'quotes', (select count(*) from upnology.quote_requests),
      'contacts', (select count(*) from upnology.contact_messages),
      'customers', (select count(*) from upnology.customer_profiles),
      'projects', (select count(*) from upnology.projects)
    ),
    'quotes', coalesce((select pg_catalog.jsonb_agg(row_data order by created_at desc) from (
      select q.created_at, pg_catalog.jsonb_build_object(
        'id', q.id, 'lead_id', l.id, 'name', l.name, 'email', l.email,
        'phone', l.phone, 'company', l.company, 'services', q.services,
        'budget', q.budget, 'timeline', q.timeline, 'created_at', q.created_at,
        'status', l.status, 'customer_user_id', coalesce(l.auth_user_id,
          (select cl.user_id from upnology.customer_leads cl where cl.lead_id = l.id order by cl.verified_at limit 1))
      ) row_data from upnology.quote_requests q join upnology.leads l on l.id = q.lead_id
      order by q.created_at desc limit 100
    ) recent_quotes), '[]'::jsonb),
    'contacts', coalesce((select pg_catalog.jsonb_agg(row_data order by created_at desc) from (
      select c.created_at, pg_catalog.jsonb_build_object(
        'id', c.id, 'lead_id', l.id, 'name', l.name, 'email', l.email,
        'phone', l.phone, 'company', l.company, 'message', c.message,
        'created_at', c.created_at, 'status', l.status
      ) row_data from upnology.contact_messages c join upnology.leads l on l.id = c.lead_id
      order by c.created_at desc limit 100
    ) recent_contacts), '[]'::jsonb),
    'customers', coalesce((select pg_catalog.jsonb_agg(row_data order by created_at desc) from (
      select p.created_at, pg_catalog.jsonb_build_object(
        'user_id', p.user_id, 'first_name', p.display_name, 'last_name', p.last_name,
        'email', u.email, 'phone', p.phone, 'company', p.company,
        'sector', p.sector, 'city', p.city, 'created_at', p.created_at,
        'quotes', (select count(*) from upnology.quote_requests q join upnology.leads l on l.id = q.lead_id
          where l.auth_user_id = p.user_id or exists (
            select 1 from upnology.customer_leads cl where cl.lead_id = l.id and cl.user_id = p.user_id
          )),
        'projects', (select count(*) from upnology.projects pr where pr.customer_user_id = p.user_id)
      ) row_data from upnology.customer_profiles p join auth.users u on u.id = p.user_id
      order by p.created_at desc limit 100
    ) recent_customers), '[]'::jsonb),
    'projects', coalesce((select pg_catalog.jsonb_agg(row_data order by updated_at desc) from (
      select p.updated_at, pg_catalog.jsonb_build_object(
        'id', p.id, 'title', p.title, 'customer_user_id', p.customer_user_id,
        'customer_name', trim(concat_ws(' ', cp.display_name, cp.last_name)),
        'customer_email', u.email, 'status', p.status, 'service', p.service,
        'description', p.description, 'start_date', p.start_date,
        'due_date', p.due_date, 'internal_notes', p.internal_notes,
        'created_at', p.created_at, 'updated_at', p.updated_at
      ) row_data from upnology.projects p
      left join upnology.customer_profiles cp on cp.user_id = p.customer_user_id
      left join auth.users u on u.id = p.customer_user_id
      order by p.updated_at desc limit 100
    ) recent_projects), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_set_lead_status(p_lead_id uuid, p_status text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_old upnology.lead_status;
begin
  if not upnology.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('nuovo','da_contattare','contattato','preventivo_inviato','trattativa','accettato','rifiutato','chiuso') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  select status into v_old from upnology.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if v_old::text <> p_status then
    update upnology.leads set status = p_status::upnology.lead_status, updated_at = now() where id = p_lead_id;
    insert into upnology.lead_events(lead_id, event_type, note, actor_user_id)
    values (p_lead_id, 'status_changed', v_old::text || ' -> ' || p_status, auth.uid());
  end if;
  return p_status;
end;
$$;

create or replace function public.admin_save_project(p_project jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_customer uuid;
  v_title text := trim(coalesce(p_project->>'title',''));
  v_status text := coalesce(p_project->>'status','pianificato');
  v_service text := trim(coalesce(p_project->>'service',''));
  v_description text := trim(coalesce(p_project->>'description',''));
  v_notes text := trim(coalesce(p_project->>'internal_notes',''));
  v_start date;
  v_due date;
begin
  if not upnology.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_project) is distinct from 'object' or pg_catalog.octet_length(p_project::text) > 12000
    or pg_catalog.char_length(v_title) not between 2 and 160
    or pg_catalog.char_length(v_service) not between 2 and 120
    or pg_catalog.char_length(v_description) > 3000 or pg_catalog.char_length(v_notes) > 5000
    or v_status not in ('pianificato','in_lavorazione','in_revisione','completato','sospeso','attivo','archiviato')
    or nullif(p_project->>'customer_user_id','') is null then
    raise exception 'Invalid project' using errcode = '22023';
  end if;
  v_customer := (p_project->>'customer_user_id')::uuid;
  if not exists (select 1 from upnology.customer_profiles where user_id = v_customer) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  v_start := nullif(p_project->>'start_date','')::date;
  v_due := nullif(p_project->>'due_date','')::date;
  if v_start is not null and v_due is not null and v_due < v_start then
    raise exception 'Due date precedes start date' using errcode = '22023';
  end if;
  if nullif(p_project->>'id','') is null then
    insert into upnology.projects(customer_user_id, title, status, service, description, start_date, due_date, internal_notes)
    values (v_customer, v_title, v_status, v_service, nullif(v_description,''), v_start, v_due, nullif(v_notes,''))
    returning id into v_id;
  else
    v_id := (p_project->>'id')::uuid;
    update upnology.projects set customer_user_id = v_customer, title = v_title, status = v_status,
      service = v_service, description = nullif(v_description,''), start_date = v_start,
      due_date = v_due, internal_notes = nullif(v_notes,''), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_access() from public, anon;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_set_lead_status(uuid,text) from public, anon;
revoke all on function public.admin_save_project(jsonb) from public, anon;
grant execute on function public.admin_access() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_set_lead_status(uuid,text) to authenticated;
grant execute on function public.admin_save_project(jsonb) to authenticated;
