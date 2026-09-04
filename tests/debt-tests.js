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

function loadExcelIntegration(initialPartners) {
  const source = fs.readFileSync(path.join(repoRoot, "js", "excel-integration.js"), "utf8");
  const sandbox = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map,
    state: { partners: initialPartners || [], products: [], vouchers: [], partnerOpeningBalances: {} },
    document: { getElementById() { return null; }, addEventListener() {}, querySelectorAll() { return []; } },
    window: {},
    XLSX: null,
    showToast() {},
    saveState() {},
    formatVND: v => String(v),
    extractIdFromParentheses: () => null,
    invalidatePartnerCache() {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "excel-integration.js" });
  return sandbox;
}

function loadUtils(initialPartners) {
  const source = fs.readFileSync(path.join(repoRoot, "js", "utils.js"), "utf8");
  const sandbox = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, Intl,
    state: { partners: initialPartners || [], products: [], vouchers: [] },
    document: { getElementById() { return null; }, addEventListener() {} },
    window: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "utils.js" });
  return sandbox;
}

function loadCloudSync() {
  const source = fs.readFileSync(path.join(repoRoot, "js", "cloud-sync.js"), "utf8");
  const store = new Map();
  const sandbox = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    document: { getElementById() { return null; }, addEventListener() {} },
    state: { partners: [], vouchers: [], products: [] },
    window: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "cloud-sync.js" });
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
  // Vai trò customer: Nợ 331 (chi hoàn tiền cho khách) tính vào PS Có (giảm phải thu)
  // để giữ bất biến T-account: Đầu kỳ + PS Nợ − PS Có = Cuối kỳ.
  assert.equal(kh.debitTrans, 1100000, "PS Nợ = phát sinh Nợ 131 (doanh thu + thuế)");
  assert.equal(kh.creditTrans, 200000, "PS Có = Nợ 331 hoàn tiền khách, giảm phải thu");
  assert.equal(kh.closingDebit, 900000, "net receivable after refund payment on 331");
  assert.equal(kh.openingDebit + kh.debitTrans - kh.creditTrans, kh.closingDebit, "T-account invariant holds");
}

function testDebtNoticeUsesSameLedgerAsOverview() {
  const ctx = loadDebtModule();
  const partner = { id: "36/30HOANGVANTHU(CH)", name: "Cty Không Gian Xanh", type: "project" };
  ctx.state.partners = [partner];
  ctx.state.vouchers = [
    {
      id: "BH-TOTAL", type: "sales", date: "2026-07-01", partnerId: partner.id,
      entries: [{ debit: "131", credit: "511", amount: 60002317 }]
    },
    {
      id: "PT-A", type: "receipt", date: "2026-07-02", partnerId: partner.id,
      entries: [{ debit: "111", credit: "131", amount: 45000000 }]
    },
    {
      id: "PC-A", type: "payment", date: "2026-07-03", partnerId: partner.id,
      entries: [{ debit: "331", credit: "111", amount: 30000000 }]
    }
  ];

  const overview = ctx.calculatePartnerDebts("2026-01-01", "2026-07-31")
    .find(row => row.id === partner.id);
  const ledger = ctx.calculatePartnerDebtLedger([partner], "2026-01-01", "2026-07-31", "customer");

  assert.equal(overview.debitTrans, 60002317, "overview customer debit includes Nợ 131");
  assert.equal(overview.creditTrans, 75000000, "overview customer credit includes Có 131 + Nợ 331");
  assert.equal(overview.closingCredit, 14997683, "overview closes on Có side");
  assert.equal(ledger.debitSum, overview.debitTrans, "notice ledger debit matches overview");
  assert.equal(ledger.creditSum, overview.creditTrans, "notice ledger credit matches overview");
  assert.equal(ledger.closingVal, -overview.closingCredit, "notice signed closing matches overview side and amount");
  assert.ok(ledger.ledgerEntries.some(entry => entry.id === "PC-A" && entry.credit === 30000000),
    "customer notice includes Nợ 331 payment as a credit-side debt movement");
}

