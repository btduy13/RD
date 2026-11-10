# Sai sót dữ liệu Tiền mặt (TK 111) và Tiền gửi ngân hàng (TK 112)

Nguồn chính: bản sao DB `live.db` (chỉ đọc), nạp qua `loadstate.js` và engine của app. Script: `C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/` (a1–a10.js, sim.js). Ký hiệu nguồn bên dưới: [a4] = `audit_cash/a4.js`, v.v. Số liệu tính trên mọi chứng từ trừ `sales_quotation` và `purchase_order` (hai loại này không hạch toán).

Hiện trạng sổ (bảng cân đối số phát sinh của app) [a6]:
- 111: đầu kỳ 150.000.000; PS Nợ 22.855.846.671; PS Có 17.759.942.637; **cuối kỳ Nợ 5.245.904.034**.
- 112: đầu kỳ 500.000.000; PS Nợ 967.125.470; PS Có 4.162.859.106; **cuối kỳ CÓ 2.695.733.636 (số dư ngân hàng âm)**.
- Tổng 111 + 112 = 2,55 tỷ. Quỹ 111 đang cao giả tạo, còn 112 âm giả tạo. Hai lỗi này bù trừ một phần cho nhau.

## Câu 1: Ghi trùng tiền mặt từ bán lẻ (bán hàng 111 + phiếu thu Có 131) giải thích bao nhiêu trong số dư 111?

### Takeaway
Từ T01/2025 đến T05/2026, mỗi tháng bán lẻ có hai bút toán Nợ 111 cho cùng một khoản tiền. Một là các hóa đơn bán lẻ ghi Nợ 111/Có 511. Hai là phiếu thu cuối tháng ghi Nợ 111/Có 131 cho cả tháng. **Phần ghi trùng là ≈1,016 tỷ (min theo từng tháng).** Nếu đổi 824 hóa đơn và các phiếu trả lại bán lẻ sang 131, quỹ 111 giảm đúng **1.020.997.589**, từ 5,246 tỷ xuống 4,225 tỷ [a4][sim].

### Cited Findings
- Có 1.788 phiếu thu đều ghi `receipt|111`. Có 834 hóa đơn bán hàng ghi `paymentMethod 111` (Nợ 111/Có 511), so với 5.040 hóa đơn ghi 131 — [a1](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a1.js)
- Bảng theo kỳ bán lẻ (đối tác BANLETmm/yyyy(CH), DT_5430 = T02/2025, DT_8657 = T03/2025 và các DT_xxxx tên "Bán lẻ T0x/2025 …"). Cột "trùng" = min(bán 111, PT Có 131) — [a4](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a4.js)

