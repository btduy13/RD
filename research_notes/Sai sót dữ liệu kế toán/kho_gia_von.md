# Sai sót dữ liệu kho (TK 156), giá vốn (TK 632) và danh mục hàng hóa

Nguồn: bản sao DB thật `scratchpad/live.db` (chỉ đọc), nạp bằng `loadstate.js` và chạy `recalculateAccounting` của app (bình quân gia quyền liên hoàn, `js/core/accounting-engine.js` `applyStockItem`). Chế độ kế toán đang lưu: `TT200`. Các script: `C:/Users/PC/AppData/Local/Temp/claude/734320ed9b9b2e84/476491b7-ba3f-4074-8061-f6ad73b6769a/scratchpad/audit_inv/a1.js` … `a9.js` (gọi tắt [aN] bên dưới). Mọi số tiền tính bằng VND, đã tính lại theo engine hiện tại.

Quy mô dữ liệu: 1.327 mã hàng; 5.875 phiếu bán (57.330 dòng); 417 phiếu mua; 340 phiếu hàng bán trả lại; 1 phiếu trả hàng NCC; 274 phiếu "Điều chỉnh tồn kho" (`inventory_adjust`) [a1].

## Vì sao 632 (28,03 tỷ) lớn hơn 511 (21,44 tỷ)?

### Takeaway
632 lũy kế ròng là 28.029.076.636, còn 511 là 21.437.913.472. Có hai nguyên nhân chính. Thứ nhất, **tồn đầu kỳ 01/01/2025 (21,72 tỷ) định giá theo giá bán chứ không theo giá vốn**. Vì vậy năm 2025 giá vốn bán hàng vượt doanh thu 26%. Thứ hai, **274 phiếu điều chỉnh tồn kho tháng 7–11/2026 đẩy 13,0 tỷ vào 632**: 12,59 tỷ ghi thẳng, cộng 0,42 tỷ bút toán "Điều chỉnh giá vốn xuất kho âm". Phần lớn các phiếu này là xóa sổ lượng tồn ảo sinh ra từ đầu kỳ sai.

### Cited Findings
- Thành phần 632 ròng [a2]:
  - Giá vốn phiếu bán: +23.118.710.289.
  - Phiếu điều chỉnh tồn kho: +12.588.876.057, cộng bút toán "xuất kho âm" +417.627.576.
  - Phiếu mua bù tồn âm: −7.472.243.183. Trong đó −7.391.450.290 đến từ riêng phiếu NK08606.
  - Hàng bán trả lại: −620.460.999. Trả hàng NCC: −3.433.104.
- Doanh thu và giá vốn chỉ tính trên phiếu bán, theo năm [a7]:
  - 2025: doanh thu 11.169.754.632, giá vốn 14.103.407.570, biên **−26,3%**.
  - 2026: doanh thu 10.770.839.164, giá vốn 9.048.825.542, biên +16,0%.
  - Theo tháng, 632 phiếu bán > 511 ở cả 12 tháng của 2025. Ví dụ 2025-09: 511 là 1.152.219.739, 632 là 1.618.523.749.
  - Bút toán điều chỉnh tồn kho chỉ xuất hiện từ 2026-07: tháng 07 là 250.888.520, 08 là 777.647.880, 09 là 2.864.567.555, 10 là 8.692.851.498, 11 là 2.920.604.
- Có 30.477/57.330 dòng bán có giá vốn > doanh thu, lỗ 5.639.349.854. Trong 30.477 dòng đó, 24.876 dòng (82%) có đơn giá vốn đúng bằng đơn giá tồn đầu kỳ của mã [a6][a7].
- Tồn đầu kỳ [a2][a5]:
  - Giá trị theo mã hàng là 21.721.274.658; số dư đầu kỳ TK 156 trên sổ cái là 21.726.041.106.
  - **601 mã có `initialCost` đúng bằng giá bán `salePrice1` (excelRow[21])**, tổng giá trị 16.956.991.673.
  - 13 mã có giá tồn đầu kỳ > giá bán. Ví dụ BL2000NS: vốn 12.015.934, giá bán 8.950.000. BL1500NS: vốn 7.341.667, giá bán 6.780.000.
