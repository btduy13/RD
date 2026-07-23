const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const cloudSyncPath = path.join(repoRoot, "js", "cloud-sync.js");
const cloudSyncSource = fs.readFileSync(cloudSyncPath, "utf8");

function loadCloudSyncInternals(overrides = {}) {
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
    `var lastSyncedCloudTs = 0;\nvar clientSessionId = "session-local";\n${cloudSyncSource}`,
    sandbox,
    { filename: cloudSyncPath }
  );

  assert.ok(sandbox.window.__cloudSyncInternals__, "cloud sync internals should be exposed");
  return { internals: sandbox.window.__cloudSyncInternals__, sandbox, store, vm };
}

function testComputeDeltaDetectsUnpushedVoucherWhenLastSyncStateNull() {
  const { internals, sandbox } = loadCloudSyncInternals();
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
  const { internals, sandbox } = loadCloudSyncInternals();
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
  const { internals } = loadCloudSyncInternals();
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

  const pruned = internals.cloudSyncPruneStaleLocalOnlyItems(merged, localBefore, cloudSnapshot, 50000);
  assert.equal(pruned, 0, "prune must not remove local-only vouchers");
  assert.equal(merged.vouchers.length, 1, "local-only voucher must remain after pull merge");
}

function testMergeKeepsRemoteVoucherOnTimestampTieWithDifferentSession() {
  const { internals } = loadCloudSyncInternals();
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

function testComputeDeltaDoesNotReplayCloudKnownTombstones() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.state.deletedIds = ["OLD", "NEW"];
  sandbox.state.deletedCloudKeys = ["v_OLD", "p_NEW"];
  sandbox.state._lastModified = 7000;
  sandbox.window.lastSyncState = {
    vouchers: [],
    products: [],
    partners: [],
    deletedIds: ["OLD"],
    deletedCloudKeys: ["v_OLD"]
  };

  const delta = internals.computeDelta();
  const tombstoneIds = delta.rowsToUpsert
    .filter(row => row.data && row.data._deleted)
    .map(row => row.id)
    .sort();
  assert.deepEqual(tombstoneIds, ["p_NEW"], "only tombstones absent from the cloud baseline should be uploaded");
}

function testFullPullRequiredWithoutBaselineOrAfterWatermarkRollback() {
  const { internals } = loadCloudSyncInternals();
  assert.equal(internals.cloudSyncShouldUseFullPull(5000, false), true, "a checkpoint alone is not a complete cloud baseline");
  assert.equal(internals.cloudSyncShouldUseFullPull(5000, true), false, "a complete baseline may use an incremental pull before the remote watermark is checked");
  assert.equal(internals.cloudSyncShouldUseFullPull(5000, true, 5000), false, "an equal watermark is safe with a complete baseline");
  assert.equal(internals.cloudSyncShouldUseFullPull(5000, true, 4999), true, "cloud watermark rollback must force a full reconcile");
}

function testConfirmedCacheRestoresIncrementalStartupBaseline() {
  const { internals, sandbox, store } = loadCloudSyncInternals({
    cloudSyncSettings: { enabled: true, supabaseUrl: "https://example.supabase.co" }
  });
  sandbox.state.vouchers = [{ id: "PO-CACHED", _updatedAt: 7000 }];
  sandbox.state._lastPulledCloudTs = 7000;
  store.set("rd_accounting_sync_dataset", internals.cloudSyncGetDatasetIdentity());

  assert.equal(internals.cloudSyncRestoreBaselineFromConfirmedCache(), true);
  assert.equal(sandbox.window.lastSyncState.vouchers[0].id, "PO-CACHED");
  assert.notEqual(sandbox.window.lastSyncState.vouchers[0], sandbox.state.vouchers[0], "baseline must not alias live state");
  assert.equal(internals.cloudSyncShouldUseFullPull(7000, !!sandbox.window.lastSyncState, 7000), false);

  internals.cloudSyncResetCloudBaseline();
  store.set("rd_accounting_sync_dataset", "https://another-project.supabase.co|legacy");
  assert.equal(internals.cloudSyncRestoreBaselineFromConfirmedCache(), false, "cache from another cloud dataset must be rejected");
}

function testPendingVoucherManifestKeepsIncrementalStartupSafe() {
  const { internals, sandbox, store, vm } = loadCloudSyncInternals({
    cloudSyncSettings: { enabled: true, supabaseUrl: "https://example.supabase.co" }
  });
  const untouched = { id: "PO-UNTOUCHED", type: "purchase_order", _updatedAt: 1000, _sessionId: "remote" };
  const original = { id: "PT-EDIT", type: "receipt", amount: 10, _updatedAt: 1000, _sessionId: "remote" };
  sandbox.state.vouchers = [
    untouched,
    { ...original, amount: 20, _updatedAt: 2000, _sessionId: "session-local" },
    { id: "PC-NEW", type: "payment", amount: 30, _updatedAt: 2000, _sessionId: "session-local" }
  ];
  sandbox.state._lastPulledCloudTs = 7000;
  sandbox.window.lastSyncState = {
    ...JSON.parse(JSON.stringify(sandbox.state)),
    vouchers: [JSON.parse(JSON.stringify(untouched)), JSON.parse(JSON.stringify(original))]
  };
  store.set("rd_accounting_sync_dataset", internals.cloudSyncGetDatasetIdentity());

  const token = vm.runInContext("markCloudWritePending()", sandbox);
  const manifest = internals.cloudSyncGetPendingWriteManifest();
  assert.equal(manifest.token, token);
  assert.deepEqual(Array.from(manifest.rowIds).sort(), ["v_PC-NEW", "v_PT-EDIT"]);
  assert.equal(manifest.metadataDirty, false);
  assert.equal(sandbox.state._pendingCloudWrite.token, token, "pending marker must be included in the SQLite state");

  store.delete("rd_accounting_cloud_push_pending");
  store.delete("rd_accounting_cloud_push_pending_manifest");
  assert.equal(sandbox.window.getPendingCloudWriteToken(), token, "SQLite marker must survive immediate process death before Local Storage flush");
  assert.deepEqual(
    Array.from(internals.cloudSyncGetPendingWriteManifest().rowIds).sort(),
    ["v_PC-NEW", "v_PT-EDIT"],
    "SQLite manifest must recover the exact unsynced rows"
  );

  internals.cloudSyncResetCloudBaseline();
  assert.equal(internals.cloudSyncRestoreBaselineFromConfirmedCache(), true);
  assert.deepEqual(
    Array.from(sandbox.window.lastSyncState.vouchers, item => item.id),
    ["PO-UNTOUCHED"],
    "pending rows must be absent only from the synthetic cloud baseline"
  );
  const retryDelta = internals.computeDelta();
  assert.deepEqual(
    Array.from(retryDelta.rowsToUpsert.filter(row => row.id.startsWith("v_")), row => row.id).sort(),
    ["v_PC-NEW", "v_PT-EDIT"],
    "pending create and edit must remain uploadable after an incremental restart"
  );
}

