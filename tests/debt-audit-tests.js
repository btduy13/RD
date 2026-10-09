const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

// Loaders copied from tests/debt-tests.js (same vm-sandbox style, not imported).
function loadDebtModule() {
  const debtsSource = fs.readFileSync(path.join(repoRoot, "js", "modules", "debts.js"), "utf8");
  const sandbox = {
    console,
    Date,
    JSON,
    Number,
    Math,
    Array,
    Object,
    String,
    Set,
    Map,
    state: { partners: [], vouchers: [], partnerOpeningBalances: {} },
    document: {
      getElementById() { return null; },
      addEventListener() {}
    },
    window: {},
    formatVND: (v) => String(v),
    escapeHtmlAttr: (s) => s,
    matchAdvancedQuery: () => true,
    classifyPartnerCategory: () => "project",
    findRelatedSalesVoucher: () => null,
    openModal() {},
    closeModal() {},
    showToast() {},
    ensureRemainingDebt(v) {
      if (v.remainingDebt === undefined) {
        const totalAmt = v.totalAmount || v.amount || 0;
        v.remainingDebt = (v.paymentMethod === "131" || v.paymentMethod === "331") ? totalAmt : 0;
      }
    },
    XLSX: null
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "js", "core", "accounting-engine.js"), "utf8"), sandbox, { filename: "accounting-engine.js" });
  vm.runInContext(debtsSource, sandbox, { filename: "debts.js" });
  return sandbox;
}

function loadAccountingFifo() {
  const accountingSource = fs.readFileSync(path.join(repoRoot, "js", "accounting.js"), "utf8");
  const sandbox = {
    console,
    Date,
    JSON,
    Number,
    Math,
    Array,
    Object,
    String,
    state: {
      accountingStandard: "TT200",
      products: [],
      partners: [],
      vouchers: [],
      partnerOpeningBalances: {},
      initialBalances: {}
    },
    DEFAULT_DATA: { products: [], initialBalances: {} },
    saveState() {},
    refreshUI() {},
    cacheProductOptions() {},
    updateExcelHubUI() {},
    safeParseFloat: (v) => Number(v) || 0,
    getPartnerForVoucher: () => null,
    window: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "js", "core", "accounting-engine.js"), "utf8"), sandbox, { filename: "accounting-engine.js" });
  vm.runInContext(accountingSource, sandbox, { filename: "accounting.js" });
  return sandbox;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---- Task 1: không bịa dòng 131/331 khi chứng từ đã có bút toán thật ----

function testReceiptWithLoanEntriesDoesNotTouch131() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "NH01", name: "SACOMBANK", type: "retail" }];
  const loan = {
    id: "PT_VAY", type: "receipt", date: "2026-01-05", partnerId: "NH01",
    paymentMethod: "112", amount: 193000000,
    entries: [{ debit: "112", credit: "341", amount: 193000000 }]
  };
  ctx.state.vouchers = [loan];

  assert.deepStrictEqual(plain(ctx.getVoucherDebtEntries(loan)), [], "receipt Nợ 112/Có 341 has no 131/331 line");

  const row = ctx.calculatePartnerDebts().find(d => d.id === "NH01");
  assert.ok(row, "partner row exists");
  assert.equal(row.creditTrans, 0, "bank loan receipt is not a 131 collection");
  assert.equal(row.closingDebit, 0, "no receivable");
  assert.equal(row.closingCredit, 0, "no phantom overpayment (trả thừa)");

  const ledger = ctx.calculatePartnerDebtLedger(ctx.state.partners, "", "", "customer");
  assert.equal(ledger.closingVal, 0, "partner ledger agrees with overview");
  const extracted = ctx.extractLedgerAmountsFromVoucher(loan, "customer");
  assert.equal(extracted.debitAmount + extracted.creditAmount, 0, "ledger row not emitted");
}

function testPaymentWithSalaryEntriesDoesNotTouch331() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "NV01", name: "Nhân viên A", type: "supplier" }];
  const salary = {
    id: "PC6431", type: "payment", date: "2026-01-20", partnerId: "NV01",
    paymentMethod: "111", amount: 5000000, description: "chi thưởng tết",
    entries: [{ debit: "334", credit: "111", amount: 5000000 }]
  };
  ctx.state.vouchers = [salary];

  assert.deepStrictEqual(plain(ctx.getVoucherDebtEntries(salary)), [], "payment Nợ 334 has no 331 line");
  const row = ctx.calculatePartnerDebts().find(d => d.id === "NV01");
  assert.equal(row.debitTrans, 0, "salary payment is not a supplier payment");
  assert.equal(row.closingDebit, 0, "no phantom supplier receivable");
  assert.equal(row.closingCredit, 0);
}

function testOtherNonDebtCashVouchersIgnored() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "DT01", name: "Đối tác", type: "retail" }];
  const nonDebtDebits = ["211", "338", "333", "642", "635", "156"];
  ctx.state.vouchers = nonDebtDebits.map((acc, i) => ({
    id: `PC${i}`, type: "payment", date: "2026-02-01", partnerId: "DT01",
    paymentMethod: "111", amount: 1000,
    entries: [{ debit: acc, credit: "111", amount: 1000 }]
  }));
  ctx.state.vouchers.push({
    id: "PT_BANLE", type: "receipt", date: "2026-02-02", partnerId: "DT01",
    paymentMethod: "111", amount: 2000,
    entries: [{ debit: "111", credit: "511", amount: 2000 }]
  });
  ctx.state.vouchers.forEach(v => {
    assert.deepStrictEqual(plain(ctx.getVoucherDebtEntries(v)), [], `${v.id} contributes no debt line`);
  });
  const row = ctx.calculatePartnerDebts().find(d => d.id === "DT01");
  assert.equal(row.debitTrans + row.creditTrans, 0, "no debt movement from non-131/331 entries");
}

function testUnmatchedNonDebtVoucherNotCounted() {
  const ctx = loadDebtModule();
  ctx.state.partners = [];
  ctx.state.vouchers = [{
    id: "PT_VAY2", type: "receipt", date: "2026-01-05", partnerId: "SACOMBANK_ORPHAN",
    paymentMethod: "112", amount: 50000,
    entries: [{ debit: "112", credit: "341", amount: 50000 }]
  }];
  const unmatched = ctx.calculatePartnerDebts().find(d => d.id === "__UNMATCHED__");
  const total = unmatched ? unmatched.debitTrans + unmatched.creditTrans + unmatched.closingDebit + unmatched.closingCredit : 0;
  assert.equal(total, 0, "orphan loan receipt adds no debt to the unmatched bucket");
}

function testReceiptWithCredit131StillCounts() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
  ctx.state.vouchers = [
    {
      id: "HD1", type: "sales", date: "2026-01-01", partnerId: "KH01",
      entries: [{ debit: "131", credit: "511", amount: 1000000 }]
    },
    {
      id: "PT1", type: "receipt", date: "2026-01-10", partnerId: "KH01",
      paymentMethod: "112", amount: 400000,
      entries: [{ debit: "112", credit: "131", amount: 400000 }]
    }
  ];
  const row = ctx.calculatePartnerDebts().find(d => d.id === "KH01");
  assert.equal(row.creditTrans, 400000, "receipt Có 131 reduces receivable");
  assert.equal(row.closingDebit, 600000);
}

function testMixedEntriesReturnOnlyDebtLines() {
  const ctx = loadDebtModule();
  const v = {
    id: "PT_MIX", type: "receipt", date: "2026-01-10", partnerId: "KH01",
    paymentMethod: "112", amount: 700000,
    entries: [
      { debit: "112", credit: "131", amount: 400000 },
      { debit: "112", credit: "341", amount: 300000 }
    ]
  };
  assert.deepStrictEqual(plain(ctx.getVoucherDebtEntries(v)), [{ debit: "112", credit: "131", amount: 400000 }],
    "only the 131/331 lines are returned");
}

function testVoucherWithoutEntriesStillUsesFallback() {
  const ctx = loadDebtModule();
  ctx.state.partners = [
    { id: "KH01", name: "Khách A", type: "retail" },
    { id: "NCC01", name: "NCC A", type: "supplier" }
  ];
  const receiptNoEntries = {
    id: "PT_LEGACY", type: "receipt", date: "2026-01-10", partnerId: "KH01",
    paymentMethod: "111", amount: 300000
  };
  const paymentEmptyEntries = {
    id: "PC_LEGACY", type: "payment", date: "2026-01-10", partnerId: "NCC01",
    paymentMethod: "112", amount: 250000, entries: []
  };
  ctx.state.vouchers = [receiptNoEntries, paymentEmptyEntries];
  assert.deepStrictEqual(plain(ctx.getVoucherDebtEntries(receiptNoEntries)), [{ debit: "111", credit: "131", amount: 300000 }]);
  assert.deepStrictEqual(plain(ctx.getVoucherDebtEntries(paymentEmptyEntries)), [{ debit: "331", credit: "112", amount: 250000 }]);
  const debts = ctx.calculatePartnerDebts();
  assert.equal(debts.find(d => d.id === "KH01").creditTrans, 300000, "legacy receipt fallback still counts");
  assert.equal(debts.find(d => d.id === "NCC01").debitTrans, 250000, "legacy payment fallback still counts");
}

