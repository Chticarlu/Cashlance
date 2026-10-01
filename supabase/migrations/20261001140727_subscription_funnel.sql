begin;

-- Never start a local trial at signup; Checkout owns the 14-day trial.
alter table public.organizations alter column subscription_status set default 'cancelled';
alter table public.organizations add column if not exists stripe_snapshot_started timestamptz;
alter table public.organizations add column if not exists stripe_subscription_created bigint not null default 0;

create table if not exists public.stripe_processed_events (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  processed_at timestamptz not null default now()
);
alter table public.stripe_processed_events enable row level security;
revoke all on public.stripe_processed_events from public,anon,authenticated;
grant all on public.stripe_processed_events to service_role;

create or replace function public.sync_stripe_subscription(
  p_org uuid, p_customer text, p_subscription text, p_status text, p_plan text,
  p_started timestamptz, p_created bigint, p_event text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare org public.organizations;
begin
  if p_customer is null or p_subscription is null or p_started is null or p_created is null
    or p_status not in ('active','trialing','past_due','cancelled') or p_plan not in ('solo','pro','team')
  then raise exception 'invalid_stripe_snapshot'; end if;
  if p_org is not null then
    select * into strict org from public.organizations where id=p_org for update;
  else
    select * into strict org from public.organizations where stripe_customer_id=p_customer for update;
  end if;
  if org.stripe_customer_id is distinct from p_customer then raise exception 'stripe_customer_mismatch'; end if;
  if p_event is not null and exists(select 1 from public.stripe_processed_events where id=p_event) then
    return to_jsonb(org);
  end if;
  -- An older subscription or a slower Stripe read must never overwrite a newer snapshot.
  if (org.stripe_snapshot_started is null or p_started>=org.stripe_snapshot_started)
     and p_created>=org.stripe_subscription_created
     and (org.stripe_subscription_id is null or org.stripe_subscription_id=p_subscription
          or p_created>org.stripe_subscription_created
          or (org.subscription_status='cancelled' and p_status<>'cancelled')) then
    update public.organizations set stripe_subscription_id=p_subscription,subscription_status=p_status,
      plan=p_plan,stripe_snapshot_started=p_started,stripe_subscription_created=p_created
      where id=org.id returning * into org;
  end if;
  if p_event is not null then
    insert into public.stripe_processed_events(id,organization_id) values(p_event,org.id);
  end if;
  return to_jsonb(org);
end $$;
revoke all on function public.sync_stripe_subscription(uuid,text,text,text,text,timestamptz,bigint,text) from public,anon,authenticated;
grant execute on function public.sync_stripe_subscription(uuid,text,text,text,text,timestamptz,bigint,text) to service_role;

-- This is an ownership check plus a server-managed entitlement, never user_metadata.
create or replace function public.owner_has_subscription(owner uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select owner=(select auth.uid()) and exists(select 1 from public.organizations where owner_id=owner
    and stripe_subscription_id is not null and subscription_status in ('active','trialing'))
$$;
revoke all on function public.owner_has_subscription(uuid) from public,anon;
grant execute on function public.owner_has_subscription(uuid) to authenticated,service_role;

-- Restrictive policies compose with the existing ownership policies.
do $$ declare tbl text; begin
  foreach tbl in array array['customers','invoices','reminders','outbound_messages','inbound_messages','import_batches'] loop
    execute format('drop policy if exists subscription_read on public.%I',tbl);
    execute format('create policy subscription_read on public.%I as restrictive for select to authenticated using (public.owner_has_subscription((select auth.uid())))',tbl);
  end loop;
end $$;
drop policy if exists subscription_drafts on public.import_drafts;
create policy subscription_drafts on public.import_drafts as restrictive for all to authenticated
  using (public.owner_has_subscription((select auth.uid())))
  with check (public.owner_has_subscription((select auth.uid())));

-- Guard server RPCs and direct writes too. Keep legacy invoices subject to billing.
create or replace function public.guard_subscription_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.organizations where id=new.organization_id
    and stripe_subscription_id is not null and subscription_status in ('active','trialing'))
  then raise exception 'subscription_required'; end if;
  return new;
end $$;
revoke all on function public.guard_subscription_write() from public,anon,authenticated;
do $$ declare tbl text; begin
  foreach tbl in array array['customers','invoices','reminders','import_batches'] loop
    execute format('drop trigger if exists subscription_write on public.%I',tbl);
    execute format('create trigger subscription_write before insert or update on public.%I for each row execute function public.guard_subscription_write()',tbl);
  end loop;
end $$;

create or replace function public.due_reminder_batch() returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',r.id,'stage',r.stage,'invoice_id',r.invoice_id,
    'invoices',jsonb_build_object('id',i.id,'organization_id',i.organization_id,'invoice_number',i.invoice_number,
      'amount_cents',i.amount_cents,'status',i.status,'import_key',i.import_key,'reviewed_at',i.reviewed_at,'reminder_scenario',i.reminder_scenario,
      'customers',jsonb_build_object('name',c.name,'email',c.email),
      'organizations',jsonb_build_object('created_at',o.created_at,'subscription_status',o.subscription_status,'stripe_subscription_id',o.stripe_subscription_id)))
  from public.reminders r join public.invoices i on i.id=r.invoice_id and i.organization_id=r.organization_id
    join public.customers c on c.id=i.customer_id and c.organization_id=i.organization_id
    join public.organizations o on o.id=i.organization_id
  where r.state='pending' and r.scheduled_for<=now() and i.status='open' and c.email is not null
    and o.stripe_subscription_id is not null and o.subscription_status in ('active','trialing')
    and (i.import_key is null or (i.reviewed_at is not null and i.reminder_scenario is not null))
  order by r.scheduled_for,r.id limit 50
$$;
commit;
