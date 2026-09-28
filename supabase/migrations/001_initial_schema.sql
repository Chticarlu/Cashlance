create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  unique(owner_id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  email text,
  created_at timestamptz not null default now(),
  unique(organization_id, email)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_number text,
  amount_cents integer not null check(amount_cents > 0),
  due_date date not null,
  status text not null default 'open' check(status in ('open','promised','disputed','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  scheduled_for timestamptz not null,
  stage text not null check(stage in ('J-3','J+1','J+7','J+15','J+30')),
  state text not null default 'pending' check(state in ('pending','sent','cancelled','needs_review')),
  created_at timestamptz not null default now(),
  unique(invoice_id, stage)
);

create index if not exists invoices_org_due_idx on public.invoices(organization_id, due_date);
create index if not exists reminders_pending_idx on public.reminders(state, scheduled_for) where state = 'pending';

alter table public.organizations enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.reminders enable row level security;

grant select, insert, update, delete on public.organizations, public.customers, public.invoices, public.reminders to authenticated;

create policy "owner organizations" on public.organizations for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "org customers" on public.customers for all to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));

create policy "org invoices" on public.invoices for all to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));

create policy "org reminders" on public.reminders for all to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));

create or replace function public.schedule_invoice_reminders()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.reminders(organization_id, invoice_id, scheduled_for, stage)
  values
    (new.organization_id, new.id, (new.due_date - 3)::timestamp + time '09:00', 'J-3'),
    (new.organization_id, new.id, (new.due_date + 1)::timestamp + time '09:00', 'J+1'),
    (new.organization_id, new.id, (new.due_date + 7)::timestamp + time '09:00', 'J+7'),
    (new.organization_id, new.id, (new.due_date + 15)::timestamp + time '09:00', 'J+15'),
    (new.organization_id, new.id, (new.due_date + 30)::timestamp + time '09:00', 'J+30')
  on conflict (invoice_id, stage) do nothing;
  return new;
end;
$$;

revoke all on function public.schedule_invoice_reminders() from public, anon, authenticated;

drop trigger if exists trg_schedule_invoice_reminders on public.invoices;
create trigger trg_schedule_invoice_reminders
after insert on public.invoices
for each row execute function public.schedule_invoice_reminders();