function testFifoMatchesDebtSummaryForLoanReceipt() {
  // accounting.js FIFO chỉ trừ hóa đơn theo dòng Có 131 thật trong entries,
  // nên phiếu thu Có 341 không được làm giảm remainingDebt — khớp tổng hợp công nợ.
  const fifo = loadAccountingFifo();
  fifo.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
  fifo.state.vouchers = [
    {
      id: "HD1", type: "sales", date: "2026-01-01", partnerId: "KH01", paymentMethod: "131",
      items: [{ productId: "P1", qty: 1, price: 1000000, amount: 1000000 }],
      taxRate: 0, isImported: false
    },
    {
      id: "PT_VAY", type: "receipt", date: "2026-01-10", partnerId: "KH01", amount: 400000,
      paymentMethod: "112", isImported: false,
      entries: [{ debit: "112", credit: "341", amount: 400000 }]
    }
  ];
  fifo.recalculateAccounting(false);
  const sale = fifo.state.vouchers.find(v => v.id === "HD1");
  assert.equal(sale.remainingDebt, 1000000, "loan receipt does not settle the invoice");

  const debtCtx = loadDebtModule();
  debtCtx.state.partners = fifo.state.partners;
  debtCtx.state.vouchers = plain(fifo.state.vouchers);
  const row = debtCtx.calculatePartnerDebts().find(d => d.id === "KH01");
  assert.equal(row.closingDebit, sale.remainingDebt, "debt summary equals FIFO remaining");
}

// ---- Task 2: nhập Excel không phân loại sai tài khoản, không bịa mã đối tác ----

// Real-source sandbox: utils.js + partner-identity.js + excel-integration.js,
// with XLSX / IPC / FileReader stubbed so the import functions read synthetic rows.
function loadImportSandbox(partners) {
  const sandbox = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, Intl, Promise, Uint8Array, ArrayBuffer,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout() {},
    state: {
      partners: partners || [],
      products: [],
      vouchers: [],
      partnerOpeningBalances: {},
      partnerOpeningBalanceTs: {}
    },
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    __rows: [],
    __lastReader: null,
    showToast() {},
    saveState() {},
    recalculateAccounting() {},
    formatVND: (v) => String(v),
    invalidatePartnerCache() {},
    normalizeProductId: (id) => String(id || "").trim().toUpperCase(),
    findProductIndexById: (id, list) => (list || []).findIndex(p => p.id === id)
  };
  sandbox.XLSX = {
    read: () => ({ SheetNames: ["S"], Sheets: { S: {} } }),
    utils: { sheet_to_json: () => sandbox.__rows }
  };
  sandbox.FileReader = class {
    readAsArrayBuffer() {
      sandbox.__lastReader = this.onload({ target: { result: new ArrayBuffer(8) } });
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ["js/utils.js", "js/core/partner-identity.js", "js/excel-integration.js"].forEach(rel => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, rel), "utf8"), sandbox, { filename: rel });
  });
  // utils.js defines the real IPC reader; replace it after loading.
  vm.runInContext("readExcelViaIPC = async () => new ArrayBuffer(8);", sandbox);
  return sandbox;
}

async function runManualImport(ctx, rows, type) {
  ctx.__rows = rows;
  ctx.parseExcelFile({ name: "x.xlsx" }, type);
  await ctx.__lastReader;
}

async function runAutoCashImport(ctx, rows) {
  ctx.__rows = rows;
  await ctx.autoIntegrateVouchersExcel();
}

// Cash rows (Thu__chi_tien layout): 0 date, 2 id, 3 description, 4 amount, 5 partner name, 8 type.
function cashRow(id, description, amount, partnerName, kind) {
  return ["2026-01-05", "", id, description, amount, partnerName, "", "", kind];
}
const CASH_HEADER = [["THU CHI TIỀN"], ["Ngày", "", "Số chứng từ"]];

function cashImportPartners() {
  return [
    { id: "BANLET05/2025(CH)", name: "Bán Lẻ T05/2025", type: "retail" },
    { id: "DT_1054", name: "Bán Lẻ T05/2025 - 229/2 Ba cu", type: "retail" },
    { id: "KHTHANH", name: "Chị thanh", type: "retail" },
    { id: "KHDUY", name: "Chị Duy", type: "retail" },
    { id: "NCCTHEP", name: "Công ty Thép Miền Nam", type: "supplier" },
    { id: "SACOMBANK", name: "Ngân hàng sacombank", type: "supplier" }
  ];
}

function importedVoucher(ctx, id) {
  const v = ctx.state.vouchers.find(x => x.id === id);
  assert.ok(v, `voucher ${id} imported`);
  return { v, e: v.entries[0] };
}

async function checkCashImportAccountMapping(runImport, label) {
  const ctx = loadImportSandbox(cashImportPartners());
  const partnerCount = ctx.state.partners.length;
  await runImport(ctx, CASH_HEADER.concat([
    cashRow("PT3713", "PT3713/q75 Chị thanh CK sacombank", 5000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT1", "Chị thanh CK sacomban", 1000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT2", "Nhận tiền vay ngân hàng Sacombank", 900000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT3", "Giải ngân khoản vay HĐ 01", 800000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT4", "Nhận nợ vay Việt Nga", 700000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT5", "Chị thanh trả tiền vay mượn", 300000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT7", "vay ngaan hàng sacombank 3 tháng", 300000000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT8", "thu vay sacomban TM", 99500000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT9", "Thu vay ngân hàng sombank 99 tr tm  147.385.877 ck lan thanh", 99000000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT10", "thu vay sacombank trả lan thanh", 1000000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT11", "Vay giải ngân thanh toán Hwta", 1000000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT12", "Thu vay ngân hàng trả lan thanh", 1000000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT13", "PT3765/q76 Em Huyền (KH7730T05/2025) CK sacombank", 1000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT14", "PT3735/q75 Anh Thạch thầu (KH7726T05/2025) sacombank", 1000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT15", "PT4011/q81 Anh Dương (KH7845T09/2025) ck sacombank xuất hđ r", 1000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT16", "Chị thanh xoay tiền hoàn thành", 1000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT17", "Thu tiền hàng", 1000000, "Ngân hàng sacombank", "PHIẾU THU"),
    cashRow("PT19", "Chị Duy trả tiền vay mượn", 2000000, "Chị Duy", "PHIẾU THU"),
    cashRow("PT18", "Doanh thu bán hàng vay", 1000000, "Chị thanh", "PHIẾU THU"),
    cashRow("PT6", "Thu tiền Việt Nga", 300000, "Chị thanh", "PHIẾU THU"),
    cashRow("PC6882", "Chi duy vay mua chung cư golsea", 1400000000, "Chị Duy", "PHIẾU CHI"),
    cashRow("PC1", "Thanh toán tiền hàng HĐ 12", 20000000, "Công ty Thép Miền Nam", "PHIẾU CHI"),
    cashRow("PC2", "Chi tiền cho người lạ", 150000, "Người Lạ Hoàn Toàn", "PHIẾU CHI"),
    cashRow("PC3", "Trả lương tháng 5", 7000000, "Chị Duy", "PHIẾU CHI"),
    cashRow("PC4", "Trả gốc vay sacombank", 50000000, "Chị Duy", "PHIẾU CHI")
  ]));

  // (a) tên ngân hàng chỉ là kênh chuyển khoản — vẫn Có 131
  assert.equal(importedVoucher(ctx, "PT3713").e.credit, "131", `${label}: "CK sacombank" receipt stays Có 131`);
  assert.equal(importedVoucher(ctx, "PT1").e.credit, "131", `${label}: "sacomban" alone stays Có 131`);
  assert.equal(importedVoucher(ctx, "PT5").e.credit, "131", `${label}: bare "vay" without bank word (customer repays loan to us) stays Có 131`);
  ["PT13", "PT14", "PT15", "PT16", "PT19"].forEach(pid =>
    assert.equal(importedVoucher(ctx, pid).e.credit, "131", `${label}: ${pid} customer/CK or "xoay" stays Có 131`));
  assert.equal(importedVoucher(ctx, "PT18").e.credit, "511", `${label}: doanh thu keeps precedence over vay`);
  assert.equal(importedVoucher(ctx, "PT6").e.credit, "131", `${label}: "việt nga" alone stays Có 131`);
  // cụm vay rõ ràng → Có 341
  assert.equal(importedVoucher(ctx, "PT2").e.credit, "341", `${label}: "vay ngân hàng" → Có 341`);
  assert.equal(importedVoucher(ctx, "PT3").e.credit, "341", `${label}: "giải ngân" → Có 341`);
  assert.equal(importedVoucher(ctx, "PT4").e.credit, "341", `${label}: "nhận nợ vay" → Có 341`);
  ["PT7", "PT8", "PT9", "PT10", "PT11", "PT12"].forEach(pid =>
    assert.equal(importedVoucher(ctx, pid).e.credit, "341", `${label}: ${pid} real loan receipt → Có 341`));
  assert.equal(importedVoucher(ctx, "PT17").e.credit, "341", `${label}: receipt from bank partner (no "vay") → Có 341`);

  // (b) phiếu chi không khớp từ khóa: 331 chỉ khi đối tác là NCC
  const pc6882 = importedVoucher(ctx, "PC6882");
  assert.equal(pc6882.e.debit, "1388", `${label}: non-supplier unknown payment → Nợ 1388`);
  assert.equal(pc6882.v.needsReview, true, `${label}: 1388 fallback flagged needsReview`);
  assert.equal(pc6882.v.partnerId, "KHDUY");
  const pc1 = importedVoucher(ctx, "PC1");
  assert.equal(pc1.e.debit, "331", `${label}: supplier payment keeps Nợ 331`);
  assert.ok(!pc1.v.needsReview, `${label}: resolved supplier payment not flagged`);
  const pc2 = importedVoucher(ctx, "PC2");
  assert.equal(pc2.e.debit, "1388", `${label}: unresolved-partner payment → Nợ 1388`);
  assert.equal(pc2.v.needsReview, true);
  assert.equal(pc2.v.partnerId, "", `${label}: unresolved partner left empty`);
  assert.equal(pc2.v.partnerName, "Người Lạ Hoàn Toàn", `${label}: file partner name kept`);
  // từ khóa cũ vẫn giữ
  assert.equal(importedVoucher(ctx, "PC3").e.debit, "334", `${label}: salary keyword kept`);
  assert.ok(!importedVoucher(ctx, "PC3").v.needsReview);
  assert.equal(importedVoucher(ctx, "PC4").e.debit, "341", `${label}: loan repayment keyword kept`);

  // (c) không tạo đối tác mới
  assert.equal(ctx.state.partners.length, partnerCount, `${label}: import must not create partners`);
}

