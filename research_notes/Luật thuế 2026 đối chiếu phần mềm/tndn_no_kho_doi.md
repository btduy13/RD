# Thuế TNDN 2026, chi phí được trừ, nợ khó đòi và dự phòng: đối chiếu với phần mềm

> Research conditions: verified on 2026-11-09. WebSearch was not used. Sources were found through Google News RSS (links decoded with the batchexecute call) and fetched with curl. The full texts read this session:
> - NĐ 320/2025/NĐ-CP on luatvietnam.vn
> - TT 20/2026/TT-BTC on ketoanthienung.net
> - TT 48/2019/TT-BTC on luatvietnam.vn
> - the Tạp chí Kinh tế – Tài chính article on QĐ 1760/QĐ-BTC
>
> thuvienphapluat.vn was not used (Cloudflare). Rates, the 30% reduction, deadlines and forms were verified on 2026-11-07 in `research_notes/Luật thuế kế toán Việt Nam 2026/thue_tndn_nha_thau.md`. They are summarised here with the same citations and not re-fetched.
>
> App code read: `js/core/tax-rules.js`, `js/modules/tax-reports.js` (computeProfitLoss, computeCitEstimate, buildCitProvisionVoucher), `js/core/accounting-engine.js` (suggestCashAccountFix), and commit 149046c.
>
> App status labels: **ĐÚNG** = verified-correct · **SAI** = wrong in app · **THIẾU** = missing in app.

## 1. Thuế suất, giảm 30%, tạm nộp 80%, quyết toán, mẫu biểu (Luật 67/2025, NĐ 320/2025, NĐ 398/2026, NĐ 252/2026, TT 89/2026)

### Takeaway
The CIT rates are 15%, 17% and 20%. The tier is chosen by revenue of the immediately preceding year. For tax years 2026 and 2027 there is also a 30% reduction. It is tested on revenue of the same year (≤ 10 billion VND).

Provisional payments:
- They are made each quarter with no quarterly return.
- Each is due on the last day of the first month of the next quarter.
- The four quarters together must reach ≥ 80% of the finalized tax.

The finalization return 03/TNDN and the payment are due on the last day of the 3rd month after year-end. The app implements the rates, the 30% reduction and the 80% check correctly. It computes taxable income as accounting profit with no tax adjustments.

