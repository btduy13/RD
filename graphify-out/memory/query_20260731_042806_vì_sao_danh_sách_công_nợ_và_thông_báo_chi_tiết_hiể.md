---
type: "query"
date: "2026-07-31T04:28:06.700616+00:00"
question: "Vì sao danh sách công nợ và thông báo chi tiết hiển thị khác nhau, và sửa toàn bộ đường tính công nợ thế nào?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["calculatePartnerDebts", "calculatePartnerDebtLedger", "computeDebtSides", "getVoucherDebtEntries", "extractLedgerAmountsFromVoucher", "previewPartnerDebtNotice", "exportPartnerDebtExcel", "renderLedgerForTarget"]
---

# Q: Vì sao danh sách công nợ và thông báo chi tiết hiển thị khác nhau, và sửa toàn bộ đường tính công nợ thế nào?

## Answer

Nguyên nhân là các màn hình tự tính riêng và diễn giải Nợ 331 khác nhau cho khách hàng; một số chứng từ thiếu entries cũng bị bỏ qua. Đã gom sổ chi tiết, thông báo và export vào calculatePartnerDebtLedger dùng cùng computeDebtSides/getVoucherDebtEntries; audit 12.881 đối tác cho 0 mismatch. Đã xóa phiếu chi trùng PC7227 sau backup và đẩy 1 tombstone lên cloud; công nợ 36/30HOANGVANTHU(CH) thống nhất Nợ 15.002.317đ.

## Outcome

- Signal: useful

## Source Nodes

- calculatePartnerDebts
- calculatePartnerDebtLedger
- computeDebtSides
- getVoucherDebtEntries
- extractLedgerAmountsFromVoucher
- previewPartnerDebtNotice
- exportPartnerDebtExcel
- renderLedgerForTarget