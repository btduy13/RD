/* ==========================================================================
   DANH MỤC TÀI KHOẢN — TT99/2025 (thay TT200) và TT133/2016 (pure, no DOM)
   Hai danh mục RIÊNG vì có mã trùng khác nghĩa: 3385/3386 (BHTN), 1386/244 và 3386/344
   (ký quỹ), 2281, 641/642. Nguồn: TT99 Phụ lục II; TT133 Phụ lục 1 (sửa bởi TT46/2025).
   ========================================================================== */

// "TT200" là giá trị cũ đã lưu (và đồng bộ cloud) — được đọc như TT99 (TT99 thay TT200 từ năm tài chính 2026).
function normalizeAccountingStandard(std) {
  return String(std ?? "").trim().toUpperCase() === "TT133" ? "TT133" : "TT99";
}

function isTT99Family(std) {
  return normalizeAccountingStandard(std) === "TT99";
}

// Cấp 1 + toàn bộ TK cấp 2/3 quy định (TT99 Phụ lục II; TT133 Phụ lục 1) — thiếu cấp con quy định thì isValidAccount từ chối TK hợp lệ. Mỗi dòng "mã|tên|tính chất" (D = dư Nợ, C = dư Có, B = lưỡng tính). Dấu "*" sau mã: tài khoản chi tiết
// do doanh nghiệp tự mở (TT99 Điều 11 / TT46/2025) — không tính là cấp con bắt buộc của tài khoản cha.
const TT99_ACCOUNT_LINES = `
111|Tiền mặt|D
1111*|Tiền Việt Nam|D
112|Tiền gửi không kỳ hạn|D
1121*|Tiền Việt Nam|D
113|Tiền đang chuyển|D
121|Chứng khoán kinh doanh|D
128|Đầu tư nắm giữ đến ngày đáo hạn|D
1281|Tiền gửi có kỳ hạn|D
1282|Trái phiếu|D
1283|Cho vay|D
1288|Các khoản đầu tư khác nắm giữ đến ngày đáo hạn|D
131|Phải thu của khách hàng|B
133|Thuế GTGT được khấu trừ|D
1331|Thuế GTGT được khấu trừ của hàng hóa, dịch vụ|D
1332|Thuế GTGT được khấu trừ của TSCĐ|D
136|Phải thu nội bộ|D
1361|Vốn kinh doanh ở đơn vị trực thuộc|D
1362|Phải thu nội bộ về chênh lệch tỷ giá|D
1363|Phải thu nội bộ về chi phí đi vay đủ điều kiện được vốn hoá|D
1368|Phải thu nội bộ khác|D
138|Phải thu khác|B
1381|Tài sản thiếu chờ xử lý|D
1383|Thuế TTĐB của hàng nhập khẩu|D
1388|Phải thu khác|B
141|Tạm ứng|D
151|Hàng mua đang đi đường|D
152|Nguyên liệu, vật liệu|D
153|Công cụ, dụng cụ|D
154|Chi phí sản xuất, kinh doanh dở dang|D
155|Sản phẩm|D
156|Hàng hóa|D
1561*|Giá mua hàng hóa|D
1562*|Chi phí thu mua hàng hóa|D
157|Hàng gửi đi bán|D
158|Nguyên liệu, vật tư tại kho bảo thuế|D
171|Giao dịch mua, bán lại trái phiếu chính phủ|D
211|Tài sản cố định hữu hình|D
212|Tài sản cố định thuê tài chính|D
213|Tài sản cố định vô hình|D
214|Hao mòn tài sản cố định|C
2141|Hao mòn TSCĐ hữu hình|C
2142|Hao mòn TSCĐ thuê tài chính|C
2143|Hao mòn TSCĐ vô hình|C
2147|Hao mòn BĐSĐT|C
215|Tài sản sinh học|D
2151|Súc vật nuôi cho sản phẩm định kỳ|D
21511|Súc vật nuôi cho sản phẩm định kỳ chưa đạt đến giai đoạn trưởng thành|D
21512|Súc vật nuôi cho sản phẩm định kỳ đạt đến giai đoạn trưởng thành|B
215121|Nguyên giá|D
215122|Giá trị khấu hao lũy kế|C
2152|Súc vật nuôi lấy sản phẩm một lần|D
2153|Cây trồng theo mùa vụ hoặc lấy sản phẩm một lần|D
217|Bất động sản đầu tư|D
221|Đầu tư vào công ty con|D
222|Đầu tư vào công ty liên doanh, liên kết|D
228|Đầu tư khác|D
2281|Đầu tư góp vốn vào đơn vị khác|D
2288|Đầu tư khác|D
229|Dự phòng tổn thất tài sản|C
2291|Dự phòng giảm giá chứng khoán kinh doanh|C
2292|Dự phòng tổn thất đầu tư vào đơn vị khác|C
2293|Dự phòng phải thu khó đòi|C
2294|Dự phòng giảm giá hàng tồn kho|C
2295|Dự phòng tổn thất tài sản sinh học|C
241|Xây dựng cơ bản dở dang|D
2411|Mua sắm TSCĐ|D
2412|Xây dựng cơ bản|D
2413|Sửa chữa, bảo dưỡng định kỳ TSCĐ|D
2414|Nâng cấp, cải tạo TSCĐ|D
242|Chi phí chờ phân bổ|D
243|Tài sản thuế thu nhập hoãn lại|D
244|Ký quỹ, ký cược|D
331|Phải trả cho người bán|B
332|Phải trả cổ tức, lợi nhuận|C
333|Thuế và các khoản phải nộp Nhà nước|B
3331|Thuế giá trị gia tăng phải nộp|C
33311|Thuế GTGT đầu ra|C
33312|Thuế GTGT hàng nhập khẩu|C
3332|Thuế tiêu thụ đặc biệt|C
3333|Thuế xuất, nhập khẩu|C
3334|Thuế thu nhập doanh nghiệp|B
3335|Thuế thu nhập cá nhân|C
3336|Thuế tài nguyên|C
3337|Thuế nhà đất, tiền thuê đất|C
3338|Thuế bảo vệ môi trường và các loại thuế khác|C
33381|Thuế bảo vệ môi trường|C
33382|Các loại thuế khác|C
3339|Phí, lệ phí và các khoản phải nộp khác|C
334|Phải trả người lao động|B
335|Chi phí phải trả|C
336|Phải trả nội bộ|C
3361|Phải trả nội bộ về vốn kinh doanh|C
3362|Phải trả nội bộ về chênh lệch tỷ giá|C
3363|Phải trả nội bộ về chi phí đi vay đủ điều kiện được vốn hóa|C
3368|Phải trả nội bộ khác|C
337|Thanh toán theo tiến độ hợp đồng xây dựng|B
338|Phải trả, phải nộp khác|B
3381|Tài sản thừa chờ giải quyết|C
3382|Kinh phí công đoàn|C
3383|Bảo hiểm xã hội|C
3384|Bảo hiểm y tế|C
3386|Bảo hiểm thất nghiệp|C
3387|Doanh thu chờ phân bổ|C
3388|Phải trả, phải nộp khác|B
341|Vay và nợ thuê tài chính|C
3411|Các khoản đi vay|C
3412|Nợ thuê tài chính|C
343|Trái phiếu phát hành|C
3431|Trái phiếu thường|C
3432|Trái phiếu chuyển đổi|C
344|Nhận ký quỹ, ký cược|C
347|Thuế thu nhập hoãn lại phải trả|C
352|Dự phòng phải trả|C
3521|Dự phòng bảo hành sản phẩm, hàng hóa|C
3522|Dự phòng bảo hành công trình xây dựng|C
3523|Dự phòng tái cơ cấu doanh nghiệp|C
3525|Dự phòng phải trả khác|C
353|Quỹ khen thưởng, phúc lợi|C
3531|Quỹ khen thưởng|C
3532|Quỹ phúc lợi|C
3533|Quỹ phúc lợi đã hình thành TSCĐ|C
3534|Quỹ thưởng ban quản lý điều hành công ty|C
356|Quỹ phát triển khoa học và công nghệ|C
3561|Quỹ phát triển khoa học và công nghệ|C
3562|Quỹ phát triển khoa học và công nghệ đã hình thành tài sản|C
357|Quỹ bình ổn giá|C
411|Vốn đầu tư của chủ sở hữu|C
4111|Vốn góp của chủ sở hữu|C
41111|Cổ phiếu phổ thông có quyền biểu quyết|C
41112|Cổ phiếu ưu đãi|C
4112|Thặng dư vốn|B
4113|Quyền chọn chuyển đổi trái phiếu|C
4118|Vốn khác|C
412|Chênh lệch đánh giá lại tài sản|B
413|Chênh lệch tỷ giá hối đoái|B
414|Quỹ đầu tư phát triển|C
418|Các quỹ khác thuộc vốn chủ sở hữu|C
419|Cổ phiếu mua lại của chính mình|D
421|Lợi nhuận sau thuế chưa phân phối|B
4211|Lợi nhuận sau thuế chưa phân phối lũy kế đến cuối năm trước|B
4212|Lợi nhuận sau thuế chưa phân phối năm nay|B
511|Doanh thu bán hàng và cung cấp dịch vụ|C
5111*|Doanh thu bán hàng hóa|C
515|Doanh thu hoạt động tài chính|C
521|Các khoản giảm trừ doanh thu|D
5211*|Chiết khấu thương mại|D
5212*|Hàng bán bị trả lại|D
5213*|Giảm giá hàng bán|D
621|Chi phí nguyên liệu, vật liệu trực tiếp|D
622|Chi phí nhân công trực tiếp|D
623|Chi phí sử dụng máy thi công|D
6231|Chi phí nhân công|D
6232|Chi phí vật liệu|D
6233|Chi phí dụng cụ sản xuất|D
6234|Chi phí khấu hao máy thi công|D
6237|Chi phí dịch vụ mua ngoài|D
6238|Chi phí bằng tiền khác|D
627|Chi phí sản xuất chung|D
6271|Chi phí nhân viên phân xưởng|D
6272|Chi phí vật liệu|D
6273|Chi phí dụng cụ sản xuất|D
6274|Chi phí khấu hao TSCĐ|D
6275|Thuế, phí, lệ phí|D
6277|Chi phí dịch vụ mua ngoài|D
6278|Chi phí bằng tiền khác|D
632|Giá vốn hàng bán|D
635|Chi phí tài chính|D
641|Chi phí bán hàng|D
6411|Chi phí nhân viên|D
6412|Chi phí vật liệu, bao bì|D
6413|Chi phí dụng cụ, đồ dùng|D
6414|Chi phí khấu hao TSCĐ|D
6415|Thuế, phí, lệ phí|D
6417|Chi phí dịch vụ mua ngoài|D
6418|Chi phí bằng tiền khác|D
642|Chi phí quản lý doanh nghiệp|D
6421|Chi phí nhân viên quản lý|D
6422|Chi phí vật liệu quản lý|D
6423|Chi phí đồ dùng văn phòng|D
6424|Chi phí khấu hao TSCĐ|D
6425|Thuế, phí và lệ phí|D
6426|Chi phí dự phòng|D
6427|Chi phí dịch vụ mua ngoài|D
6428|Chi phí bằng tiền khác|D
711|Thu nhập khác|C
811|Chi phí khác|D
821|Chi phí thuế thu nhập doanh nghiệp|D
8211|Chi phí thuế TNDN hiện hành|D
82111|Chi phí thuế TNDN hiện hành theo quy định của Luật thuế TNDN|D
82112!|Chi phí thuế TNDN bổ sung theo quy định về thuế tối thiểu toàn cầu|D
8212|Chi phí thuế TNDN hoãn lại|D
911|Xác định kết quả kinh doanh|B
`;
// "!" sau mã: có trong danh mục nhưng mặc định ẩn (82112 chỉ dùng cho thuế tối thiểu toàn cầu).

