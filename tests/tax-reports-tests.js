// Thuế & BCTC (js/modules/tax-reports.js): 01/GTGT mẫu TT80/TT89, phụ lục giảm 8% NĐ 174, TNDN tạm tính,
// B01 cân đối, B02 khớp kết quả 911. Plain node + assert, nạp data.js + lõi + module vào vm sandbox.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILES = ["data.js", "js/core/chart-of-accounts.js", "js/core/tax-rules.js", "js/core/accounting-engine.js", "js/accounting.js", "js/modules/reports.js", "js/modules/tax-reports.js"];
function context(standard, vouchers, extra = {}) {
  const ctx = {
    console,
    state: { accountingStandard: standard, products: [{ id: "P1", name: "Bóng đèn LED", initialStock: 1000, initialCost: 100 }],
      partners: [{ id: "KH1", name: "<b>Khách</b>", taxCode: "0101" }], vouchers, initialBalances: {}, partnerOpeningBalances: {}, ...extra },
    saveState() {}, refreshUI() {}, safeParseFloat: Number
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  FILES.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ctx, { filename: file }));
  ctx.recalculateAccounting(false);
  return ctx;
}
const item = (amount, vatRate, qty = 1) => ({ productId: "P1", qty, price: amount / qty, amount, vatRate });
const plain = x => JSON.parse(JSON.stringify(x)); // đối tượng tạo trong vm khác realm
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Quý 2/2026 (mẫu TT80) và quý 3/2026 (mẫu TT89)
const VAT_VOUCHERS = () => [
  { id: "NK1", type: "purchase", date: "2026-05-10", partnerId: "NCC", paymentMethod: "331", taxRate: 8, items: [item(50000, 8, 10)], isManual: true },
  { id: "NK2", type: "purchase", date: "2026-06-05", paymentMethod: "111", taxRate: 10, items: [item(10000000, 10, 100)], isManual: true }, // tiền mặt ≥ 5tr → không khấu trừ
  { id: "BH1", type: "sales", date: "2026-06-01", partnerId: "KH1", paymentMethod: "131", taxRate: 8, invoiceNo: "15", invoiceSymbol: "1C26TAA",
    items: [item(15000, 8, 5), item(2000, "KCT")], isManual: true },
  { id: "BH2", type: "sales", date: "2026-08-10", partnerId: "KH1", paymentMethod: "131", taxRate: 10, items: [item(100000, 10, 10)], isManual: true },
  { id: "TL1", type: "sales_return", date: "2026-08-20", partnerId: "KH1", paymentMethod: "131", taxRate: 10, items: [item(10000, 10, 1)], isManual: true },
  { id: "NK3", type: "purchase", date: "2026-09-01", paymentMethod: "331", taxRate: 5, items: [item(20000, 5, 2)], isManual: true },
  { id: "PC1", type: "payment", date: "2026-09-15", paymentMethod: "111", amount: 3000, isManual: true, entries: [{ debit: "6421", credit: "111", amount: 3000 }] }
];

test("01/GTGT quý 2/2026 dùng mẫu TT80; 8% vào [32]/[33]; VAT tiền mặt không vào [25]", () => {
  const c = context("TT99", VAT_VOUCHERS());
  const p = c.taxReportPeriod("quarter", 2026, 2);
  assert.deepStrictEqual([p.from, p.to], ["2026-04-01", "2026-06-30"]);
  const r = c.computeVat01(c.state, p.from, p.to, {});
  assert.strictEqual(r.version, "TT80");
  const v = r.values;
  assert.strictEqual(v["32b"], undefined);
  assert.strictEqual(v["34a"], undefined);
  assert.deepStrictEqual([v["23"], v["24"], v["25"]], [10050000, 1004000, 4000]);
  assert.deepStrictEqual([v["26"], v["29"], v["32"], v["33"], v["27"], v["28"], v["34"], v["35"]], [2000, 0, 15000, 1200, 15000, 1200, 17000, 1200]);
  assert.strictEqual(v["36"], -2800);
  assert.deepStrictEqual([v["40a"], v["40"], v["41"], v["43"]], [0, 0, 2800, 2800]);
  assert.strictEqual(v["21"], false);
  const list = c.buildVatInvoiceList(c.state, p.from, p.to);
  assert.ok(list.purchase.groups["10"].rows[0].nonDeductible);
  assert.strictEqual(list.sales.groups["8"].rows[0].invoiceSymbol, "1C26TAA");
  assert.strictEqual(list.sales.groups["8"].rows[0].taxCode, "0101");
});

