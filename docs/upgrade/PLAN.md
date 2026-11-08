# Kế hoạch nâng cấp thuế & chế độ kế toán 2026

Căn cứ: `reports/Luật thuế kế toán Việt Nam 2026.md` (mục "Yêu cầu cho phần mềm", mã A–G) và `docs/upgrade/GAP_ANALYSIS.md`.

Nguyên tắc (ponytail): không thêm thư viện; logic thuế là hàm thuần trong `js/core/` (test được bằng Node); UI mới tự dựng DOM trong module của mình, chỉ sửa `index.html` tối thiểu (thẻ `<script>`, mục sidebar, khung tab rỗng). Không đổi định dạng dữ liệu cũ; trường mới đều tùy chọn, thiếu thì mặc định như cũ.

## Phase 1 — Lõi (W1, khó nhất, làm trước, một mình)

Files: `js/core/chart-of-accounts.js` (mới), `js/core/tax-rules.js` (mới), `js/accounting.js`, `js/core/accounting-engine.js`, `js/state.js`, `js/modules/settings.js`, `js/modules/reports.js` (chỉ thay danh sách TK cứng), `index.html` (script tag + option chế độ), tests.

1. **Chế độ kế toán** `TT99 | TT133` (B1). `"TT200"` cũ = bí danh của `TT99` qua `normalizeAccountingStandard()`; dữ liệu cũ giữ nguyên, so sánh trong code dùng helper `isTT99Family(std)`.
2. **Danh mục TK** (B2, B3): `getChartOfAccounts(std)` → `[{code, name, nature: "debit"|"credit"|"both", parent, level}]`; `getAccountName(code, std)`; `isValidAccount(code, std)` (cho phép TK chi tiết tự mở có cha hợp lệ, B4). Hai danh mục riêng TT99 / TT133.
3. **Bảng quy tắc theo ngày** (A1): `getTaxRule(key, date)` trên mảng `{key, value, from, to, ref}`. Khóa tối thiểu: `vat.reduced8.window`, `vat.cashThreshold` (20tr trước 01/7/2025, 5tr từ đó), `cit.rateTiers`, `cit.reduction30`, `pit.brackets`, `pit.deductions`, `pit.casualThreshold`, `ins.rates`, `ins.caps`, `ins.regionMinWage`, `holidays`.
4. **Sửa lỗi định khoản**: TT133 thuế GTGT khấu trừ vẫn vào 1331 (không gộp 156); `purchase_return` vế Có 156 theo giá vốn, chênh lệch đúng chiều (giá trả > giá vốn: Có 632 … theo thực hành; ghi rõ trong code).
5. **Thuế suất theo dòng** (C1): `item.vatRate` (`0|5|8|10|"KCT"|"KKKNT"`) ưu tiên hơn `v.taxRate`; thuế tính theo nhóm thuế suất; `v.vatBreakdown = {rate: {base, tax}}`.
6. **Ngưỡng tiền mặt** (C4): phiếu mua `paymentMethod "111"` có tổng ≥ ngưỡng theo ngày → VAT không được khấu trừ: ghi vào giá 156, `v.vatNonDeductible = true`, `v.citNonDeductible = true`.
7. **Chứng từ mới** ghi sổ trong engine:
   - `general_journal` (phiếu kế toán): `entries` tay, mỗi TK phải hợp lệ theo danh mục.
   - `period_close` (kết chuyển, B9 + C13): sinh bởi `buildPeriodCloseEntries(state, from, to)` — bù trừ 33311/1331, kết chuyển 511/515/711 → 911, 632/635/641/642/811/821 → 911, 911 → 4212.
   - `payroll` (bảng lương, E7): `entries` sinh bởi hàm lương (Phase 2 W4) và lưu sẵn; engine giữ nguyên entries.
8. Hàm số dư: `getAccountTurnover(state, code, from, to)` → `{openDebit, openCredit, debit, credit, closeDebit, closeCredit}` (gồm TK con theo tiền tố) — dùng chung cho mọi báo cáo.

## Phase 2 — song song (worktree riêng, mỗi worker sở hữu file riêng)

- **W2 Báo cáo thuế & BCTC** — `js/modules/tax-reports.js` (mới), tab "Thuế & BCTC": Bảng kê mua vào/bán ra; Tờ khai 01/GTGT (chỉ tiêu [21]–[43], mẫu TT80 trước 07/2026, TT89 từ 07/2026, phụ lục giảm 8% NĐ 174); Ước tính TNDN tạm nộp quý (thuế suất theo doanh thu năm trước, giảm 30% 2026–2027, kiểm 80%); B01-DN/B02-DN (TT99), B01a-DNN/B02-DNN (TT133); nút "Kết chuyển cuối kỳ" tạo chứng từ `period_close`.
- **W3 Chứng từ** — `sales.js`, `purchase.js`, `cash.js` (+ khối form trong `index.html`): thông tin hóa đơn (mẫu số, ký hiệu, số, ngày HĐ, MST), thuế suất theo dòng, cảnh báo ≥5tr tiền mặt, form phiếu kế toán tổng hợp `general_journal` với chọn TK từ danh mục; gợi ý "môn bài" chuyển sang chỉ nợ ≤2025, TK 3339 (F1).
- **W4 Lương & lịch thuế** (người dùng chọn: phân hệ lương **đầy đủ**) — `js/core/payroll-calc.js` (thuần), `js/modules/payroll.js`, `js/modules/tax-calendar.js`: danh mục nhân viên (`state.employees`: mã, tên, MST, CCCD, vùng, người phụ thuộc, cư trú, lương đóng BH), bảng lương tháng (`state.payrolls`), tính TNCN biểu 5 bậc / 7 bậc theo ngày chi trả, giảm trừ, BHXH/BHYT/BHTN/KPCĐ có trần/sàn; khấu trừ 10% vãng lai; bảng lương → chứng từ `payroll`; tổng hợp 05/KK-TNCN quý và quyết toán năm (05/QTT-TNCN số liệu); lịch hạn nộp (lùi ngày nghỉ, bảng gia hạn), tính tiền chậm nộp 0,03%/ngày, ước khung phạt. `employees`/`payrolls` phải được lưu & đồng bộ cloud như các thực thể khác.

Người dùng chọn: tờ khai 01/GTGT làm **cả mẫu TT 80/2021 (kỳ trước 07/2026) và TT 89/2026** — chọn theo kỳ.

## Phase 3 — QC

Reviewer độc lập đọc diff từng nhánh (đúng luật theo báo cáo, đúng định khoản, không phá dữ liệu cũ/đồng bộ cloud), chạy `npm test` + test mới; coordinator merge, chạy lại toàn bộ test.

## Ngoài phạm vi đợt này (ghi nhận)
Kết nối nhà cung cấp HĐĐT/ký số, xuất XML HTKK (schema TT89 chưa xác minh), TSCĐ & khấu hao, B03/B09 chi tiết (mã chỉ tiêu TT99 chưa xác minh), 15 điểm chưa xác minh trong báo cáo.