function testPendingMarkerClearsFromSQLiteWhenLocalStorageFails() {
  let localPersistCalls = 0;
  const { internals, sandbox, store } = loadCloudSyncInternals({
    persistStateLocallyWithoutCloud: async () => {
      localPersistCalls += 1;
    }
  });
  const token = "sqlite-only-token";
  sandbox.state._pendingCloudWrite = {
    token,
    manifest: { version: 1, token, rowIds: ["v_PT-LOCAL"], metadataDirty: false },
    createdAt: Date.now()
  };
  store.set("rd_accounting_cloud_push_pending", token);
  sandbox.localStorage.getItem = () => {
    throw new Error("Local Storage unavailable");
  };
  sandbox.localStorage.removeItem = () => {
    throw new Error("Local Storage unavailable");
  };

  assert.equal(internals.cloudSyncClearPendingLocalWrite(token), true);
  assert.equal(sandbox.state._pendingCloudWrite, null, "SQLite fallback marker must be cleared explicitly");
  assert.equal(localPersistCalls, 1, "cleared SQLite marker must be persisted locally");
}

function testDurableNullMarkerIgnoresStaleLocalStorage() {
  const { sandbox, store } = loadCloudSyncInternals();
  sandbox.state._pendingCloudWrite = null;
  store.set("rd_accounting_cloud_push_pending", "stale-browser-token");
  store.set("rd_accounting_cloud_push_pending_manifest", JSON.stringify({
    version: 1,
    token: "stale-browser-token",
    rowIds: ["v_STALE"],
    metadataDirty: false
  }));

  assert.equal(
    sandbox.window.getPendingCloudWriteToken(),
    "",
    "an explicit durable null marker must override stale Chromium Local Storage"
  );
}

function testCommittedTransactionClearsCoveredRotatedMarker() {
  let localPersistCalls = 0;
  const { internals, sandbox, store } = loadCloudSyncInternals({
    persistStateLocallyWithoutCloud: async () => {
      localPersistCalls += 1;
    }
  });
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  const rotatedToken = "rotated-after-push-start";
  sandbox.state._pendingCloudWrite = {
    token: rotatedToken,
    manifest: { version: 1, token: rotatedToken, rowIds: ["v_ALREADY-COMMITTED"], metadataDirty: false },
    createdAt: Date.now()
  };
  store.set("rd_accounting_cloud_push_pending", rotatedToken);

  assert.equal(internals.cloudSyncClearPendingLocalWrite("transaction-token"), true);
  assert.equal(sandbox.state._pendingCloudWrite, null);
  assert.equal(store.has("rd_accounting_cloud_push_pending"), false);
  assert.equal(localPersistCalls, 1);
}

function testCommittedTransactionKeepsRotatedMarkerWithRemainingDelta() {
  const { internals, sandbox, store } = loadCloudSyncInternals();
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  sandbox.state.vouchers.push({
    id: "PT-STILL-LOCAL",
    type: "receipt",
    amount: 50,
    _updatedAt: Date.now()
  });
  const rotatedToken = "rotated-with-new-change";
  sandbox.state._pendingCloudWrite = {
    token: rotatedToken,
    manifest: { version: 1, token: rotatedToken, rowIds: ["v_PT-STILL-LOCAL"], metadataDirty: false },
    createdAt: Date.now()
  };
  store.set("rd_accounting_cloud_push_pending", rotatedToken);

  assert.equal(internals.cloudSyncClearPendingLocalWrite("transaction-token"), false);
  assert.equal(sandbox.state._pendingCloudWrite.token, rotatedToken);
  assert.equal(store.get("rd_accounting_cloud_push_pending"), rotatedToken);
}

function testPendingMetadataChangeStillRequiresFullStartup() {
  const { internals, sandbox, store, vm } = loadCloudSyncInternals({
    cloudSyncSettings: { enabled: true, supabaseUrl: "https://example.supabase.co" }
  });
  sandbox.state._lastPulledCloudTs = 7000;
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  sandbox.state.companyName = "Locally changed company";
  store.set("rd_accounting_sync_dataset", internals.cloudSyncGetDatasetIdentity());

  vm.runInContext("markCloudWritePending()", sandbox);
  assert.equal(internals.cloudSyncGetPendingWriteManifest().metadataDirty, true);
  internals.cloudSyncResetCloudBaseline();
  assert.equal(
    internals.cloudSyncRestoreBaselineFromConfirmedCache(),
    false,
    "metadata without a compact confirmed baseline must retain the full-reconcile safety fallback"
  );
}

