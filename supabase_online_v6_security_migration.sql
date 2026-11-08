-- RD Accounting V6: per-workspace secret for every anon-callable RPC, login
-- accounts never stored in the cloud, and a manual tombstone purge.
--
-- Rolling-upgrade safe:
--   * Every RPC gains a trailing `p_workspace_secret text default null`.
--     Clients that do not send it keep working while the workspace has NO row
--     in rd_workspace_secrets (legacy behaviour).
--   * Once the admin inserts the secret hash, every call without the matching
--     secret fails with RD_WORKSPACE_SECRET_INVALID.
-- Requires V3/V4/V5 to be applied first.
--
-- Preflight (after this migration, BEFORE inserting a row in rd_workspace_secrets):
--   select extensions.digest('x', 'sha256');
-- must succeed. If it errors, pgcrypto is not in the `extensions` schema and every
-- secret check would fail — fix the extension first, or all stations lock out.
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rd_workspace_secrets (
  workspace_id uuid primary key references public.rd_workspaces(id) on delete cascade,
  -- hex sha256 of the secret, e.g. encode(extensions.digest('<secret>', 'sha256'), 'hex')
  secret_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.rd_workspace_secrets enable row level security;
revoke all on public.rd_workspace_secrets from anon, authenticated;

create or replace function public.rd_assert_workspace_secret(p_workspace_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select s.secret_hash into v_hash from public.rd_workspace_secrets s where s.workspace_id = p_workspace_id;
  if v_hash is null then
    return; -- no secret configured yet: legacy behaviour
  end if;
  if p_secret is null or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> lower(v_hash) then
    raise exception 'RD_WORKSPACE_SECRET_INVALID' using errcode = '28000';
  end if;
end;
$$;
revoke execute on function public.rd_assert_workspace_secret(uuid, text) from public, anon, authenticated;

-- Plaintext login accounts were part of the metadata row; drop them for good.
update public.rd_accounting_data set data = data - 'users' where id = 'metadata' and data ? 'users';

-- Old signatures must go: PostgREST cannot choose between an overload with and
-- without a defaulted trailing parameter.
drop function if exists public.rd_cloud_status(uuid);
drop function if exists public.rd_sync_snapshot(uuid, text, integer);
drop function if exists public.rd_sync_delta(uuid, bigint, text, integer);
drop function if exists public.rd_ids_by_prefix(uuid, text, text, integer);
drop function if exists public.rd_find_ids(uuid, text[]);
drop function if exists public.rd_rows_by_ids(uuid, text[]);
drop function if exists public.rd_apply_sync_transaction(uuid, bigint, jsonb, text);
drop function if exists public.rd_reserve_voucher_id(uuid, text, jsonb, text);

create function public.rd_cloud_status(p_workspace_id uuid, p_workspace_secret text default null)
returns table(workspace_id uuid, sync_version bigint)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
  return query select w.id, w.sync_version from public.rd_workspaces w where w.id = p_workspace_id;
end;
$$;

create function public.rd_sync_snapshot(
  p_workspace_id uuid,
  p_after_id text default null,
  p_limit integer default 500,
  p_workspace_secret text default null
)
returns setof public.rd_accounting_data
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
  return query
  select
    d.id,
    case when d.id = 'metadata'
      then d.data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys' - 'users'
      else d.data
    end as data,
    d.last_modified, d.is_syncing, d.updated_at, d.workspace_id, d.sync_version, d.updated_by, d.deleted_at
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id not like 'lock\_%' escape '\'
    and (p_after_id is null or d.id > p_after_id)
  order by d.id
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

create function public.rd_sync_delta(
  p_workspace_id uuid,
  p_after_version bigint,
  p_after_id text default null,
  p_limit integer default 500,
  p_workspace_secret text default null
)
returns setof public.rd_accounting_data
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
  return query
  select
    d.id,
    case when d.id = 'metadata'
      then d.data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys' - 'users'
      else d.data
    end as data,
    d.last_modified, d.is_syncing, d.updated_at, d.workspace_id, d.sync_version, d.updated_by, d.deleted_at
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id not like 'lock\_%' escape '\'
    and (
      d.sync_version > coalesce(p_after_version, 0)
      or (d.sync_version = coalesce(p_after_version, 0) and p_after_id is not null and d.id > p_after_id)
    )
  order by d.sync_version, d.id
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

create function public.rd_ids_by_prefix(
  p_workspace_id uuid,
  p_prefix text,
  p_after_id text default null,
  p_limit integer default 1000,
  p_workspace_secret text default null
)
returns table(id text, last_modified bigint)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
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

create function public.rd_find_ids(p_workspace_id uuid, p_ids text[], p_workspace_secret text default null)
returns table(id text)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
  return query select d.id from public.rd_accounting_data d where d.workspace_id = p_workspace_id and d.id = any(p_ids);
end;
$$;

create function public.rd_rows_by_ids(p_workspace_id uuid, p_ids text[], p_workspace_secret text default null)
returns setof public.rd_accounting_data
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
  return query
  select
    d.id,
    case when d.id = 'metadata'
      then d.data - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys' - 'users'
      else d.data
    end as data,
    d.last_modified, d.is_syncing, d.updated_at, d.workspace_id, d.sync_version, d.updated_by, d.deleted_at
  from public.rd_accounting_data d
  where d.workspace_id = p_workspace_id
    and d.id = any(p_ids)
    and d.id not like 'lock\_%' escape '\'
  limit 1000;
end;
$$;

create function public.rd_apply_sync_transaction(
  p_workspace_id uuid,
  p_expected_sync_version bigint,
  p_rows jsonb,
  p_updated_by text,
  p_workspace_secret text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_current bigint;
  v_next bigint;
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
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
      -- Older clients still upload login accounts; never store them.
      then coalesce(row_value->'data', '{}'::jsonb) - 'actionLogs' - 'deletedIds' - 'deletedCloudKeys' - 'users'
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

create function public.rd_reserve_voucher_id(
  p_workspace_id uuid,
  p_lock_id text,
  p_data jsonb,
  p_updated_by text,
  p_workspace_secret text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_current bigint; v_next bigint; v_inserted integer;
begin
  perform public.rd_assert_workspace_secret(p_workspace_id, p_workspace_secret);
  select sync_version into v_current from public.rd_workspaces where id = p_workspace_id for update;
  delete from public.rd_accounting_data
    where workspace_id = p_workspace_id
      and id like 'lock\_%' escape '\'
      and last_modified < (extract(epoch from clock_timestamp()) * 1000)::bigint - 30 * 60 * 1000;
  v_next := v_current + 1;
  insert into public.rd_accounting_data(workspace_id, id, data, last_modified, is_syncing, updated_at, sync_version, updated_by)
  values(p_workspace_id, p_lock_id, coalesce(p_data, '{}'::jsonb), (extract(epoch from clock_timestamp()) * 1000)::bigint, false, now(), v_next, p_updated_by)
  on conflict(workspace_id, id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.rd_workspaces set sync_version = v_next where id = p_workspace_id;
    return jsonb_build_object('reserved', true, 'sync_version', v_next);
  end if;
  return jsonb_build_object('reserved', false, 'sync_version', v_current);
end;
$$;

-- Manual tombstone purge (NOT scheduled, not callable by anon). Deleted-entity
-- rows are what stops an offline station from resurrecting a deleted voucher:
-- choose p_older_than longer than any station can stay offline. Run from the
-- SQL editor, e.g. select public.rd_purge_tombstones('<workspace uuid>', interval '365 days');
create or replace function public.rd_purge_tombstones(p_workspace_id uuid, p_older_than interval default interval '365 days')
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if p_older_than < interval '180 days' then
    raise exception 'RD_PURGE_TOO_RECENT: keep tombstones at least 180 days';
  end if;
  delete from public.rd_accounting_data d
    where d.workspace_id = p_workspace_id
      and d.id not in ('metadata', 'sync_signal')
      and coalesce((d.data->>'_deleted')::boolean, false)
      and d.last_modified < (extract(epoch from (now() - p_older_than)) * 1000)::bigint;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.rd_purge_tombstones(uuid, interval) from public, anon, authenticated;

revoke execute on function public.rd_cloud_status(uuid, text) from public;
revoke execute on function public.rd_sync_snapshot(uuid, text, integer, text) from public;
revoke execute on function public.rd_sync_delta(uuid, bigint, text, integer, text) from public;
revoke execute on function public.rd_ids_by_prefix(uuid, text, text, integer, text) from public;
revoke execute on function public.rd_find_ids(uuid, text[], text) from public;
revoke execute on function public.rd_rows_by_ids(uuid, text[], text) from public;
revoke execute on function public.rd_apply_sync_transaction(uuid, bigint, jsonb, text, text) from public;
revoke execute on function public.rd_reserve_voucher_id(uuid, text, jsonb, text, text) from public;
grant execute on function public.rd_cloud_status(uuid, text) to anon, authenticated;
grant execute on function public.rd_sync_snapshot(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.rd_sync_delta(uuid, bigint, text, integer, text) to anon, authenticated;
grant execute on function public.rd_ids_by_prefix(uuid, text, text, integer, text) to anon, authenticated;
grant execute on function public.rd_find_ids(uuid, text[], text) to anon, authenticated;
grant execute on function public.rd_rows_by_ids(uuid, text[], text) to anon, authenticated;
grant execute on function public.rd_apply_sync_transaction(uuid, bigint, jsonb, text, text) to anon, authenticated;
grant execute on function public.rd_reserve_voucher_id(uuid, text, jsonb, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- After every station runs a client that sends the secret (cloud settings ->
-- "Mã bí mật workspace"), enable enforcement (run separately, keep the secret
-- out of shared scripts):
--   insert into public.rd_workspace_secrets(workspace_id, secret_hash)
--   values ('00000000-0000-4000-8000-000000000001', encode(extensions.digest('<secret>', 'sha256'), 'hex'))
--   on conflict (workspace_id) do update set secret_hash = excluded.secret_hash;
