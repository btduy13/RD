/* ==========================================================================
   THUẾ & BÁO CÁO TÀI CHÍNH — tab "Thuế & BCTC" (<div id="tax-reports-root">)
   Hàm tính toán thuần (tham số st = state, không DOM) để test bằng Node; phần DOM ở cuối file.
   Căn cứ: reports/Luật thuế kế toán Việt Nam 2026.md; research_notes/Luật thuế kế toán Việt Nam 2026/
   thue_gtgt_hoa_don.md (chỉ tiêu 01/GTGT), che_do_ke_toan_tt99_tt133.md (mã số B01/B02).
   Phụ thuộc lõi: chart-of-accounts.js, tax-rules.js, accounting-engine.js (getAccountTurnover, vatRateKey).
   ========================================================================== */

// TT 89/2026 Đ100: mẫu 01/GTGT mới từ kỳ tháng 7/2026 hoặc quý 3/2026 — nhưng HTKK 5.8.2 chưa có mẫu này nên mặc định
// vẫn mẫu TT 80 (QĐ 1934/QĐ-BTC, TT 89 Đ99.2); chỉ dùng TT 89 khi taxSettings.vat01Form = "TT89".
const TR_TT89_FROM = "2026-07-01";
const TR_CIT_MIN_SHARE = 0.8; // NĐ 252/2026 Đ24: tổng tạm nộp 4 quý ≥ 80% số quyết toán
const TR_VAT_SIDES = { sales: ["sales", 1], sales_return: ["sales", -1], purchase: ["purchase", 1], purchase_return: ["purchase", -1] };
const TR_VAT_RATES = ["KCT", "0", "5", "8", "10", "KKKNT"];
const trPad = n => String(n).padStart(2, "0");
const trRound = n => Math.round(Number(n) || 0);
const trDate = v => String((v && v.date) || "").slice(0, 10);

// ---- Kỳ báo cáo ----
function taxReportPeriod(kind, year, n) {
  year = Number(year); n = Number(n) || 1;
  if (kind === "year") return { kind, year, n: 1, from: `${year}-01-01`, to: `${year}-12-31`, label: `Năm ${year}` };
  const quarter = kind === "quarter";
  const m1 = quarter ? (n - 1) * 3 + 1 : n, m2 = quarter ? m1 + 2 : n;
  const last = new Date(Date.UTC(year, m2, 0)).getUTCDate();
  return { kind, year, n, from: `${year}-${trPad(m1)}-01`, to: `${year}-${trPad(m2)}-${trPad(last)}`, label: quarter ? `Quý ${n}/${year}` : `Tháng ${n}/${year}` };
}

function shiftTaxReportPeriod(p, delta) {
  const per = { year: 1, quarter: 4, month: 12 }[p.kind];
  const idx = p.year * per + (p.n - 1) + delta;
  return taxReportPeriod(p.kind, Math.floor(idx / per), (idx % per) + 1);
}

// ---- Bảng kê hóa đơn bán ra / mua vào theo nhóm thuế suất (từ v.vatBreakdown) ----
// Kỳ theo ngày hạch toán v.date (thường trùng ngày hóa đơn). Hàng trả lại ghi âm vào bên tương ứng.
function buildVatInvoiceList(st, from, to) {
  const partners = new Map(((st && st.partners) || []).map(p => [p && p.id, p || {}]));
  const out = { sales: { groups: {}, base: 0, tax: 0 }, purchase: { groups: {}, base: 0, tax: 0 } };
  ((st && st.vouchers) || []).forEach(v => {
    const side = v && TR_VAT_SIDES[v.type];
    const date = trDate(v);
    if (!side || date < from || date > to) return;
    const [name, sign] = side;
    const p = partners.get(v.partnerId) || {};
    Object.entries(v.vatBreakdown || {}).forEach(([rate, b]) => {
      const row = {
        id: v.id, type: v.type, date, rate,
        invoiceForm: v.invoiceForm || "", invoiceSymbol: v.invoiceSymbol || "", invoiceNo: v.invoiceNo || "", invoiceDate: v.invoiceDate || "",
        partnerName: v.partnerName || p.name || "", taxCode: v.partnerTaxCode || p.taxCode || "",
        base: sign * (Number(b && b.base) || 0), tax: sign * (Number(b && b.tax) || 0),
        nonDeductible: name === "purchase" && !!v.vatNonDeductible
      };
      const g = out[name].groups[rate] || (out[name].groups[rate] = { rows: [], base: 0, tax: 0 });
      g.rows.push(row); g.base += row.base; g.tax += row.tax;
      out[name].base += row.base; out[name].tax += row.tax;
    });
  });
  return out;
}

// ---- Tờ khai 01/GTGT ----
// inputs: chỉ tiêu nhập tay [22], [37], [38], [39a], [40b], [42], (TT89) [32b], [34a]; thiếu = 0.
// Doanh số 8% (NĐ 174) khai ở [32]; [33] = 10% × [32] − tổng số giảm trên phụ lục (cách HTKK tính, ASP MISA).
function computeVat01(st, from, to, inputs = {}) {
  const list = buildVatInvoiceList(st, from, to);
  const version = ((st && st.taxSettings) || {}).vat01Form === "TT89" && from >= TR_TT89_FROM ? "TT89" : "TT80";
  const s = rate => list.sales.groups[rate] || { base: 0, tax: 0 };
  const inp = k => trRound(inputs[k]);
  const purchases = Object.values(list.purchase.groups).flatMap(g => g.rows);
  const r = {};
  r["21"] = !purchases.length && !Object.keys(list.sales.groups).length;
  r["22"] = inp("22");
  r["23"] = trRound(list.purchase.base);
  r["24"] = trRound(list.purchase.tax);
  r["23a"] = 0; r["24a"] = 0; // shortcut: chưa có cờ hàng nhập khẩu trên chứng từ — thêm khi phiếu mua có trường nhập khẩu
  r["25"] = trRound(purchases.filter(x => !x.nonDeductible).reduce((sum, x) => sum + x.tax, 0));
  r["26"] = trRound(s("KCT").base);
  r["29"] = trRound(s("0").base);
  r["30"] = trRound(s("5").base); r["31"] = trRound(s("5").tax);
  r["32"] = trRound(s("10").base + s("8").base);
  r["33"] = trRound(r["32"] * 0.1) - buildVatReductionAppendix(st, from, to).reduction;
  r["32a"] = trRound(s("KKKNT").base);
  if (version === "TT89") { r["32b"] = inp("32b"); r["34a"] = inp("34a"); }
  r["27"] = r["29"] + r["30"] + r["32"] + r["32a"] - (r["32b"] || 0);
  r["28"] = r["31"] + r["33"];
  r["34"] = r["26"] + r["27"] + (r["34a"] || 0);
  r["35"] = r["28"];
  r["36"] = r["35"] - r["25"];
  r["37"] = inp("37"); r["38"] = inp("38"); r["39a"] = inp("39a");
  const net = r["36"] - r["22"] + r["37"] - r["38"] - r["39a"];
  r["40a"] = Math.max(net, 0);
  r["40b"] = Math.min(inp("40b"), r["40a"]);
  r["40"] = r["40a"] - r["40b"];
  r["41"] = Math.max(-net, 0);
  r["42"] = Math.min(inp("42"), r["41"]);
  r["43"] = r["41"] - r["42"];
  const warnings = Object.keys(list.sales.groups).concat(Object.keys(list.purchase.groups))
    .filter(rate => !TR_VAT_RATES.includes(rate)).map(rate => `Thuế suất "${rate}" không thuộc nhóm nào của tờ khai — kiểm tra lại chứng từ.`);
  return { version, from, to, values: r, list, warnings };
}

