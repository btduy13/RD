// TT133 / TT200 regime switch: confirmation, recalculation, sync round-trip, posting difference.
// Plain node + assert.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { FakeServer, makeStation } = require("./helpers/fake-versioned-cloud");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function context(files, extra = {}) {
  const ctx = {
    console, setTimeout, clearTimeout,
    document: { addEventListener() {}, getElementById() { return null; } },
    state: { accountingStandard: "TT200", products: [], partners: [], vouchers: [], initialBalances: {}, partnerOpeningBalances: {} },
    DEFAULT_DATA: { products: [] }, saveState() {}, refreshUI() {}, safeParseFloat: Number
  };
  Object.assign(ctx, extra);
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ctx));
  return ctx;
}

function settingsHarness(confirmResult, startStandard) {
  const calls = { confirm: [], save: 0, recalc: 0, ui: 0, toast: [] };
  const c = context(["js/modules/settings.js"], {
    showConfirmModal: async opts => { calls.confirm.push(opts); return confirmResult; },
    saveState: () => { calls.save++; },
    recalculateAccounting: () => { calls.recalc++; },
    showToast: (m) => { calls.toast.push(m); },
    executeSaveState() {}
  });
  const el = () => ({ innerText: "", value: "", classList: { add() {}, remove() {} } });
  c.document.getElementById = () => el();
  c.state.accountingStandard = startStandard;
  return { c, calls };
}

test("declined confirmation leaves the standard unchanged and does not save", async () => {
  const { c, calls } = settingsHarness(false, "TT200");
  await c.setAccountingStandard("TT133");
  assert.strictEqual(c.state.accountingStandard, "TT200");
  assert.strictEqual(calls.confirm.length, 1);
  assert.strictEqual(calls.save, 0);
  assert.strictEqual(calls.recalc, 0);
});

test("confirmed switch changes the standard, saves and recalculates; message names all stations", async () => {
  const { c, calls } = settingsHarness(true, "TT200");
  await c.setAccountingStandard("TT133");
  assert.strictEqual(c.state.accountingStandard, "TT133");
  assert.strictEqual(calls.save, 1);
  assert.strictEqual(calls.recalc, 1);
  assert.strictEqual(calls.confirm.length, 1);
  assert.ok(/mọi trạm/i.test(calls.confirm[0].message), "message says it applies to every station");
  assert.ok(/tính toán lại|ghi sổ lại/i.test(calls.confirm[0].message), "message says books are recalculated");
});

test("selecting the already-active standard is a no-op", async () => {
  const { c, calls } = settingsHarness(true, "TT133");
  await c.setAccountingStandard("TT133");
  assert.strictEqual(calls.confirm.length, 0);
  assert.strictEqual(calls.save, 0);
  assert.strictEqual(calls.recalc, 0);
  assert.strictEqual(c.state.accountingStandard, "TT133");
});

test("switched standard survives a two-station sync round-trip", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server, { companyName: "Cong ty RD", accountingStandard: "TT200", _lastModified: Date.now() - 50000 });
  await A.startup();
  A.state.vouchers.push({ id: "PT1", type: "receipt", amount: 1, _updatedAt: Date.now() - 40000, _sessionId: "session-A" });
  await A.push();
  const B = makeStation("B", server);
  await B.startup();
  assert.strictEqual(B.state.accountingStandard, "TT200", "precondition");
  A.state.accountingStandard = "TT133";
  A.state._lastModified = Date.now();
  await A.push();
  assert.strictEqual(server.rows.get("metadata").data.accountingStandard, "TT133", "cloud holds TT133");
  await B.pull({ force: false });
  assert.strictEqual(B.state.accountingStandard, "TT133", "station B received the switch");
  // an unrelated later push from B must not revert it
  B.state.vouchers.push({ id: "PT2", type: "receipt", amount: 2, _updatedAt: Date.now(), _sessionId: "session-B" });
  B.state._lastModified = Date.now();
  await B.push();
  await A.pull({ force: false });
  assert.strictEqual(A.state.accountingStandard, "TT133");
  assert.strictEqual(server.rows.get("metadata").data.accountingStandard, "TT133");
});

function postEscrow(standard) {
  const c = context(["js/core/accounting-engine.js", "js/accounting.js"]);
  c.state.accountingStandard = standard;
  c.state.vouchers = [
    { id: "E1", type: "escrow_pay", date: "2026-01-02", paymentMethod: "111", amount: 500, description: "Ky quy", isManual: true },
    { id: "E2", type: "escrow_receive", date: "2026-01-03", paymentMethod: "111", amount: 700, description: "Nhan ky quy", isManual: true }
  ];
  c.recalculateAccounting(false);
  const acct = id => c.state.vouchers.find(v => v.id === id).entries[0];
  return { pay: acct("E1"), receive: acct("E2") };
}

test("recalculation posts escrow to 244/344 under TT200 and 1386/3386 under TT133", async () => {
  const t200 = postEscrow("TT200");
  assert.strictEqual(t200.pay.debit, "244");
  assert.strictEqual(t200.receive.credit, "344");
  const t133 = postEscrow("TT133");
  assert.strictEqual(t133.pay.debit, "1386");
  assert.strictEqual(t133.receive.credit, "3386");
});

