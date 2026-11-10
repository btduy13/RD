# Thuế TNCN và BHXH/BHYT/BHTN/KPCĐ năm 2026 của doanh nghiệp nhỏ, đối chiếu với module tiền lương (ngày 09/11/2026)

Cách làm: WebSearch hỏng trong phiên này. Nguồn được tìm qua Google News RSS. Đường dẫn được giải mã ra trang gốc rồi tải trực tiếp bằng curl, với user-agent trình duyệt thông thường. Không vượt Cloudflare: thuvienphapluat không đọc được. Nội dung kế thừa và kiểm tra lại hai file `research_notes/Luật thuế kế toán Việt Nam 2026/tncn_bhxh_monbai.md` (gọi tắt là [N1]) và `xac_minh_truoc_sua.md` (gọi tắt là [N2]). Mọi URL trích dẫn lại từ [N1]/[N2] đều do phiên trước đọc. URL ghi "(đọc 09/11/2026)" là trang phiên này đọc lại.

Mã nguồn đã đối chiếu:
- `js/core/tax-rules.js` (các khóa `pit.*`, `ins.*`, `holidays`)
- `js/core/payroll-calc.js` (`computePit`, `computeInsurance`, `computePayslip`, `buildPayrollEntries`, `computeAnnualSettlement`)
- `js/modules/payroll.js` (tạo bảng lương, 05/KK, 05/QTT)
- `js/modules/tax-calendar.js` (hạn nộp)
- `js/core/chart-of-accounts.js`

Ký hiệu verdict:
- **ĐÚNG** = đã xác minh, phần mềm đúng.
- **SAI** = phần mềm sai so với quy định.
- **THIẾU** = phần mềm chưa có.
- **HẾT HIỆU LỰC** = quy định cũ, chỉ còn dùng cho kỳ trước.

## Luật Thuế TNCN 2025, giảm trừ gia cảnh, biểu thuế áp dụng cho từng tháng năm 2026

### Takeaway
Luật Thuế TNCN số 109/2025/QH15 có hiệu lực 01/7/2026. Điều 29.2 cho quy định về tiền lương, tiền công và kinh doanh của cá nhân cư trú áp dụng cho cả kỳ tính thuế 2026. Vì vậy, mọi khoản lương **chi trả** từ 01/01/2026 tính theo:
- biểu 5 bậc: 5/10/20/30/35%, ngưỡng tháng 10/30/60/100 triệu;
- giảm trừ 15,5 triệu/tháng cho bản thân và 6,2 triệu/tháng cho mỗi người phụ thuộc (NQ 110/2025/UBTVQH15, hiệu lực 01/01/2026).

Biểu 7 bậc và mức giảm trừ 11/4,4 triệu đã **hết hiệu lực** với khoản chi trả từ 01/01/2026. Phần mềm cài đúng các tham số này. Có hai điểm phải xử lý: ngày chi trả mặc định, và thiếu các khoản giảm trừ mới của NĐ 253/2026.