async function testCashImportAccountMappingAuto() {
  await checkCashImportAccountMapping(runAutoCashImport, "auto");
}

async function testCashImportAccountMappingManual() {
  await checkCashImportAccountMapping((ctx, rows) => runManualImport(ctx, rows, "vouchers"), "manual");
}

function resolutionPartners() {
  return [
    { id: "BANLET05/2025(CH)", name: "Bán Lẻ T05/2025", type: "retail" },
    { id: "DT_1054", name: "Bán Lẻ T05/2025 - 229/2 Ba cu", type: "retail" },
    { id: "108/2TRANPHU(CH)", name: "108/2 Trần Phú", type: "retail" },
    { id: "KL_ANHLUC", name: "Anh Lực", type: "retail" },
    { id: "X1", name: "Trùng Tên Đối Tác", type: "retail" },
    { id: "X2", name: "trùng tên đối tác", type: "retail" },
    { id: "AB", name: "An Bình", type: "retail" },
    { id: "BANLE", name: "Bán Lẻ", type: "retail" },
    { id: "BANLET05", name: "Bán Lẻ T05", type: "retail" },
    { id: "DT_9999", name: "Khách Chỉ Có Mã DT", type: "retail" },
    { id: "DT_VANGLAI", name: "Khách hàng vãng lai", type: "retail" },
    { id: "AUTO_PN01", name: "Khách Mã Auto", type: "retail" },
    { id: "KGX01", name: "Công ty Không Gian Xanh", type: "enterprise" }
  ];
}

async function testImportPartnerMatchingRules() {
  const cases = [
    // [file partner name, expected partnerId ("" = unresolved)]
    ["Bán Lẻ T05/2025 - 229/2 Ba cu", "BANLET05/2025(CH)"], // DT_ twin ignored → longest real prefix
    ["  bán lẻ t05/2025 ", "BANLET05/2025(CH)"],             // trimmed, case-insensitive
    ["BAN LE T05/2025", "BANLET05/2025(CH)"],                // accent-insensitive
    ["Bán Lẻ T05/2025(CT A)", "BANLET05/2025(CH)"],          // "(" boundary
    ["Bán Lẻ T05/2025-Q7", "BANLET05/2025(CH)"],             // "-" boundary
    ["Bán Lẻ T05 khu A", "BANLET05"],                        // longest real prefix wins over "Bán Lẻ"
    ["Bán Lẻ T05/20256", ""],                                // no word boundary after a real name
    ["108/2 Trần Phú (anh Tâm)", "108/2TRANPHU(CH)"],
    ["Anh Lực", ""],                                         // only an auto-generated KL_ match → unresolved
    ["Khách Chỉ Có Mã DT", ""],                              // only DT_<số> → unresolved
    ["Khách Mã Auto", ""],                                   // only AUTO_ → unresolved
    ["Khách hàng vãng lai", "DT_VANGLAI"],                   // fixed named DT_ code stays eligible
    ["Green Home", "KGX01"],                                 // brand alias (findPartnerByIdentity)
    ["Trùng Tên Đối Tác", ""],                               // two real exact matches → unresolved
    ["An Bình 2", ""],                                       // prefix shorter than 8 chars
    ["Bán Lẻ khác", ""]                                      // "ban le" shorter than 8 chars
  ];
  const rows = CASH_HEADER.concat(cases.map(([name], i) => cashRow(`PT9${i}`, "Thu tiền hàng", 1000, name, "PHIẾU THU")));
  const ctx = loadImportSandbox(resolutionPartners());
  const before = ctx.state.partners.length;
  await runAutoCashImport(ctx, rows);
  cases.forEach(([name, expected], i) => {
    const v = ctx.state.vouchers.find(x => x.id === `PT9${i}`);
    assert.equal(v.partnerId, expected, `partner "${name}" resolves to "${expected}"`);
    assert.equal(v.partnerName, name.trim(), `file partner name kept for "${name}"`);
    if (expected) assert.ok(!v.needsReview, `resolved "${name}" not flagged`);
    else assert.equal(v.needsReview, true, `unresolved "${name}" flagged needsReview`);
  });
  assert.equal(ctx.state.partners.length, before, "matching never creates partners");
}

async function testSalesImportsDoNotCreatePartners() {
  // Ban_hang layout: 2 id, 6 partner name, 8..11 amounts, 14 doc type.
  const salesRow = (id, name) => ["2026-01-05", "", id, "", "", "", name, "Bán hàng", 1000, 0, 0, 1000, "", "", ""];
  const ctx = loadImportSandbox(resolutionPartners());
  const before = ctx.state.partners.length;
  ctx.__rows = [["BÁN HÀNG"], ["hdr"], salesRow("BH1", "Bán Lẻ T05/2025 - 12 Lê Lợi"), salesRow("BH2", "Khách Mới Toanh")];
  await ctx.autoIntegrateSalesExcel();
  assert.equal(ctx.state.vouchers.find(v => v.id === "BH1").partnerId, "BANLET05/2025(CH)");
  const bh2 = ctx.state.vouchers.find(v => v.id === "BH2");
  assert.equal(bh2.partnerId, "");
  assert.equal(bh2.needsReview, true);
  assert.equal(bh2.partnerName, "Khách Mới Toanh");

  // SO_CHI_TIET_BAN_HANG layout: 2 id, 5 desc, 7 partner code, 8 partner name, 9 product, 12 qty, 13 price.
  const detailRow = (id, code, name) => ["", "2026-01-05", id, "", "", "Bán hàng", "", code, name, "SP1", "Sản phẩm 1", "Cái", 1, 1000, 0, 0];
  ctx.__rows = [["SỔ"], ["x"], ["hdr"],
    detailRow("BH3", "", "108/2 Trần Phú - giao Q1"),
    detailRow("BH4", "MA_KHONG_CO", "Ai Đó Không Có"),
    detailRow("BH5", "AB", "Tên khác"),
    detailRow("BH6", "ab", "Tên khác nữa")];
  await ctx.autoIntegrateSoChiTietBanHangExcel();
  assert.equal(ctx.state.vouchers.find(v => v.id === "BH3").partnerId, "108/2TRANPHU(CH)", "blank code → name match");
  const bh4 = ctx.state.vouchers.find(v => v.id === "BH4");
  assert.equal(bh4.partnerId, "", "unknown code + unknown name → unresolved");
  assert.equal(bh4.needsReview, true);
  assert.equal(ctx.state.vouchers.find(v => v.id === "BH5").partnerId, "AB", "existing partner code in file is used");
  assert.equal(ctx.state.vouchers.find(v => v.id === "BH6").partnerId, "AB", "partner code lookup is case-insensitive");
  assert.equal(ctx.state.partners.length, before, "sales imports never create partners");
}

async function testCongNoPhaiTraImportDoesNotCreatePartners() {
  const ctx = loadImportSandbox(resolutionPartners().concat([{ id: "NCCTHEP", name: "Công ty Thép Miền Nam", type: "supplier" }]));
  ctx.state.vouchers.push({ id: "NK_OLD", type: "purchase", partnerId: "NCCTHEP", partnerName: "Công ty Thép Miền Nam", amount: 1 });
  const before = ctx.state.partners.length;
  await runManualImport(ctx, [
    ["CHI TIẾT CÔNG NỢ PHẢI TRẢ THEO HÓA ĐƠN"], [""], [""],
    ["Tên nhà cung cấp : Công ty Thép Miền Nam (2 )"],
    ["", "", "2026-01-05", "NK1", "HD1", "Nhập thép", "", 5000],
    ["Tên nhà cung cấp : Nhà Cung Cấp Lạ"],
    ["", "", "2026-01-06", "NK2", "HD2", "Nhập cát", "", 7000],
    ["", "", "2026-01-06", "NK_OLD", "HD3", "Cập nhật", "", 7000]
  ], "purchase");
  assert.equal(ctx.state.vouchers.find(v => v.id === "NK1").partnerId, "NCCTHEP");
  const nk2 = ctx.state.vouchers.find(v => v.id === "NK2");
  assert.equal(nk2.partnerId, "");
  assert.equal(nk2.partnerName, "Nhà Cung Cấp Lạ");
  assert.equal(nk2.needsReview, true);
  assert.equal(ctx.state.vouchers.find(v => v.id === "NK_OLD").partnerId, "NCCTHEP", "unresolved name must not wipe an existing voucher's partner");
  assert.equal(ctx.state.partners.length, before, "công nợ phải trả import never creates partners");
}

async function testReimportKeepsExistingPartnerAssignment() {
  // Cash path: chứng từ đã được kế toán gán đối tác; nạp lại với tên không khớp không được xóa.
  const ctx = loadImportSandbox(cashImportPartners());
  ctx.state.vouchers.push(
    { id: "PT77", type: "receipt", partnerId: "KHTHANH", partnerName: "Chị thanh", amount: 1, entries: [] },
    { id: "PC77", type: "payment", partnerId: "NCCTHEP", partnerName: "Công ty Thép Miền Nam", amount: 1, entries: [] }
  );
  // (auto loader bỏ qua khi đã có phiếu thu/chi, nên dùng luồng nạp thủ công)
  await runManualImport(ctx, CASH_HEADER.concat([
    cashRow("PT77", "Thu tiền", 1000, "Tên Lạ Không Khớp", "PHIẾU THU"),
    cashRow("PC77", "Chi tiền", 2000, "Tên Lạ Khác", "PHIẾU CHI")
  ]), "vouchers");
  const pt = importedVoucher(ctx, "PT77");
  assert.equal(pt.v.partnerId, "KHTHANH", "cash re-import keeps assigned partner");
  assert.equal(pt.v.partnerName, "Chị thanh");
  assert.ok(!pt.v.needsReview, "kept partner not flagged");
  const pc = importedVoucher(ctx, "PC77");
  assert.equal(pc.v.partnerId, "NCCTHEP", "cash payment re-import keeps assigned supplier");
  assert.equal(pc.e.debit, "331", "kept supplier drives Nợ 331 default");
  assert.ok(!pc.v.needsReview);

  // Sales path (Ban_hang)
  const salesRow = (id, name) => ["2026-01-05", "", id, "", "", "", name, "Bán hàng", 1000, 0, 0, 1000, "", "", ""];
  const sctx = loadImportSandbox(resolutionPartners());
  sctx.state.vouchers.push({ id: "BH77", type: "sales", partnerId: "AB", partnerName: "An Bình", amount: 1 });
  sctx.__rows = [["BÁN HÀNG"], ["hdr"], salesRow("BH77", "Tên Lạ Không Khớp")];
  await sctx.autoIntegrateSalesExcel();
  const bh = sctx.state.vouchers.find(v => v.id === "BH77");
  assert.equal(bh.partnerId, "AB", "sales re-import keeps assigned partner");
  assert.equal(bh.partnerName, "An Bình");
  assert.ok(!bh.needsReview);
  assert.equal(bh.amount, 1000, "rest of the voucher is still re-imported");
}

