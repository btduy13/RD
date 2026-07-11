# Audit dong bo cloud va UI

## Bo sung audit 2026-07-11

- Sua hang doi dong bo V2: push trong luc startup/pull khong con bi bo roi; pull dang cho giu nguyen `forceFull`, `force` va ly do yeu cau.
- Chan pull va push chay song song ngoai luong pre-pull noi bo, tranh merge/push tren snapshot cu.
- Sua thong bao dong bo thu cong: khong con bao thanh cong khi tac vu moi chi duoc xep hang hoac push that bai.
- Sua tombstone theo dung loai entity (`v_`, `p_`, `part_`, `cash_`, `escrow_`), tranh xoa nham voucher/san pham/doi tac trung ID.
- Giu tuong thich tombstone cu khong co prefix bang cach mac dinh no la voucher.
- Bat lai Electron sandbox va webSecurity; khoa dieu huong ngoai cua so ung dung.
- Gioi han URL cap nhat vao GitHub Releases chinh thuc cua `btduy13/RD`, chi theo redirect HTTPS den may chu asset GitHub.
- Sua offset modal bi gan inline sai `68px/260px`; modal gio bam theo bien CSS sidebar va khong lech khi doi breakpoint.
- Sua giao dien mobile: dashboard debt grid, filter ngay, header, dropdown, modal va khoang cach tren man hinh hep.
- Sua style phieu thu/chi khong an do selector sai; bo sung dieu huong sidebar bang ban phim va trang thai ARIA.
- Bo sung regression test cho tombstone trung ID, hang doi full pull va whitelist URL cap nhat.

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