function testMatchedVoucherWithoutEntriesUsesFallback() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "NCC01", name: "NCC A", type: "supplier" }];
  ctx.state.vouchers = [{
    id: "NK1", type: "purchase", date: "2026-01-10", partnerId: "NCC01",
    paymentMethod: "331", entries: [], totalAmount: 634000
  }];

  const row = ctx.calculatePartnerDebts().find(item => item.id === "NCC01");
  const ledger = ctx.calculatePartnerDebtLedger(ctx.state.partners, "", "", "supplier");
  assert.equal(row.closingCredit, 634000, "matched voucher fallback contributes to overview");
  assert.equal(ledger.closingVal, 634000, "matched voucher fallback contributes to notice/export ledger");
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

function testUnmatchedEmptyEntriesFallback() {
  const ctx = loadDebtModule();
  ctx.state.partners = [];
  ctx.state.vouchers = [
    {
      id: "NK1", type: "purchase", date: "2026-01-10", partnerId: "Mua le Dai thanh",
      paymentMethod: "331", entries: [], totalAmount: 634000
    }
  ];

  const debts = ctx.calculatePartnerDebts();
  const unmatched = debts.find(d => d.id === "__UNMATCHED__");
  assert.ok(unmatched, "unmatched bucket with empty entries");
  assert.equal(unmatched.closingCredit, 634000, "synthesized 331 debt from paymentMethod");
  const extracted = ctx.extractLedgerAmountsFromVoucher(ctx.state.vouchers[0], "both");
  assert.equal(extracted.creditAmount, 634000, "ledger extraction uses fallback entries");
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

function installDebtTestDOM(ctx) {
  const elements = new Map();
  const makeElement = () => {
    const el = { children: [], style: {}, value: "", checked: false,
      classList: { add() {}, remove() {} }, setAttribute() {},
      appendChild(child) { this.children.push(child); } };
    let html = "";
    Object.defineProperty(el, "innerHTML", {
      get() { return html; },
      set(value) { html = value; this.children = []; }
    });
    return el;
  };
  ctx.document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  ctx.document.createElement = makeElement;
  ctx.document.querySelectorAll = () => [];
  ctx.formatDateDisplay = value => value;
  ctx.renderEmptyState = (el, columns, message) => { el.innerHTML = message; };
  return elements;
}

function testFallbackDoesNotDeductPaymentsTwice() {
  for (const matched of [true, false]) {
    for (const paid of [400, 1000]) {
      const ctx = loadDebtModule();
      const partner = { id: "KH-FALLBACK", name: "Fallback customer", type: "retail" };
      ctx.state.partners = matched ? [partner] : [];
      ctx.state.vouchers = [
        { id: "BH-FALLBACK", type: "sales", date: "2026-09-01", partnerId: partner.id,
          paymentMethod: "131", totalAmount: 1000, remainingDebt: 1000 - paid, entries: [] },
        { id: "PT-FALLBACK", type: "receipt", date: "2026-09-02", partnerId: partner.id,
          amount: paid, entries: [{ debit: "111", credit: "131", amount: paid }] }
      ];
      const row = ctx.calculatePartnerDebts().find(d => d.id === (matched ? partner.id : "__UNMATCHED__"));
      const label = `${matched ? "matched" : "orphan"}, paid ${paid}`;
      assert.equal(row.debitTrans, 1000, `${label}: original invoice amount is posted`);
      assert.equal(row.creditTrans, paid, `${label}: receipt is deducted once`);
      assert.equal(row.closingDebit, 1000 - paid, `${label}: outstanding balance is correct`);
      assert.equal(row.closingCredit, 0, `${label}: no artificial overpayment`);
      const ledger = ctx.calculatePartnerDebtLedger([partner]);
      assert.equal(ledger.closingVal, 1000 - paid, `${label}: ledger matches invoice less receipt`);
    }
  }
}

function testSupplierSalesVisibleInCustomerDebtTab() {
  const ctx = loadDebtModule();
  installDebtTestDOM(ctx);
  ctx.state.partners = [
    { id: "SUP-SALE", name: "Supplier with sales", type: "supplier" },
    { id: "SUP-ONLY", name: "Purchase-only supplier", type: "supplier" }
  ];
  ctx.state.vouchers = [
    { id: "BH-SUP", type: "sales", date: "2026-09-01", partnerId: "SUP-SALE",
      entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "NK-SUP", type: "purchase", date: "2026-09-01", partnerId: "SUP-ONLY",
      entries: [{ debit: "156", credit: "331", amount: 500 }] }
  ];
  const debts = ctx.calculatePartnerDebts();
  const sale = debts.find(d => d.id === "SUP-SALE");
  const purchase = debts.find(d => d.id === "SUP-ONLY");
  assert.equal(sale.has131, true, "131 activity is retained on debt row");
  assert.equal(sale.has331, false, "sale-only supplier has no 331 activity");
  assert.equal(purchase.has331, true, "331 activity is retained on debt row");
  assert.equal(purchase.has131, false, "purchase-only supplier has no 131 activity");
  ctx.renderDebtsTable = () => {};
  ctx.document.getElementById("debt-type-filter").value = "131";
  vm.runInContext("currentDebtsViewTab = 'project'", ctx);
  ctx.filterDebts();
  const ids = Array.from(vm.runInContext("filteredDebtsList.map(d => d.id)", ctx));
  assert.ok(ids.includes("SUP-SALE"), "customer tab and 131 filter include supplier's credit sale");
  assert.ok(!ids.includes("SUP-ONLY"), "purchase-only supplier stays outside customer tab");
}

function testOrphanOpeningBalancesRemainUnverified() {
  const ctx = loadDebtModule();
  ctx.state.partnerOpeningBalances = {
    "OLD-OPENING": { debit: 700, credit: 20 },
    "OLD-SALE": { debit: 300, credit: 0 }
  };
  ctx.state.vouchers = [{ id: "BH-ORPHAN", type: "sales", date: "2026-09-01", partnerId: "OLD-SALE",
    entries: [{ debit: "131", credit: "511", amount: 100 }] }];
  const row = ctx.calculatePartnerDebts().find(d => d.id === "__UNMATCHED__");
  assert.ok(row, "orphan opening records appear in unmatched audit bucket");
  assert.equal(row.orphanOpeningDebit, 1000, "unverified opening debit exposed separately");
  assert.equal(row.orphanOpeningCredit, 20, "unverified opening credit exposed separately");
  assert.ok(Array.isArray(row.orphanOpeningBalances), "individual orphan opening records exposed as an array");
  const openingRecord = row.orphanOpeningBalances.find(record => record.id === "OLD-OPENING");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(openingRecord)), { id: "OLD-OPENING", debit: 700, credit: 20 },
    "opening-only orphan keeps its original amount for reconciliation");
  assert.ok(row.orphanPartnerIds.includes("OLD-OPENING"), "opening-only orphan ID appears in audit bucket");
  assert.equal(row.openingDebit, 0, "unverified opening does not become calculated opening debt");
  assert.equal(row.openingCredit, 0, "unverified opening credit is not posted");
  assert.equal(row.closingDebit, 100, "closing reflects verified voucher movements only");
  assert.equal(row.closingCredit, 0, "unverified opening credit does not affect closing");
  ctx.state.vouchers = [];
  const openingOnly = ctx.calculatePartnerDebts().find(d => d.id === "__UNMATCHED__");
  assert.ok(openingOnly, "audit bucket survives without any orphan vouchers");
  assert.equal(openingOnly.closingDebit, 0, "opening-only audit has no calculated receivable");
}