function testPendingTombstoneSurvivesIncrementalStartup() {
  const { internals, sandbox, store, vm } = loadCloudSyncInternals({
    cloudSyncSettings: { enabled: true, supabaseUrl: "https://example.supabase.co" }
  });
  const removed = { id: "PT-REMOVED", type: "receipt", _updatedAt: 1000 };
  sandbox.state.vouchers = [];
  sandbox.state.deletedIds = [removed.id];
  sandbox.state.deletedCloudKeys = [`v_${removed.id}`];
  sandbox.state._lastPulledCloudTs = 7000;
  sandbox.window.lastSyncState = {
    ...JSON.parse(JSON.stringify(sandbox.state)),
    vouchers: [removed],
    deletedIds: [],
    deletedCloudKeys: []
  };
  store.set("rd_accounting_sync_dataset", internals.cloudSyncGetDatasetIdentity());

  vm.runInContext("markCloudWritePending()", sandbox);
  internals.cloudSyncResetCloudBaseline();
  assert.equal(internals.cloudSyncRestoreBaselineFromConfirmedCache(), true);
  const retryDelta = internals.computeDelta();
  assert.ok(
    retryDelta.rowsToUpsert.some(row => row.id === "v_PT-REMOVED" && row.data && row.data._deleted),
    "a pending delete must remain a tombstone after incremental startup restoration"
  );
}

function testPostPushSnapshotRetainsConfirmedTombstonesWithoutMetadata() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.window.lastSyncState = {
    vouchers: [{ id: "GONE", _updatedAt: 100 }],
    products: [],
    partners: [],
    deletedIds: ["OLDER"],
    deletedCloudKeys: ["v_OLDER"]
  };
  const pushedMetadata = {
    companyName: "Test Co",
    _lastModified: 8000,
    lastModifiedBy: "session-local"
  };
  const tombstone = internals.cloudSyncMakeTombstoneRow("v_GONE", 8000);

  internals.cloudSyncApplyPushToLastSyncState([tombstone], 8000, pushedMetadata);

  assert.equal(sandbox.window.lastSyncState.vouchers.length, 0, "pushed tombstone must remove the entity from the cloud snapshot");
  assert.deepEqual(
    Array.from(sandbox.window.lastSyncState.deletedCloudKeys).sort(),
    ["v_GONE", "v_OLDER"],
    "snapshot must retain old confirmed tombstones and add the newly pushed tombstone without metadata"
  );
  sandbox.state.deletedIds = ["OLDER", "GONE"];
  sandbox.state.deletedCloudKeys = ["v_OLDER", "v_GONE"];
  sandbox.state.vouchers = [];
  const retryDelta = internals.computeDelta();
  assert.equal(
    retryDelta.rowsToUpsert.filter(row => row.data && row.data._deleted).length,
    0,
    "a later entity-only push must not replay the full tombstone history"
  );
}

function testChangingCloudClientResetsComparisonBaseline() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.window.lastSyncState = { vouchers: [{ id: "OLD-CLOUD" }], products: [], partners: [] };
  internals.cloudSyncResetCloudBaseline();
  assert.equal(sandbox.window.lastSyncState, null, "a new cloud client must not reuse the previous project's comparison snapshot");
}

function testInternalSyncWorkCountsAsBusy() {
  const { sandbox, vm } = loadCloudSyncInternals();
  vm.runInContext(`
    isStartupPullCompleted = true;
    isPulling = false;
    isPushing = false;
    manualCloudSyncAction = "";
  `, sandbox);
  assert.equal(vm.runInContext(`isCloudSyncActionBusy()`, sandbox), false);

  vm.runInContext(`isPulling = true;`, sandbox);
  assert.equal(vm.runInContext(`isCloudSyncActionBusy()`, sandbox), true, "background pull must block config changes");
  vm.runInContext(`isPulling = false; isPushing = true;`, sandbox);
  assert.equal(vm.runInContext(`isCloudSyncActionBusy()`, sandbox), true, "background push must block config changes");
  vm.runInContext(`isPushing = false; isStartupPullCompleted = false;`, sandbox);
  assert.equal(vm.runInContext(`isCloudSyncActionBusy()`, sandbox), true, "startup reconcile must block config changes");
}

async function testNewCloudMetadataIsSeededFromLocalState() {
  const { internals, sandbox, vm } = loadCloudSyncInternals();
  sandbox.state.companyName = "Local Company";
  sandbox.state.taxCode = "0312345678";
  sandbox.state.initialBalances = { "1111": 250000 };
  sandbox.state.partnerOpeningBalances = { KH01: 125000 };
  sandbox.__insertedMetadata = null;

  vm.runInContext(`
    supabaseClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() { return Promise.resolve({ data: null, error: null }); }
                };
              }
            };
          },
          insert(row) {
            __insertedMetadata = row;
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  `, sandbox);

  const created = await internals.cloudSyncEnsureMetadataRow();
  assert.equal(created.data.companyName, "Local Company", "new cloud metadata must preserve the loaded local company");
  assert.equal(created.data.taxCode, "0312345678");
  assert.equal(created.data.initialBalances["1111"], 250000, "new cloud metadata must preserve opening balances");
  assert.equal(created.data.partnerOpeningBalances.KH01, 125000, "new cloud metadata must preserve partner opening balances");
  assert.equal(sandbox.__insertedMetadata.data.companyName, "Local Company");
}

async function testConcurrentMetadataCreationDoesNotOverwriteWinner() {
  const { internals, sandbox, vm } = loadCloudSyncInternals();
  sandbox.__metadataFetchCount = 0;
  sandbox.__insertCount = 0;
  vm.runInContext(`
    supabaseClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    __metadataFetchCount += 1;
                    if (__metadataFetchCount === 1) return Promise.resolve({ data: null, error: null });
                    return Promise.resolve({
                      data: { id: "metadata", data: { companyName: "Other Client" }, last_modified: 9000 },
                      error: null
                    });
                  }
                };
              }
            };
          },
          insert() {
            __insertCount += 1;
            return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
          }
        };
      }
    };
  `, sandbox);

  const winner = await internals.cloudSyncEnsureMetadataRow();
  assert.equal(sandbox.__insertCount, 1);
  assert.equal(winner.data.companyName, "Other Client", "a concurrent creator's metadata must be adopted, not overwritten");
}

