-- Applied and verified in Supabase Test only. Do not deploy to production until final audit.
-- Existing reviewed import RPCs keep caller identity via auth.uid(), with a fixed search_path.
BEGIN;
ALTER FUNCTION public.confirm_import(uuid,jsonb,boolean,text) SECURITY DEFINER;
ALTER FUNCTION public.activate_imported_invoice(uuid,text,text) SECURITY DEFINER;
REVOKE INSERT ON public.invoices, public.reminders FROM authenticated;
COMMIT;
