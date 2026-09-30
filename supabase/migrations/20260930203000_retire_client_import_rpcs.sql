begin;
-- Legacy client-callable RPCs are no longer used by the application.
alter function public.confirm_import(uuid,jsonb,boolean,text) security invoker;
alter function public.activate_imported_invoice(uuid,text,text) security invoker;

revoke all on function public.confirm_import(uuid,jsonb,boolean,text) from public,anon,authenticated;
revoke all on function public.activate_imported_invoice(uuid,text,text) from public,anon,authenticated;

-- Server-only replacements stay executable only by service_role.
revoke all on function public.confirm_import_server(uuid,uuid,jsonb,boolean,text) from public,anon,authenticated;
revoke all on function public.activate_imported_invoice_server(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.confirm_import_server(uuid,uuid,jsonb,boolean,text) to service_role;
grant execute on function public.activate_imported_invoice_server(uuid,uuid,text,text) to service_role;
commit;