const TT133_ACCOUNT_LINES = `
111|Tiền mặt|D
1111|Tiền Việt Nam|D
1112|Ngoại tệ|D
112|Tiền gửi Ngân hàng|D
1121|Tiền Việt Nam|D
1122|Ngoại tệ|D
121|Chứng khoán kinh doanh|D
128|Đầu tư nắm giữ đến ngày đáo hạn|D
1281|Tiền gửi có kỳ hạn|D
1288|Các khoản đầu tư khác nắm giữ đến ngày đáo hạn|D
131|Phải thu của khách hàng|B
133|Thuế GTGT được khấu trừ|D
1331|Thuế GTGT được khấu trừ của hàng hóa, dịch vụ|D
1332|Thuế GTGT được khấu trừ của TSCĐ|D
136|Phải thu nội bộ|D
1361|Vốn kinh doanh ở đơn vị trực thuộc|D
1368|Phải thu nội bộ khác|D
138|Phải thu khác|B
1381|Tài sản thiếu chờ xử lý|D
1386|Cầm cố, thế chấp, ký quỹ, ký cược|D
1388|Phải thu khác|B
141|Tạm ứng|D
151|Hàng mua đang đi đường|D
152|Nguyên liệu, vật liệu|D
153|Công cụ, dụng cụ|D
154|Chi phí sản xuất, kinh doanh dở dang|D
155|Thành phẩm|D
156|Hàng hóa|D
157|Hàng gửi đi bán|D
211|Tài sản cố định|D
2111|TSCĐ hữu hình|D
2112|TSCĐ thuê tài chính|D
2113|TSCĐ vô hình|D
214|Hao mòn tài sản cố định|C
2141|Hao mòn TSCĐ hữu hình|C
2142|Hao mòn TSCĐ thuê tài chính|C
2143|Hao mòn TSCĐ vô hình|C
2147|Hao mòn bất động sản đầu tư|C
217|Bất động sản đầu tư|D
228|Đầu tư góp vốn vào đơn vị khác|D
2281|Đầu tư vào công ty liên doanh, liên kết|D
2288|Đầu tư khác|D
229|Dự phòng tổn thất tài sản|C
2291|Dự phòng giảm giá chứng khoán kinh doanh|C
2292|Dự phòng tổn thất đầu tư vào đơn vị khác|C
2293|Dự phòng phải thu khó đòi|C
2294|Dự phòng giảm giá hàng tồn kho|C
241|Xây dựng cơ bản dở dang|D
2411|Mua sắm TSCĐ|D
2412|Xây dựng cơ bản|D
2413|Sửa chữa lớn TSCĐ|D
242|Chi phí trả trước|D
331|Phải trả cho người bán|B
333|Thuế và các khoản phải nộp Nhà nước|B
3331|Thuế giá trị gia tăng phải nộp|C
33311|Thuế GTGT đầu ra|C
33312|Thuế GTGT hàng nhập khẩu|C
3332|Thuế tiêu thụ đặc biệt|C
3333|Thuế xuất, nhập khẩu|C
3334|Thuế thu nhập doanh nghiệp|B
3335|Thuế thu nhập cá nhân|C
3336|Thuế tài nguyên|C
3337|Thuế nhà đất, tiền thuê đất|C
3338|Thuế bảo vệ môi trường và các loại thuế khác|C
3339|Phí, lệ phí và các khoản phải nộp khác|C
334|Phải trả người lao động|B
335|Chi phí phải trả|C
336|Phải trả nội bộ|C
3361|Phải trả nội bộ về vốn kinh doanh|C
3368|Phải trả nội bộ khác|C
338|Phải trả, phải nộp khác|B
3381|Tài sản thừa chờ giải quyết|C
3382|Kinh phí công đoàn|C
3383|Bảo hiểm xã hội|C
3384|Bảo hiểm y tế|C
3385|Bảo hiểm thất nghiệp|C
3386|Nhận ký quỹ, ký cược|C
3387|Doanh thu chưa thực hiện|C
3388|Phải trả, phải nộp khác|B
341|Vay và nợ thuê tài chính|C
3411|Các khoản đi vay|C
3412|Nợ thuê tài chính|C
352|Dự phòng phải trả|C
3521|Dự phòng bảo hành sản phẩm hàng hóa|C
3522|Dự phòng bảo hành công trình xây dựng|C
3524|Dự phòng phải trả khác|C
353|Quỹ khen thưởng, phúc lợi|C
3531|Quỹ khen thưởng|C
3532|Quỹ phúc lợi|C
3533|Quỹ phúc lợi đã hình thành TSCĐ|C
3534|Quỹ thưởng ban quản lý điều hành công ty|C
356|Quỹ phát triển khoa học và công nghệ|C
3561|Quỹ phát triển khoa học và công nghệ|C
3562|Quỹ phát triển khoa học và công nghệ đã hình thành TSCĐ|C
411|Vốn đầu tư của chủ sở hữu|C
4111|Vốn góp của chủ sở hữu|C
4112|Thặng dư vốn cổ phần|B
4118|Vốn khác|C
413|Chênh lệch tỷ giá hối đoái|B
418|Các quỹ thuộc vốn chủ sở hữu|C
419|Cổ phiếu quỹ|D
421|Lợi nhuận sau thuế chưa phân phối|B
4211|Lợi nhuận sau thuế chưa phân phối năm trước|B
4212|Lợi nhuận sau thuế chưa phân phối năm nay|B
511|Doanh thu bán hàng và cung cấp dịch vụ|C
5111|Doanh thu bán hàng hóa|C
5112|Doanh thu bán thành phẩm|C
5113|Doanh thu cung cấp dịch vụ|C
5118|Doanh thu khác|C
515|Doanh thu hoạt động tài chính|C
611|Mua hàng|D
631|Giá thành sản xuất|D
632|Giá vốn hàng bán|D
635|Chi phí tài chính|D
642|Chi phí quản lý kinh doanh|D
6421|Chi phí bán hàng|D
6422|Chi phí quản lý doanh nghiệp|D
711|Thu nhập khác|C
811|Chi phí khác|D
821|Chi phí thuế thu nhập doanh nghiệp|D
911|Xác định kết quả kinh doanh|B
`;