- Giá vốn đầu kỳ thổi phồng so với giá mua thực [a5][a9]:
  - So với lần mua thật đầu tiên: 175 mã có giá đầu kỳ > 1,5×, phần thổi phồng 6.195.410.192.
  - So với giá mua cuối trong file Excel (excelRow[20]): 298 mã cao hơn, phần thổi phồng 4.304.972.896.
- Năm mã gây lỗ lớn nhất, tính theo doanh thu − (tồn đầu + mua − tồn cuối) [a5]:

  | Mã | Lãi gộp | Giá vốn đầu kỳ | Giá mua thực | Ghi chú |
  |---|---|---|---|---|
  | OHTND5801 (ống hấp thụ nhiệt) | −1.763.751.514 | 250.000 | 55.000 (NK07895) | 7.463 ống đầu kỳ |
  | BCN1000LIT | −1.486.460.000 | 65.900.000 (= giá bán) | 11.957.860 (excelRow[20]) | Bán 22–24 triệu/bộ |
  | OND25BM | −640.398.672 | 76.356 | 26.564 | |
  | VAN25BMVN | −549.211.131 | 438.372 | 100.403 | |
  | RUOTGA25CAMELTRANG | −366.705.622 | — | — | Lỗi giá mua, xem câu 4 |

  518 mã có lãi gộp âm, tổng −9.727.604.350.
- Một số phiếu có giá vốn ≫ doanh thu [a6]:
  - BH39387 (15/01/2025): BCN1000LIT 2 bộ @22.000.000, giá vốn 131.800.000.
  - BH42293, BH41884, BH43234: BCN1000LIT 1 bộ ~22–24 triệu, giá vốn 65.900.000.
  - BH43531: BCN500LIT 3 @16.500.000, giá vốn 94.220.000.
  - BH44507: 300SOLAHART 1 @50.000, giá vốn 47.255.499.
  - BH42614: OHTND5801 640 ống @177.000, giá vốn 147.235.053.
  - Có 44 phiếu bán mà giá vốn > 3× doanh thu và chênh > 5 triệu.
- Phiếu bán có dòng giá trị 0 [a6]:
  - 227 phiếu bán có tổng tiền 0 nhưng có hàng; 1.744 dòng bán giá 0 mang giá vốn 1.557.089.353.
  - Riêng OHTND5801 chiếm 1.085.375.180, tiếp theo TAMSPENLMT1000 130.565.900 và các mã CHANMAY*D58.
  - Đây là linh kiện giao kèm máy NLMT/bồn nhưng không phân bổ doanh thu.
- Hàng bán trả lại: doanh thu giảm 514.085.756, giá vốn nhập lại 621.762.094. Giá vốn nhập lại lớn hơn doanh thu trả lại [a9].

### Inferences
- Quy trình nạp đầu kỳ đã lấy cột giá bán làm đơn giá tồn. Số lượng đầu kỳ được tính ngược từ `actualStock` (`initialStock = actualStock − mua + bán`, xem `js/accounting.js` dòng ~124–128). Kết quả: đầu kỳ vừa thừa lượng, vừa thừa giá.
  - Tồn 21,7 tỷ là phi lý so với mua có mã hàng năm 2025 chỉ 1,10 tỷ và doanh thu 11,2 tỷ/năm [a9].
