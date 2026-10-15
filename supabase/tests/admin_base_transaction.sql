-- Run against the linked project. All test users and records are rolled back.
begin;
select set_config('app.test_admin', gen_random_uuid()::text, true),
       set_config('app.test_customer', gen_random_uuid()::text, true);
insert into auth.users(id,email,email_confirmed_at,aud,role)
values (current_setting('app.test_admin')::uuid,'admin-rls-test@example.invalid',now(),'authenticated','authenticated'),
       (current_setting('app.test_customer')::uuid,'customer-rls-test@example.invalid',now(),'authenticated','authenticated');
insert into upnology.admin_members(user_id) values (current_setting('app.test_admin')::uuid);
insert into upnology.leads(id,auth_user_id,source,name,email,company)
values (gen_random_uuid(),current_setting('app.test_customer')::uuid,'preventivo','Cliente Verifica','customer-rls-test@example.invalid','Azienda Test'),
       (gen_random_uuid(),null,'contatto','Contatto Verifica','contact-rls-test@example.invalid','Azienda Test');
insert into upnology.quote_requests(lead_id,services,budget,timeline,details)
select id,array['website'],'1000-2500','flexible','{}'::jsonb from upnology.leads where email='customer-rls-test@example.invalid';
insert into upnology.contact_messages(lead_id,message)
select id,'Messaggio di prova amministratore.' from upnology.leads where email='contact-rls-test@example.invalid';
insert into upnology.projects(customer_user_id,title,status,service)
values (current_setting('app.test_customer')::uuid,'Progetto verifica','pianificato','website');

set local role authenticated;
do $$
declare
  v_overview jsonb;
  v_id uuid;
  v_lead uuid;
  n integer;
begin
  perform set_config('request.jwt.claim.sub',current_setting('app.test_admin'),true);
  if not public.admin_access() then raise exception 'Admin membership denied'; end if;
  v_overview := public.admin_overview();
  if not exists (select 1 from jsonb_array_elements(v_overview->'quotes') q where q->>'email'='customer-rls-test@example.invalid')
    or not exists (select 1 from jsonb_array_elements(v_overview->'contacts') c where c->>'email'='contact-rls-test@example.invalid')
    or not exists (select 1 from jsonb_array_elements(v_overview->'customers') c where c->>'email'='customer-rls-test@example.invalid')
    or not exists (select 1 from jsonb_array_elements(v_overview->'projects') p where p->>'title'='Progetto verifica') then
    raise exception 'Admin overview missing test records';
  end if;
  select id into v_lead from upnology.leads where email='customer-rls-test@example.invalid';
  if public.admin_set_lead_status(v_lead,'trattativa') <> 'trattativa' then raise exception 'Lead status not updated'; end if;
  select count(*) into n from upnology.lead_events where lead_id=v_lead and event_type='status_changed';
  if n <> 1 then raise exception 'Lead status event missing'; end if;
  v_id := public.admin_save_project(jsonb_build_object(
    'title','Nuovo progetto verifica','customer_user_id',current_setting('app.test_customer'),
    'status','in_lavorazione','service','ecommerce','description','Descrizione di prova',
    'start_date','2026-10-05','due_date','2026-11-05','internal_notes','Nota interna di prova'
  ));
  -- Internal notes are intentionally not selectable through the client table grant.
  select count(*) into n from jsonb_array_elements(public.admin_overview()->'projects') p
  where p->>'id'=v_id::text and p->>'status'='in_lavorazione' and p->>'internal_notes'='Nota interna di prova';
  if n <> 1 then raise exception 'Project save failed'; end if;

  perform set_config('request.jwt.claim.sub',current_setting('app.test_customer'),true);
  if public.admin_access() then raise exception 'Customer became admin'; end if;
  begin
    perform public.admin_overview();
    raise exception 'Customer read admin overview';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_lead_status(v_lead,'chiuso');
    raise exception 'Customer changed lead status';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_project(jsonb_build_object('title','Abuso','customer_user_id',current_setting('app.test_customer'),'service','website'));
    raise exception 'Customer created project';
  exception when insufficient_privilege then null; end;
  select count(*) into n from upnology.leads where email='contact-rls-test@example.invalid';
  if n <> 0 then raise exception 'Customer read another lead'; end if;
  select count(*) into n from upnology.contact_messages;
  if n <> 0 then raise exception 'Customer read contacts'; end if;
  if jsonb_array_length(public.account_overview()->'requests') <> 1
    or jsonb_array_length(public.account_overview()->'projects') <> 2 then
    raise exception 'Customer account data incorrect';
  end if;
end $$;
rollback;
select 'PASS: admin access, dashboard, status, projects, customer isolation; transaction rolled back' as result;
