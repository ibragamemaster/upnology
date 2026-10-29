-- Complete the existing verified-email claim flow for requests submitted AFTER
-- account verification. No offers, contracts, projects or payments are created.
begin;
create function upnology.link_verified_quote_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.source = 'preventivo' then
  insert into upnology.customer_leads(user_id, lead_id)
  select u.id, new.id from auth.users u
  where u.email_confirmed_at is not null and lower(u.email) = lower(new.email)
    and (new.auth_user_id is null or new.auth_user_id = u.id)
  on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function upnology.link_verified_quote_lead() from public, anon, authenticated;
create trigger link_verified_quote_lead after insert on upnology.leads
for each row execute function upnology.link_verified_quote_lead();
-- Repair only missing associations under the same rules as sync_customer_identity.
insert into upnology.customer_leads(user_id, lead_id)
select u.id, l.id from auth.users u join upnology.leads l on lower(l.email) = lower(u.email)
where u.email_confirmed_at is not null and l.source = 'preventivo'
 and (l.auth_user_id is null or l.auth_user_id = u.id)
on conflict do nothing;
commit;
