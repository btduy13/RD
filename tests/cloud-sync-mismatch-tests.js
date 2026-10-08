// Regression tests for cross-station sync mismatches (versioned-RPC mode).
// Plain node + assert; uses the in-memory fake server in tests/helpers.
const assert = require("assert");
const { FakeServer, makeStation } = require("./helpers/fake-versioned-cloud");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const META = {
  companyName: "Cong ty RD",
  taxCode: "0312345678",
  accountingStandard: "TT133",
  users: [{ username: "admin", name: "Admin", role: "admin" }, { username: "ketoan", name: "KT", role: "user" }],
  salesTemplatesData: [{ filename: "mau1.xlsx", rows: [1, 2] }]
};
const metaOf = s => ({
  companyName: s.state.companyName,
  accountingStandard: s.state.accountingStandard,
  users: (s.state.users || []).map(u => u.username),
  tpl: (s.state.salesTemplatesData || []).length
});
const EXPECTED = { companyName: "Cong ty RD", accountingStandard: "TT133", users: ["admin", "ketoan"], tpl: 1 };

async function seededPair() {
  const server = new FakeServer();
  const A = makeStation("A", server, { ...META, _lastModified: Date.now() - 50000 });
  await A.startup();
  A.state.vouchers.push({ id: "PT1", type: "receipt", amount: 1, _updatedAt: Date.now(), _sessionId: "session-A" });
  await A.push();
  const B = makeStation("B", server);
  await B.startup();
  assert.deepStrictEqual(metaOf(B), EXPECTED, "precondition: B holds full metadata after startup");
  return { server, A, B };
}

test("voucher-id reservation by another station does not wipe metadata on incremental pull", async () => {
  const { server, A, B } = await seededPair();
  const before = server.version;
  await A.run(`getCloudSafeVoucherId({ prefix: 'PT' })`);
  assert.ok(server.version > before, "reservation bumps server version");
  await B.pull({ reason: "poll", force: false });
  assert.deepStrictEqual(metaOf(B), EXPECTED);
  assert.strictEqual(B.run("lastSyncState.companyName"), "Cong ty RD");
  assert.strictEqual(B.run("lastSyncState.users.length"), 2);
});