// [22] gợi ý = [43] kỳ trước, tính lần lượt từ kỳ có chứng từ đầu tiên.
// shortcut: giả định cùng một kỳ khai (tháng/quý) suốt lịch sử và không có [37]/[38]/[42]; người dùng sửa tay nếu khác.
function suggestVatCarryForward(st, period) {
  const first = ((st && st.vouchers) || []).filter(v => v && TR_VAT_SIDES[v.type]).map(trDate).filter(Boolean).sort()[0];
  if (!first || first >= period.from) return 0;
  let p = taxReportPeriod(period.kind, Number(first.slice(0, 4)), 1), carry = 0;
  for (let i = 0; p.from < period.from && i < 400; i++, p = shiftTaxReportPeriod(p, 1)) {
    carry = computeVat01(st, p.from, p.to, { 22: carry }).values["43"];
  }
  return carry;
}

// Phụ lục giảm thuế GTGT (Mẫu 01, Phụ lục III NĐ 174/2025): dòng bán ra thuế suất 8%, số giảm = giá trị × (10% − 8%).
function buildVatReductionAppendix(st, from, to) {
  const rule = getTaxRule("vat.reduced8.window", to) || getTaxRule("vat.reduced8.window", from);
  const { rate = 8, baseRate = 10 } = (rule && rule.value) || {};
  const products = new Map(((st && st.products) || []).map(p => [p && p.id, p || {}]));
  const lines = {};
  ((st && st.vouchers) || []).forEach(v => {
    const side = v && TR_VAT_SIDES[v.type];
    const date = trDate(v);
    if (!side || side[0] !== "sales" || date < from || date > to) return;
    (v.items || []).forEach(item => {
      if (!item) return;
      const own = item.vatRate !== undefined && item.vatRate !== null && item.vatRate !== "";
      if (vatRateKey(own ? item.vatRate : v.taxRate || 0) !== String(rate)) return;
      const name = item.productName || item.name || (products.get(item.productId) || {}).name || item.productId || "";
      const line = lines[name] || (lines[name] = { name, base: 0 });
      line.base += side[1] * (Number(item.amount) || 0);
    });
  });
  const rows = Object.values(lines).map(l => ({ ...l, baseRate, rate, reduction: trRound(l.base * (baseRate - rate) / 100) }));
  return {
    rule, rows,
    base: rows.reduce((s, x) => s + x.base, 0), reduction: rows.reduce((s, x) => s + x.reduction, 0),
    warnings: rows.length && !rule ? ["Có doanh số thuế suất 8% ngoài thời gian giảm thuế theo NĐ 174/2025 (01/7/2025–31/12/2026)."] : []
  };
}

// ---- Kết quả kinh doanh từ phát sinh trong kỳ (bỏ chứng từ kết chuyển period_close) ----
const TR_PL_PREFIXES = ["511", "521", "515", "632", "635", "641", "642", "711", "811", "821"];
function computeProfitLoss(st, from, to, excludeId) {
  const s = { ...st, vouchers: ((st && st.vouchers) || []).filter(v => v && v.type !== "period_close" && (!excludeId || v.id !== excludeId)) };
  const turn = code => getAccountTurnover(s, code, from, to);
  const dr = code => { const t = turn(code); return t.debit - t.credit; };
  const s511 = turn("511");
  const r = {
    sales: s511.credit, deductions: s511.debit + dr("521"), cogs: dr("632"),
    finIncome: -dr("515"), finExpense: dr("635"),
    borrowingCost: 0, // shortcut: chưa tách chi phí lãi vay trong 635 — thêm khi có TK chi tiết lãi vay
    selling: dr("641"), admin: dr("642"), otherIncome: -dr("711"), otherExpense: dr("811"), citDeferred: dr("8212")
  };
  r.citCurrent = dr("821") - r.citDeferred;
  r.netRevenue = r.sales - r.deductions;
  r.grossProfit = r.netRevenue - r.cogs;
  r.operatingProfit = r.grossProfit + r.finIncome - r.finExpense - r.selling - r.admin;
  r.otherProfit = r.otherIncome - r.otherExpense;
  r.profitBeforeTax = r.operatingProfit + r.otherProfit;
  r.profitAfterTax = r.profitBeforeTax - r.citCurrent - r.citDeferred;
  r.citRevenue = r.netRevenue + r.finIncome + r.otherIncome; // NĐ 320 Đ11.4: DT thuần + DT tài chính + thu nhập khác
  // Không ẩn số liệu: TK loại 5–8 ngoài các dòng B02 được liệt kê để kế toán xử lý.
  const stray = new Set();
  s.vouchers.forEach(v => {
    const d = trDate(v);
    if ((from && d < from) || (to && d > to) || !Array.isArray(v.entries)) return;
    v.entries.forEach(e => [e && e.debit, e && e.credit].forEach(c => {
      c = String(c ?? "").trim();
      if (/^[5-8]/.test(c) && !TR_PL_PREFIXES.some(p => c.startsWith(p))) stray.add(c);
    }));
  });
  r.warnings = stray.size ? [`Có phát sinh TK ${[...stray].sort().join(", ")} không thuộc dòng nào của B02 — chưa tính vào lợi nhuận.`] : [];
  return r;
}

// ---- Thuế TNDN tạm tính quý / ước quyết toán năm ----
// Thuế suất xét theo doanh thu năm N−1 (NĐ 320 Đ11), giảm 30% xét theo doanh thu năm N (NĐ 398/2026).
// shortcut: thu nhập tính thuế = lợi nhuận kế toán lũy kế (chưa điều chỉnh chi phí không được trừ, chưa chuyển lỗ);
// doanh thu năm N cho phép thử 10 tỷ = lũy kế đến cuối quý — khi quyết toán dùng số cả năm.
function computeCitEstimate(st, year, quarter) {
  year = Number(year); quarter = Math.min(Math.max(Number(quarter) || 4, 1), 4);
  const yearEnd = `${year}-12-31`;
  // Doanh thu năm trước nhập tay (taxSettings.prevYearRevenue[năm tính thuế]) khi năm trước chưa có sổ trong phần mềm.
  const override = (((st && st.taxSettings) || {}).prevYearRevenue || {})[year];
  const hasOverride = override !== undefined && override !== null && override !== "";
  const hasPrevVouchers = ((st && st.vouchers) || []).some(v => trDate(v).startsWith(`${year - 1}-`));
  const prevRevenue = hasOverride ? Number(override) || 0 : computeProfitLoss(st, `${year - 1}-01-01`, `${year - 1}-12-31`).citRevenue;
  const warnings = !hasOverride && !hasPrevVouchers
    ? [`Năm ${year - 1} không có chứng từ — thuế suất đang xét theo doanh thu 0. Nhập doanh thu năm ${year - 1} để xác định đúng thuế suất.`] : [];
  const rateRule = getTaxRule("cit.rateTiers", yearEnd);
  const tiers = rateRule ? rateRule.value : [{ maxRevenue: null, rate: 20 }];
  const rate = tiers.find(t => t.maxRevenue === null || prevRevenue <= t.maxRevenue).rate;
  const reductionRule = getTaxRule("cit.reduction30", yearEnd);
  const bookedOf = q => ((st && st.vouchers) || []).filter(v => v && v.type === "general_journal" && v.citProvision === `${year}-Q${q}`)
    .flatMap(v => v.entries || []).reduce((s, e) => s + (String(e.credit).trim() === "3334" ? 1 : String(e.debit).trim() === "3334" ? -1 : 0) * (Number(e.amount) || 0), 0);
  let bookedBefore = 0;
  const quarters = [1, 2, 3, 4].map(q => {
    const p = taxReportPeriod("quarter", year, q);
    const pl = computeProfitLoss(st, `${year}-01-01`, p.to);
    const taxable = Math.max(trRound(pl.profitBeforeTax), 0);
    const gross = trRound(taxable * rate / 100);
    const reduction = reductionRule && pl.citRevenue <= reductionRule.value.maxRevenue ? trRound(gross * reductionRule.value.percent / 100) : 0;
    const taxYtd = gross - reduction;
    const booked = trRound(bookedOf(q));
    const row = { q, from: p.from, to: p.to, revenue: pl.citRevenue, profit: pl.profitBeforeTax, taxable, gross, reduction, taxYtd, booked, amount: Math.max(taxYtd - bookedBefore, 0) };
    bookedBefore += booked;
    return row;
  });
  const annual = quarters[3].taxYtd;
  const provisionalTotal = quarters.reduce((s, x) => s + x.booked, 0);
  const required80 = trRound(annual * TR_CIT_MIN_SHARE);
  return {
    year, quarter, prevRevenue, prevRevenueOverride: hasOverride, warnings, rate, rateRule, reductionRule, quarters, current: quarters[quarter - 1],
    annual, provisionalTotal, required80, meets80: provisionalTotal >= required80, shortfall: Math.max(required80 - provisionalTotal, 0),
    account: isTT99Family(st && st.accountingStandard) ? "82111" : "821"
  };
}

