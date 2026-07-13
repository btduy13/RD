-- RD Accounting: one cloud database, many direct-connected stations.
begin;

create table if not exists public.rd_workspaces (
  id uuid primary key,
  name text not null,
  sync_version bigint not null default 0,
  created_at timestamptz not null default now()
);

insert into public.rd_workspaces(id, name)
values (
  '00000000-0000-4000-8000-000000000001',
  'Rang Dong'
)
on conflict (id) do nothing;

alter table public.rd_accounting_data add column if not exists workspace_id uuid;
alter table public.rd_accounting_data add column if not exists sync_version bigint not null default 0;
alter table public.rd_accounting_data add column if not exists updated_by text;
alter table public.rd_accounting_data add column if not exists deleted_at timestamptz;
update public.rd_accounting_data
set workspace_id = '00000000-0000-4000-8000-000000000001'
where workspace_id is null;
alter table public.rd_accounting_data alter column workspace_id set not null;

do $$
declare v_pk text;
begin
  select conname into v_pk from pg_constraint
  where conrelid = 'public.rd_accounting_data'::regclass and contype = 'p';
  if v_pk is not null then execute format('alter table public.rd_accounting_data drop constraint %I', v_pk); end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.rd_accounting_data'::regclass and conname = 'rd_accounting_data_workspace_id_id_key') then
    alter table public.rd_accounting_data add constraint rd_accounting_data_workspace_id_id_key unique(workspace_id, id);
  end if;
end $$;
create index if not exists idx_rd_accounting_workspace_version on public.rd_accounting_data(workspace_id, sync_version, id);

create or replace function public.rd_cloud_status(p_workspace_id uuid)
returns table(workspace_id uuid, sync_version bigint)
language plpgsql security definer set search_path = public
as $$
begin
  return query select w.id, w.sync_version from public.rd_workspaces w where w.id = p_workspace_id;
end;
$$;

create or replace function public.rd_sync_snapshot(p_workspace_id uuid, p_after_id text default null, p_limit integer default 500)
returns setof public.rd_accounting_data language plpgsql security definer set search_path = public
as $$
begin
  return query select d.* from public.rd_accounting_data d
    where d.workspace_id = p_workspace_id and (p_after_id is null or d.id > p_after_id)
    order by d.id limit least(greatest(p_limit, 1), 1000);
end;
$$;

create or replace function public.rd_sync_delta(p_workspace_id uuid, p_after_version bigint, p_after_id text default null, p_limit integer default 500)
returns setof public.rd_accounting_data language plpgsql security definer set search_path = public
as $$
begin
  return query select d.* from public.rd_accounting_data d where d.workspace_id = p_workspace_id and (
    d.sync_version > coalesce(p_after_version, 0) or
    (d.sync_version = coalesce(p_after_version, 0) and p_after_id is not null and d.id > p_after_id)
  ) order by d.sync_version, d.id limit least(greatest(p_limit, 1), 1000);
end;
$$;

create or replace function public.rd_ids_by_prefix(p_workspace_id uuid,p_prefix text,p_after_id text default null,p_limit integer default 1000)
returns table(id text,last_modified bigint) language plpgsql security definer set search_path=public
as $$
begin
  return query select d.id,d.last_modified from public.rd_accounting_data d
    where d.workspace_id=p_workspace_id and left(d.id,length(p_prefix))=p_prefix
      and (p_after_id is null or d.id>p_after_id)
    order by d.id limit least(greatest(p_limit,1),1000);
end;
$$;

create or replace function public.rd_find_ids(p_workspace_id uuid,p_ids text[])
returns table(id text) language plpgsql security definer set search_path=public
as $$
begin
  return query select d.id from public.rd_accounting_data d where d.workspace_id=p_workspace_id and d.id=any(p_ids);
end;
$$;

create or replace function public.rd_apply_sync_transaction(
  p_workspace_id uuid, p_expected_sync_version bigint, p_rows jsonb, p_updated_by text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_current bigint; v_next bigint; v_row jsonb;
begin
  select sync_version into v_current from public.rd_workspaces where id = p_workspace_id for update;
  if v_current is distinct from coalesce(p_expected_sync_version, 0) then
    return jsonb_build_object('ok', false, 'conflict', true, 'sync_version', v_current);
  end if;
  v_next := v_current + 1;
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if nullif(v_row->>'id', '') is null then raise exception 'ROW_ID_REQUIRED'; end if;
    insert into public.rd_accounting_data(workspace_id,id,data,last_modified,is_syncing,updated_at,sync_version,updated_by,deleted_at)
    values(p_workspace_id,v_row->>'id',coalesce(v_row->'data','{}'::jsonb),coalesce((v_row->>'last_modified')::bigint,(extract(epoch from clock_timestamp())*1000)::bigint),false,now(),v_next,nullif(p_updated_by,''),case when coalesce((v_row->'data'->>'_deleted')::boolean,false) then now() else null end)
    on conflict(workspace_id,id) do update set data=excluded.data,last_modified=excluded.last_modified,is_syncing=false,updated_at=now(),sync_version=v_next,updated_by=excluded.updated_by,deleted_at=excluded.deleted_at;
  end loop;
  update public.rd_workspaces set sync_version=v_next where id=p_workspace_id;
  return jsonb_build_object('ok',true,'conflict',false,'sync_version',v_next);
end;
$$;

create or replace function public.rd_reserve_voucher_id(p_workspace_id uuid,p_lock_id text,p_data jsonb,p_updated_by text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_current bigint; v_next bigint; v_inserted integer;
begin
  select sync_version into v_current from public.rd_workspaces where id=p_workspace_id for update;
  v_next:=v_current+1;
  insert into public.rd_accounting_data(workspace_id,id,data,last_modified,is_syncing,updated_at,sync_version,updated_by)
  values(p_workspace_id,p_lock_id,coalesce(p_data,'{}'::jsonb),(extract(epoch from clock_timestamp())*1000)::bigint,false,now(),v_next,p_updated_by)
  on conflict(workspace_id,id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=1 then update public.rd_workspaces set sync_version=v_next where id=p_workspace_id; return jsonb_build_object('reserved',true,'sync_version',v_next); end if;
  return jsonb_build_object('reserved',false,'sync_version',v_current);
end;
$$;

alter table public.rd_accounting_data enable row level security;
drop policy if exists "Allow public read" on public.rd_accounting_data;
drop policy if exists "Allow public insert" on public.rd_accounting_data;
drop policy if exists "Allow public update" on public.rd_accounting_data;
drop policy if exists "Allow public delete" on public.rd_accounting_data;
drop policy if exists "Workspace members read accounting data" on public.rd_accounting_data;
revoke all on public.rd_accounting_data from anon, authenticated;
grant execute on function public.rd_cloud_status(uuid) to anon, authenticated;
grant execute on function public.rd_sync_snapshot(uuid,text,integer) to anon, authenticated;
grant execute on function public.rd_sync_delta(uuid,bigint,text,integer) to anon, authenticated;
grant execute on function public.rd_ids_by_prefix(uuid,text,text,integer) to anon, authenticated;
grant execute on function public.rd_find_ids(uuid,text[]) to anon, authenticated;
grant execute on function public.rd_apply_sync_transaction(uuid,bigint,jsonb,text) to anon, authenticated;
grant execute on function public.rd_reserve_voucher_id(uuid,text,jsonb,text) to anon, authenticated;
commit;