function testTypedTombstoneDoesNotDeleteOtherEntityWithSameId() {
  const { internals } = loadCloudSyncInternals();
  const localState = {
    vouchers: [{ id: "SHARED", _updatedAt: 100 }],
    products: [{ id: "SHARED", _updatedAt: 100 }],
    partners: [{ id: "SHARED", _updatedAt: 100 }],
    cashEntries: [],
    escrowItems: [],
    deletedIds: [],
    deletedCloudKeys: [],
    _lastModified: 100
  };
  const cloudState = {
    vouchers: [],
    products: [],
    partners: [],
    cashEntries: [],
    escrowItems: [],
    deletedIds: ["SHARED"],
    deletedCloudKeys: ["p_SHARED"],
    _lastModified: 200,
    _cloudWatermark: 200
  };

  const merged = internals.mergeStates(localState, cloudState);
  assert.equal(merged.products.length, 0, "typed product tombstone must delete the product");
  assert.equal(merged.vouchers.length, 1, "product tombstone must not delete a voucher with the same ID");
  assert.equal(merged.partners.length, 1, "product tombstone must not delete a partner with the same ID");
  assert.deepEqual(Array.from(merged.deletedCloudKeys), ["p_SHARED"]);
}

function testLegacyUntypedTombstoneStillDeletesVoucher() {
  const { internals } = loadCloudSyncInternals();
  const deleted = internals.cloudSyncGetDeletedIdsByState({
    deletedIds: ["OLD-VOUCHER"],
    deletedCloudKeys: ["OLDER-VOUCHER"]
  });
  assert.equal(deleted.vouchers.has("OLD-VOUCHER"), true, "legacy deletedIds must remain voucher-compatible");
  assert.equal(deleted.vouchers.has("OLDER-VOUCHER"), true, "legacy unprefixed cloud tombstones must target vouchers");
  assert.equal(deleted.products.has("OLD-VOUCHER"), false, "legacy voucher deletion must not spill into products");

  assert.equal(internals.cloudSyncNormalizeDeletedCloudKey("OLDER-VOUCHER"), "v_OLDER-VOUCHER");
  const row = internals.cloudSyncMakeTombstoneRow("OLDER-VOUCHER", 123);
  assert.equal(row.id, "v_OLDER-VOUCHER", "legacy tombstones must be uploaded with the voucher prefix");
  assert.equal(row.data.id, "OLDER-VOUCHER");
  assert.equal(row.data._deletedEntity, "voucher");
}

function testNewerActiveRowClearsStaleMetadataDeletionMarker() {
  const { internals } = loadCloudSyncInternals();
  const recreated = internals.cloudSyncStateFromRows([
    {
      id: 'metadata',
      data: { deletedIds: ['PT-REUSED'], deletedCloudKeys: ['v_PT-REUSED'] },
      last_modified: 100
    },
    {
      id: 'v_PT-REUSED',
      data: { id: 'PT-REUSED', type: 'receipt', _updatedAt: 200 },
      last_modified: 200
    }
  ], { watermark: 200 }).state;
  assert.equal(recreated.vouchers.some(item => item.id === 'PT-REUSED'), true, 'a newer recreated voucher must beat stale metadata deletion markers');
  assert.equal(recreated.deletedIds.includes('PT-REUSED'), false);
  assert.equal(recreated.deletedCloudKeys.includes('v_PT-REUSED'), false);

  const deleted = internals.cloudSyncStateFromRows([
    {
      id: 'metadata',
      data: { deletedIds: ['PT-OLD'], deletedCloudKeys: ['v_PT-OLD'] },
      last_modified: 300
    },
    {
      id: 'v_PT-OLD',
      data: { id: 'PT-OLD', type: 'receipt', _updatedAt: 200 },
      last_modified: 200
    }
  ], { watermark: 300 }).state;
  assert.equal(deleted.vouchers.some(item => item.id === 'PT-OLD'), false, 'a newer metadata deletion must still suppress an older active row');
}

function testQueuedPullPreservesStrongestRequest() {
  const { internals } = loadCloudSyncInternals();
  internals.queuePendingPull({ reason: "realtime" });
  internals.queuePendingPull({ reason: "manual-full", force: true, forceFull: true });
  const queued = internals.takePendingPullOptions();
  assert.equal(queued.reason, "manual-full");
  assert.equal(queued.force, true);
  assert.equal(queued.forceFull, true, "a queued manual full pull must not degrade to incremental");
  assert.equal(internals.takePendingPullOptions(), null, "taking the queued pull must clear it exactly once");
}

async function testRescueRemovesStuckVoucherFromLastSyncState() {
  const { internals, sandbox, vm } = loadCloudSyncInternals();

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

  const changed = await vm.runInContext(`__cloudSyncInternals__.cloudSyncRescueLocalOnlyItems()`, sandbox);
  assert.equal(changed, true, "rescue should detect local-only voucher");
  assert.equal(sandbox.window.lastSyncState.vouchers.length, 0, "stuck voucher must be removed from lastSyncState");
  assert.equal(sandbox.__saveCalled, true, "rescue should trigger save after marking items");

  const delta = vm.runInContext(`__cloudSyncInternals__.computeDelta()`, sandbox);
  assert.ok(delta.rowsToUpsert.some(row => row.id === "v_PO-STUCK"), "rescued voucher must be eligible for push");
}

function testRescueCandidateKeysOnlyChecksPushDiff() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.state.vouchers = [
    { id: "PO-1", type: "purchase_order", _updatedAt: 1000 },
    { id: "PO-2", type: "purchase_order", _updatedAt: 2000 }
  ];
  sandbox.window.lastSyncState = {
    vouchers: [{ id: "PO-1", type: "purchase_order", _updatedAt: 1000 }],
    products: [],
    partners: []
  };

  const keys = internals.cloudSyncGetRescueCandidateKeys();
  assert.deepEqual(keys, ["v_PO-2"], "rescue candidates should only include rows that differ from lastSyncState");
}

