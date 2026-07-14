// ==========================================================================
// CLOUD SYNC - the single synchronization engine used by the application.
// ==========================================================================

let supabaseClient = null;
let cloudSyncActive = false;
let isStartupPullCompleted = false;
let realtimeChannel = null;
let lastSyncState = window.lastSyncState || null;
const CLOUD_SYNC_DATASET_KEY = "rd_accounting_sync_dataset";
const CLOUD_SYNC_LEGACY_DATASET_KEY = "rd_accounting_sync_v2_dataset";
let isPulling = false;
let isPushing = false;
let pullPending = false;
let pendingPullOptions = null;
let pushPending = false;
let deferredCloudPull = false;
let deferredCloudPullReason = "";
let cloudMetadataPollTimer = null;
let cloudMetadataInitialPollTimer = null;
let cloudFocusCheckAttached = false;
let realtimeReconnectTimer = null;
let lastCloudMetadataPollAt = 0;
let lastCheckpointRecoveryAt = 0;
let lastPulledCloudWatermark = 0;
let pushRetryTimeout = null;
let scheduledPullTimer = null;
let lastPullCompletedAt = 0;
let manualCloudSyncAction = "";
let cloudWorkspaceId = "00000000-0000-4000-8000-000000000001";
let cloudSyncVersion = 0;
let cloudUsesVersionedRpc = false;
let cloudSyncWriteQueue = Promise.resolve();
let cloudSyncTaskSequence = 0;
const cloudSyncTasks = [];

const CLOUD_SYNC_CHECKPOINT_KEY = "rd_accounting_last_pulled_cloud_ts";
const CLOUD_SYNC_PENDING_WRITE_KEY = "rd_accounting_cloud_push_pending";
const CLOUD_SYNC_TABLE = "rd_accounting_data";
const CLOUD_SYNC_METADATA_ID = "metadata";
const CLOUD_SYNC_PAGE_SIZE = 500;
const CLOUD_SYNC_FULL_MAX_PAGES = 200;
const CLOUD_SYNC_DELTA_MAX_PAGES = 80;
const CLOUD_SYNC_BATCH_SIZE = 300;
const CLOUD_SYNC_DELETE_BATCH_SIZE = 100;
// Lightweight RPC polling keeps station-to-station visibility below 5 seconds.
const CLOUD_SYNC_POLL_INTERVAL_MS = 3000;
const CLOUD_SYNC_POLL_MIN_GAP_MS = 1500;
const CLOUD_SYNC_PULL_DEBOUNCE_MS = 450;
const CLOUD_SYNC_PRE_PUSH_PULL_COOLDOWN_MS = 2000;
const CLOUD_SYNC_STALE_LOCK_MS = 30 * 60 * 1000;
const CLOUD_SYNC_RECOVERY_GAP_MS = 60 * 1000;
const CLOUD_SYNC_RECONNECT_DELAY_MS = 5000;

const CLOUD_SYNC_ENTITY_DEFS = [
  { stateKey: "vouchers", rowPrefix: "v_", deleteType: "voucher" },
  { stateKey: "products", rowPrefix: "p_", deleteType: "product" },
  { stateKey: "partners", rowPrefix: "part_", deleteType: "partner" }
];

const CLOUD_SYNC_MERGE_ENTITY_KEYS = ["vouchers", "products", "partners", "cashEntries", "escrowItems"];
const CLOUD_SYNC_DELETE_DEFS = [
  ...CLOUD_SYNC_ENTITY_DEFS,
  { stateKey: "cashEntries", rowPrefix: "cash_", deleteType: "cashEntry" },
  { stateKey: "escrowItems", rowPrefix: "escrow_", deleteType: "escrowItem" }
];

function cloudSyncLog(message) {
  console.log(`[CloudSync] ${message}`);
  if (window.electronAPI && typeof window.electronAPI.writeLog === "function") {
    window.electronAPI.writeLog(`[CloudSync] ${message}`).catch(err => console.error("CloudSync log error:", err));
  }
}

function updateStartupStatus(text) {
  console.log(`[StartupStatus] ${text}`);
}

function hideStartupOverlay() {
  // Startup overlay removed in current app.
}

function cloudSyncClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

// Cede the main thread for one macrotask so the renderer can paint between
// heavy phases of a pull. Only call at safe boundaries (never between reading
// `state` for a merge and re-assigning it).
function cloudSyncYieldToUi() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// One-time cleanup: the full lastSyncState snapshot used to be persisted to
// localStorage ("rd_accounting_last_sync_cache", a multi-MB synchronous write on
// every pull/push and a major UI-freeze source). The snapshot is now kept in
// memory only; drop any stale legacy blob so nothing can restore outdated data.
try {
  localStorage.removeItem("rd_accounting_last_sync_cache");
} catch (err) {}

function cloudSyncStableStringify(value) {
  if (value === undefined) return "__undefined__";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(cloudSyncStableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${cloudSyncStableStringify(value[key])}`).join(",")}}`;
}

function cloudSyncEqual(a, b) {
  return cloudSyncStableStringify(a) === cloudSyncStableStringify(b);
}

function cloudSyncEntityNeedsPush(previous, current) {
  if (!previous) return true;
  if (!current) return false;
  const previousTs = Number(previous._updatedAt) || 0;
  const currentTs = Number(current._updatedAt) || 0;
  if (currentTs > previousTs) return true;
  if (currentTs < previousTs) {
    // A station clock may be behind the cloud watermark. Business edits stamp
    // the current session, so preserve the edit and advance it logically later.
    return current._sessionId === cloudSyncGetSessionId() && !cloudSyncEqual(previous, current);
  }
  // Recalculation/UI refresh may update derived fields without representing a
  // user edit. At an unchanged version those differences must never fan out as
  // thousands of cloud upserts.
  return false;
}

function areVouchersEqual(a, b) {
  return cloudSyncEqual(a, b);
}

function areProductsEqual(a, b) {
  return cloudSyncEqual(a, b);
}

function arePartnersEqual(a, b) {
  return cloudSyncEqual(a, b);
}

function cloudSyncDefaultState() {
  return {
    companyName: "",
    address: "",
    taxCode: "",
    accountingStandard: "TT200",
    initialBalances: {},
    partnerOpeningBalances: {},
    partnerOpeningBalanceTs: {},
    vouchers: [],
    products: [],
    partners: [],
    cashEntries: [],
    escrowItems: [],
    deletedIds: [],
    deletedCloudKeys: []
  };
}

function cloudSyncGetSessionId() {
  if (typeof clientSessionId !== "undefined") return clientSessionId;
  return "client_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getStoredLastPulledCloudTs() {
  const stateTs = Number(typeof state !== "undefined" && state ? state._lastPulledCloudTs : 0);
  if (Number.isFinite(stateTs) && stateTs > 0) return stateTs;

  let stored = 0;
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_CHECKPOINT_KEY);
    const parsed = raw ? Number(raw) : 0;
    stored = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (err) {
    stored = 0;
  }

  if (stored > 0) return stored;
  return 0;
}

function persistLastPulledCloudTs(ts) {
  const safeTs = Math.max(0, Number(ts) || 0);
  lastPulledCloudWatermark = safeTs;
  if (typeof lastSyncedCloudTs !== "undefined") {
    lastSyncedCloudTs = safeTs;
  }
  if (typeof state !== "undefined" && state) {
    state._lastPulledCloudTs = safeTs;
  }
  try {
    if (safeTs > 0) {
      localStorage.setItem(CLOUD_SYNC_CHECKPOINT_KEY, String(safeTs));
    } else {
      localStorage.removeItem(CLOUD_SYNC_CHECKPOINT_KEY);
    }
  } catch (err) {
    console.warn("[CloudSync] Cannot persist pull checkpoint:", err);
  }
}

function getPullCheckpointTs() {
  const stored = getStoredLastPulledCloudTs();
  if (stored > 0) {
    if (typeof lastSyncedCloudTs !== "undefined") lastSyncedCloudTs = stored;
    return stored;
  }
  return Number(typeof lastSyncedCloudTs !== "undefined" ? lastSyncedCloudTs : 0) || 0;
}

function getStartupPullCheckpointTs() {
  return getPullCheckpointTs();
}

function getLegacyStartupCheckpointTs() {
  const currentState = typeof state !== "undefined" ? state : null;
  const stateTs = Number((typeof window !== "undefined" && window.originalStateLastModified) || (currentState && currentState._lastModified) || 0);
  const hasCachedEntities = !!(currentState && (
    (Array.isArray(currentState.vouchers) && currentState.vouchers.length > 0) ||
    (Array.isArray(currentState.products) && currentState.products.length > 0) ||
    (Array.isArray(currentState.partners) && currentState.partners.length > 0)
  ));
  return hasCachedEntities && Number.isFinite(stateTs) && stateTs > 0 ? stateTs : 0;
}

function cloudSyncPrefixForEntity(entityType) {
  if (entityType === "product") return "p_";
  if (entityType === "partner") return "part_";
  if (entityType === "cashEntry") return "cash_";
  if (entityType === "escrowItem") return "escrow_";
  return "v_";
}

function trackDeletedIds(ids, entityType = "voucher") {
  if (!ids || ids.length === 0) return;
  if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
  if (!Array.isArray(state.deletedCloudKeys)) state.deletedCloudKeys = [];

  const prefix = cloudSyncPrefixForEntity(entityType);
  ids.forEach(id => {
    if (!id) return;
    if (!state.deletedIds.includes(id)) state.deletedIds.push(id);
    const cloudKey = `${prefix}${id}`;
    if (!state.deletedCloudKeys.includes(cloudKey)) state.deletedCloudKeys.push(cloudKey);
  });

  state._lastModified = Date.now();
}

// Adopt `newState` as the in-memory cloud snapshot used by computeDelta.
// IMPORTANT: no deep clone and no localStorage write happens here anymore (both
// froze the UI on multi-MB states). The caller must guarantee that `newState`
// shares no item object references with the live `state` (the merge pipeline
// clones every cloud item it copies into `state`, so cloud snapshots stay
// exclusive). After a push use cloudSyncApplyPushToLastSyncState instead.
function updateLastSyncState(newState) {
  if (!newState) {
    lastSyncState = null;
    window.lastSyncState = null;
    return;
  }

  lastSyncState = newState;
  window.lastSyncState = lastSyncState;
}

function cloudSyncResetCloudBaseline() {
  updateLastSyncState(null);
}

// After a successful push the cloud mirrors the pushed rows, so lastSyncState
// must too. Instead of deep-cloning the entire state (previous behavior),
// re-apply only the rows that were actually uploaded onto the prior snapshot.
function cloudSyncApplyPushToLastSyncState(pushedEntityRows, pushTs, pushedMetadata = null) {
  lastSyncState = window.lastSyncState || lastSyncState;
  const previousSnapshot = lastSyncState || cloudSyncDefaultState();

  // Reuse the exact metadata row that was uploaded. The live deletion-marker
  // arrays are cleared after a successful push, so rebuilding from live state
  // here would make the snapshot diverge from cloud immediately.
  const next = cloudSyncClone(pushedMetadata || cloudSyncBuildMetadataForPush(pushTs));

  const rowsByDef = new Map();
  (pushedEntityRows || []).forEach(row => {
    if (!row || !row.id) return;
    const def = cloudSyncGetRowDef(row.id);
    if (!def) return;
    if (!rowsByDef.has(def)) rowsByDef.set(def, []);
    rowsByDef.get(def).push(row);
  });

  CLOUD_SYNC_ENTITY_DEFS.forEach(def => {
    const map = new Map();
    (previousSnapshot[def.stateKey] || []).forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
    (rowsByDef.get(def) || []).forEach(row => {
      const entityId = cloudSyncGetEntityIdFromRowId(row.id, def);
      if (row.data && row.data._deleted) {
        map.delete(entityId);
      } else if (row.data && row.data.id) {
        // Clone: row.data is the live state item; snapshot must not alias it.
        map.set(row.data.id, cloudSyncClone(row.data));
      }
    });
    next[def.stateKey] = Array.from(map.values());
  });

  lastSyncState = next;
  window.lastSyncState = lastSyncState;
}

function cloudSyncGetRowDef(rowId) {
  return CLOUD_SYNC_DELETE_DEFS.find(def => rowId && rowId.startsWith(def.rowPrefix));
}

function cloudSyncShouldUseFullPull(checkpoint, hasCompleteBaseline, cloudWatermark = null) {
  const safeCheckpoint = Number(checkpoint) || 0;
  if (!(safeCheckpoint > 0) || !hasCompleteBaseline) return true;
  if (cloudWatermark === null || cloudWatermark === undefined || cloudWatermark === "") return false;
  const safeCloudWatermark = Number(cloudWatermark);
  return Number.isFinite(safeCloudWatermark) && safeCloudWatermark < safeCheckpoint;
}

function cloudSyncGetEntityIdFromRowId(rowId, def) {
  return String(rowId || "").slice(def.rowPrefix.length);
}

function cloudSyncNormalizeDeletedCloudKey(key) {
  const rawKey = String(key || "");
  if (!rawKey) return "";
  return cloudSyncGetRowDef(rawKey) ? rawKey : `v_${rawKey}`;
}

function cloudSyncGetDeletedIdsByState(sourceState) {
  const result = {};
  CLOUD_SYNC_DELETE_DEFS.forEach(def => {
    result[def.stateKey] = new Set();
  });

  const typedIds = new Set();
  (sourceState && Array.isArray(sourceState.deletedCloudKeys) ? sourceState.deletedCloudKeys : []).forEach(key => {
    const normalizedKey = cloudSyncNormalizeDeletedCloudKey(key);
    const def = cloudSyncGetRowDef(normalizedKey);
    if (!def) return;
    const entityId = cloudSyncGetEntityIdFromRowId(normalizedKey, def);
    if (!entityId) return;
    result[def.stateKey].add(entityId);
    typedIds.add(entityId);
  });

  // Old versions only persisted deletedIds and those IDs represented vouchers.
  // Use that fallback only without a typed tombstone. Otherwise deleting a
  // product/partner could erase an unrelated voucher sharing the same ID.
  (sourceState && Array.isArray(sourceState.deletedIds) ? sourceState.deletedIds : []).forEach(id => {
    if (id && !typedIds.has(id)) result.vouchers.add(id);
  });

  return result;
}

