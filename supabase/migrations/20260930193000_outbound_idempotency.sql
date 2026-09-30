-- PREPRODUCTION/TEST ONLY until final audit.
begin;
create unique index if not exists outbound_messages_one_per_reminder
  on public.outbound_messages(reminder_id)
  where reminder_id is not null;
commit;
