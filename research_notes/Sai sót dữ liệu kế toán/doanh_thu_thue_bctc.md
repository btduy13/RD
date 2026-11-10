# Sai sót dữ liệu doanh thu, thuế GTGT/TNDN và BCTC (DB thật, đọc-only)

Nguồn dữ liệu: bản sao `live.db` (9.670 chứng từ, 2025-01-01 → 2026-11), load qua `loadstate.js` + `js/modules/reports.js`, `js/modules/tax-reports.js`. Script kiểm tra: `C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_tax/a1.js … a8.js` (gọi tắt "[DB aN]"). Mọi số là VND, làm tròn đồng.

Chưa đối chiếu điều luật nào trên web: công cụ WebSearch lỗi ở phiên này. Điều luật nêu dưới đây lấy từ chú thích `ref` trong `js/core/tax-rules.js` của app, hoặc từ hiểu biết chung (đã đánh dấu). Chúng được kê ở mục Gaps.

## Bảng xếp hạng sai sót (nghiêm trọng nhất trước)

| # | Sai sót | Chứng từ / số tiền | Đề xuất sửa |
|---|---|---|---|
| 1 | Số dư đầu kỳ lệch Nợ ≠ Có: thiếu nguồn vốn | Nợ 25.605.277.219 / Có 2.470.367.106. Chênh **23.134.910.113**. Không có 4211/4212/334/3331/341 đầu kỳ. | Lập lại SDĐK 01/01/2025 từ BCTC 2024: 4211 (LNST lũy kế), nợ phải trả. Kiểm kê lại giá trị 156 (21,73 tỷ). |
| 2 | Toàn bộ bán hàng ghi thuế suất 0%, không có 3331. Tờ khai 01/GTGT app tự lập đưa doanh thu nội địa vào chỉ tiêu [29] "thuế suất 0%" (dành cho xuất khẩu). | 2025: 3.350 phiếu BH, chịu thuế 0% sau trả lại [29] = **10.831.961.100**. 2026: 2.517 phiếu, [29] = **10.516.971.200**. Chỉ 8 phiếu BH-26-0001…0008 có VAT 10% (thuế 7.757.574). | Công ty có dấu hiệu nộp theo phương pháp khấu trừ (xem #3), nên phải ghi Có 3331 thuế suất 10% hoặc 8% (giảm thuế). Ước tính thuế đầu ra thiếu ghi: 2025 khoảng 802–1.083 triệu, 2026 khoảng 779–1.052 triệu. |
| 3 | Thuế GTGT đã nộp không có bút toán ghi nhận nghĩa vụ, nên 3331 và 333 dư Nợ | 3331: PC6448 56.461.487 (T12/2024), PC6505 30.842.158 (T1/25), PC6529 16.003.026 (T2/25), PC7180 10.000.908 (T04/26). Dư Nợ cuối **105.550.005**. 333: PC6548 65.032.734, PC6763 30.000.000 (VAT nhập khẩu lẫn phí vận chuyển). Dư Nợ **95.032.734**. 3338: PC6600 2.000.000 (môn bài 2025). | Ghi nhận 3331 (đầu ra) và 1331 (đầu vào) theo tờ khai đã nộp. VAT nhập khẩu: Nợ 1331 / Có 33312 rồi Nợ 33312 / Có 111. Tách phí vận chuyển vào giá vốn 156. Môn bài: Nợ 642 / Có 3338. |
| 4 | Không có 1331 trên bất kỳ phiếu mua nào | 2025: 242 phiếu NK, giá trị 7.697.284.047. 2026: 175 phiếu, 7.089.360.908. Tất cả ghi thuế suất 0%. | Nhập lại theo hóa đơn đầu vào: tách 1331. Áp điều kiện thanh toán không dùng tiền mặt (ngưỡng 5 triệu trong tax-rules). |
| 5 | Giá vốn vượt doanh thu, lãi gộp âm: thẻ kho / đơn giá vốn sai | 2025: COGS 14.078.590.708 > DT 11.169.754.632 (GM −26%). 2.445/3.350 phiếu có giá vốn > doanh thu, phần vượt 4.132.566.550. Ví dụ BH39387 (DT 44 triệu, GV 133 triệu), BH42069. 227 phiếu BH doanh thu 0 có giá vốn 340.056.241 (xuất sửa, chân bồn, "xuất CL KHO"). | Tính lại giá xuất kho (bình quân) sau khi chuẩn hóa SDĐK 156. Xuất dùng nội bộ chuyển sang phiếu xuất kho Nợ 641/642/154, không dùng phiếu bán hàng. |
| 6 | Điều chỉnh kho rác hoặc khổng lồ bóp méo 632/711 năm 2026 | DK1792726334622 (23/10/2026) Nợ 632 **7.396.000.000**, "Dây đồng trần 10: 86000 → 0", lý do "ádcasdc". NK08606 (24/10/2026) phiếu mua 0đ nhưng Nợ 156 / Có 632 **7.391.450.290** ("điều chỉnh giá vốn xuất kho âm", 85.914 SP1330 giá 0). Tổng inventory_adjust 2026: Nợ 632 13.006.503.634 (163 phiếu), Có 711 979.420.812 (114 phiếu, vd DK1788506084207 411.340.000). | Hủy cặp DK1792726334622/NK08606. Kiểm kê thật: thiếu thì ghi 1381 (chờ xử lý) hoặc 632 có biên bản; thừa thì ghi 3381, không ghi thẳng 711. Chặn phiếu nhập giá 0. |
| 7 | Không có bút toán kết chuyển 911/821/4212 cho 2025 và 2026 | 0 chứng từ period_close. Không có 911, 821, 421. Lỗ 2025 (−2.825.377.640) chưa chuyển 4212 rồi 4211. | Chạy kết chuyển 31/12/2025 (Nợ/Có 911 → 4212). Đầu 2026 chuyển 4212 → 4211. Kết chuyển hàng quý/năm 2026. |
| 8 | Lương và BHXH chi ra nhưng không hạch toán chi phí, nên 334 và 338 dư Nợ | 334: 24 phiếu, Nợ **1.298.657.103** (2025: 819.423.103; 2026: 479.234.000), không có Có 334. 338: 15 phiếu, **265.222.500**. Lương T6, T7/2026 lại ghi thẳng 642 (PC7399, PC7400, mỗi phiếu 78.000.000). PC6859, PC6963 "trích thầu" ghi vào 334. | Trích lương hàng tháng: Nợ 642/641 / Có 334. Trích BH: Nợ 642 / Có 3383,3384,3386 và Nợ 334 / Có 338 phần người lao động. SDĐK 2025 phải có 334 (lương T12/2024: 54.000.000) và 338. Khấu trừ TNCN thì ghi 3335. |
| 9 | Ngân hàng 112 âm, tiền mặt 111 phình to, không có chuyển 111↔112 | 112 cuối 2025 −815.810.824; cuối kỳ **−2.695.733.636**. 111 cuối kỳ 5.245.904.034. 0 phiếu chuyển 111↔112 trong cả kỳ. | Đối chiếu sao kê, bổ sung nộp tiền/rút tiền (Nợ 112 / Có 111 và ngược lại). Phân loại lại phiếu thu chuyển khoản đang ghi 111. |
| 10 | Chi hộ / cho vay cá nhân ghi 1388, chứng từ chi cá nhân | PC6882 1.400.000.000 "Chi duy vay mua chung cư golsea…", PC6892 70.000.000 "đám cưới". Đối tác ghi là khách hàng. | Ghi đúng đối tượng (1388 hoặc 141 có hợp đồng vay, hoặc giảm vốn chủ). Không tính vào chi phí được trừ. |
| 11 | TSCĐ không trích khấu hao | 211 891.900.000 (PC6624, 6641, 6650, 6889, 6906: xe tải, ô tô), không có 214. | Lập thẻ TSCĐ (VAT mua xe tách 1331), trích Nợ 641/642 / Có 214 từ tháng đưa vào dùng. |
| 12 | Hàng trả lại ghi Nợ 511 thay vì 5212 | 2025: 206 phiếu BTL, 337.793.532. 2026: 134 phiếu, 176.292.224. Không ghi giảm 3331. | Nợ 5212 / Có 131/111. Kèm Nợ 3331 khi có VAT. Kết chuyển 5212 → 511 cuối kỳ. Chú ý: danh mục app TT99 có 5212 = Hàng bán bị trả lại, 5213 = Giảm giá hàng bán. |
| 13 | Phiếu thu ghi thẳng Có 511 (doanh thu không qua phiếu bán, không giá vốn, không hóa đơn) | 18 phiếu, 11.405.432. 2025: 7 phiếu, 6.314.829 (PT12862, PT11909, PT12801, PT12910, PT12352, PT13096, PT12724). 2026: 11 phiếu, 5.090.603 (PT12722…PT13177, phần lớn "CH Thành Công"). | Thay bằng phiếu bán hàng (Nợ 111 / Có 511, 3331 + giá vốn) hoặc Có 131 nếu thu nợ. |
| 14 | Vay 341 lẫn lãi vay và nợ khó đòi | PC6942 6.383.479 "lãi vay T01/2026" ghi 341, đúng là 635. PC7031 4.452.590 "tất toán không thu được" ghi 341, đúng là 131 → 2293/811. | Phân loại lại. |
| 15 | Chi phí không có hóa đơn / đối tác chung | 59 phiếu chi loại chi phí / TS / lương, tổng 4.130.029.439: **59/59 không số hóa đơn**, 49 có đối tác "Mua lẻ / Khách lẻ / vãng lai" hoặc trống. 641 = 0 cả 2 năm. 642 chỉ 28,7 triệu (2025) và 158,0 triệu (2026). | Bổ sung hóa đơn và nhà cung cấp. Chi không hóa đơn bị loại khỏi chi phí được trừ TNDN. |
| 16 | Hồ sơ công ty trống | companyName "", taxCode "", address "", `taxSettings` undefined (không có prevYearRevenue). | Nhập MST, tên và thiết lập thuế. Nhập doanh thu 2024 để app xác định thuế suất TNDN 2025. |

## Bảng cân đối số phát sinh có cân không (đầu kỳ và cuối kỳ)?

### Takeaway
Không cân. Đầu kỳ và cuối kỳ cùng lệch **23.134.910.113**, Nợ lớn hơn Có. Phát sinh trong kỳ cân (126.027.408.882 hai bên). Vậy toàn bộ chênh lệch nằm ở SDĐK: thiếu nguồn vốn / LNST lũy kế / nợ phải trả. Số liệu bút toán phát sinh không gây lệch.

### Cited Findings
- `state.initialBalances`: Nợ = 111 150.000.000 + 112 500.000.000 + 131 3.179.236.113 + 156 21.726.041.106,096 + 244 50.000.000 = 25.605.277.219. Có = 331 1.529.017.106 + 344 30.000.000 + 411 911.350.000 = 2.470.367.106. — [DB a1/a5]
- `calculateTrialBalance()` của app: openDebit 25.605.277.219 / openCredit 2.470.367.106; moveDebit = moveCredit = 126.027.408.882; closeDebit 50.296.739.804 / closeCredit 27.161.829.691. — [DB a5]
- Không có bút toán thiếu vế hoặc số tiền NaN (0 lỗi). — [DB a5]
- Số dư bất thường cuối kỳ:
  - 112 dư Có 2.695.733.636.
  - Các TK nợ phải trả dư Nợ: 333 95.032.734; 3331 105.550.005; 3338 2.000.000; 334 1.298.657.103; 338 265.222.500.
  - 1388 1.470.000.000.
  - 211 891.900.000 không có 214.
  - Các TK 511/632/635/642/711 còn số dư vì chưa kết chuyển.
  — [DB a5]
- Bảng CĐPS của app tính lũy kế toàn bộ, không lọc kỳ. Dòng 111 xuất hiện 2 lần trong mảng trả về (bản lẻ thập phân 22.855.846.671,3 và bản làm tròn). Cần kiểm tra trùng dòng khi in. — [DB a5]

### Inferences
- Phần chênh 23,13 tỷ gần bằng 156 đầu kỳ (21,73 tỷ). Khả năng cao người dùng nhập tồn kho đầu kỳ từ thẻ kho, nhưng không nhập vốn chủ / LNST lũy kế / vay tương ứng. Cũng có thể giá trị 156 bị thổi phồng (xem #5: giá vốn > giá bán).
- Ít nhất các khoản sau phải là nợ phải trả đầu kỳ 01/01/2025 (được chi trong tháng 1 cho kỳ 2024):
  - 3331 T12/2024: 56.461.487 (PC6448).
  - 334 lương T12/2024: 54.000.000 (PC6437).
  - Khả năng có BHXH (PC6456 16.016.000).

### Gaps
- Không có BCTC 2024 để xác định số đúng của 4211/341/333 đầu kỳ.
- Không rõ 21,73 tỷ hàng tồn là đúng hay sai giá.

## Thuế GTGT đầu ra: bao nhiêu doanh thu không có VAT, có hợp pháp không?

### Takeaway
Gần như 100% doanh thu không có VAT.
- 2025: 10,83 tỷ (sau trả lại).
- 2026: 10,52 tỷ (chỉ 77,6 triệu có VAT 10%).

Dữ liệu cho thấy công ty nộp thuế GTGT theo phương pháp khấu trừ:
- Nộp theo tháng, số tiền khoảng 2–7,5% doanh thu tháng. Mức này không khớp tỷ lệ % trực tiếp 1% của phân phối hàng hóa.
- Có nộp VAT hàng nhập khẩu.

Với doanh thu khoảng 10,8 tỷ/năm, việc ghi thuế suất 0% cho bán nội địa là sai. Nếu xuất tờ khai từ app, doanh thu này rơi vào chỉ tiêu [29] (0%, dành cho hàng xuất khẩu).

### Cited Findings
- `computeVat01` năm 2025: [23] mua vào 7.690.919.108, [24] thuế 0, [29] 10.831.961.100, [32] 0, [40] 0. Năm 2026: [29] 10.516.971.200, [32] 77.575.740, [33] 7.757.574, [40] 7.757.574. — [DB a8]
- vatBreakdown theo loại:
  - 2025: BH rate 0 có 3.350 phiếu, base 11.169.754.632. BTL rate 0 có 206 phiếu, 337.793.532. NK rate 0 có 242 phiếu, 7.697.284.047.
  - 2026: BH rate 0 có 2.517 phiếu, base 10.693.263.424. BH rate 10 có 8 phiếu, base 77.575.740, thuế 7.757.574. NK rate 0 có 175 phiếu, 7.089.360.908.
  — [DB a3]
- Phiếu nộp VAT hàng tháng: PC6448 "thuế GTGT tháng 12/2024" 56.461.487; PC6505 "T1/2025" 30.842.158; PC6529 "T2" 16.003.026; PC7180 "t04" (2026) 10.000.908. VAT nhập khẩu: PC6548 65.032.734, PC6763 30.000.000. — [DB a4]
- Doanh thu thuần tháng 1/2025 khoảng 0,73 tỷ (Q1/2025 = 2.194.622.149). Vậy 30,8 triệu ≈ 4,2% và 56,5 triệu ≈ 7,7% doanh thu tháng. — [DB a7]
- Không thấy phiếu nộp VAT nào cho T3/2025 đến T3/2026. Kỳ T04/2026 nộp 10.000.908 trong khi sổ không có VAT đầu ra tháng 4/2026 (VAT chỉ có ở tháng 1 và tháng 5). — [DB a3/a4]
- Bộ 8 phiếu có VAT (BH-26-0001…0008) có 6 phiếu thiếu trường `amount` (hiển thị NaN). Ví dụ BH-26-0002: totalAmount 11.928.664, giá vốn 31.406.667 > doanh thu 10.844.240. — [DB a4/a5]
- Ước tính VAT đầu ra thiếu ghi (giá đã gồm thuế ×r/(1+r); giá chưa thuế ×r):
  - 2025, base 10.831.961.100: 8% là 802,4 triệu (gồm thuế) đến 866,6 triệu (chưa thuế); 10% là 984,7 triệu đến 1.083,2 triệu.
  - 2026, base 10.516.971.200: 8% là 779,0 triệu đến 841,4 triệu; 10% là 956,1 triệu đến 1.051,7 triệu.
  — [tính từ DB a8]

### Inferences
- Theo hiểu biết chung (chưa kiểm chứng web), Luật Thuế GTGT 48/2024/QH15 (hiệu lực 01/7/2025) và NĐ 181/2025 quy định: cơ sở kinh doanh có doanh thu năm từ 1 tỷ trở lên áp dụng phương pháp khấu trừ. Ngành ống nước, thiết bị vệ sinh, bồn và lắp đặt chịu 10%. Một phần hàng có thể được giảm còn 8% theo các nghị quyết giảm thuế: NQ 174/2024 cho 1–6/2025, NQ 204/2025 cho 7/2025–12/2026. Hàng kim loại / sản phẩm kim loại có thể không được giảm. Thuế suất 0% chỉ dành cho xuất khẩu.
- Khả năng thực tế là doanh nghiệp lập hóa đơn và kê khai bên ngoài phần mềm. Sổ trong app có thể chỉ là sổ quản trị nhập từ Excel (`isImported: true`, `excelRow`). Bằng chứng: các khoản đã nộp 3331 không khớp với 3331 phát sinh Có. Trước khi sửa, cần đối chiếu với tờ khai 01/GTGT đã nộp và hóa đơn điện tử.
- Hướng sửa:
  - Đặt thuế suất mặc định của sản phẩm là 10% (hoặc 8% nếu được giảm).
  - Tính lại vatBreakdown cho phiếu BH/BTL/NK.
  - Ghi 1331 cho hàng mua có hóa đơn GTGT.
  - Bù trừ cuối kỳ: Nợ 3331 / Có 1331.
  - Dư Nợ 3331 105,55 triệu và 333 95,03 triệu sẽ tự triệt tiêu khi ghi đủ nghĩa vụ.

### Gaps
- Chưa kiểm chứng điều 12 Luật 48/2024, NĐ 181/2025, NQ 204/2025 qua nguồn web (WebSearch lỗi).
- Không có `taxSettings` (phương pháp tính thuế, kỳ kê khai) trong DB, nên không xác nhận được bằng cấu hình.
- Không biết giá bán trong dữ liệu đã gồm VAT hay chưa.
- Không có số liệu hóa đơn điện tử thực tế để so sánh.

## Kết quả kinh doanh 2025/2026: có hợp lý không? Ước tính TNDN tạm nộp quý

### Takeaway
Không hợp lý. App cho lỗ 2025 −2,83 tỷ và lỗ 2026 −2,99 tỷ, do giá vốn > doanh thu và các điều chỉnh kho rác. Đồng thời chi phí lương, BHXH, khấu hao, VAT bị bỏ sót. App tính TNDN tạm nộp 2026 Q1 = 15.760.769 và Q1–Q2 lũy kế 79.335.350, sau đó về 0 do lỗ Q3–Q4. Các con số này không dùng được để kê khai.

### Cited Findings
- `computeProfitLoss` (trước kết chuyển):

| Kỳ | Doanh thu 511 | Giảm trừ | DT thuần | Giá vốn | LN gộp | CP TC 635 | CP QLDN 642 | TN khác 711 | LNTT |
|---|---|---|---|---|---|---|---|---|---|
| 2025 | 11.176.069.461 | 337.793.532 | 10.838.275.929 | 13.625.615.444 | −2.787.339.515 | 9.334.537 | 28.703.588 | 0 | **−2.825.377.640** |
| 2026 (đến 11/2026) | 10.775.929.767 | 176.292.224 | 10.599.637.543 | 14.403.461.192 | −3.803.823.649 | 8.256.756 | 157.954.955 | 979.420.812 | **−2.990.614.548** |

  — [DB a7]
- LNTT theo quý:
  - 2025: Q1 −453.616.946; Q2 −689.922.308; Q3 −915.997.335; Q4 −765.841.051.
  - 2026: Q1 +132.443.438; Q2 +534.240.173; Q3 −2.835.342.535 (giá vốn 6.891.170.895, TN khác 919.044.015); Q4 −821.955.623.
  — [DB a7]
- `computeCitEstimate` 2026: thuế suất 17%, dựa trên doanh thu 2025 là 10.838.275.929. Các mức trong tax-rules: ≤3 tỷ 15%, 3–50 tỷ 17%, >50 tỷ 20%, ref "Luật Thuế TNDN 67/2025/QH15; NĐ 320/2025/NĐ-CP Điều 11". Giảm 30% theo ref "NĐ 398/2026/NĐ-CP (NQ 43/2026/QH16)" nếu doanh thu ≤10 tỷ. Q1: gross 22.515.384, giảm 6.754.615, tạm nộp 15.760.769. Q2 lũy kế: 79.335.350. Q3–Q4: 0. — [DB a8], `js/core/tax-rules.js`
- `computeCitEstimate` 2025 cảnh báo: "Năm 2024 không có chứng từ — thuế suất đang xét theo doanh thu 0", nên áp 15%. — [DB a7]
- `citRevenue` 2026 = 11.579.058.355 (gồm 711 979.420.812). Nếu 711 là thu nhập ảo từ điều chỉnh kho, doanh thu xét ngưỡng 10 tỷ cho giảm 30% bị đẩy lên sai. — [DB a7]
- Chi phí bị bỏ sót:
  - Lương / BHXH chi qua 334/338: 2025 là 993.760.603; 2026 là 570.119.000.
  - Khấu hao 891,9 triệu TSCĐ: 0.
  - Không có 641, không có tiền thuê / điện nước.
  — [DB a3/a4]

### Inferences
- Giá vốn 2025 cao hơn doanh thu trên 73% phiếu bán. Điều này không phù hợp với một nhà bán lẻ. Đơn giá vốn bình quân bị nhiễm do SDĐK 156 sai và tồn âm ("Điều chỉnh giá vốn xuất kho âm"). Sau khi chuẩn hóa kho, LN gộp có thể dương. Khi đó cộng thêm chi phí lương khoảng 1 tỷ/năm thì kết quả mới đáng tin.
- Q3–Q4/2026 bị chi phối bởi DK1792726334622 (7,396 tỷ) / NK08606 (7,391 tỷ): hai bút toán gần triệt tiêu nhau nhưng cùng là rác. Thêm DK1790560856266 (1,186 tỷ), DK1789782443197 (643,8 triệu).
- Thuế suất và mức giảm 2026 phụ thuộc doanh thu 2025: 10,84 tỷ, tức sát ngưỡng 10 tỷ. Nếu doanh thu 2025 đúng là giá chưa VAT và chuẩn xác, công ty không được giảm 30% cho 2026 (doanh thu 2026 ước > 10 tỷ). Cần xác minh doanh thu sau khi tách VAT. Ví dụ 10,84 tỷ/1,08 ≈ 10,04 tỷ, vẫn > 10 tỷ.

### Gaps
- Không có tờ khai TNDN quyết toán 2025 hoặc tờ khai tạm nộp để so sánh.
- Không có 3334 hay phiếu nộp TNDN nào trong DB (0 chứng từ). Không rõ công ty đã nộp TNDN chưa.
- Chưa kiểm chứng web NĐ 320/2025, NĐ 398/2026 / NQ 43/2026.

## Thiếu bút toán khóa sổ và vốn chủ sai

### Takeaway
Không có bất kỳ chứng từ kết chuyển nào: 0 period_close, 0 bút toán 911/821/421. Vốn chủ chỉ có 411 911.350.000. Thiếu 4211 đầu kỳ, nên SDĐK lệch 23,13 tỷ. LNST 2025 (−2,83 tỷ) chưa chuyển 4212 rồi 4211.

### Cited Findings
- Loại chứng từ có trong DB: purchase, payment, receipt, sales, sales_return, purchase_return, purchase_order, escrow_pay/receive, inventory_adjust, sales_quotation. Không có period_close, không có journal (bút toán tổng hợp). — [DB a1]
- Danh sách TK phát sinh 2025/2026 không chứa 911, 821, 4211, 4212, 214, 1331 (chỉ 1331 SDĐK = 0), 3334, 5212. — [DB a2]
- Danh mục app (TT99) có 4211 "lũy kế đến cuối năm trước", 4212 "năm nay", 5212 "Hàng bán bị trả lại", 5213 "Giảm giá hàng bán", 33312 "Thuế GTGT hàng nhập khẩu". — `js/core/chart-of-accounts.js` dòng 72, 109, 116
- App tự tính LNST chưa phân phối trên BCTC từ TK 5–9 chưa kết chuyển (chú thích trong tax-reports.js). Vì vậy B01 vẫn ra số, nhưng sổ cái không khóa. — `js/modules/tax-reports.js` dòng 238–240

### Inferences
Thứ tự sửa:
1. Sửa SDĐK: thêm 4211 và các khoản phải trả.
2. Sửa thuế (3331/1331), lương, khấu hao, kho.
3. Tạo chứng từ kết chuyển 31/12/2025: `buildPeriodCloseVoucher('2025-01-01','2025-12-31')`, kèm 821 nếu có thuế TNDN.
4. Đầu 2026: Nợ 4212 / Có 4211 (hoặc ngược lại nếu lỗ).
5. Khóa kỳ 2026 theo quý.

### Gaps
- Không rõ app có cơ chế tự chuyển 4212 sang 4211 đầu năm hay không (không kiểm tra code luồng này).
- Lỗ lũy kế trước 2025 chưa biết.
