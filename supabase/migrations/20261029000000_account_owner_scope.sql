-- Personal account scope must not expand when its owner also has the admin role.
-- Reuse the same records and RPC; keep RLS as an additional check.
begin;
create or replace function public.account_overview()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'profile', (select to_jsonb(p) from upnology.customer_profiles p where p.user_id=auth.uid()),
  'requests', coalesce((select jsonb_agg(jsonb_build_object(
   'id',q.id,'created_at',q.created_at,'services',q.services,'budget',q.budget,'timeline',q.timeline,'status',l.status
  ) order by q.created_at desc) from upnology.quote_requests q join upnology.leads l on l.id=q.lead_id
   where l.auth_user_id=auth.uid() or exists(select 1 from upnology.customer_leads cl where cl.lead_id=l.id and cl.user_id=auth.uid())), '[]'::jsonb),
  'projects', coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'title',p.title,'status',p.status,'updated_at',p.updated_at
  ) order by p.updated_at desc) from upnology.projects p where p.customer_user_id=auth.uid()
   or (p.customer_user_id is null and exists(select 1 from upnology.leads l where l.id=p.lead_id and
    (l.auth_user_id=auth.uid() or exists(select 1 from upnology.customer_leads cl where cl.lead_id=l.id and cl.user_id=auth.uid()))))), '[]'::jsonb)
 ) where auth.uid() is not null;
$$;
commit;