test("01/GTGT quý 3/2026 dùng mẫu TT89 với [32b], [34a]; [22] gợi ý = [43] kỳ trước; trả lại ghi âm", () => {
  const c = context("TT99", VAT_VOUCHERS());
  const p = c.taxReportPeriod("quarter", 2026, 3);
  const carry = c.suggestVatCarryForward(c.state, p);
  assert.strictEqual(carry, 2800);
  assert.strictEqual(c.computeVat01(c.state, p.from, p.to).version, "TT80", "HTKK chưa có mẫu TT89: mặc định TT80");
  c.state.taxSettings = { vat01Form: "TT89" };
  const r = c.computeVat01(c.state, p.from, p.to, { 22: carry, "32b": 5000, "34a": 3000 });
  assert.strictEqual(r.version, "TT89");
  const v = r.values;
  assert.deepStrictEqual([v["32"], v["33"], v["25"]], [90000, 9000, 1000]);
  assert.strictEqual(v["27"], 90000 - 5000, "[27] = [29]+[30]+[32]+[32a]−[32b]");
  assert.strictEqual(v["34"], 0 + 85000 + 3000, "[34] = [26]+[27]+[34a]");
  assert.strictEqual(v["36"], 8000);
  assert.deepStrictEqual([v["40a"], v["40"], v["41"], v["43"]], [5200, 5200, 0, 0]);
  // tháng 7/2026 cũng là TT89, tháng 6 là TT80
  assert.strictEqual(c.computeVat01(c.state, "2026-07-01", "2026-07-31").version, "TT89");
  assert.strictEqual(c.computeVat01(c.state, "2026-06-01", "2026-06-30").version, "TT80");
  assert.strictEqual(c.computeVat01(c.state, "2026-07-01", "2026-07-31").values["21"], true);
});

test("Phụ lục NĐ 174: dòng 8% với số giảm 2%; HTML thoát dữ liệu người dùng", () => {
  const c = context("TT99", VAT_VOUCHERS());
  const app = c.buildVatReductionAppendix(c.state, "2026-04-01", "2026-06-30");
  assert.strictEqual(app.rows.length, 1);
  assert.deepStrictEqual(plain(app.rows[0]), { name: "Bóng đèn LED", base: 15000, baseRate: 10, rate: 8, reduction: 300 });
  assert.strictEqual(app.reduction, 300);
  assert.deepStrictEqual(plain(app.warnings), []);
  const html = c.renderTaxReportHTML(c.state, { kind: "quarter", year: 2026, n: 2, report: "list", inputs: {} });
  assert.ok(html.includes("&lt;b&gt;Khách&lt;/b&gt;") && !html.includes("<b>Khách"));
  for (const report of ["vat01", "cit", "b01", "b02"]) assert.ok(c.renderTaxReportHTML(c.state, { kind: "quarter", year: 2026, n: 3, report, inputs: {} }).length > 100, report);
});

