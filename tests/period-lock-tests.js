// Khóa sổ (Luật Kế toán Đ26, TT99 Đ13), hàng bán bị trả lại 5212 / TT133 511, cảnh báo trả tiền mặt hóa đơn mua chịu
// từ ngưỡng (NĐ 181/2025 Đ26), thuế suất mặc định dòng hàng. Plain node + vm, như tax-reports-tests.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILES = ["data.js", "js/core/chart-of-accounts.js", "js/core/tax-rules.js", "js/core/accounting-engine.js", "js/accounting.js",
  "js/modules/reports.js", "js/modules/tax-reports.js", "js/core/voucher-form-ui.js", "js/modules/cash.js"];
function context(standard, vouchers, extra = {}) {
  const ctx = {
    console,
    state: { accountingStandard: standard, products: [{ id: "P1", name: "Ống PPR", initialStock: 1000, initialCost: 100 }],
      partners: [{ id: "KH1", name: "Khách", type: "customer" }, { id: "NCC1", name: "NCC", type: "supplier" }],
      vouchers, initialBalances: {}, partnerOpeningBalances: {}, ...extra },
    saveState() {}, refreshUI() {}, safeParseFloat: Number,
    formatVND: n => `${Number(n || 0).toLocaleString("vi-VN")}đ`,
    formatDateDisplay: d => String(d).split("-").reverse().join("/"),
    document: { readyState: "complete", addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
    CustomEvent: class {},
    toasts: []
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  FILES.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ctx, { filename: file }));
  ctx.showToast = (message, type) => ctx.toasts.push({ message, type });
  ctx.recalculateAccounting(false);
  return ctx;
}
const item = (amount, vatRate, qty = 1) => ({ productId: "P1", qty, price: amount / qty, amount, vatRate });
const plain = x => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("isVoucherInLockedPeriod: date ≤ lockedThrough; báo giá/đơn đặt hàng và khóa sai định dạng không bị khóa", () => {
  const c = context("TT99", [], { lockedThrough: "2026-06-30" });
  assert.strictEqual(c.isVoucherInLockedPeriod(c.state, { type: "sales", date: "2026-06-30" }), true);
  assert.strictEqual(c.isVoucherInLockedPeriod(c.state, { type: "period_close", date: "2026-06-30" }), true);
  assert.strictEqual(c.isVoucherInLockedPeriod(c.state, { type: "sales", date: "2026-07-01" }), false);
  assert.strictEqual(c.isVoucherInLockedPeriod(c.state, { type: "sales_quotation", date: "2026-01-01" }), false);
  assert.strictEqual(c.isVoucherInLockedPeriod(c.state, { type: "purchase_order", date: "2026-01-01" }), false);
  assert.strictEqual(c.isVoucherInLockedPeriod({ lockedThrough: "" }, { type: "sales", date: "2020-01-01" }), false);
  assert.strictEqual(c.isVoucherInLockedPeriod({ lockedThrough: "30/06/2026" }, { type: "sales", date: "2020-01-01" }), false);
});

test("blockLockedPeriodEdit: chặn khi bản mới HOẶC bản cũ (sửa dời ngày ra khỏi kỳ khóa) nằm trong kỳ khóa", () => {
  const c = context("TT99", [], { lockedThrough: "2026-06-30" });
  assert.strictEqual(c.blockLockedPeriodEdit({ type: "receipt", date: "2026-07-05" }, null), false);
  assert.strictEqual(c.toasts.length, 0);
  assert.strictEqual(c.blockLockedPeriodEdit({ type: "receipt", date: "2026-07-05" }, { type: "receipt", date: "2026-06-10" }), true);
  assert.match(c.toasts.pop().message, /khóa đến ngày 30\/06\/2026.*ngày 10\/06\/2026/);
  assert.strictEqual(c.blockLockedPeriodEdit(null, [{ type: "sales", date: "2026-08-01" }, { type: "sales", date: "2026-05-01" }]), true);
});

