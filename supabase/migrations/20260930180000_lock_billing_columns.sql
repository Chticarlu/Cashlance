-- Apply first in Supabase Test. Keep production unchanged until security tests pass.
-- Billing fields, subscription state and organization identity are server-managed.
begin;
revoke insert, update, delete, truncate, references, trigger
  on table public.organizations from authenticated;
-- confirm_import() remains SECURITY INVOKER and needs the ability to create
-- a default-valued organization for the logged-in owner.
grant insert (owner_id, name) on public.organizations to authenticated;
commit;
