begin;
do $$
declare source text; fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace
      and p.proname in ('activate_imported_invoice_server','confirm_import_server')
  loop
    source:=pg_get_functiondef(fn);
    if position('(now() at time zone ''UTC'')::date' in source)>0 then
      execute replace(source,'(now() at time zone ''UTC'')::date','(now() at time zone ''Europe/Paris'')::date');
    end if;
  end loop;
end $$;
commit;