async function testCandidateRescueDoesNotTouchUnchangedNonCandidates() {
  const { sandbox, vm } = loadCloudSyncInternals();

  sandbox.__queriedKeys = [];
  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = {
      from() {
        return {
          select() {
            return {
              in(_column, batch) {
                __queriedKeys.push(...batch);
                return Promise.resolve({ data: [], error: null });
              }
            };
          }
        };
      }
    };
  `, sandbox);

  const unchanged = { id: "PO-SYNCED", type: "purchase_order", total: 100, _updatedAt: 1000 };
  const changedCandidate = { id: "PO-CHANGED", type: "purchase_order", total: 250, _updatedAt: 2000 };
  sandbox.state.vouchers = [unchanged, changedCandidate];
  sandbox.window.lastSyncState = {
    vouchers: [
      JSON.parse(JSON.stringify(unchanged)),
      { id: "PO-CHANGED", type: "purchase_order", total: 200, _updatedAt: 1999 }
    ],
    products: [],
    partners: []
  };

  const changed = await vm.runInContext(
    `__cloudSyncInternals__.cloudSyncRescueLocalOnlyItems({ triggerSave: false, candidateKeysOnly: true })`,
    sandbox
  );

  assert.equal(changed, true, "missing changed candidate should be rescued");
  assert.deepEqual(sandbox.__queriedKeys, ["v_PO-CHANGED"], "candidate rescue must query only changed keys");
  assert.equal(unchanged._updatedAt, 1000, "unchanged non-candidate must not be marked as rescued");
  assert.ok(
    sandbox.window.lastSyncState.vouchers.some(item => item.id === "PO-SYNCED"),
    "unchanged non-candidate must remain in lastSyncState"
  );
  assert.equal(
    sandbox.window.lastSyncState.vouchers.some(item => item.id === "PO-CHANGED"),
    false,
    "rescued candidate must be removed from lastSyncState so it can be pushed"
  );
}

async function testStartupRescueReusesCompleteCloudBaseline() {
  const { sandbox, vm } = loadCloudSyncInternals();

  sandbox.__cloudLookupCalls = 0;
  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = {
      from() {
        __cloudLookupCalls += 1;
        throw new Error("complete-baseline rescue must not query cloud IDs again");
      }
    };
  `, sandbox);

  const synced = { id: "PO-SYNCED", type: "purchase_order", _updatedAt: 1000 };
  const localOnly = { id: "PO-LOCAL", type: "purchase_order", _updatedAt: 2000 };
  sandbox.state.vouchers = [synced, localOnly];
  sandbox.window.lastSyncState = {
    vouchers: [JSON.parse(JSON.stringify(synced))],
    products: [],
    partners: [],
    deletedCloudKeys: ["p_OLD-DELETED"]
  };

  const changed = await vm.runInContext(
    `__cloudSyncInternals__.cloudSyncRescueLocalOnlyItems({ triggerSave: false, completeCloudSnapshot: true })`,
    sandbox
  );

  assert.equal(changed, true, "complete baseline must still identify genuinely local-only rows");
  assert.equal(sandbox.__cloudLookupCalls, 0, "complete baseline must avoid redundant cloud ID lookup batches");
  assert.equal(synced._updatedAt, 1000, "cloud-present row must remain untouched");
  assert.equal(
    sandbox.window.lastSyncState.vouchers.some(item => item.id === "PO-LOCAL"),
    false,
    "local-only row must remain eligible for the queued push"
  );
}

