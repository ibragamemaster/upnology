-- Additive rollout: no records rewritten; legacy RPCs remain available.
begin;
create or replace function public.commercial_workspace_v2()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb;
begin
 if not upnology.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 w := public.admin_workspace();
 -- The pipeline must not silently omit requests older than the legacy 100-row window.
 w := w || jsonb_build_object('quotes', coalesce((select jsonb_agg(jsonb_build_object(
  'id',q.id,'lead_id',l.id,'name',l.name,'email',l.email,'phone',l.phone,'company',l.company,
  'services',q.services,'budget',q.budget,'timeline',q.timeline,'details',q.details,
  'created_at',q.created_at,'status',l.status,'customer_user_id',coalesce(l.auth_user_id,
   (select cl.user_id from upnology.customer_leads cl where cl.lead_id=l.id order by cl.verified_at limit 1))
 ) order by q.created_at desc) from upnology.quote_requests q join upnology.leads l on l.id=q.lead_id),'[]'::jsonb));
 return jsonb_build_object('workspace',w,'commercial',public.commercial_overview(),'generated_at',statement_timestamp());
end $$;
revoke all on function public.commercial_workspace_v2() from public,anon;
grant execute on function public.commercial_workspace_v2() to authenticated;
commit;
