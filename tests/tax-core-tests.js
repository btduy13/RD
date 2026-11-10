// Lõi thuế & chế độ kế toán 2026: danh mục TK TT99/TT133, bảng quy tắc theo ngày, GTGT theo dòng,
// sửa định khoản TT133/mua trả lại, ngưỡng tiền mặt, kết chuyển cuối kỳ, phiếu kế toán, bí danh TT200.
// Plain node + assert.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const chart = require("../js/core/chart-of-accounts.js");
const rules = require("../js/core/tax-rules.js");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const CORE = ["js/core/chart-of-accounts.js", "js/core/tax-rules.js", "js/core/accounting-engine.js", "js/accounting.js"];
function context(standard, vouchers, extra = {}) {
  const ctx = {
    console,
    state: { accountingStandard: standard, products: [{ id: "P1", initialStock: 10, initialCost: 100 }], partners: [],
      vouchers, initialBalances: {}, partnerOpeningBalances: {} },
    DEFAULT_DATA: { products: [] }, saveState() {}, refreshUI() {}, safeParseFloat: Number
  };
  Object.assign(ctx.state, extra);
  ctx.window = ctx;
  vm.createContext(ctx);
  CORE.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ctx, { filename: file }));
  ctx.recalculateAccounting(false);
  return ctx;
}
const byId = (c, id) => c.state.vouchers.find(v => v.id === id);
const sumSide = (entries, side, code) => entries.filter(e => e[side] === code).reduce((s, e) => s + e.amount, 0);
const balanced = entries => {
  const accounts = new Set(entries.flatMap(e => [e.debit, e.credit]));
  return [...accounts].reduce((s, a) => s + sumSide(entries, "debit", a) - sumSide(entries, "credit", a), 0) === 0;
};

// ---- Danh mục tài khoản ----
test("TT99 and TT133 are separate charts with the clashing codes", () => {
  const n = (code, std) => chart.getAccountName(code, std);
  assert.strictEqual(n("3386", "TT99"), "Bảo hiểm thất nghiệp");
  assert.strictEqual(n("3386", "TT133"), "Nhận ký quỹ, ký cược");
  assert.strictEqual(n("3385", "TT133"), "Bảo hiểm thất nghiệp");
  assert.strictEqual(n("3385", "TT99"), "");
  assert.strictEqual(n("244", "TT99"), "Ký quỹ, ký cược");
  assert.strictEqual(n("1386", "TT133"), "Cầm cố, thế chấp, ký quỹ, ký cược");
  assert.strictEqual(n("344", "TT99"), "Nhận ký quỹ, ký cược");
  assert.strictEqual(n("2281", "TT99"), "Đầu tư góp vốn vào đơn vị khác");
  assert.strictEqual(n("2281", "TT133"), "Đầu tư vào công ty liên doanh, liên kết");
  assert.strictEqual(n("641", "TT99"), "Chi phí bán hàng");
  assert.strictEqual(n("641", "TT133"), "");
  assert.strictEqual(n("642", "TT133"), "Chi phí quản lý kinh doanh");
  assert.strictEqual(n("112", "TT99"), "Tiền gửi không kỳ hạn");
  assert.strictEqual(n("242", "TT99"), "Chi phí chờ phân bổ");
  assert.strictEqual(n("3387", "TT99"), "Doanh thu chờ phân bổ");
});

test("chart rows carry nature, parent and level; B3 trading accounts present", () => {
  const tt99 = chart.getChartOfAccounts("TT99");
  const row = code => tt99.find(a => a.code === code);
  assert.deepStrictEqual({ ...row("33311") }, { code: "33311", name: "Thuế GTGT đầu ra", nature: "credit", parent: "3331", level: 3 });
  assert.strictEqual(row("111").level, 1);
  assert.strictEqual(row("111").parent, null);
  assert.strictEqual(row("214").nature, "credit");
  assert.strictEqual(row("131").nature, "both");
  assert.ok(row("82112").hidden);
  ["111", "112", "131", "1331", "1332", "1381", "1383", "1388", "141", "151", "156", "157", "211", "213", "2141", "2143", "2293", "2294",
    "242", "244", "331", "332", "33311", "33312", "3332", "3333", "3334", "3335", "3338", "3339", "334", "335", "3382", "3383", "3384",
    "3386", "3387", "3388", "341", "4111", "4118", "4211", "4212", "511", "515", "521", "632", "635", "6411", "6418", "6421", "6428",
    "711", "811", "82111", "82112", "8212", "911"].forEach(code => assert.ok(row(code), "TT99 thiếu " + code));
  tt99.forEach(a => assert.ok(["debit", "credit", "both"].includes(a.nature)));
});

test("isValidAccount allows self-opened details only under accounts without prescribed children", () => {
  assert.ok(chart.isValidAccount("1121", "TT99"));
  assert.ok(chart.isValidAccount("1561", "TT99"));
  assert.ok(chart.isValidAccount("1112", "TT99"), "optional detail 1111 does not block sibling 1112");
  assert.ok(chart.isValidAccount("331001", "TT99"));
  assert.ok(!chart.isValidAccount("1386", "TT99"), "138 has prescribed children in TT99");
  assert.ok(!chart.isValidAccount("3385", "TT99"));
  assert.ok(!chart.isValidAccount("641", "TT133"));
  assert.ok(!chart.isValidAccount("521", "TT133"));
  assert.ok(!chart.isValidAccount("9999", "TT99"));
  assert.ok(!chart.isValidAccount("", "TT99"));
  assert.ok(chart.isValidAccount("1386", "TT133"));
});

