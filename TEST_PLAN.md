# Test plan truoc khi build ban moi

## 1. Test tu dong

Chay:

```powershell
npm run test
```

Ky vong:

- `cloud sync regression tests passed`.
- Khong co loi cu phap trong `js/cloud-sync.js`.
- Comparator sync bat duoc thay doi long nhau cua voucher, product, partner.
- Checkpoint pull cloud dung key rieng `rd_accounting_last_pulled_cloud_ts`.
- Modal lap phieu dang mo se duoc nhan dien de hoan pull cloud.
- Rescue local-only lookup ID cloud theo batch exact-key, khong select toan bang.

## 2. Test dong bo 2 may

Chuan bi:

- Sao luu thu muc `data/` cua ca 2 may.
- Ca 2 may dung cung Supabase project.
- Bat DevTools/console va theo doi `sync_debug.log` neu co.

| Ma | Kich ban | Buoc thu | Ket qua dat |
| --- | --- | --- | --- |
| SYNC-01 | Khoi dong may B khi may A dang lap don | May A mo form ban hang, nhap 3 dong hang nhung chua luu. May B khoi dong app. Quay lai A luu don. | Form A khong mat dong hang, don moi xuat hien tren B sau sync, cong no 2 may bang nhau. |
| SYNC-02 | Realtime pull khi dang nhap phieu | May A mo form mua/ban va giu mo. May B tao mot don moi va luu. Dong form tren A. | A khong bi refresh/mat draft khi form dang mo; sau khi dong form, don cua B duoc merge ve. |
| SYNC-03 | Tao don dong thoi | A va B cung tao don moi trong cung 30 giay, luu gan nhu dong thoi. | Khong mat don; neu trung ID thi app tu doi ID conflict va ca 2 don con ton tai. |
| SYNC-04 | Sua cung mot doi tuong | A sua ghi chu/thue/dong hang cua mot don; B sua truong khac cua cung don sau do sync. | May co `_updatedAt` moi hon thang; khong bo sot thay doi truong nho nhu taxRate/note/itemDesc. |
| SYNC-05 | Xoa don/hang/doi tac | Xoa tung loai tren A, doi B sync. Tao lai ID moi tren B sau khi A xoa. | Xoa dung loai theo prefix `v_`, `p_`, `part_`; khong xoa nham entity trung ID. Ban moi hon tren cloud duoc khoi phuc dung. |
| SYNC-06 | Mat mang roi noi lai | Tat mang may A, tao don, bat mang lai. Trong luc do B tao don khac. | Sau khi noi lai, ca hai don deu co mat tren cloud va 2 may. |
| SYNC-07 | Dataset lon | Dung data co hon 20.000 cloud rows, khoi dong may moi hoac xoa checkpoint pull roi sync lai. | Neu cham gioi han trang, app bao loi va khong cap nhat checkpoint bang du lieu ban phan; neu du lieu trong gioi han thi sync du. |
| SYNC-08 | Rescue local-only | Tao don offline/local-only tren A, dam bao cloud chua co key do, khoi dong lai A. | Rescue chi kiem tra cac key local theo batch; khong push nham hang loat do Supabase row cap. |
| SYNC-09 | Tat cloud sync | Bo tick cloud sync, luu config, khoi dong lai. | Checkbox van tat, app khong tu bat lai sync. |
| SYNC-10 | May B tu thay don moi khong restart | Mo app tren ca 2 may. May A lap va luu 1 hoa don ban hang moi. Giu may B dang mo o tab Ban hang, khong restart. | Sau khi may A push xong, may B tu phat hien metadata cloud moi va hien don moi trong vai giay; khong can reset phan mem. |
| SYNC-11 | Realtime bi loi/khong bat tren Supabase | Tam thoi chan realtime hoac quan sat khi kenh realtime loi, sau do may A tao don moi. | Vong polling metadata van tu kich hoat pull tren may B; badge khong bi treo o trang thai loi ma khong dong bo. |

## 3. Test cong no va so lieu

Sau moi kich ban sync:

- So sanh tong cong no theo tung doi tac tren A va B.
- So sanh so voucher theo tung loai: ban hang, mua hang, tra hang, bao gia, phieu thu/chi, ky quy.
- Xuat bao cao cong no/ton kho tren 2 may va doi chieu tong tien.
- Kiem tra SQLite/local cache sau khi dong mo app: du lieu khong bien mat sau restart.

## 4. Test giao dien

| Ma | Kich ban | Buoc thu | Ket qua dat |
| --- | --- | --- | --- |
| UI-01 | Scroll danh sach | Vao Ban hang, Mua hang, Ton kho, Doi tac, Cong no, Tien mat, Bao cao voi data dai. | Luon cuon duoc; khong mat thanh cuon khi doi tab/resize. |
| UI-02 | Modal autosave | Mo form ban hang, nhap nhieu dong, dong modal, mo lai. | Draft duoc khoi phuc theo co che autosave hien co. |
| UI-03 | Sync khong lam dung UI | Dang mo form, may khac sync du lieu. | Con tro/input khong mat focus bat thuong; form khong bi refresh giua chung. |
| UI-04 | Resize/minimize | Resize cua so nho, phong to, minimize/restore. | Header, toolbar, bang va modal khong chong len nhau; van cuon duoc. |
| UI-05 | Thao tac nhanh | Chuyen tab lien tuc trong luc sync/pull. | Khong treo UI qua lau; khong blank table; badge sync quay/dung dung trang thai. |
| UI-06 | Xoa hang loat reset nut da chon | O tung man Ban hang, Hang tra lai, Bao gia, Mua hang, Don dat hang, Tra lai hang, Kho, Doi tac, Cong no, Thu/chi, Ky quy: tick 1-3 dong roi bam Xoa da chon. | Sau khi xac nhan xoa/reset, nut `Xoa da chon` an ngay, bo dem ve `0`, checkbox chon tat ca va tung dong deu bo tick. |
| UI-07 | Giam giat lag khi render lai | Dung data lon, thao tac xoa hang loat, luu phieu, chuyen tab va loc danh sach lien tuc. | UI chi render lai theo frame, khong bi render lap nhieu lan trong mot thao tac; cuon/lien tuc go khong bi dung keo dai. |

## 5. Smoke test build

Chay sau khi test sync/UI dat:

```powershell
npm run build-win
```

Sau khi cai ban build:

- Khoi dong app moi tren mot may test rieng.
- Pull cloud lan dau.
- Tao/sua/xoa 1 don ban, 1 phieu mua, 1 doi tac, 1 hang hoa.
- Dong app, mo lai, doi chieu so lieu va cong no.
