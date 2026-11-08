# Thuế GTGT và hóa đơn điện tử — quy định hiệu lực năm 2026 (as of 07/11/2026)

> Research method note: WebSearch/WebFetch tools were unavailable in this session; sources were retrieved by direct HTTP fetch of full texts, mainly LuatVietnam full-text pages (consolidated text with "sửa đổi bởi" annotations) and a few practitioner sites. thuvienphapluat.vn blocked automated access (Cloudflare), so TVPL URLs below were not read. All article numbers below were checked against the fetched full text unless marked [UNVERIFIED].
>
> **Headline for implementers:** the legal base changed TWICE in 13 months:
> 1. **01/7/2025**: new VAT Law 48/2024/QH15 + NĐ 181/2025/NĐ-CP + TT 69/2025/TT-BTC (TT 219/2013 repealed); 8% reduction under NQ 204/2025/QH15 + NĐ 174/2025/NĐ-CP starts. (E-invoice: NĐ 123/2020 as amended by NĐ 70/2025, effective 01/6/2025, + TT 32/2025/TT-BTC.)
> 2. **01/01/2026**: Law 149/2025/QH15 amends VAT law; TT 99/2025/TT-BTC chart of accounts replaces TT 200.
> 3. **01/7/2026**: new Law on Tax Administration 108/2025/QH15 + **NĐ 252/2026/NĐ-CP** (tax admin) + **TT 89/2026/TT-BTC** (new 01/GTGT, replaces TT 80/2021 forms) + **NĐ 254/2026/NĐ-CP** (e-invoices, **repeals NĐ 123/2020 and NĐ 70/2025**) + **TT 91/2026/TT-BTC** (e-invoices, **repeals TT 32/2025**).
> So the user's premise (NĐ 70/2025 + TT 32/2025, TT 80/2021 forms) is **outdated for periods from 01/7/2026**. App must support both regimes by date (periods before vs. from 01/7/2026).

## 1. VAT Law 48/2024/QH15, NĐ 181/2025/NĐ-CP, TT 69/2025/TT-BTC (+ amendments): rates, non-taxable changes, deduction conditions, refunds, tax point

### Takeaway
Rates remain 0% / 5% / 10%; bulbs and thermos fall in the 10% default band. From 01/7/2025, input VAT on purchases **from 5 million VND (VAT-inclusive)** requires a non-cash payment document (threshold cut from 20 million); non-deductible input VAT is expensable except on ≥5m purchases paid in cash. Tax point for goods = transfer of ownership/right of use, regardless of payment. NĐ 181 has itself been amended by NĐ 144/2026/NĐ-CP (pro-rata allocation and Art. 26.2.g).

