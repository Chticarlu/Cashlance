begin;
create or replace function public.edit_invoice_server(
 p_owner uuid,target_invoice uuid,p_issuer text,p_client text,p_email text,
 p_number text,p_amount_cents integer,p_due_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.invoices; cust public.customers; changed boolean; new_customer uuid;
begin
 if p_owner is null or target_invoice is null then raise exception 'invalid_request'; end if;
 select i.* into inv from public.invoices i join public.organizations o on o.id=i.organization_id
 where i.id=target_invoice and o.owner_id=p_owner for update of i;
 if inv.id is null then raise exception 'invoice_not_found'; end if;
 select * into cust from public.customers where id=inv.customer_id and organization_id=inv.organization_id;
 if cust.id is null then raise exception 'customer_not_found'; end if;
 if p_issuer is null or length(trim(p_issuer))>200
 or p_client is null or length(trim(p_client)) not between 2 and 160
 or p_email is null or length(trim(p_email))>254
 or (trim(p_email)<>'' and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 or p_number is null or length(trim(p_number))>100
 or p_amount_cents is null or p_amount_cents<1 or p_amount_cents>1000000000
 or p_due_date is null or p_due_date<date '2000-01-01' or p_due_date>current_date+interval '10 years'
 then raise exception 'invalid_invoice_fields'; end if;
 changed:=trim(p_client) is distinct from cust.name
   or nullif(lower(trim(p_email)),'') is distinct from cust.email
   or nullif(trim(p_number),'') is distinct from inv.invoice_number
   or p_amount_cents is distinct from inv.amount_cents
   or p_due_date is distinct from inv.due_date;
 if changed and (
   inv.status<>'open' or inv.reminder_scenario is not null or inv.reminders_stopped_at is not null
   or inv.last_contact_at is not null
   or exists(select 1 from public.reminders where invoice_id=inv.id)
   or exists(select 1 from public.outbound_messages where invoice_id=inv.id)
   or exists(select 1 from public.inbound_messages where invoice_id=inv.id)
 ) then raise exception 'financial_fields_locked'; end if;
 if changed and (trim(p_client) is distinct from cust.name or nullif(lower(trim(p_email)),'') is distinct from cust.email) then
   -- Never rewrite a customer shared with other invoices.
   perform 1 from public.customers where id=cust.id for update;
   if not exists(select 1 from public.invoices where customer_id=cust.id and id<>inv.id) then
     update public.customers set name=trim(p_client),email=nullif(lower(trim(p_email)),'') where id=cust.id;
     new_customer:=cust.id;
   else
   insert into public.customers(organization_id,name,email)
   values(inv.organization_id,trim(p_client),nullif(lower(trim(p_email)),''))
   returning id into new_customer;
   end if;
 else new_customer:=inv.customer_id; end if;
 update public.invoices
 set customer_id=new_customer,
 invoice_number=case when changed then nullif(trim(p_number),'') else invoice_number end,
 amount_cents=case when changed then p_amount_cents else amount_cents end,
 due_date=case when changed then p_due_date else due_date end,
 import_details=jsonb_set(coalesce(import_details,'{}'::jsonb),'{issuer}',to_jsonb(trim(p_issuer)),true)
 where id=target_invoice;
 return jsonb_build_object('ok',true,'financial_fields_updated',changed);
end $$;
revoke all on function public.edit_invoice_server(uuid,uuid,text,text,text,text,integer,date) from public,anon,authenticated;
grant execute on function public.edit_invoice_server(uuid,uuid,text,text,text,text,integer,date) to service_role;
commit;