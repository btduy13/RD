# Chế độ kế toán doanh nghiệp áp dụng ngày 09/11/2026 (TT99/2025, TT133/2016 sửa bởi TT46/2025, TT58/2026) — đối chiếu với RD Accounting

Research note, as of 2026-11-09.

**Method.** WebSearch and WebFetch failed with a model error in this session. Pages were fetched with `curl` from ketoanthienung.net, which reproduces circular text verbatim with article numbers. News headlines came from the Google News RSS feed. thuvienphapluat was not used.

**Builds on.** This note extends the earlier note `research_notes/Luật thuế kế toán Việt Nam 2026/che_do_ke_toan_tt99_tt133.md` (abbreviated **[PRIOR]**). [PRIOR] already holds:
- the full TT99 chart of accounts;
- the TT200→TT99 mapping;
- B01-DN and B02-DN codes under TT99;
- the TT133 chart of accounts and B01a-DNN / B02-DNN codes;
- the TT99 voucher (chứng từ) and book (sổ) lists.

That material is cited here, not repeated.

**Labels.**
- **[UNVERIFIED]**: from prior knowledge, not confirmed against a source fetched in this session.
- **App findings** come from reading code in this worktree. File references are given as `path:line`.

## Q1. Chart of accounts: TT99 vs TT200, TT133, and what the app has

### Takeaway
TT99 keeps 1381, 244, 344, 3386 (BHTN), 2293 and 2294. It adds 215, 332, 1383, 2295, 2414, 6275 and 82111/82112. It removes 611/631, 441/461/466, 161, 417 and most prescribed level-2 accounts. Off-balance accounts 00x do not appear in TT99 Phụ lục II as reproduced.

The app ships separate TT99 and TT133 charts, which is correct. However, each chart is a trader subset. Combined with its "parent already has prescribed children" validation rule, this makes the app **reject several accounts that are valid under TT99/TT133**.

