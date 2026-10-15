-- Adds Upnology AI to quote requests without changing existing records.
alter table upnology.quote_requests drop constraint if exists quote_requests_services_check;
alter table upnology.quote_requests add constraint quote_requests_services_check
  check (cardinality(services) between 1 and 8);

create or replace function public.submit_quote_request(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_request_id uuid;
  v_services text[];
  v_name text := trim(coalesce(p_payload->>'name', ''));
  v_email text := lower(trim(coalesce(p_payload->>'email', '')));
  v_company text := trim(coalesce(p_payload->>'company', ''));
  v_goal text := trim(coalesce(p_payload->>'goal', ''));
  v_description text := trim(coalesce(p_payload->>'activityDescription', ''));
  v_budget text := p_payload->>'budget';
  v_timeline text := p_payload->>'timeline';
begin
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.octet_length(p_payload::text) > 64000
    or coalesce(p_payload->>'website', '') <> '' then
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'services') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_payload->'services') not between 1 and 8 then
    raise exception 'Invalid services' using errcode = '22023';
  end if;
  select array_agg(value) into v_services from pg_catalog.jsonb_array_elements_text(p_payload->'services') as value;
  if exists (select 1 from unnest(v_services) as service where service not in ('website','ecommerce','marketing','automation','maintenance','integration','ai','other'))
    or pg_catalog.char_length(v_name) not between 2 and 120
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or pg_catalog.char_length(v_email) > 254
    or pg_catalog.char_length(v_company) not between 2 and 120
    or pg_catalog.char_length(trim(coalesce(p_payload->>'sector', ''))) < 2
    or pg_catalog.char_length(trim(coalesce(p_payload->>'city', ''))) < 2
    or pg_catalog.char_length(v_description) not between 10 and 1500
    or pg_catalog.char_length(v_goal) not between 10 and 2000
    or v_budget is null or v_budget not in ('under-500','500-1000','1000-2500','2500-5000','over-5000','discuss')
    or v_timeline is null or v_timeline not in ('urgent','one-month','one-to-three','flexible')
    or p_payload->>'preferredContact' is null
    or p_payload->>'preferredContact' not in ('email','phone','whatsapp') then
    raise exception 'Invalid request fields' using errcode = '22023';
  end if;
  if 'ai' = any(v_services) and (
    pg_catalog.char_length(trim(coalesce(p_payload->>'aiProcesses', ''))) not between 10 and 2000
    or pg_catalog.char_length(trim(coalesce(p_payload->>'aiChannels', ''))) not between 2 and 1000
    or pg_catalog.char_length(trim(coalesce(p_payload->>'aiTools', ''))) not between 2 and 1000
  ) then
    raise exception 'Invalid AI project context' using errcode = '22023';
  end if;
  if p_payload->>'preferredContact' = 'phone' and trim(coalesce(p_payload->>'phone', '')) = ''
    or p_payload->>'preferredContact' = 'whatsapp' and trim(coalesce(p_payload->>'whatsapp', p_payload->>'phone', '')) = '' then
    raise exception 'Missing contact number' using errcode = '22023';
  end if;

  insert into upnology.leads(auth_user_id, source, name, email, phone, whatsapp, company)
  values (auth.uid(), 'preventivo', v_name, v_email, nullif(trim(p_payload->>'phone'), ''), nullif(trim(p_payload->>'whatsapp'), ''), v_company)
  returning id into v_lead_id;
  insert into upnology.quote_requests(lead_id, services, budget, timeline, details)
  values (v_lead_id, v_services, v_budget, v_timeline, p_payload)
  returning id into v_request_id;
  insert into upnology.lead_events(lead_id, event_type) values (v_lead_id, 'created');
  return v_request_id;
end;
$$;

