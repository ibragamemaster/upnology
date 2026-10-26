-- Additive, local preparation only. Existing commercial snapshots remain immutable.
begin;
create table if not exists upnology.business_settings (
 id boolean primary key default true check(id),
 company_name text not null default 'Upnology', address text not null default '', tax_id text not null default '',
 timeline text not null default '', payment_terms text not null default '',
 responsibilities text not null default '', delivery_terms text not null default '', exclusions text not null default '',
 updated_at timestamptz not null default now()
);
alter table upnology.business_settings enable row level security;
revoke all on upnology.business_settings from public, anon, authenticated;

create or replace function public.admin_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 if not upnology.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 v := public.admin_overview();
 return v || jsonb_build_object(
  'quotes',coalesce((select jsonb_agg(item || jsonb_build_object('details',q.details) order by n) from jsonb_array_elements(v->'quotes') with ordinality as entries(item,n) join upnology.quote_requests q on q.id=(item->>'id')::uuid),'[]'::jsonb),
  'commercial_counts', jsonb_build_object(
   'pending_quotes',(select count(*) from upnology.offers where status='INVIATO' and expires_at>now()),
   'pending_contracts',(select count(*) from upnology.contracts where accepted_at is null),
   'active_customers',(select count(distinct customer_user_id) from upnology.projects where status in ('in_lavorazione','in_revisione','attivo')),
   'working_projects',(select count(*) from upnology.projects where status='in_lavorazione'),
   'pending_cents',(select coalesce(sum(amount_cents),0) from upnology.milestones where status in ('RICHIESTO','IN_ATTESA','FALLITO')),
   'live_received_cents',(select coalesce(sum(a.amount_cents-m.refunded_cents),0) from upnology.payment_attempts a join upnology.milestones m on m.id=a.milestone_id where a.stripe_livemode=true and a.status in ('paid','refunded','partial_refund')),
   'test_received_cents',(select coalesce(sum(a.amount_cents-m.refunded_cents),0) from upnology.payment_attempts a join upnology.milestones m on m.id=a.milestone_id where a.stripe_livemode=false and a.status in ('paid','refunded','partial_refund')),
   'documents',(select count(*) from upnology.offers)+(select count(*) from upnology.contracts)
  ),
  'commercial_projects',coalesce((select jsonb_agg(jsonb_build_object('project_id',project_id,'offer_id',id)) from upnology.offers where project_id is not null),'[]'::jsonb),
  'settings',coalesce((select to_jsonb(s)-'id' from upnology.business_settings s where id),'{}'::jsonb),
  'admins',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email)) from upnology.admin_members a join auth.users u on u.id=a.user_id),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select id,actor_id,kind,detail,created_at from upnology.commercial_events where offer_id is null order by created_at desc limit 100) e),'[]'::jsonb),
  'lead_history',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from upnology.lead_events order by created_at desc limit 500) e),'[]'::jsonb)
 );
end $$;

