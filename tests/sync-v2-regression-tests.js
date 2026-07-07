const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const syncV2Path = path.join(repoRoot, "js", "sync-v2.js");
const syncV2Source = fs.readFileSync(syncV2Path, "utf8");

function loadSyncV2Internals(overrides = {}) {
  const store = new Map();
  const localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Number,
    Map,
    Set,
    Error,
    localStorage,
    document: { getElementById() { return null; } },
    window: null,
    state: {
      companyName: "Test Co",
      vouchers: [],
      products: [],
      partners: [],
      deletedIds: [],
      deletedCloudKeys: [],
      _lastModified: 0
    },
    clientSessionId: "session-local",
    lastSyncedCloudTs: 0,
    cloudSyncActive: false,
    cloudSyncSettings: { enabled: false },
    saveStateSync: async () => {},
    ...overrides
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(
    `var lastSyncedCloudTs = 0;\nvar clientSessionId = "session-local";\n${syncV2Source}`,
    sandbox,
    { filename: syncV2Path }
  );

  assert.ok(sandbox.window.__syncV2Internals__, "sync-v2 internals should be exposed");
  return { internals: sandbox.window.__syncV2Internals__, sandbox, store, vm };
}

function testComputeDeltaDetectsUnpushedVoucherWhenLastSyncStateNull() {
  const { internals, sandbox } = loadSyncV2Internals();
  sandbox.state.vouchers = [{
    id: "PO-0001",
    type: "purchase_order",
    _updatedAt: 5000,
    _sessionId: "session-local"
  }];
  sandbox.state._lastModified = 5000;
  sandbox.window.lastSyncState = null;

  const delta = internals.computeDelta();
  const voucherRows = delta.rowsToUpsert.filter(row => row.id === "v_PO-0001");
  assert.equal(voucherRows.length, 1, "unpushed voucher must appear in delta when lastSyncState is null");
}

function testComputeDeltaSkipsAlreadySyncedVoucher() {
  const { internals, sandbox } = loadSyncV2Internals();
  const voucher = {
    id: "PO-0002",
    type: "purchase_order",
    _updatedAt: 6000,
    _sessionId: "session-local"
  };
  sandbox.state.vouchers = [voucher];
  sandbox.state._lastModified = 6000;
  sandbox.window.lastSyncState = {
    vouchers: [JSON.parse(JSON.stringify(voucher))],
    products: [],
    partners: [],
    companyName: "Test Co"
  };

  const delta = internals.computeDelta();
  const voucherRows = delta.rowsToUpsert.filter(row => row.id === "v_PO-0002");
  assert.equal(voucherRows.length, 0, "already-synced voucher should not be re-uploaded");
}

function testPruneDoesNotDropLocalOnlyVouchers() {
  const { internals } = loadSyncV2Internals();
  const merged = {
    vouchers: [{ id: "PO-OLD", _updatedAt: 1000 }],
    products: [],
    partners: []
  };
  const localBefore = {
    vouchers: [{ id: "PO-OLD", _updatedAt: 1000 }],
    products: [],
    partners: []
  };
  const cloudSnapshot = { vouchers: [], products: [], partners: [] };

  const pruned = internals.syncV2PruneStaleLocalOnlyItems(merged, localBefore, cloudSnapshot, 50000);
  assert.equal(pruned, 0, "prune must not remove local-only vouchers");
  assert.equal(merged.vouchers.length, 1, "local-only voucher must remain after pull merge");
}

function testMergeKeepsRemoteVoucherOnTimestampTieWithDifferentSession() {
  const { internals } = loadSyncV2Internals();
  const localState = {
    vouchers: [{
      id: "SO-100",
      type: "sales",
      total: 100,
      _updatedAt: 9000,
      _sessionId: "session-a"
    }],
    products: [],
    partners: [],
    deletedIds: [],
    _lastModified: 9000
  };
  const cloudState = {
    vouchers: [{
      id: "SO-100",
      type: "sales",
      total: 200,
      _updatedAt: 9000,
      _sessionId: "session-b"
    }],
    products: [],
    partners: [],
    deletedIds: [],
    _lastModified: 9000
  };

  const merged = internals.mergeStates(localState, cloudState);
  const winner = merged.vouchers.find(v => v.id === "SO-100");
  assert.equal(winner.total, 200, "remote voucher should win on timestamp tie across sessions");
  assert.equal(winner._sessionId, "session-b");
}

async function testRescueRemovesStuckVoucherFromLastSyncState() {
  const { internals, sandbox, vm } = loadSyncV2Internals();

  sandbox.__cloudKeys = new Set();
  sandbox.__saveCalled = false;
  sandbox.saveStateSync = async () => { sandbox.__saveCalled = true; };

  vm.runInContext(`
    cloudSyncActive = true;
    saveStateSync = async function() { __saveCalled = true; };
    supabaseClient = {
      from() {
        return {
          select() {
            return {
              in(_column, batch) {
                const data = batch.filter(id => __cloudKeys.has(id)).map(id => ({ id }));
                return Promise.resolve({ data, error: null });
              }
            };
          }
        };
      }
    };
  `, sandbox);

  const voucher = {
    id: "PO-STUCK",
    type: "purchase_order",
    _updatedAt: 1000,
    _sessionId: "session-local"
  };
  sandbox.state.vouchers = [voucher];
  sandbox.window.lastSyncState = {
    vouchers: [JSON.parse(JSON.stringify(voucher))],
    products: [],
    partners: []
  };

  const changed = await vm.runInContext(`__syncV2Internals__.syncV2RescueLocalOnlyItems()`, sandbox);
  assert.equal(changed, true, "rescue should detect local-only voucher");
  assert.equal(sandbox.window.lastSyncState.vouchers.length, 0, "stuck voucher must be removed from lastSyncState");
  assert.equal(sandbox.__saveCalled, true, "rescue should trigger save after marking items");

  const delta = vm.runInContext(`__syncV2Internals__.computeDelta()`, sandbox);
  assert.ok(delta.rowsToUpsert.some(row => row.id === "v_PO-STUCK"), "rescued voucher must be eligible for push");
}

function testRescueCandidateKeysOnlyChecksPushDiff() {
  const { internals, sandbox } = loadSyncV2Internals();
  sandbox.state.vouchers = [
    { id: "PO-1", type: "purchase_order", _updatedAt: 1000 },
    { id: "PO-2", type: "purchase_order", _updatedAt: 2000 }
  ];
  sandbox.window.lastSyncState = {
    vouchers: [{ id: "PO-1", type: "purchase_order", _updatedAt: 1000 }],
    products: [],
    partners: []
  };

  const keys = internals.syncV2GetRescueCandidateKeys();
  assert.deepEqual(keys, ["v_PO-2"], "rescue candidates should only include rows that differ from lastSyncState");
}

async function run() {
  testComputeDeltaDetectsUnpushedVoucherWhenLastSyncStateNull();
  testComputeDeltaSkipsAlreadySyncedVoucher();
  testPruneDoesNotDropLocalOnlyVouchers();
  testMergeKeepsRemoteVoucherOnTimestampTieWithDifferentSession();
  testRescueCandidateKeysOnlyChecksPushDiff();
  await testRescueRemovesStuckVoucherFromLastSyncState();
  console.log("sync-v2 regression tests passed");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
