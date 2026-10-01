begin;
do $guard$
declare definition text; old_block text := 'if inv.reminder_scenario is not null then return 0; end if;'; new_block text := $new$
if inv.reminder_scenario is not null then return 0; end if;
if inv.reminders_stopped_at is not null
   or inv.last_contact_at is not null
   or exists (select 1 from public.reminders r where r.invoice_id=inv.id)
then raise exception 'invoice_already_processed'; end if;
$new$;
begin
select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='activate_imported_invoice_server'
and pg_get_function_identity_arguments(p.oid)='p_owner uuid, target_invoice uuid, confirmed_email text, chosen_scenario text';
if definition is null then raise exception 'activation_function_not_found'; end if;
definition:=replace(definition,chr(13),'');
old_block:=E'  if inv.reminder_scenario is not null then\\n    return 0;\\n  end if;';
if position(old_block in definition)=0 then
  old_block:='if inv.reminder_scenario is not null then return 0; end if;';
end if;
if position(old_block in definition)=0 then raise exception 'expected_activation_guard_missing'; end if;
execute replace(definition,old_block,new_block);
end $guard$;
commit;