const gj = (id, date, debit, credit, amount) => ({ id, type: "general_journal", date, isManual: true, entries: [{ debit, credit, amount }] });
test("TNDN: thuế suất theo doanh thu năm trước, giảm 30% năm 2026, kiểm 80%", () => {
  const vouchers = [
    gj("G0", "2025-12-01", "131", "511", 2000000000),
    gj("G1", "2026-02-01", "131", "511", 1000000000),
    gj("G2", "2026-02-01", "632", "156", 600000000),
    gj("G3", "2026-05-01", "642", "111", 100000000)
  ];
  const c = context("TT99", vouchers);
  let est = c.computeCitEstimate(c.state, 2026, 1);
  assert.strictEqual(est.prevRevenue, 2000000000);
  assert.strictEqual(est.rate, 15);
  assert.deepStrictEqual([est.current.taxable, est.current.gross, est.current.reduction, est.current.taxYtd, est.current.amount], [400000000, 60000000, 18000000, 42000000, 42000000]);
  const v = c.buildCitProvisionVoucher(c.state, 2026, 1);
  assert.deepStrictEqual(plain(v.entries.map(e => [e.debit, e.credit, e.amount])), [["82111", "3334", 42000000]]);
  assert.strictEqual(v.date, "2026-03-31");
  c.state.vouchers.push({ ...v, id: "PKT1" });
  c.recalculateAccounting(false);
  est = c.computeCitEstimate(c.state, 2026, 2);
  assert.strictEqual(est.quarters[0].booked, 42000000);
  assert.strictEqual(est.current.taxYtd, 31500000);
  assert.strictEqual(est.current.amount, 0, "đã tạm nộp vượt số lũy kế");
  assert.strictEqual(est.quarters[0].profit, 400000000, "chi phí thuế 821 không trừ vào lợi nhuận trước thuế");
  assert.ok(est.meets80 && est.annual === 31500000 && est.provisionalTotal === 42000000);
  // Doanh thu năm trước 4 tỷ → 17%; năm 2028 không còn giảm 30%; TT133 ghi Nợ 821
  const c2 = context("TT133", [gj("H0", "2027-06-01", "131", "511", 4000000000), gj("H1", "2028-03-01", "131", "511", 100000000)]);
  const e2 = c2.computeCitEstimate(c2.state, 2028, 1);
  assert.deepStrictEqual([e2.rate, e2.current.reduction, e2.current.taxYtd, e2.account], [17, 0, 17000000, "821"]);
  assert.ok(!e2.meets80 && e2.shortfall === 13600000);
  // Doanh thu năm nay > 10 tỷ → không giảm
  const c3 = context("TT99", [gj("K1", "2026-01-10", "131", "511", 11000000000)]);
  const e3 = c3.computeCitEstimate(c3.state, 2026, 1);
  assert.deepStrictEqual([e3.rate, e3.current.reduction], [15, 0]);
});

test("TNDN: doanh thu năm trước nhập tay thay số sổ; năm trước trống thì cảnh báo", () => {
  const c = context("TT99", [gj("H1", "2028-03-01", "131", "511", 100000000)]);
  let est = c.computeCitEstimate(c.state, 2028, 1);
  assert.strictEqual(est.rate, 15);
  assert.strictEqual(est.warnings.length, 1, "2027 không có chứng từ, không nhập tay");
  assert.ok(c.renderTaxReportHTML(c.state, { kind: "quarter", year: 2028, n: 1, report: "cit" }).includes("không có chứng từ"));
  c.state.taxSettings = { prevYearRevenue: { 2028: 4000000000 } };
  est = c.computeCitEstimate(c.state, 2028, 1);
  assert.deepStrictEqual([est.prevRevenue, est.rate, est.warnings.length], [4000000000, 17, 0]);
  assert.strictEqual(c.computeCitEstimate(c.state, 2029, 1).prevRevenue, 100000000, "nhập tay chỉ cho đúng năm");
});

test("01/GTGT: chỉ tiêu nhập tay lấy từ taxSettings.vatInputs, [22] gợi ý tính lại mỗi lần lập", () => {
  const c = context("TT99", [
    { id: "NK1", type: "purchase", date: "2026-02-10", paymentMethod: "331", taxRate: 10, items: [item(1000000, 10)], isManual: true }
  ]);
  const html = () => c.renderTaxReportHTML(c.state, { kind: "quarter", year: 2026, n: 2, report: "vat01" });
  assert.ok(html().includes('value="100000" aria-label="Chỉ tiêu [22]"'), "carry from Q1");
  c.state.vouchers.push({ id: "NK2", type: "purchase", date: "2026-03-10", paymentMethod: "331", taxRate: 10, items: [item(500000, 10)], isManual: true });
  c.recalculateAccounting(false);
  assert.ok(html().includes('value="150000" aria-label="Chỉ tiêu [22]"'), "not cached");
  c.state.taxSettings = { vatInputs: { "quarter-2026-2": { 37: 7000 } } };
  assert.ok(html().includes('value="7000" aria-label="Chỉ tiêu [37]"'));
});