### Cited Findings
- NĐ 181/2025/NĐ-CP (dated 01/7/2025) is the decree detailing Law 48/2024/QH15; guided by TT 69/2025/TT-BTC (dated 01/7/2025). Both effective 01/7/2025 alongside the Law. — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html); [LuatVietnam TT 69](https://luatvietnam.vn/thue/thong-tu-69-2025-tt-btc-huong-dan-luat-thue-gtgt-theo-nghi-dinh-181-2025-nd-cp-404453-d1.html)
- NĐ 181 structure relevant to app: Art. 17–18 (0% rate and conditions), Art. 19 (5% list), Art. 20 (credit method formula), Art. 21 (who uses credit method), Art. 23 (deduction principles), Art. 25 (invoices/payment docs), **Art. 26 (non-cash payment documents)**, Art. 27–28 (export/special deduction conditions), Art. 29–37 (refunds), Art. 38 (effect), Art. 39 (transition). — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html)
- **Non-cash threshold (Art. 26 NĐ 181):** "Cơ sở kinh doanh phải có chứng từ thanh toán không dùng tiền mặt đối với hàng hóa, dịch vụ mua vào (bao gồm cả hàng hóa nhập khẩu) từ 05 triệu đồng trở lên đã bao gồm thuế giá trị gia tăng." Non-cash document = per NĐ 52/2024/NĐ-CP on non-cash payments, **excluding** cash deposited by buyer into seller's account (Art. 26.1). — same source
- Art. 26.2 special cases: offset of purchases vs sales/borrowed goods (needs contract clause + bilateral reconciliation minutes; 3-party minutes if via third party); offset via loans (written loan contract + bank transfer); payment via authorized third party (must be stated in written contract); payment in shares/bonds (written contract); **residual paid in cash ≥5m after offsets → not deductible** (Art. 26.2.đ); payment to State Treasury account under enforcement → deductible. — same source
- Art. 26.2.g deferred/instalment purchases ≥5m: deductible on contract + VAT invoice even before payment due; if at the contractual payment date there is no non-cash document, **reduce deducted input VAT in the period the payment obligation arises**. Art. 26.2.h: purchases <5m per invoice (VAT-inclusive), imports <5m per shipment, and imported free gifts/samples need no non-cash document. Note: point g has been amended by Art. 4 NĐ 144/2026/NĐ-CP (amended text not retrieved). — same source
- Art. 23 NĐ 181 key deduction rules: input VAT for taxable business fully deductible including uncompensated losses/natural shrinkage (23.1); mixed taxable/non-taxable use → deduct only taxable share, allocate by revenue ratio if not separable (23.2, point a amended and point c added by NĐ 144/2026/NĐ-CP); input VAT arising in month/quarter is deductible in that period whether goods are used or still in stock; excess carried forward (23.5); **errors/omissions in input VAT may be declared any time before a tax audit/inspection decision is announced** — supplementary declaration for the original period if it increases tax payable, otherwise in the period of discovery (23.6); goods used for gifts, promotion, advertising → input VAT deductible (23.7); **non-deductible input VAT may be charged to CIT expense or capitalized, except VAT on purchases ≥5m without non-cash payment** (23.16; same exception in 23.11 on switching to direct method). — same source
- Credit (khấu trừ) method is mandatory for businesses with annual revenue ≥ 1 billion VND that keep full accounting/invoices (Art. 21.1 NĐ 181); revenue measured from Nov prior year to Oct current year on VAT returns; enterprises <1bn may voluntarily register (21.2). — same source
- Tax point (time of VAT determination): NĐ 181 Art. 15–16 regulate exports/imports and special sectors (telecom, electricity, water, insurance, real estate, construction). For ordinary goods the e-invoice decree mirrors the rule: invoice time for sale of goods "là thời điểm chuyển giao quyền sở hữu hoặc quyền sử dụng hàng hóa cho người mua, không phân biệt đã thu được tiền hay chưa" (NĐ 254/2026 Art. 9.1); for services = completion of service, or time of collection if collected in advance (Art. 9.2); each partial delivery requires its own invoice (Art. 9.3). — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html); [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html)
- **Law 149/2025/QH15** (passed 11/12/2025, effective **01/01/2026**) amends Law 48/2024 (already amended by Law 90/2025/QH15): (i) Art. 5.1 — enterprises/co-ops buying unprocessed agricultural/aquatic products and reselling to other enterprises/co-ops do not declare/pay VAT but **may deduct input VAT**; (ii) Art. 5.25 — household/individual exemption threshold raised from 200m to 500m VND/yr; (iii) Art. 9.5 — recovered scrap/by-products take the rate of that scrap item; (iv) repeals Art. 12.3 (household lump-sum/khoán) and Art. 15.9.c (refund condition that the seller must have declared/paid VAT on invoices issued to the claimant). — [LuatVietnam Luật 149/2025/QH15](https://luatvietnam.vn/thue/luat-thue-gia-tri-gia-tang-sua-doi-2025-so-149-2025-qh15-421739-d1.html)
- **Law 09/2026/QH16** (passed 24/4/2026; Art. 1–3 retroactive from 01/01/2026) further amends Art. 5.25: household/individual VAT exemption threshold becomes "mức quy định của Chính phủ" (Government sets the figure). — [LuatVietnam Luật 09/2026/QH16](https://luatvietnam.vn/thue/luat-thue-sua-doi-2026-so-09-2026-qh16-434729-d1.html)
- Practitioner index of TT 69/NĐ 181 topics (0% subjects, 5% list, non-taxable list from 01/7/2025) — [Kế toán Thiên Ưng](https://ketoanthienung.vn/quy-dinh-ve-luat-thue-gia-tri-gia-tang-moi-nhat-nam-2014.htm)

### Inferences
- For the bulbs/thermos trader: standard rate 10% (temporarily 8%, see §2). No 5% or exemption applies; 0% only for exports meeting Art. 17–18 NĐ 181.
- App rule: flag any purchase invoice with total (incl. VAT) ≥ 5,000,000 VND whose payment is cash (or cash deposit to seller account) → input VAT non-deductible AND not expensable (must go to non-deductible-for-CIT). For invoices dated before 01/7/2025 the threshold was 20,000,000 (old TT 219 rule, see ketoanthienung page below).
- Multiple same-day purchases from one supplier summing ≥ threshold: the old TT 219 rule (aggregate same-day) is not visible in Art. 26 NĐ 181 text retrieved; treat as uncertain (see Gaps).
- App should store payment method and payment date per purchase invoice, and for deferred payment raise a reversal task at contractual due date if unpaid by non-cash means.

### Gaps
- Exact text of NĐ 144/2026/NĐ-CP amendments (Art. 23.2.a, 23.2.c, 26.2.g) not retrieved.
- Law 48/2024 article text itself (Art. 8 tax point, Art. 9 rates, Art. 14 deduction conditions) not fetched directly; references rely on NĐ 181/NĐ 254 wording.
- Whether the old "multiple purchases from same supplier in one day aggregated" rule survives under NĐ 181 — not confirmed.
- Government-set household exemption threshold under Law 09/2026 — figure not retrieved (not core for a credit-method company).

## 2. 8% VAT reduction — NQ 204/2025/QH15 and NĐ 174/2025/NĐ-CP

### Takeaway
NĐ 174/2025/NĐ-CP (30/6/2025) applies the 8% rate from **01/7/2025 to 31/12/2026** to goods/services normally at 10%, except telecom, finance/banking/securities/insurance, real estate, **basic metal products (VSIC 24)**, mining products (except coal), and SCT goods (except petrol). Bulbs and thermos/vacuum flasks are not in the exclusion appendices, so they qualify for 8%. Invoice shows "8%" on the rate line; a Phụ lục (Mẫu 01, Phụ lục III NĐ 174) is filed with the VAT return.

### Cited Findings
- Art. 2.1 NĐ 174: "Nghị định này có hiệu lực thi hành từ ngày 01 tháng 7 năm 2025 đến hết ngày 31 tháng 12 năm 2026." Based on NQ 204/2025/QH15 dated 17/6/2025. — [LuatVietnam NĐ 174](https://luatvietnam.vn/thue/nghi-dinh-174-2025-nd-cp-chinh-sach-giam-thue-gtgt-theo-nghi-quyet-204-2025-qh15-404331-d1.html); [Báo Chính phủ](https://baochinhphu.vn/giam-thue-gia-tri-gia-tang-tu-01-7-2025-den-het-31-12-2026-10225070118590677.htm)
- Art. 1.1: reduction applies to goods/services currently at 10% except (a) telecom, finance, banking, securities, insurance, real estate, metal products, mining products (except coal) — Phụ lục I; (b) SCT goods/services (except petrol) — Phụ lục II. Applied uniformly at import, production, processing and trading stages. Items in the appendices that are exempt or 5% keep Law treatment. — same source
- Phụ lục I manufacturing section lists only code **24 "Sản phẩm kim loại"** (iron/steel basic products 241xxx, non-ferrous & precious metals 2420xx, metal casting 243) plus mining codes 06/07/08/089, telecom 61, finance 64–66, real estate 68. (Fetched text shows no codes 25–33, i.e. fabricated metal products, electrical equipment and household goods are not excluded.) — same source
- Phụ lục II (SCT list) for 2026 includes tobacco, alcohol, beer, motor vehicles <24 seats, motorcycles >125cc, aircraft/yachts, air-conditioners 24,000–90,000 BTU, playing cards, votive paper, sugary drinks >5g/100ml; services: discotheques, massage/karaoke, casino, betting, golf, lottery. — same source
- Art. 1.2: credit-method businesses apply 8%; revenue-% (direct) method businesses get a 20% reduction of the % rate. — same source
- Art. 1.3.a: on VAT invoices write "8%" on the VAT-rate line, the VAT amount and total payable; seller declares output VAT and buyer deducts input VAT at the reduced amount on the invoice. Art. 1.3.b: direct-method sales invoice — "Thành tiền" full pre-reduction amount; "Cộng tiền hàng hóa, dịch vụ" reduced by 20% of the % rate; note "đã giảm... (số tiền) tương ứng 20% mức tỷ lệ % để tính thuế giá trị gia tăng theo Nghị quyết số 204/2025/QH15". — same source
- Art. 1.4: invoices mixing rates must show the rate of each line item. Art. 1.5: if invoiced/declared at unreduced rate, seller and buyer process the invoice per invoice law (adjust/replace) and both adjust declarations. Art. 1.6: declare reduced goods on **Mẫu số 01, Phụ lục III NĐ 174** together with the VAT return. — same source

### Inferences
- Bóng đèn (lighting equipment, VSIC 27) and phích nước/bình giữ nhiệt (VSIC 22/23/25/32 depending on material) are not VSIC 24 basic metals, not SCT, not excluded → **8% from 01/7/2025 to 31/12/2026**; revert to 10% for invoices dated from 01/01/2027 unless extended. App should drive the rate from invoice date + product "reduction-eligible" flag.
- On the 01/GTGT return, 8% sales have no separate line; standard practice (from earlier NĐ 15/2022, 44/2023, 72/2024 reductions) is to report them on the 10% lines [32]/[33] with tax at the actual 8% amount and attach the reduction appendix. Treat as practice-based (see Gaps).
- A stainless-steel thermos is a fabricated metal article, not a "sản phẩm kim loại" in VSIC 24 sense; residual risk exists if a tax officer classifies by material. Mark as low-moderate uncertainty.

### Gaps
- No evidence found (as of 07/11/2026) of an extension of the 8% rate into 2027; practitioner headline "Thuế GTGT 8% hết hạn 31/12/2026" seen in search results only (page not retrieved). Re-check before 01/01/2027.
- Official instruction on how 8% lines map into the new TT 89/2026 01/GTGT not retrieved.
- Phụ lục III Mẫu 01 column layout not extracted.

## 3. Direct (revenue %) method — rates and who must use it

### Takeaway
Revenue-% rates: **1%** distribution/supply of goods, **5%** services/construction without materials/leasing, **3%** production, transport, services attached to goods, construction with materials, **2%** other activities (TT 69/2025 Phụ lục I, under Law Art. 12.2.b). Businesses with revenue <1bn (non-registrants), households and individuals use it; a trading company ≥1bn must use the credit method.

### Cited Findings
- TT 69/2025 Art. 5 + Phụ lục I: group list under point b Art. 12.2 Law; mixed businesses declare per % rate; if revenue per rate cannot be separated, apply the highest rate [text truncated in fetch, rule standard]. — [LuatVietnam TT 69](https://luatvietnam.vn/thue/thong-tu-69-2025-tt-btc-huong-dan-luat-thue-gtgt-theo-nghi-dinh-181-2025-nd-cp-404453-d1.html)
- Phụ lục I TT 69: 1% — wholesale/retail of all goods (except agency at fixed price for commission), sales bonuses/discounts paid to lump-sum households; 5% — accommodation, logistics support, post, brokerage/agency commission, legal/accounting/tax consulting, IT/data, office support, repairs of household goods, construction design/supervision, construction without materials, asset leasing, other 10% services; 3% — production/processing, mining, freight/passenger transport, services attached to goods sales, F&B, repair of machinery/vehicles, construction with materials, other 10% activities; 2% — production of 5%-rate products and other activities. — same source
- Credit method mandatory at ≥1bn annual revenue (Art. 21.1 NĐ 181); <1bn may opt in. Under NĐ 174 direct-method sellers get 20% off the % rate until 31/12/2026 (e.g. 1% → 0.8% for goods trading). — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html); [LuatVietnam NĐ 174](https://luatvietnam.vn/thue/nghi-dinh-174-2025-nd-cp-chinh-sach-giam-thue-gtgt-theo-nghi-quyet-204-2025-qh15-404331-d1.html)
- Gold/silver/gems trading uses the separate direct-on-value-added method (NĐ 181 Art. 22). — same NĐ 181 source

### Inferences
- If the app supports a direct-method entity, it issues "hóa đơn bán hàng" (mẫu 2) and computes VAT = revenue × 1% (0.8% during reduction) for goods trading; no TK 133 is used.

### Gaps
- Point b Art. 12.2 Law text (full list of who must use direct method beyond revenue threshold) not fetched directly.

## 4. VAT return 01/GTGT — current form, indicators, monthly vs quarterly

### Takeaway
For tax periods **from 01/7/2026**, 01/GTGT is the form in **Phụ lục II? (annex) of TT 89/2026/TT-BTC** (guiding Law 108/2025/QH15 and NĐ 252/2026/NĐ-CP), replacing TT 80/2021 forms; periods before 01/7/2026 use old forms. Quarterly filing allowed if prior-year revenue ≤ 50 billion VND (unchanged). The new form keeps the [21]–[43] skeleton but adds [32b] and [34a] and changes the [27]/[34] formulas.

### Cited Findings
- TT 89/2026/TT-BTC "quy định chi tiết Luật Quản lý thuế và Nghị định 252/2026/NĐ-CP"; luatvietnam full text. — [LuatVietnam TT 89](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html)
- Monthly vs quarterly (TT 89/2026 Art. 19.1.b): monthly filers with prior-year total revenue ≤ 50 billion VND may choose quarterly; revenue = total revenue on VAT returns of the calendar year; new businesses may choose quarterly; choice fixed for full calendar year; switching monthly→quarterly requires form **01/ĐK-TĐKTT** by **31 January** of the first quarterly year; if found ineligible, refile monthly for prior quarters and pay late interest. — same source
- Per-transaction filing (Art. 19.1.c) includes credit-method taxpayers with construction works ≥ 1bn incl. VAT in another province, etc. Separate filing for dependent units in other provinces (Art. 19.2.b). — same source
- 01/GTGT indicators in TT 89/2026 (from fetched form): header [01a] activity type, [01b] period, [02] first filing, [03] supplementary no., [04]–[11c] taxpayer/agent/dependent-unit info. Body: **[21]** no purchases/sales in period (checkbox); **[22]** VAT credit brought forward; **[23]/[24]** value/VAT of purchases, of which imports **[23a]/[24a]**; **[25]** deductible input VAT this period; **[26]** sales not subject to VAT; **[27]/[28]** taxable sales and output VAT with **[27]=[29]+[30]+[32]+[32a]−[32b]; [28]=[31]+[33]**; **[29]** 0%; **[30]/[31]** 5%; **[32]/[33]** 10%; **[32a]** sales not required to declare/pay VAT; **[32b]** sales not included in VAT taxable price (new); **[34a]** sales outside the scope of VAT law (new); **[34]=[26]+[27]+[34a]; [35]=[28]**; **[36]=[35]−[25]**; **[37]** adjustment decrease / **[38]** adjustment increase of prior-period credits; **[39a]** VAT credit received on handover; **[40a]=([36]−[22]+[37]−[38]−[39a]) ≥ 0**; **[40b]** investment-project VAT offset (≤[40a]); **[40]=[40a]−[40b]** payable; **[41]=([36]−[22]+[37]−[38]−[39a]) ≤ 0** uncredited; **[42]** refund requested (≤[41]); **[43]=[41]−[42]** carried forward. — same source (form text extracted from annex)
- Transition (practitioner summary, Art. 100 TT 89/2026): returns for periods before 01/7/2026 use old forms; from period July 2026 / Q3-2026 use new form; if the tax system has not been updated, taxpayers may keep the old e-format until the tax authority announces uniform application (Art. 100.8). Deadline example: July 2026 return by 20/8/2026; Q3-2026 by 30/9/2026 per that article. — [ANC Việt Nam](https://ancvietnam.com/2026/08/13/thue-gtgt-2026-huong-dan-nop-to-khai-01-gtgt-moi-va-quy-dinh-chuyen-tiep/)
- Caution: the ANC article's indicator descriptions ([26]=non-taxable, [27]/[28]) partly match but its listing is simplified and possibly AI-generated; its Q3 deadline "30/9/2026" conflicts with the standard quarterly deadline (last day of the first month of the following quarter, i.e. 31/10/2026). Prefer the form text in TT 89. — [ANC Việt Nam](https://ancvietnam.com/2026/08/13/thue-gtgt-2026-huong-dan-nop-to-khai-01-gtgt-moi-va-quy-dinh-chuyen-tiep/) contradicted by standard Law on Tax Administration deadlines [UNVERIFIED against Law 108/2025 text]

### Inferences
- Indicator code changes vs TT 80/2021: [32b] meaning and [34a] are new; [27] now subtracts [32b] and [34] adds [34a]. The old [37]/[38] semantics (adjust decrease/increase) retained. App should version the form by period start date (≥ 07/2026 → TT 89 layout).
- Bảng kê mua vào/bán ra (old 01-1/GTGT, 01-2/GTGT) has not been required since TT 80/2021; nothing in fetched TT 89 Art. 19 reinstates it. Only appendices: reduction appendix (NĐ 174 Mẫu 01) and allocation appendices for multi-province units. App can still produce internal purchase/sales listings for reconciliation.
- Deadlines (standard, Law on Tax Administration): monthly — 20th of following month; quarterly — last day of first month of following quarter [UNVERIFIED in Law 108/2025 text this session].

### Gaps
- Exact annex/form number label of 01/GTGT in TT 89 and its row-level guidance for 8% sales not confirmed.
- Law 108/2025/QH15 filing deadline articles not fetched.
- NĐ 252/2026/NĐ-CP text not fetched (Art. 11 non-filing cases, Art. 15 allocation).

## 5. Journal entries (TT 99/2025/TT-BTC, effective 01/01/2026, replacing TT 200)

### Takeaway
TT 99/2025 keeps TK 133 (1331 goods/services, 1332 fixed assets) and TK 3331 (33311 output VAT, 33312 import VAT). Entries are substantively unchanged from TT 200.

### Cited Findings
- TK 133 has two sub-accounts: 1331 (deductible VAT on goods/services) and 1332 (deductible VAT on fixed assets/investment property) — Phụ lục II Section B TT 99/2025. — [Kế toán Lê Ánh](https://ketoanleanh.edu.vn/kinh-nghiem-ke-toan/tai-khoan-133-thue-gtgt-duoc-khau-tru-theo-thong-tu-99-2025-tt-btc.html); [MISA SME](https://sme.misa.vn/345677/hach-toan-thue-gtgt/)
- Purchase: Nợ 152/153/156/211/213/217 (net), Nợ 133 (1331/1332), Có 111/112/331. Expenses used immediately: Nợ 241/242/621/623/627/641/642/632, Nợ 1331, Có 111/112/331. — same sources
- Import: Nợ 152/153/156/211 / Có 3333 (import duty), 3332, 33381, 111/112/331; deductible import VAT: **Nợ 133 / Có 33312**; non-deductible import VAT: Nợ 152/156/211 / Có 33312; pay: Nợ 33312 / Có 111/112. — same sources
- Purchase returns/discounts: Nợ 111/112/331 / Có 133 / Có 152/153/156/211 (net). — [Kế toán Lê Ánh](https://ketoanleanh.edu.vn/kinh-nghiem-ke-toan/tai-khoan-133-thue-gtgt-duoc-khau-tru-theo-thong-tu-99-2025-tt-btc.html)
- Non-deductible input VAT reclass (mixed use or ineligible): **Nợ 152/156/211/627/632/641/642 / Có 1331**. Shortage awaiting decision: Nợ 1381 / Có 133. — same sources
- Sales: Nợ 111/112/131 / Có 511/515/711 (net) / **Có 33311**. — [MISA SME](https://sme.misa.vn/345677/hach-toan-thue-gtgt/)
- Period-end offset: Nợ 33311 / Có 133 by the smaller amount; remaining credit on 133 carries forward or is refunded (refund received: Nợ 111/112 / Có 1331). Payment: Nợ 3331 / Có 111/112. VAT reduction/exemption granted: Nợ 33311 or 111/112 / Có 711. — same source
- Direct method: either credit 33311 at invoicing, or record revenue gross and periodically Nợ 511 / Có 33311; TK 133 not used. — same source

### Inferences
- Sales returns/allowances from customers: Nợ 511 (or the revenue-deduction account per TT 99) + Nợ 33311 / Có 131/111/112, based on the seller's adjustment invoice (TT 91/2026 Art. 10.5.c.1). Whether TT 99 still uses TK 521 sub-accounts was not verified in this session — check the TT 99 chart (see Gaps).
- Commercial discount by volume: reduce on last invoice or issue adjustment invoice with listing (TT 91 Art. 10.5.b); entry mirrors returns.

### Gaps
- TT 99/2025 treatment of TK 521 (chiết khấu thương mại, hàng bán bị trả lại, giảm giá) not confirmed.
- TT 99 primary text not fetched (only practitioner summaries).

## 6. E-invoices — rules from 01/7/2026 (NĐ 254/2026/NĐ-CP + TT 91/2026/TT-BTC), with 2025 background

### Takeaway
From **01/7/2026**, NĐ 254/2026/NĐ-CP (dated 30/6/2026, guiding Law 108/2025/QH15) **repeals NĐ 123/2020, Art. 1 NĐ 41/2022 and NĐ 70/2025**; TT 91/2026/TT-BTC **repeals TT 32/2025**. Symbol format unchanged (1 digit form + 6 characters, e.g. 1C26TAA). Wrong invoices: minor non-amount errors → notify buyer + send **04/SS-HĐĐT** (no re-issue); errors in MST, goods, amount, rate or tax → **adjust or replace** (no 04/SS needed), with prior written agreement for business buyers. Returns → seller issues adjustment invoice. Cash-register invoices (symbol M) must be replaced, not adjusted.

### Cited Findings
- NĐ 254/2026 Art. 43: effective 01/7/2026; from that date NĐ 123/2020, Art. 1 NĐ 41/2022 and NĐ 70/2025 cease effect; tax-authority pre-printed paper invoices lose validity and must be destroyed. Paper receipts usable until 31/12/2026 (Art. 44.2). — [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html)
- TT 91/2026 Art. 25: effective 01/7/2026; TT 32/2025/TT-BTC (31/5/2025) ceases effect; Phụ lục I–IV mandatory, Phụ lục V (display templates) reference only. — [LuatVietnam TT 91](https://luatvietnam.vn/thue/thong-tu-91-2026-tt-btc-quy-dinh-luat-quan-ly-thue-va-hoa-don-dien-tu-439780-d1.html)
- **Invoice symbol (TT 91 Art. 4 + Phụ lục I):** ký hiệu mẫu = 1 digit 1–9 (1 VAT invoice, 2 sales invoice, 3 public asset, 4 national reserve, 5 stamps/tickets/cards/receipts, 6 internal transfer/consignment delivery notes, 7 commercial invoice, 8 VAT invoice integrated with fee receipt, 9 sales invoice integrated with fee receipt). Ký hiệu = 6 chars: char 1 **C** (with tax-authority code) or **K** (without); chars 2–3 = last two digits of year (2026 → 26); char 4 = type letter **T** (registered by business), **D** (public asset/reserve/special invoices lacking some fields), **L** (issued per occurrence by tax authority), **M** (cash register), **N** (internal transfer note), **B** (consignment note), **G**/**H** (stamps/tickets as VAT/sales invoice), **X** (commercial invoice), **F** (VAT invoice cum refund declaration — new); chars 5–6 seller-defined letters, **YY** if no need. Examples: "1C26TAA", "2C26TBB", "1K26TYY", "6K26NAB", "7K26XAB". Shown top-right of invoice. — same source
- **Numbering (NĐ 254 annex):** invoice number = Arabic numerals max 8 digits, **starting at 1 on 01/01 (or first use date) and ending 31/12 each year, max 99 999 999**, sequential ascending within the same symbol + form symbol. If not issued in that pattern, system must ensure increase over time, single use, max 8 digits. — [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html)
- **Required content (NĐ 254 Art. 10.1):** invoice name, symbol, form symbol; number; seller name/address/MST; buyer name/address/MST **or budget-relation code or personal ID number**; item name, unit, quantity, unit price, amount before VAT, VAT rate, VAT total per rate, total VAT, total payment; seller signature (buyer digital signature not required unless agreed); invoice date (Art. 9); digital-signing time; tax-authority code (if coded); fees, commercial discount, promotions (if any). Art. 10.5 allows logos, contract/order/customer code etc. — same source
- **Cash-register invoices (NĐ 254 Art. 6.1.c, 10.4):** businesses selling directly to consumers (malls, supermarkets, retail except vehicles, F&B, restaurants, hotels, passenger transport, entertainment, personal services...) use e-invoices generated from cash registers connected to the tax authority; if already registered for regular coded/non-coded e-invoices, cash-register registration not mandatory. Content: seller name/address/MST; buyer name/address/MST/ID/phone if requested; items, unit price, quantity, payment amount — **credit-method sellers must show pre-VAT price, VAT rate, VAT amount, total**; time; tax code or electronic data for lookup; delivery by SMS/email/link/QR. Households/individuals with revenue >1bn must use coded or cash-register e-invoices (6.1.d). — same source
- Use categories (NĐ 254 Art. 6.1.a–b): coded e-invoices by default and for high-risk taxpayers; non-coded allowed for enterprises in electricity, petroleum, post, telecom, clean water, finance/banking, securities, crypto, insurance, health, e-commerce, supermarkets, trade, transport and enterprises transacting electronically with tax authority and having IT infrastructure [text truncated]. Non-coded sellers send invoice data to tax authority no later than the next working day after issuance (Art. 16). — same source
- **Error handling (TT 91/2026 Art. 10):**
  - (1.a) Errors in name, address, amount-in-words or other content but **not** in MST, amounts, VAT rate, VAT amount or goods → notify buyer, no re-issue; seller notifies tax authority on **Mẫu 04/SS-HĐĐT (Phụ lục III TT 91)**; system auto-acknowledges with 01/TB-SSĐT.
  - (1.b) Errors in MST, goods (wrong spec/quality), amount, VAT rate, VAT amount or other mandatory content → seller **chooses adjust or replace**: adjustment invoice text "Điều chỉnh cho hóa đơn Mẫu số... ký hiệu... số... ngày... tháng... năm"; replacement text "Thay thế cho hóa đơn Mẫu số... ký hiệu... số... ngày... tháng... năm"; sign and send (coded → to tax authority for code). One adjustment/replacement invoice may cover many wrong invoices of the same buyer in the same month with identical errors, with listing **01/BK-ĐCTT**. Before adjusting/replacing: written agreement with business buyers; notice to individual buyers or on website. No written agreement needed for summary-data (bảng tổng hợp) senders and e-commerce platform sales.
  - (1.c) Wrong cash-register invoices or invoices for registrable assets → **replace only** (except returned registered assets).
  - (1.đ/e) Sellers sending Bảng tổng hợp (01/TH-HĐĐT) correct via subsequent summaries without 04/SS.
  - (3) Tax authority notice 01/TB-RSĐT → seller reviews and adjusts/replaces.
  - (5.b) Volume-based commercial discount → reduce on last-purchase invoice or next period, or issue adjustment invoice with list kept on file.
  - (5.c.1) **Returns (full/partial, incl. exchanges changing value) → seller issues adjustment invoice**, unless parties agree the buyer issues an invoice. (5.c.2) Registered assets returned → buyer issues invoice.
  - (6) Subsequent corrections follow the first method chosen; invoices without symbol/number → adjustment only; **adjustment amounts: increase positive, decrease negative**; for 5.x adjustments seller declares in the period the adjustment invoice is issued and buyer in the period received.
  — [LuatVietnam TT 91](https://luatvietnam.vn/thue/thong-tu-91-2026-tt-btc-quy-dinh-luat-quan-ly-thue-va-hoa-don-dien-tu-439780-d1.html)
- Transition (TT 91 Art. 24.2): errors on old paper invoices under NĐ 51/2010, NĐ 04/2014 → written agreement + replacement e-invoice. — same source
- Background, NĐ 123/2020 era (before NĐ 70/2025): 04/SS-HĐĐT used for cancellation of coded invoices with errors before sending, for notification of adjust/replace (optional, by last day of VAT period), and to respond to 01/TB-RSĐT. — [Kế toán Thiên Ưng](https://ketoanthienung.vn/cach-xu-ly-hoa-don-dien-tu-viet-sai-xuat-co-sai-sot.htm)
- Practitioner summary of NĐ 254 vs NĐ 123: invoice content drops paper-invoice fields; buyer signature not mandatory; "Cổng thông tin điện tử của Tổng cục Thuế" renamed "Hệ thống thông tin quản lý thuế"; Art. 7 lists cases not requiring e-invoices (including internal transfers); additional services may invoice per reconciliation period. — [LuatVietnam comparison](https://luatvietnam.vn/thue-phi-le-phi/bang-so-sanh-nghi-dinh-254-2026-va-nghi-dinh-123-2020-nd-cp-nd-cp-ve-hoa-don-chung-tu-dien-tu-565-110463-article.html)

### Inferences
- For invoices dated 01/6/2025–30/6/2026 (NĐ 70/2025 + TT 32/2025 era), the adjust/replace logic was substantially the same as TT 91 Art. 10 (TT 91 appears to carry it over); the app can use one engine with a date-versioned form catalogue (04/SS-HĐĐT moved from Phụ lục IA NĐ 123 to Phụ lục III TT 91).
- For the bulbs/thermos trader selling B2B: use form "1", symbol e.g. "1C26TAA" (coded) or "1K26TAA" (non-coded only if in Art. 6.1.b category); retail counter sales could use "1C26MAA" cash-register invoices. Reset numbering on 01/01/2027 with symbol "...27...".
- 8%→10% switch on 01/01/2027: invoices are rated by invoice date (time of transfer of goods); returns of goods sold at 8% should be adjusted at the original 8% rate (common practice from prior reduction periods; not verified for NĐ 174).

### Gaps
- Full text of NĐ 70/2025 and TT 32/2025 (01/6/2025–30/6/2026 regime) not analysed; I relied on TT 91 for current rules. lv70 (NĐ 70) was downloaded but not reviewed in depth.
- NĐ 254 Art. 7 (cases not requiring invoices) and Art. 9.4 (periodic invoicing list) not read in full.
- TT 94/2026/TT-BTC (high-risk taxpayer criteria referenced in TT 91 Art. 11) not retrieved.
- XML data standard (TT 91 Art. 3) field list not extracted.