// ---- Final review F5: manual receipt/payment deposit accounts follow the standard ----
function cashDepositContext(standard) {
  const c = context(["js/core/accounting-engine.js", "js/accounting.js"]);
  c.state.accountingStandard = standard;
  c.state.vouchers = [
    { id: "PT1", type: "receipt", date: "2026-01-02", paymentMethod: "111", amount: 700, description: "Nhan ky quy", isManual: true,
      entries: [{ debit: "111", credit: "344", amount: 700, desc: "Nhan ky quy" }] },
    { id: "PC1", type: "payment", date: "2026-01-03", paymentMethod: "111", amount: 500, description: "Chi ky quy", isManual: true,
      entries: [{ debit: "244", credit: "111", amount: 500, desc: "Chi ky quy" }] },
    { id: "PT2", type: "receipt", date: "2026-01-04", paymentMethod: "111", amount: 90, description: "Thu no", isManual: true,
      entries: [{ debit: "111", credit: "131", amount: 90, desc: "Thu no" }] }
  ];
  c.state.initialBalances = {
    "111": { type: "debit", balance: 0 }, "112": { type: "debit", balance: 0 }, "131": { type: "debit", balance: 0 },
    "244": { type: "debit", balance: 0 }, "1386": { type: "debit", balance: 0 },
    "344": { type: "credit", balance: 0 }, "3386": { type: "credit", balance: 0 }
  };
  return c;
}
const entryOf = (c, id) => c.state.vouchers.find(v => v.id === id).entries[0];

test("manual receipt/payment deposit entries post to 3386/1386 under TT133 and 344/244 under TT200", async () => {
  const t133 = cashDepositContext("TT133");
  t133.recalculateAccounting(false);
  assert.strictEqual(entryOf(t133, "PT1").credit, "3386");
  assert.strictEqual(entryOf(t133, "PC1").debit, "1386");
  assert.strictEqual(t133.getAccountBalance("3386"), 700, "received deposit reaches the TT133 account read by reports");
  assert.strictEqual(t133.getAccountBalance("1386"), 500);
  assert.strictEqual(t133.getAccountBalance("344"), 0);
  assert.strictEqual(t133.getAccountBalance("244"), 0);
  assert.strictEqual(entryOf(t133, "PT2").credit, "131", "non-deposit accounts untouched");
  const t200 = cashDepositContext("TT200");
  // TT200 3386 on a payment debit is unemployment insurance, never a deposit
  t200.state.vouchers.push({ id: "PC2", type: "payment", date: "2026-01-05", paymentMethod: "112", amount: 40, description: "Nop BHTN", isManual: true,
    entries: [{ debit: "3386", credit: "112", amount: 40, desc: "Nop BHTN" }] });
  t200.recalculateAccounting(false);
  assert.strictEqual(entryOf(t200, "PT1").credit, "344");
  assert.strictEqual(entryOf(t200, "PC1").debit, "244");
  assert.strictEqual(entryOf(t200, "PC2").debit, "3386", "TT200 BHTN payment is not remapped");
  assert.strictEqual(t200.getAccountBalance("344"), 700);
  assert.strictEqual(t200.getAccountBalance("244"), 500);
});

test("switching the standard re-posts manual deposit entries consistently both ways", async () => {
  const c = cashDepositContext("TT133");
  c.recalculateAccounting(false);
  assert.strictEqual(entryOf(c, "PT1").credit, "3386");
  c.state.accountingStandard = "TT200";
  c.recalculateAccounting(false);
  assert.strictEqual(entryOf(c, "PT1").credit, "344");
  assert.strictEqual(entryOf(c, "PC1").debit, "244");
  assert.strictEqual(c.getAccountBalance("344"), 700);
  assert.strictEqual(c.getAccountBalance("3386"), 0);
  c.state.accountingStandard = "TT133";
  c.recalculateAccounting(false);
  assert.strictEqual(entryOf(c, "PT1").credit, "3386");
  assert.strictEqual(entryOf(c, "PC1").debit, "1386");
  assert.strictEqual(c.getAccountBalance("1386"), 500);
  assert.strictEqual(entryOf(c, "PT1").amount, 700, "amounts and other fields preserved");
  assert.strictEqual(entryOf(c, "PT1").debit, "111");
});

test("cash forms offer the deposit account of the active standard", async () => {
  const select = values => ({ value: "", options: values.map(v => ({ value: v, textContent: v })) });
  const els = { "receipt-credit": select(["131", "511", "344", "711"]), "payment-debit": select(["331", "156", "642", "244", "811"]) };
  const c = context(["js/core/accounting-engine.js", "js/accounting.js", "js/modules/cash.js"]);
  c.document.getElementById = id => els[id] || null;
  c.state.accountingStandard = "TT133";
  c.syncCashDepositAccountOptions();
  assert.deepStrictEqual(els["receipt-credit"].options.map(o => o.value), ["131", "511", "3386", "711"]);
  assert.deepStrictEqual(els["payment-debit"].options.map(o => o.value), ["331", "156", "642", "1386", "811"]);
  assert.ok(els["receipt-credit"].options[2].textContent.includes("3386"));
  c.state.accountingStandard = "TT200";
  c.syncCashDepositAccountOptions();
  assert.strictEqual(els["receipt-credit"].options[2].value, "344");
  assert.strictEqual(els["payment-debit"].options[3].value, "244");
  assert.ok(els["payment-debit"].options[3].textContent.includes("244"));
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("ok - " + name); }
    catch (err) { failed++; console.error("FAIL - " + name + "\n  " + (err && err.message)); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} accounting-standard tests passed`);
})();