- Kết quả là mọi lần xuất bán năm 2025 mang giá vốn ≈ giá bán chưa chiết khấu. Hàng bán chiết khấu ~15% nên lỗ có hệ thống.
- Sang 2026, khi kiểm kê thực tế, lượng tồn ảo bị xóa qua phiếu điều chỉnh vào 632.
- Ước tính: giảm giá trị đầu kỳ 4,3–6,2 tỷ (đối ứng TK 4211 "lợi nhuận chưa phân phối năm trước", vì đây là sai sót số dư đầu kỳ) sẽ giảm tương ứng 632 năm 2025–2026 qua bình quân gia quyền.
- Ngay cả khi loại đầu kỳ và điều chỉnh, 632 phiếu bán năm 2025 (14,1 tỷ) vẫn được "nuôi" bằng tồn ảo. Lý do: hàng mua thật năm 2025 bị ghi vào SP_GENERIC (xem câu 3), không vào từng mã.
- Đề xuất sửa:
  - Định giá lại `initialCost` của 601+ mã theo giá mua thực: hóa đơn mua gần nhất trước 01/01/2025, hoặc excelRow[20].
  - Kiểm tra lại `initialStock` bằng biên bản kiểm kê 31/12/2024.
  - Chạy lại tính giá (TT 99/2025 và TT 133/2016 đều yêu cầu hàng tồn kho theo giá gốc, VAS 02).

### Gaps
- Không có biên bản kiểm kê hay sổ chi tiết 31/12/2024 để xác định lượng và giá đầu kỳ đúng. Các ước tính 4,3–6,2 tỷ dựa trên giá mua sau đó, không phải giá gốc thực tế.
- Chưa tách được 632 năm 2025 "đúng" theo mã hàng, vì 6,59 tỷ mua hàng không có mã.

## Phiếu điều chỉnh tồn kho đáng ngờ và ảnh hưởng lãi/lỗ (711/632)

### Takeaway
Toàn bộ 274 phiếu `inventory_adjust` lập trong 2026-07…2026-11 [a3]:
- 160 phiếu giảm: Nợ 632 / Có 156, 12.588.876.057.
- 114 phiếu tăng: Nợ 156 / Có 711, 979.420.812.
- 271 phiếu có lý do vô nghĩa ("aa", "d", "ádcasdc", "1", "2", …), tổng 6.156.439.167 [a9].
- Không phiếu nào có `adjustCause`. Vì vậy app hạch toán theo cặp cũ 632/711, thay vì 1381 (thiếu chờ xử lý) và 3381 (thừa chờ xử lý) theo TT 99 và TT 133 (`js/accounting.js` `inventoryAdjustEntry`).

### Cited Findings
- Theo tháng [a3]:

  | Tháng | Số phiếu | Tăng (156/711) | Giảm (632/156) | Bút toán tồn âm |
  |---|---|---|---|---|
  | 2026-07 | 44 | 124.823.468 | 250.888.520 | |
  | 2026-08 | 36 | 74.496.701 | 777.647.880 | |
  | 2026-09 | 94 | 719.723.846 | 2.864.567.555 | 417.627.575 |
  | 2026-10 | 98 | 57.843.117 | 8.692.851.498 | |
  | 2026-11 | 2 | 2.533.680 | 2.920.604 | |

- Các phiếu lớn nhất [a3][a4][a9]:
  1. **DK1792726334622** (23/10/2026), SP1330 "Dây đồng trần 10": 86.000 m → 0 @86.000, Nợ 632 **7.396.000.000**, lý do "ádcasdc".
     - Sản phẩm có `initialStock` 86 nhưng excelRow[19] = 86000. Đây là lỗi ×1000.
     - Ngày hôm sau có phiếu mua NK08606 (24/10/2026), SP1330 qty 85.914 @0, để bù tồn âm. Engine sinh Nợ 156 / Có 632 7.391.450.290.
     - Ròng chỉ còn ~4,55 triệu, nhưng phát sinh Nợ/Có 632 và 156 bị thổi phồng ~7,4 tỷ mỗi bên. NK08606 còn có TUDIENNHUA-E9.108S2F ×1 @0 và CAPQUANG ×70 @0.
  2. DK1790560856266 (28/09/2026), BCN1000LIT 18 → 0 @65.900.000 (giá bán), Nợ 632 1.186.200.000, lý do "2". Sau phiếu này mã vẫn tồn −13 bộ (−856.700.000).
  3. DK1788506084207 (04/09/2026), CBL1000LN (chân bồn), −129 → 2. Có hai bút toán:
     - Nợ 156 / Có 711: 411.340.000.
     - Nợ 632 / Có 156: 417.624.576 (bút toán tồn âm).
     - Đơn giá 3.140.000 lấy từ dòng mua NK08567 ghi nhầm giá bồn BL1000NS (5 × 3.140.000) vào mã chân bồn. Chân bồn trước đó luôn nhập/xuất giá 0.
  4. DK1789782443197, OHTND5801 4.742 → 820: 643.811.047 ("d").
  5. DK1787556820808, SPE300INOX 9 → 3: 262.800.000.
  6. DK1790147270845, VAN25BMVN 1.403 → 73: 233.213.798 ("S").
  7. DK1792464065162, BL1500NS 48 → 5: 198.961.000 ("2").
  8. DK1792726589461, SPE220INOX: 136.600.000.
  9. DK1790990580922, BL2000NS 22 → 0: 132.792.000 ("jj").
