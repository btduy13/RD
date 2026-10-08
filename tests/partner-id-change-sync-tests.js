// Changing a partner code must reach every station (vouchers, tombstone, opening balance).
// Plain node + assert; real js/cloud-sync.js and real js/modules/partners.js functions in vm.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { FakeServer, makeStation } = require("./helpers/fake-versioned-cloud");

const SRC = process.env.PARTNERS_SRC || path.join(__dirname, "..", "js", "modules", "partners.js");
const src = fs.readFileSync(SRC, "utf8");
function fnSource(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, "function " + name + " not found");
  const j = src.indexOf("\nfunction ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
function loadPartnerFns(station) {
  const names = ["stampPartnerSyncFields", "recordPartnerOpeningDeletion", "propagatePartnerIdChange",
    "autoExtractPhonesAndCleanAddresses", "autoExtractPhonesFromNamesAndClean"];
  const code = names.filter(n => src.includes("function " + n + "(")).map(fnSource).join("\n");
  station.run("function saveState() {}\n" + code);
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function seededPair() {
  const server = new FakeServer();
  const A = makeStation("A", server), B = makeStation("B", server);
  await A.startup(); await B.startup();
  const t0 = Date.now() - 100000;
  A.state.partners.push({ id: "KL001", name: "Anh Ba", type: "retail", _updatedAt: t0 });
  A.state.vouchers.push({ id: "BH-0001", type: "sales", partnerId: "KL001", partnerName: "Anh Ba", totalAmount: 500, _updatedAt: t0, _sessionId: "session-A" });
  A.state.partnerOpeningBalances.KL001 = { debit: 1000, credit: 0 };
  A.state.partnerOpeningBalanceTs.KL001 = t0;
  A.state._lastModified = t0;
  await A.push(); await B.pull();
  assert.strictEqual(B.state.vouchers[0].partnerId, "KL001", "precondition");
  loadPartnerFns(A);
  return { server, A, B };
}

test("partner code rename reaches station B: vouchers, tombstone, opening balance", async () => {
  const { A, B } = await seededPair();
  A.run(`propagatePartnerIdChange("KL001", "CT-ANHBA", "Anh Ba (CT)")`);
  const idx = A.state.partners.findIndex(p => p.id === "KL001");
  A.state.partners[idx] = { id: "CT-ANHBA", name: "Anh Ba (CT)", type: "project", _updatedAt: Date.now() };
  A.state._lastModified = Date.now();
  await A.push();
  // unrelated B change then B pull+push, then A pulls (full round trip)
  B.state.products.push({ id: "SP1", name: "X", _updatedAt: Date.now(), _sessionId: "session-B" });
  await B.pull(); await B.push(); await A.pull();
  for (const S of [A, B]) {
    assert.deepStrictEqual(S.state.partners.map(p => p.id), ["CT-ANHBA"], S.name + " partners");
    assert.strictEqual(S.state.vouchers[0].partnerId, "CT-ANHBA", S.name + " voucher partnerId");
    assert.strictEqual(S.state.vouchers[0].partnerName, "Anh Ba (CT)", S.name + " voucher partnerName");
    assert.deepStrictEqual(Object.keys(S.state.partnerOpeningBalances), ["CT-ANHBA"], S.name + " opening keys (no doubling)");
    assert.strictEqual(S.state.partnerOpeningBalances["CT-ANHBA"].debit, 1000);
  }
});

test("child partner parentId re-pointing is stamped", async () => {
  const { A } = await seededPair();
  A.state.partners.push({ id: "CT1", name: "Site", type: "project", parentId: "KL001", _updatedAt: 5 });
  A.run(`propagatePartnerIdChange("KL001", "KL002", "Anh Ba")`);
  const c = A.state.partners.find(p => p.id === "CT1");
  assert.strictEqual(c.parentId, "KL002");
  assert.ok(c._updatedAt > 5);
  assert.strictEqual(c._sessionId, "session-A");
  const v = A.state.vouchers[0];
  assert.strictEqual(v._sessionId, "session-A");
  assert.ok(A.state.deletedIds.includes("KL001"));
  assert.ok(A.state.partnerOpeningBalanceTs.KL001 >= A.state.partnerOpeningBalanceTs.KL002, "old key keeps a deletion ts");
});

test("partner delete records an opening-balance deletion timestamp", async () => {
  const { A } = await seededPair();
  const before = A.state.partnerOpeningBalanceTs.KL001;
  A.run(`recordPartnerOpeningDeletion("KL001")`);
  assert.ok(!("KL001" in A.state.partnerOpeningBalances));
  assert.ok(A.state.partnerOpeningBalanceTs.KL001 > before);
});

test("phone/name auto-extraction stamps only partners it changes", async () => {
  const { A } = await seededPair();
  A.state.partners.length = 0;
  A.state.partners.push(
    { id: "P1", name: "Cty A", address: "12 Le Loi 0901234567", phone: "", _updatedAt: 1 },
    { id: "P2", name: "Cty B - 0912345678", phone: "", address: "x", _updatedAt: 1 },
    { id: "P3", name: "Cty C", phone: "0900000000", address: "no phone", _updatedAt: 1 });
  assert.strictEqual(A.run("autoExtractPhonesAndCleanAddresses()"), 1);
  assert.strictEqual(A.run("autoExtractPhonesFromNamesAndClean()"), 1);
  const [p1, p2, p3] = A.state.partners;
  assert.ok(p1._updatedAt > 1 && p1._sessionId === "session-A", "p1 stamped");
  assert.strictEqual(p2.name, "Cty B");
  assert.ok(p2._updatedAt > 1 && p2._sessionId === "session-A", "p2 stamped");
  assert.strictEqual(p3._updatedAt, 1, "unchanged partner not stamped");
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log("PASS", t.name); }
    catch (e) { failed++; console.log("FAIL", t.name, "\n  ", e.message); }
  }
  await wait(0);
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
