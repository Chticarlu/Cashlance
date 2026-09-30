-- PREPRODUCTION / SUPABASE TEST ONLY until final audit passes.
begin;
-- Client sessions may read their own data through RLS, but all mutations must
-- pass through reviewed RPCs or server-side service-role routes.
revoke insert, update, delete, truncate, references, trigger
  on public.customers from authenticated;
revoke update, delete, truncate, references, trigger
  on public.invoices from authenticated;
commit;
