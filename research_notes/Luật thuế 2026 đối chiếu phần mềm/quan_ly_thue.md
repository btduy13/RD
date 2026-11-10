# Quản lý thuế 2026 (Luật 108/2025, NĐ 252/2026, penalties, household-business reform, holidays) checked against the app

Research date: 2026-11-09. Rules are those in force on that date.

**Method.** WebSearch and WebFetch both failed in this session with a model error. Research was done with curl:
- Google News RSS. Article links were decoded through Google's batchexecute endpoint to recover the real URLs.
- Plain-text extraction of each page.
- thuvienphapluat.vn was not used (Cloudflare). PwC Vietnam returned HTTP 403. laodong.vn returned empty pages.

**Prior notes.** This file builds on two earlier files in `research_notes/Luật thuế kế toán Việt Nam 2026/`:
- `quan_ly_thue_han_nop.md` (07/11/2026)
- `xac_minh_truoc_sua.md` (08/11/2026)

Facts already verified there are cited back to them. This file adds only new, re-checked or corrected points.

**App code read:** `js/modules/tax-calendar.js`, `js/core/tax-rules.js`, and the môn bài hint in `js/core/accounting-engine.js:230`.

## 1. Luật Quản lý thuế 108/2025/QH15 and NĐ 252/2026: periods, deadlines, môn bài, late interest, penalties, holiday roll-over

### Takeaway
Luật QLT 108/2025/QH15 applies in full from 01/7/2026, and NĐ 252/2026/NĐ-CP implements it. The standard filing cadence did not change:
- Monthly returns: 20th of the next month.
- Quarterly returns: last day of the first month of the next quarter.
- Annual finalization: last day of the 3rd month after year end.
- Cessation, dissolution or reorganisation: 45th day.
- Per-transaction: 10th day.

A deadline that falls on a day off moves to the next working day (NĐ 252 Đ3.7). Lệ phí môn bài ended on 01/01/2026 under NQ 198/2025/QH15 Đ10.7. Late interest stays at 0.03% per day.

Penalties are still set by NĐ 125/2020, as amended by:
- NĐ 310/2025, effective 16/01/2026.
- NĐ 291/2026, effective 21/7/2026. It adds Điều 19a on information exchange and does not change the late-filing tiers.

The provisional CIT (tạm nộp TNDN) deadline is contested between sources; see Cited Findings.