test("deleteVoucher từ chối chứng từ trong kỳ khóa trước khi hỏi xác nhận; recalc vẫn ghi sổ lại kỳ khóa", async () => {
  const vouchers = [{ id: "BH1", type: "sales", date: "2026-03-01", partnerId: "KH1", paymentMethod: "131", taxRate: 8, items: [item(1000, 8)], isManual: true }];
  const c = context("TT99", vouchers, { lockedThrough: "2026-06-30" });
  let asked = false;
  c.showConfirmModal = async () => { asked = true; return true; };
  await c.deleteVoucher("BH1");
  assert.strictEqual(asked, false);
  assert.strictEqual(c.state.vouchers.length, 1);
  assert.strictEqual(c.toasts.pop().type, "danger");
  c.state.vouchers[0].entries = [];
  c.recalculateAccounting(false);
  assert.ok(c.state.vouchers[0].entries.length > 0, "derived entries still recomputed in a locked period");
});

test("phiếu kế toán ngày trong kỳ khóa không được lưu", async () => {
  const c = context("TT99", [], { lockedThrough: "2026-06-30" });
  const fields = { "gj-date": "2026-06-15", "gj-desc": "Phân bổ", "gj-id": "PKT1" };
  c.document.getElementById = id => (id in fields ? { value: fields[id] } : null);
  c.document.querySelectorAll = () => [{ querySelector: sel => ({ value: { ".gj-debit": "642", ".gj-credit": "242", ".gj-amount": "1.000", ".gj-desc": "" }[sel] }) }];
  let began = false;
  c.beginVoucherSubmit = () => { began = true; return true; };
  await c.handleGeneralJournalSubmit({ preventDefault() {} });
  assert.strictEqual(began, false);
  assert.strictEqual(c.state.vouchers.length, 0);
  assert.match(c.toasts.pop().message, /khóa/);
});

const load = (c, file) => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });

test("nạp Excel bán hàng: bỏ qua dòng mới thuộc kỳ khóa và dòng ghi đè chứng từ kỳ khóa, báo một lần", async () => {
  const locked = { id: "BH1", type: "sales", date: "2026-03-01", partnerId: "KH1", paymentMethod: "131", taxRate: 8, items: [item(1000, 8)], isManual: true };
  const c = context("TT99", [locked], { lockedThrough: "2026-06-30" });
  load(c, "js/excel-integration.js");
  const row = (date, id) => [date, "", id, "", "", "", "Khách", "Bán hàng", 1000, 0, 0, 1000, "", "", ""];
  const rows = [[], [], row("2026-05-01", "BH2"), row("2026-07-05", "BH3"), row("2026-07-05", "BH1")];
  c.readExcelViaIPC = async () => new Uint8Array();
  c.XLSX = { read: () => ({ SheetNames: ["s"], Sheets: { s: {} } }), utils: { sheet_to_json: () => rows } };
  await c.autoIntegrateSalesExcel();
  assert.deepStrictEqual(c.state.vouchers.map(v => `${v.id}@${v.date}`).sort(), ["BH1@2026-03-01", "BH3@2026-07-05"]);
  assert.deepStrictEqual(c.toasts.map(t => t.message), ["Bỏ qua 2 chứng từ thuộc kỳ đã khóa sổ (đến 30/06/2026)"]);
});

test("dự phòng/xóa nợ: phiếu kế toán ngày trong kỳ khóa không được lưu", async () => {
  const c = context("TT99", [], { lockedThrough: "2026-06-30" });
  load(c, "js/modules/provisions.js");
  let askedId = false;
  c.getCloudSafeVoucherId = async () => { askedId = true; return "PKT1"; };
  await c.saveProvisionVoucher({ type: "general_journal", date: "2026-06-30", provisionYear: 2026, entries: [{ debit: "642", credit: "2293", amount: 1 }] }, null);
  assert.strictEqual(askedId, false);
  assert.strictEqual(c.state.vouchers.length, 0);
  assert.match(c.toasts.pop().message, /khóa đến ngày 30\/06\/2026/);
});