| Kỳ | Số HĐ 111 | Bán Nợ 111 | Bán Nợ 131 | PT Nợ111/Có131 | Trùng | Trả lại Có 111 | Phiếu thu chính |
|---|---|---|---|---|---|---|---|
| 2025-01 | 22 | 17.331.641 | 18.068.930 | 54.175.592 | 17.331.641 | 1.224.981 | PT11700, PT11795 |
| 2025-02 | 36 | 31.703.422 | 0 | 32.565.190 | 31.703.422 | 58.231 | PT11804, PT11834 |
| 2025-03 | 44 | 40.849.076 | 0 | 40.217.743 | 40.217.743 | 631.332 | PT11912 |
| 2025-04 | 56 | 65.028.249 | 0 | 61.079.007 | 61.079.007 | 3.949.242 | PT11960, PT12041 |
| 2025-05 | 53 | 67.531.653 | 0 | 84.816.318 | 67.531.653 | 1.018.011 | PT12040 |
| 2025-06 | 58 | 93.465.455 | 13.077.055 | 104.632.082 | 93.465.455 | 200.340 | PT12219 |
| 2025-07 | 73 | 76.692.320 | 0 | 76.613.695 | 76.613.695 | 78.624 | PT12205, PT12362 |
| 2025-08 | 41 | 28.561.058 | 0 | 28.498.926 | 28.498.926 | 62.132 | PT12363 |
| 2025-09 | 54 | 91.624.905 | 0 | 92.234.910 | 91.624.905 | 300.000 | PT12552, PT12495 |
| 2025-10 | 38 | 46.129.833 | 6.454.000 | 61.583.832 | 46.129.833 | 0 | PT12459, PT12553 |
| 2025-11 | 35 | 39.099.108 | 0 | 39.099.109 | 39.099.108 | 0 | PT12717 |
| 2025-12 | 36 | 54.483.277 | 0 | 55.173.060 | 54.483.277 | 581.689 | PT12589, PT12716 |
| 2026-01 | 65 | 65.560.777 | 0 | 64.243.717 | 64.243.717 | 1.317.060 | PT12728, PT12967 |
| 2026-02 | 23 | 29.934.541 | 0 | 30.934.547 | 29.934.541 | 0 | PT12830, PT12968 |
| 2026-03 | 62 | 74.957.455 | 0 | 74.285.263 | 74.285.263 | 672.192 | PT12970, PT13043 |
| 2026-04 | 68 | 130.595.920 | 8.816.720 | 125.922.355 | 125.922.355 | 5.741.959 | PT13025, PT13069, PT13073, PT13090, PT13106 |
| 2026-05 | 59 | 77.187.098 | 0 | 72.880.150 | 72.880.150 | 158.485 | PT13108, PT13110, PT13122, PT13167, PT13220 |
| 2026-06 | 0 | 0 | 61.512.467 | 61.512.467 | 0 | 651.706 | PT13708 (đúng: bán 131) |
| 2026-07 | 1 | 551.286 | 88.817.904 | 87.139.455 | 551.286 | 0 | PT13265, PT13704 |
| 2026-08 → 11 | 1 | 6.356.500 (BH45890, 11/2026, chưa có PT) | 253.908.335 | 107.853.448 | 0 | 0 | — |
| **Tổng** | **824** | **1.037.643.573** | 450.655.411 | 1.540.106.492 | **1.015.595.977** | ≈16,9 tr | |

- Mẫu một tháng: BANLET05/2025(CH) có 53 hóa đơn Nợ 111/Có 511, tổng 67.531.653. Phiếu thu PT12040 ngày 31/05/2025 ghi "pt3513/Q71 Bán Lẻ T05/2025" Nợ 111/Có 131 số 84.816.318 — [a3](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a3.js)
- Từ T06/2026 trở đi, hóa đơn bán lẻ ghi 131 và phiếu thu tháng tất toán chúng, nên không còn trùng. Ví dụ BANLET06/2026: 46 HĐ Nợ 131 tổng 61.512.467; PT13708 thu đúng 61.512.467 — [a2](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a2.js)
- Phiếu thu T08–T12/2024 (PT11814–PT11818, "Thu khác", ngày 01/01/2025, tổng 184.645.626) thu công nợ đầu kỳ của các kỳ bán lẻ 2024. Phần này khớp số dư đầu kỳ từng đối tác, không phải ghi trùng — [a3]; [a8](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a8.js)
- Hệ quả trên sổ cái 131: các PT Có 131 bán lẻ không có bút toán Nợ 131 đối ứng. Vì vậy GL 131 bị kéo xuống ≈1,0 tỷ. App vá ở sổ chi tiết đối tác bằng `partnerOpeningBalances`. Ví dụ BANLET05/2025 có "đầu kỳ" Nợ 66.513.642 = doanh số 67.531.653 − trả lại 1.018.011. Kết quả sổ đối tác cuối kỳ là Có 17.520.476 (khách trả thừa) — [a6](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a6.js), [a7](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a7.js)
- Tổng `partnerOpeningBalances` của các đối tác bán lẻ: Nợ 1.174.713.492, Có 7.934.200. Trong đó các kỳ 2025–2026 (phát sinh SAU ngày mở sổ 01/01/2025) chiếm ≈990 tr — [a8]

### Inferences
- Phần quỹ 111 thừa do ghi trùng bán lẻ là ≈1,02 tỷ. Con số này giải thích khoảng 20% số dư 5,25 tỷ, không phải phần lớn. Phần lớn còn lại đến từ việc thiếu bút toán nộp tiền vào ngân hàng (Câu 3).
- Ngoài khoản trùng, nhiều PT tháng thu nhiều hơn doanh số 111 cùng kỳ. Ví dụ T05/2025 thu 84,8 tr so với bán 67,5 tr; T01/2025 thu 54,2 tr so với bán 17,3 + 18,1 tr. Một số HĐ có thể bị gán nhầm đối tác, ví dụ DT_1132, DT_2708… mang tên "Bán Lẻ T02/2025 …" nhưng là đối tác riêng.