test("01/GTGT: hàng trả lại trả tiền mặt từ ngưỡng không giảm [25]", () => {
  const c = context("TT99", [
    { id: "NK1", type: "purchase", date: "2026-08-01", paymentMethod: "331", taxRate: 10, items: [item(10000000, 10, 100)], isManual: true },
    { id: "TL1", type: "purchase_return", date: "2026-08-02", paymentMethod: "111", taxRate: 10, items: [item(5000000, 10, 50)], isManual: true }
  ]);
  const r = c.computeVat01(c.state, "2026-07-01", "2026-09-30").values;
  assert.strictEqual(r["24"], 500000);
  assert.strictEqual(r["25"], 1000000, "return VAT not on 1331 → not deducted from [25]");
});

for (const std of ["TT99", "TT133"]) {
  test(`${std}: B01 cân đối trước/sau kết chuyển; B02 lợi nhuận = kết quả 911`, () => {
    const vouchers = VAT_VOUCHERS().concat([gj("G9", "2026-09-20", "111", "711", 7000), gj("G10", "2026-09-21", "811", "111", 500)]);
    const c = context(std, vouchers, { initialBalances: { "111": { type: "debit", balance: 100000000 }, "4111": { type: "credit", balance: 100000000 } } });
    const to = "2026-09-30";
    let b01 = c.buildBalanceSheet(c.state, to);
    assert.strictEqual(b01.form, std === "TT99" ? "B01-DN" : "B01a-DNN");
    assert.ok(b01.balanced, `${b01.totalAssets} vs ${b01.totalSources}`);
    assert.deepStrictEqual(plain(b01.unmapped), []);
    const b02 = c.buildIncomeStatement(c.state, "2026-01-01", to);
    assert.strictEqual(b02.form, std === "TT99" ? "B02-DN" : "B02-DNN");
    const row = code => b02.rows.find(r => r.code === code).value;
    assert.strictEqual(row("01"), 117000, "doanh thu gộp 15000 + 2000 + 100000");
    assert.strictEqual(row("02"), 10000, "hàng bán trả lại");
    assert.deepStrictEqual(plain(b02.warnings), []);
    c.state.vouchers.push({ id: "KC1", ...c.buildPeriodCloseVoucher("2026-01-01", to) });
    c.recalculateAccounting(false);
    const close = c.state.vouchers.find(v => v.id === "KC1").entries;
    const result = close.filter(e => e.credit === "4212").reduce((s, e) => s + e.amount, 0) - close.filter(e => e.debit === "4212").reduce((s, e) => s + e.amount, 0);
    assert.ok(close.length > 0);
    assert.strictEqual(Math.round(row("60")), Math.round(result));
    const after = c.buildIncomeStatement(c.state, "2026-01-01", to);
    assert.strictEqual(after.rows.find(r => r.code === "60").value, row("60"), "B02 bỏ qua bút toán kết chuyển");
    b01 = c.buildBalanceSheet(c.state, to);
    assert.ok(b01.balanced);
    const profitLine = std === "TT99" ? "420b" : "417";
    assert.strictEqual(Math.round(b01.rows.find(r => r.code === profitLine).value), Math.round(result));
    // Mã số giữ nguyên, không đánh lại
    const codes = b01.rows.map(r => r.code);
    assert.ok(std === "TT99" ? ["162", "280", "313", "314", "420a", "420b", "440"].every(x => codes.includes(x)) : ["181", "200", "500"].every(x => codes.includes(x)));
  });
}

test("TK không ánh xạ được vẫn hiện và vẫn cộng vào tổng", () => {
  const c = context("TT99", [gj("X1", "2026-01-05", "3799", "111", 100)], { initialBalances: { "111": { type: "debit", balance: 1000 }, "4111": { type: "credit", balance: 1000 } } });
  const b01 = c.buildBalanceSheet(c.state, "2026-12-31");
  assert.deepStrictEqual(plain(b01.unmapped), [{ code: "3799", net: 100 }]);
  assert.ok(b01.balanced);
});

test("D: [33] = 10% × [32] − tổng số giảm trên phụ lục NĐ 174", () => {
  const c = context("TT99", VAT_VOUCHERS());
  const v = c.computeVat01(c.state, "2026-04-01", "2026-06-30").values;
  const app = c.buildVatReductionAppendix(c.state, "2026-04-01", "2026-06-30");
  assert.strictEqual(v["33"], Math.round(v["32"] * 0.1) - app.reduction);
  assert.strictEqual(app.reduction, 300);
});

