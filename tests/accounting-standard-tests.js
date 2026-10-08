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

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("ok - " + name); }
    catch (err) { failed++; console.error("FAIL - " + name + "\n  " + (err && err.message)); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} accounting-standard tests passed`);
})();