- Ví dụ cáp CV3X1.5CADIVI [a4]:
  - DK59613291 (09/07/2026): 2.200 → 170, Nợ 632 55.920.410 ("aa").
  - DK60121083 (09/07/2026): 170 → 60, Nợ 632 3.030.170.
  - DK1784691037283 (22/07/2026): −2.880 → 0, Nợ 156 / Có 711 79.335.360 ("ff").
  - Mã này có tồn đầu kỳ −720 (`actualStock` −780). Người dùng giảm rồi lại tăng cùng mã trong hai tuần. Cả hai chiều đều ghi vào kết quả kinh doanh.
- 72 phiếu tăng có mô tả dạng "−X → Y" (sửa tồn âm), tổng 864.236.783 ghi Có 711 [a9].
- 48 phiếu điều chỉnh giá trị 0 [a7]. DK64603666 có `productId` = "2025-08-07" (ngày bị ghi vào mã hàng); hai phiếu khác trỏ tới mã không tồn tại là BONCAUTRANG và VAN25PHUTHINH [a2].
- Phiếu điều chỉnh có đơn giá âm, mã CBL1000LN [a7]:
  - DK1784192611746: −50,33.
  - DK1784853962390: −33,5.
  - DK1784854032366: −33,43.
  - DK1784853946469: −33,4. Phiếu này giảm 152 chân bồn với giá trị −5.077, tức giảm kho mà lại tăng giá trị.
- Lỗi dấu thập phân ×1000 thể hiện trong mô tả [a7][a8]:
  - DK27634940: CRT253/4PPRDEN "98.226 → 334", tăng 235,774 cái.
  - DK1784690357340: VAN25BMVN "−65.465 → 38", tăng 103,465 cái, 14.511.118 vào 711.
  - DK1789694146027: CO34DPVC-BM "−18.901 → 50".

### Inferences
- Các phiếu điều chỉnh không phải nghiệp vụ kiểm kê có biên bản. Chúng là thao tác "ép số tồn về số đếm" để che sai sót đầu kỳ, nhập mua thiếu mã (SP_GENERIC) và bán vượt tồn.
- Theo TT 99/2025 (TK 156/138/338) và TT 133/2016, chênh lệch kiểm kê phải qua 1381/3381 chờ xử lý, có biên bản và quyết định xử lý. Không được ghi thẳng 632/711 với lý do "aa".
- 711 = 979 triệu năm 2026 là thu nhập khác ảo. Nó làm tăng lợi nhuận chịu thuế TNDN giả tạo, trong khi 632 tăng 13 tỷ làm giảm lợi nhuận giả tạo.
- Đề xuất sửa:
  - (a) Hủy hoặc đảo cặp DK1792726334622 + dòng SP1330 trên NK08606. Sửa `initialStock`/excelRow của SP1330 về số đúng (86 m hoặc 86.000 m tùy kiểm kê).
  - (b) Với 271 phiếu lý do vô nghĩa: yêu cầu biên bản kiểm kê, gán `adjustCause`. Thiếu chưa rõ nguyên nhân đưa vào 1381, thừa vào 3381. Chỉ phần thiếu trong định mức mới vào 632.
  - (c) Phiếu tăng để bù tồn âm: không ghi 711. Thay vào đó tìm hóa đơn mua bị thiếu hoặc sửa phiếu bán sai mã (thường là bán mã khác hoặc bán linh kiện kèm).
  - (d) Xóa các phiếu đơn giá âm của CBL1000LN; sửa dòng NK08567 về mã BL1000NS.
  - (e) Sửa phiếu DK64603666 có mã hàng "2025-08-07".

