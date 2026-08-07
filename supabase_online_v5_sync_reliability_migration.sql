-- RD Accounting V5: reliable Realtime signals and fast bounded sync helpers.
begin;

create index if not exists idx_rd_accounting_workspace_id_pattern
  on public.rd_accounting_data(workspace_id, id text_pattern_ops);

create or replace function public.rd_ids_by_prefix(
  p_workspace_id uuid,
  p_prefix text,
  p_after_id text default null,
  p_limit integer default 1000
)
returns table(id text, last_modified bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select d.id, d.last_modified
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id like
      replace(replace(replace(p_prefix, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
      escape E'\\'
    and (p_after_id is null or d.id > p_after_id)
    and (
      left(p_prefix, 5) <> 'lock_' or
      d.last_modified >= (extract(epoch from clock_timestamp()) * 1000)::bigint - 15 * 60 * 1000
    )
  order by d.id
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

create or replace function public.rd_rows_by_ids(p_workspace_id uuid, p_ids text[])
returns setof public.rd_accounting_data
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select d.*
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id = any(p_ids)
    and d.id not like 'lock\_%' escape '\'
  limit 1000;
end;
$$;

create or replace function public.rd_apply_sync_transaction(
  p_workspace_id uuid,
  p_expected_sync_version bigint,
  p_rows jsonb,
  p_updated_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
  v_next bigint;
begin
  select sync_version into v_current
  from public.rd_workspaces
  where id = p_workspace_id
  for update;

  if v_current is distinct from coalesce(p_expected_sync_version, 0) then
    return jsonb_build_object('ok', false, 'conflict', true, 'sync_version', v_current);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as rows(row_value)
    where nullif(row_value->>'id', '') is null
  ) then
    raise exception 'ROW_ID_REQUIRED';
  end if;

  v_next := v_current + 1;
  insert into public.rd_accounting_data(
    workspace_id, id, data, last_modified, is_syncing, updated_at,
    sync_version, updated_by, deleted_at
  )
  select
    p_workspace_id,
    row_value->>'id',
    case when row_value->>'id' = 'metadata'
      then coalesce(row_value->'data', '{}'::jsonb) - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys'
      else coalesce(row_value->'data', '{}'::jsonb)
    end,
    coalesce((row_value->>'last_modified')::bigint, (extract(epoch from clock_timestamp()) * 1000)::bigint),
    false,
    now(),
    v_next,
    nullif(p_updated_by, ''),
    case when coalesce((row_value->'data'->>'_deleted')::boolean, false) then now() else null end
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as rows(row_value)
  on conflict(workspace_id, id) do update set
    data = excluded.data,
    last_modified = excluded.last_modified,
    is_syncing = false,
    updated_at = now(),
    sync_version = v_next,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at;

  update public.rd_workspaces set sync_version = v_next where id = p_workspace_id;
  return jsonb_build_object('ok', true, 'conflict', false, 'sync_version', v_next);
end;
$$;

alter table public.rd_accounting_data enable row level security;
drop policy if exists "Allow public read" on public.rd_accounting_data;
drop policy if exists "Workspace members read accounting data" on public.rd_accounting_data;
drop policy if exists "Realtime read sync signal" on public.rd_accounting_data;
create policy "Realtime read sync signal"
  on public.rd_accounting_data
  for select
  to anon, authenticated
  using (id = 'sync_signal');

revoke all on public.rd_accounting_data from anon, authenticated;
grant select(workspace_id, id, sync_version, updated_by)
  on public.rd_accounting_data to anon, authenticated;

revoke execute on function public.rd_ids_by_prefix(uuid, text, text, integer) from public;
revoke execute on function public.rd_rows_by_ids(uuid, text[]) from public;
revoke execute on function public.rd_apply_sync_transaction(uuid, bigint, jsonb, text) from public;
grant execute on function public.rd_ids_by_prefix(uuid, text, text, integer) to anon, authenticated;
grant execute on function public.rd_rows_by_ids(uuid, text[]) to anon, authenticated;
grant execute on function public.rd_apply_sync_transaction(uuid, bigint, jsonb, text) to anon, authenticated;

commit;