function cloudSyncMakeTombstoneRow(rowId, pushTs) {
  const normalizedRowId = cloudSyncNormalizeDeletedCloudKey(rowId);
  const def = cloudSyncGetRowDef(normalizedRowId);
  const entityId = def ? cloudSyncGetEntityIdFromRowId(normalizedRowId, def) : normalizedRowId;
  return {
    id: normalizedRowId,
    data: {
      id: entityId,
      _deleted: true,
      _deletedCloudKey: normalizedRowId,
      _deletedEntity: def ? def.deleteType : "voucher",
      _deletedAt: pushTs,
      lastModifiedBy: cloudSyncGetSessionId()
    },
    last_modified: pushTs,
    is_syncing: false,
    updated_at: new Date().toISOString()
  };
}

function cloudSyncSplitMetadata(sourceState) {
  const {
    vouchers,
    products,
    partners,
    _lastPulledCloudTs,
    _cloudWatermark,
    ...metadata
  } = sourceState || {};
  return metadata;
}

function cloudSyncBuildMetadataForPush(pushTs) {
  const metadata = cloudSyncSplitMetadata(state);
  metadata._lastModified = pushTs;
  metadata.lastModifiedBy = cloudSyncGetSessionId();
  return metadata;
}

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  return el.style.display === "flex" || el.style.display === "block" || (style && (style.display === "flex" || style.display === "block"));
}

function isVoucherEntryModalOpen() {
  const entryModalIds = [
    "modal-add-sales",
    "modal-add-purchase",
    "modal-add-purchase-order",
    "modal-add-purchase-return",
    "modal-add-sales-return",
    "modal-add-sales-quotation",
    "modal-add-receipt",
    "modal-add-payment",
    "modal-edit-debt"
  ];
  return entryModalIds.some(id => isElementVisible(document.getElementById(id)));
}

function isCloudSyncLockActive(row, reason = "") {
  if (!row || !row.is_syncing) return false;
  const updatedAtMs = row.updated_at ? Date.parse(row.updated_at) : NaN;
  if (!Number.isFinite(updatedAtMs)) return true;
  const ageMs = Date.now() - updatedAtMs;
  if (ageMs >= CLOUD_SYNC_STALE_LOCK_MS) {
    console.warn(`[CloudSync] Ignoring stale lock from ${reason}; age=${ageMs}ms`);
    return false;
  }
  return true;
}

function cloudSyncNoteLegacyLock(row, reason = "") {
  if (isCloudSyncLockActive(row, reason)) {
    cloudSyncLog(`Legacy global lock observed during ${reason || "sync"}; continuing with row-level sync.`);
  }
}

function withTimeout(promise, ms = 10000) {
  let timeoutId;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let request = promise;
  if (controller && request && typeof request.abortSignal === "function") {
    request = request.abortSignal(controller.signal);
  }
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error(`Cloud request timed out after ${ms}ms.`));
    }, ms);
  });
  return Promise.race([
    Promise.resolve(request).finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

function cloudSyncHasPendingLocalWrite() {
  try {
    return !!localStorage.getItem(CLOUD_SYNC_PENDING_WRITE_KEY);
  } catch (err) {
    return false;
  }
}

function cloudSyncGetPendingLocalWriteToken() {
  try {
    return localStorage.getItem(CLOUD_SYNC_PENDING_WRITE_KEY) || "";
  } catch (err) {
    return "";
  }
}

function markCloudWritePending() {
  const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(CLOUD_SYNC_PENDING_WRITE_KEY, token);
  } catch (err) {
    console.warn("[CloudSync] Cannot persist pending-write marker:", err);
  }
  return token;
}

function cloudSyncClearPendingLocalWrite(expectedToken = null) {
  try {
    if (expectedToken && localStorage.getItem(CLOUD_SYNC_PENDING_WRITE_KEY) !== expectedToken) return false;
    localStorage.removeItem(CLOUD_SYNC_PENDING_WRITE_KEY);
    return true;
  } catch (err) {
    return false;
  }
}

window.markCloudWritePending = markCloudWritePending;

function cloudSyncRenderTasks() {
  const list = document.getElementById("cloud-sync-task-list");
  const empty = document.getElementById("cloud-sync-task-empty");
  const summary = document.getElementById("cloud-sync-task-summary");
  if (!list) return;
  list.innerHTML = "";
  if (empty) empty.hidden = cloudSyncTasks.length > 0;
  if (summary) {
    const runningCount = cloudSyncTasks.filter(task => task.status === "running").length;
    summary.textContent = runningCount > 0
      ? `${runningCount} tác vụ đang chạy`
      : (cloudSyncTasks.length > 0 ? `${cloudSyncTasks.length} tác vụ gần nhất` : "Hoạt động nền gần nhất trên máy này");
  }
  cloudSyncTasks.slice(0, 30).forEach(task => {
    const item = document.createElement("li");
    item.className = `cloud-sync-task cloud-sync-task-${task.status}`;
    const title = document.createElement("span");
    title.textContent = task.label;
    const status = document.createElement("strong");
    status.textContent = task.status === "running" ? "Đang chạy" : (task.status === "done" ? "Hoàn tất" : "Lỗi");
    const time = document.createElement("small");
    const elapsedMs = task.finishedAt ? task.finishedAt - task.startedAt : 0;
    const elapsedLabel = elapsedMs >= 1000 ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : "";
    time.textContent = `${new Date(task.startedAt).toLocaleTimeString("vi-VN")}${elapsedLabel}`;
    item.append(title, status, time);
    list.appendChild(item);
  });
}

function cloudSyncStartTask(type, label) {
  const task = { id: ++cloudSyncTaskSequence, type, label, status: "running", startedAt: Date.now() };
  cloudSyncTasks.unshift(task);
  if (cloudSyncTasks.length > 50) cloudSyncTasks.length = 50;
  cloudSyncRenderTasks();
  return task;
}

function cloudSyncFinishTask(task, ok) {
  if (!task) return;
  task.status = ok ? "done" : "error";
  task.finishedAt = Date.now();
  cloudSyncRenderTasks();
}

async function cloudSyncReadWithRetry(createRequest, label, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 2);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 15000);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(createRequest(), timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts) break;
      cloudSyncLog(`${label} failed (${attempt}/${attempts}): ${err.message}; retrying...`);
      await new Promise(resolve => setTimeout(resolve, 350 * attempt));
    }
  }
  throw lastError;
}

async function cloudSyncFetchMetadata(options = {}) {
  if (cloudUsesVersionedRpc) {
    const { data, error } = await cloudSyncReadWithRetry(
      () => supabaseClient.rpc("rd_cloud_status", {
        p_workspace_id: cloudWorkspaceId
      }),
      "cloud status read",
      { timeoutMs: 15000 }
    );
    if (error) throw error;
    const workspace = Array.isArray(data) ? data[0] : data;
    cloudSyncVersion = Math.max(cloudSyncVersion, Number(workspace && workspace.sync_version) || 0);
    return {
      id: CLOUD_SYNC_METADATA_ID,
      data: {},
      last_modified: cloudSyncVersion,
      is_syncing: false,
      updated_at: new Date().toISOString()
    };
  }
  // summaryOnly: skip the heavy `data` JSON blob when only timestamps/locks are needed (polling path).
  const columns = options.summaryOnly
    ? "id, last_modified, is_syncing, updated_at"
    : "id, data, last_modified, is_syncing, updated_at";
  const { data, error } = await cloudSyncReadWithRetry(
    () => supabaseClient
      .from(CLOUD_SYNC_TABLE)
      .select(columns)
      .eq("id", CLOUD_SYNC_METADATA_ID)
      .maybeSingle(),
    "metadata read"
  );
  if (error) throw error;
  return data || null;
}

async function cloudSyncEnsureMetadataRow(options = {}) {
  const existing = await cloudSyncFetchMetadata(options);
  if (existing) return existing;

  const now = Date.now();
  const row = {
    id: CLOUD_SYNC_METADATA_ID,
    // A brand-new cloud must inherit the already-loaded local metadata. A
    // timestamp-only row would otherwise make blank cloudSyncDefaultState fields
    // look newer and overwrite company settings/opening balances on first pull.
    data: cloudSyncBuildMetadataForPush(now),
    last_modified: now,
    is_syncing: false,
    updated_at: new Date().toISOString()
  };
  // Insert-only avoids a check-then-upsert race where two clients starting at
  // once could overwrite the metadata row that the other client just created.
  const { error } = await supabaseClient.from(CLOUD_SYNC_TABLE).insert(row);
  if (error) {
    if (isCloudDuplicateKeyError(error)) {
      const racedExisting = await cloudSyncFetchMetadata(options);
      if (racedExisting) return racedExisting;
    }
    throw error;
  }
  return row;
}

async function cloudSyncFetchLatestRowSummary() {
  if (cloudUsesVersionedRpc) return { id: CLOUD_SYNC_METADATA_ID, last_modified: cloudSyncVersion };
  const { data, error } = await cloudSyncReadWithRetry(
    () => supabaseClient
      .from(CLOUD_SYNC_TABLE)
      .select("id, last_modified")
      .order("last_modified", { ascending: false })
      .limit(1),
    "watermark read"
  );
  if (error) throw error;
  return (data && data[0]) || null;
}

function cloudSyncWatermarkFromRows(rows, metadataRow = null) {
  if (cloudUsesVersionedRpc) {
    return (rows || []).reduce((max, row) => Math.max(max, Number(row && row.sync_version) || 0), cloudSyncVersion);
  }
  let watermark = Number(metadataRow && metadataRow.last_modified) || 0;
  (rows || []).forEach(row => {
    watermark = Math.max(watermark, Number(row && row.last_modified) || 0);
  });
  return watermark;
}

async function cloudSyncGetCloudWatermark(metadataRow = null) {
  if (cloudUsesVersionedRpc) return cloudSyncVersion;
  const latest = await cloudSyncFetchLatestRowSummary();
  return Math.max(
    Number(metadataRow && metadataRow.last_modified) || 0,
    Number(latest && latest.last_modified) || 0
  );
}

function cloudSyncGetDatasetIdentity() {
  let projectUrl = "";
  try {
    projectUrl = new URL(String(cloudSyncSettings && cloudSyncSettings.supabaseUrl || "")).origin.toLowerCase();
  } catch (err) {
    projectUrl = String(cloudSyncSettings && cloudSyncSettings.supabaseUrl || "").trim().toLowerCase();
  }
  return `${projectUrl}|${cloudWorkspaceId || "legacy"}`;
}

function cloudSyncGetStoredDatasetIdentity() {
  const stateIdentity = String(typeof state !== "undefined" && state && state._cloudDatasetIdentity || "");
  if (stateIdentity) return stateIdentity;
  try {
    return localStorage.getItem(CLOUD_SYNC_DATASET_KEY)
      || localStorage.getItem(CLOUD_SYNC_LEGACY_DATASET_KEY)
      || "";
  } catch (err) {
    return "";
  }
}

function cloudSyncPersistDatasetIdentity() {
  const identity = cloudSyncGetDatasetIdentity();
  if (typeof state !== "undefined" && state) state._cloudDatasetIdentity = identity;
  try {
    localStorage.setItem(CLOUD_SYNC_DATASET_KEY, identity);
    localStorage.removeItem(CLOUD_SYNC_LEGACY_DATASET_KEY);
  } catch (err) {
    console.warn("[CloudSync] Cannot persist cloud dataset identity:", err);
  }
}

// In online-first mode SQLite only contains server-confirmed state. Reusing that
// cache as the comparison baseline makes a normal restart an incremental pull,
// without writing a second multi-megabyte snapshot to localStorage.
function cloudSyncRestoreBaselineFromConfirmedCache() {
  const checkpoint = getPullCheckpointTs();
  if (cloudSyncHasPendingLocalWrite() || !(checkpoint > 0) || !state || cloudSyncGetStoredDatasetIdentity() !== cloudSyncGetDatasetIdentity()) {
    return false;
  }

  const baseline = cloudSyncClone(state);
  baseline._cloudWatermark = checkpoint;
  baseline._lastPulledCloudTs = checkpoint;
  updateLastSyncState(baseline);
  cloudSyncLog(`Restored confirmed cloud baseline from SQLite cache (checkpoint=${checkpoint}).`);
  return true;
}

function cloudSyncSetWriteReady(detail) {
  if (!window.cloudWriteGate) return;
  if (window.localPersistenceHealthy === false) {
    window.cloudWriteGate.setStatus("error", "SQLite chưa sẵn sàng; không thể ghi dữ liệu an toàn.");
  } else {
    window.cloudWriteGate.setStatus("ready", detail || "Cloud đã sẵn sàng.");
  }
}

async function cloudSyncAuthenticateAndBootstrap() {
  const { data, error } = await cloudSyncReadWithRetry(
    () => supabaseClient.rpc("rd_cloud_status", {
      p_workspace_id: cloudWorkspaceId
    }),
    "cloud bootstrap",
    { timeoutMs: 15000 }
  );
  if (error) {
    const code = String(error.code || "");
    const message = String(error.message || "").toLowerCase();
    const missingRpc = code === "PGRST202" || code === "42883" ||
      message.includes("rd_cloud_status") && (message.includes("not found") || message.includes("does not exist"));
    if (missingRpc) {
      cloudUsesVersionedRpc = false;
      cloudSyncVersion = 0;
      cloudSyncLog("Cloud chưa có RPC transaction; tiếp tục bằng schema tương thích hiện tại.");
      return;
    }
    throw error;
  }
  const workspace = Array.isArray(data) ? data[0] : data;
  if (!workspace || !workspace.workspace_id) throw new Error("Cloud không trả về workspace hợp lệ.");
  cloudSyncVersion = Number(workspace.sync_version) || 0;
  cloudUsesVersionedRpc = true;
}