test("prescribed sub-accounts (TT99 Phụ lục II, TT133 Phụ lục 1) are valid; siblings outside the list are not", () => {
  ["2291", "2292", "2293", "2294", "2295", "2141", "2142", "2143", "2147", "3336", "3337", "33381", "4111", "41111", "4112", "4113", "4118",
    "1281", "1288", "1361", "2411", "2414", "3361", "3411", "3412", "3431", "3525", "3534", "3562", "6275", "215122"]
    .forEach(code => assert.ok(chart.isValidAccount(code, "TT99"), "TT99 " + code));
  ["2291", "2292", "2293", "2294", "2142", "2147", "4111", "4112", "4118", "1281", "1361", "2413", "3361", "3411", "3524", "3531"]
    .forEach(code => assert.ok(chart.isValidAccount(code, "TT133"), "TT133 " + code));
  assert.strictEqual(chart.getAccountName("2292", "TT99"), "Dự phòng tổn thất đầu tư vào đơn vị khác");
  assert.strictEqual(chart.getAccountName("4112", "TT133"), "Thặng dư vốn cổ phần");
  assert.ok(!chart.isValidAccount("2296", "TT99"), "229 has a closed list");
  assert.ok(!chart.isValidAccount("4113", "TT133"), "TT133 411 has no 4113");
  assert.ok(!chart.isValidAccount("3523", "TT133"));
});

test("TT200 is an alias of TT99", () => {
  assert.strictEqual(chart.normalizeAccountingStandard("TT200"), "TT99");
  assert.strictEqual(chart.normalizeAccountingStandard(undefined), "TT99");
  assert.strictEqual(chart.normalizeAccountingStandard(" tt133 "), "TT133");
  assert.ok(chart.isTT99Family("TT200") && chart.isTT99Family("TT99") && !chart.isTT99Family("TT133"));
  assert.strictEqual(chart.getChartOfAccounts("TT200"), chart.getChartOfAccounts("TT99"));
  for (const std of ["TT200", "TT99"]) {
    const c = context(std, [
      { id: "E1", type: "escrow_pay", date: "2026-01-02", paymentMethod: "111", amount: 5, description: "kq", isManual: true },
      { id: "PT1", type: "receipt", date: "2026-01-03", paymentMethod: "111", amount: 7, isManual: true, entries: [{ debit: "111", credit: "3386", amount: 7 }] }
    ]);
    assert.strictEqual(byId(c, "E1").entries[0].debit, "244", std);
    assert.strictEqual(byId(c, "PT1").entries[0].credit, "344", std);
  }
});

// ---- Bảng quy tắc theo ngày ----
test("getTaxRule looks rules up by date", () => {
  const v = (key, date) => rules.getTaxRule(key, date).value;
  assert.strictEqual(v("vat.cashThreshold", "2025-06-30"), 20000000);
  assert.strictEqual(v("vat.cashThreshold", "2025-07-01"), 5000000);
  assert.strictEqual(rules.getTaxRule("vat.reduced8.window", "2025-06-30"), null);
  assert.strictEqual(v("vat.reduced8.window", "2026-12-31").rate, 8);
  assert.strictEqual(rules.getTaxRule("vat.reduced8.window", "2027-01-01"), null);
  assert.deepStrictEqual(v("cit.rateTiers", "2026-03-01").map(t => t.rate), [15, 17, 20]);
  assert.strictEqual(v("cit.rateTiers", "2026-03-01")[1].maxRevenue, 50000000000);
  assert.strictEqual(v("cit.reduction30", "2027-06-30").maxRevenue, 10000000000);
  assert.strictEqual(rules.getTaxRule("cit.reduction30", "2028-01-01"), null);
  assert.strictEqual(v("pit.brackets", "2025-12-31").length, 7);
  assert.deepStrictEqual(v("pit.brackets", "2026-01-01").map(b => [b.upTo, b.rate]),
    [[10000000, 5], [30000000, 10], [60000000, 20], [100000000, 30], [null, 35]]);
  assert.deepStrictEqual(v("pit.deductions", "2025-12-31"), { self: 11000000, dependent: 4400000 });
  assert.deepStrictEqual(v("pit.deductions", "2026-01-01"), { self: 15500000, dependent: 6200000 });
  assert.strictEqual(v("pit.casualThreshold", "2026-06-30").threshold, 2000000);
  assert.strictEqual(v("pit.casualThreshold", "2026-07-01").threshold, 5000000);
  assert.deepStrictEqual(v("ins.rates", "2026-05-01").employer, { bhxh: 17.5, bhyt: 3, bhtn: 1, kpcd: 2 });
  assert.deepStrictEqual(v("ins.rates", "2026-05-01").employee, { bhxh: 8, bhyt: 1.5, bhtn: 1 });
  assert.strictEqual(v("ins.caps", "2026-06-30").bhxhBhyt, 46800000);
  assert.strictEqual(v("ins.caps", "2026-07-01").bhxhBhyt, 50600000);
  assert.deepStrictEqual(v("ins.regionMinWage", "2026-12-31"), { I: 5310000, II: 4730000, III: 4140000, IV: 3700000 });
  assert.deepStrictEqual(v("ins.regionMinWage", "2027-01-01"), { I: 5700000, II: 5080000, III: 4450000, IV: 4040000 });
  assert.ok(v("holidays", "2026-03-01").some(h => h.date === "2026-11-24"));
  assert.ok(!v("holidays", "2025-03-01").some(h => h.date.endsWith("-11-24")));
  assert.ok(v("holidays", "2026-03-01").some(h => h.date === "2026-01-02"), "02/01/2026 hoán đổi");
  assert.strictEqual(v("cit.exemptRevenue", "2026-12-31"), 1000000000);
  assert.strictEqual(rules.getTaxRule("cit.exemptRevenue", "2025-12-31"), null);
  assert.ok(rules.getTaxRule("vat.cashThreshold", new Date(2025, 6, 1)).value === 5000000, "accepts Date");
  rules.TAX_RULES.forEach(r => assert.ok(r.ref, "every rule cites a legal reference: " + r.key));
});

