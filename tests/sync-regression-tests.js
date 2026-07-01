const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const syncPath = path.join(repoRoot, "js", "sync.js");
const uiFrameworkPath = path.join(repoRoot, "js", "ui-framework.js");
const syncSource = fs.readFileSync(syncPath, "utf8");
const uiFrameworkSource = fs.readFileSync(uiFrameworkPath, "utf8");

function loadSyncInternals() {
  const store = new Map();
  const elements = new Map();
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
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      }
    },
    window: null
  };
  sandbox.window = sandbox;
  sandbox.window.getComputedStyle = el => ({ display: el.style && el.style.display ? el.style.display : "none" });

  vm.createContext(sandbox);
  vm.runInContext(`var lastSyncedCloudTs = 0;\nvar clientSessionId = "test-client";\n${syncSource}`, sandbox, { filename: syncPath });

  assert.ok(sandbox.window.__syncInternals__, "sync internals should be exposed for regression tests");
  return { internals: sandbox.window.__syncInternals__, store, elements, sandbox };
}

async function testDeepComparators() {
  const { internals } = loadSyncInternals();

  const voucherA = {
    id: "SO-1",
    type: "sale",
    items: [{ productId: "P1", qty: 1, price: 100, taxRate: 8, itemDesc: "old" }],
    entries: [{ debit: "131", credit: "511", amount: 100 }]
  };
  const voucherB = {
    entries: [{ credit: "511", amount: 100, debit: "131" }],
    items: [{ itemDesc: "old", taxRate: 8, price: 100, qty: 1, productId: "P1" }],
    type: "sale",
    id: "SO-1"
  };
  const voucherChanged = JSON.parse(JSON.stringify(voucherB));
  voucherChanged.items[0].taxRate = 10;

  assert.equal(internals.areVouchersEqual(voucherA, voucherB), true, "same voucher with reordered object keys should match");
  assert.equal(internals.areVouchersEqual(voucherA, voucherChanged), false, "voucher tax/detail changes must be detected");

  const productA = { id: "P1", name: "A", units: [{ name: "box", ratio: 10 }] };
  const productB = { id: "P1", name: "A", units: [{ name: "box", ratio: 12 }] };
  assert.equal(internals.areProductsEqual(productA, productB), false, "nested product changes must be detected");

  const partnerA = { id: "C1", name: "Customer", contacts: [{ phone: "1" }] };
  const partnerB = { id: "C1", name: "Customer", contacts: [{ phone: "2" }] };
  assert.equal(internals.arePartnersEqual(partnerA, partnerB), false, "nested partner changes must be detected");
}

async function testPullCheckpointStorage() {
  const { internals, store } = loadSyncInternals();

  internals.persistLastPulledCloudTs(12345);
  assert.equal(store.get("rd_accounting_last_pulled_cloud_ts"), "12345");
  assert.equal(internals.getStoredLastPulledCloudTs(), 12345);
  assert.equal(internals.getPullCheckpointTs(), 12345);

  internals.persistLastPulledCloudTs(0);
  assert.equal(store.has("rd_accounting_last_pulled_cloud_ts"), false, "zero checkpoint should clear stored pull marker");
}

async function testMonotonicCloudPushTimestamp() {
  const { internals } = loadSyncInternals();

  assert.equal(internals.getMonotonicCloudPushTs(100, 200, 150), 201);
  assert.equal(internals.getMonotonicCloudPushTs(300, 200, 250), 300);
  assert.equal(internals.getMonotonicCloudPushTs(100, 200, 500), 500);
}

