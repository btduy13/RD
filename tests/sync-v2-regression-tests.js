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

function testComputeDeltaDoesNotReplayCloudKnownTombstones() {
  const { internals, sandbox } = loadSyncV2Internals();
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
  const { internals } = loadSyncV2Internals();
  assert.equal(internals.syncV2ShouldUseFullPull(5000, false), true, "a checkpoint alone is not a complete cloud baseline");
  assert.equal(internals.syncV2ShouldUseFullPull(5000, true), false, "a complete baseline may use an incremental pull before the remote watermark is checked");
  assert.equal(internals.syncV2ShouldUseFullPull(5000, true, 5000), false, "an equal watermark is safe with a complete baseline");
  assert.equal(internals.syncV2ShouldUseFullPull(5000, true, 4999), true, "cloud watermark rollback must force a full reconcile");
}

function testPostPushSnapshotMatchesUploadedDeletionMetadata() {
  const { internals, sandbox } = loadSyncV2Internals();
  sandbox.window.lastSyncState = {
    vouchers: [{ id: "GONE", _updatedAt: 100 }],
    products: [],
    partners: [],
    deletedIds: [],
    deletedCloudKeys: []
  };
  const pushedMetadata = {
    companyName: "Test Co",
    deletedIds: ["GONE"],
    deletedCloudKeys: ["v_GONE"],
    _lastModified: 8000,
    lastModifiedBy: "session-local"
  };
  const tombstone = internals.syncV2MakeTombstoneRow("v_GONE", 8000);

  internals.syncV2ApplyPushToLastSyncState([tombstone], 8000, pushedMetadata);

  assert.equal(sandbox.window.lastSyncState.vouchers.length, 0, "pushed tombstone must remove the entity from the cloud snapshot");
  assert.deepEqual(Array.from(sandbox.window.lastSyncState.deletedCloudKeys), ["v_GONE"], "snapshot must retain the exact deletion metadata uploaded to cloud");
}

function testChangingCloudClientResetsComparisonBaseline() {
  const { internals, sandbox } = loadSyncV2Internals();
  sandbox.window.lastSyncState = { vouchers: [{ id: "OLD-CLOUD" }], products: [], partners: [] };
  internals.syncV2ResetCloudBaseline();
  assert.equal(sandbox.window.lastSyncState, null, "a new cloud client must not reuse the previous project's comparison snapshot");
}

function testInternalSyncWorkCountsAsBusy() {
  const { sandbox, vm } = loadSyncV2Internals();
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
  const { internals, sandbox, vm } = loadSyncV2Internals();
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

  const created = await internals.syncV2EnsureMetadataRow();
  assert.equal(created.data.companyName, "Local Company", "new cloud metadata must preserve the loaded local company");
  assert.equal(created.data.taxCode, "0312345678");
  assert.equal(created.data.initialBalances["1111"], 250000, "new cloud metadata must preserve opening balances");
  assert.equal(created.data.partnerOpeningBalances.KH01, 125000, "new cloud metadata must preserve partner opening balances");
  assert.equal(sandbox.__insertedMetadata.data.companyName, "Local Company");
}

async function testConcurrentMetadataCreationDoesNotOverwriteWinner() {
  const { internals, sandbox, vm } = loadSyncV2Internals();
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

  const winner = await internals.syncV2EnsureMetadataRow();
  assert.equal(sandbox.__insertCount, 1);
  assert.equal(winner.data.companyName, "Other Client", "a concurrent creator's metadata must be adopted, not overwritten");
}

function testTypedTombstoneDoesNotDeleteOtherEntityWithSameId() {
  const { internals } = loadSyncV2Internals();
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
  const { internals } = loadSyncV2Internals();
  const deleted = internals.syncV2GetDeletedIdsByState({
    deletedIds: ["OLD-VOUCHER"],
    deletedCloudKeys: ["OLDER-VOUCHER"]
  });
  assert.equal(deleted.vouchers.has("OLD-VOUCHER"), true, "legacy deletedIds must remain voucher-compatible");
  assert.equal(deleted.vouchers.has("OLDER-VOUCHER"), true, "legacy unprefixed cloud tombstones must target vouchers");
  assert.equal(deleted.products.has("OLD-VOUCHER"), false, "legacy voucher deletion must not spill into products");

  assert.equal(internals.syncV2NormalizeDeletedCloudKey("OLDER-VOUCHER"), "v_OLDER-VOUCHER");
  const row = internals.syncV2MakeTombstoneRow("OLDER-VOUCHER", 123);
  assert.equal(row.id, "v_OLDER-VOUCHER", "legacy tombstones must be uploaded with the voucher prefix");
  assert.equal(row.data.id, "OLDER-VOUCHER");
  assert.equal(row.data._deletedEntity, "voucher");
}

function testQueuedPullPreservesStrongestRequest() {
  const { internals } = loadSyncV2Internals();
  internals.queuePendingPull({ reason: "realtime" });
  internals.queuePendingPull({ reason: "manual-full", force: true, forceFull: true });
  const queued = internals.takePendingPullOptions();
  assert.equal(queued.reason, "manual-full");
  assert.equal(queued.force, true);
  assert.equal(queued.forceFull, true, "a queued manual full pull must not degrade to incremental");
  assert.equal(internals.takePendingPullOptions(), null, "taking the queued pull must clear it exactly once");
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

async function testCandidateRescueDoesNotTouchUnchangedNonCandidates() {
  const { sandbox, vm } = loadSyncV2Internals();

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
      { id: "PO-CHANGED", type: "purchase_order", total: 200, _updatedAt: 2000 }
    ],
    products: [],
    partners: []
  };

  const changed = await vm.runInContext(
    `__syncV2Internals__.syncV2RescueLocalOnlyItems({ triggerSave: false, candidateKeysOnly: true })`,
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
  const { sandbox, vm } = loadSyncV2Internals();

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
    `__syncV2Internals__.syncV2RescueLocalOnlyItems({ triggerSave: false, completeCloudSnapshot: true })`,
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
  const { sandbox, vm } = loadSyncV2Internals({ console: quietConsole });

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
    `__syncV2Internals__.syncV2RescueLocalOnlyItems({ triggerSave: false })`,
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

async function run() {
  testComputeDeltaDetectsUnpushedVoucherWhenLastSyncStateNull();
  testComputeDeltaSkipsAlreadySyncedVoucher();
  testComputeDeltaDoesNotReplayCloudKnownTombstones();
  testFullPullRequiredWithoutBaselineOrAfterWatermarkRollback();
  testPostPushSnapshotMatchesUploadedDeletionMetadata();
  testChangingCloudClientResetsComparisonBaseline();
  testInternalSyncWorkCountsAsBusy();
  await testNewCloudMetadataIsSeededFromLocalState();
  await testConcurrentMetadataCreationDoesNotOverwriteWinner();
  testPruneDoesNotDropLocalOnlyVouchers();
  testMergeKeepsRemoteVoucherOnTimestampTieWithDifferentSession();
  testTypedTombstoneDoesNotDeleteOtherEntityWithSameId();
  testLegacyUntypedTombstoneStillDeletesVoucher();
  testQueuedPullPreservesStrongestRequest();
  testRescueCandidateKeysOnlyChecksPushDiff();
  await testCandidateRescueDoesNotTouchUnchangedNonCandidates();
  await testStartupRescueReusesCompleteCloudBaseline();
  await testRescueLogsAreCappedAndSummarized();
  await testRescueRemovesStuckVoucherFromLastSyncState();
  console.log("sync-v2 regression tests passed");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
