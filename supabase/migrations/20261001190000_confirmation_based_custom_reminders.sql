begin;
-- Confirmation-date scheduling; positive custom offsets strictly increasing, bounded 1..60 days.
create or replace function public.resolve_reminder_offsets(p_scenario text,p_due date,p_confirmed date)
returns integer[] language plpgsql stable security invoker set search_path='' as $$
declare result integer[]; i integer;
begin
  if p_scenario is null or p_due is null or p_confirmed is null then raise exception 'invalid_reminder_schedule'; end if;
  if p_scenario='gentle' then
    result:=array[1,7,15];
  elsif p_scenario='complete' then
    -- When already overdue, start a new complete sequence at confirmation, not in the past.
    result:=case when p_due<p_confirmed then array[1,4,10,18,33] else array[-3,1,7,15,30] end;
  elsif p_scenario ~ '^custom:([1-9]|[1-5][0-9]|60)(,([1-9]|[1-5][0-9]|60)){0,4}$' then
    result:=string_to_array(substring(p_scenario from 8),',')::integer[];
    for i in 2..cardinality(result) loop
      if result[i]<=result[i-1] then raise exception 'invalid_reminder_schedule'; end if;
    end loop;
  else raise exception 'invalid_reminder_schedule';
  end if;
  return result;
end $$;
revoke all on function public.resolve_reminder_offsets(text,date,date) from public,anon,authenticated;
grant execute on function public.resolve_reminder_offsets(text,date,date) to service_role;