function createVoucherSequenceFakeClient(rows) {
  return {
    from(table) {
      assert.equal(table, "rd_accounting_data");
      return {
        insert(row) {
          if (rows.some(existing => existing.id === row.id)) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value" } });
          }
          rows.push({ id: row.id });
          return Promise.resolve({ data: [row], error: null });
        },
        select(columns) {
          assert.ok(columns.includes("id"));
          const query = {
            lower: "",
            upper: "",
            gte(column, value) {
              assert.equal(column, "id");
              this.lower = value;
              return this;
            },
            lt(column, value) {
              assert.equal(column, "id");
              this.upper = value;
              return this;
            },
            order(column) {
              assert.equal(column, "id");
              return this;
            },
            range(from, to) {
              const data = rows
                .filter(row => row.id >= this.lower && (!this.upper || row.id < this.upper))
                .sort((a, b) => a.id.localeCompare(b.id))
                .slice(from, to + 1)
                .map(row => ({ id: row.id }));
              return Promise.resolve({ data, error: null });
            }
          };
          return query;
        }
      };
    }
  };
}

async function testCloudSafeVoucherIdUsesCloudMaxAndReservation() {
  const { internals, sandbox } = loadSyncInternals();
  const rows = [
    { id: "v_BH44701" },
    { id: "lock_v_BH44702" }
  ];
  sandbox.__fakeClient = createVoucherSequenceFakeClient(rows);
  sandbox.state = { vouchers: [{ id: "BH44700" }] };

  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = __fakeClient;
  `, sandbox);

  const safeId = await internals.getCloudSafeVoucherId({
    currentId: "BH44701",
    prefix: "BH",
    fallbackBase: 44340
  });

  assert.equal(safeId, "BH44703");
  assert.ok(rows.some(row => row.id === "lock_v_BH44703"), "safe voucher id should be reserved on cloud before local save");
}

async function testCloudSafeVoucherIdSupportsPurchaseOrderAliases() {
  const { internals, sandbox } = loadSyncInternals();
  const rows = [
    { id: "v_DMH00012" },
    { id: "lock_v_ĐMH00013" }
  ];
  sandbox.__fakeClient = createVoucherSequenceFakeClient(rows);
  sandbox.state = { vouchers: [{ id: "ĐMH00011" }] };

  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = __fakeClient;
  `, sandbox);

  const safeId = await internals.getCloudSafeVoucherId({
    currentId: "ĐMH00001",
    prefix: "ĐMH",
    prefixes: ["ĐMH", "DMH"],
    padLength: 5
  });

  assert.equal(safeId, "ĐMH00014");
  assert.ok(rows.some(row => row.id === "lock_v_ĐMH00014"), "purchase order aliases should share the same cloud sequence");
}

async function testStartupCheckpointReadsPersistedStateMarker() {
  const { internals, sandbox } = loadSyncInternals();
  sandbox.state = {
    _lastPulledCloudTs: 456,
    _lastModified: 789,
    vouchers: [{ id: "LOCAL-1" }],
    products: [],
    partners: []
  };

  assert.equal(internals.getStartupPullCheckpointTs(), 456, "startup should use persisted pull checkpoint from cached state when localStorage is missing");
}

async function testLegacyStartupCheckpointDetectsCachedState() {
  const { internals, store, sandbox } = loadSyncInternals();
  sandbox.state = {
    _lastModified: 789,
    vouchers: [{ id: "LOCAL-1" }],
    products: [],
    partners: []
  };
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  vm.runInContext("lastSyncState = window.lastSyncState; lastSyncedCloudTs = 0;", sandbox);

  assert.equal(internals.getStartupPullCheckpointTs(), 0, "legacy _lastModified is not a real pull checkpoint");
  assert.equal(internals.getLegacyStartupCheckpointTs(), 789, "startup can still use legacy cache timestamp for metadata skip checks");
  assert.equal(store.has("rd_accounting_last_pulled_cloud_ts"), false);
}