async function testRescueLogsAreCappedAndSummarized() {
  const logs = [];
  const quietConsole = {
    log(message) { logs.push(String(message)); },
    warn() {},
    error() {}
  };
  const { sandbox, vm } = loadCloudSyncInternals({ console: quietConsole });

  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = {
      from() {
        return {
          select() {
            return {
              in() { return Promise.resolve({ data: [], error: null }); }
            };
          }
        };
      }
    };
  `, sandbox);

  sandbox.state.vouchers = Array.from({ length: 8 }, (_, index) => ({
    id: `PO-LOG-${index + 1}`,
    type: "purchase_order",
    _updatedAt: index + 1
  }));
  sandbox.window.lastSyncState = { vouchers: [], products: [], partners: [] };

  await vm.runInContext(
    `__cloudSyncInternals__.cloudSyncRescueLocalOnlyItems({ triggerSave: false })`,
    sandbox
  );

  const perItemLogs = logs.filter(line => line.includes("Rescue: local-only voucher"));
  assert.equal(perItemLogs.length, 5, "rescue must cap per-item logs to prevent renderer log floods");
  assert.ok(
    logs.some(line => line.includes("marked 8/8") && line.includes("voucher=8 [PO-LOG-1, PO-LOG-2, PO-LOG-3, ...]")),
    "rescue summary should include aggregate counts and a bounded ID sample"
  );
  assert.ok(
    logs.some(line => line.includes("suppressed 3 additional per-item log(s)")),
    "rescue should report how many per-item logs were suppressed"
  );
}

function testPostgrestCursorQuoting() {
  const { internals } = loadCloudSyncInternals();
  assert.equal(
    internals.cloudSyncQuotePostgrestLogicValue('part_105/38/10NGODUCKE(Mùi).'),
    '"part_105/38/10NGODUCKE(Mùi)."'
  );
  assert.equal(internals.cloudSyncQuotePostgrestLogicValue('part_a,b(c).'), '"part_a,b(c)."');
  assert.equal(internals.cloudSyncQuotePostgrestLogicValue('part_"quoted"\\path'), '"part_\\"quoted\\"\\\\path"');
}

function testDerivedEntityChangesDoNotFanOutToCloud() {
  const { internals } = loadCloudSyncInternals();
  const previous = { id: 'P-1', stock: 10, avgCost: 5, _updatedAt: 100, _sessionId: 'remote' };
  assert.equal(
    internals.cloudSyncEntityNeedsPush(previous, { ...previous, stock: 9, avgCost: 6 }),
    false,
    'derived recalculation at the same entity version must not trigger an upsert'
  );
  assert.equal(
    internals.cloudSyncEntityNeedsPush(previous, { ...previous, stock: 9, _updatedAt: 101, _sessionId: 'local' }),
    true,
    'a user edit with a newer entity version must be pushed'
  );
  assert.equal(
    internals.cloudSyncEntityNeedsPush(previous, { ...previous, stock: 8, _updatedAt: 90, _sessionId: 'session-local' }),
    true,
    'a local-session edit must survive a cloud clock ahead of the station clock'
  );
  assert.equal(internals.cloudSyncEntityNeedsPush(null, { id: 'NEW', _updatedAt: 1 }), true);
}

async function testNoOpPushDoesNotTouchCloud() {
  let cloudCalls = 0;
  const client = {
    rpc() { cloudCalls += 1; throw new Error('no-op push must not call RPC'); },
    from() { cloudCalls += 1; throw new Error('no-op push must not query a table'); }
  };
  const { sandbox, vm } = loadCloudSyncInternals({ __noOpClient: client });
  const result = await vm.runInContext(`
    cloudSyncActive = true;
    isStartupPullCompleted = true;
    supabaseClient = __noOpClient;
    lastPullCompletedAt = Date.now();
    state._lastModified = 1000;
    lastSyncState = JSON.parse(JSON.stringify(state));
    window.lastSyncState = lastSyncState;
    __cloudSyncInternals__.setCloudSyncEgressMetricsEnabled(true);
    __cloudSyncInternals__.resetCloudSyncEgressMetrics();
    cloudSyncPushNow();
  `, sandbox);

  assert.equal(result, true, 'an already-synced station should treat a no-op push as successful');
  assert.equal(cloudCalls, 0, 'a no-op push must not create database or Realtime egress');
  assert.equal(sandbox.window.__cloudSyncInternals__.getCloudSyncEgressMetrics().skippedNoopPushes, 1);
}

function testEntityOnlyDeltaUsesLightweightSignalInsteadOfMetadata() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.state.cashEntries = [{ id: 'CASH-BASELINE', amount: 10 }];
  sandbox.state._accountingValid = true;
  sandbox.state._accountingValidTs = 900;
  sandbox.state._recalcWatermark = { voucherCount: 0, productCount: 0, lastModified: 1000 };
  sandbox.state._cloudDatasetIdentity = 'local-runtime-a';
  sandbox.state._lastModified = 1000;
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));

  sandbox.state.partners.push({
    id: 'PART-SIGNAL',
    name: 'Signal Test',
    _updatedAt: 2000,
    _sessionId: 'session-local'
  });
  sandbox.state._accountingValidTs = 1900;
  sandbox.state._recalcWatermark = { voucherCount: 0, productCount: 0, lastModified: 2000 };
  sandbox.state._cloudDatasetIdentity = 'local-runtime-b';
  sandbox.state._lastModified = 2000;

  const delta = internals.computeDelta();
  assert.ok(delta.rowsToUpsert.some(row => row.id === 'part_PART-SIGNAL'));
  assert.equal(
    delta.rowsToUpsert.some(row => row.id === 'metadata'),
    false,
    'an entity edit and station-local accounting cache refresh must not re-upload the large metadata JSON'
  );

  const signal = internals.cloudSyncMakeSignalRow(2000);
  assert.equal(signal.id, 'sync_signal');
  assert.deepEqual(Object.keys(signal.data), ['lastModifiedBy']);
  assert.ok(JSON.stringify(signal).length < 256, 'the workspace change signal must remain tiny');

  internals.cloudSyncApplyPushToLastSyncState(
    delta.rowsToUpsert.filter(row => row.id !== 'metadata'),
    2000,
    null
  );
  assert.equal(sandbox.window.lastSyncState.companyName, 'Test Co');
  assert.equal(sandbox.window.lastSyncState.cashEntries[0].id, 'CASH-BASELINE');
  assert.equal(sandbox.window.lastSyncState._cloudWatermark, 2000);
}

function testRealMetadataChangeStillUploadsMetadata() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.state.actionLogs = [{ timestamp: 1000, action: 'local audit' }];
  sandbox.state.deletedIds = ['OLD'];
  sandbox.state.deletedCloudKeys = ['v_OLD'];
  sandbox.state._lastModified = 1000;
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  sandbox.state.companyName = 'Updated Company';
  sandbox.state.actionLogs.unshift({ timestamp: 2000, action: 'new local audit' });
  sandbox.state._lastModified = 2000;

  const delta = internals.computeDelta();
  const metadataRow = delta.rowsToUpsert.find(row => row.id === 'metadata');
  assert.ok(
    metadataRow,
    'a real metadata content edit must still upload metadata'
  );
  assert.equal(metadataRow.data.actionLogs, undefined, 'machine-local audit logs must not enter cloud metadata');
  assert.equal(metadataRow.data.deletedIds, undefined, 'typed tombstones replace deletedIds metadata');
  assert.equal(metadataRow.data.deletedCloudKeys, undefined, 'typed tombstones replace deletedCloudKeys metadata');
}

function testLocalAuditLogsDoNotCreateCloudDeltaAndSurviveMerge() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.state.actionLogs = [{ timestamp: 1000, action: 'baseline local audit' }];
  sandbox.state._lastModified = 1000;
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));

  sandbox.state.actionLogs.unshift({ timestamp: 2000, action: 'voucher saved locally' });
  sandbox.state._lastModified = 2000;
  const delta = internals.computeDelta();
  assert.equal(
    delta.rowsToUpsert.some(row => row.id === 'metadata'),
    false,
    'appending an audit log must not fan out the multi-megabyte metadata row'
  );

  const cloudState = JSON.parse(JSON.stringify(sandbox.window.lastSyncState));
  cloudState.companyName = 'Cloud Company';
  cloudState.actionLogs = [{ timestamp: 3000, action: 'stale shared audit' }];
  cloudState._lastModified = 3000;
  const merged = internals.mergeStates(sandbox.state, cloudState);
  assert.deepEqual(
    Array.from(merged.actionLogs, item => item.action),
    ['voucher saved locally', 'baseline local audit'],
    'cloud pulls must preserve the station-local audit history'
  );
}

function testDerivedDeletionArraysOnlyCreateTypedTombstones() {
  const { internals, sandbox } = loadCloudSyncInternals();
  sandbox.state._lastModified = 1000;
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  sandbox.state.deletedIds = ['PT-LOCAL-DELETE'];
  sandbox.state.deletedCloudKeys = ['v_PT-LOCAL-DELETE'];
  sandbox.state._lastModified = 2000;

  const delta = internals.computeDelta();
  assert.ok(delta.rowsToUpsert.some(row => row.id === 'v_PT-LOCAL-DELETE' && row.data._deleted));
  assert.equal(
    delta.rowsToUpsert.some(row => row.id === 'metadata'),
    false,
    'derived deletion arrays must not duplicate typed tombstones in metadata'
  );
}

function testRealtimeSubscriptionUsesOneCompactSignalEvent() {
  const capture = {};
  const channel = {
    on(type, filter, callback) {
      capture.type = type;
      capture.filter = filter;
      capture.callback = callback;
      return this;
    },
    subscribe(callback) {
      capture.statusCallback = callback;
      return this;
    }
  };
  const client = {
    channel(name) { capture.channelName = name; return channel; },
    removeChannel() {}
  };
  const { sandbox, vm } = loadCloudSyncInternals({
    __realtimeClient: client,
    currentUser: { username: 'shared-user' },
    addEventListener() {},
    setInterval() { return 1; },
    clearInterval() {},
    document: { getElementById() { return null; }, addEventListener() {}, hidden: false }
  });

  const ownToken = vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = __realtimeClient;
    cloudUsesVersionedRpc = true;
    __cloudSyncInternals__.setCloudSyncEgressMetricsEnabled(true);
    __cloudSyncInternals__.resetCloudSyncEgressMetrics();
    __cloudSyncInternals__.listenToCloudChanges();
    __cloudSyncInternals__.cloudSyncGetUpdatedByToken();
  `, sandbox);

  assert.equal(capture.type, 'postgres_changes');
  assert.equal(
    capture.filter.filter,
    'id=eq.sync_signal',
    'Realtime must emit only the lightweight signal row for each sync transaction'
  );
  assert.deepEqual(
    Array.from(capture.filter.select),
    ['workspace_id', 'id', 'sync_version', 'updated_by'],
    'Realtime must not include the accounting data JSON payload'
  );
  assert.equal(ownToken, 'shared-user|session-local');
  assert.equal(sandbox.window.__cloudSyncInternals__.cloudSyncIsOwnUpdatedByToken('shared-user|other-session'), false);

  capture.callback({
    new: {
      workspace_id: '00000000-0000-4000-8000-000000000001',
      id: 'sync_signal',
      sync_version: 10,
      updated_by: ownToken
    }
  });
  const metrics = sandbox.window.__cloudSyncInternals__.getCloudSyncEgressMetrics();
  assert.equal(metrics.realtimeEvents, 1);
  assert.equal(metrics.realtimeEventsWithData, 0);
  assert.equal(metrics.realtimeChangeConfirmed, true);
  assert.equal(metrics.activePollIntervalMs, 120000);
}

