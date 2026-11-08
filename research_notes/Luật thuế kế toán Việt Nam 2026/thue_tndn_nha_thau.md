# Thuế TNDN và thuế nhà thầu (Việt Nam, áp dụng 2026): bản đã xác minh

> Research conditions (read first): verified on 2026-11-07. WebSearch and WebFetch were unavailable. Sources were found through Google News RSS and Yahoo search, then fetched with curl. The legal texts were read as full-text pages on luatvietnam.vn: Nghị định 320/2025, Nghị định 398/2026, Nghị định 252/2026, Thông tư 89/2026 and Luật Quản lý thuế 108/2025. The chart of accounts was read on ketoanthienung.net. thuvienphapluat.vn was not used (Cloudflare block).
> Tags used below:
> - **[VERIFIED]**: read in the text of the legal document or on an authoritative page this session.
> - **[PARTIAL]**: seen only in a search-result title or a secondary page.
> - **[UNVERIFIED]**: training knowledge, not re-checked.
>
> Major corrections to the previous notes:
> 1. The quarterly provisional-payment deadline is now the **last day** of the first month of the next quarter, not the 30th. So Q2 is due 31/07, Q3 31/10 and Q4 31/01.
> 2. Thông tư 80/2021 and Thông tư 103/2014 were **repealed from 01/07/2026** by Thông tư 89/2026/TT-BTC. All tax forms were re-issued.
> 3. The pension/life-insurance cap is **5 million VND per person per month**, not 3 million.
> 4. The guiding circular for the CIT Law is **Thông tư 20/2026/TT-BTC** [PARTIAL].
> 5. In TT99, 82111 = current CIT under the CIT Law and 82112 = additional CIT under the global minimum tax rules.

## 1. Luật 67/2025/QH15 + Nghị định 320/2025/NĐ-CP: SME rates 15% / 17%, revenue basis, exclusions

### Takeaway
**[VERIFIED]** NĐ 320/2025 Điều 11 sets the rates:
- 20% standard rate.
- 15% if total annual revenue is ≤ 3 billion VND.
- 17% if total annual revenue is > 3 billion and ≤ 50 billion VND.

The test uses revenue of the **immediately preceding tax year** (năm trước liền kề). That revenue is taken from the business-results appendix of the prior year's finalization return. It includes net sales (after revenue deductions), financial income and other income. Subsidiaries and related companies of non-qualifying enterprises are excluded. Some income types are always taxed at the standard rate.