// ---- GTGT theo dòng ----
test("per-line VAT groups by rate; KCT/KKKNT tracked with zero tax; legacy vouchers unchanged", () => {
  const c = context("TT99", [
    { id: "BH1", type: "sales", date: "2026-02-01", paymentMethod: "131", taxRate: 10, items: [
      { productId: "P1", qty: 1, price: 1000, amount: 1000, vatRate: 8 },
      { productId: "P1", qty: 1, price: 333, amount: 333, vatRate: 8 },
      { productId: "X", qty: 1, amount: 500, vatRate: "KCT" },
      { productId: "X", qty: 1, amount: 200 } // theo v.taxRate 10%
    ] },
    { id: "BH2", type: "sales", date: "2026-02-02", paymentMethod: "131", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 1555, amount: 1555 }] }
  ]);
  const v1 = byId(c, "BH1");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v1.vatBreakdown)),
    { "8": { base: 1333, tax: 107 }, KCT: { base: 500, tax: 0 }, "10": { base: 200, tax: 20 } });
  assert.strictEqual(v1.taxAmount, 127);
  assert.strictEqual(v1.totalAmount, 2033 + 127);
  assert.strictEqual(sumSide(v1.entries, "credit", "3331"), 127);
  const v2 = byId(c, "BH2");
  assert.strictEqual(v2.taxAmount, Math.round(1555 * 0.1), "legacy single rate");
  assert.strictEqual(v2.totalAmount, 1555 + 156);
});

// ---- Sửa lỗi định khoản ----
test("TT133 purchase keeps deductible input VAT on 1331 (not in 156)", () => {
  for (const std of ["TT133", "TT200"]) {
    const c = context(std, [{ id: "NK1", type: "purchase", date: "2026-03-01", paymentMethod: "331", taxRate: 10,
      items: [{ productId: "P1", qty: 2, price: 500, amount: 1000 }] }]);
    const e = byId(c, "NK1").entries;
    assert.strictEqual(sumSide(e, "debit", "156"), 1000, std);
    assert.strictEqual(sumSide(e, "debit", "1331"), 100, std);
    assert.strictEqual(sumSide(e, "credit", "331"), 1100, std);
  }
});

test("purchase_return credits 156 at cost, debits 331 at return value + VAT, difference to 632 in the right direction", () => {
  // Tồn 10 × 100. Trả 2 cái giá 150 (> giá vốn 100): chênh 100 Có 632
  let c = context("TT133", [{ id: "TL1", type: "purchase_return", date: "2026-03-02", paymentMethod: "331", taxRate: 10,
    items: [{ productId: "P1", qty: 2, price: 150, amount: 300 }] }]);
  let e = byId(c, "TL1").entries;
  assert.strictEqual(sumSide(e, "debit", "331"), 330);
  assert.strictEqual(sumSide(e, "credit", "156"), 200, "156 at cost");
  assert.strictEqual(sumSide(e, "credit", "632") - sumSide(e, "debit", "632"), 100, "gain reduces COGS");
  assert.strictEqual(sumSide(e, "credit", "1331"), 30, "TT133 VAT on 1331");
  assert.strictEqual(sumSide(e, "credit", "711"), 0);
  assert.ok(balanced(e));
  // Trả 2 cái giá 80 (< giá vốn 100): chênh 40 Nợ 632
  c = context("TT99", [{ id: "TL2", type: "purchase_return", date: "2026-03-02", paymentMethod: "331", taxRate: 10,
    items: [{ productId: "P1", qty: 2, price: 80, amount: 160 }] }]);
  e = byId(c, "TL2").entries;
  assert.strictEqual(sumSide(e, "debit", "331"), 176);
  assert.strictEqual(sumSide(e, "credit", "156"), 200);
  assert.strictEqual(sumSide(e, "debit", "632") - sumSide(e, "credit", "632"), 40, "loss increases COGS");
  assert.ok(balanced(e));
  assert.strictEqual(c.state.products[0].stock, 8);
});

