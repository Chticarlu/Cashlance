-- Only the authenticated application server can reserve calls or read cached results.
-- No document bytes or filenames are stored. Existing business tables are unchanged.
create table if not exists public.import_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_hash text not null check (document_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 20000))
);
create index if not exists import_analyses_user_time on public.import_analyses(user_id,created_at desc);
create index if not exists import_analyses_time on public.import_analyses(created_at);
alter table public.import_analyses enable row level security;
revoke all on public.import_analyses from public,anon,authenticated;
grant select,insert,update,delete on public.import_analyses to service_role;

create or replace function public.reserve_import_analysis(p_user_id uuid,p_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior public.import_analyses; new_id uuid;
begin
  if p_user_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_analysis'; end if;
  -- Serialize reservations across serverless instances, including the global quota.
  perform pg_advisory_xact_lock(780102026);
  -- Lazy expiry: never return a result older than 24h. Purge expired content on use.
  update public.import_analyses set result=null where created_at < now()-interval '24 hours' and result is not null;
  delete from public.import_analyses where created_at < now()-interval '7 days';
  select * into prior from public.import_analyses
    where user_id=p_user_id and document_hash=p_hash and created_at>now()-interval '24 hours'
      and status='completed' and result is not null order by created_at desc limit 1;
  if found then return jsonb_build_object('status','cached','result',prior.result); end if;
  if exists(select 1 from public.import_analyses where user_id=p_user_id and status='pending' and created_at>now()-interval '90 seconds')
    then return jsonb_build_object('status','busy'); end if;
  if (select count(*) from public.import_analyses where user_id=p_user_id and created_at>now()-interval '1 minute')>=10
    or (select count(*) from public.import_analyses where user_id=p_user_id and created_at>now()-interval '24 hours')>=20
    or (select count(*) from public.import_analyses where created_at>now()-interval '24 hours')>=200
    then return jsonb_build_object('status','limited'); end if;
  insert into public.import_analyses(user_id,document_hash) values(p_user_id,p_hash) returning id into new_id;
  return jsonb_build_object('status','new','id',new_id);
end $$;
revoke all on function public.reserve_import_analysis(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_import_analysis(uuid,text) to service_role;
