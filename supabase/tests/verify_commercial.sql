-- Run in the existing project's SQL editor after the migration is reviewed and applied.
-- The two synthetic submissions are rolled back.
begin;

select
  to_regclass('upnology.leads') is not null as leads_exists,
  to_regclass('upnology.quote_requests') is not null as quotes_exists,
  to_regclass('upnology.contact_messages') is not null as contacts_exists,
  to_regclass('upnology.customer_profiles') is not null as profiles_exist,
  to_regclass('upnology.projects') is not null as projects_exist;

select c.relname, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'upnology' and c.relkind = 'r'
order by c.relname;

select
  has_function_privilege('anon', 'public.submit_quote_request(jsonb)', 'EXECUTE') as anon_can_submit_quote,
  has_function_privilege('anon', 'public.submit_contact_message(jsonb)', 'EXECUTE') as anon_can_submit_contact,
  has_table_privilege('anon', 'upnology.leads', 'SELECT') as anon_can_read_leads,
  has_table_privilege('anon', 'upnology.quote_requests', 'SELECT') as anon_can_read_quotes,
  has_table_privilege('anon', 'upnology.leads', 'INSERT') as anon_can_insert_leads_directly;

select conrelid::regclass as table_name, confrelid::regclass as references_table
from pg_constraint
where contype = 'f' and conrelid in ('upnology.customer_profiles'::regclass, 'upnology.customer_leads'::regclass)
order by conrelid::regclass::text;

select schemaname, tablename, policyname, roles, cmd
from pg_policies where schemaname = 'upnology'
order by tablename, policyname;

set local role anon;
select public.submit_quote_request('{
  "services":["website"],"company":"Verification Company","sector":"Services",
  "city":"Rome","activityDescription":"A verification-only business description.",
  "goal":"Verify that anonymous quotes are persisted transactionally.",
  "budget":"1000-2500","timeline":"one-to-three",
  "name":"Verification User","email":"verification@example.invalid",
  "preferredContact":"email","phone":"","whatsapp":"","website":""
}'::jsonb) as anonymous_quote_reference;
select public.submit_contact_message('{
  "name":"Verification User","email":"verification@example.invalid",
  "message":"Verification-only contact message.","website":""
}'::jsonb) as anonymous_contact_reference;
reset role;

select count(*) as leads_written_in_transaction
from upnology.leads where email = 'verification@example.invalid';
select count(*) as quotes_written_in_transaction
from upnology.quote_requests q join upnology.leads l on l.id = q.lead_id
where l.email = 'verification@example.invalid';

rollback;
