begin;
revoke all privileges on table public.onboarding_email_deliveries from anon, authenticated;
revoke all privileges on table public.import_analyses from anon, authenticated;
commit;