async function cloudSyncFetchAllRows() {
  const rows = [];
  let lastSeenId = "";

  for (let page = 0; page < CLOUD_SYNC_FULL_MAX_PAGES; page++) {
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, `Mây: Đang tải dữ liệu (${page + 1})...`, "#f59e0b");
    }
    updateStartupStatus(`Dang tai cloud snapshot: trang ${page + 1}...`);

    let request;
    if (cloudUsesVersionedRpc) {
      request = supabaseClient.rpc("rd_sync_snapshot", {
        p_workspace_id: cloudWorkspaceId,
        p_after_id: lastSeenId || null,
        p_limit: CLOUD_SYNC_PAGE_SIZE
      });
    } else {
      let query = supabaseClient.from(CLOUD_SYNC_TABLE).select("id, data, last_modified").order("id").limit(CLOUD_SYNC_PAGE_SIZE);
      if (lastSeenId) query = query.gt("id", lastSeenId);
      request = query;
    }
    const { data, error } = await withTimeout(request, 20000);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < CLOUD_SYNC_PAGE_SIZE) break;
    lastSeenId = data[data.length - 1].id;
  }

  if (rows.length >= CLOUD_SYNC_FULL_MAX_PAGES * CLOUD_SYNC_PAGE_SIZE) {
    throw new Error("Cloud full pull reached safety limit; refusing partial startup data.");
  }

  return rows;
}

function cloudSyncQuotePostgrestLogicValue(value) {
  // `.or()` accepts raw PostgREST logic-tree syntax. Values therefore need
  // grammar-level quoting; URI encoding is applied later by URLSearchParams.
  const escaped = String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

async function cloudSyncFetchRowsSince(sinceTs) {
  const rows = [];
  let lastSeenId = "";
  let lastSeenVersion = Number(sinceTs) || 0;

  for (let page = 0; page < CLOUD_SYNC_DELTA_MAX_PAGES; page++) {
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, `Mây: Quét thay đổi (${page + 1})...`, "#f59e0b");
    }

    let request;
    let createLegacyRequest = null;
    if (cloudUsesVersionedRpc) {
      request = supabaseClient.rpc("rd_sync_delta", {
        p_workspace_id: cloudWorkspaceId,
        p_after_version: lastSeenVersion,
        p_after_id: lastSeenId || null,
        p_limit: CLOUD_SYNC_PAGE_SIZE
      });
    } else {
      createLegacyRequest = () => {
        let query = supabaseClient
          .from(CLOUD_SYNC_TABLE)
          .select("id, data, last_modified")
          .order("last_modified", { ascending: true })
          .order("id", { ascending: true })
          .limit(CLOUD_SYNC_PAGE_SIZE);
        if (lastSeenId) {
          // Keyset pagination by (last_modified, id). Filtering by id alone can
          // skip rows and forces Postgres to sort every changed row on large data.
          const safeCursorId = cloudSyncQuotePostgrestLogicValue(lastSeenId);
          query = query.or(`last_modified.gt.${lastSeenVersion},and(last_modified.eq.${lastSeenVersion},id.gt.${safeCursorId})`);
        } else {
          query = query.gt("last_modified", lastSeenVersion);
        }
        return query;
      };
    }
    const { data, error } = cloudUsesVersionedRpc
      ? await withTimeout(request, 15000)
      : await cloudSyncReadWithRetry(createLegacyRequest, "delta page read", { timeoutMs: 20000 });
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < CLOUD_SYNC_PAGE_SIZE) break;
    const lastRow = data[data.length - 1];
    lastSeenId = lastRow.id;
    lastSeenVersion = Number(cloudUsesVersionedRpc ? lastRow.sync_version : lastRow.last_modified) || lastSeenVersion;
  }

  if (rows.length >= CLOUD_SYNC_DELTA_MAX_PAGES * CLOUD_SYNC_PAGE_SIZE) {
    throw new Error("Cloud incremental pull reached safety limit; retry full sync.");
  }

  return rows;
}

function cloudSyncStateFromRows(rows, options = {}) {
  const cloudState = cloudSyncDefaultState();
  const voucherChunks = [];
  const partnerChunks = [];
  let metadataRow = null;

  (rows || []).forEach(row => {
    if (!row || !row.id) return;

    if (row.id === CLOUD_SYNC_METADATA_ID) {
      metadataRow = row;
      // Rows come fresh from the network and are exclusively owned by this pull,
      // so a shallow copy (to safely delete keys) is enough - no deep clone.
      const metaData = { ...(row.data || {}) };
      const metaDeletedIds = metaData.deletedIds || [];
      const metaDeletedKeys = metaData.deletedCloudKeys || [];
      
      delete metaData.deletedIds;
      delete metaData.deletedCloudKeys;
      
      Object.assign(cloudState, metaData);
      
      if (!Array.isArray(cloudState.deletedIds)) cloudState.deletedIds = [];
      if (!Array.isArray(cloudState.deletedCloudKeys)) cloudState.deletedCloudKeys = [];
      
      metaDeletedIds.forEach(id => {
        if (id && !cloudState.deletedIds.includes(id)) cloudState.deletedIds.push(id);
      });
      metaDeletedKeys.forEach(key => {
        if (key && !cloudState.deletedCloudKeys.includes(key)) cloudState.deletedCloudKeys.push(key);
      });
      return;
    }

    if (row.id === "products") {
      cloudState.products = Array.isArray(row.data) ? row.data : [];
      return;
    }

    if (row.id.startsWith("vouchers_")) {
      const index = Number(row.id.split("_")[1]) || 0;
      voucherChunks[index] = Array.isArray(row.data) ? row.data : [];
      return;
    }

    if (row.id.startsWith("partners_")) {
      const index = Number(row.id.split("_")[1]) || 0;
      partnerChunks[index] = Array.isArray(row.data) ? row.data : [];
      return;
    }

    const def = cloudSyncGetRowDef(row.id);
    if (def && row.data) {
      if (row.data._deleted) {
        if (!Array.isArray(cloudState.deletedIds)) cloudState.deletedIds = [];
        if (!Array.isArray(cloudState.deletedCloudKeys)) cloudState.deletedCloudKeys = [];
        const entityId = cloudSyncGetEntityIdFromRowId(row.id, def);
        if (!cloudState.deletedIds.includes(entityId)) cloudState.deletedIds.push(entityId);
        if (!cloudState.deletedCloudKeys.includes(row.id)) cloudState.deletedCloudKeys.push(row.id);
        return;
      }
      if (row.data.id) {
        cloudState[def.stateKey].push(row.data);
      }
    }
  });

  voucherChunks.forEach(chunk => {
    if (chunk) cloudState.vouchers.push(...chunk);
  });
  partnerChunks.forEach(chunk => {
    if (chunk) cloudState.partners.push(...chunk);
  });

  const watermark = options.watermark || cloudSyncWatermarkFromRows(rows, metadataRow);
  cloudState._lastModified = Math.max(Number(cloudState._lastModified) || 0, watermark);
  cloudState._cloudWatermark = watermark;
  return { state: cloudSyncDeduplicateState(cloudState), watermark, metadataRow };
}

// Deduplicates entity arrays by id (highest _updatedAt wins) and drops items
// listed in deletedIds. Mutates sourceState in place instead of deep-cloning
// the whole state; every call site owns its input exclusively (freshly built
// cloud snapshots), so in-place is safe.
function cloudSyncDeduplicateState(sourceState) {
  const result = sourceState || cloudSyncDefaultState();
  const deletedByState = cloudSyncGetDeletedIdsByState(result);
  CLOUD_SYNC_DELETE_DEFS.forEach(def => {
    const deleted = deletedByState[def.stateKey];
    const map = new Map();
    (result[def.stateKey] || []).forEach(item => {
      if (!item || !item.id || deleted.has(item.id)) return;
      const previous = map.get(item.id);
      if (!previous || (Number(item._updatedAt) || 0) >= (Number(previous._updatedAt) || 0)) {
        map.set(item.id, item);
      }
    });
    result[def.stateKey] = Array.from(map.values());
  });
  return result;
}

// The big three are timestamp-stamped by computeDelta on every push, so an
// equal _updatedAt means "same version": keep the local object (no clone, no
// change flagged). cashEntries/escrowItems ride inside the metadata row without
// per-item stamping, so ties there fall back to a content compare with the old
// cloud-wins semantics (they are small arrays).
const CLOUD_SYNC_TIE_KEEP_LOCAL_KEYS = new Set(["vouchers", "products", "partners"]);

function cloudSyncNewMergeStats() {
  return {
    changed: false,
    changedIdsByEntity: { vouchers: new Set(), products: new Set(), partners: new Set() }
  };
}

// Merge one entity array. Local items are carried by reference (they already
// belong to the caller's local state); cloud winners are cloned only when
// options.cloneWinners is set, so the same object never ends up in both the
// live state and the lastSyncState snapshot.
function cloudSyncMergeEntityArrays(stateKey, localArr, cloudArr, deleted, options) {
  const stats = options.stats || null;
  const changedIds = stats ? stats.changedIdsByEntity[stateKey] : null;
  const tieKeepsLocal = CLOUD_SYNC_TIE_KEEP_LOCAL_KEYS.has(stateKey);
  const map = new Map();

  (localArr || []).forEach(item => {
    if (item && item.id && !deleted.has(item.id)) map.set(item.id, item);
  });

  (cloudArr || []).forEach(item => {
    if (!item || !item.id || deleted.has(item.id)) return;
    const localItem = map.get(item.id);
    let applyCloud = false;
    if (!localItem) {
      applyCloud = true;
    } else {
      const localTs = Number(localItem._updatedAt) || 0;
      const cloudTs = Number(item._updatedAt) || 0;
      if (cloudTs > localTs) {
        applyCloud = true;
      } else if (cloudTs === localTs) {
        if (!tieKeepsLocal) {
          applyCloud = !cloudSyncEqual(localItem, item);
        } else if (
          localItem._sessionId &&
          item._sessionId &&
          localItem._sessionId !== item._sessionId &&
          !cloudSyncEqual(localItem, item)
        ) {
          // Same timestamp from two machines: keep the remote copy so orders are not hidden.
          applyCloud = true;
        }
      }
    }
    if (!applyCloud) return;
    map.set(item.id, options.cloneWinners ? cloudSyncClone(item) : item);
    if (stats) {
      stats.changed = true;
      if (changedIds) changedIds.add(item.id);
    }
  });

  const mergedArr = Array.from(map.values());
  // Covers removals via deletedIds and local duplicate collapse.
  if (stats && mergedArr.length !== (localArr || []).length) stats.changed = true;
  return mergedArr;
}

// Metadata comparable for "did the pull change anything user-visible" checks.
// Bookkeeping keys that legitimately churn on every push/pull are excluded so
// echo pulls of our own pushes do not trigger recalc/refresh/persist.
function cloudSyncMetaComparable(meta) {
  const comparable = { ...(meta || {}) };
  delete comparable._lastModified;
  delete comparable._cloudWatermark;
  delete comparable._lastPulledCloudTs;
  delete comparable.lastModifiedBy;
  delete comparable.deletedIds;
  delete comparable.deletedCloudKeys;
  delete comparable.cashEntries;
  delete comparable.escrowItems;
  return cloudSyncStableStringify(comparable);
}

function cloudSyncMergeMetadata(localState, cloudState) {
  const localMeta = cloudSyncSplitMetadata(localState || {});
  const cloudMeta = cloudSyncSplitMetadata(cloudState || {});
  const localTs = Number(localState._lastModified) || Number((typeof window !== "undefined" && window.originalStateLastModified) || localMeta._lastModified) || 0;
  const cloudTs = Number(cloudMeta._lastModified || cloudState && cloudState._cloudWatermark) || 0;
  const merged = cloudTs >= localTs ? { ...localMeta, ...cloudMeta } : { ...cloudMeta, ...localMeta };

  const localOP = localMeta.partnerOpeningBalances || {};
  const cloudOP = cloudMeta.partnerOpeningBalances || {};
  const localOPTS = localMeta.partnerOpeningBalanceTs || {};
  const cloudOPTS = cloudMeta.partnerOpeningBalanceTs || {};
  const mergedOP = {};
  const mergedOPTS = {};
  const opKeys = new Set([...Object.keys(localOP), ...Object.keys(cloudOP)]);
  opKeys.forEach(key => {
    const lTs = Number(localOPTS[key]) || 0;
    const cTs = Number(cloudOPTS[key]) || 0;
    if (cTs > lTs) {
      if (cloudOP[key] !== undefined) mergedOP[key] = cloudOP[key];
      mergedOPTS[key] = cTs;
    } else if (lTs > cTs) {
      if (localOP[key] !== undefined) mergedOP[key] = localOP[key];
      mergedOPTS[key] = lTs;
    } else {
      mergedOP[key] = localOP[key] !== undefined ? localOP[key] : cloudOP[key];
      mergedOPTS[key] = lTs || cTs;
    }
  });
  merged.partnerOpeningBalances = mergedOP;
  merged.partnerOpeningBalanceTs = mergedOPTS;

  merged.initialBalances = {
    ...(cloudMeta.initialBalances || {}),
    ...(localTs > cloudTs ? (localMeta.initialBalances || {}) : {})
  };
  if (cloudTs >= localTs && localMeta.initialBalances) {
    merged.initialBalances = {
      ...localMeta.initialBalances,
      ...(cloudMeta.initialBalances || {})
    };
  }

  return merged;
}

