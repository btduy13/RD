// Dự phòng nợ khó đòi 2293 và xóa nợ (js/modules/provisions.js) theo TT 48/2019: nhóm tuổi nợ, bù trừ 331,
// bút toán trích lập/hoàn nhập, lập lại cùng năm, xóa nợ tách 2293/642. Plain node + assert trong vm sandbox.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILES = ["data.js", "js/core/chart-of-accounts.js", "js/core/tax-rules.js", "js/core/accounting-engine.js", "js/accounting.js",
  "js/modules/debts.js", "js/modules/provisions.js"];
const M = 1000000;
const item = amount => ({ productId: "P1", qty: 1, price: amount, amount, vatRate: "KCT" });
const sale = (id, date, partnerId, amount) => ({ id, type: "sales", date, partnerId, paymentMethod: "131", taxRate: "KCT", items: [item(amount)], isManual: true });
const receipt = (id, date, partnerId, amount) => ({ id, type: "receipt", date, partnerId, amount, isManual: true, entries: [{ debit: "111", credit: "131", amount }] });

function context(standard = "TT99", extra = []) {
  const ctx = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map,
    state: {
      accountingStandard: standard, initialBalances: {}, partnerOpeningBalances: {},
      products: [{ id: "P1", name: "Đèn", initialStock: 10000, initialCost: 1 }],
      partners: [{ id: "KH1", name: "Khách <1>", type: "customer" }, { id: "KH2", name: "Khách 2", type: "both" }],
      vouchers: [
        sale("BH1", "2022-06-01", "KH1", 10 * M), // ≥ 3 năm → 100%
        sale("BH2", "2024-03-01", "KH1", 20 * M), // 1–<2 năm → 50%
        sale("BH3", "2025-05-01", "KH1", 30 * M), // 6 tháng–<1 năm → 30%
        sale("BH4", "2025-10-01", "KH1", 5 * M),  // < 6 tháng → 0
        receipt("PT1", "2025-01-10", "KH1", 5 * M), // FIFO trừ vào BH1
        sale("BH5", "2024-06-01", "KH2", 30 * M),
        { id: "NK1", type: "purchase", date: "2025-02-01", partnerId: "KH2", paymentMethod: "331", taxRate: "KCT", items: [item(10 * M)], isManual: true },
        ...extra
      ]
    },
    document: { getElementById() { return null; }, addEventListener() {} },
    saveState() {}, refreshUI() {}, showToast() {}, safeParseFloat: Number, formatVND: String, escapeHtmlAttr: s => s,
    matchAdvancedQuery: () => true, ensureRemainingDebt() {}, openModal() {}, closeModal() {}, XLSX: null
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f }));
  ctx.recalculateAccounting(false);
  return ctx;
}
const plain = x => JSON.parse(JSON.stringify(x));
const book = (c, v, id) => { c.state.vouchers.push({ ...v, id }); c.recalculateAccounting(false); };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("tuổi nợ FIFO theo nhóm 30/50/70/100%, hóa đơn < 6 tháng không trích", () => {
  const c = context();
  const r = plain(c.computeDoubtfulDebtProvision("2025-12-31", 0));
  const kh1 = r.rows.find(x => x.partnerId === "KH1");
  assert.strictEqual(kh1.gross, 60 * M);
  assert.deepStrictEqual(kh1.bands.map(b => [b.rate, b.amount, b.provision]), [[100, 5 * M, 5 * M], [50, 20 * M, 10 * M], [30, 30 * M, 9 * M]]);
  assert.strictEqual(kh1.provision, 24 * M);
});

test("số ngày được nợ dời hạn thanh toán: BH3 + 90 ngày chưa quá hạn 6 tháng", () => {
  const r = plain(context().computeDoubtfulDebtProvision("2025-12-31", 90));
  assert.strictEqual(r.rows.find(x => x.partnerId === "KH1").provision, 15 * M);
});

test("bù trừ Dư Có 331 cùng đối tượng (TT48 k3g) và tách được trừ / không được trừ theo hồ sơ", () => {
  const c = context();
  c.state.provisionEvidence = { KH2: true };
  const r = plain(c.computeDoubtfulDebtProvision("2025-12-31", 0));
  const kh2 = r.rows.find(x => x.partnerId === "KH2");
  assert.deepStrictEqual([kh2.gross, kh2.payable, kh2.net, kh2.provision], [30 * M, 10 * M, 20 * M, 10 * M]);
  assert.deepStrictEqual([r.required, r.deductible, r.nonDeductible], [34 * M, 10 * M, 24 * M]);
});

test("bút toán trích lập Nợ 6426 / Có 2293 (TT133: 642); lập lại cùng năm cho cùng số", () => {
  const c = context();
  const b = plain(c.buildProvisionVoucher("2025-12-31", 0));
  assert.deepStrictEqual([b.current, b.diff, b.voucher.provisionYear], [0, 34 * M, 2025]);
  assert.deepStrictEqual(b.voucher.entries.map(e => [e.debit, e.credit, e.amount]), [["6426", "2293", 34 * M]]);
  book(c, b.voucher, "PKT1");
  const again = plain(c.buildProvisionVoucher("2025-12-31", 0));
  assert.strictEqual(again.current, 0, "phiếu trích lập của chính năm đó không tính vào số dư hiện có");
  assert.deepStrictEqual(again.voucher.entries, b.voucher.entries);
  assert.strictEqual(plain(context("TT133").buildProvisionVoucher("2025-12-31", 0)).voucher.entries[0].debit, "642");
});