function testImportSourceHasNoInventedPartnerCodes() {
  const src = fs.readFileSync(path.join(repoRoot, "js", "excel-integration.js"), "utf8");
  assert.ok(!/Math\.random\(\)\s*\*\s*9000/.test(src), "no random DT_ partner codes");
  assert.ok(!/AUTO_\$\{/.test(src), "no AUTO_<voucher> partner codes");
}

function testReportAccountsName1388BothStandards() {
  const src = fs.readFileSync(path.join(repoRoot, "js", "modules", "reports.js"), "utf8");
  ["TT133", "TT200"].forEach(std => {
    const sandbox = {
      console, Map, Set, String, Object, Array, Number, JSON, Date, Math,
      state: { accountingStandard: std, vouchers: [], initialBalances: {} },
      document: { getElementById() { return null; }, addEventListener() {}, querySelectorAll() { return []; } },
      window: {}
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: "reports.js" });
    const acc = sandbox.getReportAccounts().find(a => a.code === "1388");
    assert.ok(acc && acc.name === "Phải thu khác", `${std}: 1388 named "Phải thu khác"`);
  });
}

// ---- Task 4: hộp "Kiểm toán T-tài khoản 131" đối chiếu với Sổ cái thật ----

// debts.js + accounting.js (getAccountBalance — hàm Sổ cái dùng chung) trong cùng sandbox.
function loadDebtWithLedger() {
  const ctx = loadDebtModule();
  Object.assign(ctx, {
    DEFAULT_DATA: { products: [], initialBalances: {} },
    saveState() {},
    refreshUI() {},
    cacheProductOptions() {},
    updateExcelHubUI() {},
    safeParseFloat: (v) => Number(v) || 0
  });
  ctx.state.accountingStandard = "TT200";
  ctx.state.products = [];
  ctx.state.initialBalances = {};
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "js", "accounting.js"), "utf8"), ctx, { filename: "accounting.js" });
  const elements = new Map();
  ctx.document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", value: "", style: {} });
    return elements.get(id);
  };
  return ctx;
}

function renderAudit(ctx, range) {
  ctx.renderDebtOverview(ctx.calculatePartnerDebts(range ? range.fromDate : "", range ? range.toDate : ""), range);
  return ctx.document.getElementById("debt-audit-content").innerHTML;
}

function baseLedgerFixture(ctx) {
  ctx.state.partners = [{ id: "KH01", name: "Khách 01", type: "retail" }];
  ctx.state.partnerOpeningBalances = { KH01: { debit: 500, credit: 0 } };
  ctx.state.initialBalances = { "131": { name: "Phải thu của khách hàng", type: "debit", balance: 500 } };
  ctx.state.vouchers = [
    { id: "BH1", type: "sales", date: "2026-01-10", partnerId: "KH01",
      entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "PT1", type: "receipt", date: "2026-02-10", partnerId: "KH01",
      entries: [{ debit: "111", credit: "131", amount: 300 }] }
  ];
}

function testAudit131MatchesLedger() {
  const ctx = loadDebtWithLedger();
  baseLedgerFixture(ctx);
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(), "", "");
  assert.equal(rec.ledgerClose, ctx.getAccountBalance("131"), "ledger figure comes from getAccountBalance");
  assert.equal(rec.ledgerClose, 1200);
  assert.equal(rec.detailClose, 1200);
  assert.equal(rec.closeMatched, true);
  const html = renderAudit(ctx);
  assert.ok(html.includes("Sổ cái TK 131"), "ledger line shown");
  assert.ok(html.includes("Công nợ chi tiết (Σ 131)"), "detail line shown");
  assert.ok(/debt-audit-match-badge">Khớp</.test(html), "Khớp when ledger == detail");
  assert.ok(!html.includes("Lệch"), "no Lệch badge when everything agrees");
}

function testAudit131FlagsLedgerOnlyEntry() {
  const ctx = loadDebtWithLedger();
  baseLedgerFixture(ctx);
  // Bút toán 131 không gắn đối tác (phiếu kế toán tổng hợp) — Sổ cái có, công nợ chi tiết không có
  ctx.state.vouchers.push({ id: "PKT1", type: "general", date: "2026-03-01",
    entries: [{ debit: "131", credit: "711", amount: 250 }] });
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(), "", "");
  assert.equal(rec.ledgerClose, 1450);
  assert.equal(rec.detailClose, 1200);
  assert.equal(rec.closeDiff, 250);
  assert.equal(rec.closeMatched, false);
  const html = renderAudit(ctx);
  assert.ok(/debt-audit-match-badge">Lệch 250</.test(html), "Lệch badge carries the 250 difference");
}

function testAudit131FlagsOpeningMismatch() {
  const ctx = loadDebtWithLedger();
  baseLedgerFixture(ctx);
  // Số dư đầu kỳ Sổ cái 700 nhưng tổng đầu kỳ đối tác (phía 131) chỉ 500 (vd. đối tác đã bị xóa)
  ctx.state.initialBalances["131"].balance = 700;
  ctx.state.partnerOpeningBalances.DA_XOA = { debit: 200, credit: 0 };
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(), "", "");
  assert.equal(rec.initialLedgerOpening, 700);
  assert.equal(rec.partnerOpeningSum, 500, "orphan opening is not part of Σ partner opening");
  assert.equal(rec.initialOpeningDiff, 200);
  assert.equal(rec.closeDiff, 200, "opening gap flows into the closing difference");
  const html = renderAudit(ctx);
  assert.ok(html.includes("Số dư đầu kỳ khai báo trên Sổ cái TK 131"), "opening comparison shown");
  assert.ok(html.includes("Σ số dư đầu kỳ đối tác (phía 131)"));
  assert.ok(/debt-audit-match-badge">Lệch 200</.test(html), "closing Lệch 200");
  assert.ok(/Lệch đầu kỳ 200/.test(html), "opening mismatch badge with amount");
}

function testAudit131RefundBridgeEqualsKpiNet() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [{ id: "KH02", name: "Khách 02", type: "retail" }];
  ctx.state.partnerOpeningBalances = {};
  ctx.state.initialBalances = { "131": { type: "debit", balance: 0 }, "331": { type: "credit", balance: 0 } };
  ctx.state.vouchers = [
    { id: "BH2", type: "sales", date: "2026-01-10", partnerId: "KH02",
      entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    // Phiếu chi cho khách hạch toán Nợ 331 (dữ liệu cũ) — Task 5: đọc là Nợ 131 theo chuẩn
    { id: "PC2", type: "payment", date: "2026-01-20", partnerId: "KH02",
      entries: [{ debit: "331", credit: "111", amount: 200 }] }
  ];
  const debts = ctx.calculatePartnerDebts();
  const rec = ctx.computeDebt131Reconciliation(debts, "", "");
  assert.equal(rec.ledgerClose, 1000);
  assert.equal(rec.detailClose, 1000, "Σ net131 uses 131 lines only");
  assert.equal(rec.closeMatched, true);
  assert.equal(rec.refund331Adj, 200, "Nợ 331 payment to a customer read as Nợ 131 (increases receivable)");
  assert.equal(rec.other331Adj, 0);
  assert.equal(rec.kpiNet, 1200);
  assert.equal(rec.detailClose + rec.refund331Adj + rec.other331Adj, rec.kpiNet, "bridge reconciles to KPI net");
  const row = debts.find(d => d.id === "KH02");
  assert.equal(row.closingDebit - row.closingCredit, 1200, "payment to customer increases the receivable (Task 5)");
  const html = renderAudit(ctx);
  assert.ok(html.includes("Phiếu chi cho khách hạch toán Nợ 331 (đọc là Nợ 131 theo chuẩn)"), "bridge line shown");
  assert.ok(/debt-audit-match-badge">Khớp</.test(html));
}

function testAudit131RespectsPeriodFilter() {
  const ctx = loadDebtWithLedger();
  baseLedgerFixture(ctx);
  ctx.state.vouchers.push({ id: "BH-SAU", type: "sales", date: "2026-05-01", partnerId: "KH01",
    entries: [{ debit: "131", credit: "511", amount: 999 }] });
  const range = { fromDate: "2026-02-01", toDate: "2026-02-28" };
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(range.fromDate, range.toDate), range.fromDate, range.toDate);
  assert.equal(rec.ledgerOpen, ctx.getAccountBalance("131", "2026-01-31"), "ledger opening = balance up to the day before fromDate");
  assert.equal(rec.ledgerOpen, 1500);
  assert.equal(rec.detailOpen, 1500);
  assert.equal(rec.ledgerClose, ctx.getAccountBalance("131", "2026-02-28"));
  assert.equal(rec.ledgerClose, 1200, "voucher after toDate excluded");
  assert.equal(rec.detailClose, 1200);
  assert.equal(rec.closeMatched, true);
  const html = renderAudit(ctx, range);
  assert.ok(/debt-audit-match-badge">Khớp</.test(html));
  assert.ok(html.includes("Sổ cái TK 131 đầu kỳ"), "period opening comparison shown when filtered");
}

function testAudit131CreditNatureInitialBalance() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [{ id: "KH03", name: "Khách trả trước", type: "retail" }];
  ctx.state.partnerOpeningBalances = { KH03: { debit: 0, credit: 400 } };
  ctx.state.initialBalances = { "131": { type: "credit", balance: 400 } };
  ctx.state.vouchers = [{ id: "BH3", type: "sales", date: "2026-01-10", partnerId: "KH03",
    entries: [{ debit: "131", credit: "511", amount: 100 }] }];
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(), "", "");
  assert.equal(rec.initialLedgerOpening, -400, "credit-nature opening is negative (Nợ − Có)");
  assert.equal(rec.partnerOpeningSum, -400);
  assert.equal(rec.ledgerClose, -300);
  assert.equal(rec.detailClose, -300);
  assert.equal(rec.closeMatched, true);
}