function testMissingPartnerDebtAppearsInUnmatchedOrders() {
  const ctx = loadDebtModule();
  installDebtTestDOM(ctx);
  ctx.state.vouchers = [
    { id: "BH-NO-PARTNER", type: "sales", date: "2026-09-01", partnerId: "", totalAmount: 1000,
      paymentMethod: "131", entries: [{ debit: "131", credit: "511", amount: 1000 }] },
    { id: "BH-OLD-PARTNER", type: "sales", date: "2026-09-02", partnerId: "OLD-PARTNER", totalAmount: 2000,
      paymentMethod: "131", entries: [{ debit: "131", credit: "511", amount: 2000 }] },
    { id: "BH-MALFORMED", type: "sales", date: "2026-09-02", totalAmount: 3720,
      entries: [{ credit: "511", amount: 3720 }] }
  ];
  const bucket = ctx.calculatePartnerDebts().find(d => d.id === "__UNMATCHED__");
  assert.ok(bucket.orphanPartnerIds.includes(""), "missing partner is explicitly represented");
  assert.equal(bucket.closingDebit, 3000, "missing-partner debt is not silently dropped");
  ctx.switchPartnerLedgerTab = () => {};
  ctx.viewUnmatchedPartnerLedger();
  const entries = ctx.document.getElementById("partner-ledger-table-body").children.map(row => row.innerHTML).join("");
  assert.ok(entries.includes("BH-NO-PARTNER"), "missing-partner voucher appears in unmatched ledger");
  assert.ok(entries.includes("BH-MALFORMED"), "malformed sale is visible for audit without fabricating debt");
  ctx.renderPartnerLedgerOrders();
  const orders = ctx.document.getElementById("partner-ledger-orders-body").children.map(row => row.innerHTML).join("");
  assert.ok(orders.includes("BH-NO-PARTNER"), "missing-partner sale appears when opening Orders tab");
  assert.ok(orders.includes("BH-OLD-PARTNER"), "orphan sale appears when opening Orders tab");
}