create or replace function public.admin_workspace_command(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_before jsonb; v_after jsonb; v_text text; v_key text; v_attempt upnology.payment_attempts; v_milestone upnology.milestones; v_offer upnology.offers; v_event upnology.commercial_events;
begin
 if not upnology.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>40000 then raise exception 'Invalid data' using errcode='22023'; end if;
 if p_action='note' then
  v_id := (p_data->>'lead_id')::uuid; v_text:=btrim(p_data->>'note');
  if v_text is null or length(v_text) not between 2 and 5000 then raise exception 'Invalid note' using errcode='22023'; end if;
  perform 1 from upnology.leads where id=v_id for update;
  if not found then raise exception 'Lead unavailable' using errcode='22023'; end if;
  insert into upnology.lead_events(lead_id,event_type,note,actor_user_id) values(v_id,'internal_note',v_text,auth.uid());
 elsif p_action='refund_request' then
  if p_data->>'confirmed' is distinct from 'true' then raise exception 'Confirmation required' using errcode='22023'; end if;
  select * into v_attempt from upnology.payment_attempts where id=(p_data->>'attempt_id')::uuid;
  if not found then raise exception 'Payment unavailable' using errcode='22023'; end if;
  -- Same lock order as payment webhooks: milestone, then attempt.
  select * into v_milestone from upnology.milestones where id=v_attempt.milestone_id for update;
  select * into v_attempt from upnology.payment_attempts where id=v_attempt.id for update;
  select * into v_offer from upnology.offers where id=v_milestone.offer_id;
  select * into v_event from upnology.commercial_events where kind='refund_requested' and detail->>'attempt_id'=v_attempt.id::text;
  if found then return v_event.detail || jsonb_build_object('created_at',v_event.created_at); end if;
  if v_attempt.status not in ('paid','partial_refund') or v_attempt.integration_version<2 or v_attempt.stripe_livemode is null or v_attempt.payment_intent is null or v_attempt.session_id is null or v_milestone.refunded_cents>=v_attempt.amount_cents then raise exception 'Payment not refundable' using errcode='22023'; end if;
  v_after:=jsonb_build_object('attempt_id',v_attempt.id,'session_id',v_attempt.session_id,'payment_intent',v_attempt.payment_intent,'amount_cents',v_attempt.amount_cents-v_milestone.refunded_cents,'original_cents',v_attempt.amount_cents,'livemode',v_attempt.stripe_livemode,'offer_id',v_offer.id,'milestone_id',v_milestone.id,'project_id',v_offer.project_id,'customer_id',v_offer.customer_user_id);
  insert into upnology.commercial_events(offer_id,actor_id,kind,detail) values(v_offer.id,auth.uid(),'refund_requested',v_after) returning * into v_event;
  return v_after || jsonb_build_object('created_at',v_event.created_at);
 elsif p_action='customer' then
  v_id:=(p_data->>'user_id')::uuid;
  select to_jsonb(p) into v_before from upnology.customer_profiles p where user_id=v_id for update;
  if not found then raise exception 'Customer unavailable' using errcode='22023'; end if;
  foreach v_key in array array['display_name','last_name','phone','company','sector','city'] loop
   if jsonb_typeof(p_data->v_key) is distinct from 'string' or length(p_data->>v_key)>200 then raise exception 'Invalid customer data' using errcode='22023'; end if;
  end loop;
  update upnology.customer_profiles set display_name=btrim(p_data->>'display_name'),last_name=btrim(p_data->>'last_name'),phone=btrim(p_data->>'phone'),company=btrim(p_data->>'company'),sector=btrim(p_data->>'sector'),city=btrim(p_data->>'city'),updated_at=now() where user_id=v_id returning to_jsonb(customer_profiles) into v_after;
  insert into upnology.commercial_events(actor_id,kind,detail) values(auth.uid(),'customer_updated',jsonb_build_object('user_id',v_id,'before',v_before,'after',v_after));
 elsif p_action='settings' then
  foreach v_key in array array['company_name','address','tax_id','timeline','payment_terms','responsibilities','delivery_terms','exclusions'] loop
   if jsonb_typeof(p_data->v_key) is distinct from 'string' or length(p_data->>v_key)>5000 then raise exception 'Invalid settings' using errcode='22023'; end if;
  end loop;
  if length(btrim(p_data->>'company_name'))<2 then raise exception 'Company name required' using errcode='22023'; end if;
  insert into upnology.business_settings(id) values(true) on conflict do nothing;
  select to_jsonb(s) into v_before from upnology.business_settings s where id for update;
  update upnology.business_settings set company_name=btrim(p_data->>'company_name'),address=p_data->>'address',tax_id=p_data->>'tax_id',timeline=p_data->>'timeline',payment_terms=p_data->>'payment_terms',responsibilities=p_data->>'responsibilities',delivery_terms=p_data->>'delivery_terms',exclusions=p_data->>'exclusions',updated_at=now() where id returning to_jsonb(business_settings) into v_after;
  insert into upnology.commercial_events(actor_id,kind,detail) values(auth.uid(),'settings_updated',jsonb_build_object('before',v_before,'after',v_after));
 elsif p_action in ('grant_admin','revoke_admin') then
  if p_data->>'confirmed' is distinct from 'true' then raise exception 'Confirmation required' using errcode='22023'; end if;
  -- Serialize membership changes, and never allow self-revocation or the last admin to be lost.
  lock table upnology.admin_members in exclusive mode;
  if not upnology.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select id into v_id from auth.users where lower(email)=lower(btrim(p_data->>'email')) and email_confirmed_at is not null;
  if v_id is null then raise exception 'Verified account required' using errcode='22023'; end if;
  if p_action='revoke_admin' then
   if v_id=auth.uid() then raise exception 'Cannot revoke your own access' using errcode='22023'; end if;
   delete from upnology.admin_members where user_id=v_id;
  else insert into upnology.admin_members(user_id) values(v_id) on conflict do nothing;
  end if;
  insert into upnology.commercial_events(actor_id,kind,detail) values(auth.uid(),p_action,jsonb_build_object('user_id',v_id));
 else raise exception 'Unknown action' using errcode='22023';
 end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.admin_workspace(),public.admin_workspace_command(text,jsonb) from public,anon;
grant execute on function public.admin_workspace(),public.admin_workspace_command(text,jsonb) to authenticated;
commit;
