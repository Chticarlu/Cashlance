begin;
-- Technical delivery receipt. Never interpret delivery as human reading.
alter table public.outbound_messages add column if not exists delivered_at timestamptz;
alter table public.outbound_messages add column if not exists delivery_failed_at timestamptz;
alter table public.outbound_messages add column if not exists delivery_error text;
alter table public.outbound_messages add column if not exists replied_at timestamptz;
create index if not exists outbound_messages_provider_delivery_idx
 on public.outbound_messages(provider_message_id) where provider_message_id is not null;
-- Existing 'failed', 'bounced', 'delivered' states are already allowed.
create or replace function public.record_resend_delivery(p_provider_id text,p_event text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare message public.outbound_messages; next_state text; changed boolean:=false;
begin
 if p_provider_id is null or length(p_provider_id) not between 1 and 160
   or p_event not in ('email.delivered','email.bounced','email.failed','email.suppressed','email.delivery_delayed')
 then raise exception 'invalid_delivery_event'; end if;
 select * into message from public.outbound_messages
 where provider_message_id=p_provider_id
 order by created_at desc limit 1 for update;
 if message.id is null then return jsonb_build_object('matched',false); end if;
 next_state:=case
   when p_event='email.delivered' then 'delivered'
   when p_event='email.bounced' then 'bounced'
   when p_event in ('email.failed','email.suppressed') then 'failed'
   else message.state end;
 if p_event='email.delivered' and message.state in ('queued','sent') then
   update public.outbound_messages set state='delivered',delivered_at=coalesce(delivered_at,now())
   where id=message.id; changed:=true;
 elsif p_event in ('email.bounced','email.failed','email.suppressed') and message.state not in ('failed','bounced') then
   update public.outbound_messages set state=next_state,
     delivery_failed_at=coalesce(delivery_failed_at,now()),
     delivery_error=case p_event when 'email.bounced' then 'Rebond : destinataire non joignable'
       when 'email.suppressed' then 'Adresse bloquée par le fournisseur'
       else 'Échec de livraison signalé par le fournisseur' end
   where id=message.id; changed:=true;
 elsif p_event='email.bounced' and message.state='failed' then
   update public.outbound_messages set state='bounced',
     delivery_failed_at=coalesce(delivery_failed_at,now()),
     delivery_error='Rebond : destinataire non joignable'
   where id=message.id; changed:=true;
 end if;
 -- A failed address should not receive further automated reminders until reviewed.
 if p_event in ('email.bounced','email.failed','email.suppressed') then
   update public.reminders set state='needs_review'
   where invoice_id=message.invoice_id and organization_id=message.organization_id
     and state='pending';
 end if;
 return jsonb_build_object('matched',true,'changed',changed,'invoice_id',message.invoice_id);
end $$;
revoke all on function public.record_resend_delivery(text,text) from public,anon,authenticated;
grant execute on function public.record_resend_delivery(text,text) to service_role;
commit;
