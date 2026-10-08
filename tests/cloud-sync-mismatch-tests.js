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

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("ok - " + name); }
    catch (err) { failed++; console.error("FAIL - " + name + "\n  " + (err && err.message)); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} sync-mismatch tests passed`);
})();