async function testLegacyStartupCheckpointUsesOriginalStateLastModified() {
  const { internals, sandbox } = loadSyncInternals();
  sandbox.state = {
    _lastModified: 9999, // Simulate update during startup migrations/calculations
    vouchers: [{ id: "LOCAL-1" }],
    products: [],
    partners: []
  };
  sandbox.window.originalStateLastModified = 789; // Original unmodified timestamp
  sandbox.window.lastSyncState = JSON.parse(JSON.stringify(sandbox.state));
  vm.runInContext("lastSyncState = window.lastSyncState; lastSyncedCloudTs = 0;", sandbox);

  assert.equal(internals.getLegacyStartupCheckpointTs(), 789, "startup must prioritize original unmodified state timestamp from window.originalStateLastModified");
}

async function testEntryModalDetection() {
  const { internals, elements } = loadSyncInternals();

  assert.equal(internals.isVoucherEntryModalOpen(), false);
  elements.set("modal-add-sales", { style: { display: "flex" } });
  assert.equal(internals.isVoucherEntryModalOpen(), true, "visible sales modal should defer cloud pull");
  elements.set("modal-add-sales", { style: { display: "none" } });
  assert.equal(internals.isVoucherEntryModalOpen(), false);
}

async function testMetadataPollingDetectsRemoteChanges() {
  const { internals, store, sandbox } = loadSyncInternals();
  store.set("rd_accounting_last_pulled_cloud_ts", "100");

  sandbox.__metadataRow = { last_modified: 200, is_syncing: false };
  sandbox.__pullCount = 0;
  sandbox.__fakeClient = {
    from(table) {
      assert.equal(table, "rd_accounting_data");
      return {
        select(columns) {
          assert.equal(columns, "last_modified, is_syncing, updated_at");
          return {
            eq(column, id) {
              assert.equal(column, "id");
              assert.equal(id, "metadata");
              return {
                maybeSingle() {
                  return Promise.resolve({ data: sandbox.__metadataRow, error: null });
                }
              };
            }
          };
        }
      };
    }
  };

  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = __fakeClient;
    pullAndMergeFromCloud = function() { __pullCount += 1; };
  `, sandbox);

  await internals.checkCloudMetadataForChanges("test");
  assert.equal(sandbox.__pullCount, 1, "polling should pull when cloud metadata is newer than local checkpoint");

  sandbox.__metadataRow = { last_modified: 100, is_syncing: false };
  sandbox.__pullCount = 0;
  vm.runInContext("lastCloudMetadataPollAt = 0;", sandbox);
  await internals.checkCloudMetadataForChanges("test-noop");
  assert.equal(sandbox.__pullCount, 0, "polling should not pull when cloud metadata is not newer");

  sandbox.__metadataRow = { last_modified: 300, is_syncing: true };
  vm.runInContext("lastCloudMetadataPollAt = 0;", sandbox);
  await internals.checkCloudMetadataForChanges("test-syncing");
  assert.equal(sandbox.__pullCount, 0, "polling should not pull while another machine is still pushing");

  sandbox.__metadataRow = {
    last_modified: 400,
    is_syncing: true,
    updated_at: new Date(Date.now() - 31 * 60 * 1000).toISOString()
  };
  vm.runInContext("lastCloudMetadataPollAt = 0;", sandbox);
  await internals.checkCloudMetadataForChanges("test-stale-syncing");
  assert.equal(sandbox.__pullCount, 1, "polling should pull when an is_syncing lock is stale");
}

async function testRealtimeMetadataEventTriggersPull() {
  const { internals, store, sandbox } = loadSyncInternals();
  store.set("rd_accounting_last_pulled_cloud_ts", "100");

  sandbox.__pullCount = 0;
  sandbox.__pullArgs = [];
  sandbox.__realtime = {};
  sandbox.__fakeRealtimeClient = {
    removeChannel(channel) {
      this.removed = channel;
    },
    channel(name) {
      sandbox.__realtime.channelName = name;
      return {
        on(eventType, config, callback) {
          sandbox.__realtime.eventType = eventType;
          sandbox.__realtime.config = config;
          sandbox.__realtime.callback = callback;
          return this;
        },
        subscribe(callback) {
          sandbox.__realtime.subscribeCallback = callback;
          return this;
        }
      };
    }
  };

  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = __fakeRealtimeClient;
    pullAndMergeFromCloud = function(options) { __pullCount += 1; __pullArgs.push(options || {}); };
  `, sandbox);

  internals.listenToCloudChanges();
  assert.equal(sandbox.__realtime.channelName, "rd-accounting-changes");
  assert.equal(sandbox.__realtime.eventType, "postgres_changes");
  assert.equal(sandbox.__realtime.config.event, "*");
  assert.equal(sandbox.__realtime.config.filter, "id=eq.metadata");

  sandbox.__realtime.callback({
    new: {
      last_modified: 200,
      is_syncing: false,
      updated_at: new Date().toISOString(),
      data: { lastModifiedBy: "other-client" }
    }
  });
  assert.equal(sandbox.__pullCount, 1, "realtime metadata event from another machine should trigger pull");

  sandbox.__realtime.callback({
    new: {
      last_modified: 300,
      is_syncing: true,
      updated_at: new Date().toISOString(),
      data: { lastModifiedBy: "other-client" }
    }
  });
  assert.equal(sandbox.__pullCount, 1, "active is_syncing realtime event should not pull partial data");

  sandbox.__realtime.callback({
    new: {
      last_modified: 400,
      is_syncing: true,
      updated_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      data: { lastModifiedBy: "other-client" }
    }
  });
  assert.equal(sandbox.__pullCount, 2, "stale is_syncing realtime event should recover by pulling");

  store.set("rd_accounting_last_pulled_cloud_ts", "500");
  vm.runInContext("lastSyncedCloudTs = 0;", sandbox);
  sandbox.__realtime.callback({
    new: {
      last_modified: 450,
      is_syncing: false,
      updated_at: new Date().toISOString(),
      data: { lastModifiedBy: "other-client" }
    }
  });
  assert.equal(sandbox.__pullCount, 3, "realtime should still pull when local checkpoint is ahead of remote metadata");
  assert.equal(sandbox.__pullArgs.at(-1).forceFull, true, "checkpoint-skew realtime recovery should force a full pull");
}

