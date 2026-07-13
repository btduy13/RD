# Cloud Sync V3 rollout

1. Khóa thao tác ghi trên tất cả máy và thoát ứng dụng.
2. Sao lưu Supabase bằng dashboard/CLI và sao chép `%APPDATA%/rd-accounting/data/rd_local.db` của từng máy.
3. Chạy `supabase_online_v3_migration.sql` trong SQL Editor bằng tài khoản quản trị duy nhất. Không chạy `supabase_setup.sql` sau migration.
4. Cài cùng một bản ứng dụng mới trên mọi máy; các trạm dùng chung URL và anon key đã cấu hình trong phần mềm. Không cấp tài khoản hay mật khẩu Supabase cho người dùng trạm.
6. Chờ trạng thái “Cloud đã sẵn sàng” trên máy đầu tiên trước khi mở máy tiếp theo.
7. Đối chiếu số row theo prefix và số chứng từ/đối tác/sản phẩm trên ít nhất hai máy.

## Truy vấn đối chiếu

```sql
select workspace_id,
       count(*) filter (where id like 'v_%' and deleted_at is null) as vouchers,
       count(*) filter (where id like 'p_%' and deleted_at is null) as products,
       count(*) filter (where id like 'part_%' and deleted_at is null) as partners,
       count(*) filter (where deleted_at is not null) as tombstones,
       max(sync_version) as max_version
from public.rd_accounting_data
group by workspace_id;
```

## Rollback

Nếu migration hoặc đối chiếu sai: tiếp tục khóa ghi, khôi phục backup Supabase, cài lại bản ứng dụng trước và khôi phục từng `rd_local.db`. Không cho client V2 và V3 ghi song song.