### Gaps
- Chưa đối chiếu được với sổ quỹ gốc của phần mềm nguồn (không có file trong DB).

## Câu 2: Nên sửa bằng cách đổi hóa đơn bán lẻ sang 131 hay xóa phiếu thu? Cách nào khớp hệ thống nguồn?

### Takeaway
**Đổi 824 hóa đơn bán lẻ (và các phiếu trả lại bán lẻ) từ 111 sang 131 và giữ nguyên phiếu thu.** Hệ thống nguồn hạch toán bán lẻ là bán chịu theo kỳ, sau đó lập phiếu thu tháng có số quyển riêng. Mức 111 là lỗi suy luận của bộ nhập Excel cũ.

### Cited Findings
- `excelRow` của hóa đơn bán lẻ ghi 111 là định dạng 10 cột, kiểu "Hóa đơn bán hàng". Định dạng này **không có cột hình thức thanh toán**, ví dụ BH39245 `["2025-01-01",…,"Bán hàng Bán lẻ T01/2025",68040,"Bán lẻ T01/2025",…,"Hóa đơn bán hàng",""]`. Vậy mức 111 không lấy từ file nguồn — [a1](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a1.js), [a3]
- Nguyên nhân trong code: trước commit `99f54c0` ("fix: preserve retail-period debts in v3.4.4", 05/08/2026), bộ nhập gán `paymentMethod = "111"` khi tên đối tác chứa "BÁN LẺ", "KHÁCH LẺ" hoặc "VÃNG LAI". Bản v3.4.4 bỏ quy tắc này (`inferImportedPaymentMethod`, js/excel-integration.js:23-31) và chú thích rằng kỳ bán lẻ "vẫn có thể là bán chịu". Bản sửa chỉ áp dụng cho lần nhập mới, dữ liệu cũ không được chuyển đổi — `git show 99f54c0`, `js/excel-integration.js`
- Dòng hóa đơn duy nhất có định dạng 15 cột của phần mềm nguồn (BH44088, BANLET04/2026) ghi rõ loại chứng từ "Bán hàng hóa, dịch vụ trong nước **chưa thu tiền**" — [a3]
- Phiếu thu tháng mang số phiếu thu và số quyển của nguồn, ví dụ "PT3513/Q71 Bán Lẻ T05/2025" hay "PT4109/q83 Bán Lẻ T05/2026". Số tiền của chúng khớp gần đúng tổng doanh số kỳ. Ví dụ PT12717 thu 39.099.109 so với doanh số 39.099.108 của T11/2025 — [a3], [a4]
- File số dư đối tác của nguồn (`partnerOpeningBalances.excelRow`) có số dư Nợ 131 cho từng kỳ bán lẻ, ví dụ BANLET05/2026: Nợ 80.814.150 / Có 7.934.000 / ròng 72.880.150. Số ròng này bằng đúng tổng PT kỳ đó (72.880.150). Nghĩa là nguồn coi bán lẻ là khoản phải thu 131 — [a8](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a8.js)

### Inferences
- Cách sửa đề xuất, làm trên bản sao trước:
  1. Đổi `paymentMethod` 111 → 131 cho 824 HĐ bán lẻ T01/2025–T07/2026 (bảng Câu 1). Bút toán đổi từ Nợ 111/Có 511 thành Nợ 131/Có 511. Không đổi BH45890 (11/2026, nhập trong app, chưa có PT). Không đổi BH44740, trừ khi PT13704 đã bao gồm nó.
  2. Đổi các phiếu trả lại bán lẻ `sales_return` 111 trong cùng kỳ (≈27 phiếu, ≈16,9 tr, ví dụ BTL06759, BTL06984, BTL06990) sang 131 để giảm phải thu của kỳ. Kiểm tra cho thấy không có phiếu chi hoàn tiền nào khớp với các BTL này [a9].
  3. **Đồng thời xóa** `partnerOpeningBalances` của các kỳ bán lẻ phát sinh sau 01/01/2025, tổng ≈990 tr. Giữ các kỳ 2024. Nếu không xóa, sổ chi tiết 131 của từng kỳ bị ghi Nợ hai lần.
  4. Gộp các đối tác DT_xxxx/KL_ tên "Bán lẻ T02/T03/2025 …" về đúng kỳ (DT_5430, DT_8657 hoặc BANLET02/03-2025) để PT tháng tất toán được.
