-- RD Accounting V4: keep station-local/derived metadata off the wire.
--
-- These keys are intentionally preserved in the existing stored metadata row
-- until a future maintenance window, but every sync read sanitizes them. This
-- gives rolling clients a non-destructive migration while immediately cutting
-- database egress. New writes are sanitized before storage as well.
begin;

create or replace function public.rd_sync_snapshot(
  p_workspace_id uuid,
  p_after_id text default null,
  p_limit integer default 500
)
returns setof public.rd_accounting_data
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    d.id,
    case
      when d.id = 'metadata'
        then d.data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys'
      else d.data
    end as data,
    d.last_modified,
    d.is_syncing,
    d.updated_at,
    d.workspace_id,
    d.sync_version,
    d.updated_by,
    d.deleted_at
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id not like 'lock\_%' escape '\'
    and (p_after_id is null or d.id > p_after_id)
  order by d.id
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

create or replace function public.rd_sync_delta(
  p_workspace_id uuid,
  p_after_version bigint,
  p_after_id text default null,
  p_limit integer default 500
)
returns setof public.rd_accounting_data
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    d.id,
    case
      when d.id = 'metadata'
        then d.data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys'
      else d.data
    end as data,
    d.last_modified,
    d.is_syncing,
    d.updated_at,
    d.workspace_id,
    d.sync_version,
    d.updated_by,
    d.deleted_at
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id not like 'lock\_%' escape '\'
    and (
      d.sync_version > coalesce(p_after_version, 0)
      or (
        d.sync_version = coalesce(p_after_version, 0)
        and p_after_id is not null
        and d.id > p_after_id
      )
    )
  order by d.sync_version, d.id
  limit least(greatest(p_limit, 1), 1000);
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
  v_row jsonb;
  v_data jsonb;
begin
  select sync_version
  into v_current
  from public.rd_workspaces
  where id = p_workspace_id
  for update;

  if v_current is distinct from coalesce(p_expected_sync_version, 0) then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'sync_version', v_current
    );
  end if;

  v_next := v_current + 1;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    if nullif(v_row->>'id', '') is null then
      raise exception 'ROW_ID_REQUIRED';
    end if;

    v_data := coalesce(v_row->'data', '{}'::jsonb);
    if v_row->>'id' = 'metadata' then
      v_data := v_data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys';
    end if;

    insert into public.rd_accounting_data(
      workspace_id,
      id,
      data,
      last_modified,
      is_syncing,
      updated_at,
      sync_version,
      updated_by,
      deleted_at
    )
    values(
      p_workspace_id,
      v_row->>'id',
      v_data,
      coalesce(
        (v_row->>'last_modified')::bigint,
        (extract(epoch from clock_timestamp()) * 1000)::bigint
      ),
      false,
      now(),
      v_next,
      nullif(p_updated_by, ''),
      case
        when coalesce((v_data->>'_deleted')::boolean, false) then now()
        else null
      end
    )
    on conflict(workspace_id, id) do update
    set
      data = excluded.data,
      last_modified = excluded.last_modified,
      is_syncing = false,
      updated_at = now(),
      sync_version = v_next,
      updated_by = excluded.updated_by,
      deleted_at = excluded.deleted_at;
  end loop;

  update public.rd_workspaces
  set sync_version = v_next
  where id = p_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'sync_version', v_next
  );
end;
$$;

revoke execute on function public.rd_sync_snapshot(uuid, text, integer) from public;
revoke execute on function public.rd_sync_delta(uuid, bigint, text, integer) from public;
revoke execute on function public.rd_apply_sync_transaction(uuid, bigint, jsonb, text) from public;

grant execute on function public.rd_sync_snapshot(uuid, text, integer) to anon, authenticated;
grant execute on function public.rd_sync_delta(uuid, bigint, text, integer) to anon, authenticated;
grant execute on function public.rd_apply_sync_transaction(uuid, bigint, jsonb, text) to anon, authenticated;

commit;