CREATE OR REPLACE FUNCTION public.activate_imported_invoice_server(p_owner uuid, target_invoice uuid, confirmed_email text, chosen_scenario text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inv public.invoices;
  org public.organizations;
  d integer;
  offsets integer[];
  at_time timestamptz := now();
  n integer := 0;
begin
  if p_owner is null
    or chosen_scenario is null
    or confirmed_email is null
    or not (chosen_scenario in ('gentle','complete') or chosen_scenario like 'custom:%')
    or confirmed_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'invalid_review';
  end if;

  select *
  into inv
  from public.invoices
  where id = target_invoice
  for update;

  if inv.id is null
    or inv.import_key is null
    or inv.status <> 'open'
  then
    raise exception 'invoice_unavailable';
  end if;

  select *
  into org
  from public.organizations
  where id = inv.organization_id
    and owner_id = p_owner;

  if org.id is null then
    raise exception 'forbidden';
  end if;

  if not (
    org.subscription_status = 'active'
    or (
      org.subscription_status = 'trialing'
      and (
        org.stripe_subscription_id is not null
        or org.created_at + interval '14 days' > now()
      )
    )
  ) then
    raise exception 'subscription_required';
  end if;


if inv.reminder_scenario is not null then return 0; end if;
if inv.reminders_stopped_at is not null
   or inv.last_contact_at is not null
   or exists (select 1 from public.reminders r where r.invoice_id=inv.id)
then raise exception 'invoice_already_processed'; end if;


  update public.customers
  set email = lower(trim(confirmed_email))
  where id = inv.customer_id
    and organization_id = org.id;

  offsets := public.resolve_reminder_offsets(chosen_scenario, inv.due_date, (now() at time zone 'UTC')::date);

  foreach d in array offsets
  loop
    at_time :=
      greatest(
        ((greatest(inv.due_date, (now() at time zone 'UTC')::date) + d)::timestamp + time '09:00') at time zone 'UTC',
        at_time + interval '1 day'
      );

    insert into public.reminders(
      organization_id,
      invoice_id,
      scheduled_for,
      stage
    )
    values(
      org.id,
      inv.id,
      at_time,
      'J'
      || case when d > 0 then '+' else '' end
      || d::text
    );

    n := n + 1;
  end loop;

  update public.invoices
  set
    reminder_scenario = chosen_scenario,
    reviewed_at = now()
  where id = inv.id;

  insert into public.funnel_events(user_id,name)
  values(p_owner,'first_reminder_scheduled')
  on conflict do nothing;

  update public.onboarding_state
  set
    stage = 'scheduled',
    updated_at = now()
  where user_id = p_owner;

  return n;
end
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_import_server(p_owner uuid, batch_id uuid, rows jsonb, schedule boolean, scenario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org uuid;
  org_created timestamptz;
  org_status text;
  org_subscription text;
  previous jsonb;
  item jsonb;
  customer uuid;
  invoice uuid;
  fingerprint text;
  client_name text;
  client_email text;
  amount integer;
  due date;
  invoice_ref text;
  created_count integer := 0;
  skipped_count integer := 0;
  reminder_count integer := 0;
  stage text;
  offsets integer[];
  offset_days integer;
  next_at timestamptz;
  last_at timestamptz;
  output jsonb;
begin
  if p_owner is null then
    raise exception 'authentication_required';
  end if;

  if rows is null
    or jsonb_typeof(rows) <> 'array'
    or jsonb_array_length(rows) not between 1 and 200
  then
    raise exception 'invalid_batch';
  end if;

  if scenario is null
    or not (scenario in ('gentle','complete') or scenario like 'custom:%')
    or schedule is null
  then
    raise exception 'invalid_scenario';
  end if;

  insert into public.organizations(owner_id,name)
  values(p_owner,'Mon entreprise')
  on conflict(owner_id) do nothing;

  select id,created_at,subscription_status,stripe_subscription_id
  into org,org_created,org_status,org_subscription
  from public.organizations
  where owner_id = p_owner
  for update;

  select result
  into previous
  from public.import_batches
  where id = batch_id
    and organization_id = org;

  if previous is not null then
    return previous;
  end if;

  if schedule and not (
    org_status = 'active'
    or (
      org_status = 'trialing'
      and (
        org_subscription is not null
        or org_created + interval '14 days' > now()
      )
    )
  ) then
    raise exception 'subscription_required';
  end if;


for item in
    select value
    from jsonb_array_elements(rows)
  loop
    if item->>'confirmed' is distinct from 'true'
      or item->>'currency' is distinct from 'EUR'
    then
      raise exception 'review_required';
    end if;

    client_name := trim(item->>'client');
    client_email := nullif(lower(trim(item->>'email')),'');
    invoice_ref := trim(item->>'invoiceNumber');
    amount := (item->>'amount_cents')::integer;
    due := (item->>'due')::date;

    if coalesce(length(client_name),0) not between 1 and 160
      or coalesce(length(invoice_ref),0) not between 1 and 160
      or amount is null
      or amount <= 0
      or due is null
    then
      raise exception 'invalid_invoice';
    end if;

    if schedule and (
      client_email is null
      or client_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) then
      raise exception 'email_required';
    end if;

    if octet_length(item::text) > 12000
      or item ? 'demo'
    then
      raise exception 'invalid_invoice';
    end if;

    fingerprint :=
      encode(
        sha256(
          convert_to(
            lower(regexp_replace(client_name,'\s+',' ','g'))
            || '|'
            || lower(invoice_ref),
            'UTF8'
          )
        ),
        'hex'
      );

    if exists (
      select 1
      from public.invoices i
      join public.customers c
        on c.id = i.customer_id
      where i.organization_id = org
        and (
          i.import_key = fingerprint
          or (
            lower(trim(i.invoice_number)) = lower(invoice_ref)
            and lower(trim(c.name)) = lower(client_name)
          )
        )
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    customer := null;

    if client_email is not null then
      select id
      into customer
      from public.customers
      where organization_id = org
        and email = client_email;

      if customer is not null
        and not exists (
          select 1
          from public.customers
          where id = customer
            and lower(trim(name)) = lower(client_name)
        )
      then
        raise exception 'customer_email_conflict';
      end if;
    end if;

    if customer is null then
      insert into public.customers(
        organization_id,
        name,
        email
      )
      values(
        org,
        client_name,
        client_email
      )
      returning id into customer;

      insert into public.funnel_events(user_id,name)
      values(p_owner,'client_created');
    end if;

    insert into public.invoices(
      organization_id,
      customer_id,
      invoice_number,
      amount_cents,
      due_date,
      import_key,
      import_details,
      reviewed_at,
      reminder_scenario
    )
    values(
      org,
      customer,
      invoice_ref,
      amount,
      due,
      fingerprint,
      item->'details',
      now(),
      case when schedule then scenario else null end
    )
    returning id into invoice;

    created_count := created_count + 1;

    if schedule then
      offsets := public.resolve_reminder_offsets(scenario, due, (now() at time zone 'UTC')::date);
      last_at := now();

      foreach offset_days in array offsets
      loop
        stage :=
          'J'
          || case when offset_days > 0 then '+' else '' end
          || offset_days::text;

        next_at :=
          greatest(
            ((greatest(due, (now() at time zone 'UTC')::date) + offset_days)::timestamp + time '09:00') at time zone 'UTC',
            last_at + interval '1 day'
          );

        insert into public.reminders(
          organization_id,
          invoice_id,
          scheduled_for,
          stage
        )
        values(
          org,
          invoice,
          next_at,
          stage
        );

        reminder_count := reminder_count + 1;
        last_at := next_at;
      end loop;
    end if;
  end loop;

  output :=
    jsonb_build_object(
      'created',created_count,
      'duplicates',skipped_count,
      'scheduled',reminder_count
    );

  insert into public.import_batches(
    id,
    organization_id,
    result
  )
  values(
    batch_id,
    org,
    output
  );

  delete from public.import_drafts
  where user_id = p_owner
    and import_drafts.batch_id = confirm_import_server.batch_id;

  insert into public.funnel_events(
    user_id,
    name,
    properties
  )
  values(
    p_owner,
    'import_reviewed',
    output
  );

  if created_count > 0 then
    insert into public.funnel_events(
      user_id,
      name,
      properties
    )
    values(
      p_owner,
      'invoice_created',
      jsonb_build_object('count',created_count)
    );
  end if;

  if reminder_count > 0 then
    insert into public.funnel_events(user_id,name)
    values(p_owner,'first_reminder_scheduled')
    on conflict do nothing;
  end if;

  insert into public.onboarding_state(
    user_id,
    stage
  )
  values(
    p_owner,
    case when reminder_count > 0 then 'scheduled' else 'draft' end
  )
  on conflict(user_id) do update
  set
    stage =
      case
        when public.onboarding_state.stage = 'scheduled'
          then 'scheduled'
        else excluded.stage
      end,
    updated_at = now();

  return output;
end
$function$
;
commit;