async function testCommittedV3PushAcknowledgesOwnVersionWithoutEchoPull() {
  const calls = [];
  const client = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'rd_find_ids') return { data: [], error: null };
      if (name === 'rd_cloud_status') return {
        data: [{ workspace_id: '00000000-0000-4000-8000-000000000001', sync_version: 40 }],
        error: null
      };
      if (name === 'rd_apply_sync_transaction') {
        return { data: { ok: true, conflict: false, sync_version: 41 }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    }
  };
  const { sandbox, store, vm } = loadCloudSyncInternals({ __versionedClient: client });
  const result = await vm.runInContext(`
    cloudSyncActive = true;
    isStartupPullCompleted = true;
    cloudUsesVersionedRpc = true;
    cloudSyncVersion = 40;
    supabaseClient = __versionedClient;
    lastPullCompletedAt = Date.now();
    state._lastPulledCloudTs = 40;
    state.actionLogs = [{ timestamp: 2000, action: 'local only' }];
    lastSyncState = JSON.parse(JSON.stringify(state));
    window.lastSyncState = lastSyncState;
    state.vouchers.push({
      id: 'PT-EGRESS',
      type: 'receipt',
      amount: 100,
      _updatedAt: 2000,
      _sessionId: clientSessionId
    });
    state._lastModified = 2000;
    cloudSyncPushNow();
  `, sandbox);

  assert.equal(result, true);
  assert.equal(sandbox.state._lastPulledCloudTs, 41);
  assert.equal(store.get('rd_accounting_last_pulled_cloud_ts'), '41');
  assert.equal(sandbox.window.lastSyncState._cloudWatermark, 41);
  const transaction = calls.find(call => call.name === 'rd_apply_sync_transaction');
  assert.ok(transaction, 'V3 push must use the transactional RPC');
  assert.equal(
    transaction.params.p_rows.some(row => row.id === 'metadata'),
    false,
    'a voucher plus local audit log must remain an entity-only transaction'
  );
}

function testRoutineIncrementalPathsNeverRequestFullFallback() {
  assert.doesNotMatch(
    cloudSyncSource,
    /reason:\s*"(?:manual|deferred)"[^\n}]*retryFullIfNoChanges:\s*true/,
    'routine manual/deferred sync must not convert an empty delta into a full snapshot'
  );
}