### Cited Findings
- Luật 109/2025/QH15 ký ngày 10/12/2025. Điều 29.1: hiệu lực 01/7/2026. Điều 29.2: "Các quy định liên quan đến thu nhập từ kinh doanh, từ tiền lương, tiền công của cá nhân cư trú áp dụng từ kỳ tính thuế năm 2026" — [baochinhphu.vn](https://baochinhphu.vn/thoi-diem-ap-dung-bieu-thue-thu-nhap-ca-nhan-moi-102260324150030818.htm) (qua [N1])
- Điều 9, biểu 5 bậc theo tháng: đến 10 tr 5%; trên 10–30 tr 10%; trên 30–60 tr 20%; trên 60–100 tr 30%; trên 100 tr 35%. Ngưỡng năm bằng ngưỡng tháng × 12 — [baochinhphu.vn](https://baochinhphu.vn/thoi-diem-ap-dung-bieu-thue-thu-nhap-ca-nhan-moi-102260324150030818.htm); [VnExpress](https://vnexpress.net/7-diem-moi-nguoi-lao-dong-can-luu-y-khi-tinh-thue-tncn-nam-2026-5093991.html) (qua [N1])
- Giảm trừ gia cảnh 15,5 triệu/6,2 triệu theo NQ 110/2025/UBTVQH15, hiệu lực 01/01/2026, áp dụng kỳ tính thuế 2026. Mức cũ 11/4,4 triệu theo NQ 954/2020. Bộ Tài chính xác nhận: lương tháng 12/2025 chi trả tháng 01/2026 thuộc kỳ tính thuế 2026, nên được giảm trừ mới — [Tạp chí KT-TC (BTC)](https://tapchikinhtetaichinh.vn/bo-tai-chinh-huong-dan-ap-dung-giam-tru-gia-canh-trong-giai-doan-chuyen-tiep-146548.html) (qua [N1])
- Luật 109/2025 đã được sửa bởi Luật 09/2026/QH16, thông qua 24/4/2026. Chưa đọc được nội dung từng điều sửa — [LuatVietnam](https://luatvietnam.vn/tin-van-ban-moi/da-co-luat-so-09-2026-qh16-sua-doi-cac-luat-thue-tncn-thue-gtgt-thue-tndn-thue-ttdb-186-109001-article.html) (qua [N1])
- NĐ 253/2026/NĐ-CP: hiệu lực 01/7/2026. Các quy định về tiền lương, tiền công và kinh doanh của cá nhân cư trú áp dụng từ kỳ tính thuế 2026 — [LuatVietnam (đọc 09/11/2026)](https://luatvietnam.vn/tin-van-ban-moi/chinh-thuc-nang-nguong-khau-tru-thue-thu-nhap-vang-lai-len-5-trieu-dong-lan-tu-01-7-2026-186-110066-article.html)
- Các khoản giảm trừ mới của NĐ 253:
  - chi phí khám chữa bệnh trong danh mục BHYT: tối đa 23 triệu/năm;
  - học phí trong nước: tối đa 24 triệu/năm (Điều 49.2, cần hóa đơn đứng tên người nộp thuế hoặc người phụ thuộc);
  - hưu trí tự nguyện và bảo hiểm nhân thọ: trần 3 triệu/tháng (Điều 46.2.a, cũ là 1 triệu);
  - người phụ thuộc: thu nhập bình quân tối đa 3 triệu/tháng (cũ là 1 triệu).

  — [LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-253-2026-nd-cp-ve-thue-thu-nhap-ca-nhan-565-110102-article.html); [VnExpress](https://vnexpress.net/7-diem-moi-nguoi-lao-dong-can-luu-y-khi-tinh-thue-tncn-nam-2026-5093991.html) (qua [N1])
- Tiền ăn giữa ca (NĐ 253 Điều 8): chi bằng tiền chỉ chịu thuế phần vượt 1,2 triệu/người/tháng. Bữa ăn doanh nghiệp tự tổ chức không chịu thuế. Quy định này áp dụng từ 01/7/2026 — [LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-253-2026-nd-cp-ve-thue-thu-nhap-ca-nhan-565-110102-article.html) (qua [N1])
- Khoản thuế đã khấu trừ theo quy định cũ từ 01/01 đến trước 01/7/2026 không phải khai lại tờ khai tháng/quý. Doanh nghiệp điều chỉnh khi quyết toán năm 2026 — [EasyInvoice](https://easyinvoice.vn/nghi-dinh-253-2026-nd-cp/) (qua [N1])
- Người không cư trú: 20% trên thu nhập từ tiền lương, tiền công (Luật 109/2025 Điều 21) — [LuatVietnam – Luật 109/2025](https://luatvietnam.vn/thue/luat-thue-thu-nhap-ca-nhan-2025-so-109-2025-qh15-422733-d1.html) (qua [N2] mục A.13)

**Đối chiếu phần mềm**

| Quy tắc | Phần mềm | Verdict |
|---|---|---|
| Biểu 5 bậc từ 01/01/2026 theo ngày chi trả | `tax-rules.js` `pit.brackets` từ "2026-01-01" có 10/30/60/100 triệu, 5/10/20/30/35%; `computePit` lũy tiến từng phần | **ĐÚNG** |
| Biểu 7 bậc (Luật 04/2007, sửa 2012) | `pit.brackets` đến "2025-12-31" | **ĐÚNG**, **HẾT HIỆU LỰC** từ 01/01/2026 |
| Giảm trừ 15,5/6,2 tr | `pit.deductions` từ "2026-01-01" | **ĐÚNG** |
| Giảm trừ 11/4,4 tr | `pit.deductions` đến "2025-12-31" | **ĐÚNG**, **HẾT HIỆU LỰC** |
| Tra cứu theo ngày chi trả (Luật 109 Điều 8.3) | `computePayslip(..., payDate)` | **ĐÚNG** về nguyên tắc |
| Ngày chi trả mặc định | `createPayroll` đặt `payDate` = ngày cuối tháng lương. Lương tháng 12/2025 trả tháng 01/2026 sẽ bị tính theo luật cũ nếu người dùng không sửa | **SAI (rủi ro)**. Cần cho nhập ngày chi trả thực tế, hoặc cảnh báo khi kỳ lương ≤ 12/2025 mà ngày trả ≥ 01/01/2026. Chưa kiểm tra giao diện có cho sửa `payDate` hay không |
| Người không cư trú 20%, không giảm trừ | `computePayslip`: `taxable * 0.2` | **ĐÚNG**. Chú thích trong code "Luật 109/2025 chưa xác minh" đã lỗi thời: Điều 21 xác nhận 20%. Thuế suất đang viết cứng, chưa đưa vào `tax-rules` |
| Giảm trừ y tế 23 tr/năm, giáo dục 24 tr/năm | Không có | **THIẾU**. Ít nhất phải có ô nhập ở `computeAnnualSettlement` |
| Giảm trừ hưu trí tự nguyện/BHNT ≤ 3 tr/tháng | Không có | **THIẾU** |
| Tiền ăn ca bằng tiền ≤ 1,2 tr/tháng miễn thuế (từ 01/7/2026) | Chỉ có ô tổng `allowancesTaxFree` nhập tay, không có trần | **THIẾU** quy tắc trần. Chấp nhận được nếu người dùng tự nhập đúng |
| Quyết toán: giảm trừ theo tháng đăng ký người phụ thuộc | `computeAnnualSettlement` lấy 12 × số người phụ thuộc hiện tại (shortcut có ghi chú trong code) | **SAI một phần** khi số người phụ thuộc đổi trong năm |

### Inferences
- Bảng tính nhanh theo tháng (T là thu nhập tính thuế, đơn vị triệu): T ≤ 10: 5%T; ≤ 30: 10%T − 0,5; ≤ 60: 20%T − 3,5; ≤ 100: 30%T − 9,5; trên 100: 35%T − 14,5. Đây là suy ra từ Điều 9, không có nguồn ghi sẵn. `computePit` tính lũy tiến từng phần nên cho cùng kết quả.
- Doanh nghiệp đã khấu trừ tháng 1–6/2026 theo biểu cũ (vì NĐ 253 mới ban hành 30/6/2026) thì phải dồn chênh lệch vào quyết toán 2026. Hàm `computeAnnualSettlement` tính lại cả năm theo biểu mới, nên chênh lệch này tự hiện ra. Điều này phù hợp với hướng dẫn.

### Gaps
- Nội dung điều khoản của Luật 09/2026/QH16 sửa Luật 109/2025 chưa đọc được. Có thể có thay đổi về khai, quyết toán.
- Chưa đọc TT 87/2026/TT-BTC (hướng dẫn TNCN) nên chưa biết chi tiết thủ tục đăng ký người phụ thuộc theo tháng.

## Khấu trừ 10% với khoản chi cho cá nhân không có HĐLĐ hoặc HĐLĐ dưới 3 tháng; cam kết 08/CK-TNCN

### Takeaway
Quy định cũ ở TT 111/2013 Điều 25.1.i: khấu trừ 10% với khoản chi từ 2 triệu/lần. Quy định này đã được thay bằng **NĐ 253/2026 Điều 50.2**, ngưỡng **từ 5 triệu đồng/lần**. Dưới 5 triệu thì chỉ khấu trừ khi cá nhân yêu cầu. Cơ chế cam kết vẫn còn. Mốc chuyển đổi chưa rõ:
- NĐ 253 có hiệu lực 01/7/2026, khớp với mốc trong phần mềm;
- nhưng chính NĐ 253 lại cho quy định về tiền lương, tiền công của cá nhân cư trú áp dụng từ kỳ tính thuế 2026.

Phần mềm **chưa có** cam kết, và đang **sai** khi tắt luôn bảo hiểm của mọi người có cờ "vãng lai / HĐ dưới 3 tháng".

### Cited Findings
- NĐ 253/2026 Điều 50.2: tổ chức trả tiền lương, tiền công, tiền thù lao, tiền chi khác cho cá nhân cư trú không ký hợp đồng hoặc ký HĐLĐ dưới 03 tháng phải khấu trừ 10% trên thu nhập trước khi trả, nếu mức chi trả từ 05 triệu đồng/lần trở lên. Quy định này gồm cả khoản trả cho người lao động đã chấm dứt hợp đồng. Dưới 05 triệu/lần thì được khấu trừ 10% khi cá nhân có yêu cầu — [LuatVietnam (đọc 09/11/2026)](https://luatvietnam.vn/tin-van-ban-moi/chinh-thuc-nang-nguong-khau-tru-thue-thu-nhap-vang-lai-len-5-trieu-dong-lan-tu-01-7-2026-186-110066-article.html)
- Cam kết: cá nhân chỉ có thu nhập thuộc diện khấu trừ 10% và ước tính thu nhập sau giảm trừ chưa đến mức nộp thuế thì làm cam kết. Mẫu là "mẫu ban hành kèm theo văn bản hướng dẫn về quản lý thuế". Tổ chức trả thu nhập căn cứ cam kết để không khấu trừ. Cuối năm, tổ chức vẫn phải tổng hợp danh sách và thu nhập của những người này để nộp cơ quan thuế — [LuatVietnam (đọc 09/11/2026)](https://luatvietnam.vn/tin-van-ban-moi/chinh-thuc-nang-nguong-khau-tru-thue-thu-nhap-vang-lai-len-5-trieu-dong-lan-tu-01-7-2026-186-110066-article.html)
- Cá nhân cư trú có HĐLĐ từ 03 tháng trở lên, kể cả ký ở nhiều nơi, được khấu trừ theo biểu lũy tiến — cùng nguồn.
- "NĐ 253/2026/NĐ-CP có hiệu lực kể từ ngày 01/7/2026. Các quy định liên quan đến thu nhập từ kinh doanh, từ tiền lương, tiền công của cá nhân cư trú áp dụng từ kỳ tính thuế năm 2026" — cùng nguồn.

**Đối chiếu phần mềm**

| Quy tắc | Phần mềm | Verdict |
|---|---|---|
| 10% khi chi từ 2 tr/lần (TT 111/2013 Đ25.1.i) | `pit.casualThreshold` 2 tr đến "2026-06-30" | **HẾT HIỆU LỰC** với khoản chi từ 01/7/2026. Với khoản chi 01/01–30/6/2026 thì mốc chưa rõ (xem Inferences) |
| 10% khi chi từ 5 tr/lần (NĐ 253 Đ50.2) | `pit.casualThreshold` 5 tr từ "2026-07-01" | **ĐÚNG** với khoản chi từ 01/7/2026 |
| So ngưỡng trên **mức chi trả** từng lần | `computePayslip` so `gross - allowancesTaxFree` với ngưỡng | **SAI nhỏ**. Văn bản dùng "mức chi trả thu nhập", tức tổng tiền trả mỗi lần. Phần mềm còn tính theo dòng lương tháng, không theo từng lần chi |
| Khấu trừ dưới ngưỡng khi cá nhân yêu cầu | Không có | **THIẾU** |
| Cam kết (mẫu 08/CK-TNCN theo TT 80/2021) và danh sách cuối năm | Không có cờ cam kết; 05/QTT không có danh sách người cam kết | **THIẾU** |
| Cờ "vãng lai / HĐ dưới 3 tháng" tắt cả BHXH/BHYT/BHTN | `computePayslip`: `emp.casual ? computeInsurance(0, ...)` | **SAI** với HĐLĐ từ đủ 01 đến dưới 03 tháng. Nhóm này thuộc diện BHXH bắt buộc theo Luật BHXH 2024 Điều 2.1.a (xem câu hỏi BHXH). Cần tách hai cờ: "không HĐLĐ hoặc HĐ dưới 1 tháng" và "HĐLĐ 1 đến dưới 3 tháng" |

### Inferences
- Mốc 2 triệu hay 5 triệu cho khoản chi 01/01–30/6/2026: khấu trừ 10% chỉ là tạm nộp. Nghĩa vụ thật được chốt khi quyết toán, và khoản đã khấu trừ theo quy định cũ thì không phải khai lại. Do đó mốc 01/7/2026 trong phần mềm chấp nhận được với việc **khấu trừ tại thời điểm chi**. Nếu dữ liệu tháng 1–6 được nhập lại sau 01/7/2026, đọc chặt Điều 29.2 thì phải áp ngưỡng 5 triệu. Nên ghi chú mốc này là "chưa có hướng dẫn chính thức".
- Tên mẫu cam kết: TT 80/2021 dùng mẫu 08/CK-TNCN. TT 89/2026 đã thay TT 80 về mẫu biểu quản lý thuế, nhưng chưa xác minh số hiệu mẫu cam kết mới.

### Gaps
- Chưa có văn bản hay công văn nào trả lời rõ ngưỡng áp cho khoản chi từ 01/01 đến 30/6/2026.
- Chưa xác minh số hiệu mẫu cam kết trong TT 89/2026/TT-BTC.

## Khai thuế 05/KK-TNCN, quyết toán 05/QTT-TNCN, chứng từ khấu trừ điện tử

### Takeaway
- Từ 15/4/2026 đến hết 28/02/2027, tờ khai TNCN khai theo **quý** (NQ 66.16/2026/NQ-CP). Hạn là ngày cuối tháng đầu quý sau.
- Quyết toán năm (05/QTT-TNCN, nằm trong phụ lục TT 89/2026) hạn ngày cuối tháng thứ 3 sau năm, tức 31/3/2027 cho năm 2026.
- Không phát sinh khấu trừ thì không phải nộp tờ khai, trừ kỳ cuối năm.
- Chứng từ khấu trừ điện tử nay theo **NĐ 254/2026/NĐ-CP**, thay NĐ 123/2020 (đã sửa bởi NĐ 70/2025) từ 01/7/2026.

Lịch hạn của phần mềm đúng. Phần mềm còn thiếu chứng từ khấu trừ và chưa xử lý mốc sau 28/02/2027.

### Cited Findings
- NQ 66.16/2026/NQ-CP (07/4/2026), Phụ lục I.9 và Điều 19: tờ khai 02/KK-TNCN và 05/KK-TNCN chuyển từ tháng sang quý, áp dụng từ 15/4/2026 đến hết 28/02/2027 — [LuatVietnam](https://luatvietnam.vn/tin-van-ban-moi/doanh-nghiep-nop-to-khai-thue-tncn-theo-quy-tu-tu-15-4-2026-den-het-28-02-2027-186-109638-article.html) (qua [N1])
- CV 4021/CT-NVT: từ 19/5/2026, hệ thống không nhận tờ khai tháng cho kỳ từ tháng 4/2026; bắt đầu khai từ quý 2/2026 — [xaydungchinhsach.chinhphu.vn](https://xaydungchinhsach.chinhphu.vn/chuyen-sang-ke-khai-thue-thu-nhap-ca-nhan-theo-quy-tu-ky-thang-4-2026-119260624150148333.htm) (qua [N1])
- Hạn nộp cập nhật từ 01/7/2026 — [LuatVietnam (đọc 09/11/2026)](https://luatvietnam.vn/thue-phi-le-phi/lich-nop-cac-loai-thue-danh-cho-doanh-nghiep-cap-nhat-tu-01-7-2026-565-110822-article.html):
  - TNCN khai theo quý: chậm nhất ngày cuối cùng của tháng đầu quý tiếp theo;
  - quyết toán năm: chậm nhất ngày cuối cùng của tháng thứ 03 kể từ khi kết thúc kỳ quyết toán.
- Cùng bài LuatVietnam ghi **tạm nộp TNDN quý "chậm nhất ngày 30 của tháng đầu tiên của quý tiếp theo"**. Phần mềm (`tax-calendar.js`) lại dùng "ngày cuối tháng đầu quý sau" từ quý 3/2026. Việc này ngoài phạm vi TNCN, ghi lại để người phụ trách TNDN kiểm tra lại.
- NĐ 252/2026 Điều 11.6: tổ chức trả thu nhập khai TNCN tháng/quý, nếu kỳ đó không phát sinh khấu trừ thì không phải khai. Ngoại lệ là kỳ cuối năm, nếu tổ chức không thuộc diện phải quyết toán — [LuatVietnam – NĐ 252/2026](https://luatvietnam.vn/thue/nghi-dinh-252-2026-nd-cp-huong-dan-thi-hanh-luat-quan-ly-thue-439382-d1.html) (qua [N2] A.10)
- NĐ 252 Điều 3.7: hạn rơi vào ngày nghỉ thì lùi sang ngày làm việc liền kề — cùng nguồn (qua [N2] A.11)
- 05/QTT-TNCN và 05/KK-TNCN có trong phụ lục TT 89/2026. Đến 05/11/2026, HTKK 5.8.2 đã có 05/KK-TNCN — [MISA – phụ lục TT 89](https://amis.misa.vn/282465/phu-luc-thong-tu-89-2026-tt-btc/); [MISA – HTKK 5.8.2](https://amis.misa.vn/61453/phan-mem-ho-tro-ke-khai-thue-htkk/) (qua [N2] A.8, A.13)
- Chứng từ khấu trừ thuế TNCN điện tử: NĐ 254/2026/NĐ-CP thay NĐ 123/2020 từ 01/7/2026, kèm TT 91/2026/TT-BTC — [xaydungchinhsach.chinhphu.vn – toàn văn NĐ 254](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-so-254-2026-nd-cp-ve-hoa-don-dien-tu-chung-tu-dien-tu-119260713164251972.htm); [EasyInvoice](https://easyinvoice.vn/nghi-dinh-253-2026-nd-cp/) (qua [N1])

**Đối chiếu phần mềm**

| Quy tắc | Phần mềm | Verdict |
|---|---|---|
| 05/KK-TNCN theo quý, hạn ngày cuối tháng đầu quý sau | `tax-calendar.js` mặc định `pitPeriod` = quý, hạn `taxCalLastDay(ny, nm)` | **ĐÚNG** cho 15/4/2026–28/02/2027 |
| Khai tháng (ngày 20 tháng sau) | Tùy chọn `pitPeriod: "month"` | **HẾT HIỆU LỰC** cho kỳ tháng 4/2026–2/2027. Cài đặt "tháng" lúc này sinh ra hạn sai, nên cảnh báo hoặc khóa |
| Kỳ khai sau 28/02/2027 | Không có mốc ngày; chỉ có cài đặt tĩnh | **THIẾU** (chưa xác minh quy định sau mốc này) |
| Tổng hợp 05/KK theo ngày chi trả trong quý | `payrollQuarterAoa` | **ĐÚNG** về nguyên tắc. Các chỉ tiêu là tổng hợp nội bộ, chưa khớp số hiệu chỉ tiêu [21]…[36] của mẫu |
| Kỳ không phát sinh thì không phải khai, trừ kỳ cuối năm | Lịch luôn sinh hạn cho mọi quý | **THIẾU** (chỉ ảnh hưởng nhắc việc) |
| Quyết toán 05/QTT, hạn ngày cuối tháng thứ 3 | `tax-calendar.js` dòng 68 | **ĐÚNG** (31/3/2027 là thứ Tư) |
| Chứng từ khấu trừ TNCN điện tử (NĐ 254/2026) | Không có chức năng | **THIẾU** |
| Hạch toán Nợ 334 / Có 3335 | `buildPayrollEntries` | **ĐÚNG** (TT99 vẫn giữ 3335) |

### Inferences
- NĐ 70/2025 (sửa NĐ 123) được nêu trong câu hỏi nhưng không còn là căn cứ chính cho chứng từ khấu trừ từ 01/7/2026, vì NĐ 254/2026 thay toàn bộ NĐ 123. Nội dung chi tiết NĐ 254 về chứng từ khấu trừ chưa đọc, nên điều số cụ thể chưa xác minh.

### Gaps
- Kỳ khai TNCN từ 01/3/2027 (quay về tháng/quý theo kỳ GTGT, hay kéo dài quý) chưa có văn bản.
- Danh sách chỉ tiêu chính xác của 05/KK-TNCN và 05/QTT-TNCN theo TT 89/2026 chưa đọc.

## BHXH/BHYT/BHTN/KPCĐ: tỷ lệ, sàn, trần, lương tối thiểu vùng, đoàn phí

### Takeaway
Tỷ lệ năm 2026 không đổi:
- doanh nghiệp đóng 17,5% BHXH + 3% BHYT + 1% BHTN + 2% KPCĐ;
- người lao động đóng 8% + 1,5% + 1%.

Trần và sàn:
- Trần BHXH/BHYT = 20 × lương cơ sở: 46,8 triệu đến 30/6/2026; **50,6 triệu từ 01/7/2026** (NĐ 161/2026, lương cơ sở 2,53 triệu).
- Trần BHTN = 20 × lương tối thiểu vùng. Vùng I năm 2026 là 106,2 triệu.
- Sàn là lương tối thiểu vùng theo NĐ 293/2025 (vùng I 5,31 triệu). NĐ 399/2026 thay từ 01/01/2027 (vùng I 5,7 triệu).

Từ Luật BHXH 2024, HĐLĐ từ **đủ 01 tháng** đã thuộc diện BHXH bắt buộc. Hạn đóng là **ngày cuối cùng của tháng tiếp theo**, và KPCĐ đóng cùng lúc. Phần mềm đúng tỷ lệ, trần và sàn. Phần mềm sai ở ba điểm: đối tượng HĐ 1 đến dưới 3 tháng, mốc tra trần theo ngày chi trả, và thiếu hạn nộp BHXH.

### Cited Findings
- Tỷ lệ năm 2026: doanh nghiệp 21,5% = 14% hưu trí + 3% ốm đau thai sản + 0,5% TNLĐ-BNN + 1% BHTN + 3% BHYT. Người lao động 10,5% = 8% + 1% + 1,5%. Lao động nước ngoài không đóng BHTN, tổng 30%. Dự thảo Luật BHXH sửa đổi (21/10/2026) dự kiến hiệu lực 01/3/2027 — [LuatVietnam](https://luatvietnam.vn/bao-hiem/ty-le-dong-bhxh-cua-doanh-nghiep-va-nguoi-lao-dong-563-100379-article.html) (đọc lại 09/11/2026, bài cập nhật 24/9/2026)
- BHTN 1% + 1% theo NĐ 374/2025 (Luật Việc làm 2025). TNLĐ-BNN 0,3% vẫn là dự thảo; mức hiện hành là 0,5% — [Báo Chính phủ](https://baochinhphu.vn/quy-dinh-moi-ve-muc-dong-va-huong-bao-hiem-that-nghiep-102260107171705469.htm); [Báo Tuyên Quang](https://baotuyenquang.com.vn/xa-hoi/202610/ap-dung-2-muc-dong-bao-hiem-tai-nan-lao-dong-benh-nghe-nghiep-theo-lo-trinh-5011f15/) (qua [N2] A.14)
- Đối tượng BHXH bắt buộc (Luật BHXH 41/2024/QH15):
  - Điều 2.1.a: "hợp đồng lao động xác định thời hạn có thời hạn từ đủ 01 tháng trở lên, kể cả trường hợp ... thỏa thuận bằng tên gọi khác...".
  - Điều 2.1.l: người làm không trọn thời gian có tiền lương tháng bằng hoặc cao hơn tiền lương làm căn cứ đóng thấp nhất.

  — [Thương hiệu & Công luận, dẫn BHXH TP.HCM (đọc 09/11/2026)](https://thuonghieucongluan.com.vn/lao-dong-lam-viec-khong-tron-thoi-gian-van-phai-dong-bhxh-du-nghi-khong-luong-tu-14-ngay-tro-len-a329543.html)
- Hạn đóng (Luật BHXH 2024 Điều 34.4.a): người sử dụng lao động đóng hằng tháng chậm nhất ngày cuối cùng của tháng tiếp theo. Điều 38 quy định hành vi chậm đóng — [LSVN, dẫn BHXH Quảng Ninh (đọc 09/11/2026)](https://lsvn.vn/khi-nao-thi-bi-xem-la-cham-dong-bhxh-a181867.html)
- Trần: tiền lương làm căn cứ đóng từ mức tham chiếu đến 20 × mức tham chiếu (Điều 31). Mức tham chiếu bằng lương cơ sở cho đến khi lương cơ sở bị bãi bỏ (Điều 141.13). Trần là 46,8 triệu đến 30/6/2026 và 50,6 triệu từ 01/7/2026 — [MISA AMIS](https://amis.misa.vn/292667/muc-luong-dong-bhxh/); NĐ 161/2026 tăng lương cơ sở lên 2,53 triệu từ 01/7/2026 — [Thanh Niên](https://thanhnien.vn/chinh-thuc-tang-luong-co-so-luong-huu-va-dieu-chinh-hang-loat-tro-cap-185260701083514544.htm) (qua [N1]); xác nhận lại ở [LuatVietnam – đoàn phí (đọc 09/11/2026)](https://luatvietnam.vn/lao-dong-tien-luong/muc-dong-doan-phi-kinh-phi-cong-doan-562-23118-article.html)
- Trần BHTN = 20 × lương tối thiểu vùng tháng tại thời điểm đóng — [Dân trí](https://dantri.com.vn/noi-vu/tang-luong-toi-thieu-muc-tro-cap-that-nghiep-cao-nhat-len-285-trieu-dong-20261105090813037.htm) (qua [N1])
- Lương tối thiểu vùng năm 2026 (NĐ 293/2025, từ 01/01/2026): I 5.310.000; II 4.730.000; III 4.140.000; IV 3.700.000. Năm 2027 (NĐ 399/2026, ký 02/11/2026, từ 01/01/2027): I 5.700.000; II 5.080.000; III 4.450.000; IV 4.040.000 — [MISA meInvoice](https://www.meinvoice.vn/tin-tuc/53305/nghi-dinh-399-2026-nd-cp/); [xaydungchinhsach](https://xaydungchinhsach.chinhphu.vn/nghi-dinh-so-399-2026-nd-cp-quy-dinh-muc-luong-toi-thieu-tu-01-01-2027-11926110315241276.htm) (qua [N1])
- KPCĐ (Luật Công đoàn 2024 Điều 29.1.b): 2% quỹ tiền lương làm căn cứ đóng BHXH bắt buộc. Đóng hằng tháng cùng thời điểm đóng BHXH. Doanh nghiệp phải đóng dù có hay không có công đoàn cơ sở — [LuatVietnam (đọc 09/11/2026)](https://luatvietnam.vn/lao-dong-tien-luong/muc-dong-doan-phi-kinh-phi-cong-doan-562-23118-article.html)
- Đoàn phí (QĐ 1408/QĐ-TLĐ năm 2024, Điều 30): chỉ đoàn viên đóng. Ở doanh nghiệp ngoài nhà nước, mức đóng là 1% tiền lương làm căn cứ đóng BHXH, tối đa 10% lương cơ sở (253.000 đồng/tháng từ 01/7/2026). Đoàn viên không đóng BHXH đóng tối thiểu 1% lương cơ sở. Không có công đoàn cơ sở hoặc người lao động không là đoàn viên thì không đóng — cùng nguồn.
- Tài khoản theo TT99: 3382 KPCĐ, 3383 BHXH, 3384 BHYT, 3386 BHTN. Theo TT133: 3385 là BHTN, 3386 là nhận ký quỹ — [LuatVietnam – hệ thống TK TT99](https://luatvietnam.vn/thue-phi-le-phi/danh-muc-tai-khoan-ke-toan-theo-thong-tu-99-2025-tt-btc-565-105326-article.html) (qua [N1]); dòng 88, 214–215 trong `chart-of-accounts.js` của phần mềm khớp.

**Đối chiếu phần mềm**

| Quy tắc | Phần mềm | Verdict |
|---|---|---|
| Tỷ lệ doanh nghiệp 17,5/3/1 và KPCĐ 2; người lao động 8/1,5/1 | `ins.rates` | **ĐÚNG** |
| Lao động nước ngoài không đóng BHTN, vẫn đóng BHXH/BHYT | `computeInsurance` `opts.foreign` thì BHTN = 0 | **ĐÚNG** |
| TNLĐ-BNN 0,5% mặc định; 0,3% chỉ khi được duyệt | 17,5 viết gộp, không tách | **ĐÚNG**. Không cấu hình được 0,3% (mức này mới là dự thảo, chấp nhận được) |
| Trần BHXH/BHYT 46,8 tr đến 30/6/2026, 50,6 tr từ 01/7/2026 | `ins.caps` | **ĐÚNG** về số |
| Mốc tra trần, sàn, tỷ lệ | `computePayslip` truyền **payDate** vào `computeInsurance` | **SAI**. BHXH tính theo **tháng đóng**, không theo ngày trả lương. Lương tháng 6/2026 trả ngày 05/7 sẽ bị áp trần 50,6 tr; lương tháng 12/2026 trả tháng 01/2027 sẽ bị áp sàn và trần BHTN của NĐ 399 |
| Trần BHTN = 20 × lương tối thiểu vùng | `caps.bhtnRegionMultiplier` × `ins.regionMinWage` | **ĐÚNG** |
| Lương tối thiểu vùng 2024–2025 / 2026 / 2027 | NĐ 74/2024; NĐ 293/2025; NĐ 399/2026 | **ĐÚNG**. Bảng 2024–2025 **HẾT HIỆU LỰC** từ 01/01/2026 |
| Sàn = lương tối thiểu vùng | `Math.max(insSalary, minWage)` | **ĐÚNG** với lao động toàn thời gian. **SAI một phần** với người làm không trọn thời gian có lương dưới mức sàn: họ không thuộc diện bắt buộc (Đ2.1.l), nhưng phần mềm lại nâng lên mức sàn |
| Lương tối thiểu vùng trước 01/7/2024 | Không có; code ghi "shortcut" | Không ảnh hưởng năm 2026 |
| HĐLĐ từ đủ 1 tháng đến dưới 3 tháng phải đóng BHXH | Cờ `casual` làm cả BHXH/BHYT/BHTN bằng 0 | **SAI** |
| KPCĐ 2% trên quỹ lương đóng BHXH (đã chặn trần) | `pct(bhxhBase, kpcd)`, hạch toán Có 3382 | **ĐÚNG** |
| Đoàn phí 1%, tối đa 10% lương cơ sở, chỉ đoàn viên | Không có | **THIẾU** (tùy chọn, chỉ cần khi có công đoàn cơ sở) |
| Hạn nộp BHXH/BHYT/BHTN/KPCĐ: ngày cuối tháng sau | `tax-calendar.js` không có mục BHXH | **THIẾU** |
| Tài khoản: TT99 dùng 3386 cho BHTN, TT133 dùng 3385 | `buildPayrollEntries`: `tt99 ? "3386" : "3385"` | **ĐÚNG** |
| Chi phí theo bộ phận | TT99: 641 (bán hàng) hoặc 642; TT133: luôn 642 | **ĐÚNG** ở cấp 1. TT133 nên chi tiết 6421/6422 (chưa kiểm tra tài khoản cấp 2) |
| BH người lao động được trừ khi tính thuế TNCN | `taxable = gross - allowancesTaxFree - insEmployee - ...` | **ĐÚNG** (Luật 109 Điều 8.2) |

### Inferences
- Sửa mốc tra cứu: truyền ngày cuối của **tháng lương** (`period`) vào `computeInsurance`, và giữ `payDate` cho thuế TNCN.
- Cờ nhân viên nên có 3 nhóm:
  - HĐLĐ từ 3 tháng: đóng bảo hiểm, thuế lũy tiến.
  - HĐLĐ từ 1 đến dưới 3 tháng: đóng bảo hiểm, thuế 10% với khoản chi từ 5 triệu/lần.
  - Không HĐLĐ hoặc HĐLĐ dưới 1 tháng: không đóng bảo hiểm, thuế 10%.
- BHTN cho HĐLĐ từ 1 tháng: Luật Việc làm 2025 được cho là mở rộng tương tự từ 01/01/2026, nhưng phiên này chưa đọc được nguồn (xem Gaps).

### Gaps
- Phạm vi BHTN và BHYT với HĐLĐ 1 đến dưới 3 tháng: chưa đọc được điều khoản Luật Việc làm 2025. Bài trên media.chinhphu.vn trả về dữ liệu nén, không đọc được.
- Chưa có nghị định tách "mức tham chiếu" khỏi lương cơ sở. Các nguồn vẫn coi hai mức này bằng nhau.
- Chưa xác minh quy định đóng BHXH khi người lao động nghỉ không lương từ 14 ngày trong tháng (Điều 33.5). Bài trích dẫn có nhắc nhưng bị cắt.

## Ngày nghỉ lễ ảnh hưởng hạn nộp

### Takeaway
Bảng `holidays` 2026–2027 trong `tax-rules.js` khớp với kết quả xác minh ngày 08/11/2026. Danh sách có ngày Văn hóa Việt Nam 24/11 (NQ 28/2026/QH16) và ngày hoán đổi 31/8/2026. Trong phần còn lại của năm 2026, không hạn TNCN hay BHXH nào rơi vào ngày nghỉ. Hạn BHXH tháng 10/2026 là 30/11/2026 (thứ Hai), không trùng ngày 24/11.

### Cited Findings
- Bộ luật Lao động 2019 Điều 112. NQ 28/2026/QH16 Điều 2 thêm ngày 24/11, từ 01/7/2026. Mùng 1 Tết 2026 là 17/02, Tết 2027 là 06/02/2027. Công chức nghỉ Tết 2027 từ 04/02 đến 10/02 — [LuatVietnam](https://luatvietnam.vn/tin-van-ban-moi/tu-hom-nay-01-7-2026-nguoi-lao-dong-chinh-thuc-co-them-1-ngay-nghi-huong-nguyen-luong-186-109961-article.html); [CafeF](https://cafef.vn/chi-tiet-lich-nghi-tet-nguyen-dan-binh-ngo-va-cac-ky-nghi-dai-trong-nam-2026-188260125191650987.chn); [Vietnam.vn](https://www.vietnam.vn/bo-noi-vu-thong-bao-chi-tiet-lich-nghi-tet-nguyen-dan-quoc-khanh-2027) (qua [N2] mục C)
- NĐ 252 Điều 3.7: hạn rơi vào ngày nghỉ thì lùi sang ngày làm việc liền kề (qua [N2])

**Đối chiếu phần mềm**

| Quy tắc | Phần mềm | Verdict |
|---|---|---|
| Ngày nghỉ 2026 (gồm 27/4, 31/8, 24/11) và 2027 (Tết 04–10/02, 03/5, 03/9, 24/11) | `holidays` | **ĐÚNG** theo [N2] |
| Giỗ Tổ 2027 (16/4/2027) | Tự tính theo âm lịch | Chưa có thông báo chính thức |
| Hạn 05/KK quý 4/2026 = 31/01/2027 (Chủ nhật) | `computeDueDate` lùi sang 01/02/2027 | **ĐÚNG** (Tết 2027 bắt đầu 04/02) |
| Hạn BHXH tháng 12/2026 = 31/01/2027, lùi sang 01/02/2027 | Không có mục BHXH | **THIẾU** (xem câu hỏi BHXH) |

### Inferences
- Nếu thêm hạn BHXH vào lịch thì dùng chung `computeDueDate`. Việc áp quy tắc lùi hạn của NĐ 252 cho BHXH chỉ là suy luận. Luật BHXH chưa thấy điều khoản tương tự.

### Gaps
- Chưa có văn bản xác nhận ngày 24/11 trùng cuối tuần có được nghỉ bù hay không. Năm 2026 và 2027 không gặp trường hợp này.
- Chưa xác minh việc lùi hạn đóng BHXH khi hạn rơi vào ngày nghỉ.
