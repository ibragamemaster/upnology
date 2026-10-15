select jsonb_build_object(
  'columns', (select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='upnology' and table_name='customer_profiles'),
  'policies', (select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'roles', roles, 'cmd', cmd, 'using', qual)) from pg_policies where schemaname='upnology'),
  'rls', (select jsonb_agg(jsonb_build_object('table', relname, 'enabled', relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='upnology' and c.relkind='r'),
  'anon_readable', (select jsonb_agg(c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='upnology' and c.relkind='r' and has_table_privilege('anon', c.oid, 'SELECT')),
  'rpcs', (select jsonb_agg(jsonb_build_object('name', proname, 'anon', has_function_privilege('anon', p.oid, 'EXECUTE'), 'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('account_overview','update_customer_profile')),
  'trigger', (select count(*) from pg_trigger where tgname='sync_customer_identity' and not tgisinternal)
) as audit;