function testRoutineWatermarkChecksUseMetadataSummary() {
  const summaryReads = cloudSyncSource.match(/cloudSyncEnsureMetadataRow\(\{\s*summaryOnly:\s*true\s*\}\)/g) || [];
  assert.ok(
    summaryReads.length >= 4,
    `pull, pre-push, push, and polling paths must avoid the full metadata JSON (found ${summaryReads.length})`
  );
}

function testRequestRetryClassificationSkipsPermanentConflicts() {
  const { internals } = loadCloudSyncInternals();
  assert.equal(internals.cloudSyncShouldRetryRequestError({ code: "23505", message: "duplicate key" }), false);
  assert.equal(internals.cloudSyncShouldRetryRequestError({ status: 409, message: "duplicate key violates unique constraint" }), false);
  assert.equal(internals.cloudSyncShouldRetryRequestError({ code: "PGRST202", message: "missing rpc" }), false);
  assert.equal(internals.cloudSyncShouldRetryRequestError({ code: "57014", message: "statement timeout" }), true);
  assert.equal(internals.cloudSyncShouldRetryRequestError({ status: 429, message: "rate limit" }), true);
}

async function testLegacyDeltaSecondPageQuotesSpecialCursor() {
  const requests = [];
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    id: index === 499 ? 'part_105/38/10NGODUCKE(Mùi).' : `part_${String(index).padStart(4, '0')}`,
    data: { id: `P-${index}` },
    last_modified: 1783933101796
  }));
  const secondPage = [
    { id: 'part_z-next', data: { id: 'P-NEXT' }, last_modified: 1783933101796 },
    { id: 'v_after', data: { id: 'V-AFTER' }, last_modified: 1783933101797 }
  ];

  function createQuery() {
    const capture = { gt: [], not: [], or: '' };
    const query = {
      select() { return this; },
      not(column, operator, value) { capture.not.push([column, operator, value]); return this; },
      order() { return this; },
      limit() { return this; },
      gt(column, value) { capture.gt.push([column, value]); return this; },
      or(filter) { capture.or = filter; return this; },
      then(resolve, reject) {
        requests.push(capture);
        const data = requests.length === 1 ? firstPage : secondPage;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return query;
  }

  const client = { from() { return createQuery(); } };
  const { sandbox, vm } = loadCloudSyncInternals({ __legacyClient: client });
  vm.runInContext('supabaseClient = __legacyClient; cloudUsesVersionedRpc = false;', sandbox);
  const rows = await vm.runInContext('__cloudSyncInternals__.cloudSyncFetchRowsSince(1783933000000)', sandbox);

  assert.equal(rows.length, 502, 'delta pagination must include both pages');
  assert.equal(new Set(rows.map(row => row.id)).size, 502, 'delta pagination must not duplicate rows');
  assert.equal(requests.length, 2, 'a 500-row first page must request the next cursor page');
  assert.deepEqual(requests[0].not, [['id', 'like', 'lock_%']], 'delta reads must exclude voucher reservation locks');
  assert.equal(
    requests[1].or,
    'last_modified.gt.1783933101796,and(last_modified.eq.1783933101796,id.gt."part_105/38/10NGODUCKE(Mùi).")'
  );
}

async function run() {
  testComputeDeltaDetectsUnpushedVoucherWhenLastSyncStateNull();
  testComputeDeltaSkipsAlreadySyncedVoucher();
  testComputeDeltaDoesNotReplayCloudKnownTombstones();
  testFullPullRequiredWithoutBaselineOrAfterWatermarkRollback();
  testConfirmedCacheRestoresIncrementalStartupBaseline();
  testPendingVoucherManifestKeepsIncrementalStartupSafe();
  testPendingMarkerClearsFromSQLiteWhenLocalStorageFails();
  testDurableNullMarkerIgnoresStaleLocalStorage();
  testCommittedTransactionClearsCoveredRotatedMarker();
  testCommittedTransactionKeepsRotatedMarkerWithRemainingDelta();
  testPendingMetadataChangeStillRequiresFullStartup();
  testPendingTombstoneSurvivesIncrementalStartup();
  testPostPushSnapshotRetainsConfirmedTombstonesWithoutMetadata();
  testChangingCloudClientResetsComparisonBaseline();
  testInternalSyncWorkCountsAsBusy();
  await testNewCloudMetadataIsSeededFromLocalState();
  await testConcurrentMetadataCreationDoesNotOverwriteWinner();
  testPruneDoesNotDropLocalOnlyVouchers();
  testMergeKeepsRemoteVoucherOnTimestampTieWithDifferentSession();
  testTypedTombstoneDoesNotDeleteOtherEntityWithSameId();
  testLegacyUntypedTombstoneStillDeletesVoucher();
  testNewerActiveRowClearsStaleMetadataDeletionMarker();
  testQueuedPullPreservesStrongestRequest();
  testRescueCandidateKeysOnlyChecksPushDiff();
  await testCandidateRescueDoesNotTouchUnchangedNonCandidates();
  await testStartupRescueReusesCompleteCloudBaseline();
  await testRescueLogsAreCappedAndSummarized();
  testPostgrestCursorQuoting();
  testDerivedEntityChangesDoNotFanOutToCloud();
  testRoutineIncrementalPathsNeverRequestFullFallback();
  testRoutineWatermarkChecksUseMetadataSummary();
  testRequestRetryClassificationSkipsPermanentConflicts();
  testEntityOnlyDeltaUsesLightweightSignalInsteadOfMetadata();
  testRealMetadataChangeStillUploadsMetadata();
  testLocalAuditLogsDoNotCreateCloudDeltaAndSurviveMerge();
  testDerivedDeletionArraysOnlyCreateTypedTombstones();
  testRealtimeSubscriptionUsesOneCompactSignalEvent();
  await testCommittedV3PushAcknowledgesOwnVersionWithoutEchoPull();
  await testNoOpPushDoesNotTouchCloud();
  await testLegacyDeltaSecondPageQuotesSpecialCursor();
  await testRescueRemovesStuckVoucherFromLastSyncState();
  console.log("cloud sync regression tests passed");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