// Phiếu kế toán tạm tính thuế TNDN quý: Nợ 82111 (TT133: 821) / Có 3334, ngày cuối quý.
function buildCitProvisionVoucher(st, year, quarter) {
  const est = computeCitEstimate(st, year, quarter);
  const cur = est.current;
  const desc = `Tạm tính thuế TNDN quý ${cur.q}/${est.year}`;
  return {
    type: "general_journal", date: cur.to, citProvision: `${est.year}-Q${cur.q}`, description: desc,
    amount: cur.amount, totalAmount: cur.amount,
    entries: cur.amount > 0 ? [{ debit: est.account, credit: "3334", amount: cur.amount, desc }] : []
  };
}

// Chứng từ kết chuyển: engine (buildPeriodCloseEntries) tự sinh bút toán khi ghi sổ.
function buildPeriodCloseVoucher(from, to) {
  return { type: "period_close", date: to, periodFrom: from, periodTo: to, description: `Kết chuyển cuối kỳ ${from} – ${to}`, entries: [] };
}

// ---- Báo cáo tình hình tài chính ----
// Ánh xạ TK → mã số theo tiền tố dài nhất; [dư Nợ, dư Có] khi TK lưỡng tính đổi dòng theo chiều số dư.
// Dòng tài sản (mã < 300) lấy dư Nợ − dư Có; dòng nguồn vốn lấy dư Có − dư Nợ. TK loại 5–9 chưa kết chuyển → LNST chưa phân phối.
// shortcut: 131/331 bù trừ ở cấp tài khoản, chưa theo từng đối tượng (bút toán không mang mã đối tác) và coi mọi khoản là ngắn hạn
// — tách khi bút toán có partnerId / kỳ hạn.
const TR_B01_TT99 = {
  map: {
    "111": "111", "112": "111", "113": "111", "1281": "112", "121": "121", "2291": "122", "128": "123",
    "131": ["131", "312"], "331": ["132", "311"], "136": "133", "337": ["134", "318"], "138": ["135", "320"], "1381": "137",
    "141": "135", "244": "135", "2293": "136", "15": "141", "2294": "142", "242": "161", "133": "162", "333": ["163", "314"], "171": "164",
    "211": "222", "214": "223", "2141": "223", "212": "225", "2142": "226", "213": "228", "2143": "229", "217": "241", "2147": "242",
    "241": "252", "221": "261", "222": "262", "228": "263", "2292": "264", "243": "272",
    "332": "313", "334": "315", "335": "316", "336": "317", "3387": "319", "338": ["135", "320"], "344": "320", "341": "321",
    "352": "322", "353": "323", "356": "324", "347": "342",
    "411": "411", "4112": "412", "4113": "413", "4118": "414", "419": "415", "412": "416", "413": "417", "414": "418", "418": "419",
    "421": "420b", "4211": "420a", "4212": "420b", "5": "420b", "6": "420b", "7": "420b", "8": "420b", "9": "420b"
  },
  rows: `100|A. TÀI SẢN NGẮN HẠN|110+120+130+140+150+160
110|I. Tiền và các khoản tương đương tiền|111+112
111|1. Tiền
112|2. Các khoản tương đương tiền
120|II. Đầu tư tài chính ngắn hạn|121-126
121|1. Chứng khoán kinh doanh
122|2. Dự phòng giảm giá chứng khoán kinh doanh (*)
123|3. Đầu tư nắm giữ đến ngày đáo hạn ngắn hạn
124|4. Dự phòng đầu tư nắm giữ đến ngày đáo hạn ngắn hạn (*)
125|5. Đầu tư ngắn hạn khác
126|6. Dự phòng tổn thất các khoản đầu tư ngắn hạn khác (*)
130|III. Các khoản phải thu ngắn hạn|131-137
131|1. Phải thu ngắn hạn của khách hàng
132|2. Trả trước cho người bán ngắn hạn
133|3. Phải thu nội bộ ngắn hạn
134|4. Phải thu theo tiến độ kế hoạch hợp đồng xây dựng
135|5. Phải thu ngắn hạn khác
136|6. Dự phòng phải thu ngắn hạn khó đòi (*)
137|7. Tài sản thiếu chờ xử lý
140|IV. Hàng tồn kho|141+142
141|1. Hàng tồn kho
142|2. Dự phòng giảm giá hàng tồn kho (*)
150|V. Tài sản sinh học ngắn hạn|151-153
151|1. Tài sản sinh học ngắn hạn
152|2. Tài sản sinh học ngắn hạn khác
153|3. Dự phòng tổn thất tài sản sinh học ngắn hạn (*)
160|VI. Tài sản ngắn hạn khác|161-165
161|1. Chi phí chờ phân bổ ngắn hạn
162|2. Thuế GTGT được khấu trừ
163|3. Thuế và các khoản khác phải thu Nhà nước
164|4. Giao dịch mua bán lại trái phiếu Chính phủ
165|5. Tài sản ngắn hạn khác
200|B. TÀI SẢN DÀI HẠN|210+220+230+240+250+260+270
210|I. Các khoản phải thu dài hạn|211-216
211|1. Phải thu dài hạn của khách hàng
212|2. Trả trước cho người bán dài hạn
213|3. Vốn kinh doanh ở đơn vị trực thuộc
214|4. Phải thu nội bộ dài hạn
215|5. Phải thu dài hạn khác
216|6. Dự phòng phải thu dài hạn khó đòi (*)
220|II. Tài sản cố định|221+224+227
221|1. Tài sản cố định hữu hình|222+223
222|- Nguyên giá
223|- Giá trị hao mòn lũy kế (*)
224|2. Tài sản cố định thuê tài chính|225+226
225|- Nguyên giá
226|- Giá trị hao mòn lũy kế (*)
227|3. Tài sản cố định vô hình|228+229
228|- Nguyên giá
229|- Giá trị hao mòn lũy kế (*)
230|III. Tài sản sinh học dài hạn
240|IV. Bất động sản đầu tư|241+242
241|- Nguyên giá
242|- Giá trị hao mòn lũy kế (*)
250|V. Tài sản dở dang dài hạn|251+252
251|1. Chi phí sản xuất, kinh doanh dở dang dài hạn
252|2. Chi phí xây dựng cơ bản dở dang
260|VI. Đầu tư tài chính dài hạn|261-266
261|1. Đầu tư vào công ty con
262|2. Đầu tư vào công ty liên doanh, liên kết
263|3. Đầu tư góp vốn vào đơn vị khác
264|4. Dự phòng đầu tư tài chính dài hạn (*)
265|5. Đầu tư nắm giữ đến ngày đáo hạn dài hạn
266|6. Dự phòng đầu tư nắm giữ đến ngày đáo hạn dài hạn (*)
270|VII. Tài sản dài hạn khác|271-274
271|1. Chi phí chờ phân bổ dài hạn
272|2. Tài sản thuế thu nhập hoãn lại
273|3. Thiết bị, vật tư, phụ tùng thay thế dài hạn
274|4. Tài sản dài hạn khác
280|TỔNG CỘNG TÀI SẢN (280 = 100 + 200)|100+200
300|C. NỢ PHẢI TRẢ|310+330
310|I. Nợ ngắn hạn|311-325
311|1. Phải trả người bán ngắn hạn
312|2. Người mua trả tiền trước ngắn hạn
313|3. Phải trả cổ tức, lợi nhuận
314|4. Thuế và các khoản phải nộp Nhà nước ngắn hạn
315|5. Phải trả người lao động
316|6. Chi phí phải trả ngắn hạn
317|7. Phải trả nội bộ ngắn hạn
318|8. Phải trả theo tiến độ kế hoạch hợp đồng xây dựng
319|9. Doanh thu chờ phân bổ ngắn hạn
320|10. Phải trả ngắn hạn khác
321|11. Vay và nợ thuê tài chính ngắn hạn
322|12. Dự phòng phải trả ngắn hạn
323|13. Quỹ khen thưởng, phúc lợi
324|14. Quỹ bình ổn giá
325|15. Giao dịch mua bán lại trái phiếu Chính phủ
330|II. Nợ dài hạn|331-344
331|1. Phải trả người bán dài hạn
332|2. Người mua trả tiền trước dài hạn
333|3. Thuế và các khoản phải nộp Nhà nước dài hạn
334|4. Chi phí phải trả dài hạn
335|5. Phải trả nội bộ về vốn kinh doanh
336|6. Phải trả nội bộ dài hạn
337|7. Doanh thu chờ phân bổ dài hạn
338|8. Phải trả dài hạn khác
339|9. Vay và nợ thuê tài chính dài hạn
340|10. Trái phiếu chuyển đổi
341|11. Cổ phiếu ưu đãi
342|12. Thuế thu nhập hoãn lại phải trả
343|13. Dự phòng phải trả dài hạn
344|14. Quỹ phát triển khoa học và công nghệ
400|D. VỐN CHỦ SỞ HỮU|411-420
411|1. Vốn góp của chủ sở hữu
412|2. Thặng dư vốn
413|3. Quyền chọn chuyển đổi trái phiếu
414|4. Vốn khác của chủ sở hữu
415|5. Cổ phiếu mua lại của chính mình (*)
416|6. Chênh lệch đánh giá lại tài sản
417|7. Chênh lệch tỷ giá hối đoái
418|8. Quỹ đầu tư phát triển
419|9. Quỹ khác thuộc vốn chủ sở hữu
420|10. Lợi nhuận sau thuế chưa phân phối|420a+420b
420a|- LNST chưa phân phối lũy kế đến cuối kỳ trước
420b|- LNST chưa phân phối kỳ này
440|TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)|300+400`
};

