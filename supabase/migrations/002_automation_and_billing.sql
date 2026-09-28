alter table public.organizations
  add column if not exists plan text not null default 'trial' check (plan in ('trial','solo','pro','team')),
  add column if not exists subscription_status text not null default 'trialing' check (subscription_status in ('trialing','active','past_due','cancelled')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.invoices
  add column if not exists promise_date date,
  add column if not exists dispute_reason text,
  add column if not exists last_contact_at timestamptz;

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete set null,
  provider_message_id text,
  recipient_email text not null,
  subject text not null,
  body_text text not null,
  state text not null default 'queued' check(state in ('queued','sent','failed','delivered','bounced')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  provider_message_id text unique,
  sender_email text not null,
  subject text,
  body_text text,
  classification text not null default 'other' check(classification in ('promise','paid','dispute','duplicate','other')),
  extracted_date date,
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists outbound_invoice_idx on public.outbound_messages(invoice_id, created_at desc);
create index if not exists inbound_invoice_idx on public.inbound_messages(invoice_id, created_at desc);

alter table public.outbound_messages enable row level security;
alter table public.inbound_messages enable row level security;

grant select, insert, update, delete on public.outbound_messages, public.inbound_messages to authenticated;

create policy "org outbound messages" on public.outbound_messages for all to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));

create policy "org inbound messages" on public.inbound_messages for all to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));