### Gaps
- Không có biên bản kiểm kê thực tế để biết phiếu nào phản ánh hao hụt thật.
- Lý do "KK" (3 phiếu, 415.804.285) và "hết hàng" có thể là kiểm kê thật nhưng không xác minh được.

## Tồn âm cuối 2025 và hiện tại; giá trị tồn kho so với sổ 156

### Takeaway
- Tồn âm: 28 mã tại 31/12/2025; 60 mã hiện tại, tổng giá trị −2.205.489.042.
- Sổ cái 156 hiện tại là 9.456.665.298, còn tổng giá trị kho theo mã là 2.866.089.171. Chênh **6.590.576.127**, khớp gần đúng với 6.593.329.935 tiền mua hàng ghi vào mã ảo `SP_GENERIC` (112 phiếu năm 2025): có trên sổ 156 nhưng không có trong kho chi tiết.

### Cited Findings
- SP_GENERIC: 112 phiếu mua, tất cả năm 2025, mỗi phiếu 1 dòng qty 1, tổng 6.593.329.935 [a2][a6]. Lớn nhất:
  - NK08264 (16/12/2025): 515.797.440, "Hàng NK".
  - NK07885 (22/03/2025): 442.340.000, "NHẬP HÀNG TQ hóa đơn 21032025".
  - NK08129 (09/09/2025): 432.054.575.
  - NK08135: 233.392.482 (Cty Lan Th…).
  - Mua có mã hàng năm 2025 chỉ 1.103.954.112, năm 2026 là 7.089.360.908 [a9].
- Sổ 156 tại 31/12/2025 là 15.791.344.770 [a7]. Hàm `calculateInventoryValueAt(products, vouchers, '2025-12-31')` trả về 0 trong harness, nên chưa đối chiếu được giá trị theo mã tại ngày này [a9].
- Mã tồn âm tại 31/12/2025 (tính lại theo lượng) [a7]:
  - CV3X1.5CADIVI: −720 m (~−19,8 triệu).
  - BL2000NS: −1 bộ.
  - Y114BMD: −27. Y114-PN9: −17.
  - NB25PPRBM: −502.
  - RUOTGA40/32: −220 m.
  - VAN25BMVN: −9,465. CO34DPVC-BM: −146,901. Hai số lẻ này cho mã đếm theo cái là dấu hiệu lỗi ×1000.
- Mã tồn âm hiện tại [a7]:

  | Mã | Tồn | Giá trị |
  |---|---|---|
  | BCN1000LIT | −13 | −856.700.000 |
  | VAN25BMVN | −1.298 | −227.339.605 |
  | BL1500NS | −41 | −189.707.000 |
  | BL2000NS | −21 | −126.756.000 |
  | SPE220INOX | −3 | −102.450.000 |
  | SLK18D5803 | −41 | −80.919.385 |
  | SLK12D5803 | −46 | −75.809.082 |
  | SLK12D5801 | −47 | −72.576.733 |
  | CO27PVCBM | −10.221 | −45.076.950 |
  | THO90BM | −686 | −42.178.627 |
  | CO25BMVN | −8.612 | −40.632.385 |

- Mã có giá trị kho âm dù lượng dương (đơn giá âm) [a7]:
  - DAINAPBONLANH: 25 @ −183.840.
  - BITRODIEN58: 185 @ −1.838.
  - HTD: 13 @ −6.923.