- Không nên xóa phiếu thu, vì ba lý do. (a) Phiếu thu có số chứng từ gốc (PTxxxx/qNN), xóa đi là mất dấu vết kiểm toán. (b) Một số PT bao gồm khoản thu ngoài doanh số 111, ví dụ T05/2025 thừa 17,3 tr. (c) Cách đó trái với cách nguồn hạch toán từ T06/2026 trở đi (131 + PT).
- Về chuẩn mực: theo TT133 và TT99, bán lẻ thu tiền ngay thường ghi Nợ 111/Có 511, 3331 tại thời điểm bán. Cách "bán chịu theo kỳ rồi thu tiền cuối tháng" vẫn hợp lệ nếu thực tế thu ngân nộp tiền cho kế toán theo đợt. Điều kiện là chỉ ghi một lần. Kiến thức chung, chưa kiểm tra văn bản trong phiên này.

### Gaps
- Chưa xác minh được thời điểm tiền thực vào quỹ: theo từng HĐ, hay theo ngày PT tháng (ví dụ PT12219 ngày 21/07/2025 thu cả T06/2025). Cần sổ quỹ hoặc biên bản kiểm kê.
- Chưa đối chiếu được 3,18 tỷ số dư đầu kỳ GL 131 với tổng `partnerOpeningBalances` (ròng 1,65 tỷ). Hai số không khớp, cần phần nghiên cứu về TK 131.

## Câu 3: Quỹ âm, chuyển 111↔112 và các bất thường khác

### Takeaway
(a) **Quỹ 111 chưa âm ngày nào.** Thấp nhất là 164.042.134 ngày 01/01/2025. (b) **TK 112 âm từ 12/06/2025 và giữ mức âm tới nay**, tối đa −2.695.733.636. (c) **Không có bút toán chuyển tiền nào giữa 111 và 112** trong toàn bộ dữ liệu: không nộp tiền vào ngân hàng, không rút tiền về quỹ. (d) Khoảng 60 chứng từ ghi rõ "ck / scb / bidv / sacombank / vay ngân hàng" nhưng hạch toán vào 111, tổng ròng ≈2,03 tỷ chi. Mô phỏng sửa cả ba lỗi (trùng bán lẻ, chứng từ ngân hàng ghi vào 111, nộp tiền tối thiểu để 112 không âm) cho quỹ 111 cuối kỳ ≈1,52 tỷ thay vì 5,25 tỷ. Mức nộp tiền tối thiểu cần ghi bổ sung là 2,70–4,74 tỷ [sim].

