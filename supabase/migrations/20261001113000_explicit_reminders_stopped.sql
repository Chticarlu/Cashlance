begin;
alter table public.invoices add column if not exists reminders_stopped_at timestamptz;
create or replace function public.manage_invoice_server(p_owner uuid,target_invoice uuid,action text,action_value text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.invoices; promise date; cancelled integer:=0;
begin
 if p_owner is null or target_invoice is null or action not in ('paid','promise','dispute','stop') then raise exception 'invalid_action'; end if;
 select i.* into inv from public.invoices i join public.organizations o on o.id=i.organization_id
 where i.id=target_invoice and o.owner_id=p_owner for update;
 if inv.id is null then raise exception 'invoice_not_found'; end if;
 if inv.status='paid' then
   if action='paid' then return jsonb_build_object('ok',true,'action','paid','cancelled_reminders',0,'already_paid',true); end if;
   raise exception 'invoice_already_paid';
 end if;
 if action='paid' then
   update public.invoices set status='paid',paid_at=coalesce(paid_at,now()),promise_date=null,dispute_reason=null,
     reminder_scenario=null,reminders_stopped_at=coalesce(reminders_stopped_at,now()) where id=target_invoice;
 elsif action='promise' then
   if action_value is null or action_value !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_promise_date'; end if;
   begin promise:=action_value::date; exception when others then raise exception 'invalid_promise_date'; end;
   if promise<current_date or promise>current_date+365 then raise exception 'invalid_promise_date'; end if;
   update public.invoices set status='promised',promise_date=promise,dispute_reason=null,paid_at=null,
     reminder_scenario=null,reminders_stopped_at=coalesce(reminders_stopped_at,now()) where id=target_invoice;
 elsif action='dispute' then
   if action_value is null or length(trim(action_value))<3 or length(action_value)>500 then raise exception 'invalid_dispute_reason'; end if;
   update public.invoices set status='disputed',dispute_reason=trim(action_value),promise_date=null,paid_at=null,
     reminder_scenario=null,reminders_stopped_at=coalesce(reminders_stopped_at,now()) where id=target_invoice;
 else
   update public.invoices set reminder_scenario=null,reminders_stopped_at=coalesce(reminders_stopped_at,now())
   where id=target_invoice;
 end if;
 update public.reminders set state='cancelled' where invoice_id=target_invoice and state='pending';
 get diagnostics cancelled=row_count;
 return jsonb_build_object('ok',true,'action',action,'cancelled_reminders',cancelled);
end $$;
revoke all on function public.manage_invoice_server(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manage_invoice_server(uuid,uuid,text,text) to service_role;
commit;