- Bút toán "Điều chỉnh giá vốn xuất kho âm" (đặt lại đơn giá khi lần nhập bù hết tồn âm): ròng −7.472.243.183 trên phiếu mua [a9]. Trừ NK08606 thì còn ~−80,8 triệu. Ví dụ: NK08483 −24.681.024 (OLD90X8.2), NK08291 −14.136.300, NK08431 −9.648.440.

### Inferences
- Gốc của chênh 156/kho: hàng nhập 2025 không gắn mã. Hàng bán ra vẫn trừ vào tồn đầu kỳ ảo (giá bán), nên kho chi tiết cạn dần và âm. Còn 156 trên sổ cái vẫn giữ 6,59 tỷ "hàng không tên".
- Đây là sai sót trọng yếu: số dư 156 trên BCTC 31/12/2025 không có sổ chi tiết chứng minh.
- Đề xuất sửa:
  - (1) Phân bổ 112 phiếu SP_GENERIC về từng mã theo hóa đơn gốc (TQ/Lan Th…). Sau đó tồn âm và phiếu điều chỉnh 2026 phần lớn sẽ không còn cần.
  - (2) Bật chặn tồn âm. Engine đã có `findNegativeStockProducts`; cần đảm bảo `allowNegativeStock` không bật.
  - (3) Với 60 mã âm hiện tại: bổ sung phiếu nhập thiếu, không dùng phiếu điều chỉnh vào 711.

### Gaps
- Chưa tính được giá trị kho theo mã tại 31/12/2025 vì hàm trả 0 trong harness, có thể do sai tham số hoặc định dạng trả về.
- Không xác định được 6,59 tỷ SP_GENERIC tương ứng mã hàng nào khi chưa có hóa đơn gốc.

## Bất thường giá mua (lệch ×1000, nhầm SL/đơn giá) và dữ liệu danh mục

### Takeaway
- Có 43 dòng mua lệch > 4× hoặc < 0,25× so với giá tham chiếu của chính mã đó, lệch ròng +498.041.033 [a6].
- Ba mã bị thổi đơn giá bình quân phi lý (RUOTGA25CAMELTRANG, NBRT27INOX, NOI21BM). Hậu quả là lỗ ảo hàng chục triệu mỗi phiếu bán.
- Danh mục có mã rác (A, B, BB "bbbb", "1", V4/V5) và 8 nhóm trùng tên.

### Cited Findings
- Giá mua bất thường [a6]:
  - RUOTGA25CAMELTRANG (ruột gà, giá bán 8.450/m):
    - NK08434 (28/04/2026): 1.000 m @412.222 = 379.244.240, thừa ~375 triệu.
    - NK08351 (02/03/2026): 500 m @412.222 = 189.622.120, thừa ~187,5 triệu.
    - Trong khi NK07926 (17/04/2025) mua 1.000 m @3.248.
    - Đơn giá bình quân hiện tại 155.776/m. Mỗi phiếu bán 250 m (BH45294, BH44056, BH44164, BH44580, BH44607) lỗ ~37,3 triệu.
  - NBRT27INOX (nút bịt, giá bán 40.000):
    - NK08564 (19/08/2026): 229 @1.126.446 = 257.956.134.
    - NK08415 (01/03/2026): 40 @1.126.446 = 45.057.840.
    - Giá đúng khoảng 19.800 (NK08250). Đơn giá bình quân hiện 1.054.879.
  - NOI21BM: NK07842 (01/01/2025), 1 cái @61.215.603. Đây là tổng tiền phiếu nhập vào ô đơn giá; giá thật ~1.841.
  - RUOTGA20CAMELTRANG: NK08351 và NK08434, 1.000 m @28.156, so với 2.428 ở NK07926.
  - NOI20SINO: NK08474, NK08366, NK08446, NK08444 @42.889, so với ~1.020. Lệch ~42×, gần giống nhầm giá thùng thành giá cái.
  - CBL500LN: NK07948, 10 @762.000, so với ~51.237.
  - TUDIENCAMUNG: 3.000.000 (NK07853) xen kẽ 10.000 (NK08292, NK08319, NK08451).