// Core merge. Builds the merged state with Maps keyed by entity id; items are
// carried by reference wherever safe and cloned only when they cross the
// state/lastSyncState boundary (options.cloneWinners). Dedupe-by-id and the
// deletedIds filter are integrated (the maps are unique by construction), so
// no follow-up full-state dedupe clone is needed.
// options:
//   cloneWinners  - clone cloud items that win the merge (required when the
//                   result becomes the live `state` while the cloud input
//                   becomes/feeds lastSyncState).
//   cloneMetadata - deep-clone the merged metadata (required for the live
//                   state so nested objects like actionLogs/initialBalances
//                   never alias the cloud snapshot).
//   collectStats  - track whether/which items changed vs localState.
function cloudSyncMergeStatesCore(localState, cloudState, options = {}) {
  const stats = options.collectStats ? cloudSyncNewMergeStats() : null;
  const mergeOptions = { cloneWinners: !!options.cloneWinners, stats };

  const localTs = Number(localState._lastModified) || 0;
  const cloudTs = Number(cloudState._lastModified || cloudState._cloudWatermark) || 0;
  const localDeletedByState = cloudSyncGetDeletedIdsByState(localState);
  const cloudDeletedByState = cloudSyncGetDeletedIdsByState(cloudState);
  const deletedByState = {};
  const deletedCloudKeys = [];

  CLOUD_SYNC_DELETE_DEFS.forEach(def => {
    const deleted = new Set();
    const cloudActive = new Map((cloudState[def.stateKey] || []).filter(item => item && item.id).map(item => [item.id, item]));
    const localActive = new Map((localState[def.stateKey] || []).filter(item => item && item.id).map(item => [item.id, item]));
    localDeletedByState[def.stateKey].forEach(id => {
      const cloudItem = cloudActive.get(id);
      if (cloudItem && (Number(cloudItem._updatedAt) || 0) > localTs) return;
      deleted.add(id);
    });
    cloudDeletedByState[def.stateKey].forEach(id => {
      const localItem = localActive.get(id);
      if (localItem && (Number(localItem._updatedAt) || 0) > cloudTs) return;
      deleted.add(id);
    });
    deletedByState[def.stateKey] = deleted;
    deleted.forEach(id => deletedCloudKeys.push(`${def.rowPrefix}${id}`));
  });

  const deletedIds = Array.from(new Set(CLOUD_SYNC_DELETE_DEFS.flatMap(def => Array.from(deletedByState[def.stateKey]))));
  if (deletedIds.length > 0) {
    cloudSyncLog(`mergeStates: localTs=${localTs}, cloudTs=${cloudTs}, deletedIds size=${deletedIds.length}, sample=${JSON.stringify(deletedIds.slice(0, 5))}`);
  }

  const entityArrays = {};
  CLOUD_SYNC_MERGE_ENTITY_KEYS.forEach(key => {
    entityArrays[key] = cloudSyncMergeEntityArrays(key, localState[key], cloudState[key], deletedByState[key] || new Set(), mergeOptions);
  });

  const mergedMeta = cloudSyncMergeMetadata(localState, cloudState);
  // Overridden by the entity merge below; drop before compare/clone.
  delete mergedMeta.cashEntries;
  delete mergedMeta.escrowItems;
  if (stats && !stats.changed) {
    stats.changed = cloudSyncMetaComparable(mergedMeta) !== cloudSyncMetaComparable(cloudSyncSplitMetadata(localState));
  }

  const merged = {
    ...(options.cloneMetadata ? cloudSyncClone(mergedMeta) : mergedMeta),
    ...entityArrays,
    deletedIds,
    deletedCloudKeys: Array.from(new Set(deletedCloudKeys)),
    _lastModified: Math.max(localTs, cloudTs),
    _cloudWatermark: Math.max(Number(localState._cloudWatermark) || 0, Number(cloudState._cloudWatermark) || cloudTs)
  };

  return { state: merged, stats };
}

function mergeStates(localState, cloudState) {
  if (!localState) return cloudSyncClone(cloudState);
  if (!cloudState) return cloudSyncClone(localState);
  return cloudSyncMergeStatesCore(localState, cloudState, { cloneWinners: true, cloneMetadata: true }).state;
}

// Builds the next cloud snapshot (future lastSyncState) from the previous one
// plus the freshly fetched partial rows. No cloning: the previous snapshot is
// replaced wholesale and never aliases the live state, and partial rows are
// exclusively owned by this pull.
function cloudSyncMergeCloudSnapshot(baseCloudState, partialCloudState) {
  if (!baseCloudState) return partialCloudState ? partialCloudState : cloudSyncDefaultState();
  if (!partialCloudState) return baseCloudState;
  return cloudSyncMergeStatesCore(baseCloudState, partialCloudState, { cloneWinners: false, cloneMetadata: false }).state;
}

async function persistStateCacheAfterCloudPull(cacheState = state) {
  try {
    const json = JSON.stringify(cacheState);
    if (window.electronAPI && typeof window.electronAPI.writeStateFile === "function") {
      const result = await window.electronAPI.writeStateFile(json);
      if (result && result.ok && typeof initializeLastSavedState === "function") {
        initializeLastSavedState(cacheState);
      } else if (result && !result.ok) {
        console.error("[CloudSync] Cannot write state file:", result.error);
      }
    } else {
      localStorage.setItem("rd_accounting_online_cache", json);
      if (typeof initializeLastSavedState === "function") initializeLastSavedState(cacheState);
    }
  } catch (err) {
    console.error("[CloudSync] Cannot persist local cache:", err);
  }
}

// Persist only what the cloud pull actually changed, via the efficient SQLite delta path.
// Diffs against lastSavedState (the SQLite snapshot from js/state.js) so unsaved local edits
// pending in the debounced save queue are not accidentally marked as persisted.
// Returns true when handled (delta written or nothing changed); false => caller must full-persist.
// changedIdsByEntity (optional): Sets of ids the pull actually touched, per state
// key. When provided, the expensive per-item JSON compare is limited to those
// ids; items with pending unsaved local edits stay dirty and are persisted by
// the debounced executeSaveState path as before.
async function cloudSyncPersistPullDeltaToCache(mergedState, changedIdsByEntity = null) {
  if (!window.electronAPI || typeof window.electronAPI.writeStateDelta !== "function") return false;
  if (typeof lastSavedState === "undefined" || !lastSavedState) return false;

  try {
    const delta = {
      metadata: {},
      vouchers: { upsert: [], deleteIds: [] },
      products: { upsert: [], deleteIds: [] },
      partners: { upsert: [], deleteIds: [] }
    };
    let hasChanges = false;

    CLOUD_SYNC_ENTITY_DEFS.forEach(def => {
      const snapshotMap = lastSavedState[def.stateKey];
      if (!(snapshotMap instanceof Map)) throw new Error(`lastSavedState.${def.stateKey} is not a Map`);
      const changedIds = changedIdsByEntity ? changedIdsByEntity[def.stateKey] : null;
      const currentIds = new Set();
      (mergedState[def.stateKey] || []).forEach(item => {
        if (!item || !item.id) return;
        currentIds.add(item.id);
        if (changedIds && !changedIds.has(item.id)) return;
        const prev = snapshotMap.get(item.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
          delta[def.stateKey].upsert.push(item);
          hasChanges = true;
        }
      });
      for (const id of snapshotMap.keys()) {
        if (!currentIds.has(id)) {
          delta[def.stateKey].deleteIds.push(id);
          hasChanges = true;
        }
      }
    });

    // Same metadata key list as executeSaveState (js/state.js), plus _lastModified
    // which the full save path also persists.
    const metadataKeys = [
      'companyName', 'address', 'taxCode', 'accountingStandard',
      'initialBalances', 'partnerOpeningBalances', 'partnerOpeningBalanceTs', 'deletedIds', 'deletedCloudKeys',
      '_lastModified', '_lastPulledCloudTs',
      'cashEntries', 'escrowItems', 'salesTemplatesData', 'users', 'actionLogs'
    ];
    metadataKeys.forEach(key => {
      const currentValStr = JSON.stringify(mergedState[key] !== undefined ? mergedState[key] : null);
      const prevValStr = JSON.stringify(lastSavedState[key] !== undefined ? lastSavedState[key] : null);
      if (currentValStr !== prevValStr) {
        delta.metadata[key] = currentValStr;
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      cloudSyncLog("Pull delta persist: khong co thay doi cuc bo, bo qua ghi SQLite.");
      return true;
    }

    const result = await window.electronAPI.writeStateDelta(delta);
    if (!result || !result.ok) {
      console.error("[CloudSync] Pull delta write failed:", result && result.error);
      return false;
    }

    // Apply the delta to the SQLite snapshot, mirroring executeSaveState's bookkeeping.
    Object.keys(delta.metadata).forEach(key => {
      lastSavedState[key] = JSON.parse(delta.metadata[key]);
    });
    CLOUD_SYNC_ENTITY_DEFS.forEach(def => {
      delta[def.stateKey].upsert.forEach(item => {
        lastSavedState[def.stateKey].set(item.id, JSON.parse(JSON.stringify(item)));
      });
      delta[def.stateKey].deleteIds.forEach(id => {
        lastSavedState[def.stateKey].delete(id);
      });
    });

    cloudSyncLog(`Pull delta persist: vouchers +${delta.vouchers.upsert.length}/-${delta.vouchers.deleteIds.length}, products +${delta.products.upsert.length}/-${delta.products.deleteIds.length}, partners +${delta.partners.upsert.length}/-${delta.partners.deleteIds.length}, metadata ${Object.keys(delta.metadata).length} keys.`);
    return true;
  } catch (err) {
    console.error("[CloudSync] Pull delta persist error, falling back to full persist:", err);
    return false;
  }
}

function cloudSyncRefreshUiAfterPull() {
  const run = () => {
    if (typeof recalculateAccounting === "function") recalculateAccounting(false);
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof filterCash === "function") filterCash();
    if (typeof initExcelIntegration === "function") initExcelIntegration();
    if (typeof refreshOpenPartnerLedgerModal === "function") refreshOpenPartnerLedgerModal();
    if (typeof refreshUI === "function") refreshUI();
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 0);
  }
}

function cloudSyncNeedsPushAfterPull(mergedState, cloudSnapshot) {
  const mergedComparable = cloudSyncClone(mergedState);
  const cloudComparable = cloudSyncClone(cloudSnapshot || {});
  delete mergedComparable._lastPulledCloudTs;
  delete cloudComparable._lastPulledCloudTs;
  return !cloudSyncEqual(mergedComparable, cloudComparable);
}

// Mutates mergedState in place (its entity arrays are freshly built by the
// merge, so no defensive clone is needed) and returns how many items were
// pruned so the caller can factor it into the "anything changed" decision.
function cloudSyncPruneStaleLocalOnlyItems(mergedState, localBeforePull, cloudSnapshot, checkpointTs) {
  // Disabled time-based pruning: local-only vouchers that have not reached cloud yet
  // were being dropped during concurrent pulls on other machines. Unpushed items are
  // handled by cloudSyncRescueLocalOnlyItems instead.
  void mergedState;
  void localBeforePull;
  void cloudSnapshot;
  void checkpointTs;
  return 0;
}

function deferCloudPull(reason) {
  deferredCloudPull = true;
  deferredCloudPullReason = reason || "editing";
  updateCloudSyncBadge(false, "Mây: Chờ lưu phiếu để đồng bộ", "#f59e0b");
}

function queuePendingPull(options = {}) {
  const previous = pendingPullOptions || {};
  pullPending = true;
  pendingPullOptions = {
    ...previous,
    ...options,
    reason: options.reason || previous.reason || "pending",
    force: !!(previous.force || options.force),
    forceFull: !!(previous.forceFull || options.forceFull),
    retryFullIfNoChanges: !!(previous.retryFullIfNoChanges || options.retryFullIfNoChanges)
  };
}

function takePendingPullOptions() {
  if (!pullPending) return null;
  const options = pendingPullOptions || { reason: "pending" };
  pullPending = false;
  pendingPullOptions = null;
  return options;
}

function scheduleCloudPull(reason, options = {}) {
  if (!options.force && isVoucherEntryModalOpen()) {
    deferCloudPull(reason);
    return;
  }

  if (options.force || options.startup || options.forceFull) {
    if (scheduledPullTimer) {
      clearTimeout(scheduledPullTimer);
      scheduledPullTimer = null;
    }
    cloudSyncRunPullInBackground({ reason, ...options });
    return;
  }

  if (scheduledPullTimer) clearTimeout(scheduledPullTimer);
  scheduledPullTimer = setTimeout(() => {
    scheduledPullTimer = null;
    cloudSyncRunPullInBackground({ reason, ...options });
  }, CLOUD_SYNC_PULL_DEBOUNCE_MS);
}

function cloudSyncRunPullInBackground(options = {}) {
  void pullAndMergeFromCloud(options).catch(err => {
    console.warn(`[CloudSync] Background pull failed (${options.reason || "unknown"}):`, err);
  });
}

async function flushDeferredCloudSync() {
  if (!deferredCloudPull || isVoucherEntryModalOpen()) return;
  deferredCloudPull = false;
  const reason = deferredCloudPullReason;
  deferredCloudPullReason = "";
  await pullAndMergeFromCloud({ reason: reason || "deferred", retryFullIfNoChanges: true, force: true });
}

function finishStartupPull() {
  isStartupPullCompleted = true;
  isPulling = false;
  hideStartupOverlay();

  const queuedPull = takePendingPullOptions();
  if (queuedPull) {
    setTimeout(() => cloudSyncRunPullInBackground({ reason: "pending-after-startup", ...queuedPull }), 250);
  }

  if (pushPending && !queuedPull) {
    pushPending = false;
    setTimeout(() => pushToCloud(), 300);
  }

}

