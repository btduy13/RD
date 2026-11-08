// Chứng từ W3: thông tin hóa đơn (ký hiệu TT 91/2026), thuế GTGT theo dòng trên form, cảnh báo tiền mặt
// từ ngưỡng (NĐ 181/2025), phiếu kế toán tổng hợp general_journal. Plain node + vm, DOM giả tối thiểu.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILES = ["js/core/chart-of-accounts.js", "js/core/tax-rules.js", "js/core/accounting-engine.js", "js/accounting.js",
  "js/core/voucher-form-ui.js", "js/modules/cash.js"];

function fakeElement(props = {}) {
  return {
    value: "", dataset: {}, style: {}, children: [],
    insertAdjacentElement(_, node) { elements[node.id] = node; },
    replaceChildren(...nodes) { this.children = nodes; },
    ...props
  };
}
let elements = {};
let selectorResults = {};

function sandbox(vouchers = [], partners = []) {
  elements = {};
  selectorResults = {};
  const ctx = {
    console,
    state: { accountingStandard: "TT200", products: [], partners, vouchers, initialBalances: {}, partnerOpeningBalances: {} },
    DEFAULT_DATA: { products: [] }, saveState() {}, refreshUI() {}, safeParseFloat: Number,
    formatVND: n => `${Number(n || 0).toLocaleString("vi-VN")}đ`,
    CustomEvent: class {},
    document: {
      readyState: "complete",
      addEventListener() {}, dispatchEvent() {},
      getElementById: id => elements[id] || null,
      createElement: () => fakeElement(),
      querySelectorAll: sel => selectorResults[sel] || [],
      querySelector: () => null
    },
    toasts: []
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  FILES.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ctx, { filename: file }));
  ctx.showToast = (message, type) => ctx.toasts.push({ message, type });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js/utils.js"), "utf8"), Object.assign(ctx.utils = {}, { window: ctx.utils }));
  ctx.formatDateDisplay = ctx.utils.formatDateDisplay;
  ctx.escapeHtmlAttr = ctx.escapeHtmlText = value => String(value ?? "");
  return ctx;
}

function input(id, value, extra = {}) {
  elements[id] = fakeElement({ id, value, ...extra });
  return elements[id];
}

function formRow(values) {
  const cells = {};
  Object.entries(values).forEach(([selector, value]) => { cells[selector] = fakeElement({ value }); });
  cells[".item-total-display"] = fakeElement();
  return { querySelector: selector => cells[selector] || null };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("invoice symbol follows TT 91/2026 Đ4 (6 chars: C/K, year, type letter, 2 uppercase)", () => {
  const c = sandbox();
  ["C26TAA", "K25MBC", "C26FAA", "C26XYZ"].forEach(s => assert.strictEqual(c.isValidInvoiceSymbol(s), true, s));
  ["1C26TAA", "C26TA", "A26TAA", "C2XTAA", "C26ZAA", "C26Taa", "C26T1A", ""].forEach(s => assert.strictEqual(c.isValidInvoiceSymbol(s), false, s));
  assert.strictEqual(c.defaultSalesInvoiceSymbol("2026-11-07"), "C26TAA");
  assert.strictEqual(c.defaultSalesInvoiceSymbol("2027-01-02"), "C27TAA");
});

test("invoice validation: form 1 digit, number ≤ 8 digits; unchanged legacy values are not blocked", () => {
  const c = sandbox();
  assert.strictEqual(c.validateVoucherInvoice({ invoiceForm: "1", invoiceSymbol: "C26TAA", invoiceNo: "12345678" }), "");
  assert.match(c.validateVoucherInvoice({ invoiceNo: "123456789" }), /8 chữ số/);
  assert.match(c.validateVoucherInvoice({ invoiceNo: "HD-01" }), /8 chữ số/);
  assert.match(c.validateVoucherInvoice({ invoiceForm: "12", invoiceNo: "1" }), /Mẫu số/);
  assert.match(c.validateVoucherInvoice({ invoiceSymbol: "1C26TAA", invoiceNo: "1" }), /Ký hiệu/);
  assert.strictEqual(c.validateVoucherInvoice({ invoiceNo: "HD-01" }, { invoiceNo: "HD-01" }), "", "imported Excel invoice number kept");
});

test("readVoucherInvoiceFields: nothing stored without invoice number; defaults and partner MST when present", () => {
  const c = sandbox();
  input("sale-inv-form", "1");
  input("sale-inv-symbol", "c26taa");
  input("sale-inv-no", "");
  input("sale-inv-date", "");
  input("sale-inv-taxcode", "");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.readVoucherInvoiceFields("sale", { date: "2026-11-07" }))), { fields: {}, error: "" });

  elements["sale-inv-no"].value = "42";
  const { fields, error } = c.readVoucherInvoiceFields("sale", { date: "2026-11-07", partner: { taxCode: "0312345678" } });
  assert.strictEqual(error, "");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fields)), {
    invoiceForm: "1", invoiceSymbol: "C26TAA", invoiceNo: "42", invoiceDate: "2026-11-07", partnerTaxCode: "0312345678"
  });

  elements["sale-inv-symbol"].value = "C26ZAA";
  assert.match(c.readVoucherInvoiceFields("sale").error, /Ký hiệu/);
});