### Cited Findings
- Số dư 111 cuối tháng (tr đồng): 01/25 740, 06/25 1.186, 09/25 2.324, 12/25 2.563, 03/26 3.111, 06/26 4.460, 09/26 5.141, 11/26 5.246. 111 không âm ngày nào — [a4](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a4.js)
- Số dư 112: 500 tr đầu kỳ. Âm lần đầu −40.498.033 ngày 12/06/2025. Có 45 ngày phát sinh với số dư âm. Từ 15/06/2026 không còn phát sinh 112 nào, nên số dư dừng ở −2.695.733.636 — [a4]
- Không có chứng từ nào ghi Nợ 112/Có 111 hoặc Nợ 111/Có 112 — [a5](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a5.js)
- Mã chứng từ trong DB chỉ có PT, PC, BH, BTL, NK, XK, DK, KQ, CODEX. Không có chứng từ ngân hàng (báo có, báo nợ, ủy nhiệm chi, nộp tiền vào tài khoản). `detectVoucherTypeFromId` cũng không nhận diện loại nào như vậy. 112 chỉ phát sinh qua 17 PT và 48 PC — [a5]; `js/excel-integration.js:1-18`
- Khoản vay Sacombank (TK 341) đi qua quỹ: Nợ 111/Có 341 1.577.842.096 và Nợ 341/Có 111 1.935.228.560. Phần qua 112 chỉ có Nợ 112/Có 341 710.470.082 và Nợ 341/Có 112 146.383.479. Ví dụ PT12544 (20/11/2025, 776.687.888, "thu vay ngân hàng sacombank trả lan thanh trả hwata trả tq") và PT12978 (17/03/2026, 300.000.000) ghi vào 111. Các phiếu chi trả nợ Sacombank cũng ghi vào 111: PC6995 358.934.710, PC7108 333.903.651, PC7203 200.000.000… — [a6](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a6.js)
- Ngược lại, PT12496 và PT12484 ghi vào 112 nhưng diễn giải nói "99 tr tm" (tiền mặt) + phần ck. Mỗi phiếu có 99 tr nên thuộc 111 — [a6]
- Thanh toán nhà cung cấp qua ngân hàng nhưng ghi vào 111, ví dụ: PC6885 403.388.592 "lan thanh vay sacombank", PC6896 121.209.956, PC7228, PC7357, PC7397, PC7403, PC7410, PC7417, PC7418, PC7422 (mỗi phiếu 100.000.000, "ck scb"), PC7407 150.000.000, PC6649 58.623.600 "HwTa BIDV". Có 60 chứng từ như vậy, ròng 111 → 112 = −2.033.912.915 — [sim](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/sim.js)
- Khách chuyển khoản nhưng ghi Nợ 111: PT12046 183.000.000 "anh đăng nộp vào TK mua xe tải", PT12962 100.000.000 "nộp tm vào tk", PT13240, PT13272, PT13818, PT13825 (ck scb) v.v. — [a5], [sim]
- Mô phỏng (chỉ trong bộ nhớ) — [sim]:
  - Hiện trạng: 111 = 5.245.904.034; 112 = −2.695.733.636.
  - Chỉ sửa bán lẻ: 111 = 4.224.906.445.
  - Bán lẻ + ghi nộp tiền tối thiểu để 112 ≥ 0 (cần 2.695.733.636): 111 = 1.529.172.809.
  - Bán lẻ + chuyển 60 chứng từ ngân hàng sang 112 + nộp tiền tối thiểu (cần 4.742.893.354): 111 = 1.515.926.006, 112 = 13.246.803.
  - Không kịch bản nào làm 111 âm.
- Chi lớn bằng tiền mặt có tính chất cá nhân hoặc tài sản: PC6882 1.400.000.000 "Chi duy vay mua chung cư golsea…" (Nợ 1388), PC6892 70.000.000 "chi duy đám cưới" (Nợ 1388), PC6874 360.000.000 "Chi khác" ghi Nợ 331 (ML1). Mua xe tải và ô tô bằng tiền mặt (Nợ 211/Có 111): PC6624 85 tr, PC6641 213 tr, PC6650 116,7 tr, PC6889 95 tr, PC6906 382,2 tr — [a6], [a9](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a9.js)
- Có 82 bút toán 111 tròn triệu và ≥50 tr, tổng 9.963.000.000. Phần lớn là trả Lan Thanh, trả vay Sacombank và lương — [a9]
- Trùng cùng loại, ngày, số tiền và đối tác: 12 cặp, nhưng diễn giải khác nhau nên không phải trùng thật. Riêng PC7042 và PC7053 (24/02/2026, 100.530, "Chi khác", TRANVANTHOI) giống hệt nhau, nghi trùng — [a9]
- Đối ứng bất thường:
  - 19 PT ghi Nợ 111/Có 511 trực tiếp (thu tiền bán hàng không qua hóa đơn, không có 3331), chủ yếu CH Thành Công, tổng ≈11,4 tr.
  - PT12397 ghi Nợ 111/Có 331 1.494.751.
  - PC7421 ghi Nợ 131/Có 111 32.330.866 "Trả tiền mua hàng cho nhà cung cấp" (ECOCROP), lẽ ra Nợ 331.
  - Phiếu chi hoàn tiền khách bán lẻ ("hàng trả lại", "k200") ghi Nợ 331/Có 111 (ví dụ PC6603 2.047.059, PC6626, PC7113), lẽ ra Nợ 131 (hoặc 5213).
  - Nguồn: [a3], [a9]