async function pullAndMergeFromCloud(options = {}) {
  if (!cloudSyncActive || !supabaseClient) return false;

  if (!isStartupPullCompleted && !options.startup) {
    queuePendingPull(options);
    return false;
  }

  if (isPushing && !options.allowDuringPush) {
    queuePendingPull(options);
    return false;
  }

  if (!options.force && isVoucherEntryModalOpen()) {
    deferCloudPull(options.reason || "editing");
    return false;
  }

  if (isPulling) {
    queuePendingPull(options);
    return false;
  }

  isPulling = true;
  const syncTask = cloudSyncStartTask("pull", options.startup ? "Kiểm tra dữ liệu khi khởi động" : "Tải thay đổi từ cloud");
  let syncTaskOk = false;
  if (window.cloudWriteGate) window.cloudWriteGate.setStatus("syncing", "Đang tải và kiểm tra thay đổi từ cloud.");
  pullPending = false;
  pendingPullOptions = null;
  cloudSyncLog(`pullAndMergeFromCloud bat dau, ly do: ${options.reason || "unknown"}, forceFull: ${!!options.forceFull}`);

  try {
    const metadata = await cloudSyncEnsureMetadataRow();
    cloudSyncNoteLegacyLock(metadata, options.reason || "pull");

    const checkpoint = options.forceFull ? 0 : getPullCheckpointTs();
    lastSyncState = window.lastSyncState || lastSyncState;
    const hasCompleteBaseline = !!lastSyncState;
    let rows;
    let watermark;
    let cloudSnapshot;
    let cloudWatermark = null;
    let useFullPull = options.forceFull || cloudSyncShouldUseFullPull(checkpoint, hasCompleteBaseline);

    if (!useFullPull) {
      cloudWatermark = await cloudSyncGetCloudWatermark(metadata);
      if (cloudSyncShouldUseFullPull(checkpoint, true, cloudWatermark)) {
        cloudSyncLog(`Cloud watermark rollback detected (${cloudWatermark} < ${checkpoint}); forcing full reconcile.`);
        useFullPull = true;
      } else if (cloudWatermark <= checkpoint && !options.retryFullIfNoChanges) {
        cloudSyncLog("Cloud watermark <= checkpoint, khong co thay doi, thoat.");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        cloudSyncSetWriteReady("Cloud da san sang.");
        syncTaskOk = true;
        return true;
      }
    }

    if (useFullPull) {
      cloudSyncLog(`Full reconcile pull (${options.reason || "unknown"}).`);
      rows = await cloudSyncFetchAllRows();
      watermark = cloudSyncWatermarkFromRows(rows, metadata);
      cloudSnapshot = cloudSyncStateFromRows(rows, { watermark }).state;
    } else {
      cloudSyncLog(`Kiem tra incremental: cloudWatermark=${cloudWatermark}, checkpoint=${checkpoint}`);
      rows = await cloudSyncFetchRowsSince(checkpoint);
      cloudSyncLog(`Da tai ${rows.length} dong thay doi tu cloud since ${checkpoint}`);
      if (rows.length === 0 && options.retryFullIfNoChanges) {
        cloudSyncLog("Khong co dong thay doi incremental, thuc hien full pull de bao dam...");
        rows = await cloudSyncFetchAllRows();
        watermark = cloudSyncWatermarkFromRows(rows, metadata);
        cloudSnapshot = cloudSyncStateFromRows(rows, { watermark }).state;
      } else {
        if (!rows.some(row => row.id === CLOUD_SYNC_METADATA_ID)) {
          rows.push(metadata);
        }
        watermark = Math.max(cloudWatermark, cloudSyncWatermarkFromRows(rows, metadata));
        const partialCloud = cloudSyncStateFromRows(rows, { watermark }).state;
        cloudSnapshot = cloudSyncMergeCloudSnapshot(lastSyncState || cloudSyncDefaultState(), partialCloud);
        cloudSnapshot._cloudWatermark = watermark;
        cloudSnapshot._lastModified = Math.max(Number(cloudSnapshot._lastModified) || 0, watermark);
      }
    }

    // Let the renderer paint after the network fetch / snapshot build, before
    // the synchronous merge phase.
    await cloudSyncYieldToUi();

    // From here until `state` is updated there must be NO awaits: the merge
    // reads the live state and user edits mid-merge would otherwise be lost.
    const vouchersBefore = Array.isArray(state.vouchers) ? state.vouchers.length : 0;
    const mergeResult = cloudSyncMergeStatesCore(state, cloudSnapshot, {
      cloneWinners: true,
      cloneMetadata: true,
      collectStats: true
    });
    const merged = mergeResult.state;
    const stats = mergeResult.stats;
    const prunedCount = cloudSyncPruneStaleLocalOnlyItems(merged, state, cloudSnapshot, checkpoint);
    const hasChanges = stats.changed || prunedCount > 0;

    if (hasChanges) {
      state = merged;
    } else {
      // Nothing user-visible changed: keep the current state object and only
      // refresh the sync bookkeeping fields.
      state._lastModified = merged._lastModified;
      state._cloudWatermark = merged._cloudWatermark;
      state.deletedIds = merged.deletedIds;
      state.deletedCloudKeys = merged.deletedCloudKeys;
      if (merged.lastModifiedBy !== undefined) state.lastModifiedBy = merged.lastModifiedBy;
    }

    updateLastSyncState(cloudSnapshot);
    persistLastPulledCloudTs(watermark);
    cloudSyncPersistDatasetIdentity();
    cloudSyncLog(`Ket qua merge: vouchers truoc=${vouchersBefore}, sau=${state.vouchers.length}, thay doi=${hasChanges ? "co" : "khong"}, pruned=${prunedCount}`);

    if (hasChanges) {
      const deltaPersisted = await cloudSyncPersistPullDeltaToCache(state, stats.changedIdsByEntity);
      if (!deltaPersisted) {
        // Fallback: no SQLite snapshot available or delta write failed -> full rewrite.
        await persistStateCacheAfterCloudPull(state);
      }
      // One more paint opportunity before the heavy recalc/refresh.
      await cloudSyncYieldToUi();
      cloudSyncRefreshUiAfterPull();
    } else {
      cloudSyncLog("Pull khong lam thay doi du lieu; bo qua recalc/refreshUI/persist.");
    }

    updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    cloudSyncSetWriteReady("Cloud đã sẵn sàng.");
    syncTaskOk = true;
    return true;
  } catch (err) {
    if (typeof addErrorLog === "function") addErrorLog("CloudSync.pull", err.message, err);
    updateCloudSyncBadge(false, "Mây: Lỗi kết nối", "#ef4444");
    if (window.cloudWriteGate) window.cloudWriteGate.setStatus("error", "Cloud tạm thời gián đoạn; dữ liệu vẫn lưu trên máy và sẽ tự đồng bộ lại.");
    throw err;
  } finally {
    cloudSyncFinishTask(syncTask, syncTaskOk);
    isPulling = false;
    lastPullCompletedAt = Date.now();
    const queuedPull = takePendingPullOptions();
    if (queuedPull) {
      setTimeout(() => cloudSyncRunPullInBackground(queuedPull), 250);
    } else if (pushPending) {
      pushPending = false;
      setTimeout(() => pushToCloud(), 300);
    }
  }
}

async function pullFromCloudOnStartup() {
  if (!cloudSyncActive || !supabaseClient) return false;

  // Restore the server-confirmed SQLite cache as the baseline. The dataset identity
  // prevents a checkpoint/snapshot from one Supabase project being reused for another.
  const startupCheckpoint = getPullCheckpointTs();
  lastSyncState = window.lastSyncState || lastSyncState;
  if (!lastSyncState) cloudSyncRestoreBaselineFromConfirmedCache();
  lastSyncState = window.lastSyncState || lastSyncState;
  const needFullPull = cloudSyncShouldUseFullPull(startupCheckpoint, !!lastSyncState);
  updateStartupStatus(needFullPull ? "Dang full-reconcile du lieu cloud..." : "Dang dong bo thay doi tu cloud...");
  cloudSyncLog(`Startup pull mode: ${needFullPull ? "full" : `incremental (checkpoint=${startupCheckpoint})`}.`);

  try {
    await pullAndMergeFromCloud({ startup: true, forceFull: needFullPull, force: true, reason: "startup" });
    if (needFullPull) {
      await cloudSyncRescueLocalOnlyItems({ completeCloudSnapshot: true });
    }
    finishStartupPull();
    updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    cloudSyncLog("Startup reconcile completed.");
    if (cloudSyncHasPendingLocalWrite()) {
      cloudSyncLog("Pending local cloud write detected; queued background recovery push.");
      setTimeout(() => pushToCloud({ pendingToken: cloudSyncGetPendingLocalWriteToken() }), 300);
    }
    return true;
  } catch (err) {
    console.error("[CloudSync] Startup reconcile failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSync.startup", err.message, err);
    updateCloudSyncBadge(false, "Mây: Lỗi tải khi khởi động", "#ef4444");
    finishStartupPull();
    return false;
  }
}

function cloudSyncMetadataDiffers(localMeta, cloudMeta) {
  const localComparable = cloudSyncClone(localMeta || {});
  const cloudComparable = cloudSyncClone(cloudMeta || {});
  delete localComparable.lastModifiedBy;
  delete cloudComparable.lastModifiedBy;
  delete localComparable._lastPulledCloudTs;
  delete cloudComparable._lastPulledCloudTs;
  return !cloudSyncEqual(localComparable, cloudComparable);
}

function computeDelta() {
  lastSyncState = window.lastSyncState || lastSyncState;
  const rowsToUpsert = [];
  const now = Date.now();
  const pushTs = Number(state._lastModified) || now;

  function makeRow(id, data) {
    return {
      id,
      data,
      last_modified: pushTs,
      is_syncing: false,
      updated_at: new Date().toISOString()
    };
  }

  CLOUD_SYNC_ENTITY_DEFS.forEach(def => {
    const currentItems = Array.isArray(state[def.stateKey]) ? state[def.stateKey] : [];
    const previousItems = Array.isArray(lastSyncState && lastSyncState[def.stateKey]) ? lastSyncState[def.stateKey] : [];
    const previousMap = new Map(previousItems.filter(item => item && item.id).map(item => [item.id, item]));
    const currentMap = new Map(currentItems.filter(item => item && item.id).map(item => [item.id, item]));

    currentItems.forEach(item => {
      if (!item || !item.id) return;
      const previous = previousMap.get(item.id);
      if (cloudSyncEntityNeedsPush(previous, item)) {
        item._updatedAt = Math.max(Number(item._updatedAt) || 0, (Number(previous && previous._updatedAt) || 0) + 1, now);
        rowsToUpsert.push(makeRow(`${def.rowPrefix}${item.id}`, item));
      }
    });

    previousItems.forEach(item => {
      if (item && item.id && !currentMap.has(item.id)) {
        rowsToUpsert.push(cloudSyncMakeTombstoneRow(`${def.rowPrefix}${item.id}`, pushTs));
      }
    });
  });

  const cloudKnownTombstones = new Set(
    (lastSyncState && Array.isArray(lastSyncState.deletedCloudKeys) ? lastSyncState.deletedCloudKeys : [])
      .map(cloudSyncNormalizeDeletedCloudKey)
      .filter(Boolean)
  );
  if (Array.isArray(state.deletedCloudKeys)) {
    state.deletedCloudKeys.forEach(key => {
      const normalizedKey = cloudSyncNormalizeDeletedCloudKey(key);
      if (normalizedKey && !cloudKnownTombstones.has(normalizedKey)) {
        rowsToUpsert.push(cloudSyncMakeTombstoneRow(normalizedKey, pushTs));
      }
    });
  } else if (Array.isArray(state.deletedIds)) {
    state.deletedIds.forEach(id => {
      const key = `v_${id}`;
      if (id && !cloudKnownTombstones.has(key)) rowsToUpsert.push(cloudSyncMakeTombstoneRow(key, pushTs));
    });
  }

  const localMeta = cloudSyncBuildMetadataForPush(pushTs);
  const cloudMeta = cloudSyncSplitMetadata(lastSyncState || {});
  if (!lastSyncState || cloudSyncMetadataDiffers(localMeta, cloudMeta)) {
    rowsToUpsert.push(makeRow(CLOUD_SYNC_METADATA_ID, localMeta));
  }

  return {
    rowsToUpsert: Array.from(new Map(rowsToUpsert.map(row => [row.id, row])).values()),
    idsToDelete: []
  };
}

async function cloudSyncPrePullBeforePush() {
  if (Date.now() - lastPullCompletedAt < CLOUD_SYNC_PRE_PUSH_PULL_COOLDOWN_MS) {
    return;
  }

  const metadata = await cloudSyncEnsureMetadataRow();
  cloudSyncNoteLegacyLock(metadata, "pre-push");

  const cloudWatermark = await cloudSyncGetCloudWatermark(metadata);
  const checkpoint = getPullCheckpointTs();
  if (cloudSyncShouldUseFullPull(checkpoint, !!lastSyncState, cloudWatermark)) {
    cloudSyncLog(`Pre-push full reconcile because baseline/checkpoint is unsafe (cloud=${cloudWatermark}, checkpoint=${checkpoint}).`);
    await pullAndMergeFromCloud({ reason: "pre-push-reconcile", force: true, forceFull: true, allowDuringPush: true });
  } else if (cloudWatermark > checkpoint) {
    cloudSyncLog(`Pre-push pull because cloud ${cloudWatermark} > checkpoint ${checkpoint}.`);
    await pullAndMergeFromCloud({ reason: "pre-push", force: true, allowDuringPush: true });
  }
}