test("hàng bán bị trả lại: TT99 Nợ 5212, TT133 Nợ 511; B02 vẫn trừ vào giảm trừ doanh thu; kết chuyển 5212 → 511", () => {
  const vouchers = () => [
    { id: "BH1", type: "sales", date: "2026-08-10", partnerId: "KH1", paymentMethod: "131", taxRate: 10, items: [item(100000, 10, 10)], isManual: true },
    { id: "TL1", type: "sales_return", date: "2026-08-20", partnerId: "KH1", paymentMethod: "131", taxRate: 10, items: [item(10000, 10, 1)], isManual: true }
  ];
  const tt99 = context("TT99", vouchers());
  const ret99 = tt99.state.vouchers.find(v => v.id === "TL1");
  assert.deepStrictEqual(plain(ret99.entries.slice(0, 2)).map(e => `${e.debit}/${e.credit}/${e.amount}`), ["5212/131/10000", "3331/131/1000"]);
  const pl = tt99.computeProfitLoss(tt99.state, "2026-01-01", "2026-12-31");
  assert.deepStrictEqual([pl.sales, pl.deductions, pl.netRevenue], [100000, 10000, 90000]);
  const close = plain(tt99.buildPeriodCloseEntries(tt99.state, "2026-01-01", "2026-12-31"));
  assert.ok(close.some(e => e.debit === "511" && e.credit === "5212" && e.amount === 10000), JSON.stringify(close));

  const tt133 = context("TT133", vouchers());
  assert.strictEqual(tt133.state.vouchers.find(v => v.id === "TL1").entries[0].debit, "511");
  const pl133 = tt133.computeProfitLoss(tt133.state, "2026-01-01", "2026-12-31");
  assert.deepStrictEqual([pl133.deductions, pl133.netRevenue], [10000, 90000]);
});

test("getNonDeductibleCashSettlements: hóa đơn mua chịu ≥ 5tr trả bằng tiền mặt (kể cả trả trước); trả ngân hàng / dưới ngưỡng thì không", () => {
  const purchase = (id, date, amount, partnerId = "NCC1") => ({ id, type: "purchase", date, partnerId, paymentMethod: "331", taxRate: 10, items: [item(amount, 10)], isManual: true });
  const pay = (id, date, amount, credit, partnerId = "NCC1") => ({ id, type: "payment", date, partnerId, paymentMethod: credit, amount, isManual: true, entries: [{ debit: "331", credit, amount }] });
  const c = context("TT99", [
    purchase("NK1", "2026-07-01", 5000000),          // 5.500.000 gồm thuế
    pay("PC1", "2026-07-10", 2750000, "1111"),       // trả nửa bằng tiền mặt
    pay("PC2", "2026-07-11", 2750000, "1121"),       // nửa còn lại qua ngân hàng
    purchase("NK2", "2026-07-02", 4000000, "NCC2"),  // 4.400.000 < 5tr
    pay("PC3", "2026-07-12", 4400000, "111", "NCC2"),
    pay("PC4", "2026-08-01", 6600000, "111", "NCC3"), // trả trước tiền mặt
    purchase("NK3", "2026-08-05", 6000000, "NCC3")
  ], { partners: [{ id: "NCC1", type: "supplier" }, { id: "NCC2", type: "supplier" }, { id: "NCC3", type: "supplier" }] });
  const hits = plain(c.getNonDeductibleCashSettlements(c.state));
  assert.deepStrictEqual(hits.map(h => [h.paymentId, h.purchaseId, h.amount, h.vat]), [["PC1", "NK1", 2750000, 250000], ["PC4", "NK3", 6600000, 600000]]);
  assert.match(c.getCashSettlementVatWarning("PC1"), /NK1.*250\.000đ không được khấu trừ/);
  assert.strictEqual(c.getCashSettlementVatWarning("PC2"), "");
});

test("getNonDeductibleCashSettlements: số dư đầu kỳ NCC được tất toán trước hóa đơn mới", () => {
  const c = context("TT99", [
    { id: "NK1", type: "purchase", date: "2026-07-01", partnerId: "NCC1", paymentMethod: "331", taxRate: 10, items: [item(5000000, 10)], isManual: true },
    { id: "PC1", type: "payment", date: "2026-07-10", partnerId: "NCC1", paymentMethod: "111", amount: 3000000, isManual: true, entries: [{ debit: "331", credit: "111", amount: 3000000 }] }
  ], { partnerOpeningBalances: { NCC1: { debit: 0, credit: 1000000 } } });
  assert.deepStrictEqual(plain(c.getNonDeductibleCashSettlements(c.state)).map(h => h.amount), [2000000]);
});

