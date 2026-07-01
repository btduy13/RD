# Audit dong bo cloud va UI

## Da sua trong client

- Tach checkpoint pull cloud ra khoi `state._lastModified` bang key `rd_accounting_last_pulled_cloud_ts`, tranh viec local moi hon lam bo sot delta cloud.
- Them mutex cho pull realtime/incremental, gop request dang cho va dam bao mo khoa trong `finally`.
- Hoan pull cloud khi dang mo modal lap/chinh sua phieu; flush lai sau khi dong modal.
- Chan force push/force pull khi dang co phieu mo de tranh ghi de trang thai nhap lieu chua luu.
- Them gioi han an toan cho pagination: neu cham tran trang thi throw error va khong cap nhat checkpoint voi du lieu ban phan.
- Doi comparator delta voucher/product/partner sang deep compare on dinh, bat duoc thay doi truong long nhau nhu thue, ghi chu, mo ta dong hang.
- Sua rescue local-only: lookup ID cloud theo batch exact-key, khong select full table khong phan trang.
- Sua cau hinh cloud: neu user tat cloud sync thi restart khong tu bat lai.
- Noi lai `openModal`/`closeModal` voi handler goc de autosave/restore draft khong bi override, dong modal se flush sync bi hoan.
- Sua fallback scroll cho cac tab list/table: `content-body` khong con bi khoa `overflow: hidden`.

## Rui ro backend con ton dong

- `supabase_setup.sql` dang mo RLS cho anon public read/insert/update/delete tren `rd_accounting_data`. Bat ky ai co URL + anon key deu co the doc/sua/xoa du lieu.
- Supabase URL va anon key dang nam trong client. Anon key khong phai secret, nhung neu RLS mo public thi day la rui ro mat du lieu nghiem trong.
- Co che `is_syncing` hien van la co mem tren metadata, khong phai transaction/lease atomic. Client da tranh doc luc `is_syncing=true`, nhung neu app crash giua push thi van can co watchdog/timeout o backend hoac procedure atomic.
- Neu can dam bao manh hon cho xung dot dong thoi, nen chuyen cac thao tac push thanh RPC/stored procedure co optimistic concurrency (`expected_last_modified`) thay vi client tu upsert nhieu batch.

## Huong hardening de trien khai tiep

1. Tao bang `workspaces`/`memberships`, bat Supabase Auth va policy theo `auth.uid()`.
2. Bo policy public update/delete; chi cho user thuoc workspace doc/ghi data workspace do.
3. Them cot `workspace_id`, `updated_by`, `sync_version` vao `rd_accounting_data`.
4. Doi push thanh RPC:
   - nhan delta rows/deleted keys.
   - kiem tra `expected_sync_version`.
   - update rows + metadata trong mot transaction.
   - tra ve conflict neu version da doi.
5. Them job/logic clear `is_syncing` neu stale qua nguong, hoac thay bang advisory lock/lease co expiry.
6. Tach Supabase config khoi source build, nap tu file config rieng tren may cai dat.