function cloudSyncGetRescueCandidateKeys() {
  lastSyncState = window.lastSyncState || lastSyncState;
  const keys = [];

  CLOUD_SYNC_ENTITY_DEFS.forEach(def => {
    const currentItems = Array.isArray(state[def.stateKey]) ? state[def.stateKey] : [];
    const previousItems = Array.isArray(lastSyncState && lastSyncState[def.stateKey]) ? lastSyncState[def.stateKey] : [];
    const previousMap = new Map(previousItems.filter(item => item && item.id).map(item => [item.id, item]));

    currentItems.forEach(item => {
      if (!item || !item.id) return;
      const previous = previousMap.get(item.id);
      if (cloudSyncEntityNeedsPush(previous, item)) {
        keys.push(`${def.rowPrefix}${item.id}`);
      }
    });
  });

  return keys;
}

function cloudSyncGetCloudKeysFromCompleteSnapshot(snapshot) {
  const keys = new Set();
  const source = snapshot || {};
  CLOUD_SYNC_ENTITY_DEFS.forEach(def => {
    (Array.isArray(source[def.stateKey]) ? source[def.stateKey] : []).forEach(item => {
      if (item && item.id) keys.add(`${def.rowPrefix}${item.id}`);
    });
  });
  (Array.isArray(source.deletedCloudKeys) ? source.deletedCloudKeys : []).forEach(key => {
    const normalizedKey = cloudSyncNormalizeDeletedCloudKey(key);
    if (normalizedKey) keys.add(normalizedKey);
  });
  return keys;
}

async function cloudSyncRescueLocalOnlyItems(options = {}) {
  if (!cloudSyncActive || !supabaseClient) return false;

  const triggerSave = options.triggerSave !== false;
  const candidateKeysOnly = options.candidateKeysOnly === true;
  const completeCloudSnapshot = options.completeCloudSnapshot === true;

  const rescueMode = candidateKeysOnly ? "push-candidates" : (completeCloudSnapshot ? "full-baseline" : "full");
  cloudSyncLog(`Rescue scan (${rescueMode}${triggerSave ? "" : ", no-save"})...`);
  try {
    const localKeys = candidateKeysOnly
      ? cloudSyncGetRescueCandidateKeys()
      : [
        ...(state.vouchers || []).filter(v => v && v.id).map(v => `v_${v.id}`),
        ...(state.products || []).filter(p => p && p.id).map(p => `p_${p.id}`),
        ...(state.partners || []).filter(pt => pt && pt.id).map(pt => `part_${pt.id}`)
      ];
    if (localKeys.length === 0) return false;

    // Startup has just fetched a complete cloud snapshot. Reuse it instead of
    // issuing hundreds of duplicate ID lookup batches over the same dataset.
    const cloudIds = completeCloudSnapshot
      ? cloudSyncGetCloudKeysFromCompleteSnapshot(window.lastSyncState || lastSyncState)
      : await fetchExistingCloudIdsByKeysFromClient(supabaseClient, localKeys);
    const queriedLocalKeys = new Set(localKeys);
    let changed = false;
    const now = Date.now();
    const rescueItemLogLimit = 5;
    const rescueSampleLimit = 3;
    let rescuedCount = 0;
    let rescueItemLogCount = 0;
    const rescueStats = [];

    function rescueEntity(stateKey, rowPrefix) {
      const entityLabel = stateKey.slice(0, -1);
      const stats = { entityLabel, count: 0, samples: [] };
      rescueStats.push(stats);

      (state[stateKey] || []).forEach(item => {
        if (!item || !item.id) return;
        const cloudKey = `${rowPrefix}${item.id}`;
        // In candidate mode the cloud lookup contains only changed keys. Never
        // interpret an unqueried local row as missing from cloud.
        if (!queriedLocalKeys.has(cloudKey)) return;
        if (cloudIds.has(cloudKey)) return;

        item._updatedAt = Math.max(Number(item._updatedAt) || 0, now);
        rescuedCount += 1;
        stats.count += 1;
        if (stats.samples.length < rescueSampleLimit) stats.samples.push(String(item.id));
        if (rescueItemLogCount < rescueItemLogLimit) {
          cloudSyncLog(`Rescue: local-only ${entityLabel} ${item.id} marked for cloud push.`);
          rescueItemLogCount += 1;
        }
        changed = true;

        lastSyncState = window.lastSyncState || lastSyncState;
        if (lastSyncState && Array.isArray(lastSyncState[stateKey])) {
          lastSyncState[stateKey] = lastSyncState[stateKey].filter(x => !x || x.id !== item.id);
          window.lastSyncState = lastSyncState;
        }
      });
    }

    rescueEntity("vouchers", "v_");
    rescueEntity("products", "p_");
    rescueEntity("partners", "part_");

    if (changed) {
      state._lastModified = now;
      const summary = rescueStats
        .filter(stats => stats.count > 0)
        .map(stats => {
          const omitted = stats.count > stats.samples.length ? ", ..." : "";
          return `${stats.entityLabel}=${stats.count} [${stats.samples.join(", ")}${omitted}]`;
        })
        .join("; ");
      cloudSyncLog(`Rescue summary: marked ${rescuedCount}/${queriedLocalKeys.size} queried local item(s) for cloud push; ${summary}.`);
      if (rescuedCount > rescueItemLogCount) {
        cloudSyncLog(`Rescue: suppressed ${rescuedCount - rescueItemLogCount} additional per-item log(s).`);
      }
      if (triggerSave) {
        const saveFn = typeof saveStateSync === "function"
          ? saveStateSync
          : (typeof window.saveStateSync === "function" ? window.saveStateSync : null);
        if (saveFn) {
          await saveFn();
        }
      }
    } else {
      cloudSyncLog("Rescue scan: no stuck local-only items.");
    }

    return changed;
  } catch (err) {
    console.error("[CloudSync] Rescue failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSync.rescue", err.message, err);
    return false;
  }
}

async function cloudSyncUpsertRows(rows) {
  for (let i = 0; i < rows.length; i += CLOUD_SYNC_BATCH_SIZE) {
    const batch = rows.slice(i, i + CLOUD_SYNC_BATCH_SIZE);
    const { error } = await cloudSyncReadWithRetry(
      () => supabaseClient.from(CLOUD_SYNC_TABLE).upsert(batch),
      "cloud upsert",
      { timeoutMs: 20000 }
    );
    if (error) throw error;
  }
}

async function cloudSyncDeleteRows(ids) {
  for (let i = 0; i < ids.length; i += CLOUD_SYNC_DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + CLOUD_SYNC_DELETE_BATCH_SIZE);
    const { error } = await cloudSyncReadWithRetry(
      () => supabaseClient.from(CLOUD_SYNC_TABLE).delete().in("id", batch),
      "cloud delete",
      { timeoutMs: 20000 }
    );
    if (error) throw error;
  }
}

async function cloudSyncPushNow() {
  if (!cloudSyncActive || !supabaseClient) return false;
  if (!isStartupPullCompleted) {
    pushPending = true;
    cloudSyncLog("Deferred push while startup pull is running.");
    return false;
  }
  if (isPulling) {
    pushPending = true;
    cloudSyncLog("Deferred push while a cloud pull is running.");
    return false;
  }
  if (isPushing) {
    pushPending = true;
    return false;
  }

  isPushing = true;
  const syncTask = cloudSyncStartTask("push", "Day thay doi len cloud");
  let syncTaskOk = false;
  if (window.cloudWriteGate) window.cloudWriteGate.setStatus("syncing", "Đang ghi thay đổi lên cloud.");
  pushPending = false;
  updateCloudSyncBadge(false, "Mây: Đang đẩy dữ liệu...", "#f59e0b");

  try {
    await cloudSyncPrePullBeforePush();
    await cloudSyncRescueLocalOnlyItems({ triggerSave: false, candidateKeysOnly: true });

    const metadataBefore = await cloudSyncEnsureMetadataRow();
    const cloudWatermarkBefore = await cloudSyncGetCloudWatermark(metadataBefore);
    const pushTs = Math.max(Date.now(), Number(state._lastModified) || 0, cloudWatermarkBefore + 1);
    state._lastModified = pushTs;

    const finalMetadata = cloudSyncBuildMetadataForPush(pushTs);
    const { rowsToUpsert, idsToDelete } = computeDelta();
    const entityRows = rowsToUpsert.filter(row => row.id !== CLOUD_SYNC_METADATA_ID);
    const tombstoneRows = entityRows.filter(row => row.data && row.data._deleted);
    const finalRow = {
      id: CLOUD_SYNC_METADATA_ID,
      data: finalMetadata,
      last_modified: pushTs,
      is_syncing: false,
      updated_at: new Date().toISOString()
    };
    if (cloudUsesVersionedRpc) {
      const updatedBy = window.currentUser
        ? String(window.currentUser.username || window.currentUser.name || "app-user")
        : "app-user";
      const rpcRows = [...entityRows, finalRow];
      // Do not retry a write transaction blindly: the server may have committed
      // even when its response was lost. A timeout leaves the durable pending
      // marker in place so the next reconciliation can decide safely.
      const { data: rpcResult, error: rpcError } = await withTimeout(
        supabaseClient.rpc("rd_apply_sync_transaction", {
          p_workspace_id: cloudWorkspaceId,
          p_expected_sync_version: cloudSyncVersion,
          p_rows: rpcRows,
          p_updated_by: updatedBy
        }),
        20000
      );
      if (rpcError) throw rpcError;
      if (!rpcResult || rpcResult.ok !== true) {
        cloudSyncVersion = Number(rpcResult && rpcResult.sync_version) || cloudSyncVersion;
        await pullAndMergeFromCloud({ reason: "version-conflict", force: true, forceFull: true, allowDuringPush: true });
        throw new Error("Dữ liệu cloud vừa thay đổi trên máy khác. Đã tải bản mới; vui lòng thực hiện lại thao tác.");
      }
      cloudSyncVersion = Number(rpcResult.sync_version) || cloudSyncVersion;
    } else {
      if (entityRows.length > 0) await cloudSyncUpsertRows(entityRows);
      if (idsToDelete.length > 0) await cloudSyncDeleteRows(idsToDelete);
      await cloudSyncUpsertRows([finalRow]);
    }

    if (tombstoneRows.length > 0) {
      state.deletedIds = [];
      state.deletedCloudKeys = [];
    }
    state._cloudWatermark = pushTs;
    // [Perf] Cap nhat snapshot dong bo bang cach ap dung dung cac dong vua day,
    // thay vi deep-clone toan bo state (gay dung hinh UI voi du lieu lon).
    cloudSyncApplyPushToLastSyncState(entityRows, pushTs, finalMetadata);
    // [Fix] KHÔNG cập nhật checkpoint watermark của pull khi push, để luồng check/pull 
    // tiếp theo tải về và hợp nhất đầy đủ các thay đổi song song trên cloud (ví dụ đơn bị xóa).
    // persistLastPulledCloudTs(pushTs);
    // [Perf] Khong ghi lai toan bo SQLite sau khi push: du lieu cuc bo da duoc
    // executeSaveState (js/state.js) luu qua duong delta truoc khi push. Cac thay doi
    // bookkeeping trong luc push (_lastModified, _updatedAt, deletedIds da xoa) se duoc
    // luu o lan save/pull ke tiep va an toan neu mat (tombstone gui lai idempotent).
    cloudSyncLog(`Push completed: ${entityRows.length} upsert, ${tombstoneRows.length} tombstone, ${idsToDelete.length} physical delete.`);
    syncTaskOk = true;
    updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    cloudSyncSetWriteReady("Cloud đã xác nhận thay đổi.");
    return true;
  } catch (err) {
    console.error("[CloudSync] Push failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSync.push", err.message, err);
    updateCloudSyncBadge(false, "Mây: Lỗi đẩy dữ liệu", "#ef4444");
    if (window.cloudWriteGate) window.cloudWriteGate.setStatus("error", "Ghi cloud tạm thời thất bại; phần mềm vẫn hoạt động và sẽ thử lại.");
    if (!pushRetryTimeout) {
      pushRetryTimeout = setTimeout(() => {
        pushRetryTimeout = null;
        if (cloudSyncActive && supabaseClient) pushToCloud();
      }, 5000);
    }
    return false;
  } finally {
    cloudSyncFinishTask(syncTask, syncTaskOk);
    isPushing = false;
    if (pushPending) {
      pushPending = false;
      setTimeout(() => pushToCloud(), 300);
    }
  }
}

function pushToCloud(options = {}) {
  const pendingToken = options.pendingToken || null;
  const queued = cloudSyncWriteQueue.then(() => cloudSyncPushNow());
  void queued.then(ok => {
    if (ok) cloudSyncClearPendingLocalWrite(pendingToken);
  });
  cloudSyncWriteQueue = queued.catch(() => false);
  return queued;
}

async function checkCloudMetadataForChanges(reason = "poll") {
  if (!cloudSyncActive || !supabaseClient || isPulling || isPushing) return;
  const now = Date.now();
  if (now - lastCloudMetadataPollAt < CLOUD_SYNC_POLL_MIN_GAP_MS) return;
  lastCloudMetadataPollAt = now;

  try {
    // Lightweight summary only: the full metadata `data` blob is fetched later by the pull itself.
    const metadata = await cloudSyncEnsureMetadataRow({ summaryOnly: true });
    cloudSyncNoteLegacyLock(metadata, reason);

    const cloudWatermark = await cloudSyncGetCloudWatermark(metadata);
    const checkpoint = getPullCheckpointTs();

    if (cloudWatermark > checkpoint) {
      scheduleCloudPull(reason);
      return;
    }

    if (checkpoint > cloudWatermark && now - lastCheckpointRecoveryAt > CLOUD_SYNC_RECOVERY_GAP_MS) {
      lastCheckpointRecoveryAt = now;
      cloudSyncLog(`Checkpoint skew recovery (${reason}): local ${checkpoint}, cloud ${cloudWatermark}.`);
      scheduleCloudPull(`${reason}-checkpoint-recovery`, { forceFull: true });
    }
  } catch (err) {
    console.warn("[CloudSync] Metadata check failed:", err);
  }
}

