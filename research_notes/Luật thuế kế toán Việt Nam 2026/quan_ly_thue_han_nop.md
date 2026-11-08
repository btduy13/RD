# Quản lý thuế 2026: filing calendar, deadlines, penalties (spec input for accounting app)

Research date: 2026-11-07. Method note: WebSearch/WebFetch tools were unavailable in this session; research was done via Google News RSS and direct page fetches (curl). thuvienphapluat.vn returned HTTP 403, and the official PDFs of Luật 108/2025/QH15 and NĐ 252/2026/NĐ-CP (downloaded from xdcs.cdnchinhphu.vn) are image scans with no text layer, and OCR was not available. Article-level text of the new law was therefore taken from government/legal-news summaries (xaydungchinhsach.chinhphu.vn, LuatVietnam, VietNamNet, MISA), not from the gazette text itself. Pre-2026 baseline rules that could not be re-fetched are listed under **Gaps** and labelled "baseline (unverified this session)".

## 1. Legal framework in force on 2026-11-07: Luật Quản lý thuế 108/2025/QH15 and implementing texts

### Takeaway
Luật Quản lý thuế 108/2025/QH15 was passed on 10/12/2025. Its rules for household and individual businesses (hộ/cá nhân kinh doanh) took effect on 01/01/2026, and the rest took effect on 01/7/2026, replacing Luật 38/2019/QH14. NĐ 252/2026/NĐ-CP implements it from 01/7/2026, with 76 articles that replace the NĐ 126/2020 family of decrees. A narrow amendment (taxpayers' right to state compensation, Arts. 37–38) takes effect on 01/3/2027.

### Cited Findings
- The National Assembly passed Luật Quản lý thuế 108/2025/QH15 on 10/12/2025, and it took effect on 1/7/2026. — [VietNamNet, 30/06/2026](https://vietnamnet.vn/9-diem-moi-cua-luat-quan-ly-thue-2025-hieu-luc-tu-1-7-nguoi-nop-thue-can-biet-2531043.html)
- The law has two effective dates. From 01/01/2026, the rules on declaring and calculating tax for household and individual businesses, and on their use of e-invoices, apply. From 01/7/2026, all other provisions apply nationwide. — [xaydungchinhsach.chinhphu.vn (TOÀN VĂN Luật QLT)](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-quan-ly-thue-co-hieu-luc-tu-1-7-2026-119260626174633402.htm). The official PDF of the law is at https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/26/luatquanlythue-17824706025481294456243.pdf; it is a scanned image only.
- The law removes the old fixed order for crediting payments (tax, then late interest, then penalties). Taxpayers now choose what to pay using a payment identification code (mã định danh khoản phải nộp). The law also removes tax inspection (thanh tra thuế) by tax authorities; only kiểm tra thuế (tax audit) remains. — [xaydungchinhsach (TOÀN VĂN page)](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-quan-ly-thue-co-hieu-luc-tu-1-7-2026-119260626174633402.htm)
- Nine key changes:
  1. Taxpayers are segmented by industry, revenue size and compliance history.
  2. New prohibited acts are added.
  3. The personal identification number (số định danh cá nhân) serves as the tax code for individuals and households.
  4. The period for filing supplementary returns (khai bổ sung) is cut from 10 years to 5 years.
  5. E-commerce platforms withhold, declare and pay tax on behalf of sellers when the platform has both ordering and payment functions.
  6. Refunds, exemptions and reductions are processed automatically.
  7. Global minimum tax, APA and MAP rules are added.
  8. Tax agents may provide bookkeeping for micro-enterprises and household businesses.
  9. Tax e-transactions are to be fully electronic before 1/1/2027.
  — [VietNamNet](https://vietnamnet.vn/9-diem-moi-cua-luat-quan-ly-thue-2025-hieu-luc-tu-1-7-nguoi-nop-thue-can-biet-2531043.html)
- Khoản 5 Điều 12 of Luật QLT 2025 sets the supplementary-filing window at 05 years from the filing deadline of the period with the error, provided no audit decision has been announced. Luật 38/2019 set it at 10 years. Điều 18–19 cover automated refund, exemption and reduction. Điều 51 covers tax agents. — [LuatVietnam, 01/7/2026](https://luatvietnam.vn/tin-van-ban-moi/chinh-sach-moi-ve-thue-co-hieu-luc-hom-nay-01-7-2026-186-109976-article.html)
- If a failure of the tax authority's IT system stops a taxpayer from meeting a deadline, the taxpayer is not penalised and is not charged late interest for the outage period. — [xaydungchinhsach (Những điểm mới Luật 108)](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm)
- NĐ 252/2026/NĐ-CP details the Law on Tax Administration. It takes effect on 1/7/2026 and has 7 chapters and 76 articles. — [xaydungchinhsach (TOÀN VĂN NĐ 252)](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-119260715155021635.htm). The signed PDF is at https://xdcs.cdnchinhphu.vn/446259493575335936/2026/7/15/252-ndcp-signed-17841052430171897600672.pdf; it is a scan.
- NĐ 252 replaces the earlier tax-administration guidance decrees. LuatVietnam compares it against NĐ 126/2020 (as amended by NĐ 91/2022) and NĐ 49/2025. — [LuatVietnam: 6 điểm mới NĐ 252](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-252-2026-nd-cp-ve-quan-ly-thue-565-110192-article.html); [MISA AMIS](https://amis.misa.vn/279293/nghi-dinh-252-2026-nd-cp/)
- Thông tư 89/2026/TT-BTC is described as a consolidated Ministry of Finance circular that guides the Law on Tax Administration and its forms. It appears to be the successor to TT 80/2021. — headline only: [Crowe, 22/07/2026](https://www.crowe.com) "Thông tư 89/2026/TT-BTC hợp nhất hướng dẫn Luật Quản lý thuế"; [MISA meInvoice, 16/07/2026](https://www.meinvoice.vn) "Thông tư 89/2026/TT-BTC và các điểm mới về quản lý thuế". Both pages could not be fetched; Crowe returned 403.
- Luật Trách nhiệm bồi thường của Nhà nước (sửa đổi) 15/2026/QH16 was passed on 23/8/2026. Its khoản 2 Điều 2 amends Luật QLT 108, Điều 37.1.n and Điều 38.1.g, to cover the taxpayer's right to compensation and the tax authority's duty to pay it. These changes apply from 01/3/2027. — [LuatVietnam, 16/09/2026](https://luatvietnam.vn/tin-van-ban-moi/luat-quan-ly-thue-2025-chinh-thuc-duoc-sua-doi-tu-01-3-2027-186-112494-article.html). The article body says "có hiệu lực từ ngày 01/3/2026", which contradicts its own headline. 01/3/2027 is almost certainly correct, because the law was passed in 08/2026.
- NĐ 373/2025/NĐ-CP is reported as "hướng dẫn Luật Quản lý thuế". It probably bridged the period before 1/7/2026. — headline only: MISA meInvoice, 20/01/2026. Not verified.

### Inferences
- The app's rule engine needs effective-date versioning. Periods whose filing deadline falls before 01/7/2026 follow Luật 38/2019 and NĐ 126/2020. From 01/7/2026, Luật 108/2025, NĐ 252/2026 and TT 89/2026 apply. The 5-year supplementary-return window should drive the "allow amendment" lock in the app, replacing the 10-year window.
- The amendment effective 01/3/2027 does not touch deadlines or late interest. No calendar change is needed for it.

### Gaps
- The article numbers in Luật 108 for filing deadlines (Luật 38: Điều 44) and payment deadlines (Luật 38: Điều 55) were not confirmed, because the PDF is a scan and thuvienphapluat blocked access. The rules below rely on summaries and on observed 2026 deadlines.
- TT 89/2026/TT-BTC content (forms, number of the XML return template, effective date) was not verified.

## 2. Filing and payment deadlines, and the weekend/holiday roll-forward rule

### Takeaway
Observed 2026 practice shows the standard cadence continuing under the new law: 20th of the following month for monthly returns, and the last day of the first month of the next quarter for quarterly returns. Deadlines that fall on a weekend or public holiday roll forward to the next working day. Q3/2026 returns (nominally 31/10/2026, a Saturday) were due on Monday 02/11/2026. A new paid public holiday, Ngày Văn hóa Việt Nam (24/11), applies from 2026 and must be in the holiday table.

### Cited Findings
- A government notice said 2/11/2026 was the final day to file Q3/2026 returns for household businesses. 31/10/2026 is a Saturday, so the deadline rolled to Monday. — [Thông tin Chính phủ (Facebook), 01/11/2026](https://www.facebook.com/thongtinchinhphu/videos/-h%E1%BB%99-kinh-doanh-l%C6%B0u-%C3%BD-ng%C3%A0y-2112026-l%C3%A0-h%E1%BA%A1n-cu%E1%BB%91i-n%E1%BB%99p-h%E1%BB%93-s%C6%A1-khai-thu%E1%BA%BF-qu%C3%BD-iii2026h%E1%BA%A1n/910536578693843/). VietnamFinance also cites "trước 31/10" as the nominal date: [VietnamFinance](https://vietnamfinance.vn/huong-dan-khai-thue-quy-3-2026-tren-etax-mobile-ho-kinh-doanh-can-lam-truoc-31-10-d151761.html)
- The Q2/2026 return was due by 31/7/2026, the last day of the first month of the next quarter. — headline: LuatVietnam, 04/06/2026, "Hộ kinh doanh doanh thu trên 1 tỷ đồng phải nộp tờ khai thuế quý II/2026 trước 31/7/2026"
- NĐ 245/2026/NĐ-CP (27/6/2026) extends payment deadlines for VAT, CIT, PIT and land rent in 2026 for listed sectors and for small and micro enterprises. Extended VAT deadlines:
  - Period May 2026: by 20/11/2026.
  - Periods June–Sept 2026: by 21/12/2026. 20/12/2026 is a Sunday, so the date rolls forward.
  - Q2/2026: by 02/11/2026.
  - PIT for household businesses: extension of up to 05 months.
  — [xaydungchinhsach: NĐ 245/2026](https://xaydungchinhsach.chinhphu.vn/nghi-dinh-245-2026-nd-cp-gia-han-thoi-han-nop-thue-tien-thue-dat-trong-nam-2026-119260627180925528.htm)
- NĐ 252 defines the tax periods (kỳ tính thuế):
  - Per-transaction: the day the obligation arises.
  - Month: the calendar month.
  - Quarter: a calendar or fiscal quarter.
  - Year: a calendar or fiscal year.
  The finalization period (kỳ quyết toán) follows the accounting year, except PIT, which follows the calendar year. If a person is present in Vietnam fewer than 183 days in the calendar year but at least 183 days in 12 consecutive months, their first PIT year is those 12 months. — [xaydungchinhsach (NĐ 252 summary)](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-119260715155021635.htm)
- Điểm c khoản 5 Điều 10 NĐ 252 adds a deadline for that case: the first-year PIT finalization is due by the last day of the 4th month after the end of the 12-month period. — [LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-252-2026-nd-cp-ve-quan-ly-thue-565-110192-article.html)
- Điều 11 NĐ 252 adds 6 new cases where no return is required. One example: a Vietnamese party that withholds foreign-contractor VAT/CIT and files monthly does not need to file for a month with no withholding. — [LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-252-2026-nd-cp-ve-quan-ly-thue-565-110192-article.html)
- NĐ 252 deadlines for tax registration events:
  - First registration: 10 working days from the licence date. For a credit-institution branch, count from its opening date.
  - Change of registration information: 10 working days.
  - Individual changes of name, ID or birth date: 20 working days, or 30 in mountainous, border and island areas.
  - Suspension of business: notify at least 1 working day before. Each suspension lasts up to 12 months.
  - Closing the tax code: 10 working days after the termination document.
  - An income payer registering on behalf of its dependants: by 31/12 of the tax year.
  — [MISA AMIS](https://amis.misa.vn/279293/nghi-dinh-252-2026-nd-cp/); [MISA meInvoice](https://www.meinvoice.vn/tin-tuc/48321/nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue/)
- New holiday: from 2026, Ngày Văn hóa Việt Nam (24/11) is a day off with full pay. 24/11/2026 falls on a Tuesday. — [LuatVietnam, 05/11/2026](https://luatvietnam.vn/lao-dong-tien-luong/di-lam-ngay-van-hoa-viet-nam-24-11-2026-duoc-huong-bao-nhieu-tien-luong-562-115126-article.html); [xaydungchinhsach sidebar](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-119260715155021635.htm) ("Quốc hội quy định ngày 24/11 hằng năm là 'Ngày Văn hóa Việt Nam', người lao động được nghỉ làm việc và hưởng nguyên lương")

### Inferences
- Due-date algorithm for the app:
  1. Compute the nominal date.
     - Monthly: day 20 of month M+1.
     - Quarterly: last day of the first month of quarter Q+1 (30/4, 31/7, 31/10, 31/1).
     - Annual CIT and PIT finalization: last day of the 3rd month after year end (31/3 for a calendar year).
     - Per-transaction: 10th day after the obligation arises (baseline).
     - Cessation, dissolution or reorganisation: 45th day (baseline).
  2. If the nominal date is a Saturday, a Sunday, or a public holiday or Tết day, move it to the next working day.
  3. Payment deadline equals the filing deadline (baseline). Treat an extension decree's override, such as NĐ 245/2026, as a per-period override table.
- The holiday table must be data-driven, updated yearly from the Labour Code and Prime Minister's notices on lunar-calendar days such as Tết and 10/3 âm lịch. It must now include 24/11. The 2026 observed dates (02/11/2026 and 21/12/2026) confirm that the roll-forward rule is still applied under the new regime.

### Gaps
- **Baseline (unverified this session):** Luật 38/2019 Điều 44 deadlines:
  - Monthly: 20th of the following month.
  - Quarterly: last day of the first month of the next quarter.
  - Annual finalization: last day of the 3rd month after year end.
  - PIT finalization by individuals: last day of the 4th month.
  - Per-transaction: 10th day.
  - Cessation: 45th day.
  - Reorganisation: 45th day.
  Điều 55 Luật 38 sets payment no later than the filing deadline. Under Điều 55, provisional CIT is paid quarterly by the 30th of the month after the quarter, and the 4 quarterly payments must reach at least 80% of the annual liability (per NĐ 126/2020 Điều 8). Roll-forward to the next working day comes from Bộ luật Dân sự Điều 148 and Thông tư 80/2021. None of this could be re-fetched from primary text. Practice in 2026 (above) is consistent with it continuing. A follow-up should confirm the article numbers in Luật 108 and NĐ 252 Điều 10, ideally from the HTML on vbpl.vn or thuvienphapluat.
- The provisional CIT 80% rule and the quarterly CIT advance deadline under NĐ 252 were not verified.

## 3. Monthly vs quarterly filing criteria (VAT/PIT)

### Takeaway
The 50-billion-VND revenue threshold for monthly VAT filing appears to continue in 2026. A May 2026 report says household businesses with revenue above 50 billion VND must file VAT monthly. The specific NĐ 252 article for enterprises was not confirmed.

### Cited Findings
- Household businesses with revenue above 50 billion VND must file VAT monthly. — headline: Laodong.vn, 21/05/2026, "Hộ kinh doanh có doanh thu trên 50 tỉ đồng phải khai thuế GTGT theo tháng". The page was blocked or empty when fetched.
- NĐ 252 provides for quarterly tax periods based on calendar or fiscal quarters. — [xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-119260715155021635.htm)

### Inferences
- Implement this as a configurable rule. A taxpayer files quarterly if prior-year revenue from sales of goods and services is 50 billion VND or less, and monthly otherwise. A newly established enterprise defaults to quarterly and keeps that for the first 12 months.

### Gaps
- **Baseline (unverified this session):** NĐ 126/2020 Điều 9 set the following rules:
  - Quarterly VAT/PIT filing is allowed when prior-year revenue is 50 billion VND or less.
  - A newly established business files quarterly for its first 12 months.
  - A taxpayer that switches from monthly to quarterly must notify the tax authority (via form 01/GTGT or the return).
  - Once chosen, the period applies for the whole calendar year.
  The equivalent article in NĐ 252 (likely Điều 9 or 10) was not read, because the PDF is a scan. Verify before hard-coding.

## 4. Late payment interest and late-filing penalties

### Takeaway
Late payment interest (tiền chậm nộp) stays at 0.03% per day on the late tax amount under Luật 108. The taxpayer computes it; if they have not done so 30 days after paying the tax, the tax authority computes it and notifies them. Late-filing fines are set by NĐ 125/2020 Điều 13 as amended by NĐ 310/2025, in tiers by days late. The fines below are for organisations; individuals pay half.

### Cited Findings
- Late payment interest is 0.03% per day on the late amount. It applies to:
  - Payment after the deadline or after an extended deadline.
  - Supplementary returns that increase tax due or reduce exempted, refunded or uncollected amounts.
  - Under-declaration found by an authority.
  The taxpayer calculates and pays it. If 30 days after paying the tax it is still unassessed, the tax authority calculates it and notifies the taxpayer. — [xaydungchinhsach (Những điểm mới Luật 108, mục 7)](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm)
- No late interest accrues while tax debt is frozen (khoanh nợ). After the freeze ends, interest is charged in full from the original due date, except in cases the law excludes. No interest accrues during an outage of the tax authority's IT system. — [same source](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm)
- Late-filing fines under Điều 13 NĐ 125/2020, as amended by khoản 10 Điều 1 NĐ 310/2025:

  | Days late | Penalty (organisation) | Remedy |
  |---|---|---|
  | 1–5, with mitigating circumstances | Warning (cảnh cáo) | Pay late interest |
  | 1–30, other cases | 2–5 million VND | Pay late interest |
  | 31–60 | 5–8 million VND | Pay late interest |
  | 61–90; or 91+ with no tax due; or return never filed with no tax due; or missing transfer-pricing appendices to the CIT finalization | 8–15 million VND | Pay late interest; file the return or appendices |
  | Over 90, with tax due, and tax plus interest paid before an audit decision or violation record | 15–25 million VND | — |

  Fines for individuals are 1/2 of the organisation amount (NĐ 125 Điều 5.5 and Điều 7.4). — [CafeF / An ninh tiền tệ, 29/07/2026](https://cafef.vn/chi-con-2-ngay-de-ca-nhan-ho-kinh-doanh-thuc-hien-ngay-viec-sau-de-tranh-bi-phat-tien-len-den-25-trieu-dong-188260729110807743.chn)
- NĐ 310/2025 other changes:
  - "cùng một thời điểm" becomes "cùng một ngày". If several returns for the same tax type are filed late on the same day, only one violation is fined, at the highest bracket. If several invoice reports of the same type are filed late on the same day, the same rule applies.
  - Repeated violations are no longer an aggravating factor in these cases.
  - Fines for issuing invoices at the wrong time are set by the number of invoices.
  - The deadline for an electronic violation record is now 3 working days after acceptance of an e-filed return; it was 1 working day.
  — [LuatVietnam: Điểm mới NĐ 310](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-nghi-dinh-310-nd-cp-ve-xu-phat-vi-pham-thue-hoa-don-565-105729-article.html)
- NĐ 310 effective date: fines by number of invoices apply "từ 16/1/2026". — headline: baochinhphu.vn, 16/01/2026, "Từ 16/1/2026, xử phạt theo số lượng hóa đơn vi phạm"; xaydungchinhsach, 16/01/2026, "Những điểm mới trong quy định xử phạt về thuế, hóa đơn từ tháng 1/2026"
- NĐ 252: if a tax debt is more than 90 days overdue and the taxpayer does not pay voluntarily, the system publishes the taxpayer automatically every month (điểm c khoản 3 Điều 4). — [LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-252-2026-nd-cp-ve-quan-ly-thue-565-110192-article.html)
- NĐ 252 exit bans for tax debt overdue 120 days or more:
  - Individual or household business owners: debt of 50 million VND or more.
  - Legal representatives or beneficial owners of enterprises: debt of 500 million VND or more.
  The authority sends notice 30 days in advance. — [MISA AMIS](https://amis.misa.vn/279293/nghi-dinh-252-2026-nd-cp/)

### Inferences
- Late interest formula: `interest = Σ over each late amount of amount × 0.0003 × days`. Count days from the day after the due date up to and including the payment date (baseline counting convention). Exclude extension periods, freeze periods and system-outage days. Weekends and holidays are not excluded once the due date has passed. Late interest must be versioned by due date; the rate was 0.03% from 01/7/2016 under Luật 106/2016 and remains 0.03% under Luật 108.
- Penalty helper: map days late to a tier and show the fine range. The app should not compute a single fine, because the amount depends on mitigating or aggravating factors (the midpoint is the default). Halve the amounts for household businesses and individuals.
- Reminders: the 90-day overdue publication and the 120-day exit-ban thresholds make useful escalation reminders.

### Gaps
- The exact date and number of NĐ 310/2025 (issued around early 12/2025) and its effective date were confirmed only from headlines (16/01/2026). It is not confirmed whether 2026 rules changed late-interest counting conventions, such as the start day and the 30-day assessment rule.
- The rule that late interest may not exceed the principal tax (in some cases under the old Điều 59) was not checked.

## 5. Electronic filing (eTax) and XML formats

### Takeaway
Filing is electronic through the tax authority's portal and eTax Mobile. Luật 108 requires all tax transactions to be electronic by 01/01/2027. No 2026 primary source on XML schemas was found.

### Cited Findings
- The tax authority must build and upgrade its IT systems so that all tax e-transactions are done electronically before 1/1/2027. — [VietNamNet](https://vietnamnet.vn/9-diem-moi-cua-luat-quan-ly-thue-2025-hieu-luc-tu-1-7-nguoi-nop-thue-can-biet-2531043.html)
- The tax-administration IT system is centralised and integrated. It provides end-to-end online public services and keeps a history of all transactions. Taxpayers may look up, view, print and use e-documents they sent, and receive debt notices through their e-transaction account. — [xaydungchinhsach (Những điểm mới Luật 108, mục 14–15)](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm)
- Household businesses file Q3/2026 returns on eTax Mobile. — [VietnamFinance](https://vietnamfinance.vn/huong-dan-khai-thue-quy-3-2026-tren-etax-mobile-ho-kinh-doanh-can-lam-truoc-31-10-d151761.html)
- For household and individual businesses that use e-invoices or cash-register e-invoices, the system auto-generates a draft return from invoice data. — [xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-noi-dung-trong-tam-cua-luat-quan-ly-thue-so-108-2025-qh15-119260713105610538.htm)

### Inferences
- If the app exports returns, it should generate XML compatible with the GDT's HTKK/eTax schema, versioned per form template (mẫu tờ khai). Forms will likely be re-issued under TT 89/2026, so the schema version must be configurable.

### Gaps
- No source was retrieved on the current HTKK version, the XSD for TT 89/2026 forms, or whether thuedientu.gdt.gov.vn has been replaced by a unified eTax portal (canthue / etax). **Baseline (unverified):** the GDT publishes HTKK desktop software and XML schema packages for each form (for example 01/GTGT, 05/KK-TNCN, 03/TNDN, 03/TNDN-QT) on gdt.gov.vn. Check gdt.gov.vn → "Hỗ trợ" → "Ứng dụng HTKK" directly.

## 6. Annual financial statements (BCTC): submission deadline to tax and statistics offices

### Takeaway
No 2026 primary source was retrieved in this session. The baseline is that the annual BCTC is submitted with the CIT finalization by the last day of the 3rd month after year end (31/3 for a calendar year).

### Cited Findings
- The CIT finalization period follows the accounting year (kỳ kế toán năm), per NĐ 252. — [xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-119260715155021635.htm)

### Inferences
- The BCTC reminder should share the CIT finalization due date, with the same roll-forward rule.

### Gaps
- **Baseline (unverified this session):** Luật Kế toán 88/2015 Điều 29–30 and TT 200/2014 Điều 109, as successor rules under TT 99/2025/TT-BTC (effective 01/01/2026 — verify), require:
  - Private enterprises and partnerships: 30 days after year end.
  - Other enterprises: 90 days.
  - State-owned enterprises: 30 days for the company itself, 90 days for a group's consolidated BCTC.
  - The BCTC goes to the tax authority, the statistics office and the business-registration authority.
  - TT 133/2016 (SMEs): 90 days.
  The BCTC is filed with the CIT finalization (Luật 38 Điều 44; NĐ 126 Điều 8). Separately, the statistics office receives an electronic BCTC file per the statistics law. These rules must be re-verified against TT 99/2025 and NĐ 252 before coding.

## 7. Retention periods for accounting documents

### Takeaway
No retention sources were fetched in this session; the baseline is below. The new 5-year supplementary-return window under Luật 108 is shorter than any accounting retention period, so retention stays governed by accounting law.

### Cited Findings
- The supplementary-return window is 5 years from the filing deadline. — [LuatVietnam](https://luatvietnam.vn/tin-van-ban-moi/chinh-sach-moi-ve-thue-co-hieu-luc-hom-nay-01-7-2026-186-109976-article.html)

### Inferences
- Retention settings should be at least: 10 years for vouchers used directly for bookkeeping, ledgers and annual BCTC; at least 5 years for management documents; permanent for specified records. Data purges should be blocked inside these windows.

### Gaps
- **Baseline (unverified this session):** Luật Kế toán 88/2015 Điều 41 and NĐ 174/2016 Điều 12–14 set:
  - At least 5 years for documents used for management and operations that are not used directly for bookkeeping.
  - At least 10 years for vouchers used directly for bookkeeping and preparing BCTC, accounting books, annual BCTC and audit reports.
  - Permanent retention for documents of historical or economic significance.
  The retention period starts at the end of the accounting year (or after the end of finalization). Electronic records must be readable for the retention period. These rules were not re-checked for 2025–2026 amendments, including a possible amended Luật Kế toán.