const ACCOUNT_NATURE = { D: "debit", C: "credit", B: "both" };

function parseChartLines(text) {
  const rows = text.trim().split("\n").map(line => {
    const [rawCode, name, nature] = line.split("|");
    const code = rawCode.replace(/[*!]/g, "");
    const row = { code, name, nature: ACCOUNT_NATURE[nature], parent: null, level: code.length - 2 };
    if (rawCode.includes("*")) row.optional = true;
    if (rawCode.includes("!")) row.hidden = true;
    return row;
  });
  const codes = new Set(rows.map(r => r.code));
  rows.forEach(r => {
    for (let len = r.code.length - 1; len >= 3; len--) {
      if (codes.has(r.code.slice(0, len))) { r.parent = r.code.slice(0, len); break; }
    }
  });
  return Object.freeze(rows.map(r => Object.freeze(r)));
}

const CHART_OF_ACCOUNTS = {
  TT99: parseChartLines(TT99_ACCOUNT_LINES),
  TT133: parseChartLines(TT133_ACCOUNT_LINES)
};
const CHART_INDEX = {
  TT99: new Map(CHART_OF_ACCOUNTS.TT99.map(a => [a.code, a])),
  TT133: new Map(CHART_OF_ACCOUNTS.TT133.map(a => [a.code, a]))
};