async function testStartupCloudPullPreservesLocalEdits() {
  const { internals, sandbox } = loadSyncInternals();
  const startupSnapshot = {
    _lastModified: 100,
    vouchers: [],
    products: [{ id: "P1", name: "Product" }],
    partners: []
  };
  const cloudData = {
    _lastModified: 200,
    vouchers: [{ id: "CLOUD-1", _updatedAt: 200 }],
    products: [{ id: "P1", name: "Product" }],
    partners: []
  };
  sandbox.state = {
    _lastModified: 200 + 31 * 60 * 1000,
    vouchers: [{ id: "LOCAL-1", _updatedAt: 200 + 31 * 60 * 1000 }],
    products: [{ id: "P1", name: "Product" }],
    partners: []
  };

  const result = internals.prepareStartupCloudState(cloudData, startupSnapshot);
  assert.equal(result.localChangedDuringStartup, true);
  assert.deepEqual(
    result.stateToUse.vouchers.map(v => v.id).sort(),
    ["CLOUD-1", "LOCAL-1"],
    "startup pull should merge local vouchers created while cloud data was loading"
  );
  assert.deepEqual(
    result.lastSyncStateToUse.vouchers.map(v => v.id),
    ["CLOUD-1"],
    "local-only startup edits must not be marked as already synced"
  );
}