const TR_B01A_TT133 = {
  map: {
    "111": "110", "112": "110", "113": "110", "121": "121", "128": "122", "228": "123", "229": "124",
    "131": ["131", "312"], "331": ["132", "311"], "1361": "133", "136": "134", "138": ["134", "315"], "1381": "135", "141": "134",
    "2293": "136", "15": "141", "2294": "142", "211": "151", "214": "152", "217": "161", "2147": "162", "241": "170",
    "133": "181", "242": "182", "333": ["182", "313"], "334": "314", "335": "315", "338": ["134", "315"], "341": "316", "336": "317",
    "352": "318", "353": "319", "356": "320",
    "411": "411", "4112": "412", "4118": "413", "419": "414", "413": "415", "418": "416", "421": "417",
    "5": "417", "6": "417", "7": "417", "8": "417", "9": "417"
  },
  rows: `110|1. Tiền và các khoản tương đương tiền
120|2. Đầu tư tài chính|121-124
121|a) Chứng khoán kinh doanh
122|b) Đầu tư nắm giữ đến ngày đáo hạn
123|c) Đầu tư góp vốn vào đơn vị khác
124|d) Dự phòng tổn thất đầu tư tài chính (*)
130|3. Các khoản phải thu|131-136
131|a) Phải thu của khách hàng
132|b) Trả trước cho người bán
133|c) Vốn kinh doanh ở đơn vị trực thuộc
134|d) Phải thu khác
135|đ) Tài sản thiếu chờ xử lý
136|e) Dự phòng phải thu khó đòi (*)
140|4. Hàng tồn kho|141+142
141|a) Hàng tồn kho
142|b) Dự phòng giảm giá hàng tồn kho (*)
150|5. Tài sản cố định|151+152
151|- Nguyên giá
152|- Giá trị hao mòn lũy kế (*)
160|6. Bất động sản đầu tư|161+162
161|- Nguyên giá
162|- Giá trị hao mòn lũy kế (*)
170|7. Xây dựng cơ bản dở dang
180|8. Tài sản khác|181+182
181|a) Thuế GTGT được khấu trừ
182|b) Tài sản khác
200|TỔNG CỘNG TÀI SẢN (200 = 110 + 120 + 130 + 140 + 150 + 160 + 170 + 180)|110+120+130+140+150+160+170+180
300|I. NỢ PHẢI TRẢ|311-320
311|1. Phải trả người bán
312|2. Người mua trả tiền trước
313|3. Thuế và các khoản phải nộp Nhà nước
314|4. Phải trả người lao động
315|5. Phải trả khác
316|6. Vay và nợ thuê tài chính
317|7. Phải trả nội bộ về vốn kinh doanh
318|8. Dự phòng phải trả
319|9. Quỹ khen thưởng, phúc lợi
320|10. Quỹ phát triển khoa học và công nghệ
400|II. VỐN CHỦ SỞ HỮU|411-417
411|1. Vốn góp của chủ sở hữu
412|2. Thặng dư vốn cổ phần
413|3. Vốn khác của chủ sở hữu
414|4. Cổ phiếu quỹ (*)
415|5. Chênh lệch tỷ giá hối đoái
416|6. Các quỹ thuộc vốn chủ sở hữu
417|7. Lợi nhuận sau thuế chưa phân phối
500|TỔNG CỘNG NGUỒN VỐN (500 = 300 + 400)|300+400`
};

// Số dư cuối (Nợ − Có) theo từng mã chi tiết đến ngày `to`, gồm số dư khai báo và mọi chứng từ (kể cả kết chuyển).
function trClosingNets(st, to) {
  const ledger = createCloseLedger(st); // cùng sổ số dư với kết chuyển (gồm bí danh 244/344 của TT133)
  ((st && st.vouchers) || []).forEach(v => { if (v && !(to && trDate(v) > to)) ledger.post(v); });
  return ledger.net;
}

function trSheetValues(rowsText, leafValues) {
  const rows = rowsText.split("\n").map(line => { const [code, name, formula] = line.split("|"); return { code, name, formula }; });
  const byCode = Object.fromEntries(rows.map(r => [r.code, r]));
  const terms = formula => formula.split("+").flatMap(t => {
    const [a, b] = t.split("-");
    return b ? rows.filter(r => /^\d+$/.test(r.code) && +r.code >= +a && +r.code <= +b).map(r => r.code) : [t];
  });
  const val = code => {
    const r = byCode[code];
    if (r.value === undefined) r.value = r.formula ? terms(r.formula).reduce((s, c) => s + val(c), 0) : (leafValues[code] || 0);
    return r.value;
  };
  rows.forEach(r => val(r.code));
  return { rows, byCode };
}