function testOverviewAndDetailedExportKeepUnmatchedDebt() {
  const ctx = loadDebtModule();
  installDebtTestDOM(ctx);
  ctx.state.partners = [{ id: "KH", name: "Customer", type: "retail" }];
  ctx.state.partnerOpeningBalances = { "OLD-OPENING": { debit: 700, credit: 20 } };
  ctx.state.vouchers = [
    { id: "BH-MATCHED", type: "sales", date: "2026-09-01", partnerId: "KH",
      entries: [{ debit: "131", credit: "511", amount: 100 }] },
    { id: "BH-UNMATCHED", type: "sales", date: "2026-09-01", partnerId: "OLD",
      entries: [{ debit: "131", credit: "511", amount: 50 }] }
  ];
  ctx.renderDebtOverview(ctx.calculatePartnerDebts());
  const kpis = ctx.document.getElementById("debt-overview-kpis").innerHTML;
  assert.match(kpis, /kpi-value font-numeric">150<\/span>/,
    "overview includes unmatched voucher balance, but not unverified opening");
  const audit = ctx.document.getElementById("debt-audit-content").innerHTML;
  assert.ok(audit.includes("700") && audit.includes("chưa cộng vào tổng"),
    "unverified opening is visible separately from recognized totals");

  vm.runInContext(fs.readFileSync(path.join(repoRoot, "xlsx.full.min.js"), "utf8"), ctx);
  const realXLSX = ctx.XLSX;
  let exported;
  const messages = [];
  ctx.XLSX = { ...realXLSX, writeFile: workbook => { exported = workbook; } };
  ctx.getLocalDateString = () => "2026-09-04";
  ctx.dateStrToSerial = value => Date.parse(value) / 86400000 + 25569;
  ctx.showToast = (...args) => messages.push(args);
  ctx.exportDebtsToExcelDetailed();
  assert.ok(exported, `detailed export must complete: ${JSON.stringify(messages)}`);
  const detail = realXLSX.utils.sheet_to_json(exported.Sheets["Chi tiet cong no"], { header: 1 });
  assert.ok(detail.some(row => row.includes("BH-MATCHED")), "matched voucher exported");
  assert.ok(detail.some(row => row.includes("BH-UNMATCHED")), "unmatched voucher exported");
  const openingAudit = realXLSX.utils.sheet_to_json(exported.Sheets["So du chua xac minh"], { header: 1 });
  assert.ok(openingAudit.some(row => row[0] === "OLD-OPENING" && row[1] === 700),
    "unverified opening has a separate audit sheet");
  assert.ok(!messages.some(message => message[1] === "danger"), "export raises no error toast");
}

function testGroupedOrdersUseEveryPartnerAndDateRange() {
  const ctx = loadDebtModule();
  installDebtTestDOM(ctx);
  ctx.state.partners = [
    { id: "GROUP-A", name: "Company A", type: "enterprise" },
    { id: "GROUP-B", name: "Company B", type: "project" }
  ];
  ctx.state.vouchers = [
    { id: "BH-A", type: "sales", date: "2026-09-01", partnerId: "GROUP-A", totalAmount: 100, paymentMethod: "131", entries: [] },
    { id: "BH-B", type: "sales", date: "2026-09-02", partnerId: "GROUP-B", totalAmount: 200, paymentMethod: "131", entries: [] },
    { id: "BH-OLD", type: "sales", date: "2026-08-01", partnerId: "GROUP-B", totalAmount: 50, paymentMethod: "131", entries: [] }
  ];
  ctx.document.getElementById("debt-period-filter").value = "custom";
  ctx.document.getElementById("debt-start-date").value = "2026-09-01";
  ctx.document.getElementById("debt-end-date").value = "2026-09-30";
  ctx.viewLedgerByIds(["GROUP-A", "GROUP-B"], "Group");
  ctx.switchPartnerLedgerTab("orders");
  const html = ctx.document.getElementById("partner-ledger-orders-body").children.map(row => row.innerHTML).join("");
  assert.ok(html.includes("BH-A") && html.includes("BH-B"), "group Orders includes every member ID");
  assert.ok(!html.includes("BH-OLD"), "group Orders respects ledger period");
  assert.equal(ctx.calculatePartnerDebts().find(d => d.id === "GROUP-A").supplierReceivable, 0);
}