### Cited Findings
- TT99 Phụ lục II has 71 level-1, 101 level-2, 10 level-3 and 2 level-4 accounts. The full list is reproduced in [PRIOR] — [KTTU HTTK99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm)
- TT99 provision accounts are 229 with 2291, 2292, 2293 (phải thu khó đòi), 2294 (giảm giá HTK) and 2295 (tài sản sinh học, new) — [KTTU HTTK99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm)
- Accounts kept from TT200:
  - 244 is renamed "Ký quỹ, ký cược".
  - 344, 1381, 1388 and 3386 (Bảo hiểm thất nghiệp) are unchanged.
  - 3387 is renamed "Doanh thu chờ phân bổ" and 242 "Chi phí chờ phân bổ".
  - 112 is renamed "Tiền gửi không kỳ hạn".
  - Source: [KTTU so sánh TT200–TT99](https://ketoanthienung.net/so-sanh-tai-khoan-ke-toan-thong-tu-200-va-thong-tu-99.htm)
- Opening-balance conversion under Điều 19 TT99: 338 dividend detail→332; 2413 upgrade detail→2414; 441/466→4118; BCC capital held in 138→2281 — [KTTU HTTK99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm)
- The fetched TT99 Phụ lục II text contains no 00x off-balance accounts. A grep of the fetched page for "ngoài bảng" and "001" found nothing. This is absence of evidence, not a repeal clause — [KTTU HTTK99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm)
- TT133 accounts that clash with TT99 by code or meaning:
  - Deposits paid: 1386 (TT133) vs 244 (TT99).
  - Deposits received: 3386 (TT133) vs 344 (TT99).
  - BHTN: 3385 (TT133) vs 3386 (TT99).
  - Fixed assets: one 211 with 2111/2112/2113 sub-accounts (TT133).
  - Expenses: 642 with 6421/6422 (TT133) vs 641 + 642 (TT99).
  - TT133 has 611/631 and no 521.
  - Source: [KTTU HTTK133](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-133.htm)
- TT46/2025 amends TT133 Điều 10. The chart, vouchers and books may now be customised under a "Quy chế hạch toán kế toán", provided BCTC line items are unaffected — [KTTU TT46](https://ketoanthienung.net/sua-doi-bo-sung-thong-tu-133-2016-tt-btc.htm)

**New SME-related circular: TT58/2026/TT-BTC.** Dated 25/05/2026, effective 01/07/2026, for fiscal years starting on or after 01/07/2026. Source for all points: [KTTU TT58/2026](https://ketoanthienung.net/thong-tu-58-2026-tt-btc-che-do-ke-toan-dn-sieu-nho.htm).
- It applies to **micro-enterprises only** and replaces TT132/2018.
- Hộ kinh doanh may opt in.
- It is book-based rather than double-entry. The book set depends on how VAT and CIT are paid:
  - S1-DNSN covers the percentage-of-revenue method.
  - S2b/S2c/S2d/S3b-DNSN cover the deduction method combined with taxable-income CIT.
- A micro-enterprise may instead choose the SME regime. It must keep that choice for the whole fiscal year.
- TT58 does **not** replace TT133.

**App findings: chart of accounts** (`js/core/chart-of-accounts.js`)

| Item | Status | Evidence / law |
|---|---|---|
| Per-regime chart, TT99 \| TT133; stored "TT200" read as TT99 | present-correct | `chart-of-accounts.js:7-9, 271-276`; TT99 Điều 31 |
| TT99 core codes: 1381, 1383, 2293, 2294, 242 "Chi phí chờ phân bổ", 244, 332, 344, 3386 BHTN, 3387 "Doanh thu chờ phân bổ", 82111/82112 | present-correct | `chart-of-accounts.js:18-150` vs [KTTU HTTK99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm) |
| TT133 codes: 1386, 3385 BHTN, 3386 ký quỹ, 6421/6422, 611/631, no 521 | present-correct | `chart-of-accounts.js:151-250` vs [KTTU HTTK133](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-133.htm) |
| TT99 accounts **missing** from the app chart: 3336, 3337, 33381/33382, 2142, 2147, 2291, 2292, 2295, 1281–1288, 1361–1368, 2411–2414, 3411/3412, 3431/3432, 3521–3525, 3531–3534, 3561/3562, 4112, 4113, 41111/41112, 6231–6238, 6271–6278, 6275 | **wrong** (inferred) | Under `isValidAccount` (`:293-308`), a code absent from the chart is rejected when its parent already has prescribed children. So 3336/3337 (333 has children), 2142/2147 (214), 2291/2292/2295 (229) and 4112/4113 (411) are rejected under TT99. Yet the app's own B01 map uses 2142, 2147, 2291, 2292, 4112 and 4113 (`tax-reports.js:244-252`) |
| TT133 accounts missing: 2291/2292, 4112 (Thặng dư vốn cổ phần), 1281/1288, 2411–2413, 3521–3524 | **wrong** for 2291, 2292 and 4112, which are rejected for the same reason; missing for the others | [KTTU HTTK133](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-133.htm); B01a map uses 4112 (`tax-reports.js` TR_B01A_TT133) |
| Off-balance 00x | correctly excluded from B01 (`code[0]==="0"` skip); no 00x in the chart | consistent with TT99 Phụ lục II as reproduced |
| TT58 micro-enterprise regime (S1–S3b-DNSN, B01/B02-DNSN) | missing | needed only if the company is a micro-enterprise and opts in |
| Opening-balance converter (Điều 19 TT99) | not checked in code | [PRIOR] |

### Inferences
- The narrowest fix is to add all Phụ lục II level-2/3 accounts to both charts. Hiding the unused ones is better than rejecting them. Today a user cannot post a valid TT99 entry such as Dr 2292 or Cr 3337.
- 6415 means "Thuế, phí, lệ phí" in TT99. Historical 6415 data posted as warranty cost under TT200 must be re-mapped **[UNVERIFIED that TT200 6415 = warranty; see [PRIOR]]**.

### Gaps
- No primary source fetched states expressly whether TT99 abolishes the 00x accounts.
- No MOF draft replacing TT133 was found. Google News RSS returned nothing relevant for "thay thế Thông tư 133/2016" (checked 2026-11-09).

## Q2. Required financial statements, deadlines and recipients

### Takeaway
**TT99 annual set.** B01-DN Báo cáo tình hình tài chính, B02-DN, B03-DN LCTT (direct or indirect method) and B09-DN.

**TT133 set.** B01a-DNN (or B01b-DNN), B02-DNN, B09-DNN and **F01-DNN Bảng cân đối tài khoản** are mandatory. B03-DNN is encouraged only.

**Deadline.** 90 days after year end, e.g. FY2026 → 31/03/2027. Recipients are "theo pháp luật có liên quan" (in practice the tax authority, together with the CIT finalisation).

**App status.** B01 and B02 exist for both regimes. **B03, B09 and F01-DNN are missing.**

### Cited Findings
- TT99 Điều 17 forms:
  - Going concern: B01-DN, B02-DN, B03-DN and B09-DN.
  - Non-going concern: B01/02/03/09-DNKLT.
  - Interim: a-series and b-series.
  - "không được đánh lại Mã số" (codes must not be renumbered).
  - Source: [KTTU BCTC99](https://ketoanthienung.net/bao-cao-tai-chinh-gom-nhung-gi-mau-bieu-bang-nao.htm)
- **B03-DN (TT99), direct method**, line codes — [KTTU B03-DN TT99](https://ketoanthienung.net/mau-bao-cao-luu-chuyen-tien-te-theo-thong-tu-99.htm):
  - Operating activities:
    - 01 Tiền thu từ bán hàng, CCDV và doanh thu khác
    - 02 Tiền chi trả cho người cung cấp HH&DV
    - 03 Tiền chi trả cho người lao động
    - 04 Chi phí đi vay đã trả
    - 05 Thuế TNDN đã nộp
    - 06 Tiền thu khác từ HĐKD
    - 07 Tiền chi khác cho HĐKD
    - 20 LCTT thuần từ HĐKD
  - Investing activities:
    - 21 Chi mua sắm, xây dựng TSCĐ và TS dài hạn khác
    - 22 Thu thanh lý, nhượng bán
    - 23 Chi cho vay, mua công cụ nợ
    - 24 Thu hồi cho vay
    - 25 Chi góp vốn vào đơn vị khác
    - 26 Thu hồi góp vốn
    - 27 Thu lãi cho vay, cổ tức
    - 30 LCTT thuần từ HĐĐT
  - Financing activities:
    - 31 Thu từ phát hành cổ phiếu, nhận vốn góp
    - 32 Trả lại vốn góp, mua lại cổ phiếu
    - 33 Thu từ đi vay
    - 34 Trả nợ gốc vay
    - 35 Trả nợ gốc thuê tài chính
    - 36 Cổ tức, lợi nhuận đã trả
    - 40 LCTT thuần từ HĐTC
  - Totals:
    - 50 = 20 + 30 + 40
    - 60 Tiền đầu kỳ
    - 61 Ảnh hưởng tỷ giá
    - 70 = 50 + 60 + 61
- **B03-DN (TT99), indirect method** — [KTTU B03-DN TT99](https://ketoanthienung.net/mau-bao-cao-luu-chuyen-tien-te-theo-thong-tu-99.htm):
  - 01 Lợi nhuận trước thuế
  - Adjustments:
    - 02 Khấu hao TSCĐ và BĐSĐT
    - 03 Các khoản dự phòng
    - 04 Lãi/lỗ CLTG đánh giá lại khoản mục tiền tệ
    - 05 Lãi/lỗ từ HĐ đầu tư, tài chính
    - 06 Chi phí đi vay
    - 07 Điều chỉnh khác
  - 08 LN từ HĐKD trước thay đổi vốn lưu động
  - Working-capital changes:
    - 09 Tăng/giảm phải thu
    - 10 Tăng/giảm HTK
    - 11 Tăng/giảm phải trả (excluding interest payable and CIT payable)
    - 12 Tăng/giảm **chi phí chờ phân bổ**
    - 13 Tăng/giảm chứng khoán kinh doanh
  - 14 Chi phí đi vay đã trả
  - 15 Thuế TNDN đã nộp
  - 16 Thu khác
  - 17 Chi khác
  - 20 LCTT thuần từ HĐKD
  - Sections II and III and lines 50–70 are the same as the direct method.
- B02-DN (TT99) inserts code 21 "Lãi/lỗ của hoạt động bán, thanh lý BĐSĐT" and shifts financial items to 22/23/24 — [KTTU B02-99](https://ketoanthienung.net/mau-bao-cao-ket-qua-hoat-dong-kinh-doanh-nam-theo-thong-tu-99.htm)
- **Deadline under Điều 25 TT99:** annual BCTC is due "chậm nhất là 90 ngày, kể từ ngày kết thúc kỳ kế toán năm", e.g. FY2026 → 31/03/2027. Further points of Điều 25:
  - Submission follows "pháp luật có liên quan".
  - Audited entities must attach the audit report.
  - BCTC held on the national business registration system may be requested by authorities.
  - Source: [KTTU thời hạn nộp BCTC TT99](https://ketoanthienung.net/thoi-han-nop-bao-cao-tai-chinh-theo-thong-tu-99.htm)
- Unlike TT200 Điều 110 **[UNVERIFIED, prior knowledge]**, TT99 Điều 25 as fetched contains no fixed recipient list (tax, statistics, business registration).
- TT133 BCTC set:
  - Mandatory: B01a-DNN or B01b-DNN, B02-DNN, B09-DNN and **F01-DNN** (attached BCTC sent to the tax authority).
  - Encouraged: B03-DNN.
  - Source: [KTTU BCTC133](https://ketoanthienung.net/mau-bao-cao-tai-chinh-theo-thong-tu-133-moi-nhat.htm)
- TT58/2026 (micro-enterprises):
  - Those paying CIT on taxable income prepare B01-DNSN and B02-DNSN, due within 90 days.
  - Those paying CIT as a percentage of revenue need not file a BCTC.
  - Source: [KTTU TT58/2026](https://ketoanthienung.net/thong-tu-58-2026-tt-btc-che-do-ke-toan-dn-sieu-nho.htm)

**App findings: financial statements** (`js/modules/tax-reports.js`)

| Statement | Status | Evidence |
|---|---|---|
| B01-DN (TT99) layout and codes 100–440 | present-correct (layout) | `tax-reports.js:238-330` (TR_B01_TT99) matches [PRIOR]/KTTU B01-99 |
| B01-DN mapping details | **partly wrong** | (a) No short-/long-term split for 131/331/242/244/341/3387: all go to short-term lines (161, 135, 321, 319). The code itself flags this as a shortcut. TT99 requires separate lines 211–216, 271, 331–339. (b) `"1281":"112"` puts every 1281 balance into cash equivalents. TT99 line 112 should hold only short-maturity deposits **[UNVERIFIED cách lập detail]**. (c) Unmapped accounts are added to totals, so the sheet balances while hiding the mapping errors (`buildBalanceSheet`) |
| B01a-DNN (TT133) | present-correct (layout); same no-split caveat is irrelevant here because B01a has no short/long split | `TR_B01A_TT133` matches [KTTU B01a133](https://ketoanthienung.net/cach-lap-bao-cao-tinh-hinh-tai-chinh-theo-thong-tu-133.htm) |
| B01b-DNN | missing (optional alternative) | — |
| B02-DN (TT99), codes 01–71 incl. new 21 | present-correct; code 21 is hard-coded 0 (shortcut) | `tax-reports.js:478-501` |
| B02-DNN (TT133), 24 = CP quản lý kinh doanh, 51 = total CIT | present-correct | `tax-reports.js:502-519` |
| **B03-DN / B03-DNN (LCTT)** | **missing**: no code, no menu item. Mandatory for TT99; optional for TT133 | grep for "lưu chuyển", "B03" finds nothing in `js/`, `index.html` |
| **B09-DN / B09-DNN (Thuyết minh)** | **missing**. Mandatory for both regimes | grep for "thuyết minh", "B09" finds nothing |
| **F01-DNN Bảng cân đối tài khoản** | **missing as a form**. `reports.js` has a "Bảng Cân đối phát sinh" (S06-DN equivalent, `index.html:2823`) that could feed it, but there is no F01-DNN header/format | [KTTU BCTC133](https://ketoanthienung.net/mau-bao-cao-tai-chinh-theo-thong-tu-133-moi-nhat.htm) |
| B01/B02-DNSN (TT58) | missing | only if the micro regime is chosen |
| Prior-year comparative column ("Năm trước"/"Số đầu năm") | not checked; required by the form layouts | KTTU form layouts show both columns |
| 90-day BCTC deadline reminder | not checked (`js/modules/tax-calendar.js` exists) | Điều 25 TT99 |
| Signature block: Người lập (TT99) / Người lập biểu (TT133), Kế toán trưởng, Người đại diện theo pháp luật | present-correct | `reports.js:377-397`; Luật KT Điều 24.2 via [KTTU mở/khóa sổ](https://ketoanthienung.net/mo-so-ghi-so-va-khoa-so-ke-toan-theo-thong-tu-99.htm) |

### Inferences
- **Highest-value gaps:** B03-DN is mandatory under TT99. B09 is mandatory under both regimes. F01-DNN is mandatory under TT133.
- **Feasibility.** The app already has a general journal with contra accounts. A direct-method B03 is therefore feasible by classifying each 111/112/113 movement by contra account and voucher type.
- **Line 12 of the indirect B03** depends on 242 balances. This is one more reason a 242 allocation schedule is needed.

### Gaps
- B09-DN (TT99) section list and B03-DNN/F01-DNN column layouts were not extracted this session.
- The TT99 Phụ lục IV "cách lập" rules for line 112 (cash equivalents, ≤3 months) were not fetched.

## Q3. Books, vouchers, signatures, kỳ kế toán, khóa sổ

### Takeaway
Under TT99 and TT133 (after TT46/2025), voucher and book forms are reference-only. Luật Kế toán Điều 24, 26 and 16 remain binding:
- Books must carry the unit name, book name, opening and closing dates, and three signatures.
- Books must be opened at the start of the year.
- Entries must be chronological and continuous from opening to closing.
- Books must be **closed before preparing the BCTC**.
- E-books must be printed and bound per year, or stored electronically and kept searchable.

**App status.** The app has the core books. It has **no period lock (khóa sổ)**, and no fixed-asset or 242 books.

### Cited Findings
- **Điều 13 TT99:**
  - Mở sổ: at the start of the annual period, or from the founding date.
  - Ghi sổ: based on vouchers, timely and accurate.
  - Khóa sổ: "phải khóa sổ kế toán tại thời điểm kết thúc kỳ kế toán để lập Báo cáo tài chính".
  - Source: [KTTU mở/ghi/khóa sổ TT99](https://ketoanthienung.net/mo-so-ghi-so-va-khoa-so-ke-toan-theo-thong-tu-99.htm)
- **Luật Kế toán 88/2015 Điều 26** (quoted on the same page):
  - Entries must follow the chronological order of transactions.
  - Next year's figures must continue from the prior year.
  - Recording must be continuous from opening to closing.
  - E-books must comply with Điều 24, Điều 25 and Điều 26.1–4 and .6, except the cross-page seal.
  - After closing, e-books must be printed and bound per year. If they are not printed, electronic storage must be secure and remain searchable for the whole retention period.
  - Source: [KTTU mở/ghi/khóa sổ TT99](https://ketoanthienung.net/mo-so-ghi-so-va-khoa-so-ke-toan-theo-thong-tu-99.htm)
- **Luật KT Điều 24.2 and 24.3:**
  - A book shows the unit name, book name, opening date, closing date, signatures of the preparer, chief accountant and legal representative, page numbers and the cross-page seal.
  - Minimum content: recording date, voucher number and date, summary, and amount by account.
  - Source: [KTTU mở/ghi/khóa sổ TT99](https://ketoanthienung.net/mo-so-ghi-so-va-khoa-so-ke-toan-theo-thong-tu-99.htm)
- **Computer-based accounting (TT99):**
  - Software must "in được đầy đủ sổ kế toán và báo cáo tài chính theo quy định".
  - At month end, "thực hiện các thao tác khoá sổ (cộng sổ)".
  - At month and year end, general and detail books are printed and bound.
  - Source: [KTTU ghi sổ trên máy vi tính TT99](https://ketoanthienung.net/ghi-so-theo-hinh-thuc-ke-toan-tren-may-vi-tinh-theo-thong-tu-99.htm)
- **Form status:**
  - TT99 Điều 9 (vouchers, Phụ lục I) and Điều 12 (books, Phụ lục III) are "tham khảo" (reference only).
  - Main forms: 01-TT/02-TT, 01-VT/02-VT, S03a-DN, S03b-DN, S06-DN, S07/S07a-DN, S08-DN "Sổ tiền gửi không kỳ hạn", S10/S11/S12-DN, S21/S23-DN, S31-DN and S35/S38-DN.
  - Source: [PRIOR] citing [KTTU CT99](https://ketoanthienung.net/mau-bieu-chung-tu-ke-toan-theo-thong-tu-99.htm) and [KTTU SO99](https://ketoanthienung.net/danh-muc-mau-bieu-so-sach-ke-toan-theo-thong-tu-99.htm)
- **Kế toán trưởng and vouchers:** under TT99 Điều 10, the chief accountant must not sign "thừa ủy quyền" for the director on vouchers — [KTTU CT99](https://ketoanthienung.net/mau-bieu-chung-tu-ke-toan-theo-thong-tu-99.htm)
- **Kỳ kế toán:** the annual period is 12 months (calendar year or another 12-month period). Monthly and quarterly periods are optional, and the first period may be up to 15 months under Luật KT Điều 12 **[UNVERIFIED, prior knowledge]**.

**App findings: books and vouchers**

| Item | Status | Evidence |
|---|---|---|
| S03a-DN Sổ Nhật ký chung | present | `index.html:2821`, `reports.js` |
| S03b-DN Sổ Cái / S38 sổ chi tiết TK | present (one "Sổ Cái chi tiết tài khoản" view) | `index.html:2822` |
| S06-DN Bảng cân đối số phát sinh | present | `index.html:2823`, `calculateTrialBalance` `reports.js:431` |
| S31-DN Sổ chi tiết thanh toán người mua/bán (131/331) | present | `debts.js:419` ("mẫu S31/S13") |
| S12-DN Thẻ kho; S10 sổ chi tiết hàng hóa | present (thẻ kho, sổ chi tiết in inventory UI) | `index.html:1819, 1890` |
| S07-DN Sổ quỹ tiền mặt | **partial**: cash module has a "Danh sách thu, chi tiền" with "Ngày ghi sổ quỹ"; no S07 form with running balance confirmed | `cash.js:850-853` |
| S08-DN Sổ tiền gửi không kỳ hạn | not found as a named book; derivable via the ledger for 112 | grep finds no "S08" or "tiền gửi" book |
| S35-DN Sổ chi tiết bán hàng | not checked | — |
| S21/S23-DN Sổ/Thẻ TSCĐ; 06-TSCĐ Bảng tính khấu hao | **missing** | no fixed-asset module (grep for "khấu hao" hits only chart names) |
| 07-VT Bảng phân bổ CCDC / 242 schedule | **missing**; only a manual "Phiếu kế toán" exists (`index.html:2681, 3597` placeholder "Phân bổ chi phí trả trước") | — |
| Vouchers 01-TT, 02-TT, 01-VT, 02-VT print | present | GAP_ANALYSIS.md §1 |
| Book header (unit, book name, opening/closing dates) + 3 signatures | signatures present (`reports.js:377-397`); "ngày khóa sổ" header not verified | Luật KT Điều 24.2 |
| **Khóa sổ / period lock** | **missing**. Only a comment at `accounting.js:25` ("kỳ trước đã khóa sổ"). No lock date in state; back-dated edits are not blocked. `period_close` only generates closing entries to 911/421 (`tax-reports.js:231-234`, `accounting.js:456`) | Điều 13.3 TT99; Luật KT Điều 26.6 |
| Year-end closing entries (kết chuyển) | present | `buildPeriodCloseVoucher` |
| Print/export books per year for archiving | present (print), bound-book format not verified | Luật KT Điều 26.7 |

### Inferences
- A period lock is the clearest legal-control gap. Without it, numbers in a filed BCTC can be changed silently, which conflicts with Luật KT Điều 26.6 and with the continuity rule in Điều 26.4.
- Under TT58 Điều 3.2, a micro-enterprise may have a "phụ trách kế toán" sign instead of a kế toán trưởng. The app hard-codes the title "KẾ TOÁN TRƯỞNG"; it could become configurable.

### Gaps
- The kỳ kế toán rule (Luật KT Điều 12) was not fetched this session.

## Q4. Inventory, provisions, fixed assets (TT45/2013 status), CCDC/242

### Takeaway
- **Inventory.** TT99 allows specific identification, weighted average (periodic or perpetual), FIFO, the retail method and standard cost. The app uses perpetual weighted average only, which is an allowed method.
- **Provisions.** Accounts 2293/2294 exist, but there is no provisioning workflow. Bad debts are written straight to 642.
- **Depreciation.** **TT45/2013 is still the depreciation rulebook in 2026.** An MOF draft to replace it opened for comment in Oct 2026 and is not yet in force.
- **App gap.** There is no fixed-asset or depreciation module and no 242 allocation.

### Cited Findings
- **TT99 inventory valuation methods:** giá đích danh, bình quân gia quyền (period or each receipt), FIFO, giá bán lẻ and chi phí chuẩn. 611/631 are removed — [KTTU HTK99](https://ketoanthienung.net/nguyen-tac-ke-toan-hang-ton-kho-theo-thong-tu-99.htm) (via [PRIOR])
- **TT45/2013 Điều 13:** three depreciation methods:
  - Straight-line. Accelerated depreciation is capped at 2× straight-line; the excess is not CIT-deductible.
  - Adjusted declining balance.
  - Units of production.
  - The enterprise chooses the method and period under TT45 and notifies the tax authority before applying them.
  - Source: [KTTU phương pháp khấu hao](https://ketoanthienung.net/cac-phuong-phap-trich-khau-hao-tai-san-co-dinh-moi-nhat.htm)
- **Depreciation principles:** TT45 Điều 9, as amended by TT147/2016 — [KTTU nguyên tắc trích khấu hao](https://ketoanthienung.net/nguyen-tac-trich-khau-hao-tai-san-co-dinh.htm)
- **Useful-life frame:** TT45 Phụ lục 1 — [KTTU khung khấu hao](https://ketoanthienung.net/khung-thoi-gian-trich-khau-hao-cac-loai-tai-san-co-dinh.htm)
- **TT45 still in force.** Headline (04/07/2026): "Thông tư số 45/2013/TT-BTC và Thông tư số 48/2019/TT-BTC tiếp tục có hiệu lực" — [Tạp chí Kinh tế – Tài chính via Google News](https://news.google.com/rss/articles/CBMivgFBVV95cUxOYjRDdVVYMlp3aVlMODhiY0ZiYnRrMlZCTks0THdGRVZCZXRhYlczVVY2SllvV1hhRl8zaGZSNU45NFU4QkdPQ1FpS3k3TkFfV0piclZIYmRadVVaVEZFcWd5bDVHR1pybDFUSmhfUkp0ek9vdXlwTm1WdWxXaGg4TWt0ZDRGQkdXS2VsQTBhYTFRRnVMcWpUa09SSHBFczJtRkEtR1l4QW5IcVo5b0RUUlk0VWwyV3JKOU80ZTd3?oc=5). TT48/2019 is the provisions circular **[UNVERIFIED identity, prior knowledge]**.
- **Draft replacement for TT45 (Oct 2026):**
  - MOF portal (13/10/2026): "Định hướng xây dựng Thông tư về quản lý, sử dụng tài sản cố định" — [MOF via Google News](https://news.google.com/rss/articles/CBMisgFBVV95cUxQWWZyM3NRWEtxVlBKWllSNzRaQW52Q28xbkMzTG0tX3h3bVBrMzQ2ckFIWlZ3cldCQ2FCUDdaOVBMcmktNDI4RVJHaVBPXy00LUMyVE5PZXUzWndvOVF4bm1mR1lIcVV5WVZTRlNDdHhlRWF3QkduVFhXMExOWW54OWM2UC1iWXRnUTZMQVFEbGdZakcyNGotWnBWd01lQXU5VVduaElfLTdPWnlWd1JEeUNn?oc=5)
  - Headline (21/10/2026): "Dự thảo thay thế Thông tư 45: Lợi nhuận doanh nghiệp có thể tăng nhờ kéo dài khấu hao" — [Tin nhanh chứng khoán via Google News](https://news.google.com/rss/articles/CBMizwFBVV95cUxOWFhseHNURWFYMG5CbTFBTndveUtSZ2wxcXV0MVhHUThDWkN5SzhRRHJQM05yWWZ6SFFKaExYcDlzRkZnNjUzR3Y5aXc2WW81aWs5OWNiYS1SQ2w3S2JDUkZCYV9yTDJTbG5IMEVHQXBoTUFQSDB4bUIwdkUtdHR3OHZtQ0VTblZXb0dCZEZIOW8xLU1YVndFZXl0dHlLMUg3aTNjcURDQWprY2Y3SXNyRkJHak5oa2dIMExnN1dNdEpaRmRmZ1hmc2Q3dnl0V0HSAcsBQVVfeXFMUHhFNFBSYkpvckxEQU1DNlY2dTZrYTZkb2VvQmNVODg4WFJUTlREQUZVb2F0NUJGNUZEMlk5RmFfNXpfc0hqbTVBaHNiakN5YVpLc2xhSEVZdVlIbUUwSk9SNDBUTm9ucDFPSWlkUnZ2dDlqTzJEU2FVSXc2Nk5ybkhWeXF2ZEhwSmRKTkhyek9CVGRSTVZVWkt1UDhvR0JuQVZJRzd0V3V1ME1RbmFfVVc0d0tOMWtUUTI1SDk2ejBtWFVDQWQ4OTcxVVk?oc=5)
  - Headline (15/10/2026): "Đề xuất bỏ thủ tục xin phép khi thay đổi phương pháp khấu hao tài sản" — [Báo Công Lý via Google News](https://news.google.com/rss/articles/CBMipAFBVV95cUxQaTB0UUZRSnIxTnZzbVVrRHFxVTZ6SGdnOTU0dUtqaENBMjdlSWowWVUxSGlVVE50YUVjcFVWRjBzaDhIcUFpU1ZOcWI5d3kxcXgzWG9oZ01IdEZsUFBTUjZqX3k3Q2hCdlc4WUJnTzNpTE5ONTZUUno3Mlh4VWFTWTc0TXkyNkh4QlNqVmVqVzg4blI3WTF1bDZCSTdKOTc2eTU0Uw?oc=5)
  - These are headlines only. Article bodies were not read.
- **TSCĐ recognition threshold:** ≥30 million VND and useful life >1 year (TT45 Điều 3). Assets below the threshold are CCDC, allocated via 242 over at most 3 years under TT96/2015 **[UNVERIFIED, prior knowledge]**.
- **TT99 TSCĐ vouchers:** 01–06-TSCĐ, including 06-TSCĐ Bảng tính và phân bổ khấu hao. Books: S21/S22/S23-DN. Source: [PRIOR] / [KTTU CT99](https://ketoanthienung.net/mau-bieu-chung-tu-ke-toan-theo-thong-tu-99.htm)

**App findings: inventory, provisions, fixed assets, 242**

| Item | Status | Evidence |
|---|---|---|
| Inventory method: perpetual weighted average | present-correct (allowed) | `inventory.js:852`, `accounting-engine.js:86`; GAP_ANALYSIS §1 |
| FIFO / specific identification / retail method option | missing (optional; only one method is needed if applied consistently) | TT99 HTK principles |
| Dự phòng giảm giá HTK (2294) and phải thu khó đòi (2293) workflow | **missing**. Accounts exist and map to B01 136/142. Bad-debt write-off goes Dr 642 directly "chưa lập dự phòng 2293" | `accounting-engine.js:232`; `tax-reports.js:246` |
| Fixed-asset register, depreciation run (211/213/214 → 6424/6414), 06-TSCĐ, S21/S23 | **missing** | grep finds no "khấu hao" logic |
| CCDC/242 allocation schedule | **missing** (manual journal only) | `index.html:3597` |
| Year-end FX revaluation (413) | not checked | — |

### Inferences
- A trading SME owns at least some fixed assets (a vehicle, computers). Without a register, B01 lines 221–229, B03 indirect line 02 and B09 TSCĐ notes cannot be produced from the system.
- Build any fixed-asset feature on TT45 now. Keep the method and frame configurable, because the Oct 2026 draft may change useful lives and drop the notify or approval step.

### Gaps
- The draft TT45 replacement was not read in full; its effective date is unknown.
- TT48/2019 provision rules were not fetched.

## Q5. Luật Kế toán 2015 as amended 2024: chief accountant, retention, e-documents

### Takeaway
Luật Kế toán 88/2015/QH13 remains the base law. It was amended by Law 56/2024/QH15, a multi-law amendment effective 01/01/2025. Chief-accountant, retention and e-voucher rules flow mainly from Luật KT and Nghị định 174/2016. Most of those details were **not re-verified** this session.

### Cited Findings
- TT58/2026 lists its legal bases as "Luật Kế toán số 88/2015/QH13" and "Luật sửa đổi, bổ sung một số điều của Luật Chứng khoán, Luật Kế toán, Luật Kiểm toán độc lập, … số 56/2024/QH15". This confirms the 2024 amendment is the current amending act — [KTTU TT58/2026](https://ketoanthienung.net/thong-tu-58-2026-tt-btc-che-do-ke-toan-dn-sieu-nho.htm)
- Full text of Law 56/2024 published by the Government portal, headline dated 01/01/2025 — [xaydungchinhsach.chinhphu.vn via Google News RSS search](https://news.google.com/rss/search?q=Lu%E1%BA%ADt+K%E1%BA%BF+to%C3%A1n+s%E1%BB%ADa+%C4%91%E1%BB%95i+56/2024&hl=vi&gl=VN&ceid=VN:vi)
- **Chief accountant:**
  - A micro-enterprise "không bắt buộc phải bố trí kế toán trưởng". A "phụ trách kế toán" may sign in that role on vouchers, books and BCTC.
  - A micro-enterprise may employ relatives of managers, storekeepers or cashiers as accountants, or hire an accounting service.
  - Source: TT58/2026 Điều 3 — [KTTU TT58/2026](https://ketoanthienung.net/thong-tu-58-2026-tt-btc-che-do-ke-toan-dn-sieu-nho.htm)
- **Electronic books** are allowed. When books are kept electronically and not printed, storage must be secure and searchable for the retention period. Source: Luật KT Điều 26.7 — [KTTU mở/khóa sổ](https://ketoanthienung.net/mo-so-ghi-so-va-khoa-so-ke-toan-theo-thong-tu-99.htm)
- **Other enterprises (prior knowledge, not re-verified) [UNVERIFIED]:**
  - A kế toán trưởng or phụ trách kế toán is required (Luật KT Điều 52; NĐ 174/2016 Điều 20–21).
  - Retention: at least 10 years for books, BCTC and vouchers used directly for recording; 5 years for management-only documents; permanent for some items (Luật KT Điều 41; NĐ 174/2016 Điều 12–14).
  - E-vouchers are equivalent to paper and need a digital signature (Luật KT Điều 17–18).
  - The 2024 amendment mainly changed audit and sanctions provisions, not bookkeeping.
- New 2026 instruments listed on ketoanthienung, titles only:
  - TT91/2026/TT-BTC on e-invoices and chứng từ, dated 30/06/2026.
  - NĐ 254/2026/NĐ-CP on e-invoices.
  - NĐ 283/2026/NĐ-CP on administrative sanctions, dated 15/07/2026.
  - Source: [KTTU văn bản pháp luật mới nhất](https://ketoanthienung.net/van-ban-phap-luat-ke-toan-moi-nhat.htm)

**App findings: Luật Kế toán controls**

| Item | Status | Evidence |
|---|---|---|
| Chief-accountant / preparer / director names on reports | present-correct | `reports.js:389-393` (`state.chiefAccountantName`, `preparerName`, `directorName`) |
| "Phụ trách kế toán" label option (micro / no KTT) | missing (minor) | TT58 Điều 3.2 |
| 10-year retention / immutable archive / audit trail of edits | not verified; there is no period lock (Q3), so post-filing edits are possible | Luật KT Điều 26.7 |
| E-document storage searchable over retention period | partial (backup-store, cloud-sync exist; not verified against the requirement) | `js/core/backup-store.js` |

### Inferences
- In practice, the e-voucher requirements fall on invoices, which are handled under the tax/invoice track (TT91/2026, NĐ 254/2026). Another researcher's scope should confirm them.

### Gaps
- NĐ 174/2016 retention periods and chief-accountant criteria were not fetched this session. Check any amendment by a 2025–2026 decree.
- The content of Law 56/2024 amendments to Luật Kế toán was not read; only its existence and effective use as a legal basis were confirmed.
- No source confirms or denies a 2026 draft replacing TT133. TT58/2026 covers only micro-enterprises.

## Q6. Consolidated gap list (app vs law), by priority

### Takeaway
Must-fix for a compliant FY2026 TT99 filing: B03-DN, B09-DN, a period lock, and chart completeness so valid accounts are not rejected. For TT133 users, add F01-DNN and B09-DNN. Fixed assets, 242 and provisions are needed for real-world completeness.

### Cited Findings
| # | Item | Status | Basis |
|---|---|---|---|
| 1 | B03-DN LCTT (TT99, mandatory) | missing | [KTTU B03-DN](https://ketoanthienung.net/mau-bao-cao-luu-chuyen-tien-te-theo-thong-tu-99.htm); [KTTU BCTC99](https://ketoanthienung.net/bao-cao-tai-chinh-gom-nhung-gi-mau-bieu-bang-nao.htm) |
| 2 | B09-DN / B09-DNN thuyết minh | missing | [KTTU BCTC99](https://ketoanthienung.net/bao-cao-tai-chinh-gom-nhung-gi-mau-bieu-bang-nao.htm); [KTTU BCTC133](https://ketoanthienung.net/mau-bao-cao-tai-chinh-theo-thong-tu-133-moi-nhat.htm) |
| 3 | F01-DNN Bảng cân đối tài khoản (TT133) | missing as a form; data exists in S06 | [KTTU BCTC133](https://ketoanthienung.net/mau-bao-cao-tai-chinh-theo-thong-tu-133-moi-nhat.htm) |
| 4 | Khóa sổ / period lock | missing | Điều 13.3 TT99, Luật KT Điều 26.6 — [KTTU](https://ketoanthienung.net/mo-so-ghi-so-va-khoa-so-ke-toan-theo-thong-tu-99.htm) |
| 5 | Chart rejects valid TT99 accounts (2291, 2292, 2295, 2142, 2147, 3336, 3337, 4112, 4113, …) and valid TT133 accounts (2291, 2292, 4112) | wrong | `chart-of-accounts.js:293-308` vs [KTTU HTTK99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm), [KTTU HTTK133](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-133.htm) |
| 6 | B01-DN short/long-term split (131, 331, 242, 244, 341, 3387) | wrong (all short-term) | [KTTU B01-99](https://ketoanthienung.net/mau-bao-cao-tinh-hinh-tai-chinh-theo-thong-tu-99.htm) lines 211–216, 271, 331–339 |
| 7 | B02-DN code 21 (BĐSĐT gain/loss) hard-coded 0 | acceptable for a trader, flagged | [KTTU B02-99](https://ketoanthienung.net/mau-bao-cao-ket-qua-hoat-dong-kinh-doanh-nam-theo-thong-tu-99.htm) |
| 8 | Fixed-asset register + depreciation (TT45) | missing | [KTTU khấu hao](https://ketoanthienung.net/cac-phuong-phap-trich-khau-hao-tai-san-co-dinh-moi-nhat.htm) |
| 9 | 242 / CCDC allocation | missing | TT99 Phụ lục I 07-VT ([KTTU CT99](https://ketoanthienung.net/mau-bieu-chung-tu-ke-toan-theo-thong-tu-99.htm)) |
| 10 | Provisions 2293/2294 workflow | missing (write-off direct to 642) | `accounting-engine.js:232` |
| 11 | S07 sổ quỹ (running balance) / S08 sổ tiền gửi không kỳ hạn | partial / not found | [KTTU SO99](https://ketoanthienung.net/danh-muc-mau-bieu-so-sach-ke-toan-theo-thong-tu-99.htm) |
| 12 | B01b-DNN alternative, DNKLT forms, interim forms | missing (optional / situational) | [KTTU BCTC99](https://ketoanthienung.net/bao-cao-tai-chinh-gom-nhung-gi-mau-bieu-bang-nao.htm) |
| 13 | TT58/2026 micro regime (S1–S3b-DNSN, B01/B02-DNSN) | missing (only if micro and opting in) | [KTTU TT58](https://ketoanthienung.net/thong-tu-58-2026-tt-btc-che-do-ke-toan-dn-sieu-nho.htm) |
| 14 | Present-correct: TT99/TT133 dual chart; B01-DN/B01a-DNN layouts; B02-DN/B02-DNN codes; S03a, S03b, S06, S31, S12; 3-party signature block; year-end kết chuyển; weighted-average inventory; 00x excluded | present-correct | see Q1–Q4 |

### Inferences
- **Ordering by legal exposure × effort:** #5 (small data fix) → #4 (lock date) → #1 (direct B03 from cash entries) → #3 (re-label the trial balance) → #2 (B09 template with auto-filled tables) → #8–#10.

### Gaps
- The `tax-calendar.js` 90-day BCTC reminder, comparative columns, S35 and FX revaluation were not checked in code.
- All legal text comes from one secondary reproducer (ketoanthienung) plus news headlines. Confirm against Công báo / vbpl.vn before release.