// ---- Ngưỡng tiền mặt ----
test("cash purchase at/over the dated threshold capitalises VAT into 156 and flags it", () => {
  const items = amount => [{ productId: "P1", qty: 1, price: amount, amount }];
  const c = context("TT99", [
    // 5.000.000 gồm thuế, từ 2026 → không được khấu trừ
    { id: "A", type: "purchase", date: "2026-01-05", paymentMethod: "111", taxRate: 10, items: items(4545455) },
    // 4.999.999 gồm thuế → dưới ngưỡng
    { id: "B", type: "purchase", date: "2026-01-05", paymentMethod: "111", taxRate: 10, items: items(4545454) },
    // trước 2026 (sổ đã khóa) không áp quy tắc ngưỡng
    { id: "C", type: "purchase", date: "2025-07-01", paymentMethod: "111", taxRate: 10, items: items(10000000) },
    // chuyển khoản không áp dụng
    { id: "D", type: "purchase", date: "2026-01-05", paymentMethod: "112", taxRate: 10, items: items(10000000) }
  ]);
  const a = byId(c, "A");
  assert.strictEqual(a.totalAmount, 5000001);
  assert.strictEqual(a.vatNonDeductible, true);
  assert.strictEqual(a.citNonDeductible, true);
  assert.strictEqual(sumSide(a.entries, "debit", "156"), 5000001);
  assert.strictEqual(sumSide(a.entries, "debit", "1331"), 0);
  ["B", "C", "D"].forEach(id => {
    const v = byId(c, id);
    assert.ok(!v.vatNonDeductible, id);
    assert.ok(sumSide(v.entries, "debit", "1331") > 0, id);
  });
});

const ledger156 = c => c.state.vouchers.reduce((s, v) => s + sumSide(v.entries, "debit", "156") - sumSide(v.entries, "credit", "156"), 0);
const stockValue = c => c.state.products.reduce((s, p) => s + p.totalValue, 0);

test("non-deductible VAT goes into each line's own cost so ledger 156 equals stock value", () => {
  const c = context("TT99", [
    { id: "NK1", type: "purchase", date: "2026-03-01", paymentMethod: "111", taxRate: 10, items: [
      { productId: "P1", qty: 1, price: 3000000, amount: 3000000 }, { productId: "P2", qty: 1, price: 2000001, amount: 2000001 }] },
    { id: "TL1", type: "purchase_return", date: "2026-03-02", paymentMethod: "111", taxRate: 10,
      items: [{ productId: "P1", qty: 1, price: 5000000, amount: 5000000 }] }
  ], { products: [{ id: "P1", initialStock: 10, initialCost: 100 }, { id: "P2", initialStock: 0, initialCost: 0 }] });
  const nk = byId(c, "NK1");
  assert.deepStrictEqual(nk.items.map(i => i.vatInCost), [300000, 200000], "each line's own VAT, last line takes the rounding");
  assert.strictEqual(sumSide(nk.entries, "debit", "156"), 5500001);
  assert.strictEqual(c.state.products[1].totalValue, 2200001);
  const tl = byId(c, "TL1");
  assert.strictEqual(tl.vatNonDeductible, true, "cash return over threshold is flagged like the purchase");
  assert.strictEqual(sumSide(tl.entries, "credit", "1331"), 0);
  assert.strictEqual(sumSide(tl.entries, "credit", "156"), 300091 + 500000, "cost + non-deductible VAT off 156");
  assert.ok(balanced(tl.entries));
  assert.strictEqual(ledger156(c) + 1000, stockValue(c), "ledger 156 (+ opening stock) = stock value");
  assert.strictEqual(c.calculateInventoryValueAt(c.state.products, c.state.vouchers, "2026-12-31"), stockValue(c));
  // Trả lại dưới ngưỡng / chuyển khoản vẫn ghi giảm 1331
  const d = context("TT99", [{ id: "TL2", type: "purchase_return", date: "2026-03-02", paymentMethod: "112", taxRate: 10,
    items: [{ productId: "P1", qty: 1, price: 5000000, amount: 5000000 }] }]);
  assert.ok(!byId(d, "TL2").vatNonDeductible);
  assert.strictEqual(sumSide(byId(d, "TL2").entries, "credit", "1331"), 500000);
});

test("vouchers before 2026 post exactly as before the upgrade (TT133 VAT into 156, no cash threshold)", () => {
  const c = context("TT133", [
    { id: "NK24", type: "purchase", date: "2024-05-01", paymentMethod: "111", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 10000000, amount: 10000000 }] },
    { id: "TL24", type: "purchase_return", date: "2024-05-02", paymentMethod: "331", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 100, amount: 100 }] }
  ]);
  const nk = byId(c, "NK24");
  // Bút toán y hệt mã cũ: TT133 Nợ 156 gồm thuế / Có 111, không 1331, không cờ ngưỡng
  assert.deepStrictEqual(JSON.parse(JSON.stringify(nk.entries)), [{ debit: "156", credit: "111", amount: 11000000, desc: "Nhập kho NK24" }]);
  assert.ok(!nk.vatNonDeductible && !nk.citNonDeductible);
  assert.deepStrictEqual(nk.items.map(i => i.vatInCost), [1000000], "B4: legacy TT133 VAT booked in 156 is in stock value too");
  assert.strictEqual(ledger156(c) + 1000, stockValue(c), "ledger 156 (+ opening stock) = stock value");
  const tl = byId(c, "TL24");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tl.entries.filter(e => e.amount === 10))),
    [{ debit: "331", credit: "156", amount: 10, desc: "Giảm thuế GTGT gộp trong giá hàng trả lại (TT133)" }]);
  // TT99 trước 2026: trả tiền mặt trên ngưỡng vẫn khấu trừ 1331 như cũ
  const d = context("TT99", [{ id: "NK24", type: "purchase", date: "2024-05-01", paymentMethod: "111", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 10000000, amount: 10000000 }] }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(byId(d, "NK24").entries)), [
    { debit: "156", credit: "111", amount: 10000000, desc: "Nhập kho NK24" },
    { debit: "1331", credit: "111", amount: 1000000, desc: "Thuế GTGT đầu vào được khấu trừ" }]);
});

