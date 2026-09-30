-- Additive migration. Review and apply separately; never run against production from tests.
begin;
alter table public.invoices
  add column if not exists import_key text,
  add column if not exists import_details jsonb,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reminder_scenario text;
create unique index if not exists invoices_import_key_unique on public.invoices(organization_id, import_key) where import_key is not null;

create table public.import_batches (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  result jsonb not null
);
alter table public.import_batches enable row level security;
grant select, insert on public.import_batches to authenticated;
create policy owner_import_batches on public.import_batches for all to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));

create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(name in ('landing_page_view','trial_cta_clicked','signup_completed','demo_started','import_started','document_uploaded','document_parsed','import_reviewed','client_created','invoice_created','first_reminder_scheduled','subscription_started')),
  properties jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check(octet_length(properties::text) <= 2048)
);
create unique index funnel_first_activation on public.funnel_events(user_id, name) where name='first_reminder_scheduled';
create unique index funnel_signup on public.funnel_events(user_id, name) where name='signup_completed';
alter table public.funnel_events enable row level security;
grant select, insert on public.funnel_events to authenticated;
create policy own_funnel_events on public.funnel_events for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.import_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  batch_id uuid not null,
  rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=200 and octet_length(rows::text)<2000000),
  updated_at timestamptz not null default now()
);
alter table public.import_drafts enable row level security;
grant select, insert, update, delete on public.import_drafts to authenticated;
create policy own_import_drafts on public.import_drafts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stage text not null default 'empty' check(stage in ('empty','review','draft','scheduled')),
  opted_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.onboarding_state enable row level security;
grant select, insert, update on public.onboarding_state to authenticated;
create policy own_onboarding on public.onboarding_state for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.onboarding_email_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  state text not null default 'claimed' check(state in ('claimed','sent','failed')),
  created_at timestamptz not null default now(),
  primary key(user_id,kind)
);
alter table public.onboarding_email_deliveries enable row level security;
-- Only service_role manages email claims. No authenticated/anon policy or grants.
grant all on public.import_batches, public.funnel_events, public.onboarding_state, public.onboarding_email_deliveries to service_role;

-- Keep legacy/manual scheduling unchanged. Import inserts suppress this trigger's
-- work through an explicit column, not a client-controlled session setting.
create or replace function public.schedule_invoice_reminders()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.import_key is not null then return new; end if;
  insert into public.reminders(organization_id,invoice_id,scheduled_for,stage) values
    (new.organization_id,new.id,(new.due_date-3)::timestamp+time '09:00','J-3'),
    (new.organization_id,new.id,(new.due_date+1)::timestamp+time '09:00','J+1'),
    (new.organization_id,new.id,(new.due_date+7)::timestamp+time '09:00','J+7'),
    (new.organization_id,new.id,(new.due_date+15)::timestamp+time '09:00','J+15'),
    (new.organization_id,new.id,(new.due_date+30)::timestamp+time '09:00','J+30')
  on conflict(invoice_id,stage) do nothing;
  return new;
end $$;