test("B6: chữ ký BCTC theo chế độ, tờ khai thuế chỉ người nộp thuế; tên lấy từ cài đặt", () => {
  const names = { preparerName: "An <Lập>", chiefAccountantName: "Bình", directorName: "Cường" };
  const tt99 = c => c.renderTaxReportHTML(c.state, { kind: "quarter", year: 2026, n: 2, report: "b01" });
  let c = context("TT99", VAT_VOUCHERS(), names);
  let html = tt99(c);
  assert.ok(html.includes("NGƯỜI LẬP<") && html.includes("KẾ TOÁN TRƯỞNG") && html.includes("NGƯỜI ĐẠI DIỆN THEO PHÁP LUẬT"));
  assert.ok(html.includes("An &lt;Lập&gt;") && html.includes("Bình") && html.includes("Cường"));
  assert.ok(!/Nguyễn Văn Minh|Lê Hoàng Đông|Giám đốc/.test(html));
  assert.ok(/Lập, ngày … tháng … năm …<\/span><br>\s*<span[^>]*>NGƯỜI ĐẠI DIỆN THEO PHÁP LUẬT/.test(html), "B01-DN: ngày lập ngay trên cột đại diện");
  c = context("TT133", VAT_VOUCHERS(), names);
  assert.ok(tt99(c).includes("NGƯỜI LẬP BIỂU"));
  html = c.renderTaxReportHTML(c.state, { kind: "quarter", year: 2026, n: 2, report: "vat01" });
  assert.ok(html.includes("NGƯỜI NỘP THUẾ hoặc ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ"));
  assert.ok(!html.includes("KẾ TOÁN TRƯỞNG"), "tờ khai thuế không có ô kế toán trưởng");
});

test("B2: không cho kết chuyển khi còn tồn kho âm tại ngày cuối kỳ", () => {
  const c = context("TT99", [{ id: "BH1", type: "sales", date: "2026-02-10", partnerId: "KH1", paymentMethod: "131", taxRate: 0, items: [item(1, 0, 1200)], isManual: true }]);
  const toasts = [];
  c.showToast = msg => toasts.push(msg);
  c.confirm = () => { throw new Error("must not ask"); };
  c.setTaxUi("kind", "month"); c.setTaxUi("year", 2026); c.setTaxUi("n", 2);
  c.runPeriodClose();
  assert.ok(/tồn kho âm/.test(toasts[0]), toasts[0]);
  assert.ok(!c.state.vouchers.some(v => v.type === "period_close"));
});

test("Dashboard KPI: tiền/ký quỹ từ Sổ cái, doanh thu thuần như B02; hóa đơn không có dòng hàng không lỗi", () => {
  const c = context("TT133", [
    ...VAT_VOUCHERS(),
    { id: "BH0", type: "sales", date: "2026-08-11", partnerId: "KH1", paymentMethod: "131", taxRate: 10, isManual: true },
    { id: "KQ1", type: "payment", date: "2026-08-12", paymentMethod: "1121", amount: 70, isManual: true, entries: [{ debit: "1386", credit: "1121", amount: 70 }] }
  ], { initialBalances: { "111": { type: "debit", balance: 500 }, "344": { type: "credit", balance: 40 } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/modules/dashboard.js"), "utf8"), c, { filename: "dashboard.js" });
  const k = c.computeDashboardKpis(c.state, "2026-07-01", "2026-09-30");
  const bal = code => { const t = c.getAccountTurnover(c.state, code, "", "2026-09-30"); return t.closeDebit - t.closeCredit; };
  assert.strictEqual(k.cash, bal("111") + bal("112"));
  assert.strictEqual(k.escrow, 70 + 40, "đã nộp 1386 + đã nhận (344 khai báo đọc như 3386 theo TT133)");
  assert.strictEqual(k.revenue, c.computeProfitLoss(c.state, "2026-07-01", "2026-09-30").netRevenue);
  assert.strictEqual(k.revenue, 100000 - 10000);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log("ok -", name); } catch (err) { failed++; console.error("FAIL -", name, "\n", err); }
}
if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log(`tax reports tests passed (${tests.length})`);