test("B3: line VAT follows the line's own rate (not split by value)", () => {
  const c = context("TT99", [{ id: "NK1", type: "purchase", date: "2026-03-01", paymentMethod: "111", taxRate: 10, items: [
    { productId: "P1", qty: 1, price: 3000000, amount: 3000000, vatRate: 10 }, { productId: "P1", qty: 1, price: 2000000, amount: 2000000, vatRate: 5 }] }]);
  const nk = byId(c, "NK1");
  assert.strictEqual(nk.vatNonDeductible, true);
  assert.deepStrictEqual(nk.items.map(i => i.vatInCost), [300000, 100000]);
  assert.strictEqual(ledger156(c) + 1000, stockValue(c));
});

test("B3: same seller, same day cash invoices count together toward the threshold (NĐ 181 Đ26.3)", () => {
  const nk = (id, partnerId, date, amount) => ({ id, type: "purchase", date, partnerId, paymentMethod: "111", taxRate: 10, items: [{ productId: "P1", qty: 1, price: amount, amount }] });
  const c = context("TT99", [nk("A1", "NCC1", "2026-03-01", 3000000), nk("A2", "NCC1", "2026-03-01", 2000000),
    nk("B1", "NCC2", "2026-03-01", 2000000), nk("C1", "NCC1", "2026-03-02", 2000000)]);
  assert.ok(byId(c, "A1").vatNonDeductible && byId(c, "A2").vatNonDeductible && byId(c, "A2").citNonDeductible, "3.3m + 2.2m >= 5m");
  assert.ok(!byId(c, "B1").vatNonDeductible, "other seller");
  assert.ok(!byId(c, "C1").vatNonDeductible, "other day");
  assert.strictEqual(ledger156(c) + 1000, stockValue(c));
});

test("B3: same-day total counts every payment method; only cash invoices lose deduction; walk-in supplier not aggregated", () => {
  const nk = (id, partnerId, pm, amount, extra = {}) => ({ id, type: "purchase", date: "2026-03-01", partnerId, paymentMethod: pm, taxRate: 10, items: [{ productId: "P1", qty: 1, price: amount, amount }], ...extra });
  const c = context("TT99", [nk("A1", "NCC1", "111", 2000000), nk("A2", "NCC1", "112", 3000000),
    nk("W1", "NCC_VL", "111", 2000000, { partnerName: "Nhà cung cấp vãng lai" }), nk("W2", "NCC_VL", "111", 3000000, { partnerName: "Nhà cung cấp vãng lai" })]);
  assert.ok(byId(c, "A1").vatNonDeductible, "2.2m cash + 3.3m transfer >= 5m");
  assert.ok(!byId(c, "A2").vatNonDeductible, "transfer keeps deduction");
  assert.ok(!byId(c, "W1").vatNonDeductible && !byId(c, "W2").vatNonDeductible, "walk-in: each invoice on its own");
});

test("B3: purchase return referencing the original invoice follows that purchase's deduction", () => {
  const ret = (id, pm, originalInvoiceNo) => ({ id, type: "purchase_return", date: "2026-03-02", partnerId: "NCC1", paymentMethod: pm, taxRate: 10, originalInvoiceNo, items: [{ productId: "P1", qty: 1, price: 100, amount: 100 }] });
  const c = context("TT99", [
    { id: "NK1", type: "purchase", date: "2026-03-01", partnerId: "NCC1", invoiceNo: "0001", paymentMethod: "111", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 6000000, amount: 6000000 }] },
    { id: "NK2", type: "purchase", date: "2026-03-01", partnerId: "NCC2", invoiceNo: "0002", paymentMethod: "112", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 6000000, amount: 6000000 }] },
    ret("TL1", "331", "0001"), { ...ret("TL2", "111", "0002"), partnerId: "NCC2", items: [{ productId: "P1", qty: 1, price: 6000000, amount: 6000000 }] }]);
  assert.ok(byId(c, "TL1").vatNonDeductible, "small return of a non-deductible purchase");
  assert.ok(!byId(c, "TL2").vatNonDeductible, "cash return of a deductible purchase");
  assert.strictEqual(sumSide(byId(c, "TL2").entries, "credit", "1331"), 600000);
});