- Mã có đơn giá bình quân > 3× giá bán [a7]:
  - VIOLABOLANH504: 1.350.000 so với 270.000.
  - RUOTGA25CAMELTRANG: 155.776 so với 8.450.
  - NBRT27INOX: 1.054.879 so với 40.000.
  - NOI40BMVN: 465.962 so với 19.224.
- Có 102 dòng mua có số lượng nhưng giá trị 0 [a6]. Ví dụ phiếu NK07842 (01/01/2025, "hóa đơn 222", 20 dòng): NB114TH 300, NB90TH 300, B 1000, …. Thêm các dòng chân bồn CBL1000LN @0.
- Dòng bán trỏ tới mã không tồn tại: 211 dòng, doanh thu 661.951.545, giá vốn 0 (SP_GENERIC, SLK20D5802, BL300NS, CBL1000LD-QC…) [a2].
- Lỗi dấu thập phân ở `actualStock`, sinh tồn đầu kỳ lẻ cho mã đếm theo cái [a8]:
  - CRT253/4PPRDEN: actual 1,226 (đúng là 1.226).
  - VAN25BMVN: actual 1,535.
  - CO34DPVC-BM: 3678,099.
  - TACKE3P: 2250,19.
  - CO21DPVC-BM: 541,5. NRT251/2BM: 57,4. K200G: 103,2. TI8L2M: 161,5.
- Mã rác và catch-all [a7][a8]:
  - "A" (Cái): tồn đầu 1.411,5 @0, dùng cho hàng trăm dòng bán dịch vụ/phụ kiện. Có dòng nhập giá âm NK07851 −300.000.
  - "B" và "BB" cùng tên "bbbb": BB tồn đầu 100.000 m @0, hiện 99.970.
  - "1": tồn −6.
  - V4/V5 tên "V". VC "Chi phí vận chuyển" là dịch vụ nhưng nằm trong kho.
- Trùng tên (8 nhóm) [a7]:
  - NG49/21BM và "NG49/21BM." (cả hai đang có tồn: 56 và 23).
  - NRN49/34BM và NRN49/34.
  - THONO90TP và CONTHONO90TP.
  - DAYRUT2TAC, DAYRUT2TT, DAYRUT2T.
  - DAYRUT3TAC và DAYRUT3T; DAYRUT4T và DAYRUT4TAC.
  - B và BB.

### Inferences
- RUOTGA25 và NBRT27INOX có dấu hiệu nhập tổng tiền hoặc giá theo cuộn/thùng vào ô đơn giá theo mét/cái. NOI21BM trên NK07842 là tổng phiếu nhập vào một dòng.
- Đề xuất sửa:
  - Sửa đơn giá các dòng trên theo hóa đơn.
  - Hợp nhất mã trùng (chuyển chứng từ sang mã chính rồi vô hiệu hóa mã phụ).
  - Tách mã dịch vụ/catch-all (A, B, BB, VC) khỏi kho 156: ghi doanh thu dịch vụ 5113 và không theo dõi tồn.
  - Gắn mã thật cho 211 dòng bán thiếu mã.
  - Sửa `actualStock` lẻ thập phân.
- Không tìm thấy trường hợp đảo SL ↔ đơn giá rõ ràng (qty ≈ giá). Các lỗi chủ yếu là sai đơn vị tính hoặc ×1000. SP1330 là lỗi ×1000 ở số lượng (86 ↔ 86.000).

### Gaps
- Giá tham chiếu là trung vị giá mua của chính mã, cộng excelRow[20]. Mã chỉ mua 1–2 lần (TUDIENCAMUNG) không chắc lần nào đúng; cần đối chiếu hóa đơn.
- Chưa rà toàn bộ 30.477 dòng bán dưới giá vốn theo từng hóa đơn. Phần lớn là hệ quả của giá vốn đầu kỳ, không phải lỗi giá bán.
