-- Read-only preflight for the Supabase SQL editor / an authorized SQL connection.
-- Does not activate flags, run migrations, create accounts, or return customer data.
begin read only;
set local statement_timeout = '15s';
with required(signature, client_role) as (values
 ('public.admin_access()', 'authenticated'),
 ('public.admin_overview()', 'authenticated'),
 ('public.admin_workspace()', 'authenticated'),
 ('public.commercial_workspace_v2()', 'authenticated'),
 ('public.commercial_overview()', 'authenticated'),
 ('public.commercial_command(text,jsonb)', 'authenticated'),
 ('public.commercial_checkout(uuid)', 'authenticated'),
 ('public.customer_payment_attempt(uuid)', 'authenticated'),
 ('public.commercial_service(text,jsonb)', 'service_role')
), objects as (select *,to_regprocedure(signature) as oid from required)
select signature,oid is not null as installed,
 case when oid is not null then has_function_privilege(client_role,oid,'EXECUTE') else false end as intended_role_can_execute,
 case when oid is not null then not has_function_privilege('anon',oid,'EXECUTE') else false end as anonymous_blocked
from objects;

with required(name) as (values
 ('leads'),('quote_requests'),('customer_profiles'),('customer_leads'),('projects'),
 ('offers'),('contract_templates'),('contracts'),('milestones'),('payment_attempts'),
 ('project_releases'),('project_feedback'),('commercial_events'),('stripe_events'),
 ('email_outbox'),('business_settings'),('admin_members')
)
select r.name,c.oid is not null as installed,coalesce(c.relrowsecurity,false) as rls_enabled
from required r left join pg_class c on c.oid=to_regclass('upnology.'||r.name);

with required(table_name,column_name) as (values
 ('offers','request_id'),('offers','customer_user_id'),('offers','project_id'),
 ('contracts','offer_id'),('milestones','offer_id'),('milestones','project_id'),
 ('payment_attempts','milestone_id'),('payment_attempts','integration_version'),
 ('payment_attempts','checkout_revision'),('payment_attempts','stripe_livemode')
)
select r.*,exists(select 1 from information_schema.columns c where c.table_schema='upnology'
 and c.table_name=r.table_name and c.column_name=r.column_name) as installed from required r;
rollback;