// ---- Tồn kho âm (B2) ----
test("B2: the purchase that restores negative stock posts the COGS difference so ledger 156 equals stock value", () => {
  const c = context("TT99", [
    { id: "BH1", type: "sales", date: "2026-03-01", paymentMethod: "131", taxRate: 0, items: [{ productId: "P1", qty: 12, price: 150, amount: 1800 }] },
    { id: "NK1", type: "purchase", date: "2026-03-05", paymentMethod: "331", taxRate: 0, items: [{ productId: "P1", qty: 5, price: 110, amount: 550 }] }
  ]);
  const adj = byId(c, "NK1").entries.find(e => e.desc === "Điều chỉnh giá vốn xuất kho âm");
  assert.deepStrictEqual([adj.debit, adj.credit, adj.amount], ["632", "156", 20], "2 units issued at 100, restored at 110");
  assert.strictEqual(c.state.products[0].totalValue, 330);
  assert.strictEqual(ledger156(c) + 1000, stockValue(c));
  assert.strictEqual(c.calculateInventoryValueAt(c.state.products, c.state.vouchers, "2026-03-01"), -200, "unclamped running value while negative");
  assert.strictEqual(c.calculateInventoryValueAt(c.state.products, c.state.vouchers, ""), 330);
  c.recalculateAccounting(false);
  assert.strictEqual(byId(c, "NK1").entries.filter(e => e.desc === adj.desc).length, 1, "recalc is idempotent");
});

test("B2: an issue that makes stock negative at or after its date is reported; allowNegativeStock turns it off", () => {
  const c = context("TT99", [{ id: "BH1", type: "sales", date: "2026-03-01", paymentMethod: "131", taxRate: 0, items: [{ productId: "P1", qty: 8, price: 1, amount: 8 }] }]);
  const sale = (id, date, qty) => ({ id, type: "sales", date, items: [{ productId: "P1", qty }] });
  assert.deepStrictEqual([...c.findNegativeStockProducts(c.state, sale("BH2", "2026-02-01", 3))], ["P1"], "backdated: 10 - 3 - 8 < 0 later");
  assert.deepStrictEqual([...c.findNegativeStockProducts(c.state, sale("BH2", "2026-02-01", 2))], []);
  assert.deepStrictEqual([...c.findNegativeStockProducts(c.state, sale("BH1", "2026-03-01", 10))], [], "editing a voucher replaces it");
  assert.deepStrictEqual([...c.findNegativeStockProducts(c.state, { id: "DK1", type: "inventory_adjust", date: "2026-04-01", items: [{ productId: "P1", qty: 3, adjustDir: "out" }] })], ["P1"]);
  assert.deepStrictEqual([...c.findNegativeStockProducts(c.state, { id: "DK2", type: "inventory_adjust", date: "2026-04-01", items: [{ productId: "P1", qty: 3, adjustDir: "in" }] })], []);
  c.state.allowNegativeStock = true;
  assert.deepStrictEqual([...c.findNegativeStockProducts(c.state, sale("BH2", "2026-02-01", 3))], []);
  c.state.vouchers.push(sale("BH3", "2026-03-10", 5));
  assert.deepStrictEqual([...c.negativeStockProductsAt(c.state, "2026-03-09")], []);
  assert.deepStrictEqual([...c.negativeStockProductsAt(c.state, "2026-03-31")], ["P1"]);
});

test("B2: editing compares against the stored version — unchanged legacy negative sale re-saves, only worse is blocked", () => {
  const sale = (date, qty) => ({ id: "BH1", type: "sales", date, paymentMethod: "131", taxRate: 0, items: [{ productId: "P1", qty, price: 1, amount: qty }] });
  const c = context("TT99", [sale("2026-03-01", 12)]); // opening 10 → already -2
  const find = v => [...c.findNegativeStockProducts(c.state, v)];
  assert.deepStrictEqual(find(sale("2026-03-01", 12)), [], "unchanged re-save");
  assert.deepStrictEqual(find(sale("2026-03-01", 11)), [], "less negative");
  assert.deepStrictEqual(find(sale("2026-02-01", 12)), [], "moved earlier, same depth");
  assert.deepStrictEqual(find(sale("2026-03-01", 13)), ["P1"], "more negative");
});

// ---- Kiểm kê (B7) ----
test("B7: inventory adjustments post by reason; stored accounts keep but amount follows recalculation", () => {
  const dk = (id, date, adjustDir, qty, extra = {}) => ({ id, type: "inventory_adjust", date, isManual: true, items: [{ productId: "P1", qty, adjustDir }], entries: [], ...extra });
  const c = context("TT99", [
    dk("DK1", "2026-03-01", "out", 2, { adjustCause: "unknown" }),
    dk("DK2", "2026-03-02", "in", 1, { adjustCause: "unknown" }),
    dk("DK3", "2026-03-03", "out", 1, { adjustCause: "norm" }),
    dk("DK4", "2026-03-04", "out", 1, { entries: [{ debit: "632", credit: "156", amount: 999, desc: "cũ" }] })
  ]);
  const row = id => JSON.parse(JSON.stringify(byId(c, id).entries.map(e => [e.debit, e.credit, e.amount])));
  assert.deepStrictEqual(row("DK1"), [["1381", "156", 200]]);
  assert.deepStrictEqual(row("DK2"), [["156", "3381", 100]]);
  assert.deepStrictEqual(row("DK3"), [["632", "156", 100]]);
  assert.deepStrictEqual(row("DK4"), [["632", "156", 100]], "legacy accounts kept, amount recalculated");
});

