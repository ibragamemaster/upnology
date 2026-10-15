begin;
select set_config('app.test_a', gen_random_uuid()::text, true), set_config('app.test_b', gen_random_uuid()::text, true);
insert into upnology.leads(id, source, name, email, company)
values (gen_random_uuid(), 'preventivo', 'Cliente A', 'auth-rls-a@example.invalid', 'Test A'),
       (gen_random_uuid(), 'preventivo', 'Cliente B', 'auth-rls-b@example.invalid', 'Test B');
insert into upnology.quote_requests(lead_id, services, budget, timeline, details)
select id, array['website'], '1000-2500', 'flexible', '{}'::jsonb
from upnology.leads where email in ('auth-rls-a@example.invalid','auth-rls-b@example.invalid');
insert into auth.users(id, email, email_confirmed_at, aud, role)
values (current_setting('app.test_a')::uuid, 'auth-rls-a@example.invalid', now(), 'authenticated', 'authenticated'),
       (current_setting('app.test_b')::uuid, 'auth-rls-b@example.invalid', now(), 'authenticated', 'authenticated');
insert into upnology.projects(customer_user_id, title)
values (current_setting('app.test_a')::uuid, 'Progetto A'),
       (current_setting('app.test_b')::uuid, 'Progetto B');
set local role authenticated;
do $$
declare n integer; actor text;
begin
  foreach actor in array array['app.test_a','app.test_b'] loop
    perform set_config('request.jwt.claim.sub', current_setting(actor), true);
    select count(*) into n from upnology.customer_profiles; if n <> 1 then raise exception 'Profile isolation failed for %', actor; end if;
    select count(*) into n from upnology.leads; if n <> 1 then raise exception 'Lead isolation failed for %', actor; end if;
    select count(*) into n from upnology.quote_requests; if n <> 1 then raise exception 'Quote isolation failed for %', actor; end if;
    select count(*) into n from upnology.projects; if n <> 1 then raise exception 'Project isolation failed for %', actor; end if;
    select count(*) into n from upnology.customer_leads; if n <> 1 then raise exception 'Claim isolation failed for %', actor; end if;
    if jsonb_array_length(public.account_overview()->'requests') <> 1 then raise exception 'Overview isolation failed for %', actor; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', current_setting('app.test_a'), true);
  perform public.update_customer_profile('{"first_name":"Cliente A","last_name":"Verifica","phone":"","company":"","sector":"","city":""}'::jsonb);
  update upnology.customer_profiles set display_name = 'BAD' where user_id = current_setting('app.test_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-account update allowed'; end if;
end $$;
rollback;
select 'PASS: profiles, leads, quotes, projects, claim, overview, profile update isolated; transaction rolled back' as result;
