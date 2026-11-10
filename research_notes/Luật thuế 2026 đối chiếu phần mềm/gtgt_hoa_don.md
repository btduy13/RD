# Thuế GTGT và hóa đơn điện tử 2026 — đối chiếu với phần mềm (công ty bán lẻ vật tư ngành nước + lắp đặt)

> Ngày tra cứu: 09/11/2026. Phương pháp: WebSearch/WebFetch không chạy được trong phiên này (lỗi model). Nguồn lấy bằng curl qua Google News RSS, Yahoo, và đọc **bản toàn văn LuatVietnam đã tải về trong các phiên trước** (NĐ 254/2026, NĐ 181/2025 đã cập nhật NĐ 144/2026 và NĐ 359/2025, TT 91/2026, TT 69/2025, NĐ 70/2025). LuatVietnam hôm nay chặn curl bằng Cloudflare, nên không tải lại được; trích dẫn dùng URL gốc của các bản đã tải. thuvienphapluat.vn không đọc (Cloudflare).
>
> **Sửa tiền đề của đề bài.** Đề bài coi NĐ 123/2020 sửa bởi NĐ 70/2025 là văn bản hóa đơn hiện hành, và hỏi "TT 89/2025". Thực tế đến 09/11/2026:
> - Từ **01/7/2026**, **NĐ 254/2026/NĐ-CP** bãi bỏ NĐ 123/2020, Điều 1 NĐ 41/2022 và NĐ 70/2025. **TT 91/2026/TT-BTC** bãi bỏ TT 32/2025. NĐ 123 + NĐ 70 + TT 32 chỉ còn áp dụng cho hóa đơn lập từ 01/6/2025 đến 30/6/2026 (**đã hết hiệu lực**).
> - Mẫu 01/GTGT mới thuộc **TT 89/2026/TT-BTC** (không phải "TT 89/2025"). TT 80/2021 vẫn đang được dùng trên thực tế vì HTKK chưa có mẫu mới.
>
> Ký hiệu verdict cho phần đối chiếu: **ĐÚNG** = app đã làm đúng; **SAI** = app làm sai; **THIẾU** = app chưa có; **CHƯA RÕ** = không đủ nguồn để kết luận.

## 1. Luật Thuế GTGT 48/2024/QH15 và NĐ 181/2025: thuế suất, ngưỡng 5 triệu, lắp đặt, thời hạn khấu trừ, phương pháp tính, hoàn thuế

### Takeaway
Vật tư ngành nước (ống, van, phụ kiện, thiết bị vệ sinh) và dịch vụ lắp đặt đều chịu thuế suất chuẩn 10%, đang tạm giảm còn 8% đến 31/12/2026. Đầu vào từ 5 triệu đồng (đã gồm thuế) phải có chứng từ không dùng tiền mặt mới được khấu trừ, kể cả khi mua nhiều lần trong ngày của cùng một người bán. Lắp đặt có giá tính thuế và thời điểm tính thuế riêng: tính tại lúc nghiệm thu, bàn giao, không phụ thuộc đã thu tiền hay chưa. App làm đúng ngưỡng 5 triệu và quy tắc cộng dồn trong ngày. App còn thiếu ba thứ: xử lý mua chịu rồi trả tiền mặt, nộp tiền mặt vào tài khoản người bán, và nghiệp vụ lắp đặt. App cũng mặc định thuế suất 0%, đây là rủi ro.

### Cited Findings
**Ngưỡng thanh toán không dùng tiền mặt (hiệu lực từ 01/7/2025)**
- NĐ 181 Đ26 (đoạn mở đầu): phải có chứng từ thanh toán không dùng tiền mặt cho hàng hóa, dịch vụ mua vào (kể cả nhập khẩu) "từ 05 triệu đồng trở lên đã bao gồm thuế giá trị gia tăng". — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html)
- Đ26.1: chứng từ không dùng tiền mặt theo NĐ 52/2024. **Không tính** trường hợp bên mua nộp tiền mặt vào tài khoản của bên bán. — same
- Đ26.3: mua của cùng một người nộp thuế, mỗi lần dưới 5 triệu nhưng nhiều lần trong cùng ngày, tổng từ 5 triệu trở lên thì chỉ được khấu trừ khi có chứng từ không dùng tiền mặt. — same
- Đ26.2.g, sửa bởi Điều 4 NĐ 144/2026 (hiệu lực 20/6/2026): mua trả chậm, trả góp từ 5 triệu mà chưa đến hạn thanh toán theo hợp đồng thì vẫn được khấu trừ. Đến hạn mà không có chứng từ không dùng tiền mặt thì điều chỉnh giảm phần không có chứng từ vào kỳ phát sinh nghĩa vụ thanh toán. Sau đó có chứng từ thì được khai khấu trừ lại. — same; [LuatVietnam NĐ 144/2026](https://luatvietnam.vn/thue/nghi-dinh-144-2026-nd-cp-sua-doi-nghi-dinh-181-2025-ve-luat-thue-gtgt-433921-d1.html) (nội dung sửa đổi lấy từ ghi chú `xac_minh_truoc_sua.md` #4)
- Đ26.2.a–đ: được khấu trừ khi thanh toán bù trừ (cần điều khoản hợp đồng và biên bản đối chiếu), thanh toán ủy quyền qua bên thứ ba (cần ghi trong hợp đồng), hoặc trả bằng cổ phiếu, trái phiếu. Phần còn lại sau bù trừ nếu trả tiền mặt từ 5 triệu thì không được khấu trừ. Đ26.2.i: nhân viên thanh toán không dùng tiền mặt, sau đó công ty hoàn trả nhân viên không dùng tiền mặt thì được khấu trừ. — same
- Đ23.16 (đã ghi trong phiên trước): thuế GTGT đầu vào không được khấu trừ thì được tính vào chi phí hoặc nguyên giá, **trừ** thuế của hàng mua từ 5 triệu không có chứng từ không dùng tiền mặt. — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html)
- Trước 01/7/2025 ngưỡng là 20 triệu (TT 219/2013 Đ15, **đã hết hiệu lực**). — `thue_gtgt_hoa_don.md` §1