test("hoàn nhập năm sau khi đã thu hết: Nợ 2293 / Có 6426", () => {
  const c = context("TT99", [receipt("PT2", "2026-03-01", "KH1", 60 * M), receipt("PT3", "2026-03-01", "KH2", 30 * M)]);
  book(c, plain(c.buildProvisionVoucher("2025-12-31", 0)).voucher, "PKT1");
  const b = plain(c.buildProvisionVoucher("2026-12-31", 0));
  assert.deepStrictEqual([b.calc.required, b.current, b.diff], [0, 34 * M, -34 * M]);
  assert.deepStrictEqual(b.voucher.entries.map(e => [e.debit, e.credit, e.amount]), [["2293", "6426", 34 * M]]);
});

test("xóa nợ: Nợ 2293 tới mức dự phòng của đối tượng, phần thiếu Nợ 6426, Có 131; thu sau xóa nợ được cảnh báo", () => {
  const c = context();
  book(c, plain(c.buildProvisionVoucher("2025-12-31", 0)).voucher, "PKT1");
  const w = plain(c.buildWriteOffVoucher("KH1", "2026-01-15", "closed"));
  assert.deepStrictEqual(w.voucher.entries.map(e => [e.debit, e.credit, e.amount]), [["2293", "131", 24 * M], ["6426", "131", 36 * M]]);
  assert.deepStrictEqual([w.record.amount, w.record.provisionUsed, w.record.deductible, w.voucher.partnerId], [60 * M, 24 * M, true, "KH1"]);
  assert.strictEqual(c.buildWriteOffVoucher("KH1", "2026-01-15", "nope"), null);
  book(c, w.voucher, "PKT2");
  c.state.writtenOffDebts = [{ ...w.record, voucherId: "PKT2" }];
  assert.strictEqual(c.calculatePartnerDebts("", "2026-01-15").find(d => d.id === "KH1").kpiReceivable, 0);
  assert.strictEqual(c.partnerProvisionAvailable("KH1", "2026-01-15"), 0, "dự phòng đã dùng không dùng lại");
  assert.strictEqual(plain(c.buildWriteOffVoucher("KH2", "2026-01-15", "other")).record.deductible, false);
  book(c, receipt("PT9", "2026-02-01", "KH1", 1 * M), "PT9");
  assert.deepStrictEqual(plain(c.findReceiptsAfterWriteOff()).map(r => r.id), ["PT9"]);
});

test("số dư đầu kỳ không khớp hóa đơn: tính tuổi từ ngày số dư đầu kỳ, hiện trên dòng", () => {
  const c = context();
  c.state.partners.push({ id: "KH3", name: "Khách cũ", type: "customer" });
  c.state.partnerOpeningBalances = { KH3: { debit: 40 * M, credit: 0 } };
  c.recalculateAccounting(false);
  // Mặc định: ngày chứng từ sớm nhất (2022-06-01) → ≥ 3 năm tại 31/12/2025 → 100%.
  let kh3 = plain(c.computeDoubtfulDebtProvision("2025-12-31", 0)).rows.find(x => x.partnerId === "KH3");
  assert.deepStrictEqual([kh3.gross, kh3.undated, kh3.provision], [40 * M, 0, 40 * M]);
  assert.deepStrictEqual(kh3.opening, { amount: 40 * M, from: "2022-06-01", rate: 100 });
  // Ngày số dư đầu kỳ do người dùng nhập: 01/03/2025 → 6 tháng–<1 năm → 30%.
  kh3 = plain(c.computeDoubtfulDebtProvision("2025-12-31", 0, "2025-03-01")).rows.find(x => x.partnerId === "KH3");
  assert.strictEqual(kh3.provision, 12 * M);
  assert.strictEqual(plain(c.buildProvisionVoucher("2025-12-31", 0, "2025-03-01")).voucher.provisionOpeningDate, "2025-03-01");
});

test("phiếu trích lập dùng số cố định DP-YYYY, thay phiếu PKT cũ và tombstone số cũ", async () => {
  const c = context();
  const deleted = [];
  Object.assign(c, {
    confirm: () => true, formatDateDisplay: String, saveStateAndSyncVoucher: async () => true, trackDeletedIds: ids => { deleted.push(...ids); return {}; },
    getCloudSafeVoucherId: async () => { throw new Error("không được giữ số PKT cho phiếu trích lập"); }
  });
  vm.runInContext('provisionUi.date = "2025-12-31"; provisionUi.creditDays = 0;', c);
  book(c, plain(c.buildProvisionVoucher("2025-12-31", 0)).voucher, "PKT7"); // phiếu bản cũ
  await c.applyProvisionEntry();
  let prov = c.state.vouchers.filter(v => v.provisionYear === 2025);
  assert.deepStrictEqual(prov.map(v => v.id), ["DP-2025"]);
  assert.deepStrictEqual(deleted, ["PKT7"]);
  await c.applyProvisionEntry(); // máy khác / lần sau: ghi đè cùng số
  prov = c.state.vouchers.filter(v => v.provisionYear === 2025);
  assert.deepStrictEqual(prov.map(v => v.id), ["DP-2025"]);
  assert.deepStrictEqual(deleted, ["PKT7"]);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok - ${t.name}`); }
    catch (e) { failed++; console.error(`FAIL - ${t.name}\n${e.stack}`); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} provisions tests passed`);
})();