function buildBalanceSheet(st, to) {
  const tt99 = isTT99Family(st && st.accountingStandard);
  const def = tt99 ? TR_B01_TT99 : TR_B01A_TT133;
  const leaf = {}, unmapped = [];
  Object.entries(trClosingNets(st, to)).forEach(([code, raw]) => {
    const net = Math.round(raw * 100) / 100;
    if (!net || code[0] === "0") return; // loại 0: TK ngoài bảng
    let m = null;
    for (let i = code.length; i > 0 && !m; i--) m = def.map[code.slice(0, i)] || null;
    if (!m) { unmapped.push({ code, net }); return; }
    const line = Array.isArray(m) ? (net > 0 ? m[0] : m[1]) : m;
    leaf[line] = (leaf[line] || 0) + (/^\d+$/.test(line) && +line < 300 ? net : -net);
  });
  const { rows, byCode } = trSheetValues(def.rows, leaf);
  // Không ẩn số liệu: TK chưa ánh xạ được hiện riêng và cộng vào tổng để báo cáo vẫn cân.
  const extraAssets = unmapped.filter(u => u.net > 0).reduce((s, u) => s + u.net, 0);
  const extraSources = unmapped.filter(u => u.net < 0).reduce((s, u) => s - u.net, 0);
  const [assetCode, sourceCode] = tt99 ? ["280", "440"] : ["200", "500"];
  byCode[assetCode].value += extraAssets;
  byCode[sourceCode].value += extraSources;
  return {
    form: tt99 ? "B01-DN" : "B01a-DNN", to, rows, unmapped,
    totalAssets: byCode[assetCode].value, totalSources: byCode[sourceCode].value,
    balanced: Math.abs(byCode[assetCode].value - byCode[sourceCode].value) < 1
  };
}

// ---- Báo cáo kết quả hoạt động kinh doanh ----
function buildIncomeStatement(st, from, to) {
  const p = computeProfitLoss(st, from, to);
  const tt99 = isTT99Family(st && st.accountingStandard);
  const rows = tt99 ? [
    ["01", "1. Doanh thu bán hàng và cung cấp dịch vụ", p.sales],
    ["02", "2. Các khoản giảm trừ doanh thu", p.deductions],
    ["10", "3. Doanh thu thuần về bán hàng và cung cấp dịch vụ (10 = 01 − 02)", p.netRevenue],
    ["11", "4. Giá vốn hàng bán", p.cogs],
    ["20", "5. Lợi nhuận gộp về bán hàng và cung cấp dịch vụ (20 = 10 − 11)", p.grossProfit],
    ["21", "6. Lãi/lỗ của hoạt động bán, thanh lý bất động sản đầu tư", 0], // shortcut: chưa tách BĐSĐT khỏi 511/632
    ["22", "7. Doanh thu hoạt động tài chính", p.finIncome],
    ["23", "8. Chi phí tài chính", p.finExpense],
    ["24", "- Trong đó: Chi phí đi vay", p.borrowingCost],
    ["25", "9. Chi phí bán hàng", p.selling],
    ["26", "10. Chi phí quản lý doanh nghiệp", p.admin],
    ["30", "11. Lợi nhuận thuần từ hoạt động kinh doanh {30 = 20 + 21 + 22 − (23 + 25 + 26)}", p.operatingProfit],
    ["31", "12. Thu nhập khác", p.otherIncome],
    ["32", "13. Chi phí khác", p.otherExpense],
    ["40", "14. Lợi nhuận khác (40 = 31 − 32)", p.otherProfit],
    ["50", "15. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)", p.profitBeforeTax],
    ["51", "16. Chi phí thuế TNDN hiện hành", p.citCurrent],
    ["52", "17. Chi phí thuế TNDN hoãn lại", p.citDeferred],
    ["60", "18. Lợi nhuận sau thuế thu nhập doanh nghiệp (60 = 50 − 51 − 52)", p.profitAfterTax],
    ["70", "19. Lãi cơ bản trên cổ phiếu (*)", null],
    ["71", "20. Lãi suy giảm trên cổ phiếu (*)", null]
  ] : [
    ["01", "1. Doanh thu bán hàng và cung cấp dịch vụ", p.sales],
    ["02", "2. Các khoản giảm trừ doanh thu", p.deductions],
    ["10", "3. Doanh thu thuần về bán hàng và cung cấp dịch vụ (10 = 01 − 02)", p.netRevenue],
    ["11", "4. Giá vốn hàng bán", p.cogs],
    ["20", "5. Lợi nhuận gộp về bán hàng và cung cấp dịch vụ (20 = 10 − 11)", p.grossProfit],
    ["21", "6. Doanh thu hoạt động tài chính", p.finIncome],
    ["22", "7. Chi phí tài chính", p.finExpense],
    ["23", "- Trong đó: Chi phí lãi vay", p.borrowingCost],
    ["24", "8. Chi phí quản lý kinh doanh", p.selling + p.admin], // TK 641 cũ (dữ liệu trước khi đổi chế độ) gộp vào 642
    ["30", "9. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20 + 21 − 22 − 24)", p.operatingProfit],
    ["31", "10. Thu nhập khác", p.otherIncome],
    ["32", "11. Chi phí khác", p.otherExpense],
    ["40", "12. Lợi nhuận khác (40 = 31 − 32)", p.otherProfit],
    ["50", "13. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)", p.profitBeforeTax],
    ["51", "14. Chi phí thuế TNDN", p.citCurrent + p.citDeferred],
    ["60", "15. Lợi nhuận sau thuế thu nhập doanh nghiệp (60 = 50 − 51)", p.profitAfterTax]
  ];
  return { form: tt99 ? "B02-DN" : "B02-DNN", from, to, rows: rows.map(([code, name, value]) => ({ code, name, value })), pl: p, warnings: p.warnings };
}

/* ==========================================================================
   GIAO DIỆN (DOM) — renderTaxTab() do ui-framework gọi khi mở tab "tax"
   ========================================================================== */
const trMoney = value => value === null || value === undefined ? ""
  : (typeof formatVNDNoSymbol === "function" ? formatVNDNoSymbol(trRound(value)) : trRound(value).toLocaleString("vi-VN"));
const TR_CELL = "border:1px solid #000; padding:5px; color:#000;";
const TR_REPORTS = { list: "Bảng kê hóa đơn bán ra, mua vào", vat01: "Tờ khai thuế GTGT 01/GTGT", cit: "Thuế TNDN tạm tính", b01: "Báo cáo tình hình tài chính", b02: "Báo cáo kết quả hoạt động kinh doanh" };

const taxUi = (() => {
  const now = new Date();
  return { kind: "quarter", year: now.getFullYear(), n: Math.floor(now.getMonth() / 3) + 1, report: "vat01" };
})();