function getChartOfAccounts(std) {
  return CHART_OF_ACCOUNTS[normalizeAccountingStandard(std)];
}

function getChartAccount(code, std) {
  return CHART_INDEX[normalizeAccountingStandard(std)].get(String(code ?? "").trim()) || null;
}

function getAccountName(code, std) {
  const account = getChartAccount(code, std);
  return account ? account.name : "";
}

// Hợp lệ khi có trong danh mục, hoặc là TK chi tiết tự mở (chỉ gồm chữ số) dưới một tài khoản của danh mục
// mà tài khoản đó KHÔNG có cấp con bắt buộc — vd. 1121 dưới 112 (TT99) hợp lệ, nhưng 1386 dưới 138 (TT99)
// hay 3385 dưới 338 (TT99) không hợp lệ vì 138/338 đã có danh sách cấp con quy định.
function isValidAccount(code, std) {
  const key = String(code ?? "").trim();
  if (!/^\d{3,}$/.test(key)) return false;
  const index = CHART_INDEX[normalizeAccountingStandard(std)];
  if (index.has(key)) return true;
  for (let len = key.length - 1; len >= 3; len--) {
    const ancestor = index.get(key.slice(0, len));
    if (!ancestor) continue;
    for (const account of index.values()) {
      if (account.parent === ancestor.code && !account.optional) return false;
    }
    return true;
  }
  return false;
}

const CHART_OF_ACCOUNTS_API = { normalizeAccountingStandard, isTT99Family, getChartOfAccounts, getAccountName, isValidAccount };
if (typeof window !== "undefined") Object.assign(window, CHART_OF_ACCOUNTS_API);
if (typeof module !== "undefined" && module.exports) module.exports = CHART_OF_ACCOUNTS_API;