test("a station that reserved an id then saves/pushes keeps cloud and local metadata intact", async () => {
  const { server, A, B } = await seededPair();
  const id = await A.run(`getCloudSafeVoucherId({ prefix: 'PT' })`);
  A.state.vouchers.push({ id, type: "receipt", amount: 2, _updatedAt: Date.now(), _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  await A.push();
  assert.deepStrictEqual(metaOf(A), EXPECTED);
  const cloudMeta = server.rows.get("metadata").data;
  assert.strictEqual(cloudMeta.companyName, "Cong ty RD");
  assert.strictEqual(cloudMeta.accountingStandard, "TT133");
  assert.strictEqual(cloudMeta.users.length, 2);
  await B.pull({ force: false });
  assert.deepStrictEqual(metaOf(B), EXPECTED);
  assert.ok(B.state.vouchers.some(v => v.id === id), "voucher still syncs");
});

test("an empty-data metadata row in a delta is not authoritative", async () => {
  const { server, B } = await seededPair();
  const orig = B.sandbox.__client.rpc;
  B.sandbox.__client.rpc = async (name, p) => {
    const res = await orig(name, p);
    if (name === "rd_sync_delta") res.data = [{ id: "metadata", data: {}, last_modified: server.version, sync_version: server.version }];
    return res;
  };
  server.version += 1; // some other change that bumps the workspace version
  await B.pull({ reason: "poll", force: false });
  assert.deepStrictEqual(metaOf(B), EXPECTED);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

test("initialBalances merge per account: stale station save does not revert another station's edit", async () => {
  const server = new FakeServer();
  const ib = { "131": { type: "debit", balance: 0 }, "156": { type: "debit", balance: 0 }, "331": { type: "credit", balance: 0 } };
  const A = makeStation("A", server, { initialBalances: ib, _lastModified: Date.now() - 60000 });
  await A.startup();
  A.state._lastModified = Date.now();
  await A.push();
  const B = makeStation("B", server);
  await B.startup();
  await sleep(5);
  A.state.initialBalances["131"].balance = 5000000;
  A.state._lastModified = Date.now();
  await A.push();
  await sleep(5);
  // B edits a different account locally, then saves an unrelated voucher before pulling A's edit
  B.state.initialBalances["156"].balance = 777;
  B.state.vouchers.push({ id: "PT9", type: "receipt", amount: 1, _updatedAt: Date.now(), _sessionId: "session-B" });
  B.state._lastModified = Date.now();
  await B.push();
  await A.pull();
  const cloud = server.rows.get("metadata").data.initialBalances;
  for (const [who, ibs] of [["A", A.state.initialBalances], ["B", B.state.initialBalances], ["cloud", cloud]]) {
    assert.strictEqual(ibs["131"].balance, 5000000, who + " keeps 131 opening");
    assert.strictEqual(ibs["156"].balance, 777, who + " keeps 156 opening");
  }
});

// ---- Task 3: clock skew / content-diff push / monotonic deletion stamps ----
const entityRowsSince = (server, fromIdx) => server.log.slice(fromIdx)
  .flatMap(e => e.ids.map(id => ({ station: e.station, id })))
  .filter(r => r.id !== "metadata" && r.id !== "sync_signal");
const deltaEntityIds = st => JSON.parse(JSON.stringify(st.run("computeDelta().rowsToUpsert.map(r => r.id)")))
  .filter(id => id !== "metadata" && id !== "sync_signal");

test("edit on a station whose clock is behind the previous writer is pushed (no _sessionId stamp)", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server, {}, { clockOffsetMs: 5 * 60000 });
  const B = makeStation("B", server, {}, { clockOffsetMs: 0 });
  await A.startup(); await B.startup();
  A.state.partners.push({ id: "KH01", name: "Khach 1", phone: "090", _updatedAt: A.run("Date.now()"), _sessionId: "session-A" });
  A.state._lastModified = A.run("Date.now()");
  await A.push(); await B.pull();
  const baselineTs = server.rows.get("part_KH01").data._updatedAt;
  // exactly what partners.js / debts.js do: _updatedAt = Date.now(), no _sessionId
  const p = B.state.partners.find(x => x.id === "KH01");
  p.phone = "0911111111"; p._updatedAt = B.run("Date.now()");
  B.state._lastModified = B.run("Date.now()");
  await B.push();
  const cloud = server.rows.get("part_KH01").data;
  assert.strictEqual(cloud.phone, "0911111111", "cloud receives B's edit");
  assert.ok(cloud._updatedAt > baselineTs, "pushed stamp is strictly greater than the baseline's");
  await A.pull();
  assert.strictEqual(A.state.partners.find(x => x.id === "KH01").phone, "0911111111", "A converges");
  await B.pull();
  assert.strictEqual(B.state.partners.find(x => x.id === "KH01").phone, "0911111111");
});

test("Excel re-import replacing a voucher without _updatedAt is pushed with a fresh stamp", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server), B = makeStation("B", server);
  await A.startup(); await B.startup();
  A.state.vouchers.push({ id: "HD001", type: "sales", totalAmount: 1000, isImported: true, _updatedAt: Date.now() - 5000, _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  await A.push(); await B.pull();
  const prevTs = server.rows.get("v_HD001").data._updatedAt;
  const idx = A.state.vouchers.findIndex(v => v.id === "HD001");
  A.state.vouchers[idx] = { id: "HD001", type: "sales", totalAmount: 1500, isImported: true };
  A.state._lastModified = Date.now();
  await A.push();
  const cloud = server.rows.get("v_HD001").data;
  assert.strictEqual(cloud.totalAmount, 1500);
  assert.ok(cloud._updatedAt > prevTs, "re-imported voucher stamped above the previous version");
  await B.pull();
  assert.strictEqual(B.state.vouchers.find(v => v.id === "HD001").totalAmount, 1500);
});

test("unchanged re-import, meta-only differences and equal-stamp recalcs are not pushed", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server);
  await A.startup();
  A.state.vouchers.push({ id: "HD002", type: "sales", totalAmount: 10, items: [{ q: 1 }], _updatedAt: Date.now(), _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  await A.push();
  const idx = A.state.vouchers.findIndex(v => v.id === "HD002");
  // same content, different key order, no _updatedAt/_sessionId, an undefined field
  A.state.vouchers[idx] = { items: [{ q: 1 }], totalAmount: 10, note: undefined, type: "sales", id: "HD002" };
  assert.deepStrictEqual(deltaEntityIds(A), [], "unchanged re-import");
  // meta-only difference at an older stamp
  A.state.vouchers[idx] = { id: "HD002", type: "sales", totalAmount: 10, items: [{ q: 1 }], _updatedAt: 1, _sessionId: "other" };
  assert.deepStrictEqual(deltaEntityIds(A), [], "meta-only difference");
  // derived-field recalc at an unchanged stamp is still not fanned out
  const baseTs = A.run("lastSyncState.vouchers[0]._updatedAt");
  A.state.vouchers[idx] = { id: "HD002", type: "sales", totalAmount: 10, items: [{ q: 1 }], cogsAmount: 7, _updatedAt: baseTs, _sessionId: "session-A" };
  assert.deepStrictEqual(deltaEntityIds(A), [], "equal-stamp recalc");
});

test("delete from a clock-behind station is stamped after the entity's last edit and applies everywhere", async () => {
  const server = new FakeServer();
  const C = makeStation("C", server, {}, { clockOffsetMs: 0 });
  const A = makeStation("A", server, {}, { clockOffsetMs: -3 * 60000 });
  const B = makeStation("B", server, {}, { clockOffsetMs: 0 });
  await C.startup(); await A.startup(); await B.startup();
  C.state.vouchers.push({ id: "BH0007", type: "sales", amount: 500, _updatedAt: C.run("Date.now()"), _sessionId: "session-C" });
  C.state._lastModified = C.run("Date.now()");
  await C.push();
  await A.pull(); await B.pull();
  const editTs = server.rows.get("v_BH0007").data._updatedAt;
  // A deletes X the way the voucher module does: remove + trackDeletedIds
  A.run(`state.vouchers = state.vouchers.filter(v => v.id !== 'BH0007'); trackDeletedIds(['BH0007'], 'voucher');`);
  await A.push();
  const row = server.rows.get("v_BH0007");
  assert.ok(row.data._deleted, "tombstone uploaded");
  assert.ok(row.last_modified > editTs, `tombstone ts ${row.last_modified} > last edit ${editTs}`);
  assert.ok(row.data._deletedAt > editTs, "_deletedAt follows last_modified");
  await B.pull({ force: false });
  assert.ok(!B.state.vouchers.some(v => v.id === "BH0007"), "B applies the delete");
  await C.pull({ force: false });
  assert.ok(!C.state.vouchers.some(v => v.id === "BH0007"), "C applies the delete");
  // a later full reconcile on B must not resurrect it
  await B.pull({ forceFull: true });
  assert.ok(!B.state.vouchers.some(v => v.id === "BH0007"));
  assert.deepStrictEqual(Array.from(B.run("cloudSyncGetRescueCandidateKeys()")), []);
  assert.ok(server.rows.get("v_BH0007").data._deleted, "cloud keeps the tombstone");
});

test("legacy skewed tombstone older than an unchanged local copy still deletes; unpushed local edit survives", async () => {
  const server = new FakeServer();
  const C = makeStation("C", server), B = makeStation("B", server), D = makeStation("D", server);
  await C.startup(); await B.startup(); await D.startup();
  const t = Date.now();
  C.state.vouchers.push({ id: "X1", amount: 1, _updatedAt: t, _sessionId: "session-C" }, { id: "X2", amount: 2, _updatedAt: t, _sessionId: "session-C" });
  C.state._lastModified = t;
  await C.push(); await B.pull(); await D.pull();
  // D edits X2 locally but has not pushed yet
  const x2 = D.state.vouchers.find(v => v.id === "X2");
  x2.amount = 22; x2._updatedAt = t + 10;
  // an old client stamped these tombstones with a clock 3 min behind
  const old = t - 180000;
  server.version += 1;
  for (const id of ["X1", "X2"]) {
    server.rows.set("v_" + id, { id: "v_" + id, data: { id, _deleted: true, _deletedAt: old }, last_modified: old, sync_version: server.version });
  }
  await B.pull({ force: false });
  assert.deepStrictEqual(B.state.vouchers.map(v => v.id), [], "B drops both unchanged copies");
  assert.strictEqual(B.run("lastSyncState.vouchers.length"), 0, "baseline drops them too");
  await D.pull({ force: false });
  assert.deepStrictEqual(D.state.vouchers.map(v => v.id), ["X2"], "D keeps its unpushed edit, drops X1");
  // full reconcile without baseline and without a pending write: no resurrection
  const E = makeStation("E", server, { vouchers: [{ id: "X1", amount: 1, _updatedAt: t, _sessionId: "session-C" }] });
  await E.startup();
  assert.ok(!E.state.vouchers.some(v => v.id === "X1"), "E applies the tombstone on full pull");
  assert.deepStrictEqual(Array.from(E.run("cloudSyncGetRescueCandidateKeys()")), []);
});

test("quiescent stations exchange zero entity upserts after convergence (no ping-pong)", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server, {}, { clockOffsetMs: 4 * 60000 });
  const B = makeStation("B", server, {}, { clockOffsetMs: -2 * 60000 });
  await A.startup(); await B.startup();
  for (let i = 0; i < 5; i++) {
    A.state.products.push({ id: "SP" + i, name: "P" + i, stock: i, _updatedAt: A.run("Date.now()"), _sessionId: "session-A" });
    A.state.vouchers.push({ id: "V" + i, type: "sales", amount: i, items: [{ productId: "SP" + i, qty: 1 }], _updatedAt: A.run("Date.now()"), _sessionId: "session-A" });
  }
  A.state._lastModified = A.run("Date.now()");
  await A.push(); await B.pull();
  // B (clock behind) edits two products without _sessionId and re-imports one voucher
  B.state.products[0].name = "P0-b"; B.state.products[0]._updatedAt = B.run("Date.now()");
  B.state.products[1].name = "P1-b"; B.state.products[1]._updatedAt = B.run("Date.now()");
  const vi = B.state.vouchers.findIndex(v => v.id === "V2");
  B.state.vouchers[vi] = { id: "V2", type: "sales", amount: 99, items: [{ productId: "SP2", qty: 1 }] };
  B.state._lastModified = B.run("Date.now()");
  await B.push(); await A.pull(); await B.pull();
  assert.strictEqual(A.state.products.find(p => p.id === "SP0").name, "P0-b");
  assert.strictEqual(A.state.vouchers.find(v => v.id === "V2").amount, 99);
  const mark = server.log.length;
  for (let round = 0; round < 3; round++) {
    A.state._lastModified = A.run("Date.now()"); await A.push(); await B.pull();
    B.state._lastModified = B.run("Date.now()"); await B.push(); await A.pull();
    await A.pull({ forceFull: true }); await B.pull({ forceFull: true });
    await A.push(); await B.push();
  }
  assert.deepStrictEqual(entityRowsSince(server, mark), [], "no entity upserts once converged");
  const view = s => JSON.stringify([s.state.products, s.state.vouchers].map(arr => arr
    .map(x => { const { _updatedAt, _sessionId, ...rest } = x; return rest; })
    .sort((a, b) => a.id < b.id ? -1 : 1)));
  assert.strictEqual(view(A), view(B), "stations agree");
  assert.deepStrictEqual(deltaEntityIds(A), []);
  assert.deepStrictEqual(deltaEntityIds(B), []);
  assert.deepStrictEqual([...A.sandbox.__errors, ...B.sandbox.__errors], [], "no sync errors logged");
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("ok - " + name); }
    catch (err) { failed++; console.error("FAIL - " + name + "\n  " + (err && err.message)); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} sync-mismatch tests passed`);
})();
