# Sai sót dữ liệu công nợ phải thu (TK 131) và phải trả (TK 331)

Scope: copy of live SQLite DB (9,670 vouchers 2025-01-01 → 2026-11-09, 9,524 partners), loaded read-only with the app's own engine (`loadstate.js` + `js/modules/debts.js`). As-of date for aging: 2026-11-09. All numbers are VND, reproduced by the scripts in `C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_debt/` (a2.js reconciliation, a5.js aging + Dư Có, a6–a8.js duplicates/twins, a9.js 331, a10–a11.js commissions). "Source: DB" below = output of those scripts on `live.db`.

Ranked summary of errors (by money at stake and certainty):

| # | Error | Count | Amount | Proposed fix |
|---|---|---|---|---|
| 1 | Generic "suppliers" ML1 "Mua lẻ" + SP_9304 "Khách hàng vãng lai" carry 1,647.9M opening Dư Có 331 that was drained by 288 cash payments of every kind (commissions, owner-family costs, fuel, purchases, 360M "Chi khác") posted Nợ 331 | 288 payments | 1,665.9M | Verify the opening; reclassify each payment to its real expense / 1388 / 334 account (Nợ 641 or 6421, 642, 138, 156…) |
| 2 | NCC_EXCEL "Nhà cung cấp Sổ chi tiết": unidentified catch-all supplier | purchases | 1,124.9M Dư Có 331 | Re-assign the purchases to the real suppliers (VAT invoices) |
| 3 | Overdue receivables >6 months with no provision (2293 = 0) | 472 partners | 1,323.9M (>12m: 811.3M) | Provision per TT48 ≈ 676.3M (upper bound; see caveats) |
| 4 | Commission / trích thầu payments posted Nợ 331 (or 334) instead of selling expense; no PIT withheld | 62 payments | 263.4M; PIT 23.2M | Nợ 641 (TT99) / 6421 (TT133); withhold 10% PIT; contract + receipts |
| 5 | Customer payments posted Nợ 331 (refunds, commissions, expenses, 1-VND clean-ups) | 135 vouchers / 110 partners | 161.5M | Refund → Nợ 131; expenses → 641/642; tiny clean-ups → Nợ 811/Có 131 journal, not cash |
| 6 | Dư Có 131 not presented gross; 192 customers Dư Có | 192 | 270.4M | Show as 312 "Người mua trả tiền trước"; fix misposted receipts |
| 7 | Receipts posted on the wrong (old/typo) partner code — exact twins | ≥4 confirmed | 48.0M | Move receipts to the invoice's code |
| 8 | ML1 "Mua lẻ" (a supplier code) used as customer for 10 solar-heater sales | 10 invoices | 193.3M Nợ 131 (173.2M open) | Re-assign to the real buyers |
| 9 | Dư Nợ 331 netted against payables (CAMEL, TQ, Tuấn Minh) | 3 | 533.3M | Present as 132 "Trả trước cho người bán"; reconcile CAMEL |
| 10 | Orphan vouchers (partnerId not in catalog) | 74 | 158.2M | Use the built-in relink (computeOrphanPartnerRelinks) |

## Ledger 131/331 vs detail reconciliation status

### Takeaway
TK 131 ties exactly: ledger and per-partner detail agree at opening (3,179,236,113) and closing (3,162,481,658). The opening Excel detail also sums to the ledger opening. TK 331 does not tie. Ledger 331 is 885,711,632, but the supplier detail is 1,049,842,669. The gap of 164.1M comes from Nợ 331 lines posted on customers (161.5M) and on orphan codes (2.6M). The Debts screen hides this gap because it re-reads those lines as Nợ 131.

