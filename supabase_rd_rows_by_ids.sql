-- Additive migration: enable stale-tombstone reconcile under schema V3.
-- Safe to re-run. Does not change data — only adds/grants one RPC.
-- Apply in Supabase Dashboard → SQL Editor.

begin;

create or replace function public.rd_rows_by_ids(p_workspace_id uuid, p_ids text[])
returns setof public.rd_accounting_data language plpgsql security definer set search_path=public
as $$
begin
  return query select d.* from public.rd_accounting_data d
    where d.workspace_id = p_workspace_id
      and d.id = any(p_ids)
      and d.id not like 'lock\_%' escape '\'
    limit 1000;
end;
$$;

revoke execute on function public.rd_rows_by_ids(uuid,text[]) from public;
grant execute on function public.rd_rows_by_ids(uuid,text[]) to anon, authenticated;

commit;