### Cited Findings
- NĐ 320 Điều 11 sets the rates:
  - k1: 20%.
  - k2: 15% when total annual revenue is ≤ 3 billion.
  - k3: 17% when revenue is > 3 billion and ≤ 50 billion.
  - k4: revenue = net sales + financial income + other income of the **preceding year**, annualised if that year was shorter than 12 months.
  - k4c: the reduced rates are excluded for subsidiaries and related parties of non-qualifying enterprises.

  — [LuatVietnam – NĐ 320/2025](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- NĐ 398/2026 Điều 3–4:
  - CIT payable for tax years 2026 and 2027 is reduced by 30% if revenue **of that year** is ≤ 10 billion.
  - Revenue here = net sales + financial income + other income.
  - The enterprise applies the reduction itself in its provisional payments. If actual revenue exceeds 10 billion, it repays the reduction plus late-payment interest.
  - The Decree is effective 29/10/2026.

  — [LuatVietnam – NĐ 398/2026](https://luatvietnam.vn/thue/nghi-dinh-398-2026-nd-cp-quy-dinh-chi-tiet-giam-thue-thu-nhap-ca-nhan-va-doanh-nghiep-453738-d1.html)
- NĐ 252/2026 (provisional payment and finalization):
  - Điều 24 k2: the quarterly provisional deadline is the last day of the first month of the next quarter.
  - Điều 24 k3a: the four quarters together must be ≥ 80% of the finalized tax.
  - Điều 24 k3b: interest on a shortfall runs from the day after the Q4 deadline.
  - Điều 10 k5a: finalization is due on the last day of the 3rd month.

  — [LuatVietnam – NĐ 252/2026](https://luatvietnam.vn/thue/nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-439382-d1.html)
- TT 89/2026 (effective 01/07/2026) replaces TT 80/2021. It re-issues 03/TNDN with these appendices: 03-2/TNDN (loss carry-forward), 03-3A/3C/3D (incentives), 03-4, 03-5, 03-6, 03-8 and 03-9. — [LuatVietnam – TT 89/2026](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html)
- NĐ 320 Điều 7 (losses):
  - k2: losses carry forward in full, consecutively, for up to **5 years** from the year after the loss year.
  - The enterprise "tạm thời chuyển lỗ vào thu nhập của các quý" when computing quarterly provisional tax. The carry-forward becomes official in the annual finalization.
  - k2a: losses of earlier quarters are offset against later quarters of the same year.
  - k2b2: losses not used within 5 years lapse.

  — [LuatVietnam – NĐ 320/2025](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)

### App check
| Rule | App | Status |
|---|---|---|
| Rate tiers 15/17/20 on revenue(N−1) = (511 − 521) + 515 + 711 | `cit.rateTiers` from 2025-01-01. `computeCitEstimate` uses `computeProfitLoss(N−1).citRevenue`, with a manual override `taxSettings.prevYearRevenue` and a warning when year N−1 has no vouchers. | **ĐÚNG** |
| Annualise revenue(N−1) when that year was < 12 months | Not implemented. The user must enter the annualised figure through the override. | **THIẾU** (minor) |
| Related-party exclusion forces 20% | No flag | **THIẾU** (minor) |
| 30% reduction for 2026–2027, revenue(N) ≤ 10 billion, applied after incentives | `cit.reduction30` from 2026-01-01 to 2027-12-31. Tested on year-to-date `citRevenue`. The code comment notes that finalization must use the full-year figure. | **ĐÚNG**. The ref string says "doanh thu chính", but the code includes 515 and 711, which matches NĐ 398 k3. Cosmetic only. |
| 80% rule | `TR_CIT_MIN_SHARE = 0.8`, plus `shortfall` and `meets80` | **ĐÚNG**. Late-payment interest (0.03%/day) on the shortfall is not computed: **THIẾU** (minor). |
| Provisional entry Nợ 82111 (TT133: 821) / Có 3334 at quarter-end | `buildCitProvisionVoucher` | **ĐÚNG** (entry is standard practice) |
| Loss carry-forward of prior years (5 years, FIFO), including the provisional carry into quarters | Shortcut comment: "chưa chuyển lỗ". Taxable income = max(YTD profit, 0). | **THIẾU**. Losses of earlier quarters in the same year are offset implicitly, because the calculation is cumulative YTD. |
| Taxable income = accounting profit ± adjustments (non-deductible expenses, B4 on 03/TNDN) | Shortcut: "chưa điều chỉnh chi phí không được trừ" | **THIẾU**. See sections 2–4: cash payments ≥ 5 million, write-offs not meeting TT 48, provisions not meeting TT 48. |
| 03/TNDN and 03-2/TNDN under TT 89 | Not produced. The app shows only "Thuế TNDN tạm tính". | **THIẾU** |

### Inferences
- The tax figure is overstated whenever the company has prior-year losses. It is understated whenever non-deductible expenses exist. The app estimate is therefore an upper or lower bound, not the 03/TNDN figure.

### Gaps
- Not checked: whether HTKK 5.8.2 already carries the TT 89 version of 03/TNDN. The earlier notes found 03/TNDN-DK listed but no confirmation of the full 03/TNDN set.

## 2. Chi phí được trừ: chứng từ không tiền mặt ≥ 5 triệu, mua không hóa đơn (bảng kê), hoa hồng trả cá nhân

### Takeaway
An expense is deductible only if three things hold:
- It relates to the business.
- It has full invoices and documents.
- Any purchase or payment of ≥ 5 million VND per transaction (VAT included) has a non-cash payment document.

Purchases without an invoice from individuals, or from households below the VAT threshold, need two things instead:
- a payment document. Non-cash payment is required when the day's purchases from one seller reach ≥ 5 million.
- a **Bảng kê thu mua hàng hóa, dịch vụ không có hóa đơn on Mẫu 02/TNDN** (TT 20/2026).

**Mẫu 01/TNDN is now the donation-confirmation record, not the purchase list.** Commissions paid to individuals are deductible with a contract and payment document. The payer must withhold 10% PIT when a payment is ≥ 5 million (from 01/07/2026).

### Cited Findings
- NĐ 320 Điều 9 k1 lists the deductibility conditions:
  - a) the expense relates to the business;
  - b) it has full invoices and documents;
  - c) it has a non-cash payment document for "mua hàng hóa, dịch vụ và các khoản thanh toán khác từng lần có giá trị từ 05 triệu đồng trở lên".

  — [LuatVietnam – NĐ 320/2025](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- NĐ 320 Điều 9 k1 b covers purchases without invoices:
  - It applies to farm and fishery products from direct producers, handicrafts, scrap from direct collectors, household items sold directly by households, and goods or services from individuals or households with revenue below the VAT threshold.
  - The enterprise needs a payment document. When the day's purchases from one household or individual are "từ 05 triệu đồng trở lên", payment must be non-cash.
  - It also needs a "Bảng kê thu mua hàng hóa, dịch vụ" signed by the legal representative or an authorised person.

  — same source
- TT 20/2026 Điều 3 k13a repeats this dossier and names the form: "bảng kê thu mua hàng hóa, dịch vụ theo **Mẫu số 02/TNDN** ban hành kèm theo Thông tư này". — [KTTU – toàn văn TT 20/2026](https://ketoanthienung.net/thong-tu-20-2026-tt-btc-huong-dan-luat-thue-tndn.htm)
- The Mẫu 02/TNDN columns are:
  - purchase date;
  - seller name, address, **số căn cước** (ID number) and phone;
  - goods or service, quantity, unit price and total;
  - notes.

  The list is kept in date order and summarised monthly. — same source
- TT 20/2026 Mẫu 01/TNDN is the "Biên bản xác nhận khoản tài trợ" (donation confirmation record). — same source
- TT 20/2026 Điều 3 k13 has two more relevant points:
  - b) Purchases of ≥ 5 million made by employees on the company's behalf and paid non-cash are deductible. They need invoices plus an internal rule or decision that authorises the employee.
  - c) A purchase of ≥ 5 million that is unpaid when recognised is deductible if there is a contract and a handover record. The later payment must be non-cash.

  — same source