function trTable(head, body, size = 12) {
  return `<table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:${size}px;">
    <thead><tr style="background-color:#f3f4f6;">${head.map(h => `<th style="${TR_CELL}">${escapeReportText(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}
const trRow = (cells, bold) => `<tr${bold ? ' style="font-weight:bold;"' : ""}>${cells.map(c => `<td style="${TR_CELL}${c.num ? " text-align:right;" : ""}">${c.num ? trMoney(c.v) : escapeReportText(c.v)}</td>`).join("")}</tr>`;
const trWarn = list => (list || []).map(w => `<p style="color:#b91c1c; font-size:12px;">⚠ ${escapeReportText(w)}</p>`).join("");

function trHeader(st, title, sub) {
  return `<div style="font-family:'Times New Roman', serif; color:#000; font-size:12px;">${escapeReportText(st.companyName || "")}${st.taxCode ? ` — MST: ${escapeReportText(st.taxCode)}` : ""}</div>
    <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin:12px 0 16px;">
      <h2 style="font-size:18px; font-weight:bold; text-transform:uppercase;">${escapeReportText(title)}</h2>
      <p style="font-style:italic; font-size:13px;">${escapeReportText(sub)}</p></div>`;
}

function renderVatListHTML(st, p) {
  const list = buildVatInvoiceList(st, p.from, p.to);
  const side = (key, title) => {
    const groups = list[key].groups;
    let body = "";
    Object.keys(groups).sort().forEach(rate => {
      body += trRow([{ v: `Nhóm thuế suất: ${/^\d+$/.test(rate) ? rate + "%" : rate}` }], true).replace("<td ", '<td colspan="9" ');
      groups[rate].rows.forEach(r => {
        body += trRow([{ v: r.id }, { v: [r.invoiceForm, r.invoiceSymbol].filter(Boolean).join(" ") }, { v: r.invoiceNo }, { v: r.invoiceDate || r.date },
          { v: r.partnerName }, { v: r.taxCode }, { v: r.base, num: true }, { v: r.tax, num: true }, { v: r.nonDeductible ? "Không được khấu trừ (tiền mặt ≥ ngưỡng)" : "" }]);
      });
      body += trRow([{ v: "" }, { v: "" }, { v: "" }, { v: "" }, { v: "Cộng nhóm" }, { v: "" }, { v: groups[rate].base, num: true }, { v: groups[rate].tax, num: true }, { v: "" }], true);
    });
    if (!body) body = `<tr><td colspan="9" style="${TR_CELL} text-align:center;">Không có hóa đơn trong kỳ.</td></tr>`;
    else body += trRow([{ v: "" }, { v: "" }, { v: "" }, { v: "" }, { v: "TỔNG CỘNG" }, { v: "" }, { v: list[key].base, num: true }, { v: list[key].tax, num: true }, { v: "" }], true);
    return `<h3 style="font-size:15px; margin:14px 0 6px;">${escapeReportText(title)}</h3>` +
      trTable(["Chứng từ", "Mẫu số, ký hiệu", "Số HĐ", "Ngày HĐ", "Người mua/bán", "MST", "Doanh số chưa thuế", "Thuế GTGT", "Ghi chú"], body, 11);
  };
  return trHeader(st, "Bảng kê hóa đơn hàng hóa, dịch vụ bán ra và mua vào", `Kỳ: ${p.label} (${p.from} – ${p.to})`) +
    side("sales", "1. Hàng hóa, dịch vụ bán ra") + side("purchase", "2. Hàng hóa, dịch vụ mua vào");
}

function trVatInputsKey(p) { return `${p.kind}-${p.year}-${p.n}`; }

function renderVat01HTML(st, p, inputs) {
  const res = computeVat01(st, p.from, p.to, inputs);
  const v = res.values, tt89 = res.version === "TT89";
  const editable = k => `<input type="number" class="form-control" style="width:160px; text-align:right;" value="${trRound(v[k])}" aria-label="Chỉ tiêu [${k}]" onchange="setTaxInput('${k}', this.value)">`;
  const line = (code, name, k2) => `<tr><td style="${TR_CELL}">${escapeReportText(name)}</td><td style="${TR_CELL} text-align:center;">[${code}]</td><td style="${TR_CELL} text-align:right;">${["22", "32b", "34a", "37", "38", "39a", "40b", "42"].includes(code) ? editable(code) : trMoney(v[code])}</td>${k2 ? `<td style="${TR_CELL} text-align:center;">[${k2}]</td><td style="${TR_CELL} text-align:right;">${trMoney(v[k2])}</td>` : `<td style="${TR_CELL}"></td><td style="${TR_CELL}"></td>`}</tr>`;
  const body = [
    `<tr><td style="${TR_CELL}">Không phát sinh hoạt động mua, bán trong kỳ</td><td style="${TR_CELL} text-align:center;">[21]</td><td style="${TR_CELL} text-align:right;">${v["21"] ? "☒" : "☐"}</td><td style="${TR_CELL}"></td><td style="${TR_CELL}"></td></tr>`,
    line("22", "Thuế GTGT còn được khấu trừ kỳ trước chuyển sang"),
    line("23", "Giá trị và thuế GTGT của hàng hóa, dịch vụ mua vào", "24"),
    line("23a", "Trong đó: hàng hóa, dịch vụ nhập khẩu", "24a"),
    line("25", "Thuế GTGT của hàng hóa, dịch vụ mua vào được khấu trừ kỳ này"),
    line("26", "Hàng hóa, dịch vụ bán ra không chịu thuế GTGT"),
    line("27", tt89 ? "Hàng hóa, dịch vụ bán ra chịu thuế GTGT ([27]=[29]+[30]+[32]+[32a]−[32b]; [28]=[31]+[33])" : "Hàng hóa, dịch vụ bán ra chịu thuế GTGT ([27]=[29]+[30]+[32]+[32a]; [28]=[31]+[33])", "28"),
    line("29", "a) Thuế suất 0%"),
    line("30", "b) Thuế suất 5%", "31"),
    line("32", "c) Thuế suất 10% (gồm doanh số 8% theo NĐ 174)", "33"),
    line("32a", "d) Hàng hóa, dịch vụ bán ra không phải kê khai, tính nộp thuế GTGT"),
    ...(tt89 ? [line("32b", "đ) Doanh thu không tính vào giá tính thuế GTGT")] : []),
    ...(tt89 ? [line("34a", "Doanh thu ngoài phạm vi điều chỉnh của Luật Thuế GTGT")] : []),
    line("34", tt89 ? "Tổng doanh thu và thuế GTGT ([34]=[26]+[27]+[34a]; [35]=[28])" : "Tổng doanh thu và thuế GTGT ([34]=[26]+[27]; [35]=[28])", "35"),
    line("36", "Thuế GTGT phát sinh trong kỳ ([36]=[35]−[25])"),
    line("37", "Điều chỉnh giảm thuế GTGT còn được khấu trừ của các kỳ trước"),
    line("38", "Điều chỉnh tăng thuế GTGT còn được khấu trừ của các kỳ trước"),
    line("39a", "Thuế GTGT nhận bàn giao được khấu trừ"),
    line("40a", "Thuế GTGT phải nộp của hoạt động SXKD ([40a]=[36]−[22]+[37]−[38]−[39a] ≥ 0)"),
    line("40b", "Thuế GTGT mua vào của dự án đầu tư được bù trừ"),
    line("40", "Thuế GTGT còn phải nộp trong kỳ ([40]=[40a]−[40b])"),
    line("41", "Thuế GTGT chưa khấu trừ hết kỳ này (≤ 0)"),
    line("42", "Thuế GTGT đề nghị hoàn"),
    line("43", "Thuế GTGT còn được khấu trừ chuyển kỳ sau ([43]=[41]−[42])")
  ].join("");
  const app = buildVatReductionAppendix(st, p.from, p.to);
  const appBody = app.rows.map((r, i) => trRow([{ v: i + 1 }, { v: r.name }, { v: r.base, num: true }, { v: r.baseRate + "%" }, { v: r.rate + "%" }, { v: r.reduction, num: true }])).join("")
    + trRow([{ v: "" }, { v: "Tổng cộng" }, { v: app.base, num: true }, { v: "" }, { v: "" }, { v: app.reduction, num: true }], true);
  return trHeader(st, "Tờ khai thuế giá trị gia tăng (Mẫu 01/GTGT)",
    `Kỳ tính thuế: ${p.label} — Mẫu theo ${tt89 ? "Thông tư 89/2026/TT-BTC" : "Thông tư 80/2021/TT-BTC"} — Đơn vị tiền: đồng Việt Nam`) +
    trWarn(res.warnings) + trTable(["Chỉ tiêu", "Mã", "Giá trị HHDV", "Mã", "Thuế GTGT"], body) +
    `<h3 style="font-size:15px; margin:18px 0 6px;">Phụ lục giảm thuế GTGT (Mẫu số 01, Phụ lục III Nghị định 174/2025/NĐ-CP)</h3>` + trWarn(app.warnings) +
    (app.rows.length ? trTable(["STT", "Tên hàng hóa, dịch vụ", "Giá trị HHDV chưa có thuế GTGT", "Thuế suất theo quy định", "Thuế suất sau giảm", "Thuế GTGT được giảm"], appBody)
      : `<p style="font-size:12px;">Không có doanh số thuế suất 8% trong kỳ.</p>`);
}

function renderCitHTML(st, p) {
  const q = p.kind === "quarter" ? p.n : p.kind === "month" ? Math.ceil(p.n / 3) : 4;
  const est = computeCitEstimate(st, p.year, q);
  const body = est.quarters.map(r => trRow([{ v: `Quý ${r.q}` }, { v: r.revenue, num: true }, { v: r.profit, num: true }, { v: r.gross, num: true },
    { v: r.reduction, num: true }, { v: r.taxYtd, num: true }, { v: r.amount, num: true }, { v: r.booked, num: true }], r.q === q)).join("");
  const red = est.reductionRule;
  const override = est.prevRevenueOverride ? trRound(est.prevRevenue) : "";
  return trHeader(st, "Thuế thu nhập doanh nghiệp tạm tính", `Năm ${est.year} — đang chọn quý ${q}`) + trWarn(est.warnings) +
    `<label style="font-size:13px;">Doanh thu năm ${est.year - 1} nhập tay (bỏ trống = lấy từ sổ):
      <input type="number" min="0" class="form-control" style="display:inline-block; width:180px; text-align:right;" value="${override}" aria-label="Doanh thu năm ${est.year - 1}" onchange="setCitPrevRevenue(this.value)"></label>` +
    `<div style="font-family:'Times New Roman', serif; font-size:13px; color:#000; line-height:1.6;">
      Doanh thu năm ${est.year - 1} để xét thuế suất (${est.prevRevenueOverride ? "nhập tay" : "(511 − 521) + 515 + 711"}): <b>${trMoney(est.prevRevenue)}</b> → thuế suất <b>${est.rate}%</b>
      <i>(${escapeReportText(est.rateRule ? est.rateRule.ref : "không có quy tắc — dùng 20%")})</i><br>
      Giảm thuế: ${red ? `${red.value.percent}% nếu doanh thu năm ${est.year} ≤ ${trMoney(red.value.maxRevenue)} <i>(${escapeReportText(red.ref)})</i>` : "không áp dụng cho năm này"}<br>
      Thu nhập tính thuế tạm tính = lợi nhuận kế toán trước thuế lũy kế (chưa điều chỉnh chi phí không được trừ, chưa chuyển lỗ).</div>` +
    trTable(["Lũy kế đến", "Doanh thu", "Lợi nhuận trước thuế", "Thuế theo thuế suất", "Số được giảm", "Thuế lũy kế", "Phải tạm nộp quý", "Đã ghi sổ (3334)"], body) +
    `<p style="font-family:'Times New Roman', serif; font-size:13px; margin-top:10px;">Kiểm tra 80% (NĐ 252/2026 Điều 24): ước thuế cả năm <b>${trMoney(est.annual)}</b>,
      tổng đã trích tạm tính (TK 3334) 4 quý <b>${trMoney(est.provisionalTotal)}</b>, mức tối thiểu 80% <b>${trMoney(est.required80)}</b> —
      ${est.meets80 ? "<b style=\"color:#15803d\">Đạt</b>" : `<b style="color:#b91c1c">Thiếu ${trMoney(est.shortfall)}</b> (tiền chậm nộp tính từ ngày sau hạn tạm nộp quý 4)`}</p>`;
}

function renderStatementHTML(st, rep, title, sub) {
  const body = rep.rows.map(r => trRow([{ v: r.name }, { v: r.code }, { v: r.value, num: true }], !!r.formula || ["10", "20", "30", "40", "50", "60"].includes(r.code))).join("")
    + (rep.unmapped || []).map(u => trRow([{ v: `Chưa ánh xạ vào mã số nào — TK ${u.code} (${u.net > 0 ? "dư Nợ, đã cộng vào tổng tài sản" : "dư Có, đã cộng vào tổng nguồn vốn"})` }, { v: "" }, { v: Math.abs(u.net), num: true }])).join("");
  const check = rep.form.startsWith("B01") ? `<p style="font-size:12px; color:${rep.balanced ? "#15803d" : "#b91c1c"};">${rep.balanced ? "Tổng tài sản bằng tổng nguồn vốn." : `Lệch: tổng tài sản ${trMoney(rep.totalAssets)} ≠ tổng nguồn vốn ${trMoney(rep.totalSources)}`}</p>` : "";
  return trHeader(st, title, sub) + trWarn(rep.warnings) + check + trTable(["Chỉ tiêu", "Mã số", "Số cuối kỳ / kỳ này"], body);
}

function renderTaxReportHTML(st, ui) {
  const p = taxReportPeriod(ui.kind, ui.year, ui.n);
  const tt99 = isTT99Family(st && st.accountingStandard);
  let html;
  if (ui.report === "list") html = renderVatListHTML(st, p);
  else if (ui.report === "cit") html = renderCitHTML(st, p);
  else if (ui.report === "b01") html = renderStatementHTML(st, buildBalanceSheet(st, p.to), "Báo cáo tình hình tài chính",
    `Mẫu ${tt99 ? "B01-DN (Thông tư 99/2025/TT-BTC)" : "B01a-DNN (Thông tư 133/2016/TT-BTC)"} — tại ngày ${p.to}`);
  else if (ui.report === "b02") html = renderStatementHTML(st, buildIncomeStatement(st, p.from, p.to), "Báo cáo kết quả hoạt động kinh doanh",
    `Mẫu ${tt99 ? "B02-DN (Thông tư 99/2025/TT-BTC)" : "B02-DNN (Thông tư 133/2016/TT-BTC)"} — ${p.label}`);
  else {
    // [22] gợi ý tính lại mỗi lần lập (số liệu kỳ trước có thể đã đổi); chỉ tiêu nhập tay lưu ở taxSettings.vatInputs.
    const saved = (((st && st.taxSettings) || {}).vatInputs || {})[trVatInputsKey(p)] || {};
    html = renderVat01HTML(st, p, { 22: suggestVatCarryForward(st, p), ...saved });
  }
  return html + getReportSignaturesHTML(ui.report === "b01" || ui.report === "b02" ? "statement" : "tax");
}

function renderTaxTab() {
  const root = typeof document !== "undefined" && document.getElementById("tax-reports-root");
  if (!root || typeof state === "undefined") return;
  const ui = taxUi;
  const nOptions = ui.kind === "year" ? [] : Array.from({ length: ui.kind === "quarter" ? 4 : 12 }, (_, i) => i + 1);
  const opt = (value, label, selected) => `<option value="${escapeReportText(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeReportText(label)}</option>`;
  let body;
  try { body = renderTaxReportHTML(state, ui); } catch (err) {
    console.error("[Tax] Lỗi lập báo cáo:", err);
    body = `<p style="color:#b91c1c;">Không lập được báo cáo: ${escapeReportText(err && err.message)}</p>`;
  }
  root.innerHTML = `
    <div class="report-selector-bar" style="flex-wrap:wrap; gap:10px;">
      <div class="form-group"><label class="form-label" for="tax-report-type">Báo cáo</label>
        <select id="tax-report-type" class="form-control" onchange="setTaxUi('report', this.value)">${Object.entries(TR_REPORTS).map(([k, l]) => opt(k, l, ui.report)).join("")}</select></div>
      <div class="form-group"><label class="form-label" for="tax-period-kind">Kỳ</label>
        <select id="tax-period-kind" class="form-control" onchange="setTaxUi('kind', this.value)">${opt("month", "Tháng", ui.kind)}${opt("quarter", "Quý", ui.kind)}${opt("year", "Năm", ui.kind)}</select></div>
      ${nOptions.length ? `<div class="form-group"><label class="form-label" for="tax-period-n">${ui.kind === "quarter" ? "Quý" : "Tháng"}</label>
        <select id="tax-period-n" class="form-control" onchange="setTaxUi('n', this.value)">${nOptions.map(n => opt(n, n, ui.n)).join("")}</select></div>` : ""}
      <div class="form-group"><label class="form-label" for="tax-period-year">Năm</label>
        <input id="tax-period-year" type="number" class="form-control" style="width:100px;" value="${trRound(ui.year)}" onchange="setTaxUi('year', this.value)"></div>
      ${ui.report === "vat01" ? `<div class="form-group"><label class="form-label" for="tax-vat01-form">Mẫu 01/GTGT</label>
        <select id="tax-vat01-form" class="form-control" onchange="setVat01Form(this.value)">${opt("TT80", "TT 80/2021 (HTKK hiện hành)", ((state.taxSettings || {}).vat01Form) || "TT80")}${opt("TT89", "TT 89/2026", ((state.taxSettings || {}).vat01Form) || "TT80")}</select></div>` : ""}
      ${ui.report === "cit" ? `<button type="button" class="btn btn-primary" onclick="createCitProvisionVoucher()">Ghi bút toán tạm tính quý</button>` : ""}
      <button type="button" class="btn btn-secondary" onclick="runPeriodClose()">Kết chuyển cuối kỳ</button>
      <button type="button" class="btn btn-secondary" onclick="printTaxReport()" style="margin-left:auto;">In báo cáo</button>
    </div>
    <div id="tax-report-body" style="background:#fff; color:#000; padding:16px;">${body}</div>`;
}

function setTaxUi(key, value) {
  taxUi[key] = key === "report" || key === "kind" ? value : Number(value) || taxUi[key];
  if (key === "kind") taxUi.n = Math.min(taxUi.n, value === "quarter" ? 4 : 12) || 1;
  renderTaxTab();
}

// Lưu qua setTaxSetting (lịch thuế): cùng kiểm quyền, saveState và đồng bộ taxSettings.
function setTaxInput(code, value) {
  const key = trVatInputsKey(taxReportPeriod(taxUi.kind, taxUi.year, taxUi.n));
  const all = { ...((state.taxSettings || {}).vatInputs || {}) };
  all[key] = { ...(all[key] || {}), [code]: Number(value) || 0 };
  setTaxSetting("vatInputs", all);
  renderTaxTab();
}

function setVat01Form(value) {
  setTaxSetting("vat01Form", value === "TT89" ? "TT89" : "TT80");
  renderTaxTab();
}

function setCitPrevRevenue(value) {
  const all = { ...((state.taxSettings || {}).prevYearRevenue || {}) };
  if (String(value).trim() === "") delete all[taxUi.year]; else all[taxUi.year] = Math.max(Number(value) || 0, 0);
  setTaxSetting("prevYearRevenue", all);
  renderTaxTab();
}

function printTaxReport() {
  const calendar = document.getElementById("tax-calendar-root");
  const prev = calendar ? calendar.style.display : "";
  if (calendar) calendar.style.display = "none";
  document.body.classList.add("printing-report");
  if (typeof triggerPrint === "function") triggerPrint(); else window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-report");
    if (calendar) calendar.style.display = prev;
  }, 500);
}

