-- Preserve legacy attempts; all newly reserved sessions use strict project metadata.
alter table upnology.payment_attempts add column integration_version integer not null default 1;
alter table upnology.payment_attempts alter column integration_version set default 2;
alter table upnology.payment_attempts add column stripe_livemode boolean;
alter table upnology.payment_attempts add column invoice_id text;

create or replace function public.commercial_checkout(p_milestone uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
 return to_jsonb(a)||jsonb_build_object('offer_id',o.id,'project_id',m.project_id,'customer_user_id',o.customer_user_id,'phase',m.phase,'title',o.snapshot->>'title','email',o.snapshot->'customer'->>'email');
end $$;

create or replace function public.commercial_service(p_action text,p_data jsonb) returns jsonb
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
  if p_action in ('checkout_bound','stripe_event') and a.integration_version>=2 then
   if p_data->'metadata'->>'application' is distinct from 'upnology'
    or p_data->'metadata'->>'integration_version' is distinct from '2'
    or p_data->'metadata'->>'attempt_id' is distinct from a.id::text
    or p_data->'metadata'->>'installment_id' is distinct from m.id::text
    or p_data->'metadata'->>'milestone_id' is distinct from m.id::text
    or p_data->'metadata'->>'quote_id' is distinct from o.id::text
    or p_data->'metadata'->>'project_id' is distinct from m.project_id::text
    or p_data->'metadata'->>'customer_id' is distinct from o.customer_user_id::text
    or (p_data->>'amount_cents')::bigint is distinct from a.amount_cents
    or p_data->>'currency' is distinct from 'eur'
    or jsonb_typeof(p_data->'livemode') is distinct from 'boolean'
    or (a.stripe_livemode is not null and a.stripe_livemode is distinct from (p_data->>'livemode')::boolean)
   then raise exception 'Stripe project or environment mismatch'; end if;
   update upnology.payment_attempts set stripe_livemode=(p_data->>'livemode')::boolean,
    invoice_id=coalesce(nullif(p_data->>'invoice_id',''),invoice_id) where id=a.id;
  end if;
  if p_action='checkout_bound' then
   if (p_data->>'amount_cents')::bigint is distinct from a.amount_cents or p_data->>'currency' is distinct from 'eur' then raise exception 'Payment mismatch'; end if;
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