function testOrphan331ExportPreservesCreditDirection() {
  const ctx = loadDebtModule();
  installDebtTestDOM(ctx);
  ctx.state.vouchers = [{ id: "NK-ORPHAN", type: "purchase", partnerId: "OLD-NCC", date: "2026-09-01",
    entries: [{ debit: "156", credit: "331", amount: 100 }] }];
  assert.equal(ctx.calculatePartnerDebts()[0].closingCredit, 100);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "xlsx.full.min.js"), "utf8"), ctx);
  const xlsx = ctx.XLSX;
  let exported;
  ctx.XLSX = { ...xlsx, writeFile: wb => { exported = wb; } };
  ctx.getLocalDateString = () => "2026-09-04";
  ctx.dateStrToSerial = value => Date.parse(value) / 86400000 + 25569;
  ctx.exportDebtsToExcelDetailed();
  assert.ok(exported);
  const row = xlsx.utils.sheet_to_json(exported.Sheets["Chi tiet cong no"], { header: 1 })
    .find(values => values[1] === "NK-ORPHAN");
  assert.deepStrictEqual(Array.from(row.slice(4, 6)), [0, 100], "orphan purchase keeps credit331 direction in export");
  const total = xlsx.utils.sheet_to_json(exported.Sheets["Chi tiet cong no"], { header: 1 }).find(values => String(values[2]).includes("không bù trừ"));
  assert.deepStrictEqual(Array.from(total.slice(6, 8)), [0, 100], "orphan closing credit retained in export totals");
  ctx.state.vouchers.push({ id: "BH-ORPHAN", type: "sales", partnerId: "OLD-KH", date: "2026-09-01",
    entries: [{ debit: "131", credit: "511", amount: 150 }] });
  const mixed = ctx.calculatePartnerDebts()[0];
  assert.equal(mixed.debitTrans, 150);
  assert.equal(mixed.creditTrans, 100);
  assert.equal(mixed.closingDebit, 150, "unrelated orphan customer receivable is not offset");
  assert.equal(mixed.closingCredit, 100, "unrelated orphan supplier payable is not offset");
}