### Cited Findings
- `computeDebt131Reconciliation('', '')`: ledgerOpen = detailOpen = 3,179,236,113. ledgerClose = detailClose = 3,162,481,658. openDiff = closeDiff = 0. initialOpeningDiff = 0 (partnerOpeningSum 3,179,236,113). — Source: DB (a2.js)
- KPI net receivable is 3,323,969,012. That is 161,487,354 above the 131 ledger (`refund331Adj`). The extra is customer payments posted Nợ 331, which `computeDebtSides` reads as Nợ 131 when the partner is not a supplier. — Source: DB (a2.js); app code `js/modules/debts.js` lines 94–104
- Gross per-partner 131 at 2026-11-09: Dư Nợ 3,461,335,911 and Dư Có 270,433,372 (net 3,190,902,539, which includes the refund re-read). — Source: DB (a5.js)
- 131 opening detail is a net figure. 899 partners have a non-zero opening. Retail customers show 5,977.6M debit and 3,020.4M credit, because the Excel columns carry both sides (e.g. partner "60": debit 4,783,443 / credit 4,784,000 / net −557). — Source: DB (a2.js, a4.js)
- TK 331 per supplier (opening + Có − Nợ) sums to 1,049,842,669. `getAccountBalance('331')` returns 885,711,632. Non-supplier partners have 110 codes with Nợ 331 of 161,487,354 and Có 331 of 0. Two orphan payments add 2,643,683 (e.g. PC6633 on DT_8061). — Source: DB (a9.js, a3.js)
- The 331 opening (1,529,017,106) is ML1 1,268,484,998 + SP_9304 379,432,007 + other suppliers. It is offset by Dư Nợ openings: CAMEL −828,703,540, TQ −243,098,731. — Source: DB (a9.js)
- Other built-in checks: 74 orphan vouchers worth 158,246,218 can be relinked. 11 cash-sale receipt splits total 5,090,603. 2 cash-account fixes are pending: PC6633 2.5M 331→641 and PC7031 4,452,590 341→642. 109 partner cash lines without debt total 8,721,699,401. These include loans 341, salaries 334, and 1388 of 1.47B on retail codes. — Source: DB (a2.js)
- `state.accountingStandard` = "TT200". TT200 is superseded by TT99/2025 from 2026. — Source: DB (a4.js); [che_do_ke_toan_tt99_tt133.md](research_notes/Luật thuế kế toán Việt Nam 2026/che_do_ke_toan_tt99_tt133.md)

### Inferences
- The 131 "match" is real but hides two kinds of error: (a) 161.5M of customer-side items sit in 331, and (b) wrong-code postings. A wrong code still nets to zero in total. The 331 ledger understates supplier payables by 164.1M versus the detail.
- Fix order: first reclassify the 135 customer Nợ 331 vouchers (section "Receipts/payments on the wrong side"). Then 131 KPI = 131 ledger and 331 ledger = 331 detail.

### Gaps
- No physical confirmation (biên bản đối chiếu công nợ) exists in the DB. The opening detail cannot be verified against a pre-2025 ledger, because the DB starts 2025-01-01.

## Top partners by Dư Có 131 and aged Dư Nợ; provision per TT 48/2019

### Takeaway
192 customers carry Dư Có 131 totalling 270.4M. Roughly half of the money is receipts with no invoice on that code (105.6M on 13 codes) or opening Dư Có never used (22.9M on 48 codes). At least 48.0M is receipts posted to the wrong code. The open Dư Nợ (FIFO, due = invoice date) is 3,612.4M. Of this, 1,323.9M is more than 6 months old and 207.9M is 36 months or older. A TT48 provision would be about 676.3M, but TK 2293 is 0. 403 debtors totalling 1,558.5M had no receipt at all in 2025–2026.

