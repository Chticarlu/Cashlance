begin;
alter table public.reminders drop constraint if exists reminders_stage_check;
alter table public.reminders add constraint reminders_stage_check
  check (stage='J-3' or stage ~ '^J[+]([1-9]|[1-5][0-9]|60)$');
commit;