- TT 20/2026 Điều 3 k13d: renting assets from an individual needs the lease contract and rent-payment documents. Tax paid on the lessor's behalf is also deductible if there is a tax-payment document. — same source
- TT 20/2026 takes effect 12/03/2026 and applies from tax year 2025. It replaces TT 78/2014 and TT 96/2015. — [KTTU – TT 20/2026](https://ketoanthienung.net/thong-tu-20-2026-tt-btc-huong-dan-luat-thue-tndn.htm), as summarised in `xac_minh_truoc_sua.md` row 7
- PIT withholding on casual payments: NĐ 253/2026 Điều 50 k2 requires the payer to withhold 10% on payments of **≥ 5 million per payment** to residents without a labour contract (or with one shorter than 3 months), from 01/07/2026. Before that date TT 111/2013 set the threshold at 2 million. — `research_notes/Luật thuế kế toán Việt Nam 2026/tncn_bhxh_monbai.md` (sources cited there); app `tax-rules.js` `pit.casualThreshold`

### App check
| Rule | App | Status |
|---|---|---|
| Non-cash payment required at ≥ 5 million, VAT included, from 01/07/2025 | `vat.cashThreshold` = 5,000,000 from 2025-07-01, ref NĐ 320 Đ9.1.c. The warning in `voucher-form-ui.js:841` is turned on for purchase forms (`purchase.js:2550`). | **ĐÚNG** (warning only, not a tax adjustment) |
| Same-day purchases from one seller summing to ≥ 5 million (c1) | Not found by grep | **THIẾU** |
| Unpaid at recognition, later paid in cash (c3): reduce the expense in the payment period | Not found | **THIẾU** |
| Bảng kê **Mẫu 02/TNDN** for no-invoice purchases, with seller ID | No such report. The "Bảng kê hóa đơn bán ra, mua vào" in `tax-reports.js` is a VAT invoice listing. | **THIẾU**. The task brief calls it "01/TNDN"; under TT 20/2026 that name is wrong. |
| Commission ("chi/trích thầu") to an installer or contractor who refers customers is booked to 641 | `suggestCashAccountFix`: 331 → 641 when the payee is not in the catalogue | **ĐÚNG** on the account. Commission is a selling expense. |
| Commission to an individual: contract + payment document; 10% PIT withheld at ≥ 5 million (Nợ 641 / Có 3335, Có 111/112 net) | The commission rule only reclassifies 331 → 641. No grep hit for 3335 in `accounting-engine.js` or `debts.js`. Payroll handles casual PIT (`payroll-calc.js:55`), but commission payments made through cash vouchers do not. | **THIẾU**: no PIT-withholding prompt on commission payments ≥ 5 million |
| Commission ≥ 5 million paid in cash: non-deductible | The cash-threshold warning exists only on purchase forms. It is not shown on payment vouchers to 641. | **THIẾU** (likely; not checked in the UI) |

### Inferences
- Installers who receive "trích thầu" are typically individuals without invoices. Each such payment needs four things to be deductible:
  - a brokerage or commission agreement;
  - an ID-bearing payment record (a bank transfer if ≥ 5 million);
  - PIT withheld at 10% if ≥ 5 million per payment, or a commitment form 08/CK-TNCN (old name; the TT 89 form name was not checked) if the individual's annual income is below the threshold;
  - the payment must not be booked to 331.
- Commissions are services, not the goods listed in Điều 9 k1 b. The Bảng kê 02/TNDN route covers services only from individuals or households below the VAT threshold. In practice, use 02/TNDN or the PIT-withholding voucher as the supporting document.

### Gaps
- The TT 89/2026 name and number of the PIT commitment form (formerly 08/CK-TNCN) were not checked.
- I did not find whether a specific 2026 cap applies to commissions or brokerage fees. Older law capped advertising and promotion; Luật 67/2025 has no such cap (see `thue_tndn_nha_thau.md`, which found none).

## 3. Nợ phải thu khó đòi: trích lập dự phòng 2293, xử lý xóa nợ, khấu trừ thuế, theo dõi sau xóa

### Takeaway
**TT 48/2019/TT-BTC (amended by TT 24/2022) is still the governing text.**
- QĐ 1760/QĐ-BTC (effective 01/07/2026) declared that TT 48 continues in force.
- It applies from tax year 2025 "cho đến khi có văn bản thay thế, bãi bỏ nhưng **không quá ngày 31/12/2026**".
- No replacement circular was found as of 09/11/2026. The rules for 2027 are therefore open.

How provisions work:
- They are made only at the annual financial-statement date, debt by debt.
- The rates are 30%, 50%, 70% and 100% at overdue ages of 6 months–1 year, 1–2 years, 2–3 years and ≥ 3 years.
- Each debt needs a contract, a reconciliation or a dunning letter, and a debt list.

Write-off:
- It is allowed only for listed causes: the debtor is bankrupt, dissolved or ceased, or has died or is being prosecuted; or the debt was 100% provided for 3 years.
- It needs a Hội đồng xử lý nợ record and an owner decision.
- The loss is first absorbed by 2293. Only the shortfall goes to expense.
- The written-off debt must be tracked for **at least 10 years**.

A provision or write-off that does not follow TT 48 is **not deductible** for CIT (NĐ 320 Điều 10 k5).

The app has no 2293 feature. It writes off with a cash receipt/payment pair and no TT 48 test, so such write-offs are generally non-deductible. They must be added back.

### Cited Findings
- QĐ 1760/QĐ-BTC dated 1/7/2026 announced that TT 45/2013 and TT 48/2019 (amended by TT 24/2022) "tiếp tục có hiệu lực". The circulars "áp dụng từ kỳ tính thuế thu nhập doanh nghiệp năm 2025 cho đến khi có văn bản thay thế, bãi bỏ nhưng không quá ngày 31/12/2026". The decision is effective 1/7/2026. — [Tạp chí Kinh tế – Tài chính, 04/07/2026](https://tapchikinhtetaichinh.vn/thong-tu-so-45-2013-tt-btc-va-thong-tu-so-48-2019-tt-btc-tiep-tuc-co-hieu-luc-160845.html)
- NĐ 320 Điều 10 k5 makes the following non-deductible: "Trích lập và sử dụng các khoản dự phòng không theo đúng quy định của pháp luật về trích lập dự phòng: Dự phòng giảm giá hàng tồn kho, … dự phòng nợ phải thu khó đòi, dự phòng bảo hành…". — [LuatVietnam – NĐ 320/2025](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- NĐ 320 Điều 3 (other income), item k: "Khoản nợ khó đòi đã xóa nay đòi được" is taxable other income. — same source
- TT 48 Điều 3:
  - k1: provisions under the circular are deductible for CIT in the annual reporting period.
  - k2: "Thời điểm trích lập và hoàn nhập các khoản dự phòng là thời điểm lập báo cáo tài chính năm".

  — [LuatVietnam – TT 48/2019](https://luatvietnam.vn/tai-chinh/thong-tu-48-2019-tt-btc-huong-dan-trich-lap-va-xu-ly-cac-khoan-du-phong-giam-gia-hang-ton-kho-176135-d1.html)
- TT 48 Điều 6 k1 (conditions for a provision):
  - a) Original documents: an economic contract, loan agreement or debt commitment; the liquidation record (if any); a debt reconciliation, **or** a reconciliation request or dunning letter that was sent with postal or courier proof; a debt list; and other related documents.
  - b) The debt is ≥ **6 months** overdue against the original due date (extensions are ignored) and the enterprise has sent reconciliation requests or reminders. Alternatively, the debt is not yet due but there is evidence the debtor will not pay.

  — same source
- TT 48 Điều 6 k2a sets the provision rates:
  - "30% … quá hạn từ 6 tháng đến dưới 1 năm"
  - "50% … từ 1 năm đến dưới 2 năm"
  - "70% … từ 2 năm đến dưới 3 năm"
  - "100% … từ 3 năm trở lên"

  — same source
- TT 48 Điều 6 k2b has faster rates for **retail sales on deferred or instalment terms to individuals** (and for telecom): 30% at 3–<6 months, 50% at 6–<9 months, 70% at 9–<12 months, 100% at ≥ 12 months. — same source
- TT 48 Điều 6 k2c: if the debt is not yet due but the debtor is bankrupt or absconded, or is an individual who is prosecuted, gravely ill or dead, the enterprise estimates the loss itself, up to the book value. — same source
- TT 48 Điều 6 k3 (year-end true-up):
  - a) required = balance: no change.
  - b) required > balance: add the difference to expense.
  - c) required < balance: reverse the difference as a reduction of expense.
  - d) Provide debt by debt, with evidence, and summarise in a detailed list (bảng kê chi tiết).
  - g) If the debtor is also a creditor, provide on the net amount from a reconciliation. Worked example: 30 million receivable less 10 million payable gives 20 million net. Provisions are 1 + 5 + 4.67 million.

  — same source