function testSupplierReceivableKpisDoNotOverlap() {
  const ctx = loadDebtModule();
  installDebtTestDOM(ctx);
  ctx.state.partners = [{ id: "BOTH", type: "supplier", name: "Both" }, { id: "NCC", type: "supplier", name: "Supplier" }];
  ctx.state.vouchers = [
    { id: "BH", type: "sales", partnerId: "BOTH", entries: [{ debit: "131", credit: "511", amount: 100 }] },
    { id: "PC1", type: "payment", partnerId: "BOTH", entries: [{ debit: "331", credit: "111", amount: 50 }] },
    { id: "PC2", type: "payment", partnerId: "NCC", entries: [{ debit: "331", credit: "111", amount: 20 }] }
  ];
  ctx.renderDebtOverview(ctx.calculatePartnerDebts());
  const html = ctx.document.getElementById("debt-overview-kpis").innerHTML;
  const values = Array.from(html.matchAll(/kpi-value font-numeric">([^<]+)</g), match => Number(match[1]));
  assert.equal(values[0], 150, "main receivable includes both-role net debt");
  assert.equal(values[4], 20, "separate supplier-only KPI excludes the both-role amount already counted");
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

  // Thu nốt phần còn lại → remainingDebt phải về 0
  ctx.state.vouchers.push({
    id: "PT2", type: "receipt", date: "2026-01-20", partnerId: "KH01", amount: 600000,
    paymentMethod: "111", isImported: false, entries: []
  });
  ctx.recalculateAccounting(false);
  assert.equal(sale.remainingDebt, 0, "full settlement zeroes remainingDebt");
}

function testResolvePartnerCreatesAndRegisters() {
  const ctx = loadExcelIntegration([{ id: "KH_LONG", name: "Anh Long Quận 7", type: "retail" }]);

  // Free-text mới → tạo và ĐĂNG KÝ vào state.partners (Bug B)
  const created = ctx.resolvePartner("Anh Bảy Xây Dựng");
  assert.ok(created && created.id, "free-text partner is created");
  assert.ok(ctx.state.partners.some(p => p.id === created.id), "created partner registered in state.partners");
  assert.equal(created.type, "retail", "default auto-create type is retail");

  // Gọi lại cùng tên → trả về đúng đối tác cũ, không tạo trùng
  const again = ctx.resolvePartner("Anh Bảy Xây Dựng");
  assert.equal(again.id, created.id, "second resolve returns same partner, no duplicate");

  // Ngữ cảnh NCC truyền type supplier
  const supplier = ctx.resolvePartner("NCC Xi Măng Hà Tiên", "supplier");
  assert.equal(supplier.type, "supplier", "supplier context creates supplier-typed partner");

  // Bug E: KHÔNG fuzzy substring — "Long" không được gán vào "Anh Long Quận 7"
  const notFuzzy = ctx.resolvePartner("Long");
  assert.notEqual(notFuzzy.id, "KH_LONG", "substring input must not fuzzy-match existing partner");
}

function testRetailPeriodImportDoesNotForceCash() {
  const ctx = loadExcelIntegration([]);
  assert.equal(
    ctx.inferImportedPaymentMethod("sales", "Bán hàng", "Bán Lẻ T06/2026"),
    "131",
    "period retail partner name must not force a credit sale to cash"
  );
  assert.equal(
    ctx.inferImportedPaymentMethod("sales", "Thu TIỀN MẶT", "Bán Lẻ T06/2026"),
    "111",
    "explicit cash description remains cash"
  );
  assert.equal(ctx.inferImportedPaymentMethod("purchase", "Nhập hàng", "Bán Lẻ T06/2026"), "331");
  assert.equal(ctx.inferImportedPaymentMethod("receipt", "Thu nợ", "Bán Lẻ T06/2026"), "111");
}

function testGetPartnerForVoucherStrict() {
  const ctx = loadUtils([{ id: "P1", name: "Nhà máy ABCD Việt Nam", type: "supplier" }]);
  const voucher = { partnerId: "KH mới (ABCD)", partnerName: "" };

  // Chế độ mặc định (hiển thị/tra cứu): fuzzy substring vẫn tìm ra P1
  const fuzzy = ctx.getPartnerForVoucher(voucher);
  assert.ok(fuzzy && fuzzy.id === "P1", "display lookup keeps fuzzy fallback");

  // Chế độ strict (dùng khi GHI đè partnerId): không chấp nhận fuzzy match
  const strict = ctx.getPartnerForVoucher(voucher, { strict: true });
  assert.equal(strict, null, "strict mode rejects fuzzy substring match (Bug E)");

  // Strict vẫn chấp nhận khớp chính xác theo ID
  const exact = ctx.getPartnerForVoucher({ partnerId: "P1" }, { strict: true });
  assert.ok(exact && exact.id === "P1", "strict mode accepts exact ID match");
}

function testOpeningBalanceTimestampMerge() {
  const ctx = loadCloudSync();
  const merge = ctx.cloudSyncMergeMetadata;
  assert.equal(typeof merge, "function", "cloudSyncMergeMetadata should exist");

  const localState = {
    _lastModified: 1000, // local snapshot cũ hơn cloud ở mức document
    partnerOpeningBalances: {
      P_LOCAL_NEWER: { debit: 500, credit: 0 },
      P_CLOUD_NEWER: { debit: 1, credit: 0 },
      P_LEGACY: { debit: 77, credit: 0 }
    },
    partnerOpeningBalanceTs: { P_LOCAL_NEWER: 5000, P_CLOUD_NEWER: 1000 }
  };
  const cloudState = {
    _lastModified: 2000,
    partnerOpeningBalances: {
      P_LOCAL_NEWER: { debit: 100, credit: 0 },
      P_CLOUD_NEWER: { debit: 2, credit: 0 },
      P_LEGACY: { debit: 88, credit: 0 },
      P_CLOUD_ONLY: { debit: 9, credit: 0 }
    },
    partnerOpeningBalanceTs: { P_LOCAL_NEWER: 3000, P_CLOUD_NEWER: 4000 }
  };

  const merged = merge(localState, cloudState);
  const ob = merged.partnerOpeningBalances;
  // Sửa local mới hơn per-key phải thắng dù cloud _lastModified doc-level mới hơn (Gap 2)
  assert.equal(ob.P_LOCAL_NEWER.debit, 500, "newer local per-key edit survives stale cloud pull");
  assert.equal(ob.P_CLOUD_NEWER.debit, 2, "newer cloud per-key edit wins");
  // Migration: key cũ chưa có timestamp (định dạng cũ) vẫn được giữ, không mất
  assert.ok(ob.P_LEGACY, "legacy un-timestamped key survives merge");
  assert.ok(ob.P_CLOUD_ONLY && ob.P_CLOUD_ONLY.debit === 9, "cloud-only key is kept");
  // Sidecar timestamps được giữ lại cho lần merge sau
  assert.equal(merged.partnerOpeningBalanceTs.P_LOCAL_NEWER, 5000, "winning local ts preserved");
  assert.equal(merged.partnerOpeningBalanceTs.P_CLOUD_NEWER, 4000, "winning cloud ts preserved");
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

  // Trả toàn bộ hàng → TK 331 phải về 0 (tổng Nợ 331 = tổng Có 331)
  let debit331 = 0, credit331 = 0;
  ctx.state.vouchers.forEach(v => (v.entries || []).forEach(e => {
    if (e.debit && String(e.debit).startsWith("331")) debit331 += e.amount;
    if (e.credit && String(e.credit).startsWith("331")) credit331 += e.amount;
  }));
  assert.equal(debit331, credit331, "full purchase return nets 331 to zero under TT133");
}

function testSupplierOverpaymentShowsAsReceivable() {
  const ctx = loadDebtModule();
  ctx.state.partners = [{ id: "NCC01", name: "NCC Sơn", type: "supplier" }];
  ctx.state.vouchers = [
    {
      id: "NK1", type: "purchase", date: "2026-01-01", partnerId: "NCC01",
      entries: [{ debit: "156", credit: "331", amount: 500000 }]
    },
    {
      id: "PC1", type: "payment", date: "2026-01-05", partnerId: "NCC01",
      entries: [{ debit: "331", credit: "111", amount: 700000 }]
    }
  ];
  const debts = ctx.calculatePartnerDebts();
  const ncc = debts.find(d => d.id === "NCC01");
  assert.equal(ncc.closingCredit, 0, "no payable left after overpayment");
  assert.equal(ncc.closingDebit, 200000, "supplier overpayment surfaces as receivable (closingDebit)");
}

async function runAll() {
  testBothAccountsPerPartner();
  testDebtNoticeUsesSameLedgerAsOverview();
  testMatchedVoucherWithoutEntriesUsesFallback();
  testUnmatchedPartnerBucket();
  testUnmatchedEmptyEntriesFallback();
  testDualRoleBothType();
  testFallbackDoesNotDeductPaymentsTwice();
  testSupplierSalesVisibleInCustomerDebtTab();
  testOrphanOpeningBalancesRemainUnverified();
  testMissingPartnerDebtAppearsInUnmatchedOrders();
  testOverviewAndDetailedExportKeepUnmatchedDebt();
  testGroupedOrdersUseEveryPartnerAndDateRange();
  testOrphan331ExportPreservesCreditDirection();
  testSupplierReceivableKpisDoNotOverlap();
  testSupplierOverpaymentShowsAsReceivable();
  testFifoReceiptAllocatesSales();
  testDebtAdjustmentPreserved();
  testTT133PurchaseReturnVat();
  testRetailPeriodImportDoesNotForceCash();
  testResolvePartnerCreatesAndRegisters();
  testGetPartnerForVoucherStrict();
  testOpeningBalanceTimestampMerge();
  console.log("debt-tests.js: all tests passed");
}

runAll().catch(err => {
  console.error("debt-tests.js FAILED:", err);
  process.exit(1);
});