- Số dư đầu kỳ 111 = 150.000.000 (`initialBalances`). Riêng ngày 01/01/2025 quỹ ròng +14.042.134. Không có dữ liệu nguồn để kiểm chứng con số 150 tr — [a1], [a10](C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_cash/a10.js)
- Bán hàng 111 ngoài bán lẻ: 9 HĐ, 28.785.373. Trong đó có BH45747 23.058.995 (Cty Tùng Anh, nhập trong app 19/10/2026) trong khi khách này vẫn có các PT Có 131, nên có nguy cơ trùng tương tự — [a2], [a10]

### Inferences
Danh sách lỗi xếp hạng theo tác động tới 111:

1. **Thiếu bút toán nộp tiền mặt vào ngân hàng (Nợ 112/Có 111): ≥2,70 tỷ, có thể tới 4,74 tỷ.** Cách sửa: lấy sổ phụ Sacombank/BIDV T06/2025–nay, rồi lập chứng từ "nộp tiền vào TK" (Nợ 1121/Có 1111) đúng ngày và đúng số trên sổ phụ. Nếu chưa có sổ phụ, không được bịa số. Tạm treo chênh lệch theo hướng dẫn TT133/TT99: chênh lệch với ngân hàng chưa rõ nguyên nhân ghi vào 1388/3388 (kiến thức chung, chưa kiểm tra văn bản trong phiên này).
2. **Ghi trùng bán lẻ: ≈1,02 tỷ.** Đổi 824 HĐ (và ≈27 phiếu trả lại) từ 111 sang 131. Xóa ≈990 tr `partnerOpeningBalances` của các kỳ bán lẻ từ 2025 trở đi (Câu 2).
3. **≈60 chứng từ ngân hàng ghi vào 111 (ròng chi ≈2,03 tỷ).** Đổi tài khoản tiền 111 → 112 cho các phiếu vay/trả Sacombank, phiếu chi "ck scb/bidv" và phiếu thu "ck/scb/nộp vào TK". Ngược lại, đổi 99 tr × 2 trong PT12496/PT12484 từ 112 → 111. Bước này làm 111 *tăng* và 112 *âm thêm*. Vì vậy phải làm cùng bước 1, nếu không số dư 112 càng vô lý.
4. **Chi cá nhân hoặc tài sản lớn bằng tiền mặt (1.470 tr Nợ 1388; 891,9 tr Nợ 211; 360 tr "Chi khác" Nợ 331).** Cần xác minh qua ngân hàng. Nếu qua TK, đổi sang 112. Nếu chi cho chủ sở hữu, hạch toán đúng bản chất (1388 phải thu cá nhân, hoặc giảm vốn).
5. **Đối ứng sai:** PC7421 (131 → 331); phiếu chi hoàn tiền khách bán lẻ Nợ 331 (→ 131); 19 PT Có 511 không có hóa đơn hay VAT (→ Có 131 nếu đã có HĐ, hoặc lập HĐ). Nghi trùng PC7053.
- Lưu ý thuế (kiến thức chung, chưa kiểm tra trong phiên): theo Luật thuế GTGT 2024 (hiệu lực 01/07/2025), hàng mua từ 5 triệu đồng trở lên phải có chứng từ thanh toán không dùng tiền mặt mới được khấu trừ thuế GTGT đầu vào. Các khoản trả Lan Thanh, HWATA… nếu để là "tiền mặt" trên sổ sẽ rủi ro bị loại khấu trừ. Đây thêm một lý do phải chuyển chúng sang 112 đúng thực tế.
- Kể cả sau mọi điều chỉnh, quỹ ≈1,5 tỷ vẫn là số lớn với cửa hàng bán lẻ. Cần biên bản kiểm kê quỹ thực tế để chốt.

### Gaps
- Không có sổ phụ ngân hàng trong DB, nên con số nộp tiền thật là ẩn số. Mô phỏng chỉ cho cận dưới (số tối thiểu để 112 không âm).
- Bộ lọc "chứng từ ngân hàng" dựa trên từ khóa trong diễn giải (ck/scb/bidv/sacombank/ngân hàng/vào tk, loại trừ "tm"). Có thể có dương tính giả nhỏ (ví dụ PT13910 8,4 tr) và bỏ sót chứng từ không ghi từ khóa.
- Các căn cứ pháp lý TT133/2016, TT99/2025 và Luật GTGT 2024 nêu trên là kiến thức chung. Trong phiên này không tra cứu web để trích dẫn điều khoản.
