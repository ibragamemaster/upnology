-- Read-only audit of the linked Upnology project. Returns metadata, never lead rows.
select jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'upnology' and c.relkind = 'r'
  ),
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type, 'udt', udt_name, 'nullable', is_nullable) order by table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns where table_schema = 'upnology'
  ),
  'foreign_keys', (
    select coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'constraint', conname, 'references', confrelid::regclass::text) order by conrelid::regclass::text, conname), '[]'::jsonb)
    from pg_constraint where contype = 'f' and connamespace = 'upnology'::regnamespace
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'returns', pg_get_function_result(p.oid), 'security_definer', p.prosecdef) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('submit_quote_request', 'submit_contact_message')
  ),
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'roles', roles, 'command', cmd, 'using', qual, 'check', with_check) order by tablename, policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'upnology'
  ),
  'anon_table_privileges', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'select', has_table_privilege('anon', c.oid, 'SELECT'),
      'insert', has_table_privilege('anon', c.oid, 'INSERT'),
      'update', has_table_privilege('anon', c.oid, 'UPDATE'),
      'delete', has_table_privilege('anon', c.oid, 'DELETE')
    ) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'upnology' and c.relkind = 'r'
  ),
  'privileges', jsonb_build_object(
    'anon_quote_rpc', has_function_privilege('anon', 'public.submit_quote_request(jsonb)', 'EXECUTE'),
    'anon_contact_rpc', has_function_privilege('anon', 'public.submit_contact_message(jsonb)', 'EXECUTE'),
    'anon_leads_select', has_table_privilege('anon', 'upnology.leads', 'SELECT'),
    'anon_quotes_select', has_table_privilege('anon', 'upnology.quote_requests', 'SELECT'),
    'anon_profiles_select', has_table_privilege('anon', 'upnology.customer_profiles', 'SELECT'),
    'anon_projects_select', has_table_privilege('anon', 'upnology.projects', 'SELECT'),
    'anon_leads_insert', has_table_privilege('anon', 'upnology.leads', 'INSERT'),
    'authenticated_profiles_select', has_table_privilege('authenticated', 'upnology.customer_profiles', 'SELECT')
  ),
  'auth_users_exists', to_regclass('auth.users') is not null
) as audit;
