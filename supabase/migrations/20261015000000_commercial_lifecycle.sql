-- Additive commercial lifecycle. No production credentials or legal text seeded.
create table upnology.contract_templates (
 id uuid primary key default gen_random_uuid(), title text not null,
 body text not null check (length(body) between 20 and 30000),
 approved_at timestamptz, approved_by uuid references auth.users(id),
 legal_reference text, created_at timestamptz not null default now(),
 check ((approved_at is null and approved_by is null) or (approved_at is not null and approved_by is not null and length(legal_reference)>5))
);
create table upnology.offers (
 id uuid primary key default gen_random_uuid(), customer_user_id uuid not null references auth.users(id),
 request_id uuid references upnology.quote_requests(id), previous_id uuid references upnology.offers(id),
 version integer not null default 1, status text not null default 'BOZZA' check(status in ('BOZZA','INVIATO','ACCETTATO','RIFIUTATO','SCADUTO')),
 snapshot jsonb not null, total_cents bigint not null check(total_cents between 100 and 99999999),
 expires_at timestamptz not null, template_id uuid not null references upnology.contract_templates(id),
 project_id uuid unique references upnology.projects(id), accepted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index offers_customer_idx on upnology.offers(customer_user_id,created_at desc);
create table upnology.contracts (
 id uuid primary key default gen_random_uuid(), offer_id uuid not null unique references upnology.offers(id),
 snapshot jsonb not null, body text not null, snapshot_hash text not null,
 accepted_at timestamptz, accepted_by uuid references auth.users(id),
 acceptance_text text, created_at timestamptz not null default now()
);
create table upnology.milestones (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references upnology.projects(id),
 offer_id uuid not null references upnology.offers(id), phase integer not null check(phase between 1 and 3),
 amount_cents bigint not null check(amount_cents>0),
 status text not null default 'BLOCCATO' check(status in ('BLOCCATO','RICHIESTO','IN_ATTESA','PAGATO','FALLITO','RIMBORSATO','RIMBORSO_PARZIALE')),
 due_at timestamptz, approved_at timestamptz, paid_at timestamptz,
 refunded_cents bigint not null default 0, unique(project_id,phase),
 check(refunded_cents between 0 and amount_cents)
);
create table upnology.payment_attempts (
 id uuid primary key default gen_random_uuid(), milestone_id uuid not null references upnology.milestones(id),
 session_id text unique, payment_intent text unique, checkout_url text,
 status text not null default 'creating' check(status in ('creating','open','pending','paid','failed','expired','refunded','partial_refund')),
 amount_cents bigint not null, expires_at timestamptz not null default (now()+interval '1 hour'),
 created_at timestamptz not null default now()
);
create unique index payment_one_active on upnology.payment_attempts(milestone_id) where status in ('creating','open','pending');
create table upnology.project_releases (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references upnology.projects(id),
 phase integer not null check(phase in (2,3)), url text not null, notes text not null,
 protection_note text not null, created_at timestamptz not null default now(),
 approved_at timestamptz, approved_by uuid references auth.users(id)
);
create table upnology.project_feedback (
 id uuid primary key default gen_random_uuid(), release_id uuid not null references upnology.project_releases(id),
 author_id uuid not null references auth.users(id), body text not null check(length(body) between 1 and 5000),
 resolution text, resolved_at timestamptz, created_at timestamptz not null default now()
);
create table upnology.commercial_events (
 id bigint generated always as identity primary key, offer_id uuid references upnology.offers(id),
 actor_id uuid references auth.users(id), kind text not null, detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table upnology.email_outbox (
 id uuid primary key default gen_random_uuid(), offer_id uuid not null references upnology.offers(id),
 kind text not null, dedupe_key text not null unique, recipient text not null, payload jsonb not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','retry','review')),
 attempts integer not null default 0, first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, provider_id text, last_error text, sent_at timestamptz,
 created_at timestamptz not null default now()
);
create index email_due_idx on upnology.email_outbox(status,next_attempt_at);
create table upnology.stripe_events (id text primary key, type text not null, created_at timestamptz not null default now());
alter table upnology.projects add column commercial_stage text,
 add column delivery_url text, add column delivered_at timestamptz;
-- Existing table-wide SELECT would expose staged delivery URLs and internal notes.
-- Keep the legacy account RPC working with an explicit safe column grant.
revoke select on upnology.projects from authenticated;
grant select (id,lead_id,customer_user_id,title,status,created_at,updated_at,service,description,start_date,due_date,commercial_stage,delivered_at)
 on upnology.projects to authenticated;

-- Tables are private: all reads/writes use constrained functions below.
do $$ declare n text; begin
 foreach n in array array['contract_templates','offers','contracts','milestones','payment_attempts','project_releases','project_feedback','commercial_events','email_outbox','stripe_events'] loop
 execute format('alter table upnology.%I enable row level security',n);
 execute format('revoke all on upnology.%I from public,anon,authenticated',n);
 end loop;
end $$;

create function upnology.commercial_event(p_offer uuid,p_kind text,p_detail jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into upnology.commercial_events(offer_id,actor_id,kind,detail) values(p_offer,auth.uid(),p_kind,p_detail);
$$;
create function upnology.queue_email(p_offer uuid,p_kind text,p_key text,p_extra jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into upnology.email_outbox(offer_id,kind,dedupe_key,recipient,payload)
 select id,p_kind,p_key,snapshot->'customer'->>'email',
 jsonb_build_object('name',snapshot->'customer'->>'name','title',snapshot->>'title','offer_id',id,'total_cents',total_cents)||p_extra
 from upnology.offers where id=p_offer on conflict(dedupe_key) do nothing;
$$;

create function upnology.immutable_commercial() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='offers' then
  if old.status<>'BOZZA' and (new.snapshot is distinct from old.snapshot or new.customer_user_id<>old.customer_user_id
   or new.template_id<>old.template_id or new.total_cents<>old.total_cents or new.expires_at<>old.expires_at
   or new.previous_id is distinct from old.previous_id or new.version<>old.version or new.request_id is distinct from old.request_id)
  then raise exception 'Issued offer is immutable'; end if;
  if old.status in ('ACCETTATO','RIFIUTATO','SCADUTO') and new.status<>old.status then raise exception 'Terminal offer'; end if;
 elsif tg_table_name='contracts' then
  if new.snapshot is distinct from old.snapshot or new.body<>old.body or new.offer_id<>old.offer_id or new.snapshot_hash<>old.snapshot_hash
   or (old.accepted_at is not null and new is distinct from old) then raise exception 'Contract is immutable'; end if;
 elsif tg_table_name='contract_templates' and old.approved_at is not null then
  raise exception 'Approved template is immutable; create a new version';
 end if;
 return new;
end $$;
create trigger offers_immutable before update on upnology.offers for each row execute function upnology.immutable_commercial();
create trigger contracts_immutable before update on upnology.contracts for each row execute function upnology.immutable_commercial();
create trigger templates_immutable before update on upnology.contract_templates for each row execute function upnology.immutable_commercial();

-- Legacy admin editor cannot bypass the paid workflow or change its owner.
create function upnology.guard_commercial_project() returns trigger language plpgsql set search_path='' as $$
begin
 if (old.commercial_stage is not null or (tg_op<>'DELETE' and new.commercial_stage is not null)) and current_setting('upnology.commercial_write',true) is distinct from 'on' then
  raise exception 'Use the commercial workflow for this project';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger commercial_project_guard before update or delete on upnology.projects for each row execute function upnology.guard_commercial_project();

create function public.commercial_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare a boolean:=upnology.is_admin(); result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object(
 'templates',case when a then (select coalesce(jsonb_agg(to_jsonb(t) order by created_at desc),'[]') from upnology.contract_templates t) else '[]'::jsonb end,
 'offers',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
   'status',case when o.status='INVIATO' and o.expires_at<=now() then 'SCADUTO' else o.status end,
   'contract',(select to_jsonb(c) from upnology.contracts c where c.offer_id=o.id),
   'project',(select jsonb_build_object('id',p.id,'status',p.status,'commercial_stage',p.commercial_stage,'delivered_at',p.delivered_at) from upnology.projects p where p.id=o.project_id),
   'milestones',(select coalesce(jsonb_agg(to_jsonb(m) order by phase),'[]') from upnology.milestones m where m.offer_id=o.id),
   'payments',(select coalesce(jsonb_agg(to_jsonb(x)-'checkout_url' order by x.created_at),'[]') from upnology.payment_attempts x join upnology.milestones m on m.id=x.milestone_id where m.offer_id=o.id),
   'releases',(select coalesce(jsonb_agg((to_jsonb(r)-'url')||jsonb_build_object('feedback',
     (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at),'[]') from upnology.project_feedback f where f.release_id=r.id)) order by r.created_at desc),'[]') from upnology.project_releases r where r.project_id=o.project_id),
   'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from upnology.commercial_events e where e.offer_id=o.id),
   'emails',case when a then (select coalesce(jsonb_agg(to_jsonb(e)-'payload'-'lease_id' order by e.created_at),'[]') from upnology.email_outbox e where e.offer_id=o.id) else '[]'::jsonb end
 ) order by o.created_at desc) from upnology.offers o where a or (o.customer_user_id=auth.uid() and o.status<>'BOZZA')),'[]')) into result;
 return result;