// ---- Kết chuyển cuối kỳ ----
test("period_close nets VAT and brings every 5xx–9xx account to zero into 4212", () => {
  const c = context("TT99", [
    { id: "NK1", type: "purchase", date: "2026-01-02", paymentMethod: "331", taxRate: 10, items: [{ productId: "P1", qty: 5, price: 100, amount: 500 }] },
    { id: "BH1", type: "sales", date: "2026-01-10", paymentMethod: "131", taxRate: 10, items: [{ productId: "P1", qty: 4, price: 300, amount: 1200 }] },
    { id: "BTL", type: "sales_return", date: "2026-01-12", paymentMethod: "131", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 300, amount: 300 }] },
    { id: "PKT", type: "general_journal", date: "2026-01-20", entries: [
      { debit: "6421", credit: "111", amount: 50 }, { debit: "5211", credit: "131", amount: 20 },
      { debit: "111", credit: "515", amount: 7 }, { debit: "811", credit: "111", amount: 3 }, { debit: "641", credit: "111", amount: 11 }] },
    { id: "KC01", type: "period_close", date: "2026-01-31", periodFrom: "2026-01-01", periodTo: "2026-01-31", entries: [] },
    { id: "BH2", type: "sales", date: "2026-02-05", paymentMethod: "131", taxRate: 10, items: [{ productId: "P1", qty: 1, price: 300, amount: 300 }] }
  ]);
  const close = byId(c, "KC01");
  assert.ok(close.entries.length > 0);
  const vat = close.entries.find(e => e.debit === "3331" && e.credit === "1331");
  assert.strictEqual(vat.amount, 50, "min(input 50, output 120 - 30)");
  const t = code => c.getAccountTurnover(c.state, code, "2026-01-01", "2026-01-31");
  ["5", "6", "7", "8", "9"].forEach(cls => {
    const r = t(cls);
    assert.strictEqual(r.closeDebit + r.closeCredit, 0, "class " + cls + " closes to zero");
  });
  // Lãi = 1200 − 300 − 20 + 7 − giá vốn (400 − 100) − 50 − 3 − 11 = 523
  assert.strictEqual(t("4212").closeCredit, 523);
  assert.strictEqual(t("1331").closeDebit, 0);
  assert.strictEqual(t("3331").closeCredit, 40);
  // Ghi sổ lại vẫn ra cùng kết quả (không tự kết chuyển chính nó)
  const before = JSON.stringify(close.entries);
  c.recalculateAccounting(false);
  assert.strictEqual(JSON.stringify(byId(c, "KC01").entries), before);
  // Tháng 2 chưa kết chuyển nên 511 còn số dư
  assert.strictEqual(c.getAccountTurnover(c.state, "511", "2026-02-01", "2026-02-28").closeCredit, 300);
});

test("quarter close after a month close does not close January twice", () => {
  const gj = (id, date, amount) => ({ id, type: "general_journal", date, entries: [{ debit: "111", credit: "511", amount }] });
  const c = context("TT99", [
    gj("T1", "2026-01-10", 100),
    { id: "KC01", type: "period_close", date: "2026-01-31", periodFrom: "2026-01-01", periodTo: "2026-01-31", entries: [] },
    gj("T2", "2026-02-10", 40),
    { id: "KCQ1", type: "period_close", date: "2026-03-31", periodFrom: "2026-01-01", periodTo: "2026-03-31", entries: [] }
  ]);
  assert.strictEqual(sumSide(byId(c, "KC01").entries, "debit", "511"), 100);
  assert.strictEqual(sumSide(byId(c, "KCQ1").entries, "debit", "511"), 40);
  assert.strictEqual(c.getAccountTurnover(c.state, "4212", "2026-01-01", "2026-03-31").closeCredit, 140);
});

test("B1/B5: first close of a year moves prior-year 4212 to 4211 and closes in the verified order", () => {
  const gj = (id, date, debit, credit, amount) => ({ id, type: "general_journal", date, entries: [{ debit, credit, amount }] });
  const close = (id, from, to) => ({ id, type: "period_close", date: to, periodFrom: from, periodTo: to, entries: [] });
  const c = context("TT99", [
    gj("T1", "2025-03-01", "111", "511", 1000), gj("T2", "2025-03-02", "642", "111", 200), close("KC25", "2025-01-01", "2025-12-31"),
    gj("T3", "2026-01-10", "111", "511", 500), gj("T4", "2026-01-11", "111", "711", 50), gj("T5", "2026-01-12", "811", "111", 5),
    gj("T6", "2026-01-20", "82111", "3334", 30), close("KC01", "2026-01-01", "2026-01-31"),
    gj("T7", "2026-02-10", "111", "511", 40), close("KC02", "2026-02-01", "2026-02-28")
  ]);
  const rows = id => JSON.parse(JSON.stringify(byId(c, id).entries.map(e => [e.debit, e.credit, e.amount])));
  assert.deepStrictEqual(rows("KC25"), [["511", "911", 1000], ["911", "642", 200], ["911", "4212", 800]]);
  assert.deepStrictEqual(rows("KC01"), [["4212", "4211", 800], ["511", "911", 500], ["711", "911", 50], ["911", "811", 5], ["911", "82111", 30], ["911", "4212", 515]]);
  assert.deepStrictEqual(rows("KC02"), [["511", "911", 40], ["911", "4212", 40]], "only the first close of the year transfers");
  const t = code => c.getAccountTurnover(c.state, code, "", "2026-02-28");
  assert.strictEqual(t("4211").closeCredit, 800);
  assert.strictEqual(t("4212").closeCredit, 555);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.buildPeriodCloseEntries(c.state, "2026-01-01", "2026-01-31").map(e => [e.debit, e.credit, e.amount]))), rows("KC01"),
    "standalone builder matches the one-pass recalc");
});