create or replace function public.confirm_import(batch_id uuid, rows jsonb, schedule boolean, scenario text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner uuid := auth.uid(); org uuid; org_created timestamptz; org_status text; org_subscription text;
  previous jsonb; item jsonb; customer uuid; invoice uuid; fingerprint text; client_name text; client_email text;
  amount integer; due date; invoice_ref text; created_count integer:=0; skipped_count integer:=0; reminder_count integer:=0;
  stage text; offsets integer[]; offset_days integer; next_at timestamptz; last_at timestamptz; output jsonb;
begin
  if owner is null then raise exception 'authentication_required'; end if;
  if rows is null or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'invalid_batch'; end if;
  if scenario is null or scenario not in ('gentle','complete') or schedule is null then raise exception 'invalid_scenario'; end if;
  insert into public.organizations(owner_id,name) values(owner,'Mon entreprise') on conflict(owner_id) do nothing;
  select id,created_at,subscription_status,stripe_subscription_id into org,org_created,org_status,org_subscription
    from public.organizations where owner_id=owner for update;
  select result into previous from public.import_batches where id=batch_id and organization_id=org;
  if previous is not null then return previous; end if;
  if schedule and not (org_status='active' or (org_status='trialing' and (org_subscription is not null or org_created+interval '14 days'>now()))) then
    raise exception 'subscription_required';
  end if;
  offsets := case when scenario='complete' then array[-3,1,7,15,30] else array[1,7,15] end;
  for item in select value from jsonb_array_elements(rows) loop
    if item->>'confirmed' is distinct from 'true' or item->>'currency' is distinct from 'EUR' then raise exception 'review_required'; end if;
    client_name := trim(item->>'client'); client_email:=nullif(lower(trim(item->>'email')),'');
    invoice_ref:=trim(item->>'invoiceNumber'); amount:=(item->>'amount_cents')::integer; due:=(item->>'due')::date;
    if coalesce(length(client_name),0) not between 1 and 160 or coalesce(length(invoice_ref),0) not between 1 and 160 or amount is null or amount<=0 or due is null then raise exception 'invalid_invoice'; end if;
    if schedule and (client_email is null or client_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'email_required'; end if;
    if octet_length(item::text)>12000 or item ? 'demo' then raise exception 'invalid_invoice'; end if;
    -- Same debtor/reference is a duplicate even when the user changed dates/amounts.
    fingerprint:=encode(sha256(convert_to(lower(regexp_replace(client_name,'\s+',' ','g'))||'|'||lower(invoice_ref),'UTF8')),'hex');
    if exists(select 1 from public.invoices i join public.customers c on c.id=i.customer_id
      where i.organization_id=org and (i.import_key=fingerprint or (lower(trim(i.invoice_number))=lower(invoice_ref) and lower(trim(c.name))=lower(client_name)))) then
      skipped_count:=skipped_count+1; continue;
    end if;
    customer:=null;
    if client_email is not null then
      select id into customer from public.customers where organization_id=org and email=client_email;
      if customer is not null and not exists(select 1 from public.customers where id=customer and lower(trim(name))=lower(client_name)) then raise exception 'customer_email_conflict'; end if;
    end if;
    if customer is null then
      insert into public.customers(organization_id,name,email) values(org,client_name,client_email) returning id into customer;
      insert into public.funnel_events(user_id,name) values(owner,'client_created');
    end if;
    insert into public.invoices(organization_id,customer_id,invoice_number,amount_cents,due_date,import_key,import_details,reviewed_at,reminder_scenario)
      values(org,customer,invoice_ref,amount,due,fingerprint,item->'details',now(),case when schedule then scenario else null end) returning id into invoice;
    created_count:=created_count+1;
    if schedule then
      last_at:=now();
      foreach offset_days in array offsets loop
        stage:='J'||case when offset_days>0 then '+' else '' end||offset_days::text;
        next_at:=greatest(((due+offset_days)::timestamp+time '09:00') at time zone 'UTC',last_at+interval '1 day');
        insert into public.reminders(organization_id,invoice_id,scheduled_for,stage) values(org,invoice,next_at,stage);
        reminder_count:=reminder_count+1; last_at:=next_at;
      end loop;
    end if;
  end loop;
  output:=jsonb_build_object('created',created_count,'duplicates',skipped_count,'scheduled',reminder_count);
  insert into public.import_batches(id,organization_id,result) values(batch_id,org,output);
  delete from public.import_drafts where user_id=owner and import_drafts.batch_id=confirm_import.batch_id;
  insert into public.funnel_events(user_id,name,properties) values(owner,'import_reviewed',output);
  if created_count>0 then insert into public.funnel_events(user_id,name,properties) values(owner,'invoice_created',jsonb_build_object('count',created_count)); end if;
  if reminder_count>0 then insert into public.funnel_events(user_id,name) values(owner,'first_reminder_scheduled') on conflict do nothing; end if;
  insert into public.onboarding_state(user_id,stage) values(owner,case when reminder_count>0 then 'scheduled' else 'draft' end)
    on conflict(user_id) do update set stage=case when public.onboarding_state.stage='scheduled' then 'scheduled' else excluded.stage end,updated_at=now();
  return output;
end $$;
revoke all on function public.confirm_import(uuid,jsonb,boolean,text) from public,anon;
grant execute on function public.confirm_import(uuid,jsonb,boolean,text) to authenticated;

-- Existing drafts can be completed later without creating another invoice.
create function public.activate_imported_invoice(target_invoice uuid, confirmed_email text, chosen_scenario text)
returns integer language plpgsql security invoker set search_path='' as $$
declare inv public.invoices; org public.organizations; d integer; offsets integer[]; at_time timestamptz:=now(); n integer:=0;
begin
  if auth.uid() is null or chosen_scenario is null or confirmed_email is null or chosen_scenario not in ('gentle','complete') or confirmed_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_review'; end if;
  select * into inv from public.invoices where id=target_invoice for update;
  if inv.id is null or inv.import_key is null or inv.status<>'open' then raise exception 'invoice_unavailable'; end if;
  select * into org from public.organizations where id=inv.organization_id and owner_id=auth.uid();
  if org.id is null then raise exception 'forbidden'; end if;
  if not (org.subscription_status='active' or (org.subscription_status='trialing' and (org.stripe_subscription_id is not null or org.created_at+interval '14 days'>now()))) then raise exception 'subscription_required'; end if;
  if inv.reminder_scenario is not null then return 0; end if;
  update public.customers set email=lower(trim(confirmed_email)) where id=inv.customer_id and organization_id=org.id;
  offsets:=case when chosen_scenario='complete' then array[-3,1,7,15,30] else array[1,7,15] end;
  foreach d in array offsets loop
    at_time:=greatest(((inv.due_date+d)::timestamp+time '09:00') at time zone 'UTC',at_time+interval '1 day');
    insert into public.reminders(organization_id,invoice_id,scheduled_for,stage) values(org.id,inv.id,at_time,'J'||case when d>0 then '+' else '' end||d::text);
    n:=n+1;
  end loop;
  update public.invoices set reminder_scenario=chosen_scenario,reviewed_at=now() where id=inv.id;
  insert into public.funnel_events(user_id,name) values(auth.uid(),'first_reminder_scheduled') on conflict do nothing;
  update public.onboarding_state set stage='scheduled',updated_at=now() where user_id=auth.uid();
  return n;
end $$;
revoke all on function public.activate_imported_invoice(uuid,text,text) from public,anon;
grant execute on function public.activate_imported_invoice(uuid,text,text) to authenticated;

-- Subscription measurement follows the existing Stripe synchronization; no change
-- to Stripe prices, trials, webhook processing or Customer Portal configuration.
create function public.measure_subscription() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.subscription_status='active' and old.subscription_status is distinct from 'active' then
    insert into public.funnel_events(user_id,name) values(new.owner_id,'subscription_started');
  end if;
  return new;
end $$;
revoke all on function public.measure_subscription() from public,anon,authenticated;
create trigger measure_subscription after update of subscription_status on public.organizations for each row execute function public.measure_subscription();

-- Filter BEFORE the limit so expired trials cannot block another user's queue.
create function public.due_reminder_batch() returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',r.id,'stage',r.stage,'invoice_id',r.invoice_id,
    'invoices',jsonb_build_object('id',i.id,'organization_id',i.organization_id,'invoice_number',i.invoice_number,
      'amount_cents',i.amount_cents,'status',i.status,'import_key',i.import_key,'reviewed_at',i.reviewed_at,'reminder_scenario',i.reminder_scenario,
      'customers',jsonb_build_object('name',c.name,'email',c.email),
      'organizations',jsonb_build_object('created_at',o.created_at,'subscription_status',o.subscription_status,'stripe_subscription_id',o.stripe_subscription_id)))
  from public.reminders r join public.invoices i on i.id=r.invoice_id and i.organization_id=r.organization_id
    join public.customers c on c.id=i.customer_id and c.organization_id=i.organization_id
    join public.organizations o on o.id=i.organization_id
  where r.state='pending' and r.scheduled_for<=now() and i.status='open' and c.email is not null
    and (i.import_key is null or (i.reviewed_at is not null and i.reminder_scenario is not null
      and (o.subscription_status='active' or (o.subscription_status='trialing' and (o.stripe_subscription_id is not null or o.created_at+interval '14 days'>now())))))
  order by r.scheduled_for,r.id limit 50
$$;
revoke all on function public.due_reminder_batch() from public,anon,authenticated;
grant execute on function public.due_reminder_batch() to service_role;
commit;
