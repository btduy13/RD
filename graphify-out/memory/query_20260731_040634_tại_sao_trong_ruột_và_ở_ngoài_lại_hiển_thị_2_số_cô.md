---
type: "query"
date: "2026-07-31T04:06:34.585306+00:00"
question: "tại sao trong ruột và ở ngoài lại hiển thị 2 số công nợ khác nhau, đây là lỗi gì? vui lòng inspect toàn bộ."
contributor: "graphify"
outcome: "useful"
source_nodes: ["calculatePartnerDebts()", "computeDebtSides()", "previewPartnerDebtNotice()", "extractLedgerAmountsFromVoucher()"]
---

# Q: tại sao trong ruột và ở ngoài lại hiển thị 2 số công nợ khác nhau, đây là lỗi gì? vui lòng inspect toàn bộ.

## Answer

Expanded from original query via vocab: [debt, debts, balance, opening, partner, notice, report, voucher, filter]. Traversal and source inspection show calculatePartnerDebts uses computeDebtSides to combine customer TK131 with TK331, while previewPartnerDebtNotice filters customer rows to TK131 only. Real SQLite confirms 36/30HOANGVANTHU(CH): debit131 60,002,317; credit131 45,000,000; debit331 30,000,000, producing outside Có 14,997,683 but notice Nợ 15,002,317. PT13253 and PC7227 share date, partner, amount 30,000,000 and matching pt4198/q84 descriptions. Audit finds 90 period discrepancies and 6 opposite receipt/payment candidate pairs.

## Outcome

- Signal: useful

## Source Nodes

- calculatePartnerDebts()
- computeDebtSides()
- previewPartnerDebtNotice()
- extractLedgerAmountsFromVoucher()