end $$;

create function public.commercial_command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a boolean:=upnology.is_admin(); o upnology.offers; c upnology.contracts; t upnology.contract_templates;
 m upnology.milestones; r upnology.project_releases; s jsonb; item jsonb; items jsonb:='[]';
 ident uuid; customer uuid; subtotal bigint:=0; tax bigint; total bigint; basis integer; amount bigint;
 parts integer[]; days integer[]; amounts bigint[]; i integer; customer_email text; ref uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>70000 then raise exception 'Invalid command'; end if;
 perform set_config('upnology.commercial_write','on',true);
 if p_action in ('template','approve_template','save','version','send','release','resolve_feedback','update','prepare_delivery','delivery','request_payment') and not a then
  raise exception 'Admin access required' using errcode='42501';
 end if;
 if p_action='template' then
  insert into upnology.contract_templates(title,body) values(left(p_data->>'title',160),p_data->>'body') returning id into ident;
  return jsonb_build_object('id',ident);
 elsif p_action='approve_template' then
  if coalesce(length(trim(p_data->>'legal_reference')),0)<6 or p_data->>'confirmed' is distinct from 'true' then raise exception 'Legal approval reference required'; end if;
  update upnology.contract_templates set approved_at=now(),approved_by=auth.uid(),legal_reference=p_data->>'legal_reference' where id=(p_data->>'id')::uuid and approved_at is null;
  if not found then raise exception 'Template unavailable'; end if;
  return '{}';
 elsif p_action='save' then
  customer:=(p_data->>'customer_user_id')::uuid;
  select email into customer_email from auth.users where id=customer and email_confirmed_at is not null;
  if customer_email is null then raise exception 'Verified customer required'; end if;
  select * into t from upnology.contract_templates where id=(p_data->>'template_id')::uuid;
  if not found then raise exception 'Template required'; end if;
  s:=p_data->'snapshot';
  if s is null or jsonb_typeof(s)<>'object' or jsonb_typeof(s->'items') is distinct from 'array' then raise exception 'Invalid quote'; end if;
  if jsonb_array_length(s->'items') not between 1 and 40 then raise exception 'Invalid services'; end if;
  foreach customer_email in array array['title','description','timeline','payment_terms','responsibilities','delivery_terms','exclusions','tax_label'] loop
   if coalesce(length(trim(s->>customer_email)),0) not between 2 and 5000 then raise exception 'Missing field: %',customer_email; end if;
  end loop;
  if coalesce(length(trim(s->'customer'->>'name')),0)<2 or coalesce(length(trim(s->'customer'->>'address')),0)<5
   or coalesce(length(trim(s->'customer'->>'tax_id')),0)<5 or coalesce(length(trim(s->'supplier'->>'name')),0)<2
   or coalesce(length(trim(s->'supplier'->>'address')),0)<5 or coalesce(length(trim(s->'supplier'->>'tax_id')),0)<5 then raise exception 'Billing details required'; end if;
  if coalesce((s->>'revisions')::numeric,-1) not between 0 and 100 or (s->>'revisions')::numeric<>trunc((s->>'revisions')::numeric) then raise exception 'Invalid revisions'; end if;
  basis:=(s->>'tax_bps')::integer;
  if basis is null or basis not between 0 and 10000 then raise exception 'Invalid tax'; end if;
  for item in select value from jsonb_array_elements(s->'items') loop
   if coalesce(length(trim(item->>'description')),0) not between 2 and 1000 or coalesce((item->>'amount_cents')::numeric,-1) not between 1 and 99999999
    or (item->>'amount_cents')::numeric<>trunc((item->>'amount_cents')::numeric) then raise exception 'Invalid line amount'; end if;
   amount:=(item->>'amount_cents')::bigint; subtotal:=subtotal+amount;
   items:=items||jsonb_build_array(jsonb_build_object('description',item->>'description','amount_cents',amount));
  end loop;
  tax:=floor((subtotal*basis+5000)/10000.0); total:=subtotal+tax;
  select array_agg(value::integer) into parts from jsonb_array_elements_text(s->'percentages');
  if coalesce(array_length(parts,1),0)<>3 or array_position(parts,null) is not null or parts[1]<1 or parts[2]<1 or parts[3]<1 or parts[1]+parts[2]+parts[3]<>100 then raise exception 'Three percentages must total 100'; end if;
  select array_agg(value::integer) into days from jsonb_array_elements_text(coalesce(s->'payment_due_days','[7,7,7]'::jsonb));
  if coalesce(array_length(days,1),0)<>3 or array_position(days,null) is not null or least(days[1],days[2],days[3])<1 or greatest(days[1],days[2],days[3])>365 then raise exception 'Invalid payment deadlines'; end if;
  amounts:=array[floor(total*parts[1]/100.0)::bigint,floor(total*parts[2]/100.0)::bigint,0::bigint]; amounts[3]:=total-amounts[1]-amounts[2];
  if least(amounts[1],amounts[2],amounts[3])<50 then raise exception 'Each instalment must be at least EUR 0.50'; end if;
  if (p_data->>'expires_at')::timestamptz<=now() or p_data->>'expires_at' is null then raise exception 'Future expiry required'; end if;
  select email into customer_email from auth.users where id=customer;
  -- Whitelist snapshot fields; never accept client-provided totals or email ownership.
  s:=jsonb_build_object('title',s->>'title','description',s->>'description','customer',s->'customer'||jsonb_build_object('email',customer_email),
   'supplier',s->'supplier','items',items,'subtotal_cents',subtotal,'tax_bps',basis,'tax_cents',tax,'tax_label',s->>'tax_label',
   'total_cents',total,'currency','EUR','timeline',s->>'timeline','payment_terms',s->>'payment_terms','revisions',(s->>'revisions')::integer,
   'responsibilities',s->>'responsibilities','delivery_terms',s->>'delivery_terms','exclusions',s->>'exclusions','percentages',to_jsonb(parts),'payment_due_days',to_jsonb(days),'instalments',to_jsonb(amounts));
  ref:=nullif(p_data->>'request_id','')::uuid;
  if ref is not null and not exists(select 1 from upnology.quote_requests q join upnology.leads l on l.id=q.lead_id where q.id=ref and
   (l.auth_user_id=customer or exists(select 1 from upnology.customer_leads cl where cl.lead_id=l.id and cl.user_id=customer))) then raise exception 'Request does not belong to customer'; end if;
  if nullif(p_data->>'id','') is null then
   insert into upnology.offers(customer_user_id,request_id,snapshot,total_cents,expires_at,template_id) values(customer,ref,s,total,(p_data->>'expires_at')::timestamptz,t.id) returning id into ident;
  else
   ident:=(p_data->>'id')::uuid;
   update upnology.offers set customer_user_id=customer,request_id=ref,snapshot=s,total_cents=total,expires_at=(p_data->>'expires_at')::timestamptz,template_id=t.id,updated_at=now() where id=ident and status='BOZZA';
   if not found then raise exception 'Only drafts can be edited'; end if;
  end if;
  perform upnology.commercial_event(ident,'draft_saved'); return jsonb_build_object('id',ident);
 end if;
 select * into o from upnology.offers where id=(p_data->>'offer_id')::uuid for update;
 if not found or (not a and (o.customer_user_id<>auth.uid() or o.status='BOZZA')) then raise exception 'Offer unavailable' using errcode='42501'; end if;
 if p_action in ('accept','reject','accept_contract','approve_release','feedback') and o.customer_user_id<>auth.uid() then raise exception 'Customer action required' using errcode='42501'; end if;
 if p_action='version' then
  insert into upnology.offers(customer_user_id,request_id,previous_id,version,snapshot,total_cents,expires_at,template_id)
  values(o.customer_user_id,o.request_id,o.id,o.version+1,o.snapshot,o.total_cents,now()+interval '30 days',o.template_id) returning id into ident;
  perform upnology.commercial_event(ident,'version_created',jsonb_build_object('previous_id',o.id));
  return jsonb_build_object('id',ident);
 elsif p_action='send' then
  if o.status<>'BOZZA' or o.expires_at<=now() then raise exception 'Valid draft required'; end if;
  select * into t from upnology.contract_templates where id=o.template_id;
  if t.approved_at is null then raise exception 'Legal approval required before sending'; end if;
  update upnology.offers set status='INVIATO',updated_at=now() where id=o.id;
  perform upnology.queue_email(o.id,'quote_available',o.id||':quote_available');
 elsif p_action='accept' then
  if o.status='ACCETTATO' then return jsonb_build_object('id',o.id); end if;
  if o.status<>'INVIATO' or o.expires_at<=now() or p_data->>'confirmed' is distinct from 'true' then raise exception 'Quote expired or acceptance missing'; end if;
  select * into t from upnology.contract_templates where id=o.template_id and approved_at is not null;
  if not found then raise exception 'Approved template required'; end if;
  insert into upnology.projects(lead_id,customer_user_id,title,status,description,service,commercial_stage)
  values((select lead_id from upnology.quote_requests where id=o.request_id),o.customer_user_id,o.snapshot->>'title','pianificato',o.snapshot->>'description','Progetto su preventivo','CONTRATTO_DA_ACCETTARE') returning id into ident;
  update upnology.offers set status='ACCETTATO',accepted_at=now(),project_id=ident,updated_at=now() where id=o.id;
  insert into upnology.contracts(offer_id,snapshot,body,snapshot_hash) values(o.id,o.snapshot,t.body,encode(sha256(convert_to(o.snapshot::text||t.body,'UTF8')),'hex'));
  for i in 1..3 loop
   insert into upnology.milestones(project_id,offer_id,phase,amount_cents) values(ident,o.id,i,(o.snapshot->'instalments'->>(i-1))::bigint);
  end loop;
  perform upnology.queue_email(o.id,'quote_accepted',o.id||':quote_accepted');
  perform upnology.queue_email(o.id,'contract_available',o.id||':contract_available');
 elsif p_action='reject' then
  if o.status<>'INVIATO' or o.expires_at<=now() then raise exception 'Quote unavailable'; end if;
  update upnology.offers set status='RIFIUTATO',updated_at=now() where id=o.id;
 elsif p_action='accept_contract' then
  select * into c from upnology.contracts where offer_id=o.id for update;
  if not found or p_data->>'snapshot_hash' is distinct from c.snapshot_hash or p_data->>'confirmed' is distinct from 'true' then raise exception 'Contract confirmation required'; end if;
  if c.accepted_at is not null then return '{}'; end if;
  update upnology.contracts set accepted_at=now(),accepted_by=auth.uid(),acceptance_text='Ho letto e accetto il contratto e il preventivo allegato, identificati dall’impronta indicata.' where id=c.id;
  update upnology.milestones set status='RICHIESTO',due_at=now()+make_interval(days=>(o.snapshot->'payment_due_days'->>0)::integer) where offer_id=o.id and phase=1;
  update upnology.projects set commercial_stage='ATTESA_ACCONTO',updated_at=now() where id=o.project_id;
  perform upnology.queue_email(o.id,'payment_first',o.id||':payment_first');
 elsif p_action='release' then
  i:=(p_data->>'phase')::integer;
  if i not in (2,3) or i is null or not exists(select 1 from upnology.milestones where offer_id=o.id and phase=i-1 and status='PAGATO')
   or exists(select 1 from upnology.milestones where offer_id=o.id and phase=i and status<>'BLOCCATO') then raise exception 'Previous payment required or phase already approved'; end if;
  if coalesce(p_data->>'url','')!~'^https://' or coalesce(length(p_data->>'protection_note'),0)<10 or coalesce(length(p_data->>'notes'),0)<2 then raise exception 'Protected demo URL and description required'; end if;
  insert into upnology.project_releases(project_id,phase,url,notes,protection_note) values(o.project_id,i,p_data->>'url',p_data->>'notes',p_data->>'protection_note') returning id into ident;
  update upnology.projects set commercial_stage=case when i=2 then 'DEMO_DA_APPROVARE' else 'FINALE_DA_APPROVARE' end,status='in_revisione',updated_at=now() where id=o.project_id;
  perform upnology.queue_email(o.id,case when i=2 then 'demo_available' else 'project_completed' end,ident||':release');
  perform upnology.queue_email(o.id,'feedback_requested',ident||':feedback');
 elsif p_action in ('approve_release','feedback') then
  select * into r from upnology.project_releases where id=(p_data->>'release_id')::uuid and project_id=o.project_id for update;
  if not found then raise exception 'Release unavailable'; end if;
  if p_action='feedback' then
   insert into upnology.project_feedback(release_id,author_id,body) values(r.id,auth.uid(),p_data->>'body');
  else
   if p_data->>'confirmed' is distinct from 'true' or r.id<>(select id from upnology.project_releases where project_id=o.project_id and phase=r.phase order by created_at desc,id desc limit 1) then raise exception 'Approve the latest release'; end if;
   if r.approved_at is not null then return '{}'; end if;
   if exists(select 1 from upnology.project_feedback f join upnology.project_releases pr on pr.id=f.release_id where pr.project_id=o.project_id and pr.phase=r.phase and f.resolved_at is null) then raise exception 'Open feedback must be resolved'; end if;
   if not exists(select 1 from upnology.milestones where offer_id=o.id and phase=r.phase-1 and status='PAGATO') then raise exception 'Previous payment required'; end if;
   update upnology.project_releases set approved_at=now(),approved_by=auth.uid() where id=r.id;
   update upnology.milestones set approved_at=now(),status='RICHIESTO',due_at=now()+make_interval(days=>(o.snapshot->'payment_due_days'->>(r.phase-1))::integer) where offer_id=o.id and phase=r.phase and status='BLOCCATO';
   update upnology.projects set commercial_stage=case when r.phase=2 then 'ATTESA_SECONDO_PAGAMENTO' else 'ATTESA_SALDO' end,updated_at=now() where id=o.project_id;
   perform upnology.queue_email(o.id,case when r.phase=2 then 'payment_second' else 'payment_final' end,r.id||':payment');
  end if;
 elsif p_action='resolve_feedback' then
  if coalesce(length(trim(p_data->>'resolution')),0)<2 then raise exception 'Resolution required'; end if;
  update upnology.project_feedback f set resolution=left(p_data->>'resolution',5000),resolved_at=now()
  from upnology.project_releases pr where f.id=(p_data->>'feedback_id')::uuid and f.release_id=pr.id and pr.project_id=o.project_id and f.resolved_at is null;
  if not found then raise exception 'Feedback unavailable'; end if;
 elsif p_action='update' then
  if o.status<>'ACCETTATO' or coalesce(length(trim(p_data->>'message')),0) not between 2 and 5000 then raise exception 'Update requires accepted offer and message'; end if;
  ident:=gen_random_uuid(); perform upnology.queue_email(o.id,'project_update',ident||':update',jsonb_build_object('message',p_data->>'message'));
 elsif p_action='request_payment' then
  select * into m from upnology.milestones where offer_id=o.id and id=(p_data->>'milestone_id')::uuid for update;
  if not found or m.status not in ('RICHIESTO','FALLITO') then raise exception 'Payment not requestable'; end if;
  if p_data->>'due_at' is null or (p_data->>'due_at')::timestamptz<=now() then raise exception 'Future due date required'; end if;
  if m.due_at is not null and (p_data->>'due_at')::timestamptz<m.due_at then raise exception 'Cannot shorten the agreed payment deadline'; end if;
  update upnology.milestones set due_at=(p_data->>'due_at')::timestamptz where id=m.id;
  perform upnology.queue_email(o.id,case m.phase when 1 then 'payment_first' when 2 then 'payment_second' else 'payment_final' end,m.id||':reminder:'||to_char(now(),'YYYY-MM-DD'));
 elsif p_action='prepare_delivery' then
  if o.status<>'ACCETTATO' or coalesce(p_data->>'url','')!~'^https://' then raise exception 'Accepted offer and protected URL required'; end if;
  if exists(select 1 from upnology.projects where id=o.project_id and delivered_at is not null) then raise exception 'Delivery already completed'; end if;
  update upnology.projects set delivery_url=p_data->>'url',updated_at=now() where id=o.project_id;
 elsif p_action='delivery' then
  if (select count(*) from upnology.milestones where offer_id=o.id and status='PAGATO')<>3 then raise exception 'All payments required'; end if;
  if coalesce(p_data->>'url','')!~'^https://' then raise exception 'Protected delivery URL required'; end if;
  if exists(select 1 from upnology.projects where id=o.project_id and delivered_at is not null) then return '{}'; end if;
  update upnology.projects set delivery_url=p_data->>'url',delivered_at=now(),commercial_stage='CONSEGNATO',status='completato',updated_at=now() where id=o.project_id;
  perform upnology.queue_email(o.id,'delivery',o.id||':delivery');
 else raise exception 'Unsupported command';
 end if;
 if o.request_id is not null and p_action in ('send','accept','reject') then
  select lead_id into ref from upnology.quote_requests where id=o.request_id;
  update upnology.leads set status=(case p_action when 'send' then 'preventivo_inviato' when 'accept' then 'accettato' else 'rifiutato' end)::upnology.lead_status,updated_at=now()
   where id=ref and (p_action='accept' or not exists(select 1 from upnology.offers where request_id=o.request_id and status='ACCETTATO'));
  insert into upnology.lead_events(lead_id,event_type,note,actor_user_id) values(ref,'commercial_offer_changed',o.id||':'||p_action,auth.uid());
 end if;
 perform upnology.commercial_event(o.id,p_action,p_data-'url'-'snapshot');
 return jsonb_build_object('id',o.id);