function stopCloudMetadataPolling() {
  if (cloudMetadataPollTimer) {
    clearInterval(cloudMetadataPollTimer);
    cloudMetadataPollTimer = null;
  }
  if (cloudMetadataInitialPollTimer) {
    clearTimeout(cloudMetadataInitialPollTimer);
    cloudMetadataInitialPollTimer = null;
  }
}

function attachCloudFocusCheck() {
  if (cloudFocusCheckAttached) return;
  cloudFocusCheckAttached = true;
  window.addEventListener("focus", () => checkCloudMetadataForChanges("focus"));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkCloudMetadataForChanges("visible");
  });
}

function startCloudMetadataPolling() {
  stopCloudMetadataPolling();
  if (!cloudSyncActive || !supabaseClient) return;
  attachCloudFocusCheck();
  cloudMetadataPollTimer = setInterval(() => checkCloudMetadataForChanges("poll"), CLOUD_SYNC_POLL_INTERVAL_MS);
  cloudMetadataInitialPollTimer = setTimeout(() => {
    cloudMetadataInitialPollTimer = null;
    void checkCloudMetadataForChanges("poll-initial");
  }, 1000);
}

function stopRealtimeReconnect() {
  if (realtimeReconnectTimer) {
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
  }
}

function reconnectRealtimeLater(reason) {
  if (!cloudSyncActive || !supabaseClient || realtimeReconnectTimer) return;
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    if (cloudSyncActive && supabaseClient) {
      listenToCloudChanges();
      checkCloudMetadataForChanges(`realtime-reconnect-${reason || "unknown"}`);
    }
  }, CLOUD_SYNC_RECONNECT_DELAY_MS);
}

function listenToCloudChanges() {
  if (!cloudSyncActive || !supabaseClient) return;
  stopRealtimeReconnect();
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const realtimeFilter = cloudUsesVersionedRpc && cloudWorkspaceId
    ? `workspace_id=eq.${cloudWorkspaceId}`
    : "id=eq.metadata";
  realtimeChannel = supabaseClient
    .channel("rd-accounting-cloud-sync")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CLOUD_SYNC_TABLE,
        filter: realtimeFilter
      },
      payload => {
        const row = payload.new;
        if (!row) return;
        if (row.updated_by && window.currentUser && row.updated_by === window.currentUser.username) return;
        if (row.data && row.data.lastModifiedBy === cloudSyncGetSessionId()) return;
        if (cloudUsesVersionedRpc) cloudSyncVersion = Math.max(cloudSyncVersion, Number(row.sync_version) || 0);
        cloudSyncNoteLegacyLock(row, "realtime");
        scheduleCloudPull("realtime");
      }
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        // Realtime is healthy: polling is redundant. Keep the focus/visibility
        // change-check attached as a safety net.
        attachCloudFocusCheck();
        if (cloudUsesVersionedRpc) {
          // Direct table SELECT stays revoked; authenticated RPC polling is the
          // authoritative change detector for station-key deployments.
          startCloudMetadataPolling();
          cloudSyncLog("Realtime subscribed; versioned RPC polling remains active.");
        } else {
          stopCloudMetadataPolling();
          cloudSyncLog("Realtime subscribed; metadata polling stopped (fallback only).");
        }
        checkCloudMetadataForChanges("realtime-subscribed");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        updateCloudSyncBadge(false, "Mây: Realtime gián đoạn, đang kiểm tra định kỳ", "#f59e0b");
        startCloudMetadataPolling();
        reconnectRealtimeLater(status);
      }
    });
}

function isCloudSyncActionBusy() {
  return !!manualCloudSyncAction || isPulling || isPushing || !isStartupPullCompleted;
}

function refreshCloudSyncControls() {
  const connected = !!(cloudSyncActive && supabaseClient && isStartupPullCompleted);
  const configBusy = typeof window.isCloudConfigSaveInProgress === "function"
    && window.isCloudConfigSaveInProgress();
  const busy = isCloudSyncActionBusy() || configBusy;
  const forcePullBtn = document.getElementById("btn-force-pull");
  const forcePushBtn = document.getElementById("btn-force-push");
  const manualBtn = document.getElementById("btn-manual-cloud-sync");
  const headerBtn = document.getElementById("btn-cloud-sync-now");
  const saveConfigBtn = document.getElementById("btn-save-cloud-config");

  [forcePullBtn, forcePushBtn].forEach(button => {
    if (!button) return;
    button.style.display = connected ? "inline-flex" : "none";
    button.disabled = busy || !connected;
  });
  [manualBtn, headerBtn].forEach(button => {
    if (!button) return;
    button.disabled = busy || !connected;
    button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
  });
  // Configuration must remain recoverable even when startup/authentication failed.
  if (saveConfigBtn && !configBusy) saveConfigBtn.disabled = false;

  if (typeof window.toggleCloudSyncInputs === "function") {
    window.toggleCloudSyncInputs();
  }
}

function setCloudSyncActionBusy(action) {
  manualCloudSyncAction = action || "";
  const activeButtonId = {
    sync: "btn-manual-cloud-sync",
    pull: "btn-force-pull",
    push: "btn-force-push"
  }[manualCloudSyncAction];
  const busyLabels = {
    sync: "Đang đồng bộ...",
    pull: "Đang tải từ Mây...",
    push: "Đang đẩy lên Mây..."
  };

  if (manualCloudSyncAction) {
    const statusLabels = {
      sync: "Mây: Đang đồng bộ...",
      pull: "Mây: Đang tải dữ liệu...",
      push: "Mây: Đang đẩy dữ liệu..."
    };
    updateCloudSyncBadge(false, statusLabels[manualCloudSyncAction], "#f59e0b");
  }

  ["btn-manual-cloud-sync", "btn-force-pull", "btn-force-push"].forEach(id => {
    const button = document.getElementById(id);
    if (!button) return;
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent.trim();
    const isActive = id === activeButtonId;
    button.textContent = isActive ? busyLabels[manualCloudSyncAction] : button.dataset.idleLabel;
    if (isActive) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  });

  const modal = document.getElementById("modal-cloud-sync");
  if (modal) modal.setAttribute("aria-busy", manualCloudSyncAction ? "true" : "false");
  const enabledInput = document.getElementById("setting-cloud-enabled");
  const configBusy = typeof window.isCloudConfigSaveInProgress === "function"
    && window.isCloudConfigSaveInProgress();
  if (enabledInput) enabledInput.disabled = !!manualCloudSyncAction || configBusy;
  refreshCloudSyncControls();
}

function confirmCloudSyncAction(message) {
  try {
    return typeof window.confirm === "function" && window.confirm(message) === true;
  } catch (err) {
    console.error("[CloudSync] Confirmation failed:", err);
    return false;
  }
}

function canStartManualCloudSync() {
  if (typeof window.isCloudConfigSaveInProgress === "function" && window.isCloudConfigSaveInProgress()) {
    showToast("Vui lòng chờ cấu hình kết nối được lưu xong.", "warning");
    return false;
  }
  if (isCloudSyncActionBusy()) {
    showToast("Một thao tác đồng bộ khác đang chạy. Vui lòng chờ hoàn tất.", "warning");
    return false;
  }
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return false;
  }
  if (!isStartupPullCompleted || isPulling || isPushing) {
    showToast("Đám mây đang xử lý một yêu cầu khác. Vui lòng thử lại sau khi hoàn tất.", "warning");
    return false;
  }
  if (isVoucherEntryModalOpen()) {
    showToast("Hãy lưu hoặc đóng phiếu đang nhập trước khi đồng bộ cloud.", "warning");
    return false;
  }
  return true;
}

async function disconnectCloudSync() {
  stopCloudMetadataPolling();
  stopRealtimeReconnect();
  if (scheduledPullTimer) {
    clearTimeout(scheduledPullTimer);
    scheduledPullTimer = null;
  }
  if (pushRetryTimeout) {
    clearTimeout(pushRetryTimeout);
    pushRetryTimeout = null;
  }
  if (realtimeChannel && supabaseClient) {
    try {
      await Promise.resolve(supabaseClient.removeChannel(realtimeChannel));
    } catch (err) {
      console.warn("[CloudSync] Failed to remove realtime channel:", err);
    }
  }
  realtimeChannel = null;
  supabaseClient = null;
  cloudSyncActive = false;
  cloudWorkspaceId = "00000000-0000-4000-8000-000000000001";
  cloudSyncVersion = 0;
  cloudUsesVersionedRpc = false;
  if (window.cloudWriteGate) window.cloudWriteGate.setStatus("read-only", "Cloud đã ngắt kết nối; thay đổi mới sẽ chờ trong hàng đợi nền.");
  cloudSyncResetCloudBaseline();
  isStartupPullCompleted = true;
  pullPending = false;
  pendingPullOptions = null;
  pushPending = false;
  deferredCloudPull = false;
  setCloudSyncActionBusy("");
  updateCloudSyncBadge(false, "Mây: Tắt", "#64748b");
  hideStartupOverlay();
  return true;
}

async function initCloudSync() {
  if (window.cloudWriteGate) window.cloudWriteGate.setStatus("connecting", "Đang kết nối và xác thực cloud.");
  if (!cloudSyncSettings.enabled) {
    await disconnectCloudSync();
    return false;
  }

  if (!cloudSyncSettings.supabaseUrl || !cloudSyncSettings.supabaseAnonKey) {
    cloudSyncActive = false;
    supabaseClient = null;
    isStartupPullCompleted = true;
    refreshCloudSyncControls();
    updateCloudSyncBadge(false, "Mây: Chưa cấu hình", "#ef4444");
    hideStartupOverlay();
    return false;
  }

  if (typeof supabase === "undefined" || !supabase.createClient) {
    cloudSyncActive = false;
    supabaseClient = null;
    isStartupPullCompleted = true;
    refreshCloudSyncControls();
    updateCloudSyncBadge(false, "Mây: Không có mạng", "#ef4444");
    hideStartupOverlay();
    return false;
  }

  return startSupabaseClient();
}

async function startSupabaseClient() {
  try {
    stopCloudMetadataPolling();
    stopRealtimeReconnect();
    if (scheduledPullTimer) {
      clearTimeout(scheduledPullTimer);
      scheduledPullTimer = null;
    }
    if (pushRetryTimeout) {
      clearTimeout(pushRetryTimeout);
      pushRetryTimeout = null;
    }
    pullPending = false;
    pendingPullOptions = null;
    pushPending = false;
    deferredCloudPull = false;
    deferredCloudPullReason = "";
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    cloudSyncActive = false;
    isStartupPullCompleted = false;
    // A snapshot/checkpoint belongs to one specific cloud dataset. Reconnecting
    // (especially after changing the Supabase URL/project) must establish a new
    // complete baseline before computeDelta is allowed to compare local rows.
    cloudSyncResetCloudBaseline();
    refreshCloudSyncControls();
    updateCloudSyncBadge(false, "Mây: Đang kết nối...", "#f59e0b");
    supabaseClient = supabase.createClient(cloudSyncSettings.supabaseUrl, cloudSyncSettings.supabaseAnonKey);
    await cloudSyncAuthenticateAndBootstrap();
    if (cloudSyncGetStoredDatasetIdentity() !== cloudSyncGetDatasetIdentity()) {
      persistLastPulledCloudTs(0);
      cloudSyncResetCloudBaseline();
      cloudSyncLog("Cloud dataset changed or is not yet verified; one full baseline pull is required.");
    } else {
      cloudSyncRestoreBaselineFromConfirmedCache();
    }
    cloudSyncActive = true;

    const startupSucceeded = await pullFromCloudOnStartup();
    if (!startupSucceeded) throw new Error("Không thể tải dữ liệu cloud khi khởi tạo.");
    listenToCloudChanges();
    startCloudMetadataPolling();
    refreshCloudSyncControls();
    cloudSyncSetWriteReady("Cloud đã sẵn sàng.");
    return true;
  } catch (err) {
    console.error("[CloudSync] Init failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSync.init", err.message, err);
    cloudSyncActive = false;
    supabaseClient = null;
    isStartupPullCompleted = true;
    stopCloudMetadataPolling();
    stopRealtimeReconnect();
    refreshCloudSyncControls();
    updateCloudSyncBadge(false, "Mây: Lỗi khởi tạo", "#ef4444");
    if (window.cloudWriteGate) window.cloudWriteGate.setStatus("error", "Không thể xác thực hoặc tải dữ liệu cloud.");
    hideStartupOverlay();
    return false;
  }
}

async function forcePushToCloud() {
  if (!canStartManualCloudSync()) return false;
  if (!confirmCloudSyncAction("Bạn có chắc muốn ĐẨY dữ liệu cục bộ hiện tại lên đám mây? Thao tác này có thể cập nhật dữ liệu đang được các máy khác sử dụng.")) {
    return false;
  }

  setCloudSyncActionBusy("push");
  try {
    state._lastModified = Date.now();
    const success = await pushToCloud();
    if (success) {
      showToast("Đã đẩy dữ liệu lên đám mây thành công.", "success");
      return true;
    }
    showToast("Đẩy dữ liệu lên đám mây thất bại. Hệ thống sẽ tự động thử lại.", "danger");
    return false;
  } catch (err) {
    showToast("Lỗi đẩy dữ liệu lên đám mây: " + err.message, "danger");
    return false;
  } finally {
    setCloudSyncActionBusy("");
  }
}