### Cited Findings
- **Effective dates.** Luật 108/2025/QH15 was passed on 10/12/2025. Its household-business provisions apply from 01/01/2026 and the rest from 01/7/2026. It replaces Luật 38/2019. — [xaydungchinhsach – TOÀN VĂN Luật QLT](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-quan-ly-thue-co-hieu-luc-tu-1-7-2026-119260626174633402.htm); [VietNamNet](https://vietnamnet.vn/9-diem-moi-cua-luat-quan-ly-thue-2025-hieu-luc-tu-1-7-nguoi-nop-thue-can-biet-2531043.html). Verified in the prior notes.
- **Filing deadlines, NĐ 252/2026 Điều 10.** LuatVietnam quotes the article as follows. — [LuatVietnam – Lịch nộp các loại thuế từ 01/7/2026 (24/07/2026)](https://luatvietnam.vn/thue-phi-le-phi/lich-nop-cac-loai-thue-danh-cho-doanh-nghiep-cap-nhat-tu-01-7-2026-565-110822-article.html)
  - Per-transaction (từng lần phát sinh): by the 10th day after the obligation arises.
  - Monthly: by the 20th of the following month.
  - Quarterly: by the last day of the first month of the following quarter.
  - Annual (khai theo năm): by the last day of the first month of the next calendar or fiscal year.
  - Finalization (quyết toán): by the last day of the 3rd month after the finalization period ends.
  - Cessation, dissolution, bankruptcy, equitisation, split or merger: by the 45th day.
  - PIT finalization filed directly by an individual with salary income: by the last day of the 4th month after the calendar year.
  - Foreign resident ending a labour contract: before leaving Vietnam, and no later than 45 days after the contract ends.
- **Roll-over rule (NĐ 252 khoản 7 Điều 3).** If the last day of a filing deadline, a payment deadline or a tax-authority processing deadline falls on a day off, the deadline becomes the next working day after that day off. — [LuatVietnam (same article)](https://luatvietnam.vn/thue-phi-le-phi/lich-nop-cac-loai-thue-danh-cho-doanh-nghiep-cap-nhat-tu-01-7-2026-565-110822-article.html)
- **Article numbers.** LuatVietnam's October task list cites:
  - Monthly VAT under "khoản 2 Điều 10 NĐ 252".
  - Quarterly VAT under "khoản 3 Điều 10 NĐ 252".
  - Q3/2026 quarterly returns due on Saturday 31/10/2026, which rolls to Monday 02/11/2026 under the rule above.
  — [LuatVietnam – Những việc kế toán, HR cần làm tháng 10/2026](https://luatvietnam.vn/thue-phi-le-phi/nhung-viec-ke-toan-nhan-su-can-lam-thang-10-2026-565-112918-article.html)
- **Provisional CIT (tạm nộp TNDN): the sources conflict.**
  - LuatVietnam's 10/2026 task list quotes **khoản 2 Điều 24 NĐ 252/2026**: provisional quarterly payments are due by the last day of the first month of the following quarter ("chậm nhất là ngày cuối cùng của tháng đầu của quý tiếp theo"). The same table lists the Q3/2026 payment as "Thứ Sáu, ngày 30/10/2026", which does not match the quoted rule. — [LuatVietnam 10/2026](https://luatvietnam.vn/thue-phi-le-phi/nhung-viec-ke-toan-nhan-su-can-lam-thang-10-2026-565-112918-article.html)
  - LuatVietnam's 24/07/2026 summary table says "Tạm nộp thuế TNDN theo quý – chậm nhất ngày 30 của tháng đầu tiên của quý tiếp theo", which is the old Luật 38 wording. — [LuatVietnam 07/2026](https://luatvietnam.vn/thue-phi-le-phi/lich-nop-cac-loai-thue-danh-cho-doanh-nghiep-cap-nhat-tu-01-7-2026-565-110822-article.html)
  - The direct quote of Điều 24.2 is the stronger evidence.
- **Lệ phí môn bài abolished.** Công văn 645/CT-CS (23/01/2026) of the Cục Thuế relies on two provisions:
  - Khoản 7 Điều 10 NQ 198/2025/QH15 (17/05/2025): "Chấm dứt việc thu, nộp lệ phí môn bài từ ngày 01 tháng 01 năm 2026."
  - Khoản 4 Điều 6 NĐ 362/2025/NĐ-CP (31/12/2025), which repeals NĐ 139/2016 and NĐ 22/2020 on môn bài.

  From 01/01/2026, taxpayers neither pay môn bài nor file a môn bài return for 2026 or later years. Tax offices must still collect môn bài owed for 2025 and earlier. — [xaydungchinhsach (31/01/2026)](https://xaydungchinhsach.chinhphu.vn/tu-thang-1-2026-nguoi-nop-thue-khong-phai-nop-le-phi-mon-bai-119260126110926562.htm)
- **Môn bài arrears write-off is only a draft.** In 10/2026 the MoF proposed writing off unpaid môn bài and conditional late interest for taxpayers in status 03 or 06. — headlines only: [LuatVietnam 02/11/2026](https://luatvietnam.vn/tin-van-ban-moi/xoa-no-le-phi-mon-bai-xoa-tien-cham-nop-co-dieu-kien-cho-nguoi-nop-thue-o-trang-thai-03-06-186-114897-article.html); [Thời báo Tài chính 28/10/2026](https://thoibaotaichinhvietnam.vn/bo-tai-chinh-de-xuat-xoa-no-le-phi-mon-bai-tien-cham-nop-cho-nguoi-nop-thue-o-trang-thai-03-06-206078.html)
- **Bridge decree NĐ 373/2025/NĐ-CP.** Issued 31/12/2025, effective 14/02/2026, it amends NĐ 126/2020 for the period before Luật 108. A taxpayer that filed quarterly but did not qualify must:
  - File monthly from the first month of the next quarter.
  - Re-file the earlier quarters as monthly returns.
  - Pay late interest.

  The re-filed monthly returns are not fined as late. — [xaydungchinhsach (02/02/2026)](https://xaydungchinhsach.chinhphu.vn/nguoi-nop-thue-can-luu-y-mot-so-diem-moi-duoc-quy-dinh-tai-nghi-dinh-373-2025-nd-cp-119260127094649106.htm)
- **Monthly vs quarterly threshold.** The 50-billion-VND threshold continues for household businesses: those with revenue from 01 to 50 billion VND file VAT and PIT quarterly (NĐ 68/2026 Điều 10). — [LuatVietnam (27/07/2026)](https://luatvietnam.vn/thue-phi-le-phi/ca-nhan-kinh-doanh-can-hoan-thanh-ngay-cac-thu-tuc-ve-thue-truoc-31-7-565-110905-article.html). No primary text was retrieved for the enterprise criterion in NĐ 252; see Gaps.
- **Late interest.** The rate is 0.03% per day. The taxpayer computes it; if not done 30 days after paying the tax, the tax authority computes and notifies it. No interest accrues during a tax-debt freeze (khoanh nợ) or an outage of the tax authority's IT system. — [xaydungchinhsach – Những điểm mới Luật 108](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm). Verified in the prior notes.
- **Late-filing fine tiers (NĐ 125 Đ13 as amended by NĐ 310/2025), for organisations; individuals pay half.** — [CafeF 29/07/2026](https://cafef.vn/chi-con-2-ngay-de-ca-nhan-ho-kinh-doanh-thuc-hien-ngay-viec-sau-de-tranh-bi-phat-tien-len-den-25-trieu-dong-188260729110807743.chn), via the prior notes

  | Days late | Fine |
  |---|---|
  | 1–5, with a mitigating circumstance | Warning |
  | 1–30 | 2–5 million VND |
  | 31–60 | 5–8 million VND |
  | 61–90; or over 90 with no tax due; or no return filed when no tax is due | 8–15 million VND |
  | Over 90, with tax due, and tax plus interest paid before an audit decision or violation record | 15–25 million VND |

- **NĐ 310/2025 "same day" rule.** If several returns for the same tax type are filed late on the same day, only one violation is fined, at the highest bracket. Late returns that amount to tax evasion are separated out and fined as evasion. The same rule applies to several invoice notices or reports of the same type filed late on the same day. — [LuatVietnam – Điểm mới NĐ 310](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-nghi-dinh-310-nd-cp-ve-xu-phat-vi-pham-thue-hoa-don-565-105729-article.html)
- **NĐ 291/2026/NĐ-CP (21/7/2026, effective the same day).** It amends NĐ 125 by adding Mục 3 and Điều 19a, on supplying information for tax information exchange:
  - Information supplied 5 or more days late: 10–30 million VND.
  - Inaccurate or incomplete information: 30–50 million VND.
  - Information not supplied 15 days after the deadline, or collusion: 50–100 million VND.

  It also removes the old rule that invoice violations fined under Điều 16 or 17 are not also fined under Điều 28, because the basis for that rule (Luật 38 Đ136.2) is not in Luật 108. — [LuatVietnam](https://luatvietnam.vn/tin-van-ban-moi/da-co-nghi-dinh-291-2026-nd-cp-sua-doi-nghi-dinh-125-2020-nd-cp-xu-phat-vi-pham-hanh-chinh-ve-thue-hoa-don-186-110744-article.html); [EasyInvoice](https://easyinvoice.vn/nghi-dinh-291-2026-nd-cp/). No source reports changes to the Điều 13 late-filing tiers.
- **Supplementary returns.** The window is now 5 years (Luật 108 Đ12.5); it was 10 years. — [LuatVietnam 01/7/2026](https://luatvietnam.vn/tin-van-ban-moi/chinh-sach-moi-ve-thue-co-hieu-luc-hom-nay-01-7-2026-186-109976-article.html). Verified in the prior notes.
- **Annual financial statements (BCTC).** Under TT 99/2025/TT-BTC, effective 01/01/2026, the annual BCTC is due within 90 days after the accounting year ends. For a calendar year 2026, that is 31/03/2027, filed with the CIT finalization. — [MISA AMIS (29/10/2026)](https://amis.misa.vn/76287/thoi-han-nop-bao-cao-tai-chinh/)
- **Small companies.** Under NĐ 141/2026/NĐ-CP (29/4/2026, effective 01/01/2026), an enterprise with total annual revenue of 01 billion VND or less is exempt from CIT. A new company expecting revenue of 01 billion VND or less does not make provisional CIT payments. — [baochinhphu.vn](https://baochinhphu.vn/chinh-thuc-nang-nguong-chiu-thue-voi-ho-kinh-doanh-len-01-ty-dong-nam-ap-dung-tu-1-1-2026-102260429185517215.htm)

### Inferences
- Last day of the month and "ngày 30" differ only for January, July and October, by one day. The conservative choice is to warn on day 30 and show the legal deadline as the last day of the month.
- 2026 deadlines that roll forward:
  - Q3 returns: 31/10/2026 (Saturday) becomes 02/11/2026.
  - Q4/2026 returns: 31/01/2027 (Sunday) becomes 01/02/2027.
  - Individual PIT finalization for 2026: 30/04/2027 (holiday), with 01–02/05 a weekend and 03/05 a substitute day off, becomes 04/05/2027.
- Môn bài: the app should show no 2026+ môn bài deadline. TK 3338 posting is still needed for arrears from 2025 and earlier.

### Gaps
- NĐ 252 Điều 24 full text was not seen. The source that quotes it contradicts itself on the provisional CIT payment date. Also unconfirmed: whether the rule that the four quarterly provisional CIT payments must total at least 80% of the annual liability (NĐ 126 Đ8.6) carried into NĐ 252 unchanged.
- The enterprise monthly-vs-quarterly criterion in NĐ 252 (prior-year revenue of 50 billion VND or less, and new businesses filing quarterly) was not confirmed from text. Only the household rule (NĐ 68/2026 Đ10) was confirmed.
- These NĐ 125 details are from memory of the pre-2026 text and were not re-verified:
  - The fine for filing over 90 days late is capped at the tax due, with a floor of 11 million VND (Đ13.5).
  - Over 90 days late with tax unpaid is treated as tax evasion (Đ17.1.a).
- The app UI cites "NQ 66.16/2026" for quarterly PIT filing from April 2026 to 28/02/2027. No source was found.

## 2. Household businesses: thuế khoán abolished, revenue-based declaration, thresholds, e-invoices

### Takeaway
From 01/01/2026, presumptive tax (thuế khoán) no longer applies (NQ 198/2025 Đ10.6). Households declare their own tax under NĐ 68/2026/NĐ-CP (05/3/2026). NĐ 141/2026 raised the non-taxable revenue threshold for VAT and PIT from 500 million VND to **01 billion VND per year**, retroactive to 01/01/2026.

Household businesses with revenue above 01 billion VND must use e-invoices with a tax-authority code or cash-register e-invoices. Those with revenue from 01 to 50 billion VND file VAT and PIT quarterly.

### Cited Findings
- From 01/01/2026, household and individual businesses no longer use the presumptive-tax method (khoản 6 Điều 10 NQ 198/2025/QH15). They declare on actual revenue and costs. — [Tạp chí Luật sư Việt Nam (02/10/2026)](https://lsvn.vn/quy-dinh-moi-ve-thue-doi-voi-ho-kinh-doanh-va-ca-nhan-kinh-doanh-a179643.html)
- NĐ 141/2026/NĐ-CP (29/4/2026, effective 01/01/2026) amends NĐ 68/2026 (05/3/2026), replacing "500 triệu đồng" with "01 tỷ đồng" throughout. Households that already paid tax under the old threshold get a refund or offset under NĐ 68 Đ12. MoF's comparison base is the 2025 system of thuế khoán with a 100 million VND threshold. — [baochinhphu.vn (29/4/2026)](https://baochinhphu.vn/chinh-thuc-nang-nguong-chiu-thue-voi-ho-kinh-doanh-len-01-ty-dong-nam-ap-dung-tu-1-1-2026-102260429185517215.htm); [xaydungchinhsach – toàn văn NĐ 141](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-so-141-2026-nd-cp-nang-nguong-doanh-thu-khong-phai-chiu-thue-len-1-ty-dong-119260504154326455.htm)
- **E-invoices (NĐ 68 Đ8.5 as amended).**
  - Households with annual revenue above 01 billion VND must use e-invoices with a tax-authority code, or cash-register e-invoices connected to the tax authority.
  - A household with several locations uses one tax code and shows the location code on each invoice.
  - A household that crosses 01 billion VND during the year registers within 30 days after the end of that tax period.
  - Households at or below 01 billion VND may opt in.
  — [baochinhphu.vn](https://baochinhphu.vn/chinh-thuc-nang-nguong-chiu-thue-voi-ho-kinh-doanh-len-01-ty-dong-nam-ap-dung-tu-1-1-2026-102260429185517215.htm)
- **Filing periods and deadlines.**
  - Revenue of 01–50 billion VND: VAT and PIT filed quarterly (NĐ 68 Đ10), due by the last day of the first month of the next quarter (NĐ 68 Đ8.3.a).
  - New businesses with revenue of 01 billion VND or less: file a revenue notice for the first 6 months (form 01/TKN-CNKD under TT 89/2026) by 31/7.
  - Individuals renting out property: may file twice a year (by 31/7 and 31/01) or once a year.
  — [LuatVietnam (27/07/2026)](https://luatvietnam.vn/thue-phi-le-phi/ca-nhan-kinh-doanh-can-hoan-thanh-ngay-cac-thu-tuc-ve-thue-truoc-31-7-565-110905-article.html)
- Households with revenue above 50 billion VND file VAT monthly. — headline: Laodong 21/05/2026, via the prior notes; page not readable.
- **E-commerce platforms.** Domestic platforms with both ordering and payment functions withhold and pay tax for household sellers (NĐ 252). Revenue across several platforms counts toward one threshold. — [lsvn.vn](https://lsvn.vn/quy-dinh-moi-ve-thue-doi-voi-ho-kinh-doanh-va-ca-nhan-kinh-doanh-a179643.html)
- **30% PIT/CIT reduction.** NĐ 398/2026 cuts PIT on business income by 30% for 2026 and 2027 where annual revenue is 10 billion VND or less. — [LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/ca-nhan-kinh-doanh-can-hoan-thanh-ngay-cac-thu-tuc-ve-thue-truoc-31-7-565-110905-article.html). The app already has `cit.reduction30` for CIT.
- **Not law.** Experts proposed raising the threshold to 3 billion VND; the MoF responded (Laodong headline, 08/07/2026). No adopted change was found.

### Inferences
- **Impact on a company buying from household suppliers:**
  - Suppliers above 01 billion VND issue coded or cash-register e-invoices.
  - Household-business invoices are sales invoices under the direct method, so they carry no deductible input VAT.
  - Suppliers at or below 01 billion VND may issue no invoice. The company then needs a bảng kê purchase list (bảng kê 01/TNDN-type) for CIT-deductible cost; this is baseline practice, not re-verified.
- **Impact on retail sales to households:** none on the company's own filing calendar.

### Gaps
- The full text of NĐ 68/2026 (the PIT rate table by sector on revenue, and the option to tax income minus cost) was not read.
- The rule for purchase lists covering suppliers without invoices under TT 20/2026 was not checked.

## 3. Public holidays 2026–2027 (the table that drives deadline roll-over)

### Takeaway
2026 adds 24/11 (Ngày Văn hóa Việt Nam) as a paid day off. Under the official notice for 2027 (TB 11483/TB-BNV, 09/10/2026):
- Tết Đinh Mùi: 04–10/02/2027.
- Quốc khánh: 02–05/9/2027, with 03/9 as the adjacent day off.

Giỗ Tổ 2027 is Friday 16/4. 01/5/2027 is a Saturday, so 03/5 is a substitute day off.

The app's 2026 table is missing the civil-service swap day off on Friday 02/01/2026. A new 27/7 holiday from 2027 is only a draft law.

### Cited Findings
- **Tết 2027 and Quốc khánh 2027 (TB 11483/TB-BNV, 09/10/2026).**
  - Civil servants take Tết off from Thursday 04/02 to Wednesday 10/02/2027: 5 Tết days plus 2 substitute days for the weekend.
  - Quốc khánh: 02/9 plus 03/9, so 02–05/9/2027 including the weekend.
  - Enterprises choose 1+4, 2+3 or 3+2 Tết days, and 02/9 plus either 01/9 or 03/9.

  The same item says the Deputy PM approved 1 day off for Ngày Văn hóa Việt Nam on 24/11/2026. — [xaydungchinhsach (09/11/2026)](https://xaydungchinhsach.chinhphu.vn/de-xuat-2-phuong-an-nghi-tet-nguyen-dan-2027-tet-dinh-mui-11926080513033257.htm)
- **Other 2027 days off.**
  - Giỗ Tổ (10/3 âm lịch) falls on Friday 16/4/2027.
  - 30/4 is a Friday and 01/5 a Saturday, so the substitute day off is Monday 03/5.
  - Tết Dương lịch 2027: civil servants off 01–03/01 (Friday–Sunday).
  - 24/11/2027 is a Wednesday.
  — [VnEconomy "Dự kiến…" (10/10/2026)](https://vneconomy.vn/du-kien-cac-ngay-nghi-le-tet-trong-nam-2027.htm). Labelled "dự kiến"; Giỗ Tổ and 30/4 had no official notice yet.
- **Tết Dương lịch 2026 swap.** On 25/12/2025 the Government approved swapping the working day Friday 02/01/2026 to Saturday 10/01/2026, so the public sector was off 01–04/01/2026. — [VnExpress (26/12/2025)](https://vnexpress.net/ai-duoc-hoan-doi-de-nghi-tet-duong-lich-4-ngay-4998165.html)
- **Giỗ Tổ 2026.** 26/4 was a Sunday, so the substitute day off was Monday 27/4. There was no swap around 30/4–1/5/2026 (Công văn 3383/BNV-CVL). — [xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/lich-nghi-le-gio-to-hung-vuong-30-4-1-5-quoc-khanh-2-9-nam-2026-119260222115822151.htm)
- **Draft only: 27/7 holiday.** On 09/11/2026 the Minister of Home Affairs said the draft amendment to the Labour Code adds Ngày Thương binh – Liệt sĩ (27/7) as a paid day off from 2027, "nếu quy định được Quốc hội thông qua". — [Dân trí (09/11/2026)](https://dantri.com.vn/noi-vu/bo-truong-noi-vu-bo-sung-ngay-nghi-277-huong-luong-vao-du-thao-luat-20261109113429703.htm)
- **24/11 legal basis.** NQ 28/2026/QH16 Điều 2, from 01/7/2026, via the prior notes ([LuatVietnam](https://luatvietnam.vn/tin-van-ban-moi/tu-hom-nay-01-7-2026-nguoi-lao-dong-chinh-thuc-co-them-1-ngay-nghi-huong-nguyen-luong-186-109961-article.html)).

### Inferences
- If 27/7 is enacted, 27/7/2027 (Tuesday) becomes a day off. No standard deadline falls on 27/7, but the table should be updated once the law passes.
- 02/01/2026 does not shift any standard deadline (the 20th or a month end), so the missing swap day has no current effect. The tax-authority calendar is still incomplete without it.

### Gaps
- No source was retrieved on whether 24/11 gets a substitute day off when it falls on a weekend.
- 2025 table: the 2025 civil-service schedule swapped Friday 02/05/2025 for Saturday 26/04/2025. This is from memory (TB-BNV 2025), was not verified this session, and `2025-05-02` is missing from the app's 2025 list. The impact is nil for current deadlines.
- No official notice for Giỗ Tổ or 30/4–1/5 2027 yet; the dates are computed.

## 4. App vs law: verdict per rule (`js/modules/tax-calendar.js`, `js/core/tax-rules.js`)

### Takeaway
The calendar engine is largely correct:
- Monthly and quarterly cadence, the finalization date and the roll-over rule.
- The 0.03% late interest and the 2026–2027 holiday table, including 24/11 and the Tết and Quốc khánh 2027 dates.
- No môn bài deadline after 2025.

Defects:
- The penalty helper gives the wrong range for returns filed more than 90 days late with no tax due.
- The calculator applies late-filing fines to days of late payment.
- One 2026 holiday swap day is missing.
- The provisional CIT deadline has conflicting sources and should be confirmed.
- The ≤ 01 billion VND CIT exemption and its waiver of provisional payments are missing.

### Cited Findings

| # | Rule | App | Verdict | Basis |
|---|---|---|---|---|
| 1 | Monthly VAT and PIT return: day 20 of M+1 | `periodic()`: `${ny}-${nm}-20` | **Verified-correct** | NĐ 252 Đ10.2 ([LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/lich-nop-cac-loai-thue-danh-cho-doanh-nghiep-cap-nhat-tu-01-7-2026-565-110822-article.html)) |
| 2 | Quarterly return: last day of the first month of the next quarter | `taxCalLastDay(ny, nm)` | **Verified-correct** | NĐ 252 Đ10.3 (same source) |
| 3 | Roll-over to the next working day for Saturday, Sunday or a holiday | `computeDueDate` | **Verified-correct.** Saturday 22/08/2026 was a make-up working day and is always skipped, which is in the taxpayer's favour and already commented in code | NĐ 252 Đ3.7 (same source) |
| 4 | CIT finalization and annual BCTC: last day of the 3rd month | `taxCalLastDay(y+1, 3)` | **Verified-correct** for a calendar year. The BCTC rule is "90 days", which equals 31/3 for a calendar year. It differs for non-calendar fiscal years, which the app does not support. The code comment "chưa xác minh lại với TT99" can be updated: verified | NĐ 252 Đ10; [MISA – TT 99 90 ngày](https://amis.misa.vn/76287/thoi-han-nop-bao-cao-tai-chinh/) |
| 5 | PIT finalization by the organisation (05/QTT-TNCN): last day of the 3rd month | `taxCalLastDay(y+1, 3)` | **Verified-correct** | NĐ 252 Đ10 (same source) |
| 6 | Provisional CIT: Q1–Q2/2026 on day 30; from Q3/2026 on the last day of the first month of the next quarter | lines 60–65 | **Unresolved conflict, probably correct.** A quote of NĐ 252 Đ24.2 supports the app. LuatVietnam's 07/2026 table still says "ngày 30". Recommendation: confirm from the gazette text. Until then, add a reminder on day 30 of January, July and October | [LuatVietnam 10/2026](https://luatvietnam.vn/thue-phi-le-phi/nhung-viec-ke-toan-nhan-su-can-lam-thang-10-2026-565-112918-article.html) vs [LuatVietnam 07/2026](https://luatvietnam.vn/thue-phi-le-phi/lich-nop-cac-loai-thue-danh-cho-doanh-nghiep-cap-nhat-tu-01-7-2026-565-110822-article.html) |
| 7 | No provisional CIT and CIT exemption when annual revenue ≤ 01 billion VND, effective 01/01/2026 | not present. `cit.rateTiers` starts at 15% and there is no exemption rule. The calendar always lists provisional CIT | **Missing in app** | NĐ 141/2026 Đ2, adding khoản 15 Điều 4 NĐ 320 ([baochinhphu](https://baochinhphu.vn/chinh-thuc-nang-nguong-chiu-thue-voi-ho-kinh-doanh-len-01-ty-dong-nam-ap-dung-tu-1-1-2026-102260429185517215.htm)) |
| 8 | Quarterly vs monthly choice | user setting, default quarterly | **Acceptable but missing a guard.** No check against the prior-year revenue threshold of 50 billion VND. If the period is chosen wrongly, NĐ 373/2025 requires monthly re-filing plus late interest | [NĐ 373](https://xaydungchinhsach.chinhphu.vn/nguoi-nop-thue-can-luu-y-mot-so-diem-moi-duoc-quy-dinh-tai-nghi-dinh-373-2025-nd-cp-119260127094649106.htm); enterprise threshold unverified |
| 9 | Lệ phí môn bài | no deadline in the calendar. `accounting-engine.js:230` maps môn bài to TK 3338 | **Verified-correct.** Abolished from 01/01/2026; arrears from 2025 and earlier are still collectible, so the 3338 hint is still useful | NQ 198/2025 Đ10.7; NĐ 362/2025 Đ6.4; CV 645/CT-CS ([xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/tu-thang-1-2026-nguoi-nop-thue-khong-phai-nop-le-phi-mon-bai-119260126110926562.htm)) |
| 10 | Late interest 0.03% per day; days counted from the day after the due date to the payment date; excluded days subtracted | `lateInterest` | **Verified-correct** | [xaydungchinhsach – Luật 108](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm) |
| 11 | Late-filing tiers: 1–30, 31–60, 61–90 days; individuals at half | `lateFilingPenaltyTier` | **Verified-correct** for those tiers | NĐ 125 Đ13 as amended by NĐ 310 ([CafeF](https://cafef.vn/chi-con-2-ngay-de-ca-nhan-ho-kinh-doanh-thuc-hien-ngay-viec-sau-de-tranh-bi-phat-tien-len-den-25-trieu-dong-188260729110807743.chn)) |
| 12 | More than 90 days late | always returns 15–25 million VND, with a note | **Wrong in app.** With no tax due, the range is 8–15 million VND. The 15–25 million range applies only when tax was due and tax plus interest were paid before an audit decision or violation record. If tax is still unpaid, Điều 17 (evasion) applies (baseline, unverified) | same CafeF table |
| 13 | Warning for 1–5 days | `warning: d <= 5`, with a note | **Verified-correct**, provided the UI makes clear the warning applies only when there is a mitigating circumstance. The note does say this | same |
| 14 | Calculator applies the late-filing tier to days of late payment | `calcTaxLateInterest` passes `r.days` (payment) into `lateFilingPenaltyTier` | **Wrong in app (logic).** Late payment carries only interest. Late filing is a separate violation counted from the filing deadline to the filing date. The calculator needs a separate input for the filing date | NĐ 125 Đ13 vs Luật 108 late interest |
| 15 | Several returns of the same tax type filed late on the same day: one violation, highest bracket | UI text | **Verified-correct.** Should add that late returns that amount to evasion are fined separately | [LuatVietnam NĐ 310](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-nghi-dinh-310-nd-cp-ve-xu-phat-vi-pham-thue-hoa-don-565-105729-article.html) |
| 16 | 2026 holidays: 01/01; Tết 16–20/02; 27/04; 30/04; 01/05; 31/08 (swap); 01–02/09; 24/11 | `holidays` 2026 | **Verified-correct but missing 02/01/2026**, the civil-service swap day off (made up on Saturday 10/01). No current deadline is affected | [VnExpress](https://vnexpress.net/ai-duoc-hoan-doi-de-nghi-tet-duong-lich-4-ngay-4998165.html); [xaydungchinhsach 2026](https://xaydungchinhsach.chinhphu.vn/lich-nghi-le-gio-to-hung-vuong-30-4-1-5-quoc-khanh-2-9-nam-2026-119260222115822151.htm) |
| 17 | 2027 holidays: 01/01; Tết 04, 05, 08, 09, 10/02; 16/04; 30/04; 03/05; 02–03/09; 24/11 | `holidays` 2027 | **Verified-correct.** Tết and Quốc khánh match TB 11483/TB-BNV. Giỗ Tổ and 03/05 match VnEconomy's projection. 27/7 is a draft: do not add until enacted | [xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/de-xuat-2-phuong-an-nghi-tet-nguyen-dan-2027-tet-dinh-mui-11926080513033257.htm); [VnEconomy](https://vneconomy.vn/du-kien-cac-ngay-nghi-le-tet-trong-nam-2027.htm); [Dân trí](https://dantri.com.vn/noi-vu/bo-truong-noi-vu-bo-sung-ngay-nghi-277-huong-luong-vao-du-thao-luat-20261109113429703.htm) |
| 18 | 2025 holidays | `holidays` 2025 | **Probably missing 02/05/2025** (civil-service swap). Not verified this session; past year, low impact | — |
| 19 | NĐ 245/2026 VAT extensions | `TAX_CALENDAR_EXTENSIONS` | **Verified-correct** in the prior notes | [xaydungchinhsach NĐ 245](https://xaydungchinhsach.chinhphu.vn/nghi-dinh-245-2026-nd-cp-gia-han-thoi-han-nop-thue-tien-thue-dat-trong-nam-2026-119260627180925528.htm) |
| 20 | Per-transaction (10th day), cessation or reorganisation (45th day), individual PIT finalization (4th month), 5-year supplementary-filing window | not in the calendar | **Missing in app.** Optional for a small company; the 45-day rule matters on dissolution, and the 5-year window should drive the lock on amending past periods | NĐ 252 Đ10; Luật 108 Đ12.5 |
| 21 | Penalty for late information supply (NĐ 291/2026 Đ19a: 10–100 million VND) | not present | **Missing in app.** Low priority | [LuatVietnam NĐ 291](https://luatvietnam.vn/tin-van-ban-moi/da-co-nghi-dinh-291-2026-nd-cp-sua-doi-nghi-dinh-125-2020-nd-cp-xu-phat-vi-pham-hanh-chinh-ve-thue-hoa-don-186-110744-article.html) |
| 22 | UI note "TNCN khai theo quý từ kỳ tháng 4/2026 đến hết 28/02/2027 (NQ 66.16/2026)" | `renderTaxCalendar` | **Unverified.** No source found | — |

### Inferences
- **Priority fixes, all code changes, not made here:**
  1. #12: split the over-90-days tier by whether tax was due.
  2. #14: separate the filing date from the payment date in the calculator.
  3. #7: add a `cit.exemptRevenue` rule of 01 billion VND from 2026-01-01 and suppress provisional-CIT rows when the setting applies.
  4. #16: add 2026-01-02.
  5. #6: confirm against the gazette text; consider a day-30 early reminder.

### Gaps
- The gazette text of NĐ 252 and of NĐ 125 as consolidated after NĐ 310 and NĐ 291 was not available, because PDFs are scans and thuvienphapluat is blocked. Verdicts #6, #8 and #12 (the evasion branch) depend on secondary sources.
