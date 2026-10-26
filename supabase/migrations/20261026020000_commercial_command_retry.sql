-- Persist command results in the existing event history so a lost HTTP response
-- cannot create another draft, version, release or notification on retry.
begin;
do $$ begin
 if to_regprocedure('public.commercial_command_core(text,jsonb)') is null then
  alter function public.commercial_command(text,jsonb) rename to commercial_command_core;
 end if;
end $$;
revoke all on function public.commercial_command_core(text,jsonb) from public,anon,authenticated,service_role;
create index if not exists commercial_command_retry_lookup on upnology.commercial_events(actor_id,(detail->>'command_id')) where kind='command_completed';
create or replace function public.commercial_command(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key uuid; v_event upnology.commercial_events; v_result jsonb; v_hash text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_action in ('template','approve_template','save','version','send','release','resolve_feedback','update','prepare_delivery','delivery','request_payment') and not upnology.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 -- Keep older clients compatible; all current clients send a command identifier.
 if not (p_data ? '_command_id') then return public.commercial_command_core(p_action,p_data); end if;
 v_key:=(p_data->>'_command_id')::uuid;
 if v_key is null then raise exception 'Invalid command identifier' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to(jsonb_build_array(p_action,p_data-'_command_id')::text,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||v_key::text,0));
 select * into v_event from upnology.commercial_events where kind='command_completed' and actor_id=auth.uid() and detail->>'command_id'=v_key::text;
 if found then
  if v_event.detail->>'request_hash' is distinct from v_hash then raise exception 'Command identifier already used' using errcode='22023'; end if;
  return v_event.detail->'result';
 end if;
 v_result:=public.commercial_command_core(p_action,p_data-'_command_id');
 insert into upnology.commercial_events(actor_id,kind,detail) values(auth.uid(),'command_completed',jsonb_build_object('command_id',v_key,'action',p_action,'request_hash',v_hash,'result',v_result));
 return v_result;
end $$;
revoke all on function public.commercial_command(text,jsonb) from public,anon;
grant execute on function public.commercial_command(text,jsonb) to authenticated;
commit;