**Thời hạn kê khai, khấu trừ đầu vào**
- Đ23.5: thuế đầu vào phát sinh trong tháng, quý nào được kê khai, khấu trừ ngay trong kỳ đó, dù hàng đã xuất dùng hay còn tồn kho. Phần chưa khấu trừ hết được chuyển sang kỳ sau. — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html)
- Đ23.6: hóa đơn đầu vào kê khai sai hoặc sót được khai **trước khi cơ quan thuế công bố quyết định kiểm tra, thanh tra**. Có hai trường hợp:
  - (a) Khai vào kỳ gốc nếu việc đó làm tăng thuế phải nộp hoặc giảm thuế được hoàn. Phải nộp thêm tiền chậm nộp.
  - (b) Khai vào kỳ phát hiện nếu khai vào kỳ gốc làm giảm thuế phải nộp, hoặc chỉ làm thay đổi số thuế còn được khấu trừ chuyển kỳ sau.
  
  Luật không còn giới hạn thời gian khấu trừ (bỏ quy định cũ "trong vòng 6 tháng" từ trước năm 2016). — same
- Đ23.7: thuế đầu vào của hàng dùng để biếu, tặng, khuyến mại, quảng cáo được khấu trừ. — same

**Thuế suất; lắp đặt; hàng bán kèm lắp đặt**
- Danh mục 5% của NĐ 181 Đ19 có **nước sạch** nhưng không có vật tư ngành nước. Không có điều nào cho vật tư ngành nước hưởng 0% hay không chịu thuế, nên thuế suất mặc định là 10% (Luật 48/2024 Đ9). — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html) (danh sách Đ19 đọc trong phiên trước; không có dòng "ống nước", "thiết bị vệ sinh")
- NĐ 181 Đ7.3: giá tính thuế của xây dựng, lắp đặt là giá trị công trình, hạng mục hoặc phần việc bàn giao, **gồm cả nguyên vật liệu, máy móc, thiết bị**, chưa có thuế GTGT. Lắp đặt không bao thầu vật tư thì giá tính thuế chỉ gồm giá trị lắp đặt. — same
- NĐ 181 Đ16.6: thời điểm tính thuế GTGT của xây dựng, lắp đặt là lúc **nghiệm thu, bàn giao** công trình, hạng mục hoặc khối lượng hoàn thành, không phân biệt đã thu tiền hay chưa. — same
- NĐ 254 Đ9.4.c dùng cùng thời điểm này làm thời điểm lập hóa đơn. Đ9.3: giao hàng nhiều lần hoặc bàn giao từng hạng mục thì mỗi lần đều phải lập hóa đơn. — [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html)
- TT 69/2025 Phụ lục I, tỷ lệ % cho phương pháp trực tiếp: "Xây dựng, lắp đặt có bao thầu nguyên vật liệu" thuộc nhóm **3%**; "không bao thầu nguyên vật liệu" thuộc nhóm **5%**; phân phối, bán lẻ hàng hóa **1%**. — [LuatVietnam TT 69](https://luatvietnam.vn/thue/thong-tu-69-2025-tt-btc-huong-dan-luat-thue-gtgt-theo-nghi-dinh-181-2025-nd-cp-404453-d1.html)

**Phương pháp tính thuế**
- NĐ 181 Đ21.1: phương pháp khấu trừ bắt buộc với cơ sở có doanh thu năm từ 1 tỷ đồng trở lên. Doanh thu tính theo tờ khai từ tháng 11 năm trước đến tháng 10 năm nay (hoặc quý 4 năm trước đến quý 3 năm nay). Phương pháp đã chọn **áp dụng ổn định 2 năm liên tục**. Đ21.2: cơ sở dưới 1 tỷ được tự nguyện đăng ký khấu trừ. — [LuatVietnam NĐ 181](https://luatvietnam.vn/thue/nghi-dinh-181-2025-nd-cp-huong-dan-luat-thue-gia-tri-gia-tang-404357-d1.html)

**Hoàn thuế cơ bản**
- Có bốn trường hợp được hoàn:
  - NĐ 181 Đ29: xuất khẩu, khi thuế chưa khấu trừ hết từ 300 triệu đồng trở lên trong tháng, quý.
  - Đ30: dự án đầu tư.
  - Đ31: cơ sở **chỉ** sản xuất, cung cấp hàng hóa, dịch vụ 5%, khi thuế chưa khấu trừ hết từ 300 triệu sau 12 tháng hoặc 4 quý liên tục.
  - Đ32: giải thể, phá sản.
  
  — same
- Đ37: điều kiện hoàn là nộp theo phương pháp khấu trừ, có sổ sách kế toán và có tài khoản ngân hàng theo mã số thuế. Khoản 3 (người bán phải đã kê khai, nộp thuế) **bị bãi bỏ bởi NĐ 359/2025** (cùng hướng với Luật 149/2025 bãi bỏ Đ15.9.c Luật). — same; Luật 149/2025 theo `thue_gtgt_hoa_don.md` §1

### Inferences
- Công ty nhỏ chỉ bán hàng và lắp đặt trong nước **không thuộc trường hợp được hoàn thuế**. Số thuế đầu vào chưa khấu trừ hết chỉ được chuyển kỳ sau (chỉ tiêu [43] → [22]). Cảnh báo hoàn thuế trong app chỉ cần cho trường hợp giải thể.
- Hợp đồng "cung cấp và lắp đặt" trọn gói có thể được coi là **lắp đặt có bao thầu vật tư**. Khi đó hóa đơn lập lúc nghiệm thu cho toàn bộ giá trị, gồm cả vật tư. Bán vật tư rồi lắp đặt riêng thì có hai hóa đơn: vật tư lập lúc giao hàng (Đ9.1), lắp đặt lập lúc nghiệm thu (Đ9.4.c). Vì cả hai đều 10% (8% đến hết 2026), thuế suất không thay đổi. Khác biệt chỉ ở **thời điểm** lập hóa đơn và kê khai.
- Hợp đồng lắp đặt ký năm 2026 nhưng **nghiệm thu từ 01/01/2027** sẽ chịu 10%, vì thuế suất theo thời điểm nghiệm thu, bàn giao, trừ khi có văn bản gia hạn mức 8%. Thu tiền trước không làm thay đổi điều này với lắp đặt, vì Đ9.4.c không theo thời điểm thu tiền như dịch vụ thông thường ở Đ9.2. Đây là suy luận, chưa có văn bản hướng dẫn riêng.

### App check (đối chiếu code)
| Quy tắc | Verdict | Chi tiết trong app | Căn cứ |
|---|---|---|---|
| Ngưỡng 20tr đến 30/6/2025, 5tr từ 01/7/2025, tính trên tổng gồm thuế | **ĐÚNG** | `js/core/tax-rules.js` key `vat.cashThreshold`; `isCashOverVatThreshold` so sánh `totalAmount >= rule.value` (`js/accounting.js:47`) | NĐ 181 Đ26 |
| Cộng dồn nhiều hóa đơn cùng người bán trong một ngày | **ĐÚNG** | `cashPurchaseDayKey` (`js/accounting.js:56-59`). NCC vãng lai xét từng hóa đơn, đây là cách xử lý hợp lý vì vãng lai không phải một người nộp thuế | NĐ 181 Đ26.3 |
| Thuế không được khấu trừ thì không được tính vào chi phí được trừ TNDN | **ĐÚNG** | Gán `v.citNonDeductible = true` cùng `vatNonDeductible` | NĐ 181 Đ23.16; NĐ 320/2025 Đ9 |
| Mua chịu (331) rồi trả bằng tiền mặt từ 5tr | **THIẾU** | App chỉ xét `paymentMethod === "111"` lúc lập phiếu mua. Phiếu chi tiền mặt trả nợ 331 sau này không làm giảm khấu trừ, không có bút toán Nợ 156/632 / Có 1331 | NĐ 181 Đ26.2.g (sửa bởi NĐ 144/2026 Đ4) |
| Mua trả chậm: khi đến hạn mà chưa có chứng từ thì điều chỉnh giảm, sau đó khấu trừ lại | **THIẾU** | Không có trường hạn thanh toán hay cảnh báo đến hạn | NĐ 181 Đ26.2.g |
| Nộp tiền mặt vào tài khoản người bán không được coi là không dùng tiền mặt | **THIẾU** | Phiếu ghi 112 thì luôn được coi là hợp lệ. Không có tùy chọn đánh dấu "nộp tiền mặt vào TK người bán" | NĐ 181 Đ26.1 |
| Kê khai bổ sung đầu vào sai, sót | **CHƯA RÕ / THIẾU** | Không có luồng kê khai bổ sung. Người dùng phải nhập tay [37]/[38] | NĐ 181 Đ23.6 |
| Dịch vụ lắp đặt: doanh thu 5113, hóa đơn lập lúc nghiệm thu | **THIẾU** | Không có loại hàng "dịch vụ" trên chứng từ bán. 5113 chỉ xuất hiện khi nhập Excel (`js/excel-integration.js:1219`). Ngày hóa đơn = ngày chứng từ, không có ngày nghiệm thu | NĐ 181 Đ7.3, Đ16.6; NĐ 254 Đ9.4.c |
| Thuế suất mặc định của dòng hàng | **SAI (rủi ro)** | `fieldDefaults.taxRate: "0"` (`js/modules/sales.js:3004`, `purchase.js:2553`); `createDynamicVatSelect` để dòng mới là "0" (0% = xuất khẩu, khai vào [29]). Hàng hóa không có thuế suất mặc định theo mặt hàng. Nếu người dùng quên chọn thì doanh số bán trong nước bị khai thành 0%. Hiện app chỉ có cảnh báo cho dòng 10% trong thời gian giảm thuế, **không cảnh báo dòng 0%** | Luật 48/2024 Đ9; NĐ 181 Đ17-18 (điều kiện 0%) |
| Hoàn thuế | Không cần cho đối tượng này | — | NĐ 181 Đ29-32 |

### Gaps
- Chưa đọc trực tiếp văn bản Luật 48/2024 Đ9 (thuế suất) và Đ14 (điều kiện khấu trừ). Phần trên dựa vào NĐ 181.
- Không tìm được văn bản hoặc công văn 2025–2026 về "hàng hóa bán kèm lắp đặt" (gộp hay tách thuế suất). Quy định cũ TT 219 đã hết hiệu lực. Với đối tượng này, khoảng trống không ảnh hưởng thuế suất, vì vật tư và lắp đặt cùng 10%.
- Chưa có toàn văn NĐ 144/2026 Đ4. Nội dung sửa Đ26.2.g lấy từ ghi chú xác minh của phiên trước.

## 2. NĐ 174/2025 — giảm thuế GTGT từ 10% xuống 8%: phạm vi, loại trừ, thời hạn; gia hạn sang 2027?

### Takeaway
Mức 8% áp dụng từ 01/7/2025 đến 31/12/2026 cho hàng hóa, dịch vụ đang chịu 10%, trừ các nhóm bị loại. Vật tư ngành nước và dịch vụ lắp đặt không bị loại nên được hưởng 8%. Riêng **ống, phụ kiện có thể bị coi là "sản phẩm kim loại" mã VSIC 24**, nên cần xem xét. Đến 09/11/2026 **chưa có văn bản gia hạn mức 8% sang 2027**. App làm đúng về thời hạn và phụ lục, nhưng chưa có cờ "loại trừ" theo mặt hàng.

### Cited Findings
- NĐ 174/2025 Đ2.1: hiệu lực từ 01/7/2025 đến hết 31/12/2026. Căn cứ NQ 204/2025/QH15. — [LuatVietnam NĐ 174](https://luatvietnam.vn/thue/nghi-dinh-174-2025-nd-cp-chinh-sach-giam-thue-gtgt-theo-nghi-quyet-204-2025-qh15-404331-d1.html); [Báo Chính phủ](https://baochinhphu.vn/giam-thue-gia-tri-gia-tang-tu-01-7-2025-den-het-31-12-2026-10225070118590677.htm)
- Các nhóm không được giảm:
  - Phụ lục I: viễn thông, tài chính, ngân hàng, chứng khoán, bảo hiểm, bất động sản, **sản phẩm kim loại (mã 24: sắt thép cơ bản 241, kim loại màu 2420, đúc 243)**, khai khoáng (trừ than).
  - Phụ lục II: hàng hóa, dịch vụ chịu thuế tiêu thụ đặc biệt (trừ xăng).
  
  Mã 25–33 (sản phẩm kim loại đúc sẵn, thiết bị điện, đồ gia dụng) và xây dựng, lắp đặt **không** nằm trong danh sách loại trừ. — same (đọc trong phiên trước, `thue_gtgt_hoa_don.md` §2)
- Đ1.3.a: hóa đơn GTGT ghi "8%". Đ1.4: hóa đơn có nhiều thuế suất phải ghi thuế suất từng dòng. Đ1.5: lập sai thuế suất thì xử lý theo quy định hóa đơn (điều chỉnh hoặc thay thế). Đ1.6: kê khai kèm **Mẫu 01, Phụ lục III NĐ 174**. — same
- Gia hạn sang 2027: chưa có văn bản. Kết quả tìm Google News RSS ngày 09/11/2026 ("gia hạn giảm thuế GTGT 8% 2027", "giảm thuế GTGT năm 2027 Quốc hội") chỉ trả về:
  - Bài Laodong.vn 29/10/2026 về thu tiền trước dịch vụ 2026–2027.
  - NQ 43/2026/QH16 (chỉ giảm TNCN, TNDN).
  - Các tin năm 2025 về NĐ 174.
  
  — [Google News RSS query](https://news.google.com/rss/search?q=gia+h%E1%BA%A1n+gi%E1%BA%A3m+thu%E1%BA%BF+GTGT+8%25+2027&hl=vi&gl=VN&ceid=VN:vi); [xaydungchinhsach 20/8/2026 — Bộ Tài chính: giảm GTGT hiệu lực đến hết 2026](https://xaydungchinhsach.chinhphu.vn/viec-ban-hanh-chinh-sach-giam-thue-o-thoi-diem-hien-tai-la-het-suc-can-thiet-va-mang-tinh-cap-bach-119260820185547914.htm); [chinhsachonline 29/10/2026](https://chinhsachonline.chinhphu.vn/thu-truoc-tien-dich-vu-den-het-2027-tinh-giam-thue-gtgt-the-nao-93147.htm)

### Inferences
- Ống thép mạ kẽm (ống sắt tráng kẽm), có thể cả ống đồng: nếu cơ quan thuế xếp vào mã 241 hoặc 2420 ("sản phẩm kim loại") thì **không được giảm**, giữ 10%. Ống nhựa PPR/uPVC, van, thiết bị vệ sinh sứ, máy bơm và dịch vụ lắp đặt thì được 8%. Mỗi mặt hàng cần một cờ "không được giảm theo NĐ 174". Mức độ không chắc chắn: trung bình. Việc xếp ống thép theo mã 241 hay 25 phụ thuộc mã HS của Phụ lục I, chưa kiểm tra được.
- Kỳ họp Quốc hội cuối năm 2026 vẫn có thể ban hành nghị quyết gia hạn. App đã để mức 8% thành quy tắc theo ngày, nên chỉ cần thêm dòng vào bảng `TAX_RULES` nếu có gia hạn.

### App check
| Quy tắc | Verdict | Chi tiết | Căn cứ |
|---|---|---|---|
| Khoảng thời gian 8%: 01/7/2025–31/12/2026 | **ĐÚNG** | `vat.reduced8.window` | NĐ 174 Đ2.1 |
| Phụ lục giảm thuế: số giảm = giá trị × (10%−8%), theo dòng bán ra thuế suất 8% | **ĐÚNG** | `buildVatReductionAppendix`; có cảnh báo khi có dòng 8% ngoài thời gian giảm | NĐ 174 Đ1.6, Mẫu 01 PL III |
| Cảnh báo dòng 10% trong thời gian giảm | **ĐÚNG** | `voucher-form-ui.js:861-864` | NĐ 174 Đ1 |
| Cờ mặt hàng bị loại trừ (VSIC 24, hàng chịu thuế TTĐB) | **THIẾU** | Không có cờ trên danh mục hàng. Cảnh báo "kiểm tra các dòng 10%" không phân biệt mặt hàng bị loại | NĐ 174 PL I, PL II |
| Hàng bán trả lại năm 2027 của hóa đơn 8% năm 2026 | **ĐÚNG một phần** | Phụ lục vẫn tính số giảm và có cảnh báo. Quy tắc điều chỉnh theo thuế suất gốc là thực hành, chưa có văn bản | NĐ 174 Đ1.5; TT 91 Đ10 |

### Gaps
- Chưa trích được nguyên văn mã HS/VSIC của ống thép, ống đồng trong Phụ lục I NĐ 174.
- Không loại trừ được khả năng có nghị quyết gia hạn được thông qua sau 09/11/2026. Cần kiểm tra lại trước 31/12/2026.

## 3. Hóa đơn điện tử: NĐ 123/2020 + NĐ 70/2025 (hết hiệu lực 30/6/2026) → NĐ 254/2026 + TT 91/2026 (từ 01/7/2026)

### Takeaway
Bán lẻ cho người tiêu dùng phải lập hóa đơn **cho từng lần bán**, tại thời điểm chuyển giao hàng. Không có quy định cho phép doanh nghiệp bán lẻ vật tư gộp thành một hóa đơn cuối ngày. Các trường hợp được gộp cuối ngày chỉ là thẻ viễn thông trả trước và khám chữa bệnh. Bán lẻ có thể dùng hóa đơn máy tính tiền (ký hiệu M), nhưng nếu đã đăng ký hóa đơn có mã thì không bắt buộc. Hóa đơn sai về mã số thuế, số tiền, thuế suất hoặc hàng hóa thì phải điều chỉnh hoặc thay thế. Với người mua là tổ chức, hộ kinh doanh, cần **văn bản thỏa thuận** (không còn gọi là "biên bản"). Với người mua là cá nhân, chỉ cần thông báo. Lắp đặt lập hóa đơn lúc nghiệm thu. Phạt lập hóa đơn không đúng thời điểm theo NĐ 310/2025 (từ 16/01/2026) lên tới 70 triệu, tùy số hóa đơn vi phạm.

### Cited Findings
**Hiệu lực**
- NĐ 254 Đ43: hiệu lực 01/7/2026. Từ ngày này NĐ 123/2020, Điều 1 NĐ 41/2022 và NĐ 70/2025 hết hiệu lực. TT 91 Đ25: TT 32/2025 hết hiệu lực. Toàn văn NĐ 254 đăng trên xaydungchinhsach.chinhphu.vn ngày 21/7/2026. Công văn **4831/CT-CS** của Cục Thuế giới thiệu các điểm mới. — [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html); [LuatVietnam TT 91](https://luatvietnam.vn/thue/thong-tu-91-2026-tt-btc-quy-dinh-luat-quan-ly-thue-va-hoa-don-dien-tu-439780-d1.html); tiêu đề tin trên [Google News RSS](https://news.google.com/rss/search?q=Ngh%E1%BB%8B+%C4%91%E1%BB%8Bnh+254%2F2026+h%C3%B3a+%C4%91%C6%A1n&hl=vi&gl=VN&ceid=VN:vi)

**Lập hóa đơn cho từng lần bán, không gộp cuối ngày**
- NĐ 254 Đ4.1: khi bán hàng hóa, cung cấp dịch vụ, người bán phải lập hóa đơn giao người mua. Quy định này áp dụng cả với hàng khuyến mại, quảng cáo, hàng mẫu, biếu tặng, tiêu dùng nội bộ, cho vay, cho mượn. Chỉ trừ các trường hợp ở Đ7. — [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html)
- Đ9.1: thời điểm lập hóa đơn khi bán hàng là lúc chuyển giao quyền sở hữu hoặc quyền sử dụng, không phân biệt đã thu tiền hay chưa. Đ9.2: dịch vụ lập lúc hoàn thành, hoặc lúc thu tiền nếu thu trước (trừ tiền đặt cọc). Đ9.3: giao hàng nhiều lần thì mỗi lần một hóa đơn. Đ9.5: giao dịch trong giờ làm đêm mà không có phần mềm lập tự động thì được lập chậm nhất vào ngày làm việc tiếp theo. — same
- Đ9.4 chỉ cho phép lập một hóa đơn chung cuối ngày trong hai trường hợp: thẻ viễn thông trả trước, phí hòa mạng (điểm b), và khám chữa bệnh (điểm m). Xăng dầu bán lẻ lập "theo từng lần bán" (điểm h). **Không có ngoại lệ nào cho bán lẻ hàng hóa thông thường.** — same
- Đ7 (8 trường hợp không phải dùng hóa đơn): hộ kinh doanh thuộc diện bảng kê thu mua; cho thuê bất động sản của hộ kinh doanh; đại lý xổ số, bảo hiểm, đa cấp; một số khoản tài chính; góp vốn bằng tài sản; điều chuyển tài sản nội bộ hoặc khi tổ chức lại; cho mượn máy móc để gia công; xuất kho nội bộ, tự dùng cho sản xuất kinh doanh và các khoản thu không gắn với bán hàng (dẫn chiếu NĐ 181 Đ6.1.a-b, Đ14.1.b). — same

**Hóa đơn máy tính tiền**
- NĐ 254 Đ6.1.c: tổ chức, hộ kinh doanh bán trực tiếp cho người tiêu dùng (bán lẻ, trừ ô tô, xe máy; siêu thị; ăn uống...) dùng hóa đơn điện tử khởi tạo từ máy tính tiền. Nếu **đã đăng ký** hóa đơn có mã hoặc không mã (điểm a, b) thì **không bắt buộc** đăng ký máy tính tiền. — same
- Đ8.9: hóa đơn máy tính tiền không bắt buộc chữ ký số. Người mua tra cứu được hóa đơn trên hệ thống thì khoản chi được coi là có hóa đơn hợp pháp. Đ15.3: dữ liệu hóa đơn máy tính tiền được gửi cơ quan thuế vào cuối ngày. — same
- TT 91 Đ10.1.c: hóa đơn máy tính tiền lập sai **chỉ được thay thế**, không điều chỉnh. — [LuatVietnam TT 91](https://luatvietnam.vn/thue/thong-tu-91-2026-tt-btc-quy-dinh-luat-quan-ly-thue-va-hoa-don-dien-tu-439780-d1.html) (`thue_gtgt_hoa_don.md` §6)
- Loại hóa đơn mặc định: NĐ 254 Đ6.1.a quy định dùng hóa đơn **có mã** của cơ quan thuế. Đ6.1.b cho phép dùng hóa đơn không mã với nhóm ngành gồm cả "nước sạch", "thương mại", "siêu thị", nếu đáp ứng điều kiện hạ tầng công nghệ thông tin. — [LuatVietnam NĐ 254](https://luatvietnam.vn/thue/nghi-dinh-254-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-2025-ve-hoa-don-dien-tu-439381-d1.html)

**Điều chỉnh, thay thế hóa đơn (TT 91/2026 Đ10)**
- Sai tên, địa chỉ hoặc nội dung khác nhưng **không** sai mã số thuế, số tiền, thuế suất, tiền thuế, hàng hóa: thông báo người mua, không lập lại hóa đơn, gửi mẫu **04/SS-HĐĐT** cho cơ quan thuế.
- Sai mã số thuế, hàng hóa, số tiền, thuế suất hoặc tiền thuế: chọn **điều chỉnh hoặc thay thế**. Một hóa đơn có thể điều chỉnh nhiều hóa đơn của cùng người mua trong cùng tháng, kèm bảng kê **01/BK-ĐCTT**.
- Hàng bán bị trả lại: người bán lập hóa đơn điều chỉnh. Số điều chỉnh tăng ghi dương, giảm ghi âm.

— [LuatVietnam TT 91](https://luatvietnam.vn/thue/thong-tu-91-2026-tt-btc-quy-dinh-luat-quan-ly-thue-va-hoa-don-dien-tu-439780-d1.html)
- Thủ tục trước khi điều chỉnh, thay thế: nếu người mua là tổ chức, hộ hoặc cá nhân kinh doanh, hai bên **"phải lập văn bản thỏa thuận ghi rõ nội dung sai"**. Nếu người mua là cá nhân, người bán thông báo cho người mua hoặc đăng trên website. Không bắt buộc văn bản thỏa thuận khi gửi dữ liệu theo Bảng tổng hợp (NĐ 254 Đ16.3.a.1, a.2). — same (dòng 620-621 bản tải về)

**Phạt hóa đơn**
- NĐ 310/2025/NĐ-CP sửa NĐ 125/2020, hiệu lực **16/01/2026**. Mức phạt lập hóa đơn **không đúng thời điểm** khi bán hàng, cung cấp dịch vụ, tính theo số hóa đơn vi phạm:
  - 1 hóa đơn: 0,5–1,5 triệu
  - 2 đến dưới 10: 2–5 triệu
  - 10 đến dưới 20: 5–15 triệu
  - 20 đến dưới 50: 15–30 triệu
  - 50 đến dưới 100: 30–50 triệu
  - từ 100 hóa đơn: 50–70 triệu
  
  Hóa đơn khuyến mại, biếu tặng, tiêu dùng nội bộ: 1 hóa đơn bị cảnh cáo, cao nhất 15–30 triệu. Trước đây NĐ 125 chỉ có hai khung 3–5 triệu và 4–8 triệu. — [einvoice.vn (bài tổng hợp của nhà cung cấp hóa đơn)](https://einvoice.vn/tin-tuc/muc-phat-cham-xuat-hoa-don-nghi-dinh-310-va-nd-125); văn bản gốc: [Công báo NĐ 310/2025](https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-310-2025-nd-cp-46755/60183.htm) (chưa đọc)
- Báo chí 12/2025: VnExpress đưa tin "Lập hóa đơn không đúng thời điểm bán hàng sẽ bị phạt tới 70 triệu đồng" (09/12/2025). Gia đình & Xã hội đưa tin "từ 16/1/2026, bán hàng nhưng không lập hóa đơn bị phạt đến 80 triệu đồng" (08/12/2025). — tiêu đề trên [Google News RSS](https://news.google.com/rss/search?q=ngh%E1%BB%8B+%C4%91%E1%BB%8Bnh+x%E1%BB%AD+ph%E1%BA%A1t+vi+ph%E1%BA%A1m+h%C3%B3a+%C4%91%C6%A1n+2026&hl=vi&gl=VN&ceid=VN:vi) (chưa đọc nội dung bài)

### Inferences
- Bán lẻ tại quầy: mỗi lần bán phải có một hóa đơn (có mã hoặc máy tính tiền), kể cả khi khách không lấy hóa đơn. Việc "xuất gộp cuối ngày cho khách lẻ" mà một số cửa hàng còn làm **không có căn cứ** theo NĐ 254. Theo NĐ 310, nếu mỗi giao dịch gộp bị coi là một hóa đơn không đúng thời điểm thì mức phạt tăng nhanh theo số hóa đơn.
- Lắp đặt kéo dài nhiều ngày: hóa đơn lập theo biên bản nghiệm thu từng hạng mục hoặc khối lượng (Đ9.3, Đ9.4.c). Tiền tạm ứng trước khi nghiệm thu không phải là thời điểm lập hóa đơn của hoạt động lắp đặt. Đây là suy luận từ cách Đ9.4.c tách riêng khỏi Đ9.2.
- Hóa đơn trước 01/7/2026 mà sai thì xử lý theo quy định nào: TT 91 không ghi rõ quy định chuyển tiếp cho hóa đơn của thời kỳ NĐ 70. Thực tế nên áp dụng thủ tục hiện hành (TT 91) tại thời điểm xử lý.

### App check
| Quy tắc | Verdict | Chi tiết | Căn cứ |
|---|---|---|---|
| Ký hiệu mẫu 1 chữ số, ký hiệu 6 ký tự (C/K + năm + T/D/L/M/N/B/G/H/X/F + 2 chữ), số hóa đơn tối đa 8 chữ số | **ĐÚNG** | `voucher-form-ui.js:750-778`; `defaultSalesInvoiceSymbol(date)` | TT 91 Đ4, PL I; NĐ 254 |
| Dòng "Điều chỉnh giảm cho hóa đơn…" trên hàng bán bị trả lại | **ĐÚNG** (hiển thị) | `ui-framework.js:398` | TT 91 Đ10.5.c.1 |
| Phân biệt mốc NĐ 123/70 và NĐ 254/91 theo ngày | **ĐÚNG** trong báo cáo/kế hoạch (A3); code chỉ ghi chú | — | NĐ 254 Đ43 |
| Ngày hóa đơn khác ngày chứng từ (ví dụ lắp đặt lập lúc nghiệm thu) | **THIẾU** một phần | Có trường `invoiceDate` nhưng bảng kê và 01/GTGT tính kỳ theo `v.date`. Không cảnh báo khi ngày hóa đơn khác ngày giao hàng | NĐ 254 Đ9.1, Đ9.4.c; NĐ 181 Đ16.6 |
| Cảnh báo phiếu xuất bán chưa có số hóa đơn (rủi ro lập hóa đơn trễ) | **THIẾU** | Không có kiểm tra "đã giao hàng nhưng chưa có số hóa đơn" | NĐ 254 Đ4.1, Đ9.1; NĐ 310/2025 |
| Hóa đơn máy tính tiền (M) chỉ được thay thế, không điều chỉnh | **THIẾU** | App chấp nhận ký hiệu M nhưng không chặn điều chỉnh | TT 91 Đ10.1.c |
| Mẫu 04/SS-HĐĐT, 01/BK-ĐCTT, văn bản thỏa thuận | **THIẾU** (ngoài phạm vi phần mềm kế toán; thuộc phần mềm hóa đơn) | — | TT 91 Đ10 |
| Ước tính phạt hóa đơn | **THIẾU** (G3 chỉ có phạt chậm nộp tờ khai) | — | NĐ 125 sửa bởi NĐ 310/2025 |

### Gaps
- Chưa đọc nguyên văn NĐ 310/2025 (Điều 24 NĐ 125 đã sửa). Bảng phạt lấy từ bài tổng hợp của một nhà cung cấp hóa đơn. Theo hiểu biết của tôi, NĐ 125 Đ7 quy định mức phạt ghi trong Nghị định là mức cho tổ chức, cá nhân bằng một nửa, nhưng phiên này **chưa xác minh**.
- Chưa rõ sau khi Luật Quản lý thuế 108/2025 có hiệu lực (01/7/2026) đã có nghị định xử phạt mới thay NĐ 125/310 hay chưa. Không tìm thấy tin về việc này.
- Mức phạt "không lập hóa đơn" (đến 80 triệu?) mới chỉ thấy ở tiêu đề tin, chưa đọc bài.
- Chưa có điều khoản chuyển tiếp xử lý hóa đơn sai lập trong thời kỳ NĐ 70 (01/6/2025–30/6/2026).

## 4. Tờ khai: 01/GTGT (TT 80/2021 so với TT 89/2026), bảng kê, phụ lục giảm thuế

### Takeaway
TT 89/2026 ban hành mẫu 01/GTGT mới cho kỳ từ tháng 7/2026 hoặc quý 3/2026. Tuy nhiên HTKK 5.8.2 (thông báo 05/11/2026) **chưa có** mẫu này, nên người nộp thuế vẫn nộp mẫu TT 80 (QĐ 1934/QĐ-BTC, TT 89 Đ99.2). Bảng kê 01-1, 01-2/GTGT không bắt buộc từ TT 80/2021. Hàng 8% khai ở chỉ tiêu [32] và kèm phụ lục Mẫu 01 PL III NĐ 174. App xử lý cả hai mẫu đúng như vậy.

### Cited Findings
- 01/GTGT theo TT 89/2026: bổ sung **[32b]** (doanh thu không tính vào giá tính thuế) và **[34a]** (doanh thu ngoài phạm vi Luật GTGT). Công thức mới: [27]=[29]+[30]+[32]+[32a]−[32b]; [34]=[26]+[27]+[34a]. — [LuatVietnam TT 89](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html) (`thue_gtgt_hoa_don.md` §4)
- HTKK 5.8.2 chưa có 01/GTGT theo TT 89, nên tiếp tục dùng mẫu TT 80. — [MISA – HTKK 5.8.2](https://amis.misa.vn/61453/phan-mem-ho-tro-ke-khai-thue-htkk/); [ASP MISA – 01/GTGT TT 89](https://asp.misa.vn/tt/kien-thuc/to-khai-thue-gtgt/) (`xac_minh_truoc_sua.md` D)
- Doanh số 8% ghi ở [32]; [33] = 10% × [32] − tổng số thuế được giảm trên phụ lục. — [ASP MISA](https://asp.misa.vn/tt/kien-thuc/to-khai-thue-gtgt/); [KTTU](https://ketoanthienung.vn/cach-ke-khai-hoa-don-giam-thue-gtgt-8-theo-nghi-dinh-44-2023-nd-cp.htm)
- Khai theo quý nếu doanh thu năm trước không quá 50 tỷ. Muốn chuyển từ tháng sang quý phải nộp mẫu 01/ĐK-TĐKTT trước 31/01 (TT 89 Đ19.1.b). Hạn nộp: theo tháng là ngày 20 tháng sau; theo quý là ngày cuối tháng đầu quý sau. Ngày hạn trùng ngày nghỉ thì lùi sang ngày làm việc kế tiếp (NĐ 252 Đ3.7). — [LuatVietnam TT 89](https://luatvietnam.vn/thue/thong-tu-89-2026-tt-btc-quy-dinh-chi-tiet-luat-quan-ly-thue-va-nghi-dinh-252-2026-nd-cp-440483-d1.html); [LuatVietnam NĐ 252](https://luatvietnam.vn/thue/nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-439382-d1.html)

### Inferences
- Lắp đặt có ngày nghiệm thu nằm ở kỳ sau ngày giao vật tư sẽ làm doanh số [32] lệch kỳ, nếu app tính kỳ theo ngày chứng từ thay vì ngày hóa đơn.

### App check
| Quy tắc | Verdict | Chi tiết | Căn cứ |
|---|---|---|---|
| Mặc định mẫu TT 80; TT 89 chỉ dùng khi người dùng chọn và kỳ từ 07/2026 | **ĐÚNG** | `tax-reports.js:9-11, 67` | QĐ 1934/QĐ-BTC; TT 89 Đ99.2, Đ100 |
| [32] gồm cả 8% và 10%; [33] = 10%×[32] − số giảm | **ĐÚNG** | `computeVat01` dòng 81-82 | Thực hành HTKK; NĐ 174 Đ1.6 |
| [32b], [34a] và các công thức TT 89 | **ĐÚNG** | dòng 84-87 | TT 89 mẫu 01/GTGT |
| [25] loại trừ đầu vào không được khấu trừ | **ĐÚNG** | dòng 77 dùng `nonDeductible` | NĐ 181 Đ26 |
| [23a]/[24a] hàng nhập khẩu | **THIẾU** (đã ghi shortcut) | để 0 | Mẫu 01/GTGT |
| [40a]/[41]/[42]/[43] và gợi ý [22] chuyển kỳ | **ĐÚNG** (gợi ý [22] có shortcut ghi rõ) | dòng 91-113 | Mẫu 01/GTGT |
| Bảng kê mua vào, bán ra chỉ dùng nội bộ | **ĐÚNG** (không bắt buộc nộp) | `buildVatInvoiceList` | TT 80/2021 bỏ bảng kê 01-1, 01-2 |
| Kỳ kê khai theo ngày hóa đơn | **CHƯA RÕ / rủi ro** | Kỳ tính theo `v.date`, có ghi chú "thường trùng ngày hóa đơn" | NĐ 181 Đ16.6; NĐ 254 Đ9 |

### Gaps
- Chưa có hướng dẫn chính thức cách ghi hàng 8% trên mẫu 01/GTGT TT 89 khi HTKK cập nhật.
- Chưa trích được bố cục cột của Mẫu 01 PL III NĐ 174.