function testAuditEscapesOrphanPartnerIds() {
  const ctx = loadDebtWithLedger();
  ctx.escapeHtmlAttr = (s) => String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  ctx.state.partners = [];
  ctx.state.initialBalances = {};
  ctx.state.vouchers = [{ id: "BH4", type: "sales", date: "2026-01-10", partnerId: "<img src=x>",
    entries: [{ debit: "131", credit: "511", amount: 100 }] }];
  const html = renderAudit(ctx);
  assert.ok(!html.includes("<img src=x>"), "orphan partner id is escaped");
  assert.ok(html.includes("&lt;img src=x&gt;"));
}

// ---- Final fix wave ----

// F1: phiếu thu/chi có đối tác nhưng không có dòng 131/331 phải hiện trong hộp kiểm toán
function testAuditFlagsPartnerCashWithoutDebtLines() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [
    { id: "KH01", name: "Khách <b>01</b>", type: "retail" },
    { id: "NV01", name: "Nhân viên A", type: "supplier" }
  ];
  ctx.state.initialBalances = {};
  ctx.state.vouchers = [
    // Thu tiền khách nhưng hạch toán Có 341 (vay) — không chạm 131
    { id: "PT_341", type: "receipt", date: "2026-03-05", partnerId: "KH01", paymentMethod: "112", amount: 2000,
      entries: [{ debit: "112", credit: "341", amount: 2000 }] },
    // Chi lương cho đối tác — Nợ 334, không chạm 331
    { id: "PC_334", type: "payment", date: "2026-03-06", partnerId: "NV01", paymentMethod: "111", amount: 1500,
      entries: [{ debit: "334", credit: "111", amount: 1500 }] },
    // Không tính: thu nợ thật Có 131
    { id: "PT_131", type: "receipt", date: "2026-03-07", partnerId: "KH01", paymentMethod: "111", amount: 700,
      entries: [{ debit: "111", credit: "131", amount: 700 }] },
    // Không tính: không có đối tác
    { id: "PT_NOP", type: "receipt", date: "2026-03-08", partnerId: "", paymentMethod: "111", amount: 900,
      entries: [{ debit: "111", credit: "711", amount: 900 }] },
    // Ngoài kỳ lọc
    { id: "PT_511", type: "receipt", date: "2026-05-01", partnerId: "KH01", paymentMethod: "111", amount: 300,
      entries: [{ debit: "111", credit: "511", amount: 300 }] }
  ];

  const range = { fromDate: "2026-03-01", toDate: "2026-03-31" };
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(range.fromDate, range.toDate), range.fromDate, range.toDate);
  const diag = plain(rec.partnerCashWithoutDebt);
  assert.equal(diag.count, 2, "one receipt + one payment flagged");
  assert.equal(diag.total, 3500);
  assert.equal(diag.receipts.count, 1);
  assert.equal(diag.receipts.total, 2000);
  assert.deepStrictEqual(diag.receipts.accounts, { "341": 2000 }, "receipt credit accounts listed");
  assert.equal(diag.payments.count, 1);
  assert.equal(diag.payments.total, 1500);
  assert.deepStrictEqual(diag.payments.accounts, { "334": 1500 }, "payment debit accounts listed");
  assert.deepStrictEqual(diag.rows.map(r => r.id), ["PT_341", "PC_334"]);

  // Không lọc ngày: phiếu Có 511 ngoài kỳ cũng được đếm
  const recAll = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(), "", "");
  assert.equal(recAll.partnerCashWithoutDebt.count, 3, "date filter respected");
  assert.equal(recAll.partnerCashWithoutDebt.receipts.accounts["511"], 300);

  const html = renderAudit(ctx, range);
  assert.ok(html.includes("Phiếu thu/chi có đối tác nhưng không hạch toán 131/331"), "diagnostic line shown");
  assert.ok(html.includes("PT_341") && html.includes("PC_334"), "list rows rendered");
  assert.ok(!html.includes("PT_511"), "list respects date filter");
  assert.ok(!html.includes("Khách <b>01</b>") && html.includes("Khách &lt;b&gt;01&lt;/b&gt;"), "partner name escaped");
}

// F2: cash.js trong vm sandbox (cùng cách tests/cash-table-totals-tests.js nạp cash.js),
// thêm stub DOM/form tối thiểu để chạy handler lưu phiếu và bộ lọc danh sách.
function loadCashModule(partners) {
  const elements = new Map();
  const getEl = id => {
    if (!elements.has(id)) elements.set(id, { id, value: "", innerHTML: "", innerText: "", style: {}, reset() {} });
    return elements.get(id);
  };
  const sandbox = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, Promise,
    state: { partners: partners || [], vouchers: [], accountingStandard: "TT200" },
    document: { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [] },
    clientSessionId: "test-session",
    itemsPerPage: 50,
    beginVoucherSubmit: () => true,
    endVoucherSubmit() {},
    setVoucherFormStatus() {},
    recalculateAccounting() {},
    saveStateAndSyncVoucher: async () => true,
    openModal() {}, closeModal() {}, showToast() {},
    formatVND: v => String(v),
    getLocalDateString: () => "2026-01-01",
    matchAdvancedQuery: () => true,
    getPartnerNameForVoucher: v => v.partnerName || "",
    getPartnerForVoucher: v => (sandbox.state.partners || []).find(p => p.id === v.partnerId) || null,
    resolvePartner: val => {
      const m = /\(([^)]+)\)\s*$/.exec(String(val || ""));
      const p = (sandbox.state.partners || []).find(x => x.id === (m ? m[1] : val));
      return p ? { id: p.id, name: p.name } : { id: "", name: String(val || "") };
    }
  };
  sandbox.window = sandbox;
  sandbox.getComputedStyle = () => ({ display: "block" });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "js", "modules", "cash.js"), "utf8"), sandbox, { filename: "cash.js" });
  sandbox.renderCashTable = () => {};
  sandbox.recalculateCashKpis = () => {};
  return { ctx: sandbox, getEl };
}

async function testCashSaveClearsNeedsReview() {
  const { ctx } = loadCashModule([{ id: "NV01", name: "Nhân viên A", type: "supplier" }]);
  ctx.state.vouchers = [
    { id: "PC100", type: "payment", date: "2026-02-01", partnerId: "NV01", partnerName: "Nhân viên A",
      paymentMethod: "111", amount: 1000, description: "chi khác", isImported: true, needsReview: true,
      entries: [{ debit: "1388", credit: "111", amount: 1000 }] },
    { id: "PT100", type: "receipt", date: "2026-02-02", partnerId: "NV01", partnerName: "Nhân viên A",
      paymentMethod: "112", amount: 2000, description: "thu", isImported: true, needsReview: true,
      entries: [{ debit: "112", credit: "341", amount: 2000 }] }
  ];
  ctx.editPaymentVoucher("PC100");
  await ctx.handlePaymentSubmit({ preventDefault() {} });
  const pc = ctx.state.vouchers.find(v => v.id === "PC100");
  assert.equal(pc.isManual, true, "payment was saved through the edit form");
  assert.equal(pc.isImported, true, "other fields of the old voucher are kept");
  assert.ok(!("needsReview" in pc), "manual save clears needsReview (payment)");

  ctx.editReceiptVoucher("PT100");
  await ctx.handleReceiptSubmit({ preventDefault() {} });
  const pt = ctx.state.vouchers.find(v => v.id === "PT100");
  assert.equal(pt.isManual, true, "receipt was saved through the edit form");
  assert.ok(!("needsReview" in pt), "manual save clears needsReview (receipt)");
}

function testCashNeedsReviewFilter() {
  const { ctx, getEl } = loadCashModule([]);
  ctx.state.vouchers = [
    { id: "PC1", type: "payment", date: "2026-02-01", amount: 10, needsReview: true },
    { id: "PC2", type: "payment", date: "2026-02-01", amount: 20 },
    { id: "PT1", type: "receipt", date: "2026-02-01", amount: 30, needsReview: true },
    { id: "PT2", type: "receipt", date: "2026-02-01", amount: 40, needsReview: false },
    { id: "BH1", type: "sales", date: "2026-02-01", amount: 50, needsReview: true }
  ];
  getEl("cash-type-filter").value = "needsReview";
  getEl("cash-method-filter").value = "all";
  ctx.filterCash();
  const ids = vm.runInContext("filteredCashList", ctx).map(v => v.id).sort();
  assert.deepStrictEqual(ids, ["PC1", "PT1"], "filter shows only cash vouchers flagged needsReview");
  getEl("cash-type-filter").value = "all";
  ctx.filterCash();
  assert.equal(vm.runInContext("filteredCashList", ctx).length, 4, "default filter unchanged");
}