test("period close sends unclosed prior-year result to 4211, current year to 4212", () => {
  const c = context("TT99", [
    { id: "T25", type: "general_journal", date: "2025-06-01", entries: [{ debit: "111", credit: "511", amount: 100 }] },
    { id: "T26", type: "general_journal", date: "2026-02-01", entries: [{ debit: "642", credit: "111", amount: 30 }] }
  ]);
  const rows = (from, to) => JSON.parse(JSON.stringify(c.buildPeriodCloseEntries(c.state, from, to).map(e => [e.debit, e.credit, e.amount])));
  assert.deepStrictEqual(rows("2026-01-01", "2026-03-31"), [["511", "911", 100], ["911", "642", 30], ["911", "4211", 100], ["4212", "911", 30]]);
  assert.deepStrictEqual(rows("", "2026-03-31"), [["511", "911", 100], ["911", "642", 30], ["911", "4212", 70]], "no from: unchanged");
});

test("buildPeriodCloseEntries posts a loss as Nợ 4212 / Có 911", () => {
  const c = context("TT133", [{ id: "PKT", type: "general_journal", date: "2026-05-01", entries: [{ debit: "642", credit: "111", amount: 90 }] }]);
  const entries = c.buildPeriodCloseEntries(c.state, "2026-05-01", "2026-05-31");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(entries.map(e => [e.debit, e.credit, e.amount]))), [["911", "642", 90], ["4212", "911", 90]]);
});

// ---- Phiếu kế toán / bảng lương ----
test("general_journal keeps entries and warns on accounts outside the active chart", () => {
  const entries = [{ debit: "641", credit: "111", amount: 10 }, { debit: "6421", credit: "1121", amount: 5 }];
  const c = context("TT133", [{ id: "PKT", type: "general_journal", date: "2026-05-01", entries: entries.map(e => ({ ...e })) }]);
  const v = byId(c, "PKT");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.entries)), entries);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.accountWarnings)), ["TK 641 không có trong danh mục tài khoản"]);
  c.state.accountingStandard = "TT99";
  c.recalculateAccounting(false);
  assert.strictEqual(v.accountWarnings, undefined, "641 valid under TT99, 6421 too");
});

test("CIT provision voucher follows the regime: 82111 under TT99, 821 under TT133", () => {
  const c = context("TT133", [{ id: "PKT", type: "general_journal", citProvision: "2026-Q1", date: "2026-03-31", entries: [{ debit: "82111", credit: "3334", amount: 5 }] }]);
  const v = byId(c, "PKT");
  assert.strictEqual(v.entries[0].debit, "821");
  assert.strictEqual(v.accountWarnings, undefined);
  c.state.accountingStandard = "TT200";
  c.recalculateAccounting(false);
  assert.strictEqual(v.entries[0].debit, "82111");
});

test("payroll voucher is rebuilt from its payroll for the active regime", () => {
  const payroll = { id: "2026-05", lines: [{ dept: "sales", gross: 1000, ins: { employer: { bhtn: 10 }, employee: { bhtn: 10 } }, pit: 0 }] };
  const c = context("TT99", [{ id: "BL-2026-05", type: "payroll", date: "2026-05-31", payrollId: "2026-05", entries: [] }], { payrolls: [payroll] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/core/payroll-calc.js"), "utf8"), c);
  c.recalculateAccounting(false);
  const codes = () => [...byId(c, "BL-2026-05").entries.map(e => e.debit + "/" + e.credit)].sort();
  assert.deepStrictEqual(codes(), ["334/3386", "641/334", "641/3386"]);
  c.state.accountingStandard = "TT133";
  c.recalculateAccounting(false);
  assert.deepStrictEqual(codes(), ["334/3385", "642/334", "642/3385"]);
});

test("payroll entries are kept as stored", () => {
  const entries = [{ debit: "642", credit: "334", amount: 10000000 }, { debit: "334", credit: "3383", amount: 800000 }];
  const c = context("TT99", [{ id: "BL1", type: "payroll", date: "2026-05-31", entries: entries.map(e => ({ ...e })) }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(byId(c, "BL1").entries)), entries);
});

test("getAccountTurnover includes sub-accounts and opening balances", () => {
  const c = context("TT99", [
    { id: "PT1", type: "receipt", date: "2026-01-05", amount: 30, isManual: true, entries: [{ debit: "1121", credit: "131", amount: 30 }] },
    { id: "PT2", type: "receipt", date: "2026-02-05", amount: 20, isManual: true, entries: [{ debit: "112", credit: "131", amount: 20 }] },
    { id: "PC1", type: "payment", date: "2026-02-06", amount: 5, isManual: true, entries: [{ debit: "331", credit: "1122", amount: 5 }] }
  ], { initialBalances: { "112": { type: "debit", balance: 100 } } });
  assert.deepStrictEqual({ ...c.getAccountTurnover(c.state, "112", "2026-02-01", "2026-02-28") },
    { openDebit: 130, openCredit: 0, debit: 20, credit: 5, closeDebit: 145, closeCredit: 0 });
  assert.strictEqual(c.getAccountTurnover(c.state, "131", "", "").closeCredit, 50);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("ok - " + name); }
    catch (err) { failed++; console.error("FAIL - " + name + "\n  " + (err && err.stack)); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} tax-core tests passed`);
})();