### Cited Findings
- NĐ 320/2025 Điều 11:
  - k1: rate is 20%, except k2, k3, k5 and the incentive rates in Điều 19.
  - k2: "Thuế suất 15% áp dụng đối với doanh nghiệp có tổng doanh thu năm không quá 03 tỷ đồng".
  - k3: 17% for revenue "từ trên 03 tỷ đồng đến không quá 50 tỷ đồng".

  — [LuatVietnam – NĐ 320/2025 toàn văn](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- NĐ 320 Điều 11 k4 defines the revenue basis. It is revenue from sales and services (excluding revenue deductions), plus financial income and other income. The figures come from the "Phụ lục kết quả hoạt động sản xuất kinh doanh" attached to the CIT finalization return of the **preceding tax year**. — [LuatVietnam – NĐ 320](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
  - k4a: if the prior year was shorter than 12 months, annualise: actual revenue ÷ months of operation × 12. A partial month counts as a full month. — same source
  - k4b: a newly established enterprise that expects revenue ≤ 3 billion or ≤ 50 billion makes quarterly provisional payments at 15% or 17%. — same source
  - k4c: 15% and 17% do **not** apply to a company that is a subsidiary of, or has a related-party relationship with, an enterprise that does not itself meet the 15%/17% conditions. — same source
- NĐ 320 Điều 23 k9 lists income that cannot use 15%/17% (or incentives):
  - transfers of capital, real estate and investment projects;
  - oil, gas and mineral exploration and extraction;
  - online games;
  - goods and services subject to SCT (thuế TTĐB), with listed exceptions;
  - other income under Điều 3 k3.

  — [LuatVietnam – NĐ 320](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- The same exclusion list appears in Luật 67/2025, which puts the 15%/17% rates in "khoản 2, khoản 3 Điều 10 của Luật này". — quoted in [LuatVietnam – hướng dẫn giảm 30% theo NĐ 398](https://luatvietnam.vn/thue-phi-le-phi/huong-dan-tinh-so-thue-tndn-duoc-giam-30-theo-nghi-dinh-398-2026-nd-cp-565-115009-article.html)
- NĐ 320 Điều 24 (effective date):
  - It takes effect on the signing date and applies from tax year 2025.
  - The non-cash payment rule (Điều 9 k1 điểm c) applies from the Decree's effective date.
  - It replaces NĐ 218/2013, NĐ 91/2014, NĐ 12/2015 and NĐ 57/2021.

  — [LuatVietnam – NĐ 320](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- NĐ 320 is dated 05/12/2025, per the title of the MoF draft circular: "Nghị định số 320/2025/NĐ-CP ngày 5/12/2025". — [MOF – dự thảo Thông tư](https://mof.gov.vn/bo-tai-chinh/dong-gop-y-kien-du-thao-van-ban/du-thao-thong-tu-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-thue-thu-nhap-doanh-nghiep-va-huong-dan-thuc-hien-nghi-dinh-so-3202025nd-cp-ngay-5122025-cua-chinh-phu-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-de-to-chuc-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep) **[PARTIAL: title only]**
- The Cục Thuế answered at the 2025 finalization support conference, citing NĐ 320 Điều 11 k4:
  - Enterprise established before 2024: tax year 2025 uses 2024 total revenue.
  - Established in 2024: annualise 2024 revenue.
  - Established in 2025: provisional payments use expected revenue. If actual 2025 revenue exceeds the threshold, the enterprise pays the shortfall plus late-payment interest.

  — [CafeF, 18/03/2026](https://cafef.vn/doanh-nghiep-roi-viec-xac-dinh-doanh-thu-nam-nao-de-ap-dung-thue-suat-1517-cuc-thue-giai-dap-ro-3-truong-hop-can-luu-y-188260318152050043.chn)
- PwC: the new CIT Law took effect 01/10/2025 and applies from tax year 2025. The standard rate is 20%. — [PwC Vietnam – Taxes on corporate income](https://taxsummaries.pwc.com/vietnam/corporate/taxes-on-corporate-income)
- Guiding circular: search results show "Thông tư 20/2026/TT-BTC hướng dẫn Luật Thuế thu nhập doanh nghiệp và Nghị định 320/2025/NĐ-CP" (thuvienphapluat URL title). A MISA article is titled "5 điểm ĐÁNG CHÚ Ý tại Thông tư 20/2026/TT-BTC từ 12/03/2026". **[PARTIAL]**: the full text was not read. The thuvienphapluat page is blocked, and the luatvietnam URL guessed for it returned 404.

### Inferences
- App rule: rate(year N) depends on revenue(N−1), where revenue = (511 − 521) + 515 + 711.
  - ≤ 3 billion: 15%.
  - ≤ 50 billion: 17%.
  - Otherwise: 20%.
- Annualise revenue(N−1) if the company operated for fewer than 12 months that year.
- Add a manual override flag, "related to a non-qualifying enterprise". When it is set, force 20%.
- Income from the excluded list stays at 20%. A lamp/thermos trader normally has none, but capital or real-estate transfer gains must be taxed separately at 20%.
- Source of revenue(N−1): the figures on the prior year's finalization appendix, which equal the accounting figures under TT99 accounts.

## 2. Nghị quyết 43/2026/QH16 + Nghị định 398/2026/NĐ-CP: 30% CIT reduction (revenue ≤ 10 billion)

### Takeaway
**[VERIFIED]** NĐ 398/2026 was issued and effective 29/10/2026. It applies to **tax years 2026 and 2027**. An eligible enterprise is a Vietnamese-established enterprise or organisation whose revenue **of that same year** (2026 or 2027) is ≤ 10 billion VND. Note that this is current-year revenue, unlike the 15%/17% test, which uses the prior year. The reduction is 30% of the CIT payable for the year. For an enterprise with incentives, it is 30% of the tax remaining after incentives. The enterprise applies the reduction itself in its quarterly provisional payments. If actual revenue exceeds 10 billion, it repays the reduction plus late-payment interest.

### Cited Findings
- Title of NĐ 398 Điều 3: reduce 30% of CIT payable for tax years 2026 and 2027 for enterprises "có mức doanh thu hằng năm của năm 2026, năm 2027 không quá 10 tỷ đồng". — [LuatVietnam – NĐ 398/2026 toàn văn](https://luatvietnam.vn/thue/nghi-dinh-398-2026-nd-cp-quy-dinh-chi-tiet-giam-thue-thu-nhap-ca-nhan-va-doanh-nghiep-453738-d1.html)
- NĐ 398 Điều 3 k1:
  - Eligible: enterprises, cooperatives, public service units and other organisations established under Vietnamese law (NQ 43 Điều 1 k2).
  - Excluded: enterprises formed by division or separation after NQ 43 took effect, if the combined 2026/2027 revenue of the resulting enterprises exceeds 10 billion.

  — same source
- LuatVietnam gives NQ 43's effective date as 24/08/2026: "chia, tách doanh nghiệp sau ngày 24/08/2026". — [LuatVietnam – hướng dẫn](https://luatvietnam.vn/thue-phi-le-phi/huong-dan-tinh-so-thue-tndn-duoc-giam-30-theo-nghi-dinh-398-2026-nd-cp-565-115009-article.html) **[PARTIAL: secondary]**
- NĐ 398 Điều 3 k2 (how the reduction is computed):
  - It applies to all income of an enterprise with an annual tax period, regardless of tax method.
  - It includes the Điều 18 k3 income under the CIT Law (other income).
  - It is computed on the CIT payable for 2026 or 2027.
  - If the enterprise has CIT incentives, it is computed on the tax payable after incentives.

  — [LuatVietnam – NĐ 398](https://luatvietnam.vn/thue/nghi-dinh-398-2026-nd-cp-quy-dinh-chi-tiet-giam-thue-thu-nhap-ca-nhan-va-doanh-nghiep-453738-d1.html)
- NĐ 398 Điều 3 k3 (revenue basis):
  - Revenue = sales and services (excluding revenue deductions) + financial income + other income.
  - If the first or last period is shorter than 3 months and is merged into 2026 or 2027, the revenue test uses 12 months.
  - Revenue includes dependent units per the combined annual financial statements.
  - After a division or separation, revenue is the sum over all resulting enterprises.

  — same source
- NĐ 398 Điều 3 k4 (declaration):
  - a) An enterprise that expects revenue ≤ 10 billion self-determines the reduction when making quarterly provisional payments.
  - b) If actual revenue exceeds 10 billion, it declares and pays normally, pays the shortfall, and is charged late-payment interest under NĐ 252/2026 Điều 24 k3.
  - c, d) Supplementary declarations or audit findings that change the tax also change the reduction.

  — same source
- NĐ 398 Điều 4: "có hiệu lực thi hành kể từ ngày 29 tháng 10 năm 2026 và áp dụng cho kỳ tính thuế năm 2026, năm 2027". The appendix contains Mẫu số 01, 02 and 03. — same source
- Worked example: CIT before incentives is 200 million and the incentive is 50 million. The reduction is 30% × 150 million = 45 million, so 105 million is payable. — [LuatVietnam – hướng dẫn](https://luatvietnam.vn/thue-phi-le-phi/huong-dan-tinh-so-thue-tndn-duoc-giam-30-theo-nghi-dinh-398-2026-nd-cp-565-115009-article.html)

### Inferences
- Order of application for 2026/2027:
  1. Choose the rate (15/17/20%) using revenue(N−1).
  2. Compute the CIT payable.
  3. Subtract incentives, if any.
  4. If revenue(N) ≤ 10 billion, subtract 30%.
- For a trader with revenue ≤ 3 billion, the effective burden is 15% × 0.7 = 10.5% of taxable income. For revenue of 3–10 billion, it is 17% × 0.7 = 11.9%.
- Because NĐ 398 came out on 29/10/2026, Q1–Q3/2026 provisional payments were probably made without the reduction. The excess is netted at the 2026 finalization: Điều 3 k4 điểm d allows the reduction "khi quyết toán".
- Store the reduction as a separate line (số thuế được giảm). Do not reduce 8211 directly by netting. See section 6.

## 3. Deductibility: non-cash payment ≥ 5 million and other caps (NĐ 320 Điều 9, 10)

### Takeaway
**[VERIFIED]** The non-cash payment threshold for CIT deductibility is **5 million VND** per transaction, including VAT. It applies from NĐ 320's effective date. The 1-month welfare cap and the 17% wage-reserve cap remain. The voluntary pension and life-insurance cap is now **5 million VND per person per month**. Interest paid by enterprises with related-party transactions follows the transfer-pricing rules.

### Cited Findings
- NĐ 320 Điều 9 k1 điểm c: an expense is deductible if it has a non-cash payment document for purchases "từng lần có giá trị từ 05 triệu đồng trở lên". Non-cash payment documents follow the VAT rules. — [LuatVietnam – NĐ 320](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
  - c1: several purchases from one seller on the same day, each below 5 million but totalling ≥ 5 million, require non-cash payment. — same
  - c2: an employee who buys on the company's behalf and pays by non-cash means also qualifies. — same
  - c3: an expense still unpaid when recognised is deductible. If it is later paid without a non-cash document, the enterprise must declare and reduce the expense in the period of payment. — same
- NĐ 320 Điều 10 (non-deductible items):
  - d: welfare exceeding "01 tháng lương bình quân thực tế thực hiện trong năm". The average month = annual wage fund ÷ 12.
  - đ: the part above "05 triệu đồng/tháng/người" for supplementary pension, voluntary pension and life insurance for employees.
  - c: interest paid by enterprises with related-party transactions follows the tax-administration rules for related-party transactions (the 30% EBITDA cap per PwC).
  - Wages not yet paid by the finalization deadline are non-deductible, unless a wage reserve is set up. The reserve may not exceed 17% of the wage fund paid and may not create a loss.
  - Per-diem, travel and accommodation are deductible with full invoices and documents (Điều 10, point h of the wage/allowance item).
  - Điều 10 k23: spending that breaches specialised-law conditions, e.g. overtime beyond legal limits or unregistered advertising.

  — [LuatVietnam – NĐ 320](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html)
- NĐ 320 Điều 7: losses carry forward (see section 5). Điều 25 k4: losses that arose before the Decree continue to carry forward for the remaining period. — same
- PwC: interest is capped at 30% of EBITDA when there are related-party transactions. Fines and creditable input VAT are non-deductible. — [PwC – Deductions](https://taxsummaries.pwc.com/vietnam/corporate/deductions)

### Inferences
- App: on purchase invoices with total incl. VAT ≥ 5,000,000 VND:
  - If paid by cash (TK 111): flag the cost as non-deductible.
  - If unpaid at year-end and later paid in cash: flag it in the payment period.
  - Also check for multiple same-day invoices from the same seller with a sum ≥ 5,000,000 VND.
- Welfare cap check: Σ welfare expenses ≤ (TK 334 wage fund for the year ÷ 12).
- The interest cap of 1.5× the State Bank base rate on loans from non-credit-institution lenders was not confirmed in the NĐ 320 text this session. See Còn chưa xác minh.

## 4. Quarterly provisional payment (80%), deadlines and annual finalization (Luật QLT 108/2025, NĐ 252/2026, TT 89/2026)

### Takeaway
**[VERIFIED]** From 01/07/2026, Luật Quản lý thuế 108/2025/QH15, NĐ 252/2026/NĐ-CP (dated 30/06/2026) and TT 89/2026/TT-BTC are in force.
- CIT is still provisionally paid each quarter with no quarterly return. The four quarters together must be **≥ 80%** of the finalized CIT.
- The quarterly deadline is the **last day of the first month of the next quarter**.
- The finalization return and payment are due on the **last day of the 3rd month** after year-end.
- Late-payment interest is **0.03%/day**.
- TT 89 repealed TT 80/2021 and TT 103/2014 and re-issued all forms. Form 03/TNDN keeps its number.

### Cited Findings
- NĐ 252/2026 Điều 24 (CIT provisional payment):
  - k2: "Thời hạn tạm nộp quý chậm nhất là ngày cuối cùng của tháng đầu của quý tiếp theo".
  - k3a: total provisional payments for the 4 quarters must be ≥ 80% of the finalized tax.
  - k3b: on a shortfall, interest runs from the day after the Q4 provisional deadline until the day before payment.

  — [LuatVietnam – NĐ 252/2026 toàn văn](https://luatvietnam.vn/thue/nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-439382-d1.html)
- NĐ 252 Điều 10 (filing deadlines):
  - k1: per-transaction returns are due by the 10th day after the obligation arises.
  - k2: monthly returns by the 20th of the next month.
  - k3: quarterly returns by the last day of the first month of the next quarter.
  - k5a: finalization by "ngày cuối cùng của tháng thứ 03 kể từ ngày kết thúc kỳ quyết toán thuế".

  — same source
- NĐ 252 is signed "Hà Nội, ngày 30 tháng 6 năm 2026" and takes effect 01/07/2026. NĐ 125/2020 (penalties), as amended by NĐ 102/2021 and NĐ 310/2025, remains in force. — same source
- Luật QLT 108/2025/QH15:
  - Effective 01/07/2026, except Điều 13 and household e-invoices, which took effect 01/01/2026.
  - Điều 14 k1a: tax is payable by the last day of the filing deadline.
  - Late-payment interest is "0,03%/ngày".
  - An extension of up to 60 days is possible for a finalization return in force majeure.

  — [LuatVietnam – Luật QLT 2025](https://luatvietnam.vn/thue/luat-quan-ly-thue-2025-so-108-2025-qh15-421539-d1.html)
- TT 89/2026 Điều 21 (CIT declaration):
  - k1a: CIT is a provisional-quarterly, annual-finalization tax.
  - k3: provisional payment follows NĐ 252 Điều 24. The amount is based on the quarterly financial statements (if any) or quarterly results. Provisional amounts are credited against the finalized tax.

  — [LuatVietnam – TT 89/2026 toàn văn](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html)
- TT 89 annex list for the revenue-cost method (references Điều 21 k5):
  - 03/TNDN: finalization return.
  - 03-2/TNDN: loss carry-forward.
  - 03-3A, 03-3C, 03-3D/TNDN: incentives.
  - 03-4/TNDN: foreign tax paid.
  - 03-5/TNDN: real-estate transfer.
  - 03-6/TNDN.
  - Science-and-technology fund appendix.
  - 03-8, 03-8A, 03-8B, 03-8C/TNDN: allocation.
  - 03-9/TNDN.

  Attachments: the annual financial statements, and the related-party appendix under **NĐ 255/2026/NĐ-CP ngày 30/6/2026**. The text contains no "03-1A/TNDN" string. Form 04/TNDN is for the percentage-of-revenue method. — same source
- TT 89 Điều 99 k1: from 01/07/2026, 10 circulars expire, including:
  - TT 80/2021/TT-BTC, TT 94/2025/TT-BTC and TT 21/2026/TT-BTC (tax administration);
  - TT 103/2014/TT-BTC (foreign contractor tax);
  - TT 19/2021/TT-BTC (e-transactions);
  - TT 84/2016/TT-BTC.

  TT 89 issues a full replacement set of forms. — [LuatVietnam – Điểm mới TT 89/2026](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-thong-tu-89-2026-tt-btc-ve-quan-ly-thue-565-110655-article.html)
- TT 89 took effect 01/07/2026. — same source

### Inferences
- Deadlines for a calendar year (from Q2/2026 onwards; NĐ 252 effective 01/07/2026):
  - Q1: 30/04
  - Q2: **31/07**
  - Q3: **31/10**
  - Q4: **31/01** of the next year
  - Finalization (return + payment): 31/03 of the next year
  - Shift a date that falls on a weekend or holiday to the next working day (general rule, **[UNVERIFIED]** in this session).
- Under NĐ 126/2020 (until 30/06/2026) the quarterly deadline was the 30th of the first month (PwC wording). Q1/2026 fell on 30/04 under both rules.
- 80% check at finalization:
  - shortfall = max(0, 80% × final CIT − Σ provisional Q1–Q4)
  - interest = shortfall × 0.03% × days from (Q4 deadline + 1) until the day before payment
- The 2025 finalization (due 31/03/2026) used the TT 80/2021 forms. The 2026 finalization (due 31/03/2027) must use the TT 89/2026 forms. 03-1A/TNDN appears to have been dropped in favour of attaching the financial statements; check against the TT 89 annex before building XML. HTKK 5.8.2 (2026) exists per a MISA title **[PARTIAL]**.

## 5. Loss carry-forward

### Takeaway
Losses carry forward for up to 5 years, with no carry-back. Losses that arose before NĐ 320 continue for their remaining period.

### Cited Findings
- "Losses may be carried forward fully and consecutively for a maximum of five years. Carryback of losses is not permitted." — [PwC – Deductions](https://taxsummaries.pwc.com/vietnam/corporate/deductions)
- NĐ 320 Điều 7 covers "Xác định lỗ và chuyển lỗ". Điều 25 k4 continues pre-existing losses for the remaining period. The appendix is 03-2/TNDN, "Phụ lục chuyển lỗ" (TT 89). — [NĐ 320](https://luatvietnam.vn/thue/nghi-dinh-320-2025-nd-cp-huong-dan-thi-hanh-luat-thue-thu-nhap-doanh-nghiep-chi-tiet-421582-d1.html); [TT 89](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html)

### Inferences
- Keep a loss register by year of origin. Apply losses FIFO and expire them after N+5.

## 6. Journal entries under TT 99/2025/TT-BTC: 3334, 8211 (82111/82112), 8212, 243, 347, 911, 4212

### Takeaway
**[VERIFIED: account list]** From 01/01/2026, enterprises previously on TT 200/2014 switch to TT 99/2025. The relevant accounts and names:

| Account | Name in TT 99 |
|---|---|
| 243 | Tài sản thuế thu nhập hoãn lại |
| 3333 | Thuế xuất, nhập khẩu |
| 3334 | Thuế thu nhập doanh nghiệp |
| 347 | Thuế thu nhập hoãn lại phải trả |
| 421 | Lợi nhuận sau thuế chưa phân phối |
| 4211 | … lũy kế đến cuối năm trước |
| 4212 | … năm nay |
| 521 | Các khoản giảm trừ doanh thu (retained) |
| 821 | Chi phí thuế TNDN |
| 8211 | Chi phí thuế TNDN hiện hành |
| **82111** | Chi phí thuế TNDN hiện hành theo quy định của Luật thuế TNDN |
| **82112** | Chi phí thuế TNDN bổ sung theo quy định về thuế tối thiểu toàn cầu |
| 8212 | Chi phí thuế TNDN hoãn lại |
| 911 | Xác định kết quả kinh doanh |

The entries below are standard VAS practice and remain **[UNVERIFIED]** against the TT 99 accounting guidance text.

### Cited Findings
- The TT 99 account list contains the rows above, plus the note that TT 200 users switch to TT 99 from 01/01/2026 for financial year 2026 onwards. — [Kế toán Thiên Ưng – Hệ thống tài khoản TT 99/2025](https://ketoanthienung.net/he-thong-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc.htm)

### Inferences (entries **[UNVERIFIED - standard practice]**)
- A domestic SME trader uses **82111** for current CIT. **82112** is only for the global minimum tax top-up (large multinational groups), so default it to unused.
- Quarterly provisional CIT:
  - Accrue: Nợ 82111 / Có 3334.
  - Pay: Nợ 3334 / Có 112.
- 30% reduction under NĐ 398, recommended:
  - Book the CIT net of the reduction: Nợ 82111 / Có 3334 (CIT after the reduction).
  - Track the reduction amount in a memo or report line.

  Some practitioners instead post gross and then Nợ 3334 / Có 711. This was not verified, so pick one approach and make it configurable.
- Year-end true-up:
  - Additional tax: Nợ 82111 / Có 3334.
  - Over-accrual: Nợ 3334 / Có 82111.
- Deferred tax (VAS 17), optional for an SME:
  - DTL: Nợ 8212 / Có 347.
  - DTA: Nợ 243 / Có 8212.
  - Reversals use the opposite entries.
- Closing, in order:
  1. Nợ 511 / Có 521.
  2. Nợ 511, 515, 711 / Có 911.
  3. Nợ 911 / Có 632, 635, 641, 642, 811.
  4. Nợ 911 / Có 82111 (and 82112). Then Nợ 911 / Có 8212 if 8212 has a debit balance, or Nợ 8212 / Có 911 if it has a credit balance.
  5. Profit: Nợ 911 / Có 4212. Loss: Nợ 4212 / Có 911.
  6. At the start of the next year, move 4212 into 4211.
- SMEs that choose TT 133/2016 have no 243, 347 or 8212.
- After closing, assert that 911 and all class 5–8 accounts are zero.

## 7. Foreign contractor tax (thuế nhà thầu nước ngoài, FCT)

### Takeaway
**[VERIFIED]** TT 103/2014 was repealed from 01/07/2026 by TT 89/2026. The Vietnamese payer now declares FCT under TT 89 and NĐ 252:
- The return is per payment (01/NTNN, NCCNN), due by the 10th day.
- A monthly declaration (due the 20th of the next month) may be registered if there are several payments in a month.
- 02/NTNN is the finalization return at contract end, filed if the tax changed.

The deemed CIT and VAT rates now sit in the new CIT and VAT circulars (PwC), not in TT 103.

### Cited Findings
- TT 89 FCT declaration:
  - VAT computed directly on revenue and CIT at a % of revenue are declared per payment to the foreign contractor.
  - A finalization is filed at contract end if the tax changed.
  - "Trường hợp bên Việt Nam thanh toán cho nhà thầu nước ngoài nhiều lần trong tháng thì có thể đăng ký khai thuế theo tháng".
  - Forms: Mẫu 01/NTNN, NCCNN and 02/NTNN (finalization).

  — [LuatVietnam – TT 89/2026](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html)
- NĐ 252 Điều 10: per-transaction returns are due by the 10th day; monthly returns by the 20th of the next month. — [NĐ 252](https://luatvietnam.vn/thue/nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-439382-d1.html)
- A Vietnamese party that withholds FCT and has registered for monthly declaration must still file a monthly return in a month with no withholding (NĐ 252, item on obligations). — same source
- TT 103/2014 expired 01/07/2026 (TT 89 Điều 99). — [LuatVietnam – Điểm mới TT 89](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-thong-tu-89-2026-tt-btc-ve-quan-ly-thue-565-110655-article.html)
- Deemed rates per PwC (Sept 2026):

  | Activity | CIT | VAT |
  |---|---|---|
  | Goods supply with risk in Vietnam | 1% | — |
  | Services | 5% | 5% or 10% (digital services 10% from 01/07/2025) |
  | Construction | 2% | — |
  | Transport | 2% | — |
  | Interest | 5% | — |
  | Royalties | 10% | — |
  | Other | 2% | 2% |

  PwC says the VAT circular effective 01/07/2025 sets the FCT-VAT rates and the new CIT circular governs FCT-CIT. — [PwC – Withholding taxes](https://taxsummaries.pwc.com/vietnam/corporate/withholding-taxes)

### Inferences
- Entries **[UNVERIFIED - practice]**:
  - Withhold: Nợ 331 / Có 3331 (FCT-VAT) and Có 3338 (FCT-CIT).
  - Net contract: the borne CIT is booked Nợ 642 / Có 3338.
  - Creditable FCT-VAT: Nợ 1331 / Có 3331.
  - Make the accounts configurable.
- A lamp/thermos importer on FOB/CIF terms is normally not subject to FCT. FCT applies to foreign services (software, consulting, ads outside the platforms' self-registration).

## 8. Import duty, import VAT and SCT (TTĐB): brief, unchanged from the previous notes

### Cited Findings
- Customs duties = import duty + import VAT. SCT applies only to listed goods. The amended SCT Law took effect 01/01/2026. The VAT reduction to 8% runs 01/07/2025 – 31/12/2026. — [PwC – Other taxes](https://taxsummaries.pwc.com/vietnam/corporate/other-taxes)

### Inferences (**[UNVERIFIED]**)
- Import entries:
  - Nợ 156 / Có 331 (CIF value), Có 3333 (import duty), Có 3332 (SCT, if any).
  - Import VAT: Nợ 1331 / Có 33312.
- Lamps (HS 9405) and vacuum flasks (HS 9617) are not SCT goods.

## Còn chưa xác minh

- **Thông tư 20/2026/TT-BTC** (guiding Luật 67/2025 and NĐ 320): the number and the 12/03/2026 effective date come only from search-result titles (thuvienphapluat, MISA). The text was not read. Not checked: whether it changes the non-cash rules, the FCT-CIT rates or the treatment of 3334/821.
- **Exact date of NĐ 320/2025**: 05/12/2025, from the MoF draft title only.
- **Effective date of NQ 43/2026/QH16** (24/08/2026): from a LuatVietnam article, not from the resolution's text.
- **03-1A/TNDN**: not found in the TT 89 text as fetched. This suggests the financial statements replace it. NĐ 320 Điều 11 k4, however, still mentions a "Phụ lục kết quả hoạt động sản xuất kinh doanh". Check the TT 89 Phụ lục II form list and the HTKK XML before coding.
- **Accounting for the 30% reduction** (net in 82111 vs. credit to 711): no MoF guidance found.
- **Interest cap of 1.5× the base rate** for loans from non-credit-institution lenders, and the **non-deductibility of interest when charter capital is not fully contributed**: not found in the NĐ 320 sections that were grepped.
- **FCT deemed-rate table** under the 2025–2026 circulars: only the PwC summary is available. The current CIT circular annex was not read.
- **FCT accounting** (3331/3338 vs 33311/3334): practice only, no official guidance read.
- **Weekend or holiday rollover** of deadlines under Luật QLT 108/2025: not checked.
- **TT 99 accounting instructions** for 821/243/347 (the entry wording): only the account names were verified.
- **Import duty rates** for HS 9405 and 9617, and the number of the amended SCT Law: not researched.