async function testPushDuringStartupIsQueued() {
  const { sandbox } = loadSyncInternals();
  const result = vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = {};
    isStartupPullCompleted = false;
    pushAfterStartupPull = false;
    pushToCloud().then(() => pushAfterStartupPull);
  `, sandbox);

  assert.equal(await result, true, "pushes attempted during startup pull should be queued");
}

async function testRescueLookupIsBatchedAndExact() {
  const { internals } = loadSyncInternals();
  const keys = Array.from({ length: 405 }, (_, index) => `v_${index}`);
  const calls = [];

  const fakeClient = {
    from(table) {
      assert.equal(table, "rd_accounting_data");
      return {
        select(columns) {
          assert.equal(columns, "id");
          return {
            in(column, batch) {
              assert.equal(column, "id");
              calls.push(batch.slice());
              return Promise.resolve({
                data: batch.filter(id => id.endsWith("0")).map(id => ({ id })),
                error: null
              });
            }
          };
        }
      };
    }
  };

  const found = await internals.fetchExistingCloudIdsByKeysFromClient(fakeClient, keys);
  assert.equal(calls.length, 5, "405 keys should be fetched in 5 exact-key batches");
  assert.ok(calls.every(batch => batch.length <= 100), "rescue batches must stay within the configured size");
  assert.ok(found.has("v_0"));
  assert.ok(found.has("v_400"));
  assert.equal(found.has("v_401"), false);
}

async function testStaticSafetyChecks() {
  assert.ok(syncSource.includes("Cloud full pull reached pagination safety limit"));
  assert.ok(syncSource.includes("Cloud incremental pull reached pagination safety limit"));
  assert.ok(syncSource.includes("LAST_PULLED_CLOUD_TS_KEY"));
  assert.ok(syncSource.includes("retryFullIfNoChanges"), "manual sync should be able to recover from a bad checkpoint");
  assert.ok(!syncSource.includes("const { data: cloudRows"), "rescue must not use unpaginated full-table id select");
}

async function testBatchSelectionResetUI() {
  const match = uiFrameworkSource.match(/function resetBatchSelectionUI\([\s\S]*?\n}\n/);
  assert.ok(match, "resetBatchSelectionUI helper should exist");

  const rows = [
    { checked: true },
    { checked: true }
  ];
  const elements = new Map([
    ["check-all-sales", { checked: true }],
    ["btn-batch-delete-sales", { style: { display: "inline-flex" } }],
    ["selected-sales-count", { innerText: "2" }]
  ]);
  const sandbox = {
    document: {
      querySelectorAll(selector) {
        return selector === ".sale-checkbox" ? rows : [];
      },
      getElementById(id) {
        return elements.get(id) || null;
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(`${match[0]}; resetBatchSelectionUI({
    checkboxSelector: ".sale-checkbox",
    masterId: "check-all-sales",
    buttonId: "btn-batch-delete-sales",
    countId: "selected-sales-count"
  });`, sandbox, { filename: uiFrameworkPath });

  assert.deepEqual(rows.map(row => row.checked), [false, false], "row checkboxes should be cleared after batch delete");
  assert.equal(elements.get("check-all-sales").checked, false, "master checkbox should be cleared after batch delete");
  assert.equal(elements.get("btn-batch-delete-sales").style.display, "none", "batch delete button should be hidden after delete");
  assert.equal(elements.get("selected-sales-count").innerText, "0", "selected count should return to zero");
}

async function testFetchCloudDeltaAbortsOnActiveLock() {
  const { internals, sandbox } = loadSyncInternals();
  
  // 1. Mock supabaseClient returning an active lock metadata
  sandbox.__metadataRow = { 
    id: "metadata", 
    last_modified: 200, 
    is_syncing: true, 
    updated_at: new Date().toISOString() 
  };
  sandbox.__fakeClient = {
    from(table) {
      assert.equal(table, "rd_accounting_data");
      return {
        select(columns) {
          assert.ok(columns.includes("is_syncing"));
          return {
            eq(column, id) {
              assert.equal(column, "id");
              assert.equal(id, "metadata");
              return {
                single() {
                  return Promise.resolve({ data: sandbox.__metadataRow, error: null });
                }
              };
            }
          };
        }
      };
    }
  };
  
  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = __fakeClient;
  `, sandbox);
  
  // 2. Call fetchCloudDelta and verify it returns null (aborted)
  const deltaResult = await internals.fetchCloudDelta(100);
  assert.equal(deltaResult, null, "fetchCloudDelta should abort and return null when cloud is syncing");
  
  // 3. Mock metadata with is_syncing = false
  sandbox.__metadataRow.is_syncing = false;
  
  // Mock the rest of query to prevent errors when it queries changes
  sandbox.__fakeClient.from = function(table) {
    return {
      select(columns) {
        return {
          eq(column, id) {
            return {
              single() {
                return Promise.resolve({ data: sandbox.__metadataRow, error: null });
              }
            };
          },
          gt(column, value) {
            return this;
          },
          order(column) {
            return this;
          },
          limit(step) {
            return Promise.resolve({ data: [], error: null });
          }
        };
      }
    };
  };
  
  const deltaResult2 = await internals.fetchCloudDelta(100);
  assert.ok(deltaResult2 !== null, "fetchCloudDelta should proceed when cloud is not syncing");
}