test("số dư đầu kỳ công nợ khi đã khóa sổ: người dùng thường bị chặn, quản trị viên phải xác nhận", async () => {
  const c = context("TT99", [], { lockedThrough: "2026-06-30" });
  Object.assign(c, { matchAdvancedQuery: () => true, ensureRemainingDebt() {}, openModal() {}, closeModal() {}, escapeHtmlAttr: s => s, XLSX: null });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/modules/debts.js"), "utf8"), c, { filename: "debts.js" });
  const fields = { "edit-debt-target-id": "KH1", "edit-debt-type": "partner", "edit-debt-partner-debit": "5.000", "edit-debt-partner-credit": "0" };
  c.document.getElementById = id => id in fields ? { value: fields[id] } : null;
  const submit = () => c.handleEditDebtSubmit({ preventDefault() {} });
  let asked = 0;
  c.showConfirmModal = async () => { asked++; return false; };
  c.currentUser = { role: "accountant" };
  await submit();
  assert.strictEqual(c.state.partnerOpeningBalances.KH1, undefined);
  assert.match(c.toasts.pop().message, /chỉ quản trị viên được sửa số dư đầu kỳ/);
  c.currentUser = { role: "admin" };
  await submit();
  assert.strictEqual(asked, 1);
  assert.strictEqual(c.state.partnerOpeningBalances.KH1, undefined, "quản trị viên bấm Hủy: không đổi");
  c.showConfirmModal = async () => true;
  await submit();
  assert.deepStrictEqual(plain(c.state.partnerOpeningBalances.KH1), { debit: 5000, credit: 0 });
  c.state.lockedThrough = "";
  c.currentUser = { role: "accountant" };
  fields["edit-debt-partner-debit"] = "7.000";
  await submit();
  assert.strictEqual(c.state.partnerOpeningBalances.KH1.debit, 7000, "chưa khóa sổ: sửa bình thường");
});

test("thuế suất mặc định: chưa chọn phương pháp giữ 0%; khấu trừ tự động 8% rồi 10%; theo thiết lập; cảnh báo 0% chỉ với DN khấu trừ", () => {
  const c = context("TT99", []);
  const kt = { taxSettings: { vatMethod: "khau_tru" } };
  assert.strictEqual(c.getDefaultVatRate("2026-11-10", {}), "0", "dữ liệu cũ chưa chọn phương pháp: giữ mặc định 0");
  assert.strictEqual(c.getDefaultVatRate("2026-11-10", { taxSettings: { defaultVatRate: "10" } }), "10");
  assert.strictEqual(c.getDefaultVatRate("2026-11-10", kt), "8");
  assert.strictEqual(c.getDefaultVatRate("2027-01-01", kt), "10");
  assert.strictEqual(c.getDefaultVatRate("2026-11-10", { taxSettings: { defaultVatRate: "kct" } }), "KCT");
  assert.strictEqual(c.getDefaultVatRate("2026-11-10", { taxSettings: { vatMethod: "khong_chiu" } }), "KCT");
  assert.strictEqual(c.getDefaultVatRate("2026-11-10", { taxSettings: { vatMethod: "khau_tru", defaultVatRate: "" } }), "8");
  assert.match(c.getZeroVatSaleWarning([item(1, 8), item(1, 0)], kt), /0% chỉ áp dụng cho hàng xuất khẩu/);
  assert.strictEqual(c.getZeroVatSaleWarning([item(1, 0)], {}), "", "chưa chọn phương pháp: không cảnh báo 0%");
  assert.strictEqual(c.getZeroVatSaleWarning([item(1, 8), item(1, "KCT")], kt), "");
  assert.strictEqual(c.getZeroVatSaleWarning([item(1, 0)], { taxSettings: { vatMethod: "truc_tiep" } }), "");
  assert.strictEqual(c.getZeroVatSaleWarning([{ amount: 1 }], kt), "", "legacy line without own rate is not flagged");
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL ${name}\n${err.stack}`);
    }
  }
  console.log(failed ? `${failed} period lock test(s) failed` : `period lock tests passed (${tests.length})`);
  process.exitCode = failed ? 1 : 0;
})();
