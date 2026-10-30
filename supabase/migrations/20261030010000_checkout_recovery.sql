begin;
-- Existing retries must keep the exact Stripe idempotency payload they started with.
alter table upnology.payment_attempts add column if not exists checkout_revision integer not null default 1 check(checkout_revision in (1,2));
alter table upnology.payment_attempts alter column checkout_revision set default 2;
create or replace function public.customer_payment_attempt(p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select to_jsonb(a)||jsonb_build_object('offer_id',o.id,'project_id',m.project_id,
  'customer_user_id',o.customer_user_id,'phase',m.phase,'title',o.snapshot->>'title','email',o.snapshot->'customer'->>'email') into result
 from upnology.payment_attempts a join upnology.milestones m on m.id=a.milestone_id join upnology.offers o on o.id=m.offer_id
 where a.id=p_attempt and o.customer_user_id=auth.uid();
 if result is null then raise exception 'Payment unavailable' using errcode='42501'; end if;
 return result;
end $$;
revoke all on function public.customer_payment_attempt(uuid) from public,anon;
grant execute on function public.customer_payment_attempt(uuid) to authenticated;
commit;