end $$;

create function public.commercial_checkout(p_milestone uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m upnology.milestones; o upnology.offers; a upnology.payment_attempts;
begin
 select * into m from upnology.milestones where id=p_milestone for update;
 if not found then raise exception 'Milestone unavailable'; end if;
 select * into o from upnology.offers where id=m.offer_id;
 if auth.uid() is null or o.customer_user_id<>auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
 if m.status not in ('RICHIESTO','FALLITO','IN_ATTESA') or not exists(select 1 from upnology.contracts where offer_id=o.id and accepted_at is not null)
  or exists(select 1 from upnology.milestones where offer_id=o.id and phase<m.phase and status<>'PAGATO') then raise exception 'Milestone not payable'; end if;
 select * into a from upnology.payment_attempts where milestone_id=m.id and status in ('creating','open','pending');
 if not found then
  insert into upnology.payment_attempts(milestone_id,amount_cents) values(m.id,m.amount_cents) returning * into a;
 end if;
 return to_jsonb(a)||jsonb_build_object('offer_id',o.id,'phase',m.phase,'title',o.snapshot->>'title','email',o.snapshot->'customer'->>'email');
end $$;

create function public.commercial_link(p_offer uuid,p_release uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare o upnology.offers; link text;
begin
 select * into o from upnology.offers where id=p_offer;
 if not found or auth.uid() is null or (o.customer_user_id<>auth.uid() and not upnology.is_admin()) then raise exception 'Owner required' using errcode='42501'; end if;
 if p_release is null then
  select delivery_url into link from upnology.projects where id=o.project_id and delivered_at is not null
   and not exists(select 1 from upnology.milestones where offer_id=o.id and status<>'PAGATO');
 else select url into link from upnology.project_releases where id=p_release and project_id=o.project_id;
 end if;
 if link is null then raise exception 'Link unavailable'; end if;
 return link;
end $$;

-- Service functions are unavailable to browsers, even admins.
create function public.commercial_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a upnology.payment_attempts; m upnology.milestones; o upnology.offers; e upnology.email_outbox;
 new_status text; refund bigint; event_ident bigint; rows jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 perform set_config('upnology.commercial_write','on',true);
 if p_action in ('checkout_bound','checkout_expired','stripe_event') then
  -- Match the lock order of checkout reservations to avoid deadlocks.
  select milestone_id into a.milestone_id from upnology.payment_attempts where id=(p_data->>'attempt_id')::uuid;
  select * into m from upnology.milestones where id=a.milestone_id for update;
  select * into a from upnology.payment_attempts where id=(p_data->>'attempt_id')::uuid for update;
  if not found then raise exception 'Unknown payment attempt'; end if;
  select * into o from upnology.offers where id=m.offer_id;
  if p_action='checkout_bound' then
   if a.session_id is not null and a.session_id<>p_data->>'session_id' then raise exception 'Conflicting session'; end if;
   update upnology.payment_attempts set session_id=p_data->>'session_id',checkout_url=p_data->>'url',
    status=case when status='creating' then 'open' else status end where id=a.id;
  elsif p_action='checkout_expired' then
   if a.session_id is distinct from p_data->>'session_id' or a.status not in ('open','creating') then raise exception 'Cannot expire payment'; end if;
   update upnology.payment_attempts set status='expired' where id=a.id;
  else
   if (p_data->>'amount_cents')::bigint is distinct from a.amount_cents or p_data->>'currency' is distinct from 'eur'
    or (a.session_id is not null and a.session_id is distinct from p_data->>'session_id') then raise exception 'Payment mismatch'; end if;
   if p_data->>'state' not in ('paid','pending','failed','expired') or p_data->>'state' is null or nullif(p_data->>'event_id','') is null then raise exception 'Invalid event'; end if;
   insert into upnology.stripe_events(id,type) values(p_data->>'event_id',p_data->>'event_type') on conflict do nothing;
   if not found then return jsonb_build_object('duplicate',true); end if;
   refund:=greatest(m.refunded_cents,coalesce((p_data->>'refunded_cents')::bigint,0));
   if refund>a.amount_cents then raise exception 'Invalid refund'; end if;
   new_status:=p_data->>'state';
   -- Successful or refunded payments cannot be downgraded by delayed failure events.
   if new_status<>'paid' and (a.status in ('paid','refunded','partial_refund') or m.status in ('PAGATO','RIMBORSATO','RIMBORSO_PARZIALE')) then return '{}'; end if;
   update upnology.payment_attempts set session_id=p_data->>'session_id',payment_intent=nullif(p_data->>'payment_intent',''),
    status=case when refund=a.amount_cents then 'refunded' when refund>0 then 'partial_refund' when new_status='failed' and p_data->>'session_status'='open' then 'open' else new_status end where id=a.id;
   update upnology.milestones set status=case when refund=amount_cents then 'RIMBORSATO' when refund>0 then 'RIMBORSO_PARZIALE'
     when new_status='paid' then 'PAGATO' when new_status='pending' then 'IN_ATTESA' else 'FALLITO' end,
    paid_at=case when new_status='paid' then coalesce(paid_at,now()) else paid_at end,refunded_cents=refund where id=m.id;
   if refund>0 then
    update upnology.projects set status='sospeso',commercial_stage='VERIFICA_RIMBORSO',updated_at=now() where id=m.project_id;
   elsif new_status='paid' and m.paid_at is null then
    if not exists(select 1 from upnology.milestones where offer_id=o.id and refunded_cents>0) then
    update upnology.projects set status=case when m.phase=3 then 'completato' else 'in_lavorazione' end,
     commercial_stage=case m.phase when 1 then 'IN_LAVORAZIONE' when 2 then 'COMPLETAMENTO' else 'PRONTO_ALLA_CONSEGNA' end,start_date=case when m.phase=1 then coalesce(start_date,current_date) else start_date end,updated_at=now() where id=m.project_id;
    end if;
    perform upnology.queue_email(o.id,case when m.phase=3 then 'payment_final_confirmed' else 'payment_confirmed' end,m.id||':paid',jsonb_build_object('amount_cents',m.amount_cents,'phase',m.phase));
    if m.phase=1 then perform upnology.queue_email(o.id,'project_started',o.id||':started'); end if;
   end if;
   if new_status='paid' and (select count(*) from upnology.milestones where offer_id=o.id and status='PAGATO')=3 then
    update upnology.projects set delivered_at=now(),commercial_stage='CONSEGNATO',status='completato',updated_at=now()
     where id=o.project_id and delivery_url is not null and delivered_at is null;
    if found then
     perform upnology.queue_email(o.id,'delivery',o.id||':delivery');
     perform upnology.commercial_event(o.id,'automatic_delivery');
    end if;
   end if;
   perform upnology.commercial_event(o.id,'stripe_'||new_status,jsonb_build_object('milestone_id',m.id,'event_id',p_data->>'event_id','refunded_cents',refund));
  end if;
  return '{}';
 elsif p_action='claim_emails' then
  update upnology.email_outbox set status='review',last_error='Idempotency window exceeded; reconcile with provider before retry'
   where status in ('sending','retry') and first_attempt_at<now()-interval '23 hours';
  with picked as (
   select id from upnology.email_outbox where ((status in ('queued','retry') and next_attempt_at<=now()) or (status='sending' and lease_until<now()))
    and attempts<8 order by created_at for update skip locked limit greatest(1,least(10,coalesce((p_data->>'limit')::integer,3)))
  ), claimed as (
   update upnology.email_outbox job set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes'
   from picked where job.id=picked.id returning job.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into rows from claimed;
  return rows;
 elsif p_action='email_result' then
  select * into e from upnology.email_outbox where id=(p_data->>'id')::uuid and lease_id=(p_data->>'lease_id')::uuid and status='sending' for update;
  if not found then return '{}'; end if;
  update upnology.email_outbox set status=case when p_data->>'provider_id' is not null then 'sent' when attempts>=8 or p_data->>'permanent'='true' then 'review' else 'retry' end,
   provider_id=p_data->>'provider_id',sent_at=case when p_data->>'provider_id' is not null then now() end,
   last_error=left(p_data->>'error',300),next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_until=null where id=e.id;
  return '{}';
 elsif p_action='expire_offers' then
  update upnology.offers set status='SCADUTO',updated_at=now() where status='INVIATO' and expires_at<=now();
  get diagnostics event_ident=row_count; return jsonb_build_object('expired',event_ident);
 end if;
 raise exception 'Unsupported service action';
end $$;

revoke all on function upnology.commercial_event(uuid,text,jsonb),upnology.queue_email(uuid,text,text,jsonb),upnology.immutable_commercial(),upnology.guard_commercial_project() from public,anon,authenticated;
revoke all on function public.commercial_overview(),public.commercial_command(text,jsonb),public.commercial_checkout(uuid),public.commercial_link(uuid,uuid) from public,anon;
grant execute on function public.commercial_overview(),public.commercial_command(text,jsonb),public.commercial_checkout(uuid),public.commercial_link(uuid,uuid) to authenticated;
revoke all on function public.commercial_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.commercial_service(text,jsonb) to service_role;
