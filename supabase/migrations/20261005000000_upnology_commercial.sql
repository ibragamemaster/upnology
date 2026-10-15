-- Review against the existing Upnology Supabase schema before applying.
-- The browser calls only the two public RPC functions. Data tables stay in a private schema.
create schema if not exists upnology;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'upnology' and t.typname = 'lead_status'
  ) then
    create type upnology.lead_status as enum (
      'nuovo', 'da_contattare', 'contattato', 'preventivo_inviato',
      'trattativa', 'accettato', 'rifiutato', 'chiuso'
    );
  end if;
end $$;

create table if not exists upnology.leads (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('preventivo', 'contatto')),
  status upnology.lead_status not null default 'nuovo',
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 254),
  phone text,
  whatsapp text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_created_idx on upnology.leads(status, created_at desc);
create index if not exists leads_email_idx on upnology.leads(lower(email));
create index if not exists leads_auth_user_idx on upnology.leads(auth_user_id);

create table if not exists upnology.quote_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references upnology.leads(id) on delete cascade,
  services text[] not null check (cardinality(services) between 1 and 7),
  budget text not null check (budget in ('under-500','500-1000','1000-2500','2500-5000','over-5000','discuss')),
  timeline text not null check (timeline in ('urgent','one-month','one-to-three','flexible')),
  details jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists quote_requests_lead_idx on upnology.quote_requests(lead_id);

create table if not exists upnology.contact_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references upnology.leads(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 3000),
  created_at timestamptz not null default now()
);

create table if not exists upnology.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A future verified claim flow can link pre-account leads to a customer.
-- Never link a lead by email match alone.
create table if not exists upnology.customer_leads (
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references upnology.leads(id) on delete cascade,
  verified_at timestamptz not null default now(),
  primary key (user_id, lead_id)
);

create table if not exists upnology.projects (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references upnology.leads(id) on delete set null,
  customer_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null default 'pianificato' check (status in ('pianificato','attivo','in_revisione','completato','archiviato')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists upnology.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references upnology.leads(id) on delete cascade,
  event_type text not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists upnology.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table upnology.leads enable row level security;
alter table upnology.quote_requests enable row level security;
alter table upnology.contact_messages enable row level security;
alter table upnology.customer_profiles enable row level security;
alter table upnology.customer_leads enable row level security;
alter table upnology.projects enable row level security;
alter table upnology.lead_events enable row level security;
alter table upnology.admin_members enable row level security;

-- Initial hardening only: replaying this migration must not revoke grants added later.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='customer_profiles' and policyname='customer_profiles_select_own') then
    revoke all on schema upnology from public, anon, authenticated;
    revoke all on all tables in schema upnology from public, anon, authenticated;
    revoke all on all sequences in schema upnology from public, anon, authenticated;
  end if;
end $$;
grant usage on schema upnology to service_role;
grant all on all tables in schema upnology to service_role;
grant all on all sequences in schema upnology to service_role;
grant usage on schema upnology to authenticated;
grant select on upnology.customer_profiles to authenticated;
grant update (display_name, company) on upnology.customer_profiles to authenticated;
grant select on upnology.customer_leads to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='customer_profiles' and policyname='customer_profiles_select_own') then
    create policy customer_profiles_select_own on upnology.customer_profiles
    for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='customer_profiles' and policyname='customer_profiles_update_own') then
    create policy customer_profiles_update_own on upnology.customer_profiles
    for update to authenticated using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='upnology' and tablename='customer_leads' and policyname='customer_leads_select_own') then
    create policy customer_leads_select_own on upnology.customer_leads
    for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

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
    or pg_catalog.jsonb_array_length(p_payload->'services') not between 1 and 7 then
    raise exception 'Invalid services' using errcode = '22023';
  end if;
  select array_agg(value) into v_services from pg_catalog.jsonb_array_elements_text(p_payload->'services') as value;
  if exists (select 1 from unnest(v_services) as service where service not in ('website','ecommerce','marketing','automation','maintenance','integration','other'))
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

create or replace function public.submit_contact_message(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_message_id uuid;
  v_name text := trim(coalesce(p_payload->>'name', ''));
  v_email text := lower(trim(coalesce(p_payload->>'email', '')));
  v_message text := trim(coalesce(p_payload->>'message', ''));
begin
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.octet_length(p_payload::text) > 8000
    or coalesce(p_payload->>'website', '') <> ''
    or pg_catalog.char_length(v_name) not between 2 and 120
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or pg_catalog.char_length(v_email) > 254
    or pg_catalog.char_length(v_message) not between 10 and 3000 then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  insert into upnology.leads(auth_user_id, source, name, email)
  values (auth.uid(), 'contatto', v_name, v_email) returning id into v_lead_id;
  insert into upnology.contact_messages(lead_id, message)
  values (v_lead_id, v_message) returning id into v_message_id;
  insert into upnology.lead_events(lead_id, event_type) values (v_lead_id, 'created');
  return v_message_id;
end;
$$;

revoke all on function public.submit_quote_request(jsonb) from public;
revoke all on function public.submit_contact_message(jsonb) from public;
grant execute on function public.submit_quote_request(jsonb) to anon, authenticated;
grant execute on function public.submit_contact_message(jsonb) to anon, authenticated;
