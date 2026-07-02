const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

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
    XLSX: null
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
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
    rebalanceEquity() {},
    window: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(accountingSource, sandbox, { filename: "accounting.js" });
  return sandbox;
}

function testBothAccountsPerPartner() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
  ctx.state.partnerOpeningBalances = {};
  ctx.state.vouchers = [
    {
      id: "HD1", type: "sales", date: "2026-01-10", partnerId: "KH01",
      entries: [
        { debit: "131", credit: "511", amount: 1000000 },
        { debit: "131", credit: "3331", amount: 100000 }
      ]
    },
    {
      id: "PC1", type: "payment", date: "2026-01-15", partnerId: "KH01",
      entries: [{ debit: "331", credit: "111", amount: 200000 }]
    }
  ];

  const debts = ctx.calculatePartnerDebts();
  const kh = debts.find(d => d.id === "KH01");
  assert.ok(kh, "partner debt row exists");
  assert.ok(kh.debitTrans >= 1300000, "131 sales + 331 payment debits counted");
  assert.equal(kh.closingDebit, 900000, "net receivable after refund payment on 331");
}

function testUnmatchedPartnerBucket() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "KH01", name: "Khách A", type: "retail" }];
  ctx.state.vouchers = [
    {
      id: "PT1", type: "receipt", date: "2026-01-05", partnerId: "ORPHAN01",
      entries: [{ debit: "111", credit: "131", amount: 500000 }]
    }
  ];

  const debts = ctx.calculatePartnerDebts();
  const unmatched = debts.find(d => d.id === "__UNMATCHED__");
  assert.ok(unmatched, "unmatched bucket row exists");
  assert.ok(unmatched.closingCredit >= 500000 || unmatched.creditTrans >= 500000, "orphan receipt visible in debt");
}

function testDualRoleBothType() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "DN01", name: "Công ty X", type: "enterprise" }];
  ctx.state.vouchers = [
    {
      id: "HD1", type: "sales", date: "2026-01-01", partnerId: "DN01",
      entries: [{ debit: "131", credit: "511", amount: 300000 }]
    },
    {
      id: "NK1", type: "purchase", date: "2026-01-02", partnerId: "DN01",
      entries: [{ debit: "156", credit: "331", amount: 200000 }]
    }
  ];

  const debts = ctx.calculatePartnerDebts();
  const row = debts.find(d => d.id === "DN01");
  assert.equal(row.type, "both", "dual 131+331 activity marks partner as both");
  assert.ok(row.closingDebit > 0, "receivable side shown");
  assert.ok(row.closingCredit > 0, "payable side shown");
}

function testFifoReceiptAllocatesSales() {
  const ctx = loadAccountingFifo();
  ctx.state.vouchers = [
    {
      id: "HD1", type: "sales", date: "2026-01-01", partnerId: "KH01", paymentMethod: "131",
      items: [{ productId: "P1", qty: 1, price: 1000000, amount: 1000000 }],
      taxRate: 0, isImported: false
    },
    {
      id: "PT1", type: "receipt", date: "2026-01-10", partnerId: "KH01", amount: 400000,
      paymentMethod: "111", isImported: false, entries: []
    }
  ];
  ctx.recalculateAccounting(false);
  const sale = ctx.state.vouchers.find(v => v.id === "HD1");
  assert.equal(sale.remainingDebt, 600000, "receipt reduces sales remainingDebt via FIFO");
}

function testDebtAdjustmentPreserved() {
  const ctx = loadAccountingFifo();
  ctx.state.vouchers = [
    {
      id: "HD1", type: "sales", date: "2026-01-01", partnerId: "KH01", paymentMethod: "131",
      items: [{ productId: "P1", qty: 1, price: 1000000, amount: 1000000 }],
      taxRate: 0, isImported: false, debtAdjustment: -200000
    }
  ];
  ctx.recalculateAccounting(false);
  const sale = ctx.state.vouchers.find(v => v.id === "HD1");
  assert.equal(sale.remainingDebt, 800000, "manual debtAdjustment delta applied after FIFO");
}

function testTT133PurchaseReturnVat() {
  const ctx = loadAccountingFifo();
  ctx.state.accountingStandard = "TT133";
  ctx.state.vouchers = [
    {
      id: "NK1", type: "purchase", date: "2026-01-01", partnerId: "NCC01", paymentMethod: "331",
      items: [{ productId: "P1", qty: 1, price: 1000000, amount: 1000000 }],
      taxRate: 10, isImported: false
    },
    {
      id: "XT1", type: "purchase_return", date: "2026-01-05", partnerId: "NCC01", paymentMethod: "331",
      items: [{ productId: "P1", qty: 1, price: 1000000, amount: 1000000 }],
      taxRate: 10, isImported: false
    }
  ];
  ctx.recalculateAccounting(false);
  const ret = ctx.state.vouchers.find(v => v.id === "XT1");
  const vatEntry = ret.entries.find(e => e.amount === 100000 && e.debit && e.debit.startsWith("331"));
  assert.ok(vatEntry, "TT133 purchase return debits 331 for VAT portion");
}

async function runAll() {
  testBothAccountsPerPartner();
  testUnmatchedPartnerBucket();
  testDualRoleBothType();
  testFifoReceiptAllocatesSales();
  testDebtAdjustmentPreserved();
  testTT133PurchaseReturnVat();
  console.log("debt-tests.js: all tests passed");
}

runAll().catch(err => {
  console.error("debt-tests.js FAILED:", err);
  process.exit(1);
});