async function testSupplierRematchClearsNeedsReview() {
  const ctx = loadImportSandbox(resolutionPartners().concat([{ id: "NCCTHEP", name: "Công ty Thép Miền Nam", type: "supplier" }]));
  ctx.state.vouchers.push(
    // Lần nạp trước: tên NCC không khớp → để trống mã, cần rà soát
    { id: "NK_REV", type: "purchase", partnerId: "", partnerName: "Thép MN", amount: 1, needsReview: true },
    // Phiếu chi Nợ 1388: lý do rà soát là tài khoản, không phải đối tác → giữ cờ
    { id: "PC_1388", type: "payment", partnerId: "", partnerName: "Thép MN", amount: 1, needsReview: true,
      entries: [{ debit: "1388", credit: "111", amount: 1 }] }
  );
  await runManualImport(ctx, [
    ["CHI TIẾT CÔNG NỢ PHẢI TRẢ THEO HÓA ĐƠN"], [""], [""],
    ["Tên nhà cung cấp : Công ty Thép Miền Nam (2 )"],
    ["", "", "2026-01-05", "NK_REV", "HD1", "Nhập thép", "", 5000],
    ["", "", "2026-01-05", "PC_1388", "", "Chi", "", 1]
  ], "purchase");
  const nk = ctx.state.vouchers.find(v => v.id === "NK_REV");
  assert.equal(nk.partnerId, "NCCTHEP");
  assert.ok(!("needsReview" in nk), "supplier re-match clears needsReview once a partner is assigned");
  const pc = ctx.state.vouchers.find(v => v.id === "PC_1388");
  assert.equal(pc.partnerId, "NCCTHEP");
  assert.equal(pc.needsReview, true, "Nợ 1388 payment stays flagged for account review");
}

// F3: nhãn dòng other331Adj
function testAuditOther331AdjLabel() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [{ id: "DT2C", name: "Đối tác hai chiều", type: "retail" }];
  ctx.state.initialBalances = {};
  ctx.state.vouchers = [
    { id: "BH9", type: "sales", date: "2026-01-10", partnerId: "DT2C", entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "NK9", type: "purchase", date: "2026-01-11", partnerId: "DT2C", entries: [{ debit: "156", credit: "331", amount: 400 }] }
  ];
  const html = renderAudit(ctx);
  assert.ok(html.includes("Điều chỉnh 331 (đối tác vai trò NCC / hai chiều / chưa khớp)"), "other331Adj label wording");
}

// F4: chứng từ không phải công nợ (không có dòng 131/331) không tạo nhóm "Chưa khớp" 0/0
function testNonDebtVouchersDoNotCreateEmptyUnmatchedBucket() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
  ctx.state.vouchers = [
    { id: "PT_KHAC", type: "receipt", date: "2026-01-05", partnerId: "", paymentMethod: "111", amount: 500,
      entries: [{ debit: "111", credit: "711", amount: 500 }] },
    { id: "PC_KHAC", type: "payment", date: "2026-01-06", partnerId: "", paymentMethod: "111", amount: 300,
      entries: [{ debit: "642", credit: "111", amount: 300 }] },
    { id: "PT_VAY3", type: "receipt", date: "2026-01-07", partnerId: "MA_LA", paymentMethod: "112", amount: 900,
      entries: [{ debit: "112", credit: "341", amount: 900 }] }
  ];
  assert.ok(!ctx.calculatePartnerDebts().some(d => d.id === "__UNMATCHED__"), "no empty unmatched bucket for non-debt vouchers");

  // Vẫn giữ nhóm chưa khớp khi có dòng 131 thật hoặc dòng suy diễn từ dữ liệu cũ
  ctx.state.vouchers.push(
    { id: "BH_NOP", type: "sales", date: "2026-01-08", partnerId: "", entries: [{ debit: "131", credit: "511", amount: 100 }] },
    { id: "PT_OLD", type: "receipt", date: "2026-01-09", partnerId: "MA_CU", paymentMethod: "111", amount: 40 }
  );
  const bucket = ctx.calculatePartnerDebts().find(d => d.id === "__UNMATCHED__");
  assert.ok(bucket, "bucket kept for real/legacy debt lines");
  assert.deepStrictEqual(plain(bucket.orphanPartnerIds).sort(), ["", "MA_CU"], "only vouchers with 131/331 lines add orphan ids");
}

// F5: số tiền dạng chuỗi / thiếu được ép kiểu số
function testAccumulateDebtEntryLinesCoercesAmount() {
  const ctx = loadDebtModule();
  const counters = ctx.createEmptyDebtCounters();
  ctx.accumulateDebtEntryLines({ debit: "131", credit: "511", amount: "1000" }, counters);
  ctx.accumulateDebtEntryLines({ debit: "111", credit: "131", amount: "250" }, counters);
  ctx.accumulateDebtEntryLines({ debit: "156", credit: "331", amount: undefined }, counters);
  assert.strictEqual(counters.debit131, 1000, "string amount coerced, not concatenated");
  assert.strictEqual(counters.credit131, 250);
  assert.strictEqual(counters.credit331, 0, "missing amount counts as 0, not NaN");

  ctx.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
  ctx.state.vouchers = [{ id: "BH1", type: "sales", date: "2026-01-10", partnerId: "KH01",
    entries: [{ debit: "131", credit: "511", amount: "1000" }] }];
  assert.strictEqual(ctx.calculatePartnerDebts().find(d => d.id === "KH01").closingDebit, 1000);
}

// F6: cầu nối Σ131 → KPI với other331Adj (hai chiều, NCC có 131, nhóm chưa khớp)
function testAuditOther331AdjBridgeCases() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [
    { id: "DT2C", name: "Đối tác hai chiều", type: "retail" },
    { id: "NCC1", name: "NCC có bán hàng", type: "supplier" }
  ];
  ctx.state.partnerOpeningBalances = {};
  ctx.state.initialBalances = {};
  ctx.state.vouchers = [
    // Hai chiều: dư Nợ 131 = 1000 và dư Có 331 = 400 (cả hai dương, không cấn trừ)
    { id: "BH_2C", type: "sales", date: "2026-01-10", partnerId: "DT2C", entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "NK_2C", type: "purchase", date: "2026-01-11", partnerId: "DT2C", entries: [{ debit: "156", credit: "331", amount: 400 }] },
    // NCC khai báo supplier nhưng có phát sinh 131
    { id: "NK_N1", type: "purchase", date: "2026-01-12", partnerId: "NCC1", entries: [{ debit: "156", credit: "331", amount: 2000 }] },
    { id: "BH_N1", type: "sales", date: "2026-01-13", partnerId: "NCC1", entries: [{ debit: "131", credit: "511", amount: 300 }] },
    // Nhóm chưa khớp: một mã có Có 331, một mã có Nợ 131
    { id: "NK_LA", type: "purchase", date: "2026-01-14", partnerId: "MA_LA", entries: [{ debit: "156", credit: "331", amount: 500 }] },
    { id: "BH_LB", type: "sales", date: "2026-01-15", partnerId: "MA_LB", entries: [{ debit: "131", credit: "511", amount: 200 }] }
  ];
  const debts = ctx.calculatePartnerDebts();
  const rec = ctx.computeDebt131Reconciliation(debts, "", "");

  const dual = debts.find(d => d.id === "DT2C");
  assert.equal(dual.closingDebit, 1000);
  assert.equal(dual.closingCredit, 400, "dual-role keeps 331 credit side");
  const sup = debts.find(d => d.id === "NCC1");
  assert.ok(sup.has131, "supplier-role partner has 131 activity → counted in KPI");
  const unmatched = debts.find(d => d.id === "__UNMATCHED__");
  assert.equal(unmatched.closingDebit, 200);
  assert.equal(unmatched.closingCredit, 500);

  assert.equal(rec.ledgerClose, 1500);
  assert.equal(rec.detailClose, 1500, "Σ net131 = 1000 + 300 + 200");
  assert.equal(rec.closeMatched, true);
  assert.equal(rec.refund331Adj, 0, "no customer-role netting in these cases");
  assert.equal(rec.kpiNet, (1000 - 400) + (300 - 2000) + (200 - 500));
  assert.equal(rec.other331Adj, -(400 + 2000 + 500), "other331Adj = 331 credit balances of dual / supplier-role / unmatched");
  assert.equal(rec.detailClose + rec.refund331Adj + rec.other331Adj, rec.kpiNet, "bridge reconciles to KPI net");

  const html = renderAudit(ctx);
  assert.ok(html.includes("Điều chỉnh 331 (đối tác vai trò NCC / hai chiều / chưa khớp)"));
  assert.ok(html.includes("−2900"), "signed other331Adj rendered");
}

// ---- Task 5: chi tiền cho khách theo chuẩn — Nợ 131, không "giảm phải thu" ----

function customerDebtRow(vouchers, partners) {
  const ctx = loadDebtModule();
  ctx.state.partners = partners || [{ id: "KH01", name: "Khách A", type: "retail" }];
  ctx.state.vouchers = vouchers;
  return { ctx, rows: ctx.calculatePartnerDebts() };
}

function testRefundToOverpaidCustomerClearsBalance() {
  ["331", "131"].forEach(acc => {
    const { rows } = customerDebtRow([
      { id: "BH1", type: "sales", date: "2026-01-01", partnerId: "KH01", entries: [{ debit: "131", credit: "511", amount: 500 }] },
      { id: "PT1", type: "receipt", date: "2026-01-02", partnerId: "KH01", entries: [{ debit: "111", credit: "131", amount: 600 }] },
      { id: "PC1", type: "payment", date: "2026-01-03", partnerId: "KH01", description: "Chi trả lại tiền thừa",
        entries: [{ debit: acc, credit: "111", amount: 100 }] }
    ]);
    const kh = rows.find(d => d.id === "KH01");
    assert.equal(kh.closingDebit, 0, `Nợ ${acc}: overpaid −100 + refund 100 → 0 (no Dư Nợ)`);
    assert.equal(kh.closingCredit, 0, `Nợ ${acc}: overpaid −100 + refund 100 → 0 (no Dư Có)`);
    assert.equal(kh.debtRole, "customer", `Nợ ${acc}: stays customer`);
    assert.equal(kh.type, "retail", `Nợ ${acc}: refund does not make the customer dual-role`);
  });
}

