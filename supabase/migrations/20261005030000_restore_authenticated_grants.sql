-- Restore grants required by existing customer/admin RLS policies and invoker RPCs.
-- A replay of the commercial migration can revoke these later grants.
grant usage on schema upnology to authenticated;
grant select on upnology.customer_profiles, upnology.customer_leads,
  upnology.leads, upnology.quote_requests, upnology.projects,
  upnology.contact_messages, upnology.lead_events to authenticated;
grant update (display_name, last_name, phone, company, sector, city, updated_at)
  on upnology.customer_profiles to authenticated;
grant update (status, updated_at) on upnology.leads to authenticated;
grant insert, update on upnology.projects to authenticated;