async function forcePullFromCloud() {
  if (!canStartManualCloudSync()) return false;
  if (!confirmCloudSyncAction("Bạn có chắc muốn TẢI TOÀN BỘ dữ liệu từ đám mây và hợp nhất vào máy này? Dữ liệu cục bộ cũ hơn có thể được thay thế.")) {
    return false;
  }

  setCloudSyncActionBusy("pull");
  try {
    const success = await pullAndMergeFromCloud({ reason: "manual-full", forceFull: true, force: true });
    if (success) {
      showToast("Đã tải và hợp nhất dữ liệu từ đám mây.", "success");
      return true;
    }
    showToast("Chưa thể tải dữ liệu từ đám mây lúc này.", "warning");
    return false;
  } catch (err) {
    showToast("Lỗi tải dữ liệu từ đám mây: " + err.message, "danger");
    return false;
  } finally {
    setCloudSyncActionBusy("");
  }
}

async function manualIncrementalSync() {
  if (!canStartManualCloudSync()) return false;

  setCloudSyncActionBusy("sync");
  try {
    const pullSucceeded = await pullAndMergeFromCloud({ reason: "manual", retryFullIfNoChanges: true, force: true });
    if (!pullSucceeded) {
      showToast("Chưa thể tải thay đổi từ đám mây lúc này.", "warning");
      return false;
    }

    // A manual sync is explicitly two-way: pull/merge first so we never push
    // over a newer cloud snapshot, then upload any surviving local changes.
    const pushSucceeded = await pushToCloud();
    if (pushSucceeded) {
      showToast("Đồng bộ đám mây thành công.", "success");
      return true;
    }
    showToast("Đã tải dữ liệu nhưng chưa thể đẩy thay đổi cục bộ lên đám mây.", "warning");
    return false;
  } catch (err) {
    showToast("Lỗi đồng bộ đám mây: " + err.message, "danger");
    return false;
  } finally {
    setCloudSyncActionBusy("");
  }
}

function updateCloudSyncBadge(connected, text, color = "#64748b") {
  const badge = document.getElementById("cloud-sync-badge");
  const icon = document.getElementById("cloud-sync-icon");
  const textEl = document.getElementById("cloud-sync-status-text");
  const glyph = document.getElementById("cloud-sync-status-glyph");
  const modalStatus = document.getElementById("cloud-sync-modal-status-text");
  const modalStatusPanel = document.getElementById("cloud-sync-modal-status");

  if (!badge || !icon || !textEl) return;

  const statusText = String(text || "");
  badge.title = statusText;
  badge.setAttribute("aria-label", statusText);

  badge.classList.remove("sync-offline", "sync-active", "sync-syncing", "sync-error");
  icon.style.color = "";

  const lower = statusText.toLowerCase();
  const isSyncing = ["dang", "tai", "day", "quet", "cho", "đang", "tải", "đẩy", "quét", "chờ"]
    .some(token => lower.includes(token));
  const isError = color === "#ef4444" || lower.includes("loi") || lower.includes("lỗi") || lower.includes("error");
  const statusState = isError ? "error" : (isSyncing ? "syncing" : (connected ? "active" : "offline"));
  textEl.textContent = statusState === "active"
    ? "Đã đồng bộ"
    : (statusState === "syncing" ? "Đang đồng bộ" : (statusState === "error" ? "Lỗi đồng bộ" : "Ngoại tuyến"));

  if (modalStatus) modalStatus.textContent = statusText;
  if (modalStatusPanel) modalStatusPanel.dataset.state = statusState;

  if (isError) {
    badge.classList.add("sync-error");
    icon.style.color = "#ef4444";
  } else if (isSyncing) {
    badge.classList.add("sync-syncing");
    icon.style.color = color && color !== "#64748b" ? color : "#f59e0b";
  } else if (connected) {
    badge.classList.add("sync-active");
    icon.style.color = "#10b981";
  } else {
    badge.classList.add("sync-offline");
    icon.style.color = "#64748b";
  }

  if (glyph) {
    glyph.style.display = (connected || isSyncing || isError) ? "block" : "none";
  }

  const refreshIcon = document.getElementById("cloud-sync-refresh-icon");
  if (refreshIcon) {
    if (isSyncing) {
      refreshIcon.classList.add("spinning");
    } else {
      refreshIcon.classList.remove("spinning");
    }
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseVoucherSequenceNumber(voucherId, prefix) {
  const match = String(voucherId || "").match(new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, "i"));
  return match ? Number(match[1]) || 0 : 0;
}

function formatVoucherSequenceId(prefix, number, padLength = 0) {
  const raw = String(Math.max(0, Number(number) || 0));
  return `${prefix}${padLength > 0 ? raw.padStart(padLength, "0") : raw}`;
}

function getNextStringBoundary(value) {
  const chars = Array.from(String(value || ""));
  if (chars.length === 0) return "";
  const last = chars.pop();
  return `${chars.join("")}${String.fromCodePoint(last.codePointAt(0) + 1)}`;
}

function getMaxVoucherSequenceFromRows(rows, prefix, rowPrefix = "v_") {
  let maxNum = 0;
  const cloudPrefix = `${rowPrefix}${prefix}`;
  const isLockRow = rowPrefix.startsWith("lock_");
  const now = Date.now();
  (rows || []).forEach(row => {
    const id = typeof row === "string" ? row : row && row.id;
    if (!id || !String(id).startsWith(cloudPrefix)) return;
    if (isLockRow && row && Number(row.last_modified) > 0 && now - Number(row.last_modified) > 15 * 60 * 1000) return;
    const rawVoucherId = String(id).slice(rowPrefix.length);
    maxNum = Math.max(maxNum, parseVoucherSequenceNumber(rawVoucherId, prefix));
  });
  return maxNum;
}

function getMaxLocalVoucherSequence(prefix, excludeId = null) {
  let maxNum = 0;
  (state.vouchers || []).forEach(v => {
    if (!v || !v.id || (excludeId && String(v.id).toLowerCase() === String(excludeId).toLowerCase())) return;
    maxNum = Math.max(maxNum, parseVoucherSequenceNumber(v.id, prefix));
  });
  return maxNum;
}

async function fetchCloudMaxVoucherSequence(prefix, options = {}) {
  const client = options.client || supabaseClient;
  const rowPrefix = options.rowPrefix || "v_";
  if (!client || !prefix) return 0;
  const lower = `${rowPrefix}${prefix}`;
  const upper = getNextStringBoundary(lower);
  const pageSize = options.pageSize || 1000;
  let from = 0;
  let maxNum = 0;

  if (cloudUsesVersionedRpc) {
    let afterId = null;
    for (let page = 0; page < 30; page++) {
      const { data, error } = await client.rpc("rd_ids_by_prefix", {
        p_workspace_id: cloudWorkspaceId,
        p_prefix: lower,
        p_after_id: afterId,
        p_limit: pageSize
      });
      if (error) throw error;
      maxNum = Math.max(maxNum, getMaxVoucherSequenceFromRows(data || [], prefix, rowPrefix));
      if (!data || data.length < pageSize) break;
      afterId = data[data.length - 1].id;
    }
    return maxNum;
  }

  for (let page = 0; page < 30; page++) {
    let query = client.from(CLOUD_SYNC_TABLE).select("id, last_modified").gte("id", lower);
    if (upper) query = query.lt("id", upper);
    const { data, error } = await query.order("id").range(from, from + pageSize - 1);
    if (error) throw error;
    maxNum = Math.max(maxNum, getMaxVoucherSequenceFromRows(data || [], prefix, rowPrefix));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return maxNum;
}

async function fetchCloudMaxVoucherSequenceForPrefixes(prefixes, options = {}) {
  let maxNum = 0;
  for (const prefix of Array.from(new Set((prefixes || []).filter(Boolean)))) {
    maxNum = Math.max(maxNum, await fetchCloudMaxVoucherSequence(prefix, options));
  }
  return maxNum;
}

function isCloudDuplicateKeyError(error) {
  return !!error && (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
}

async function tryReserveCloudVoucherId(voucherId, options = {}) {
  const client = options.client || supabaseClient;
  const rowPrefix = options.rowPrefix || "v_";
  if (!client || !voucherId) return true;
  const now = Date.now();
  const lockId = `lock_${rowPrefix}${voucherId}`;
  if (cloudUsesVersionedRpc) {
    const updatedBy = window.currentUser ? String(window.currentUser.username || "app-user") : "app-user";
    const { data, error } = await client.rpc("rd_reserve_voucher_id", {
      p_workspace_id: cloudWorkspaceId,
      p_lock_id: lockId,
      p_data: { voucherId, rowPrefix, reservedBy: cloudSyncGetSessionId(), reservedAt: now },
      p_updated_by: updatedBy
    });
    if (error) throw error;
    cloudSyncVersion = Math.max(cloudSyncVersion, Number(data && data.sync_version) || 0);
    return !!(data && data.reserved);
  }
  const { error } = await client.from(CLOUD_SYNC_TABLE).insert({
    id: lockId,
    data: { voucherId, rowPrefix, reservedBy: cloudSyncGetSessionId(), reservedAt: now },
    last_modified: now,
    is_syncing: false,
    updated_at: new Date().toISOString()
  });
  if (!error) return true;
  if (isCloudDuplicateKeyError(error)) return false;
  throw error;
}

async function getCloudSafeVoucherId(options = {}) {
  const prefix = options.prefix || "";
  if (!prefix) throw new Error("Missing voucher prefix");
  const prefixes = options.prefixes && options.prefixes.length ? options.prefixes : [prefix];
  const editingId = options.editingId || null;
  const rowPrefix = options.rowPrefix || "v_";
  const padLength = options.padLength || 0;
  const fallbackBase = Number(options.fallbackBase) || 0;

  const localMax = Math.max(...prefixes.map(p => getMaxLocalVoucherSequence(p, editingId)), 0);
  const shouldUseCloud = cloudSyncActive && supabaseClient;
  const cloudMax = shouldUseCloud ? await fetchCloudMaxVoucherSequenceForPrefixes(prefixes, { rowPrefix }) : 0;
  const lockMax = shouldUseCloud ? await fetchCloudMaxVoucherSequenceForPrefixes(prefixes, { rowPrefix: `lock_${rowPrefix}` }) : 0;
  let candidateNumber = Math.max(localMax, cloudMax, lockMax, fallbackBase) + 1;
  let candidateId = formatVoucherSequenceId(prefix, candidateNumber, padLength);

  if (!shouldUseCloud || options.reserveCloud === false) return candidateId;

  for (let attempt = 0; attempt < 25; attempt++) {
    if (await tryReserveCloudVoucherId(candidateId, { rowPrefix })) return candidateId;
    candidateNumber += 1;
    candidateId = formatVoucherSequenceId(prefix, candidateNumber, padLength);
  }

  throw new Error(`Cannot reserve voucher id for ${prefix}.`);
}

async function ensureCloudSafeVoucherIdForSave(options = {}) {
  const currentId = options.currentId || "";
  const editingId = options.editingId || null;
  if (editingId && String(currentId).toLowerCase() === String(editingId).toLowerCase()) return currentId;
  const safeId = await getCloudSafeVoucherId(options);
  if (safeId && safeId !== currentId && options.inputEl) options.inputEl.value = safeId;
  return safeId;
}

async function fetchExistingCloudIdsByKeysFromClient(client, keys) {
  const existing = new Set();
  const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)));
  for (let i = 0; i < uniqueKeys.length; i += 100) {
    const batch = uniqueKeys.slice(i, i + 100);
    const request = cloudUsesVersionedRpc
      ? client.rpc("rd_find_ids", { p_workspace_id: cloudWorkspaceId, p_ids: batch })
      : client.from(CLOUD_SYNC_TABLE).select("id").in("id", batch);
    const { data, error } = await request;
    if (error) throw error;
    (data || []).forEach(row => row && row.id && existing.add(row.id));
  }
  return existing;
}

window.initCloudSync = initCloudSync;
window.pushToCloud = pushToCloud;
window.trackDeletedIds = trackDeletedIds;
window.forcePullFromCloud = forcePullFromCloud;
window.forcePushToCloud = forcePushToCloud;
window.manualIncrementalSync = manualIncrementalSync;
window.updateCloudSyncBadge = updateCloudSyncBadge;
window.flushDeferredCloudSync = flushDeferredCloudSync;
window.isVoucherEntryModalOpen = isVoucherEntryModalOpen;
window.getCloudSafeVoucherId = getCloudSafeVoucherId;
window.ensureCloudSafeVoucherIdForSave = ensureCloudSafeVoucherIdForSave;
window.__cloudSyncInternals__ = {
  cloudSyncStateFromRows,
  cloudSyncFetchAllRows,
  cloudSyncFetchRowsSince,
  cloudSyncQuotePostgrestLogicValue,
  cloudSyncEntityNeedsPush,
  mergeStates,
  computeDelta,
  getStoredLastPulledCloudTs,
  persistLastPulledCloudTs,
  getPullCheckpointTs,
  getStartupPullCheckpointTs,
  getLegacyStartupCheckpointTs,
  isCloudSyncLockActive,
  checkCloudMetadataForChanges,
  getCloudSafeVoucherId,
  ensureCloudSafeVoucherIdForSave,
  getMaxVoucherSequenceFromRows,
  fetchExistingCloudIdsByKeysFromClient,
  cloudSyncRescueLocalOnlyItems,
  cloudSyncPruneStaleLocalOnlyItems,
  cloudSyncPrePullBeforePush,
  cloudSyncGetRescueCandidateKeys,
  cloudSyncGetCloudKeysFromCompleteSnapshot,
  scheduleCloudPull,
  cloudSyncGetDeletedIdsByState,
  cloudSyncNormalizeDeletedCloudKey,
  cloudSyncMakeTombstoneRow,
  cloudSyncEnsureMetadataRow,
  cloudSyncApplyPushToLastSyncState,
  cloudSyncShouldUseFullPull,
  cloudSyncGetDatasetIdentity,
  cloudSyncRestoreBaselineFromConfirmedCache,
  cloudSyncResetCloudBaseline,
  queuePendingPull,
  takePendingPullOptions
};
window.__syncInternals__ = window.__cloudSyncInternals__;