function testPaymentToOwingCustomerIncreasesReceivable() {
  const vouchers = [
    { id: "BH1", type: "sales", date: "2026-01-01", partnerId: "KH01", entries: [{ debit: "131", credit: "511", amount: 500 }] },
    { id: "PC1", type: "payment", date: "2026-01-03", partnerId: "KH01", entries: [{ debit: "331", credit: "111", amount: 100 }] }
  ];
  const { ctx, rows } = customerDebtRow(vouchers);
  const kh = rows.find(d => d.id === "KH01");
  assert.equal(kh.closingDebit, 600, "owing 500 + payment 100 → 600");
  assert.equal(kh.closingCredit, 0);
  assert.equal(kh.debitTrans, 600, "PS Nợ includes the payment read as Nợ 131");
  assert.equal(kh.creditTrans, 0);
  assert.equal(kh.has331, false, "Nợ 331 payment alone is not 331 activity for a customer");
  assert.equal(kh.debtRole, "customer");
  assert.equal(kh.net131Close, 500, "net131Close keeps real 131 lines only");

  const ledger = ctx.calculatePartnerDebtLedger(ctx.state.partners, "", "", "customer");
  assert.equal(ledger.role, "customer");
  assert.equal(ledger.closingVal, 600, "notice ledger agrees with overview");
  assert.ok(ledger.ledgerEntries.some(e => e.id === "PC1" && e.debit === 100 && e.credit === 0), "payment is a debit-side movement");

  // Chỉ có phiếu chi Nợ 331 (vd. PC6882): khách nợ lại số tiền đó, không thành NCC
  const only = customerDebtRow([
    { id: "PC9", type: "payment", date: "2026-01-03", partnerId: "KH01", entries: [{ debit: "331", credit: "111", amount: 1418500 }] }
  ]).rows.find(d => d.id === "KH01");
  assert.equal(only.debtRole, "customer", "payment-only retail partner stays customer");
  assert.equal(only.closingDebit, 1418500);
  assert.equal(only.supplierReceivable, 0, "not shown as supplier receivable");
}

function testSupplierPaymentStillReducesPayable() {
  [
    { id: "NCC01", name: "NCC", type: "supplier" },
    { id: "NCC01", name: "NCC chưa khai báo", type: "retail" }
  ].forEach(partner => {
    const { rows } = customerDebtRow([
      { id: "NK1", type: "purchase", date: "2026-01-01", partnerId: "NCC01", entries: [{ debit: "156", credit: "331", amount: 500 }] },
      { id: "PC1", type: "payment", date: "2026-01-02", partnerId: "NCC01", entries: [{ debit: "331", credit: "111", amount: 200 }] }
    ], [partner]);
    const row = rows.find(d => d.id === "NCC01");
    assert.equal(row.closingCredit, 300, `${partner.type}: supplier payment Nợ 331 reduces payable`);
    assert.equal(row.closingDebit, 0);
    assert.equal(row.debtRole, "supplier");
    assert.equal(row.customerPayment331As131, 0, `${partner.type}: supplier payment not read as 131`);
  });
}

function testDualRoleWithGenuinePayableStaysSeparate() {
  const { rows } = customerDebtRow([
    { id: "BH1", type: "sales", date: "2026-01-01", partnerId: "KH01", entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "NK1", type: "purchase", date: "2026-01-02", partnerId: "KH01", entries: [{ debit: "156", credit: "331", amount: 400 }] },
    { id: "PC1", type: "payment", date: "2026-01-03", partnerId: "KH01", entries: [{ debit: "331", credit: "111", amount: 100 }] }
  ]);
  const row = rows.find(d => d.id === "KH01");
  assert.equal(row.type, "both");
  assert.equal(row.closingDebit, 1000, "131 receivable kept separate");
  assert.equal(row.closingCredit, 300, "331 payable = 400 purchase − 100 payment, kept separate");
  assert.equal(row.customerPayment331As131, 0, "payment on a genuine dual-role partner stays 331");
}

function testPaymentFormDefaultsDebitByPartner() {
  const partners = [
    { id: "KH01", name: "Khách 01", type: "retail" },
    { id: "DN01", name: "Công ty 01", type: "enterprise" },
    { id: "CT01", name: "Công trình 01", type: "project" },
    { id: "NCC01", name: "NCC 01", type: "supplier" }
  ];
  const { ctx, getEl } = loadCashModule(partners);
  ctx.findExistingPartner = val => {
    const m = /\(([^)]+)\)\s*$/.exec(String(val || ""));
    return partners.find(p => p.id === (m ? m[1] : val)) || null;
  };
  const pick = (val) => { getEl("payment-partner").value = val; ctx.onPaymentPartnerChange(); return getEl("payment-debit").value; };

  ctx.resetPaymentForm();
  getEl("payment-debit").value = "331";
  assert.equal(pick("Khách 01 (KH01)"), "131", "retail → Nợ 131");
  assert.equal(pick("Công ty 01 (DN01)"), "131", "enterprise → Nợ 131");
  assert.equal(pick("Công trình 01 (CT01)"), "131", "project → Nợ 131");
  assert.equal(pick("NCC 01 (NCC01)"), "331", "supplier → Nợ 331");

  getEl("payment-debit").value = "642";
  assert.equal(pick("Khách 01 (KH01)"), "642", "non-debt account is never replaced");

  ctx.resetPaymentForm();
  getEl("payment-debit").value = "331";
  ctx.markPaymentDebitChosen();
  assert.equal(pick("Khách 01 (KH01)"), "331", "explicitly chosen 331 is kept");

  ctx.state.vouchers = [{ id: "PC50", type: "payment", date: "2026-01-01", partnerId: "KH01", partnerName: "Khách 01",
    paymentMethod: "111", amount: 10, entries: [{ debit: "331", credit: "111", amount: 10 }] }];
  ctx.editPaymentVoucher("PC50");
  assert.equal(pick("Khách 01 (KH01)"), "331", "editing keeps the stored account");

  const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const select = /<select id="payment-debit"[\s\S]*?<\/select>/.exec(html)[0];
  assert.ok(/<option value="131">/.test(select), "TK 131 selectable on the payment form");
  assert.ok(/id="payment-partner"[^>]*onchange="onPaymentPartnerChange\(\)"/.test(html), "partner change hook wired");
  assert.ok(/<select id="payment-debit"[^>]*onchange="markPaymentDebitChosen\(\)"/.test(html), "debit change hook wired");
}

async function testPaymentNo131AutoCreatesCustomer() {
  const { ctx, getEl } = loadCashModule([]);
  const createdTypes = [];
  ctx.resolvePartner = (val, type) => { createdTypes.push(type); return { id: "NEW", name: String(val) }; };
  ctx.resetPaymentForm();
  getEl("payment-date").value = "2026-01-01";
  getEl("payment-partner").value = "Khách mới";
  getEl("payment-debit").value = "131";
  getEl("payment-credit").value = "111";
  getEl("payment-amount").value = "100";
  getEl("payment-desc").value = "Chi trả lại tiền khách";
  await ctx.handlePaymentSubmit({ preventDefault() {} });
  assert.deepStrictEqual(createdTypes, ["retail"], "Nợ 131 payment infers a customer partner");
  const pc = ctx.state.vouchers[0];
  assert.deepStrictEqual(plain(pc.entries.map(e => [e.debit, e.credit])), [["131", "111"]], "chosen account stored as-is");
}

function testFifoRefundDoesNotSettleInvoices() {
  ["331", "131"].forEach(acc => {
    // Khách nợ 500, chi cho khách 100 → hóa đơn không được coi là đã thu
    const fifo = loadAccountingFifo();
    fifo.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
    fifo.state.vouchers = [
      { id: "HD1", type: "sales", date: "2026-01-01", partnerId: "KH01", paymentMethod: "131",
        items: [{ productId: "P1", qty: 1, price: 500, amount: 500 }], taxRate: 0, isImported: false },
      { id: "PC1", type: "payment", date: "2026-01-05", partnerId: "KH01", amount: 100, paymentMethod: "111",
        isImported: false, entries: [{ debit: acc, credit: "111", amount: 100 }] }
    ];
    fifo.recalculateAccounting(false);
    assert.equal(fifo.state.vouchers.find(v => v.id === "HD1").remainingDebt, 500, `Nợ ${acc}: refund does not settle the invoice`);

    // Khách trả thừa 100 rồi được hoàn 100: khoản trả trước đã hết, hóa đơn sau còn nợ đủ
    const fifo2 = loadAccountingFifo();
    fifo2.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
    fifo2.state.vouchers = [
      { id: "HD1", type: "sales", date: "2026-01-01", partnerId: "KH01", paymentMethod: "131",
        items: [{ productId: "P1", qty: 1, price: 500, amount: 500 }], taxRate: 0, isImported: false },
      { id: "PT1", type: "receipt", date: "2026-01-02", partnerId: "KH01", amount: 600, paymentMethod: "111",
        isImported: false, entries: [{ debit: "111", credit: "131", amount: 600 }] },
      { id: "PC1", type: "payment", date: "2026-01-03", partnerId: "KH01", amount: 100, paymentMethod: "111",
        isImported: false, entries: [{ debit: acc, credit: "111", amount: 100 }] },
      { id: "HD2", type: "sales", date: "2026-01-04", partnerId: "KH01", paymentMethod: "131",
        items: [{ productId: "P1", qty: 1, price: 300, amount: 300 }], taxRate: 0, isImported: false }
    ];
    fifo2.recalculateAccounting(false);
    const hd2 = fifo2.state.vouchers.find(v => v.id === "HD2");
    assert.equal(hd2.remainingDebt, 300, `Nợ ${acc}: refund uses up the overpayment, later invoice stays unpaid`);
    const debtCtx = loadDebtModule();
    debtCtx.state.partners = fifo2.state.partners;
    debtCtx.state.vouchers = plain(fifo2.state.vouchers);
    const row = debtCtx.calculatePartnerDebts().find(d => d.id === "KH01");
    assert.equal(row.closingDebit, 300, `Nợ ${acc}: debt summary equals FIFO remaining`);
  });

  // NCC: chi Nợ 331 vẫn trả hóa đơn mua hàng
  const fifo3 = loadAccountingFifo();
  fifo3.state.partners = [{ id: "NCC01", name: "NCC", type: "supplier" }];
  fifo3.state.vouchers = [
    { id: "NK1", type: "purchase", date: "2026-01-01", partnerId: "NCC01", paymentMethod: "331",
      items: [{ productId: "P1", qty: 1, price: 500, amount: 500 }], taxRate: 0, isImported: false },
    { id: "PC1", type: "payment", date: "2026-01-02", partnerId: "NCC01", amount: 200, paymentMethod: "111",
      isImported: false, entries: [{ debit: "331", credit: "111", amount: 200 }] }
  ];
  fifo3.recalculateAccounting(false);
  assert.equal(fifo3.state.vouchers.find(v => v.id === "NK1").remainingDebt, 300, "supplier payment still settles purchases");
}