### Cited Findings
**TT48 rules.** Provision bands: 30% at 6 months to <1 year overdue, 50% at 1 to <2 years, 70% at 2 to <3 years, 100% at 3 years or more. The debt needs original documents (contract or debt commitment, debt confirmation or a dunning letter, a debt list). The overdue period counts from the original contractual due date. Write-off as uncollectible applies when an individual debtor has died or is prosecuted or jailed, or when an organisation is bankrupt or dissolved. It also applies when a debt has been 100% provisioned for 3 years. — [TT 48/2019/TT-BTC Art. 6 (luatvietnam, cached tt48.txt)](https://luatvietnam.vn/tai-chinh/thong-tu-48-2019-tt-btc-huong-dan-trich-lap-va-xu-ly-cac-khoan-du-phong-giam-gia-hang-ton-kho-176135-d1.html). TT48 has been amended by TT 24/2022/TT-BTC. — [luatvietnam TT24/2022](https://luatvietnam.vn/tai-chinh/thong-tu-24-2022-tt-btc-bo-tai-chinh-219400-d1.html)

**Aging buckets (FIFO receipts against oldest debit; due date = invoice date).** Opening lots are dated from the job month in the partner name ("KH…Tmm/yyyy"). If the name has none, they are dated 2024-12-31. — Source: DB (a5.js)

| Bucket | Amount | Rate | Provision |
|---|---|---|---|
| <6m | 2,288,520,117 | 0 | 0 |
| 6–12m | 512,608,732 | 30% | 153.8M |
| 12–24m | 538,694,432 | 50% | 269.3M |
| 24–36m | 64,720,336 | 70% | 45.3M |
| ≥36m | 207,894,815 (109 partners) | 100% | 207.9M |
| Total | 3,612,438,432 | | 676,328,886 |

- 318 partners still carry an unpaid opening (pre-2025) balance of 586,458,861. For 153 of them (257,605,130) the name gives no date. 285 of these openings (487,086,054) had no receipt at all in 2025–2026. — Source: DB (a5.js)
- Top aged debtors by provision (partner | balance | buckets | last receipt):
  - 01NGUYENCHITHANH(CH) Anh Tiền KH7824T08/2025 | 134,205,027 | 69.4M at 12–24m | last receipt 2025-10-28
  - ANHTHANH(CH) Anh Thanh Phan Thiết | 59,116,806 | opening only, no receipt
  - 98NGUYENTHIMINHKHAI(CH) Cty Phương Nam | 64,363,868 | 49.8M at 12–24m
  - ML1 "Mua lẻ" | 173,178,750 | see the ML1 bullet below
  - BANLET06/2025(CH) Bán Lẻ T06/2025 | 38,038,862
  - 31NGUYENBINHKHIEM(CH) Anh Báu – Đại An Phát | 56,523,340 | never paid
  - 16/20XOVIET(CH) Đại An Phát | 46,412,484 | never paid
  - F2DOINGOCTUOC(CH) Cty Không Gian Xanh | 97,585,847
  - ≥36m, all opening-only and never paid: 4/6BATRIEU(THẢO) 13,741,172 (2022-06) · 116TRUONGCONGDINH(CH) Cty A&A 13,245,645 (2023-05) · ANHTRIEUBARIA(A.NAM) 13,043,046 · 492/96DUONG30/4(THU) 12,121,319 · 45/1THUYVAN(CH) 11,323,479 (2021-12) · 22/20NAMKYKHOINGHIA(MÙI) 8,998,247 (2020-08) · 65/15/5NGUYENBAO 7,519,377 (2020-07) · ANHTIENLONGHAI(MÙI) 6,474,568 (2020-10)
  - Source: DB (a5.out)
- False receivables inside the aging: 146BACU (HƯƠNG) "Anh Đăng" Dư Nợ 18,500,000 = PC6550 12.5M + PC6634 6M. These are cash payments "Chi anh đăng thu nhà…" posted Nợ 331 and re-read as 131. They are not sales. ML1's 173.2M is sales booked to a supplier code. — Source: DB (a9.js, a10.out)
- **Dư Có 131: 192 partners, 270,433,372.** By type: retail 159 / 242.6M, project 29 / 26.3M, supplier 3 / 1.5M. 129 started with an opening Dư Có. 140 had no sales voucher in 2025–26 (128.6M). Categories (excluding 98 crumbs <10k totalling 113k):
  - Opening Dư Có never used: 48 codes, 22,859,759
  - Receipt without any invoice on the code: 13 codes, 105,613,084
  - Overpaid against invoices: 33 codes, 141,847,048
  - Source: DB (a5.js, a7.js)
- Top Dư Có (code | Dư Có | evidence):
  - 78VOVANTAN(A.NINH) Chú Tuấn KH5146T07/19R | 26,998,888 | receipt PT13016 2026-04-03, no invoice, no opening, no twin found
  - 35VIBA(CH) Cty Tùng Anh | 25,726,527 | receipt PT13861 2026-10-09 ↔ same-day invoice BH45657 on CONGTYTUNGANH(THU), still unpaid 25,726,527
  - 22/47NAMKY(CH) Anh Điền BĐS | 22,353,414 | 10 sales; receipts PT12326 71.36M + PT13640 26.07M; possible double receipt
  - 09/TRANQUANGDIEU(CH) Anh Cường KT | 19,236,483 | receipts PT11890 + PT12069, no invoice
  - BANLET05/2025(CH) | 18,302,676 and BANLET01/2025(CH) | 17,980,385 | monthly retail buckets (one has opening Dư Nợ 66.5M, the other 18.1M); receipts cover more than the sales
  - 155ONGICHKHIEM(CH) | 15,983,457 | opening Dư Có equal to receipt PT12743 (ck Sacombank); the opening and the receipt likely double-count
  - 101/14VOVANTAN(CH) | 12,409,362 | PT12964, no invoice
  - Source: DB (a7.js, a8.js)
- **Confirmed wrong-code receipts (exact amount, same address or typo code), 48,034,735:**
  - PT13861 25,726,527 (35VIBA(CH) → CONGTYTUNGANH(THU), invoice BH45657)
  - PT13790 8,798,796 (14/34KHVANCAN → 14/34KHAVANCAN, invoice BH45487)
  - PT13641 7,009,412 (14/49KHAVANCAN → 14/49KHAVANCAN(CH), invoice BH44913)
  - PT13764 6,500,000 (19/9HUNGVUONG (MÙI) → 19/9HUNGVUONG(CH), invoice BH45361)
  - Probable: PT12610 + PT12618 9,000,000 on 22/10LUONGVANNHO(CH) vs 1/34/TRANBINHTRONG(CH) Dư Nợ 9,000,000
  - Source: DB (a7.js, a8.js)
- B01 presentation: TK 131 Dư Nợ goes to line 131. TK 131 Dư Có goes to line 312 "Người mua trả tiền trước". TK 331 Dư Nợ goes to line 132. These lines are reported gross, not netted. — [che_do_ke_toan_tt99_tt133.md lines 320–327](research_notes/Luật thuế kế toán Việt Nam 2026/che_do_ke_toan_tt99_tt133.md)

### Inferences
- **Proposed fixes:**
  - (1) Move the 4 confirmed receipts to the invoice's code. This clears 48.0M of Dư Có and 48.0M of Dư Nợ, with no P&L effect.
  - (2) For receipts with no invoice, either record the missing sales invoice (Nợ 131/Có 511, 3331 — and issue the e-invoice, since revenue may be unreported) or confirm it as an advance.
  - (3) Report remaining Dư Có as 312 gross.
  - (4) Opening Dư Có crumbs (98 codes under 10k) can be cleared by a journal Nợ 131/Có 711 with approval. Do not use cash vouchers for this.
- **Provision:** 676.3M is an upper bound. It assumes the due date equals the invoice date. Most retail jobs have no written contract, debt confirmation or dunning letter. TT48 requires these documents, so the provision would likely be non-deductible for CIT unless the documents are produced. The recommended entry is Nợ 642 (6426 under TT99; 6422 under TT133) / Có 2293, then Nợ 2293 / Có 131 on approved write-off.
- Individuals (most debtors) rarely meet the TT48 write-off conditions. They become write-off-eligible only 3 years after 100% provision. The ≥36m group (207.9M) could be provisioned at 100% now.
- Owner action: before provisioning, send debt-confirmation letters to the 403 debtors with no receipt since 2025 (1,558.5M). This creates the required evidence.

### Gaps
- No due dates or credit terms are stored on vouchers, so true "overdue" (as opposed to age) cannot be computed.
- Opening lots without a date in the name were dated 2024-12-31. Their real age is likely older, so their provision is understated.

## Commission / trích thầu payments: correct posting and PIT not withheld

### Takeaway
62 cash/bank payments totalling 263,379,839 are commissions to contractors and plumbers ("trích thầu", "chi thầu", "hoa hồng", "HH"). 59 are posted Nợ 331 (258.0M), mostly against the fake suppliers SP_9304 (31 payments, 102.1M) and ML1 (26 payments, 132.6M). The rest sit on customer codes or Nợ 334. No 3335 line exists. On the 30 payments of 2M or more, 10% PIT of 23,181,051 was not withheld, or 25,756,724 if the amounts paid were net. Correct posting: Nợ 641 (TT99) or 6421 (TT133) / Có 3335 (10%) / Có 111.

### Cited Findings
- **By partner:**
  - SP_9304 "Khách hàng vãng lai" (declared supplier): 31 payments, 102,087,680
  - ML1 "Mua lẻ": 26 payments, 132,584,812
  - 670TRUONGCONGDINH(CH) Chị Kim Anh: 1 payment, 18,047,083 (PC6904)
  - 197/26/23NAMKY(CH) "KHÁCH LẺ": 2 payments, 5,160,264
  - 160/16/5XOVIET(CH) Anh Trúc thầu: 1 payment, 3,000,000
  - DT_8061 (orphan): 1 payment, 2,500,000
  - Source: DB (a11.js)
- **By posting:** Nợ 331/Có 111 244,692,159; Nợ 331/Có 112 13,187,680; Nợ 334/Có 111 5,500,000 (PC6859, PC6963). By year: 2025 175,582,027; 2026 87,797,812. — Source: DB (a11.js)
- **Largest items:**
  - PC7027 2026-02-13 ML1 53,815,485 "Chi hoa hồng anh tự 2025" (PIT 5,381,549)
  - PC6858 2025-10-12 ML1 22,000,000 "hoa hồng anh tự 1215I bà rịa". Same person as PC7027 and PC6602 ("anh tự", 3,160,264): about 79.0M a year.
  - PC6725 2025-06-23 SP_9304 20,000,000 "chi hoa thu ứng hoa hồng" (advance)
  - PC6904 18,047,083 Chị Kim Anh. This offsets her receipt PT12609 of the same amount ("thu tt tất toán cl") and leaves her code with Dư Có 6,591,254.
  - PC6483 13,187,680 "hoa hồng anh thăng thợ nước 2024 CK"
  - PC6527 8,200,000; PC7019 7,000,000; PC6847 6,700,000; PC6470, PC6480, PC6457, PC7018 6,000,000 each
  - Source: DB (a3.js, a11.out)
- **Full ID list** (59 Nợ 331 + 2 Nợ 334 + PC7001): PC6410 PC6420 PC6430 PC6451 PC6470 PC6471 PC6472 PC6475 PC6480 PC6457 PC6483 PC6485 PC6469 PC6482 PC6486 PC6532 PC6538 PC6527 PC6574 PC6578 PC6589 PC6590 PC6685 PC6602 PC6724 PC6633 PC6699 PC6704 PC6707 PC6709 PC6710 PC6725 PC6660 PC6744 PC6745 PC6777 PC6779 PC6784 PC6778 PC6783 PC6787 PC6904 PC6847 PC6858 PC6859 PC6878 PC6963 PC6907 PC6970 PC6977 PC6991 PC7001 PC7002 PC7006 PC7010 PC7012 PC7013 PC7018 PC7019 PC7024 PC7027 PC7030. Borderline items not counted: PC7226 6,174,369 "PT4186/q84 anh thuần thầu" (likely a refund) and PC6810 6,500,000 "Chi Anh sang 40 co giang" (unclear). — Source: DB (a11.out)
- The app's own rule already flags PC6633 (Nợ 331 → 641, "Chi trích thầu (hoa hồng)…"). Only this one is flagged, because the rule fires only for this pattern on non-supplier codes. — Source: DB `computeCashAccountFixSuggestions` (a2.js)
- **PIT rules:**
  - Until 30/6/2026 (ND 65/2013 / TT 111/2013): a payment of 2M or more per time to an individual without a labour contract (or with a contract under 3 months) requires 10% withholding.
  - From 01/7/2026 (ND 253/2026, under PIT Law 109/2025/QH15): the threshold is 5M per payment.
  - An individual may submit a commitment (cam kết) to avoid withholding if their annual income is below the taxable level. The payer must still report at year end.
  - All 62 payments are dated before 01/7/2026, so the 2M threshold applies.
  - Source: [tncn_bhxh_monbai.md (LuatVietnam on ND 253/2026)](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-253-2026-nd-cp-ve-thue-thu-nhap-ca-nhan-565-110102-article.html); [Tạp chí KT-TC](https://thuehaiquan.tapchikinhtetaichinh.vn/huong-dan-khau-tru-10-thue-tncn-voi-khoan-chi-tu-5-trieu-dong-lan-168499.html)
- Accounts: TT99 keeps 641 Chi phí bán hàng (6417 dịch vụ mua ngoài / 6418 bằng tiền khác). TT133 has no 641; selling costs go to 6421. — [che_do_ke_toan_tt99_tt133.md lines 159, 389, 422](research_notes/Luật thuế kế toán Việt Nam 2026/che_do_ke_toan_tt99_tt133.md)

### Inferences
- **Fix entries.** If the original payment stays, add an adjustment Nợ 641 (6421) / Có 331-ML1 or SP_9304. Better: change the debit account of each voucher to 641/6421 and attach the payee (a new partner per contractor, type individual). Then record the PIT liability for 2025–H1 2026 (Nợ 641 or Nợ 1388 recoverable / Có 3335, 23.2M) and declare it on 05/KK-TNCN late, or collect cam kết 08/CK-TNCN where eligible. For CIT deductibility, keep a commission agreement, a payee receipt with the payee's ID number, and the PIT documents.
- Re-pointing these 258M of Nợ 331 lines away from ML1/SP_9304 would leave those codes with large Dư Có 331. That exposes the opening 1,647.9M as unsupported (next section).
- The 22.0M + 53.8M paid to "anh tự" in one year means that individual's annual income is clearly taxable. A cam kết would not be valid for him.

### Gaps
- Payee identities (CCCD/MST) are not stored, so per-person annual totals can only be guessed from descriptions.
- Whether amounts were paid gross or net of agreed tax is unknown. Both figures are given above.

## Duplicate partner groups with debt split across codes

### Takeaway
The partner catalog is organised by job site: code = address + branch suffix, name = person plus job number "KHnnnnTmm/yyyy". Many codes per common name ("Anh Hùng" 204 codes, "Chị Hương" 13+) are mostly separate jobs, not duplicates. The real duplicates are (a) the same address with a different branch suffix or typo, and (b) the same phone number. Only 3 address groups (13.5M) and 15 phone groups (3.2M offsettable) carry opposite-sign balances. Same-name groups show 62 opposite-sign groups (91.1M offsettable), but most are different people.

### Cited Findings
- Same normalised name: 800 groups with more than 1 code (7,882 codes). 125 groups have balances on 2 or more codes. 62 have opposite signs, with 91,083,082 offsettable. — Source: DB (a6.js)
- **Same address-id (code minus suffix):** 564 groups / 1,188 codes. 11 have balances on 2 or more codes. 3 have opposite signs (13,509,762): 14/49KHAVANCAN vs 14/49KHAVANCAN(CH) 7,009,412; 19/9HUNGVUONG (MÙI) vs 19/9HUNGVUONG(CH) 6,500,000; 977BINHGIA(MÙI) −350 vs (CH) 2,190,207. — Source: DB (a6.out)
- **Same phone:** 594 groups / 2,390 codes. 37 have balances on 2 or more codes. 15 have opposite signs (3,216,794). Examples:
  - 0903387084 "Anh Minh thầu": 297LEQUANGDINH 11,101,167 / 57TRANPHU 2,236,123 / 28HALONG −484,056
  - 0908767223 "Anh Sơn thợ nước": ANHSONTHONUOC(CH) −1,583,035 / 105/76/22LELOI 890,848
  - 0916922734 "Cty An Trung": 7 codes
  - Source: DB (a6.out)
- Monthly retail buckets "Bán Lẻ Tmm/yyyy" (BANLET…): 27 codes with offsetting balances. BANLET01/2025 −17,980,385, BANLET05/2025 −18,302,676, BANLET06/2025 +37,676,192, BANLET10/2026 +113,714,927, BANLET11/2026 +30,785,773. Also duplicate code pairs exist: BANLET08(CH) and BANLET08/2026(CH) are both named "Bán Lẻ T08/2026". 12 BANLET codes carry Dư Nợ 75,895,385. — Source: DB (a6.out, a5.js)
- Typo twins: 14/34KHVANCAN vs 14/34KHAVANCAN; "492/96DUONG30/4(THU)" vs "492/96DUONG30/4(THU)." (trailing dot; Anh Trường thầu, 12,121,319 + 8,800,844, both ≥36m); "17/2/7VOVANTAN(CH)" vs "(CH)." — Source: DB (a5.out, a10.out)

### Inferences
- Merge or relink only on evidence: same address-id or phone, plus a matching amount or a note on the voucher. Do not merge on name. Priority: the 4 exact receipt twins (48.0M), the trailing-dot duplicates, and the BANLET month buckets. Retail "Bán lẻ" receivables should not exist at all if they were cash sales. A positive BANLET balance means a cash sale was posted 131 and never cleared, or a receipt went to another month's bucket.
- "Chị Hương" ×6 and "Anh Long" ×6 (from the brief) are different job sites with different addresses. Of the 12+ "Anh Long" codes, only 149NGUYENDINHCHIEU(A.NAM) (14,648,685, opening, never paid) carries a balance. No split debt was found for those names.

### Gaps
- No tax code or ID number exists for individuals, so true identity cannot be proven from data.

## Receipts/payments on the wrong side; partners with both 131 and 331

### Takeaway
The supplier side is polluted:
- ML1 and SP_9304 act as a cash "suspense" account (1,665.9M of Nợ 331 against a 1,647.9M opening).
- ML1 also holds 193.3M of sales.
- NCC_EXCEL holds 1,124.9M of unidentified purchases.
- 135 payments on customer codes are posted Nợ 331.
- 10 bank-loan receipts (Có 341, 2,288.3M) are booked on partner SACOMBANK; this is correct, not a debt error.

### Cited Findings
- **ML1 "Mua lẻ"** (supplier): opening Có 331 1,268,484,998; 162 payments Nợ 331 1,286,503,218; close −1,000,000. Payment categories:
  - goods purchases "theo hóa đơn" 69 / 450.1M
  - commissions 25 / 129.6M
  - fuel and transport 23 / 26.6M
  - other 45 / 680.2M, incl. PC6874 2025-09-01 360,000,000 "Chi khác" with no explanation
  - Source: DB (a9.js and the categorisation run)
- **ML1 used as a customer:** 10 sales Nợ 131 2026-02-28 → 2026-05-26 totalling 193,312,500 (e.g. BH44034 44,774,228; BH44299 34,523,865; BH43660 30,058,636). Plus receipt PT11813 2025-01-01 20,133,750 "Thu khác" Có 131. Open Dư Nợ 173,178,750. — Source: DB (a9.out)
- **SP_9304 "Khách hàng vãng lai"** is declared type supplier. Opening Có 331 379,432,007; 126 payments Nợ 331 379,432,007; close 0. Contents:
  - commissions 31 / 100.0M
  - "Chi anh đăng thu nhà…" payouts (PC6461 39,387,243; PC6460 29,000,000; PC6509 26,468,827; PC6489 20,000,000…)
  - fuel 32 / 16.7M
  - purchases 25 / 54.4M
  - It also has 1 sale BH44337 of 5,780,000 on Nợ 131.
  - Source: DB (a9.out)
- "Anh Đăng" payouts total 15 vouchers / 216,796,229 (SP_9304, ML1, 146BACU). — Source: DB
- **Owner/family items posted Nợ 331 (non-business, non-deductible):**
  - PC6806 57,000,000 "học phí minh"
  - PC7038 90,000,000 "Chi huyền năm 2025 + tết 2026 + học phí minh"
  - PC6835 11,000,000 "tiền trọng minh"
  - PC7177 9,990,000 "mua điện thoại trọng minh"
  - PC6726 7,000,000 and PC6468 6,000,000 "ký túc xá minh"
  - PC6891 50,000,000 "nhà hàng victory"
  - Total 230,990,000. — Source: DB
- **NCC_EXCEL "Nhà cung cấp Sổ chi tiết":** Có 331 1,124,906,112 from purchases, no payments, real supplier unknown. — Source: DB (a9.out)
- **Supplier Dư Nợ 331 (prepaid) at close:** CTYCPCAMEL(CH) −257,693,700 (opening −828,703,540); TRUNGQUOC(CH) −201,380,110; TUANMINH −74,234,000 (payments 249.9M vs purchases 91.0M + opening 84.7M). — Source: DB (a9.out)
- **Customer codes with Nợ 331 payments: 135 vouchers / 161.5M.** The keyword classifier gives refund 25 / 28.7M, commission 6 / 34.9M, other 104 / 100.6M. The "other" group includes:
  - 74 "Chi khác" on customer codes / 43.5M. 67 of these are under 1M (4.5M), dated 2026-02-13/24 and 2026-03-18, with amounts of 1–600k. These are clean-ups of rounding balances done as cash payments (e.g. PC7064 1 VND, PC7059 20 VND).
  - 197/26/23NAMKY(CH) "KHÁCH LẺ" used for printer PC6533 2.6M, crane hire PC6722 5M, dorm PC6726 7M
  - Source: DB (a10.out, a11.js)
- **Receipts on supplier codes:** CHTHANHCONG(CH) PT13703 551,286; 138BCHILANG PT12872 182,000 (both Có 131 → supplier with Dư Có 131); CONGTYLANTHANH PT12397 1,494,751 Có 331. — Source: DB (a9.out)
- **Bank vs cash:** 5 Lan Thanh/HWATA payments described "ck" (transfer) are posted Có 111, not 112: PC7357, PC7410, PC7418 100,000,000 each; PC7423 90,000,000; PC7409 20,161,000. — Source: DB (a3.js)

### Inferences
- **ML1 / SP_9304.** The 1,647.9M "payable" opening on two anonymous codes, drained by heterogeneous cash outflows, looks like a balancing plug. It does not look like a real debt to suppliers.
  - Fix: obtain the 31/12/2024 supporting list.
  - If unsupported, adjust the opening (prior-period error, 421 under TT99/TT133) and reclassify each 2025–26 payment to its nature:
    - goods → 156 with the supplier named
    - commissions → 641/6421 + PIT
    - fuel → 641/642
    - family costs → 1388 receivable from the owner or 411 withdrawal (not deductible)
    - 360M "Chi khác" → investigate
- **ML1 sales 193.3M:** re-assign to the real buyers (solar-heater installations), or change to a retail customer code and collect. Never age them under a supplier.
- **1-VND "Chi khác" clean-ups:** reverse them and clear the balances with one journal Nợ 811 (or 642) / Có 131, or Nợ 131 / Có 711 for credits, after approval. Cash vouchers for amounts never paid misstate cash.
- **Transfers on Có 111:** move to 112. Cash payments of 5M or more per invoice (Decree 320/2025 threshold) lose input VAT and CIT deductibility. This was covered by another researcher; flagged here because it touches 331.
- **Prepaid suppliers:** present as 132 gross. CAMEL had 828.7M prepaid at opening with only 623.4M of purchases since; confirm whether goods are still due or the balance is a misposting.

### Gaps
- Whether the business follows TT133 (SME) or TT99 cannot be confirmed from data; the app says "TT200". This affects whether to use 641 or 6421.
- The keyword classification of the 135 customer Nợ 331 vouchers is heuristic. 104 are "other" and need manual review.
- The web search tool failed in this session. Legal citations come from cached pages and earlier research notes, not from fresh fetches.
