-- Preview/Test-only until reviewed and regression-tested. Service role retains writes.
begin;
-- Provider delivery history is immutable from client sessions.
revoke insert, update, delete, truncate, references, trigger
  on public.outbound_messages, public.inbound_messages from authenticated;
-- The app schedules new reminders through invoker RPCs, so INSERT must remain
-- temporarily. Users may no longer falsify completion or delete reminders.
revoke update, delete, truncate, references, trigger
  on public.reminders from authenticated;
commit;