async function testLockRowsExpiryAndCleanup() {
  const { internals } = loadSyncInternals();

  const now = Date.now();
  const rows = [
    { id: "lock_v_HD-0000102", last_modified: now - 5 * 60 * 1000 },  // 5 mins ago (active)
    { id: "lock_v_HD-0000103", last_modified: now - 20 * 60 * 1000 } // 20 mins ago (stale)
  ];

  const maxSeq = internals.getMaxVoucherSequenceFromRows(rows, "HD-", "lock_v_");
  assert.equal(maxSeq, 102, "should only read sequence from active locks, ignoring the stale lock of 103");
}

async function testStartupPullDefersAndRunsPendingPulls() {
  const { internals, sandbox } = loadSyncInternals();

  sandbox.__pullCount = 0;
  vm.runInContext(`
    cloudSyncActive = true;
    supabaseClient = {};
    isStartupPullCompleted = false; // startup pending
    pullPending = false;
    isPulling = false;
    isPushing = false;
    lastSyncedCloudTs = 100;
    
    // Mock fetchCloudData
    fetchCloudData = function() { __pullCount += 1; return Promise.resolve(null); };
  `, sandbox);

  sandbox.__metadataRow = { last_modified: 200, is_syncing: false };
  sandbox.__fakeClient = {
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, id) {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: sandbox.__metadataRow, error: null });
                }
              };
            }
          };
        }
      };
    }
  };
  vm.runInContext(`supabaseClient = __fakeClient;`, sandbox);

  await internals.checkCloudMetadataForChanges("test-deferred");
  
  assert.equal(sandbox.__pullCount, 0, "pull should be deferred during startup pull");

  internals.finishStartupPull();
  
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(sandbox.__pullCount, 1, "deferred pull should be executed after startup pull finishes");
}

async function run() {
  await testDeepComparators();
  await testPullCheckpointStorage();
  await testMonotonicCloudPushTimestamp();
  await testCloudSafeVoucherIdUsesCloudMaxAndReservation();
  await testCloudSafeVoucherIdSupportsPurchaseOrderAliases();
  await testStartupCheckpointReadsPersistedStateMarker();
  await testLegacyStartupCheckpointDetectsCachedState();
  await testLegacyStartupCheckpointUsesOriginalStateLastModified();
  await testEntryModalDetection();
  await testMetadataPollingDetectsRemoteChanges();
  await testRealtimeMetadataEventTriggersPull();
  await testFetchCloudDeltaAbortsOnActiveLock();
  await testLockRowsExpiryAndCleanup();
  await testStartupPullDefersAndRunsPendingPulls();
  await testStartupCloudPullPreservesLocalEdits();
  await testPushDuringStartupIsQueued();
  await testRescueLookupIsBatchedAndExact();
  await testStaticSafetyChecks();
  await testBatchSelectionResetUI();
  console.log("sync regression tests passed");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
