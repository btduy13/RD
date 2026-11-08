// Escape HTML khi in chứng từ, số lượng thập phân kiểu VN, chiết khấu chính xác, khớp mã hàng, quyền "Xem".
// Plain node + vm trên mã thật (cắt hàm từ file nguồn khi file cần DOM đầy đủ).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const slice = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end));

function sandbox(extra = {}) {
  const ctx = { console, setTimeout, clearTimeout, ...extra };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/utils.js"), ctx, { filename: "utils.js" });
  return ctx;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const PAYLOAD = `<img src=x onerror="alert(1)">`;

test("viewVoucher renders partner/description/product/note payloads inert", () => {
  const printArea = { innerHTML: "" };
  const ctx = sandbox({
    document: { getElementById: id => (id === "voucher-print-area" ? printArea : null) },
    requestAnimationFrame() {}, openModal() {}, syncVoucherPrintControls() {}, applyPrintScaleToVoucherRoot() {},
    findRelatedSalesVoucher: () => null, numberToVietnameseWords: () => "", renderRdBrandedHeader: () => "",
    formatVNDNoSymbol: n => String(n), formatVND: n => `${n}đ`
  });
  ctx.getPartnerNameForVoucher = v => v.partnerName;
  ctx.getPartnerForVoucher = () => ({ phone: PAYLOAD, address: PAYLOAD });
  const src = read("js/ui-framework.js");
  vm.runInContext(slice(src, "function voucherInvoiceInfoHtml", "window.viewVoucher = viewVoucher;"), ctx);
  const base = { date: "2026-11-08", partnerName: PAYLOAD, description: PAYLOAD, note: PAYLOAD, totalAmount: 100, amount: 100,
    items: [{ productId: "P1", itemDesc: PAYLOAD, qty: 1, price: 100 }], entries: [{ debit: "156", credit: "331", amount: 100, desc: PAYLOAD }] };
  ctx.state = { products: [{ id: "P1", name: PAYLOAD, unit: PAYLOAD }], companyName: PAYLOAD, vouchers: [] };
  ["purchase_order", "purchase", "purchase_return", "sales_return", "sales", "sales_quotation", "inventory_adjust", "receipt", "general_journal"].forEach((type, i) => {
    const id = `X${i}<b>`;
    ctx.state.vouchers.push({ ...base, id, type });
    printArea.innerHTML = "";
    ctx.viewVoucher(id);
    assert.ok(printArea.innerHTML, type);
    assert.ok(!printArea.innerHTML.includes("<img src=x"), `${type}: payload rendered as HTML`);
    assert.ok(!printArea.innerHTML.includes("<b>"), `${type}: voucher id rendered as HTML`);
  });
});

test("quantity input round-trips VN decimals (1,125 is 1.125, not 1125)", () => {
  const ctx = sandbox();
  const src = read("js/core/voucher-form-ui.js");
  vm.runInContext(slice(src, "function formatDynamicQuantity", "function parseDynamicMoney"), ctx);
  [1.125, 0.375, 1.5, 1234.5, 12].forEach(q => assert.strictEqual(ctx.parseDynamicQuantity(ctx.formatDynamicQuantity(q)), q, String(q)));
  assert.strictEqual(ctx.formatDynamicQuantity(1.125), "1,125");
  assert.strictEqual(ctx.parseDynamicQuantity("1234,5"), 1234.5);
  assert.strictEqual(ctx.parseDynamicQuantity("1.234,5"), 1234.5); // vi-VN toLocaleString
  assert.strictEqual(ctx.parseDynamicQuantity("1.234"), 1234);
  assert.strictEqual(ctx.parseDynamicQuantity("1.5"), 1.5);
});

test("imported discount keeps exact percent; net amount survives open/save; '2,5' is 2.5%", () => {
  const ctx = sandbox();
  const excel = read("js/excel-integration.js");
  vm.runInContext(slice(excel, "function importDiscountPercent", "function defaultImportedPaymentDebit"), ctx);
  const form = read("js/core/voucher-form-ui.js");
  vm.runInContext(slice(form, "function parseDynamicDiscount", "function validateDynamicVoucherLine"), ctx);
  vm.runInContext(slice(form, "function normalizeDynamicDiscountValue", "function formatDynamicMoney"), ctx);
  const discount = ctx.importDiscountPercent(1500, 100000);
  assert.strictEqual(discount, 1.5);
  const reopened = ctx.normalizeDynamicDiscountValue(discount, 1, 100000);
  assert.strictEqual(Math.round(1 * 100000 * (1 - reopened / 100)), 98500); // sales/purchase save formula
  assert.strictEqual(ctx.normalizeDynamicDiscountValue(1500, 1, 100000), 1.5); // legacy amount-in-discount rows
  assert.strictEqual(ctx.parseDynamicDiscount("2,5"), 2.5);
  assert.strictEqual(ctx.getVoucherLineNetAmount({ qty: 3, price: 33333, discount: 33.3333, amount: 66667 }), 66667);
  assert.strictEqual(ctx.getVoucherLineNetAmount({ qty: 1, price: 100000, discount: 1.5 }), 98500);
});

test("resolveProduct matches only exact code/name, never a substring", () => {
  const ctx = sandbox();
  ctx.state = { products: [{ id: "ONG21", name: "Ống nhựa 21" }, { id: "ONG2", name: "Ống 2" }] };
  vm.runInContext(slice(read("js/excel-integration.js"), "function resolveProduct", "function initExcelDragAndDrop"), ctx);
  assert.strictEqual(ctx.resolveProduct("ONG"), null);
  assert.strictEqual(ctx.resolveProduct("nhựa"), null);
  assert.strictEqual(ctx.resolveProduct("ong2").id, "ONG2");
  assert.strictEqual(ctx.resolveProduct("ống nhựa 21").id, "ONG21");
  assert.strictEqual(ctx.resolveProduct("Ống nhựa 21 (ONG21)").id, "ONG21");
});

test("viewer role cannot start a voucher save (button, Ctrl+S both go through beginVoucherSubmit)", () => {
  const ctx = sandbox({ document: { getElementById: () => null, readyState: "loading", addEventListener() {} }, showToast() {} });
  vm.runInContext(read("js/core/voucher-form-ui.js"), ctx, { filename: "voucher-form-ui.js" });
  ctx.currentUser = { role: "viewer" };
  assert.strictEqual(ctx.assertCanWriteRole(), false);
  assert.strictEqual(ctx.beginVoucherSubmit("modal-add-sales"), false);
  ctx.currentUser = { role: "accountant" };
  assert.strictEqual(ctx.assertCanWriteRole(), true);
  assert.match(read("js/ui-interactions.js"), /e\.preventDefault\(\);\s*if \(window\.assertCanWriteRole\?\.\(\) === false\) return;/, "Ctrl+S checks the role");
});

test("quick stock import books 331 to the walk-in supplier, not the first supplier", () => {
  const pushed = [];
  const ctx = sandbox({
    document: { getElementById: id => ({ "quick-import-prod-id": { value: "P1" }, "quick-import-qty": { value: "2" }, "quick-import-price": { value: "1.000" } }[id]) },
    saveState() {}, recalculateAccounting() {}, closeModal() {}, showToast() {}, renderInventoryTable() {},
    populateProductLedgerDropdown() {}, renderStockLedger() {}, clientSessionId: "s", generateUniqueInventoryVoucherId: () => "PNK-Q1"
  });
  ctx.state = { products: [{ id: "P1", name: "A" }], partners: [{ id: "NCC1", name: "NCC thật", type: "supplier" }], vouchers: { push: v => pushed.push(v) } };
  ctx.resolvePartner = name => (name === "Nhà cung cấp vãng lai" ? { id: "NCC_VL", name } : null);
  ctx.addErrorLog = (where, message) => { throw new Error(`${where}: ${message}`); };
  vm.runInContext(slice(read("js/core/voucher-form-ui.js"), "function parseDynamicQuantity", "function parseDynamicMoney"), ctx);
  vm.runInContext(slice(read("js/modules/inventory.js"), "function handleQuickImportSubmit", "function promptAdjustStock"), ctx);
  ctx.handleQuickImportSubmit({ preventDefault() {} });
  assert.strictEqual(pushed.length, 1);
  assert.strictEqual(pushed[0].partnerId, "NCC_VL");
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`ok - ${name}`); } catch (err) { failed++; console.error(`not ok - ${name}\n  ${err.stack}`); }
  }
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log(`${tests.length} passed`);
})();
