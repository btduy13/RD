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
    { id: "NCCTHEP", name: "Công ty Thép Miền Nam", type: "supplier" }
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
  assert.equal(importedVoucher(ctx, "PT5").e.credit, "131", `${label}: bare "vay" stays Có 131`);
  assert.equal(importedVoucher(ctx, "PT6").e.credit, "131", `${label}: "việt nga" alone stays Có 131`);
  // cụm vay rõ ràng → Có 341
  assert.equal(importedVoucher(ctx, "PT2").e.credit, "341", `${label}: "vay ngân hàng" → Có 341`);
  assert.equal(importedVoucher(ctx, "PT3").e.credit, "341", `${label}: "giải ngân" → Có 341`);
  assert.equal(importedVoucher(ctx, "PT4").e.credit, "341", `${label}: "nhận nợ vay" → Có 341`);

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

// ---- Task 3: KPI "Khách trả thừa" không trộn số dư 331 của đối tác hai vai ----

function testOverviewKpiSeparates131And331ForDualRole() {
  const ctx = loadDebtModule();
  const els = {};
  ctx.document.getElementById = (id) => (els[id] = els[id] || { innerHTML: "", innerText: "", children: [] });
  ctx.state.partners = [
    { id: "CUS", name: "Pure customer", type: "retail" },
    { id: "SUP", name: "Pure supplier", type: "supplier" },
    { id: "DUAL", name: "Dual owes both ways", type: "retail" },
    { id: "BACU", name: "Dual with 331 debit", type: "retail" }
  ];
  ctx.state.vouchers = [
    { id: "BH1", type: "sales", date: "2026-03-01", partnerId: "CUS", entries: [{ debit: "131", credit: "511", amount: 200 }] },
    { id: "MH1", type: "purchase", date: "2026-03-01", partnerId: "SUP", entries: [{ debit: "156", credit: "331", amount: 500 }] },
    { id: "BH2", type: "sales", date: "2026-03-01", partnerId: "DUAL", entries: [{ debit: "131", credit: "511", amount: 100 }] },
    { id: "MH2", type: "purchase", date: "2026-03-02", partnerId: "DUAL", entries: [{ debit: "156", credit: "331", amount: 40 }] },
    { id: "BH3", type: "sales", date: "2026-03-01", partnerId: "BACU", entries: [{ debit: "131", credit: "511", amount: 30 }] },
    { id: "PC1", type: "payment", date: "2026-03-02", partnerId: "BACU", entries: [{ debit: "331", credit: "111", amount: 1000 }] }
  ];

  const debts = ctx.calculatePartnerDebts();
  const bacu = debts.find(d => d.id === "BACU");
  assert.equal(bacu.closing131Debit, 30, "per-side 131 debit");
  assert.equal(bacu.closing131Credit, 0, "331 debit must not appear as 131 overpayment");
  assert.equal(bacu.closing331Debit, 1000, "per-side 331 debit");
  assert.equal(bacu.closing331Credit, 0);
  const dual = debts.find(d => d.id === "DUAL");
  assert.equal(dual.closing131Debit, 100);
  assert.equal(dual.closing331Credit, 40);

  ctx.renderDebtOverview(debts);
  const html = els["debt-overview-kpis"].innerHTML;
  const values = Array.from(html.matchAll(/kpi-value font-numeric">([^<]+)</g), m => Number(m[1]));
  assert.equal(values[0], 330, "Tổng phải thu = 131 only (200+100+30)");
  assert.equal(values[1], 540, "Tổng phải trả NCC = 331 credit (500 + dual 40)");
  assert.equal(values[2], 3, "partners with 131 debt");
  assert.equal(values[3], 0, "no 131 overpayment: 331 debit of dual partner is not khách trả thừa");
  assert.equal(values[4], 1000, "NCC trả thừa = 331 debit of dual partner");

  const breakdown = els["debt-overview-breakdown-body"].innerHTML;
  const total = breakdown.split("debt-breakdown-total-row")[1];
  assert.ok(total.includes(">330<"), "breakdown total receivable uses 131 side");
  assert.ok(!total.includes("970") && !total.includes("1000"), "breakdown has no 331-derived overpaid");
  assert.ok(els["debt-audit-content"].innerHTML.includes("Khớp"), "audit invariant holds on 131-only basis");
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
  testOverviewKpiSeparates131And331ForDualRole();
  console.log("debt-audit-tests.js: all tests passed");
}

runAll().catch((err) => {
  console.error("debt-audit-tests.js FAILED:", err);
  process.exit(1);
});