test("sales return note references the original invoice per TT 91/2026 Đ10", () => {
  const c = sandbox([{ id: "BH1", type: "sales", date: "2026-10-01", items: [], invoiceForm: "1", invoiceSymbol: "C26TAA", invoiceNo: "15", invoiceDate: "2026-10-02" }]);
  ["form", "symbol", "no", "date", "taxcode"].forEach(k => input(`sales-ret-inv-${k}`, ""));
  input("sales-ret-inv-orig", "15");
  const { fields } = c.readVoucherInvoiceFields("sales-ret", { date: "2026-11-07", originalType: "sales" });
  assert.strictEqual(fields.originalInvoiceNo, "15");
  assert.strictEqual(fields.invoiceNote, "Điều chỉnh giảm cho hóa đơn Mẫu số 1 ký hiệu C26TAA số 15 ngày 02/10/2026");
  assert.strictEqual(c.buildInvoiceAdjustmentNote("99", "sales"), "Điều chỉnh giảm cho hóa đơn số 99");
});

test("form totals: per-line VAT rates grouped and rounded like the ledger; legacy header rate unchanged", () => {
  const c = sandbox();
  c.registerDynamicFormTable(c.createStandardDynamicFormTableConfig({
    tbodyId: "t-body", hasVat: true, cashThresholdWarning: true,
    totals: { taxRateId: "t-rate", subtotalId: "t-sub", taxId: "t-tax", totalId: "t-total" },
    fieldIds: { date: "t-date", payment: "t-pay" }
  }));
  input("t-rate", "0"); input("t-sub", ""); input("t-tax", ""); input("t-total", "");
  input("t-date", "2026-11-07"); input("t-pay", "331");
  const rows = [
    formRow({ ".item-qty": "2", ".item-price": "1.000.000", ".item-discount": "0", ".item-vatrate": "8" }),
    formRow({ ".item-qty": "1", ".item-price": "333", ".item-discount": "0", ".item-vatrate": "10" }),
    formRow({ ".item-qty": "1", ".item-price": "500.000", ".item-discount": "0", ".item-vatrate": "KCT" })
  ];
  elements["t-body"] = fakeElement({ id: "t-body", querySelectorAll: () => rows });
  const totals = c.recalculateDynamicFormTable("t-body");
  assert.deepStrictEqual({ ...totals }, { subtotal: 2500333, taxAmount: 160000 + 33, total: 2660366 });

  // Values saved per line, then ledger computes the same tax.
  const items = rows.map((row, i) => ({ amount: [2000000, 333, 500000][i], vatRate: c.readDynamicVatRate(row) }));
  assert.deepStrictEqual(items.map(i => i.vatRate), [8, 10, "KCT"]);
  assert.strictEqual(c.computeVatBreakdown(items, 0).tax, totals.taxAmount);

  const note = elements["t-body-tax-note"].children.map(n => n.textContent);
  assert(note.some(t => t.startsWith("Thuế suất 8%: tiền hàng 2.000.000đ")), note.join("\n"));
  assert(note.some(t => t.startsWith("Thuế suất KCT:")), "KCT group listed");
  assert(note.some(t => /giảm thuế GTGT 10% → 8% đến 31\/12\/2026/.test(t)), "reduced-rate hint for 10% lines inside the window");
  assert(!note.some(t => t.startsWith("Thanh toán tiền mặt")), "no cash warning on credit purchase");

  // Legacy form without VAT column: one header rate, same result as before.
  const legacyRow = formRow({ ".item-qty": "1", ".item-price": "1.005", ".item-discount": "0" });
  c.registerDynamicFormTable({ tbodyId: "l-body", columns: [{ key: "qty", type: "quantity" }], totals: { taxRateId: "l-rate", totalId: "l-total" } });
  input("l-rate", "10"); input("l-total", "");
  elements["l-body"] = fakeElement({ id: "l-body", querySelectorAll: () => [legacyRow] });
  assert.deepStrictEqual({ ...c.recalculateDynamicFormTable("l-body") }, { subtotal: 1005, taxAmount: 101, total: 1106 });
  assert.strictEqual(elements["l-body-tax-note"], undefined, "no note on forms without per-line VAT");
});