// Thêm/thay chứng từ (giữ số chứng từ cũ khi thay), ghi sổ lại, lưu & đồng bộ; lỗi thì hoàn tác.
async function upsertTaxVoucher(voucher, matches, prefix) {
  const idx = state.vouchers.findIndex(v => v && matches(v));
  const old = idx >= 0 ? state.vouchers[idx] : null;
  let id = old && old.id;
  if (!id) {
    const local = typeof getMaxLocalVoucherSequence === "function" ? getMaxLocalVoucherSequence(prefix)
      : state.vouchers.reduce((m, v) => Math.max(m, Number((String((v && v.id) || "").match(new RegExp(`^${prefix}(\\d+)$`)) || [])[1]) || 0), 0);
    id = `${prefix}${local + 1}`;
    if (typeof ensureCloudSafeVoucherIdForSave === "function") id = await ensureCloudSafeVoucherIdForSave({ currentId: id, prefix, fallbackBase: 0 });
  }
  const next = { ...(old || {}), ...voucher, id, isManual: true, _updatedAt: Date.now() };
  if (typeof clientSessionId !== "undefined") next._sessionId = clientSessionId;
  if (old) state.vouchers[idx] = next; else state.vouchers.push(next);
  try {
    recalculateAccounting(false);
    const synced = typeof saveStateAndSyncVoucher === "function" ? await saveStateAndSyncVoucher() : (saveState(), true);
    if (typeof showToast === "function") showToast(synced ? `Đã lưu chứng từ ${id}.` : `Đã lưu chứng từ ${id} trên máy này, đang chờ đồng bộ.`, synced ? "success" : "warning");
  } catch (err) {
    const at = state.vouchers.indexOf(next);
    if (at >= 0) { if (old) state.vouchers[at] = old; else state.vouchers.splice(at, 1); }
    recalculateAccounting(false);
    console.error("[Tax] Lưu chứng từ thất bại:", err);
    if (typeof showToast === "function") showToast("Không thể lưu chứng từ. Vui lòng thử lại.", "danger");
  }
  if (typeof refreshUI === "function") refreshUI(); else renderTaxTab();
}

