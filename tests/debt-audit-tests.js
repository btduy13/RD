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

function runAll() {
  testReceiptWithLoanEntriesDoesNotTouch131();
  testPaymentWithSalaryEntriesDoesNotTouch331();
  testOtherNonDebtCashVouchersIgnored();
  testUnmatchedNonDebtVoucherNotCounted();
  testReceiptWithCredit131StillCounts();
  testMixedEntriesReturnOnlyDebtLines();
  testVoucherWithoutEntriesStillUsesFallback();
  testFifoMatchesDebtSummaryForLoanReceipt();
  console.log("debt-audit-tests.js: all tests passed");
}

try {
  runAll();
} catch (err) {
  console.error("debt-audit-tests.js FAILED:", err);
  process.exit(1);
}