test("cash-payment warning: purchases paid in cash (111) from the dated threshold incl. VAT", () => {
  const c = sandbox();
  assert.match(c.getCashPaymentVatWarning("111", 5000000, "2026-11-07"), /^Thanh toán tiền mặt từ 5\.000\.000đ: thuế GTGT không được khấu trừ.*NĐ 181\/2025 Đ26, NĐ 320\/2025 Đ9/);
  assert.strictEqual(c.getCashPaymentVatWarning("111", 4999999, "2026-11-07"), "");
  assert.strictEqual(c.getCashPaymentVatWarning("112", 9000000, "2026-11-07"), "");
  assert.strictEqual(c.getCashPaymentVatWarning("331", 9000000, "2026-11-07"), "");
  assert.strictEqual(c.getCashPaymentVatWarning("111", 19000000, "2025-06-30"), "", "old 20M threshold before 01/07/2025");
  assert.notStrictEqual(c.getCashPaymentVatWarning("111", 20000000, "2025-06-30"), "");
});

test("general_journal validation: accounts from the active chart, amount > 0", () => {
  const c = sandbox();
  assert.strictEqual(c.validateGeneralJournalEntries([{ debit: "642", credit: "3339", amount: 1000 }], "TT200"), "");
  assert.match(c.validateGeneralJournalEntries([], "TT200"), /ít nhất một dòng/);
  assert.match(c.validateGeneralJournalEntries([{ debit: "999", credit: "111", amount: 1 }], "TT200"), /Dòng 1: TK Nợ "999"/);
  assert.match(c.validateGeneralJournalEntries([{ debit: "642", credit: "111", amount: 1 }, { debit: "641", credit: "111", amount: 1 }], "TT133"), /Dòng 2: TK Nợ "641"/);
  assert.match(c.validateGeneralJournalEntries([{ debit: "642", credit: "111", amount: 0 }], "TT200"), /số tiền phải lớn hơn 0/);
});

function journalForm(c, rows) {
  input("gj-date", "2026-11-07");
  input("gj-desc", "Phân bổ chi phí");
  input("gj-id", "PKT1");
  selectorResults["#gj-rows tr"] = rows.map(r => {
    const cells = { ".gj-debit": r[0], ".gj-credit": r[1], ".gj-amount": r[2], ".gj-desc": r[3] || "" };
    return { querySelector: sel => ({ value: cells[sel] }) };
  });
  c.beginVoucherSubmit = () => true;
  c.endVoucherSubmit = () => {};
  c.setVoucherFormStatus = () => {};
  c.closeModal = () => {};
  c.filterCash = () => {};
  c.clientSessionId = "test";
  c.saveStateAndSyncVoucher = async () => true;
}

test("general_journal save blocks invalid rows and stores entries; edit replaces in place", async () => {
  const c = sandbox();
  journalForm(c, [["642", "999", "1.000"]]);
  await c.handleGeneralJournalSubmit({ preventDefault() {} });
  assert.strictEqual(c.state.vouchers.length, 0);
  assert.match(c.toasts.pop().message, /TK Có "999"/);

  journalForm(c, [["642", "242", "1.500.000", "Phân bổ CCDC"], ["6422", "111", "200.000"]]);
  await c.handleGeneralJournalSubmit({ preventDefault() {} });
  const v = c.state.vouchers.find(x => x.id === "PKT1");
  assert(v, "voucher saved");
  assert.strictEqual(v.type, "general_journal");
  assert.strictEqual(v.amount, 1700000);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.entries)), [
    { debit: "642", credit: "242", amount: 1500000, desc: "Phân bổ CCDC" },
    { debit: "6422", credit: "111", amount: 200000, desc: "Phân bổ chi phí" }
  ]);
  assert.strictEqual(c.toasts.pop().type, "success");

  c.openModal = () => {};
  input("datalist-gj-accounts", "");
  elements["gj-rows"] = fakeElement({ innerHTML: "" });
  c.addGeneralJournalRow = () => {};
  c.document.querySelector = () => null;
  c.editGeneralJournalVoucher("PKT1");
  journalForm(c, [["642", "242", "900.000"]]);
  await c.handleGeneralJournalSubmit({ preventDefault() {} });
  const edited = c.state.vouchers.filter(x => x.id === "PKT1");
  assert.strictEqual(edited.length, 1);
  assert.strictEqual(edited[0].amount, 900000);
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
  console.log(failed ? `${failed} voucher invoice test(s) failed` : `voucher invoice tests passed (${tests.length})`);
  process.exitCode = failed ? 1 : 0;
})();
