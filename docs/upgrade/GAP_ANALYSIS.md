# Phân tích hiện trạng & thiếu sót — RD Accounting (v3.4.22)

Nguồn: graphify (2023 node / 4132 cạnh / 86 cụm, `graphify-out/GRAPH_REPORT.md`) + đọc `js/accounting.js`, `js/core/accounting-engine.js`, `js/modules/reports.js`, `data.js`, `index.html`.

## 1. Phần mềm đang làm gì

| Phân hệ | File chính | Nghiệp vụ / định khoản tự động |
|---|---|---|
| Mua hàng | `js/modules/purchase.js` | `purchase`: Nợ 156, Nợ 1331 / Có 331·111·112. `purchase_return`: Nợ 331 / Có 156, Có 1331. `purchase_order` (không ghi sổ) |
| Bán hàng | `js/modules/sales.js` | `sales`: Nợ 131·111·112 / Có 511, Có 3331; Nợ 632 / Có 156. `sales_return`: Nợ 511, Nợ 3331 / Có 131; Nợ 156 / Có 632. `sales_quotation` (không ghi sổ) |
| Kho | `js/modules/inventory.js` | Bình quân gia quyền liên hoàn, `inventory_adjust`, thẻ kho |
| Quỹ | `js/modules/cash.js` | `receipt` / `payment` — định khoản tay nhiều dòng (`entries`) |
| Ký quỹ | `js/accounting.js` | `escrow_*`: 244/344 (TT200) ↔ 1386/3386 (TT133) |
| Công nợ | `js/modules/debts.js` | FIFO đối trừ 131/331, đối chiếu, rà soát TK đối ứng |
| Báo cáo | `js/modules/reports.js` | Sổ Nhật ký chung, Sổ Cái, Bảng cân đối phát sinh |
| Khác | `cloud-sync.js`, `excel-integration.js`, in chứng từ 01-TT/02-TT/01-VT/02-VT | |

Chế độ kế toán: công tắc `state.accountingStandard` = `TT200` | `TT133`.

## 2. Thiếu sót / sai so với luật

### 2.1 Sai nghiệp vụ hiện có (ưu tiên sửa)
1. **TT133 gộp thuế GTGT vào giá kho 156** (`accounting.js` nhánh `purchase`, `purchase_return`). TT133 vẫn có TK 1331 cho DN khấu trừ; chỉ gộp khi thuế không được khấu trừ. → Sai.
2. Thuế suất **một mức cho cả chứng từ** (`v.taxRate`), không theo từng dòng hàng; không hỗ trợ 0%/5%/8%/KCT/KKKNT, giảm 2% theo NQ 204/2025.
3. `purchase_return` chênh lệch giá trả vs giá vốn: cả hai chiều đều Nợ 632 / Có 711 (chiều âm sai); vế Có 156 ghi theo giá trả thay vì giá vốn.
4. Hệ thống tài khoản dựng cứng 13 TK trong `getReportAccounts()`; không có danh mục TK theo chế độ; TT200 đã bị **TT99/2025** thay từ 01/01/2026.
5. Gợi ý "môn bài → 3338" — lệ phí môn bài bãi bỏ từ 2026 (cần xác minh).

### 2.2 Thiếu hẳn
- Danh mục hệ thống tài khoản chuẩn (cấp 1/2) theo TT99 và TT133, có tính chất Nợ/Có, khóa TK không hợp lệ.
- Thông tin hóa đơn điện tử trên chứng từ: mẫu số, ký hiệu, số HĐ, ngày HĐ, MST người mua/bán; hóa đơn điều chỉnh/thay thế.
- **Bảng kê / tờ khai thuế GTGT 01/GTGT** (chỉ tiêu [21]–[43]), khấu trừ, kết chuyển 1331↔3331.
- Kiểm tra điều kiện khấu trừ: thanh toán không dùng tiền mặt từ ngưỡng luật định.
- Thuế TNDN: tạm nộp quý, 821/3334, quyết toán 03/TNDN (số liệu), thuế suất 15/17/20%.
- Thuế TNCN / lương / BHXH-BHYT-BHTN-KPCĐ (334, 338x, 3335).
- Chi phí bán hàng/QLDN, doanh thu tài chính, chi phí tài chính, thu nhập/chi phí khác — chứng từ chung (phiếu kế toán tổng hợp).
- **Kết chuyển cuối kỳ** 511/515/711 → 911, 632/635/641/642/811/821 → 911, 911 → 421.
- **Báo cáo tài chính**: B01 (Bảng CĐKT), B02 (KQKD), B03 (LCTT), B09; bộ DNN theo TT133.
- Lịch hạn nộp tờ khai, nhắc hạn, tính tiền chậm nộp.
- Khóa sổ kỳ kế toán.
- TSCĐ & khấu hao, CCDC/chi phí trả trước (ngoài phạm vi đợt 1 nếu không cần).