function testAuditCustomerPaymentBridgeIdentity() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [
    { id: "KH01", name: "Khách 01", type: "retail" },
    { id: "KH02", name: "Khách chỉ có phiếu chi", type: "retail" },
    { id: "DT2C", name: "Đối tác hai chiều", type: "retail" },
    { id: "NCC1", name: "NCC", type: "supplier" }
  ];
  ctx.state.partnerOpeningBalances = {};
  ctx.state.initialBalances = {};
  ctx.state.vouchers = [
    { id: "BH1", type: "sales", date: "2026-01-01", partnerId: "KH01", entries: [{ debit: "131", credit: "511", amount: 500 }] },
    { id: "PC1", type: "payment", date: "2026-01-02", partnerId: "KH01", entries: [{ debit: "331", credit: "111", amount: 100 }] },
    { id: "PC2", type: "payment", date: "2026-01-03", partnerId: "KH02", entries: [{ debit: "331", credit: "111", amount: 70 }] },
    { id: "PC3", type: "payment", date: "2026-01-04", partnerId: "KH01", entries: [{ debit: "131", credit: "111", amount: 30 }] },
    { id: "BH2", type: "sales", date: "2026-01-05", partnerId: "DT2C", entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "NK2", type: "purchase", date: "2026-01-06", partnerId: "DT2C", entries: [{ debit: "156", credit: "331", amount: 400 }] },
    { id: "PC4", type: "payment", date: "2026-01-07", partnerId: "DT2C", entries: [{ debit: "331", credit: "111", amount: 100 }] },
    { id: "NK3", type: "purchase", date: "2026-01-08", partnerId: "NCC1", entries: [{ debit: "156", credit: "331", amount: 900 }] },
    { id: "PC5", type: "payment", date: "2026-01-09", partnerId: "NCC1", entries: [{ debit: "331", credit: "111", amount: 200 }] }
  ];
  const debts = ctx.calculatePartnerDebts();
  const rec = ctx.computeDebt131Reconciliation(debts, "", "");
  assert.equal(rec.ledgerClose, 1530, "Sổ cái TK131 = real 131 lines (500 + 30 + 1000)");
  assert.equal(rec.detailClose, 1530);
  assert.equal(rec.closeMatched, true, "Khớp still compares ledger vs Σ real 131 lines");
  assert.equal(rec.refund331Adj, 170, "bridge = Nợ 331 payments to customers (100 + 70)");
  assert.equal(rec.kpiNet, (630) + (70) + (1000 - 300));
  assert.equal(rec.ledgerClose + rec.refund331Adj + rec.other331Adj, rec.kpiNet, "Sổ cái + bridge + other331Adj = KPI ròng");
  assert.equal(rec.other331Adj, -300, "dual-role genuine 331 payable");
  const html = renderAudit(ctx);
  assert.ok(html.includes("Phiếu chi cho khách hạch toán Nợ 331 (đọc là Nợ 131 theo chuẩn)"), "renamed bridge line");
  assert.ok(html.includes("+170"), "bridge rendered with + sign");
  assert.ok(!html.includes("cấn trừ phải thu"), "old backwards wording removed");
}

function testAuditFlagsPossibleDoubleRefund() {
  const ctx = loadDebtWithLedger();
  ctx.state.partners = [
    { id: "KH01", name: "Khách <i>01</i>", type: "retail" },
    { id: "NCC1", name: "NCC", type: "supplier" }
  ];
  ctx.state.initialBalances = {};
  const sr = (id, date, partnerId, entries) => ({ id, type: "sales_return", date, partnerId, entries });
  const pc = (id, date, partnerId, amount, description, debit = "331") =>
    ({ id, type: "payment", date, partnerId, amount, description, entries: [{ debit, credit: "111", amount }] });
  ctx.state.vouchers = [
    { id: "BH1", type: "sales", date: "2026-02-20", partnerId: "KH01", entries: [{ debit: "131", credit: "511", amount: 5000 }] },
    // Trả hàng đã hoàn tiền mặt (Có 111/112, không có 131)
    sr("TL1", "2026-03-01", "KH01", [{ debit: "5213", credit: "111", amount: 450 }, { debit: "3331", credit: "111", amount: 50 }]),
    // Trả hàng ghi giảm công nợ (Có 131) — không phải hoàn tiền
    sr("TL2", "2026-03-01", "KH01", [{ debit: "5213", credit: "131", amount: 800 }]),
    sr("TL3", "2026-03-01", "NCC1", [{ debit: "5213", credit: "112", amount: 600 }]),
    pc("PC_DUP", "2026-03-05", "KH01", 500, "Chi trả lại tiền hàng cho khách"),
    pc("PC_DUP2", "2026-02-25", "KH01", 500, "HOÀN tiền đơn trả", "131"),
    pc("PC_FAR", "2026-03-20", "KH01", 500, "hoàn tiền"),
    pc("PC_AMT", "2026-03-02", "KH01", 400, "trả lại tiền"),
    pc("PC_NOWORD", "2026-03-02", "KH01", 500, "chi khác"),
    pc("PC_RET131", "2026-03-02", "KH01", 800, "trả lại"),
    pc("PC_SUP", "2026-03-02", "NCC1", 600, "trả lại")
  ];
  const range = { fromDate: "2026-03-01", toDate: "2026-03-31" };
  const rec = ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(range.fromDate, range.toDate), range.fromDate, range.toDate);
  const diag = plain(rec.possibleDoubleRefunds);
  assert.deepStrictEqual(diag.rows.map(r => r.id), ["PC_DUP"], "only the in-period customer refund matching a cash sales return");
  assert.equal(diag.count, 1);
  assert.equal(diag.total, 500);
  assert.equal(diag.rows[0].returnId, "TL1");

  const all = plain(ctx.computeDebt131Reconciliation(ctx.calculatePartnerDebts(), "", "").possibleDoubleRefunds);
  assert.deepStrictEqual(all.rows.map(r => r.id).sort(), ["PC_DUP", "PC_DUP2"], "±7 days both directions, case-insensitive, any debit account");

  const html = renderAudit(ctx, range);
  assert.ok(html.includes("Có thể chi hoàn tiền 2 lần"), "diagnostic shown");
  assert.ok(html.includes("PC_DUP") && html.includes("TL1"), "row lists payment and sales return");
  assert.ok(html.includes("<details>"), "collapsible list");
  assert.ok(!html.includes("Khách <i>01</i>") && html.includes("Khách &lt;i&gt;01&lt;/i&gt;"), "partner name escaped");
}

async function runAll() {
  testReceiptWithLoanEntriesDoesNotTouch131();
  testPaymentWithSalaryEntriesDoesNotTouch331();
  testOtherNonDebtCashVouchersIgnored();
  testUnmatchedNonDebtVoucherNotCounted();
  testReceiptWithCredit131StillCounts();
  testMixedEntriesReturnOnlyDebtLines();
  testVoucherWithoutEntriesStillUsesFallback();
  testFifoMatchesDebtSummaryForLoanReceipt();
  await testCashImportAccountMappingAuto();
  await testCashImportAccountMappingManual();
  await testImportPartnerMatchingRules();
  await testSalesImportsDoNotCreatePartners();
  await testCongNoPhaiTraImportDoesNotCreatePartners();
  await testReimportKeepsExistingPartnerAssignment();
  testImportSourceHasNoInventedPartnerCodes();
  testReportAccountsName1388BothStandards();
  testAudit131MatchesLedger();
  testAudit131FlagsLedgerOnlyEntry();
  testAudit131FlagsOpeningMismatch();
  testAudit131RefundBridgeEqualsKpiNet();
  testAudit131RespectsPeriodFilter();
  testAudit131CreditNatureInitialBalance();
  testAuditEscapesOrphanPartnerIds();
  testAuditFlagsPartnerCashWithoutDebtLines();
  await testCashSaveClearsNeedsReview();
  testCashNeedsReviewFilter();
  await testSupplierRematchClearsNeedsReview();
  testAuditOther331AdjLabel();
  testNonDebtVouchersDoNotCreateEmptyUnmatchedBucket();
  testAccumulateDebtEntryLinesCoercesAmount();
  testAuditOther331AdjBridgeCases();
  testRefundToOverpaidCustomerClearsBalance();
  testPaymentToOwingCustomerIncreasesReceivable();
  testSupplierPaymentStillReducesPayable();
  testDualRoleWithGenuinePayableStaysSeparate();
  testPaymentFormDefaultsDebitByPartner();
  await testPaymentNo131AutoCreatesCustomer();
  testFifoRefundDoesNotSettleInvoices();
  testAuditCustomerPaymentBridgeIdentity();
  testAuditFlagsPossibleDoubleRefund();
  console.log("debt-audit-tests.js: all tests passed");
}

runAll().catch((err) => {
  console.error("debt-audit-tests.js FAILED:", err);
  process.exit(1);
});