- TT 48 Điều 6 k4a (when a receivable is uncollectible): one of the following must apply.
  - The debtor completed bankruptcy.
  - The debtor ceased operations or was dissolved.
  - A competent authority decided to forgive the debt.
  - The debtor is an individual who died, or is prosecuted, detained, on trial or serving a sentence.
  - The residual after individual or collective compensation.
  - The debt was **100% provided** and is still uncollected **3 years** after full provision (1 year for the k2b retail case).

  — same source
- TT 48 Điều 6 k4b (evidence):
  - Books and documents proving the debt.
  - For organisations: a court bankruptcy decision; a notice from the business registry or tax office of cessation or dissolution; or a judgment plus confirmation from the enforcement agency that the debtor has no assets.
  - For individuals: a death certificate or local-authority confirmation, or a wanted notice or court documents.
  - For the 3-year case: proof that 100% had been provided.

  — same source
- TT 48 Điều 6 k4c (financial treatment):
  - The actual loss is the book value minus recoveries.
  - The loss "sử dụng nguồn dự phòng nợ phải thu khó đòi (nếu có) để bù đắp, phần chênh lệch thiếu hạch toán vào chi phí".
  - Written-off debts "phải theo dõi trong hệ thống quản trị của doanh nghiệp và trình bày trong thuyết minh báo cáo tài chính trong thời hạn tối thiểu là **10 năm**" and recovery efforts continue.
  - Amounts recovered later, net of collection costs, are booked to income.

  — same source
