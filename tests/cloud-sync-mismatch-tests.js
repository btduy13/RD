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

test("legacy unstamped baseline and local copy differing only in recalc-derived fields are not pushed", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server);
  await A.startup();
  A.run(`
    lastSyncState.products = [{ id: 'SP9', name: 'Thep', stock: 5, avgCost: 10, totalValue: 50 }];
    lastSyncState.vouchers = [{ id: 'HD9', type: 'sales', totalAmount: 100, cogsAmount: 40, items: [{ productId: 'SP9', qty: 1, cogsAmount: 40 }] }];
    window.lastSyncState = lastSyncState;
    state.products = [{ id: 'SP9', name: 'Thep', stock: 3, avgCost: 12, totalValue: 36 }];
    state.vouchers = [{ id: 'HD9', type: 'sales', totalAmount: 100, cogsAmount: 48, items: [{ productId: 'SP9', qty: 1, cogsAmount: 48 }] }];
  `);
  assert.deepStrictEqual(deltaEntityIds(A), [], "0/0 stamps: derived drift must not fan out");
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

// ---- Task 7: voucher number collision after a delayed push ----
const MIN = 60 * 1000;
const vIds = st => st.state.vouchers.map(v => v.id).sort();
const byId = (st, id) => st.state.vouchers.find(v => v.id === id);
function captureToasts(st) {
  st.run(`var __toasts = []; function showToast(message, type) { __toasts.push({ message: String(message), type }); }`);
  return () => JSON.parse(JSON.stringify(st.run("__toasts")));
}
function failNextTransaction(server) {
  server.hooks.rd_apply_sync_transaction = async () => { server.hooks = {}; throw new Error("NETWORK_DOWN"); };
}
function loseNextAck(st) {
  const orig = st.sandbox.__client.rpc;
  st.sandbox.__client.rpc = async (name, p) => {
    const res = await orig(name, p);
    if (name === "rd_apply_sync_transaction") { st.sandbox.__client.rpc = orig; throw new Error("ACK_LOST"); }
    return res;
  };
}
// A creates BH2 (sale) + PT2 (receipt linked via escrowRefId); its push fails.
async function collisionSetup({ markPending = false } = {}) {
  const server = new FakeServer();
  const A = makeStation("A", server), B = makeStation("B", server);
  await A.startup(); await B.startup();
  A.state.vouchers.push({ id: "BH1", type: "sales", totalAmount: 1, _updatedAt: Date.now() - 1000, _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  await A.push(); await B.pull();
  const idA = await A.run(`getCloudSafeVoucherId({ prefix: 'BH' })`);
  assert.strictEqual(idA, "BH2");
  A.state.vouchers.push(
    { id: idA, type: "sales", partnerName: "Khach cua A", totalAmount: 700000, _updatedAt: Date.now(), _sessionId: "session-A" },
    { id: "PT2", type: "receipt", partnerName: "Khach cua A", amount: 700000, escrowRefId: idA, _updatedAt: Date.now(), _sessionId: "session-A" }
  );
  A.state._lastModified = Date.now();
  if (markPending) A.run("markCloudWritePending()");
  failNextTransaction(server);
  assert.strictEqual(await A.push(), false, "first push fails (network)");
  // > 30 minutes pass: the server purges A's reservation and B is issued the same number.
  server.advance(31 * MIN);
  return { server, A, B };
}
async function foreignB(server, B, { clockBehind = false } = {}) {
  const idB = await B.run(`getCloudSafeVoucherId({ prefix: 'BH' })`);
  assert.strictEqual(idB, "BH2", "server lock purge re-issues the same number");
  const ts = B.run("Date.now()") + (clockBehind ? -20 * MIN : 5);
  B.state.vouchers.push({ id: idB, type: "sales", partnerName: "Khach cua B", totalAmount: 300000, _updatedAt: ts, _sessionId: "session-B" });
  B.state._lastModified = B.run("Date.now()");
  assert.strictEqual(await B.push(), true);
}
function assertRenumbered(server, stations, newId) {
  const cloudB = server.rows.get("v_BH2").data;
  assert.strictEqual(cloudB.partnerName, "Khach cua B", "other station's BH2 intact in cloud");
  assert.strictEqual(cloudB.totalAmount, 300000);
  assert.ok(server.rows.has("v_" + newId), "renumbered voucher pushed as v_" + newId);
  const cloudA = server.rows.get("v_" + newId).data;
  assert.strictEqual(cloudA.partnerName, "Khach cua A");
  assert.strictEqual(cloudA.totalAmount, 700000);
  assert.strictEqual(server.rows.get("v_PT2").data.escrowRefId, newId, "reference pushed with the new id");
  for (const st of stations) {
    assert.deepStrictEqual(vIds(st), ["BH1", "BH2", newId, "PT2"].sort(), st.name + " vouchers");
    assert.strictEqual(byId(st, "BH2").partnerName, "Khach cua B", st.name + " BH2 is B's");
    assert.strictEqual(byId(st, newId).totalAmount, 700000, st.name + " keeps A's 700,000 voucher");
    assert.strictEqual(byId(st, "PT2").escrowRefId, newId, st.name + " escrowRefId follows the renumber");
  }
}

test("delayed push whose number was re-issued to another station is renumbered, not overwritten", async () => {
  const { server, A, B } = await collisionSetup();
  const toasts = captureToasts(A);
  await foreignB(server, B);
  assert.strictEqual(await A.push(), true, "A reconnects and pushes");
  await B.pull();
  assertRenumbered(server, [A, B], "BH3");
  const t = toasts();
  assert.strictEqual(t.length, 1, "user notified once");
  assert.ok(t[0].message.includes("BH2") && t[0].message.includes("BH3"), t[0].message);
  assert.deepStrictEqual(deltaEntityIds(A), [], "nothing left to push");
  assert.deepStrictEqual(deltaEntityIds(B), []);
  assert.deepStrictEqual([...A.sandbox.__errors.filter(e => !/NETWORK_DOWN/.test(e)), ...B.sandbox.__errors], []);
});

test("collision with an older-stamped foreign voucher does not overwrite it in the cloud", async () => {
  const { server, A, B } = await collisionSetup();
  await foreignB(server, B, { clockBehind: true });
  assert.strictEqual(await A.push(), true);
  await B.pull();
  assertRenumbered(server, [A, B], "BH3");
});

test("collision is detected on a regular poll pull before the push", async () => {
  const { server, A, B } = await collisionSetup();
  await foreignB(server, B);
  await A.pull({ reason: "poll", force: false });
  assert.strictEqual(byId(A, "BH2").partnerName, "Khach cua B");
  assert.ok(byId(A, "BH3") && byId(A, "BH3").totalAmount === 700000, "renumbered locally on pull");
  assert.strictEqual(await A.push(), true);
  await B.pull();
  assertRenumbered(server, [A, B], "BH3");
});

test("collision after an app restart (new session id) is renumbered via the durable pending-write marker", async () => {
  const { server, A, B } = await collisionSetup({ markPending: true });
  await foreignB(server, B);
  const A2 = makeStation("A", server, JSON.parse(JSON.stringify(A.state)), { store: A.store, sessionId: "session-A-restarted" });
  const toasts = captureToasts(A2);
  assert.strictEqual(await A2.restartStartup(), true, "startup reconcile");
  assert.strictEqual(byId(A2, "BH2").partnerName, "Khach cua B");
  // the app pushes through pushToCloud, which clears the durable marker on success
  assert.strictEqual(await A2.run("pushToCloud({ pendingToken: cloudSyncGetPendingLocalWriteToken() })"), true);
  await sleep(0);
  assert.strictEqual(A2.run("cloudSyncHasPendingLocalWrite()"), false, "pending marker cleared");
  await B.pull();
  assertRenumbered(server, [A2, B], "BH3");
  assert.strictEqual(toasts().length, 1);
  assert.deepStrictEqual(deltaEntityIds(A2), []);
  // a second restart must not resurrect or re-push anything
  const A3 = makeStation("A", server, JSON.parse(JSON.stringify(A2.state)), { store: A2.store, sessionId: "session-A-3" });
  await A3.restartStartup();
  assert.deepStrictEqual(vIds(A3), vIds(A2));
  assert.deepStrictEqual(deltaEntityIds(A3), []);
});

test("own earlier push whose ack was lost is never renumbered, even after a restart and a local edit", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server), B = makeStation("B", server);
  await A.startup(); await B.startup();
  const id = await A.run(`getCloudSafeVoucherId({ prefix: 'BH' })`);
  A.state.vouchers.push({ id, type: "sales", partnerName: "Khach cua A", totalAmount: 700000, _updatedAt: Date.now(), _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  A.run("markCloudWritePending()");
  loseNextAck(A);
  assert.strictEqual(await A.push(), false);
  assert.strictEqual(server.rows.get("v_" + id).data.totalAmount, 700000, "server committed");
  server.advance(31 * MIN);
  // restart; the user edits the voucher before the first successful pull
  const A2 = makeStation("A", server, JSON.parse(JSON.stringify(A.state)), { store: A.store, sessionId: "session-A-restarted" });
  const toasts = captureToasts(A2);
  A2.run("cloudSyncRestoreBaselineFromConfirmedCache()");
  const v = byId(A2, id);
  v.totalAmount = 750000; v._updatedAt = Date.now() + 10; v._sessionId = "session-A-restarted";
  A2.state._lastModified = Date.now() + 10;
  A2.run("markCloudWritePending()");
  assert.strictEqual(await A2.push(), true);
  assert.deepStrictEqual(vIds(A2), [id], "no renumbered copy");
  assert.strictEqual(server.rows.get("v_" + id).data.totalAmount, 750000, "edit pushed onto the same number");
  assert.ok(![...server.rows.keys()].some(k => k.startsWith("v_") && k !== "v_" + id), "no extra voucher row");
  assert.deepStrictEqual(toasts(), []);
  await B.pull();
  assert.deepStrictEqual(vIds(B), [id]);
  assert.strictEqual(byId(B, id).totalAmount, 750000);
});

test("same-session lost ack followed by a local edit is not renumbered", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server);
  await A.startup();
  A.state.vouchers.push({ id: "BH1", type: "sales", totalAmount: 5, _updatedAt: Date.now(), _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  loseNextAck(A);
  assert.strictEqual(await A.push(), false);
  byId(A, "BH1").totalAmount = 6; byId(A, "BH1")._updatedAt = Date.now() + 5;
  A.state._lastModified = Date.now() + 5;
  assert.strictEqual(await A.push(), true);
  assert.deepStrictEqual(vIds(A), ["BH1"]);
  assert.strictEqual(server.rows.get("v_BH1").data.totalAmount, 6);
});

// ---- Task 7 fix round 1: stable voucher origin + crash window ----
test("lost ack then another station edits the voucher: same origin, merged, never renumbered", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server), B = makeStation("B", server);
  await A.startup(); await B.startup();
  const id = await A.run(`getCloudSafeVoucherId({ prefix: 'BH' })`);
  A.state.vouchers.push({ id, type: "sales", partnerName: "Khach cua A", totalAmount: 700000, _updatedAt: Date.now(), _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  A.run("markCloudWritePending()");
  const toasts = captureToasts(A);
  loseNextAck(A);
  assert.strictEqual(await A.push(), false);
  const origin = server.rows.get("v_" + id).data._originId;
  assert.ok(typeof origin === "string" && origin.startsWith(id + "|"), "origin reaches the cloud row: " + origin);
  await B.pull();
  // B edits the way the sales form does: rebuilds the voucher object without _originId
  const idx = B.state.vouchers.findIndex(v => v.id === id);
  B.state.vouchers[idx] = { id, type: "sales", partnerName: "Khach cua A (B sua)", totalAmount: 800000, _updatedAt: Date.now() + 20, _sessionId: "session-B" };
  B.state._lastModified = Date.now() + 20;
  assert.strictEqual(await B.push(), true);
  assert.strictEqual(server.rows.get("v_" + id).data._originId, origin, "edit path preserves the origin");
  assert.strictEqual(byId(B, id)._originId, origin, "local edited copy carries the origin too");
  assert.strictEqual(await A.push(), true);
  assert.deepStrictEqual(vIds(A), [id], "single voucher, no renumbered copy");
  assert.strictEqual(byId(A, id).totalAmount, 800000, "B's edit wins");
  assert.ok(![...server.rows.keys()].some(k => k.startsWith("v_") && k !== "v_" + id), "no extra voucher row");
  assert.deepStrictEqual(toasts(), []);
  await B.pull();
  assert.deepStrictEqual(vIds(B), [id]);
});

test("_originId is minted once, survives rebuilt edits, and is re-minted for a copied voucher", async () => {
  const server = new FakeServer();
  const A = makeStation("A", server);
  await A.startup();
  A.state.vouchers.push({ id: "BG1", type: "sales_quotation", totalAmount: 10, _updatedAt: Date.now(), _sessionId: "session-A" });
  A.state._lastModified = Date.now();
  await A.push();
  const origin = server.rows.get("v_BG1").data._originId;
  assert.ok(origin && origin.startsWith("BG1|"));
  // edit by rebuilding the object (no _originId), as several handlers do
  let i = A.state.vouchers.findIndex(v => v.id === "BG1");
  A.state.vouchers[i] = { id: "BG1", type: "sales_quotation", totalAmount: 11, _updatedAt: Date.now() + 5, _sessionId: "session-A" };
  A.state._lastModified = Date.now() + 5;
  await A.push();
  assert.strictEqual(server.rows.get("v_BG1").data._originId, origin, "edit keeps the origin");
  // an edit that carries a wrong/foreign origin cannot change the confirmed identity
  i = A.state.vouchers.findIndex(v => v.id === "BG1");
  A.state.vouchers[i] = { ...A.state.vouchers[i], totalAmount: 12, _originId: "BG1|someone-else", _updatedAt: Date.now() + 10 };
  await A.push();
  assert.strictEqual(server.rows.get("v_BG1").data._originId, origin, "origin is immutable");
  // quotation -> order conversion deep-clones the quotation (origin included) under a new id
  const order = JSON.parse(JSON.stringify(byId(A, "BG1")));
  order.id = "BH7"; order.type = "sales"; order._updatedAt = Date.now() + 15;
  A.state.vouchers.unshift(order);
  A.state._lastModified = Date.now() + 15;
  await A.push();
  const orderOrigin = server.rows.get("v_BH7").data._originId;
  assert.ok(orderOrigin.startsWith("BH7|") && orderOrigin !== origin, "copied voucher gets its own origin");
  assert.deepStrictEqual(deltaEntityIds(A), [], "origins never cause extra pushes");
});

test("crash after a renumber but before the pull persisted it: restart still keeps both vouchers", async () => {
  const { server, A, B } = await collisionSetup({ markPending: true });
  await foreignB(server, B);
  const sqliteCopy = JSON.parse(JSON.stringify(A.state)); // what SQLite holds before the pull persists
  let crashStore = null;
  A.sandbox.__crash = () => { crashStore = new Map(A.store); };
  A.run("persistStateCacheAfterCloudPull = async () => { __crash(); throw new Error('CRASH'); }");
  await A.pull({ reason: "poll", force: false }).catch(() => {});
  assert.ok(crashStore, "crashed during the pull's local persist");
  const A2 = makeStation("A", server, sqliteCopy, { store: crashStore, sessionId: "session-A-after-crash" });
  assert.strictEqual(await A2.restartStartup(), true);
  assert.strictEqual(await A2.run("pushToCloud({ pendingToken: cloudSyncGetPendingLocalWriteToken() })"), true);
  await B.pull();
  const cloudB = server.rows.get("v_BH2").data;
  assert.strictEqual(cloudB.partnerName, "Khach cua B", "B's BH2 intact");
  const mine = A2.state.vouchers.find(v => v.partnerName === "Khach cua A" && v.type === "sales");
  assert.ok(mine && mine.id !== "BH2" && mine.totalAmount === 700000, "A's voucher survives under a new number");
  assert.strictEqual(server.rows.get("v_" + mine.id).data.totalAmount, 700000, "and reaches the cloud");
  assert.strictEqual(byId(A2, "PT2").escrowRefId, mine.id);
  assert.strictEqual(server.rows.get("v_PT2").data.escrowRefId, mine.id);
  assert.ok(byId(B, mine.id) && byId(B, "BH2").partnerName === "Khach cua B", "B converges");
});

test("a backlog beyond the incremental page limit falls back to a full reconcile in the same pull", async () => {
  const { server, A, B } = await seededPair();
  // 80 delta pages x 500 rows = 40000 rows: the incremental fetch's safety limit.
  const next = server.version + 1;
  for (let i = 0; i < 40010; i++) {
    const id = "v_BULK" + String(i).padStart(6, "0");
    server.rows.set(id, { id, data: { id: "BULK" + i, type: "receipt", amount: 1, _updatedAt: Date.now() }, last_modified: Date.now(), sync_version: next });
  }
  server.version = next;
  assert.strictEqual(await B.pull({ reason: "poll", force: false }), true, "pull succeeds instead of throwing 'retry full sync'");
  assert.ok(B.state.vouchers.filter(v => String(v.id).startsWith("BULK")).length >= 40010, "all backlog rows arrived");
  assert.strictEqual(B.run("getPullCheckpointTs()"), next, "checkpoint advanced to the cloud version");
  assert.strictEqual(await B.pull({ reason: "poll", force: false }), true, "following pull is incremental and quiet");
});

test("rd_rows_by_ids missing on the server (PGRST202) skips tombstone reconcile and never deletes or resurrects", async () => {
  const { server, A, B } = await seededPair();
  server.hooks.rd_rows_by_ids = () => {};
  const orig = server.rpc.bind(server);
  server.rpc = async (station, name, p) => name === "rd_rows_by_ids"
    ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.rd_rows_by_ids(p_ids, p_workspace_id) in the schema cache" } }
    : orig(station, name, p);
  B.state.deletedCloudKeys = ["v_PT1"];
  const before = JSON.stringify(B.state.vouchers.map(v => v.id));
  const n = await B.run("cloudSyncReconcileStaleDeletionMarkers()");
  assert.strictEqual(n, 0, "reconcile is skipped, not applied");
  assert.strictEqual(JSON.stringify(B.state.vouchers.map(v => v.id)), before, "vouchers untouched");
  assert.deepStrictEqual(B.state.deletedCloudKeys, ["v_PT1"], "tombstone memory kept (error is not 'row absent')");
  assert.ok(server.rows.has("v_PT1"), "cloud row untouched");
  assert.strictEqual(await B.pull({ reason: "poll", force: false }), true, "normal pulls still work");
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