async function createCitProvisionVoucher() {
  const p = taxReportPeriod(taxUi.kind, taxUi.year, taxUi.n);
  const q = p.kind === "quarter" ? p.n : p.kind === "month" ? Math.ceil(p.n / 3) : 4;
  const v = buildCitProvisionVoucher(state, p.year, q);
  if (!v.amount) { if (typeof showToast === "function") showToast(`Quý ${q}/${p.year} không có số thuế TNDN phải tạm nộp thêm.`, "warning"); return; }
  const tag = v.citProvision;
  const exists = state.vouchers.some(x => x && x.type === "general_journal" && x.citProvision === tag);
  if (!confirm(`${exists ? "Thay" : "Tạo"} phiếu kế toán ngày ${v.date}: Nợ ${v.entries[0].debit} / Có 3334 số tiền ${trMoney(v.amount)} (tạm tính thuế TNDN quý ${q}/${p.year})?`)) return;
  await upsertTaxVoucher(v, x => x.type === "general_journal" && x.citProvision === tag, "PKT");
}

async function runPeriodClose() {
  const p = taxReportPeriod(taxUi.kind, taxUi.year, taxUi.n);
  // Không kết chuyển khi còn tồn kho âm (giá vốn xuất âm chưa đúng) — B2.
  const negative = negativeStockProductsAt(state, p.to);
  if (negative.length) {
    const names = negative.map(id => (state.products.find(x => String(x.id) === id) || {}).name || id).join(", ");
    if (typeof showToast === "function") showToast(`Không thể kết chuyển ${p.label}: còn tồn kho âm tại ${p.to} (${names}). Bổ sung phiếu nhập hoặc sửa số lượng xuất trước.`, "danger");
    return false;
  }
  const exists = state.vouchers.some(v => v && v.type === "period_close" && trDate(v) === p.to);
  if (!confirm(`${exists ? "Lập lại" : "Lập"} chứng từ kết chuyển cuối kỳ ${p.label} (${p.from} – ${p.to})? Bút toán do hệ thống sinh theo số liệu hiện tại.`)) return;
  await upsertTaxVoucher(buildPeriodCloseVoucher(p.from, p.to), v => v.type === "period_close" && trDate(v) === p.to, "KC");
}

const TAX_REPORTS_API = {
  taxReportPeriod, shiftTaxReportPeriod, buildVatInvoiceList, computeVat01, suggestVatCarryForward, buildVatReductionAppendix,
  computeProfitLoss, computeCitEstimate, buildCitProvisionVoucher, buildPeriodCloseVoucher, buildBalanceSheet, buildIncomeStatement,
  renderTaxReportHTML, renderTaxTab, setTaxUi, setTaxInput, setVat01Form, setCitPrevRevenue, printTaxReport, createCitProvisionVoucher, runPeriodClose
};
if (typeof window !== "undefined") Object.assign(window, TAX_REPORTS_API);
if (typeof module !== "undefined" && module.exports) module.exports = TAX_REPORTS_API;