- TT 48 Điều 6 k4d (write-off dossier): the minutes of the enterprise's Hội đồng xử lý nợ, with each debt's value, the amount recovered and the actual loss; a detailed list of the debts written off; the books and documents proving each debt; and the provisioning records. — same source
- TT 48 Điều 6 k4đ: the Board, the Members' Council, the Chairman, the Director or the owner decides the write-off based on the council's minutes. The council's composition is the enterprise's choice. — same source
- Accounting accounts:
  - TT 99/2025 keeps **2293 "Dự phòng phải thu khó đòi"** and 2294 "Dự phòng giảm giá hàng tồn kho" under 229. — [KTTU – Hệ thống TK TT 99/2025](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm)
  - The app chart of accounts has 2293, `js/core/chart-of-accounts.js:61,189`.
  - The B01 maps 2293 to line 136 under TT99 and TT133.
- Off-balance tracking (TK 004):
  - TT 133/2016 removed the off-balance accounts 001–007, per [KTTU – TT 133](https://ketoanthienung.net/thong-tu-133-2016-che-do-ke-toan-doanh-nghiep-vua-va-nho.htm) as quoted in `che_do_ke_toan_tt99_tt133.md`.
  - No 00x accounts appear in the KTTU reproduction of the TT 99 chart or in the MISA TT 99 summary. — [KTTU – TT 99](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm); [MISA – TT 99 điểm mới](https://amis.misa.vn/251383/thong-tu-99-2025-tt-btc-thay-the-thong-tu-200-2014-tt-btc/)
  - TT 48 itself only requires tracking "trong hệ thống quản trị" plus a note in the financial statements. It does not require TK 004.

### App check
| Rule | App | Status |
|---|---|---|
| Year-end provision 2293 by age band (30/50/70/100%; retail instalment to individuals 3/6/9/12 months), debt by debt, netted against payables to the same partner, with a true-up of only the difference | No feature. 2293 exists only in the chart of accounts and the B01 mapping. No aging-based provision calculation was found. | **THIẾU** |
| Provision only at year-end; no quarterly provisions | n/a | **THIẾU** (with the feature above) |
| Write-off entry Nợ 2293 (up to the provision) / Nợ 642 (shortfall) / Có 131, with no cash movement | Commit 149046c. `suggestCashAccountFix` turns a **payment voucher** described "không thu được / khó đòi / xóa nợ" from Nợ 341 into **Nợ 642**. The comment says this payment pairs with a "thu khác Có 131" receipt. Net effect: Nợ 111 / Có 131, then Nợ 642 / Có 111, equal to Nợ 642 / Có 131 but routed through cash. | **SAI (form)**. The ledger result Nợ 642 / Có 131 is right **only when no 2293 provision exists** (TT 48 k4c: the shortfall goes to expense). Routing through 111 inflates cash receipts and payments in the cash book and the cash-flow report with a fictitious inflow and outflow. A non-cash general-journal entry is the correct form. |
| Write-off allowed only for TT 48 k4a causes, with the k4b evidence and the k4d dossier (Hội đồng xử lý nợ minutes, owner decision, bảng kê) | No check. The trigger is any description containing "không thu được / khó đòi / xóa nợ". The test case is a retail customer "Mua lẻ" / "thùy vân" with "tất toán không thu được". | **THIẾU**. A retail customer who simply did not pay meets none of the k4a causes. The 642 expense is then **non-deductible** under NĐ 320 Điều 10 k5 / TT 48 and must be added back to taxable income on 03/TNDN. The CIT estimate does not do this (section 1). |
| Track written-off debts for ≥ 10 years; recovery booked to income (711) | After the write-off, 131 is zero and no memo register exists. | **THIẾU**. Add a "nợ đã xóa" register keyed to the partner. A later receipt should go to Nợ 111 / Có 711, which is taxable under NĐ 320 Điều 3 "k". |
| Debt-age basis = the original contractual due date, extensions ignored | The app has no due-date field per invoice. Aging would have to use the invoice date plus agreed payment terms. | **THIẾU** |
| TT 48 validity limit 31/12/2026 | n/a | Watch item. Rules for FY2027 provisions are not yet known. |

### Inferences
- Proposed entries (standard VAS practice; the TT 99 wording was **not read**):
  - Year-end provision or top-up: Nợ 642 (TT 99 detail 6426 "Chi phí dự phòng") / Có 2293.
  - Reversal: Nợ 2293 / Có 642.
  - Write-off: Nợ 2293 (up to the provision) and Nợ 642 (shortfall) / Có 131.
  - Later recovery: Nợ 111/112 / Có 711.
- For this trading and installation company, almost all uncollected retail debts fail the k4a list. The tax-efficient route takes about 4–5 years:
  1. Keep the debt on 131.
  2. Send dunning letters with postal proof.
  3. Provide 30% → 100% over 3 years. Each provision is deductible if documented.
  4. Write off 3 years after reaching 100%.
- Debts arising from retail **instalment** sales to individuals use the faster k2b scale. Ordinary credit sales to individual customers probably use k2a. "Bán lẻ hàng hóa theo hình thức trả chậm/trả góp" plausibly covers deferred retail sales, but this is my interpretation and has no ruling behind it.
- The current write-off shortcut is acceptable for bookkeeping if the user accepts the add-back. The app should at least:
  - post it as a non-cash general journal;
  - flag the amount as "chi phí không được trừ" unless a TT 48 cause and dossier are recorded.

### Gaps
- No replacement for TT 48 for periods after 31/12/2026 was found. The MoF may issue a new circular under the 2025 laws. Recheck before closing FY2026 (financial statements dated 31/12/2026 still fall under TT 48).
- The TT 99/2025 accounting guidance for TK 229 (the exact debit account, 642 vs 6426) was not read. Whether TT 99 kept any off-balance accounts is **unconfirmed**: they are absent from secondary reproductions, but the TT 99 Phụ lục II text was not read.
- The full text of QĐ 1760/QĐ-BTC was not read. Only the TCTC article was.

## 4. Dự phòng giảm giá hàng tồn kho (2294)

### Takeaway
At the annual financial-statement date, provide for each item whose cost exceeds net realisable value (NRV):
- The item must be owned at that date and have legal invoices or other proof of cost.
- NRV = estimated selling price − costs to complete − selling costs.

True-up the difference only, through **cost of goods sold (632)**. Destroying obsolete stock needs a council or valuer record and an owner decision. The loss net of recoveries is absorbed by 2294 first, and the rest goes to 632. The app has no 2294 feature.

### Cited Findings
- TT 48 Điều 4 k1:
  - Scope: materials, tools, goods, goods in transit, goods on consignment and finished goods whose cost exceeds NRV.
  - Conditions: legal invoices or other reasonable evidence of cost, and ownership at the financial-statement date.

  — [LuatVietnam – TT 48/2019](https://luatvietnam.vn/tai-chinh/thong-tu-48-2019-tt-btc-huong-dan-trich-lap-va-xu-ly-cac-khoan-du-phong-giam-gia-hang-ton-kho-176135-d1.html)
- TT 48 Điều 4 k2: the provision equals the quantity at year-end × (cost − NRV). NRV is determined by the enterprise as the estimated selling price minus completion and selling costs. — same source
- TT 48 Điều 4 k3:
  - Required = balance: no change.
  - Higher: "trích thêm phần chênh lệch vào giá vốn hàng bán".
  - Lower: reverse and "ghi giảm giá vốn hàng bán".
  - Compute item by item in a detailed list.

  — same source
- TT 48 Điều 4 k4 (disposal of provided-for stock):
  - Damaged, obsolete or expired stock must be destroyed or liquidated.
  - A council, or a valuation firm, records the value. The owner decides.
  - The loss after compensation and salvage is absorbed by the provision first; "phần chênh lệch được hạch toán vào giá vốn hàng bán".

  — same source
- TT 20/2026 Điều 3 k9g (deductibility of destroying damaged or obsolete stock): the dossier is the owner's destruction decision plus the inventory valuation record and the related documents. — [KTTU – TT 20/2026](https://ketoanthienung.net/thong-tu-20-2026-tt-btc-huong-dan-luat-thue-tndn.htm)
- NĐ 320 Điều 10 k5: a 2294 provision made outside TT 48 is non-deductible. — [LuatVietnam – NĐ 320/2025](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)

### App check
| Rule | App | Status |
|---|---|---|
| Year-end NRV test per item; Nợ 632 / Có 2294 (reversal Nợ 2294 / Có 632) | No feature. 2294 is mapped only to B01 line 142 in `tax-reports.js`. | **THIẾU** |
| Destruction or liquidation of stock with a council record and owner decision; loss absorbed by 2294, then 632 | Not found | **THIẾU** |

### Inferences
- For a lamp and thermos trader, the relevant cases are obsolete models and damaged goods. An item-level list of cost, estimated selling price, selling cost and NRV would let the app propose the Nợ 632 / Có 2294 entry at 31/12.

### Gaps
- None beyond the 31/12/2026 validity limit of TT 48 noted in section 3.

## Summary list of app gaps or errors

1. **SAI**: write-offs of uncollectible receivables are posted as a cash receipt/payment pair (Có 131 via 111, then Nợ 642 via 111). They should be a non-cash journal Nợ 2293/642 / Có 131 (TT 48 Đ6 k4c).
2. **THIẾU**: there is no TT 48 test or dossier before a write-off. Write-offs of plain non-paying retail customers are non-deductible (NĐ 320 Đ10 k5) and must be added back.
3. **THIẾU**: no 2293 provision feature. It needs aging bands of 30/50/70/100% (3/6/9/12 months for retail instalment sales to individuals), year-end only, true-up of the difference only, and netting against payables.
4. **THIẾU**: no 10-year register of written-off debts. A recovery must be booked to 711 as taxable income.
5. **THIẾU**: no 2294 inventory write-down feature (NRV test, through 632).
6. **THIẾU**: CIT taxable income ignores prior-year loss carry-forward (5 years, NĐ 320 Đ7) and non-deductible add-backs. There is no 03/TNDN or 03-2/TNDN output.
7. **THIẾU**: no no-invoice purchase list on **Mẫu 02/TNDN** (TT 20/2026; 01/TNDN is the donation record).
8. **THIẾU**: commission ("trích thầu") payments to individuals get no 10% PIT withholding prompt at ≥ 5 million (NĐ 253/2026) and no cash ≥ 5 million non-deductibility flag on payment vouchers.
9. **ĐÚNG**: the 15/17/20% rate tiers on revenue(N−1), the 30% reduction for 2026–2027 on revenue(N) ≤ 10 billion, the 80% provisional check, the Nợ 82111/821 / Có 3334 provisional entry, the 5-million non-cash threshold warning on purchases, and commission booked to 641.
