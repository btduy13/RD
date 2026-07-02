// ==========================================================================
// CLOUD SYNC V2 - fresh engine, old js/sync.js is intentionally untouched.
// ==========================================================================

let supabaseClient = null;
let cloudSyncActive = false;
let isStartupPullCompleted = false;
let realtimeChannel = null;
let lastSyncState = window.lastSyncState || null;
let isPulling = false;
let isPushing = false;
let pullPending = false;
let pushPending = false;
let deferredCloudPull = false;
let deferredCloudPullReason = "";
let cloudMetadataPollTimer = null;
let cloudFocusCheckAttached = false;
let realtimeReconnectTimer = null;
let lastCloudMetadataPollAt = 0;
let lastCheckpointRecoveryAt = 0;
let lastPulledCloudWatermark = 0;
let pushRetryTimeout = null;

const SYNC_V2_CHECKPOINT_KEY = "rd_accounting_last_pulled_cloud_ts";
const SYNC_V2_TABLE = "rd_accounting_data";
const SYNC_V2_METADATA_ID = "metadata";
const SYNC_V2_PAGE_SIZE = 500;
const SYNC_V2_FULL_MAX_PAGES = 200;
const SYNC_V2_DELTA_MAX_PAGES = 80;
const SYNC_V2_BATCH_SIZE = 300;
const SYNC_V2_DELETE_BATCH_SIZE = 100;
const SYNC_V2_POLL_INTERVAL_MS = 15000;
const SYNC_V2_POLL_MIN_GAP_MS = 1500;
const SYNC_V2_STALE_LOCK_MS = 30 * 60 * 1000;
const SYNC_V2_RECOVERY_GAP_MS = 60 * 1000;
const SYNC_V2_RECONNECT_DELAY_MS = 5000;

const SYNC_V2_ENTITY_DEFS = [
  { stateKey: "vouchers", rowPrefix: "v_", deleteType: "voucher" },
  { stateKey: "products", rowPrefix: "p_", deleteType: "product" },
  { stateKey: "partners", rowPrefix: "part_", deleteType: "partner" }
];

function syncV2Log(message) {
  console.log(`[CloudSyncV2] ${message}`);
  if (window.electronAPI && typeof window.electronAPI.writeLog === "function") {
    window.electronAPI.writeLog(`[CloudSyncV2] ${message}`).catch(err => console.error("CloudSyncV2 log error:", err));
  }
}

function updateStartupStatus(text) {
  console.log(`[StartupStatus] ${text}`);
}

function hideStartupOverlay() {
  // Startup overlay removed in current app.
}

function syncV2Clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

// Cede the main thread for one macrotask so the renderer can paint between
// heavy phases of a pull. Only call at safe boundaries (never between reading
// `state` for a merge and re-assigning it).
function syncV2YieldToUi() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// One-time cleanup: the full lastSyncState snapshot used to be persisted to
// localStorage ("rd_accounting_last_sync_cache", a multi-MB synchronous write on
// every pull/push and a major UI-freeze source). The snapshot is now kept in
// memory only; drop any stale legacy blob so nothing can restore outdated data.
try {
  localStorage.removeItem("rd_accounting_last_sync_cache");
} catch (err) {}

function syncV2StableStringify(value) {
  if (value === undefined) return "__undefined__";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(syncV2StableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${syncV2StableStringify(value[key])}`).join(",")}}`;
}

function syncV2Equal(a, b) {
  return syncV2StableStringify(a) === syncV2StableStringify(b);
}

function areVouchersEqual(a, b) {
  return syncV2Equal(a, b);
}

function areProductsEqual(a, b) {
  return syncV2Equal(a, b);
}

function arePartnersEqual(a, b) {
  return syncV2Equal(a, b);
}

function syncV2DefaultState() {
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

function syncV2GetSessionId() {
  if (typeof clientSessionId !== "undefined") return clientSessionId;
  return "client_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getStoredLastPulledCloudTs() {
  const stateTs = Number(typeof state !== "undefined" && state ? state._lastPulledCloudTs : 0);
  if (Number.isFinite(stateTs) && stateTs > 0) return stateTs;

  let stored = 0;
  try {
    const raw = localStorage.getItem(SYNC_V2_CHECKPOINT_KEY);
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
      localStorage.setItem(SYNC_V2_CHECKPOINT_KEY, String(safeTs));
    } else {
      localStorage.removeItem(SYNC_V2_CHECKPOINT_KEY);
    }
  } catch (err) {
    console.warn("[CloudSyncV2] Cannot persist pull checkpoint:", err);
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

function syncV2PrefixForEntity(entityType) {
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

  const prefix = syncV2PrefixForEntity(entityType);
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
// exclusive). After a push use syncV2ApplyPushToLastSyncState instead.
function updateLastSyncState(newState) {
  if (!newState) {
    lastSyncState = null;
    window.lastSyncState = null;
    return;
  }

  lastSyncState = newState;
  window.lastSyncState = lastSyncState;
}

// After a successful push the cloud mirrors the pushed rows, so lastSyncState
// must too. Instead of deep-cloning the entire state (previous behavior),
// re-apply only the rows that were actually uploaded onto the prior snapshot.
function syncV2ApplyPushToLastSyncState(pushedEntityRows, pushTs) {
  lastSyncState = window.lastSyncState || lastSyncState;
  if (!lastSyncState) {
    // First push without any prior snapshot: fall back to one full clone.
    lastSyncState = syncV2Clone(state);
    window.lastSyncState = lastSyncState;
    return;
  }

  // Metadata (small) is rebuilt from the live state, matching the metadata row
  // that was just uploaded; entity arrays reuse the previous snapshot's items.
  const next = syncV2Clone(syncV2BuildMetadataForPush(pushTs));

  const rowsByDef = new Map();
  (pushedEntityRows || []).forEach(row => {
    if (!row || !row.id) return;
    const def = syncV2GetRowDef(row.id);
    if (!def) return;
    if (!rowsByDef.has(def)) rowsByDef.set(def, []);
    rowsByDef.get(def).push(row);
  });

  SYNC_V2_ENTITY_DEFS.forEach(def => {
    const map = new Map();
    (lastSyncState[def.stateKey] || []).forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
    (rowsByDef.get(def) || []).forEach(row => {
      const entityId = syncV2GetEntityIdFromRowId(row.id, def);
      if (row.data && row.data._deleted) {
        map.delete(entityId);
      } else if (row.data && row.data.id) {
        // Clone: row.data is the live state item; snapshot must not alias it.
        map.set(row.data.id, syncV2Clone(row.data));
      }
    });
    next[def.stateKey] = Array.from(map.values());
  });

  lastSyncState = next;
  window.lastSyncState = lastSyncState;
}

function syncV2GetRowDef(rowId) {
  return SYNC_V2_ENTITY_DEFS.find(def => rowId && rowId.startsWith(def.rowPrefix));
}

function syncV2GetEntityIdFromRowId(rowId, def) {
  return String(rowId || "").slice(def.rowPrefix.length);
}

function syncV2MakeTombstoneRow(rowId, pushTs) {
  const def = syncV2GetRowDef(rowId);
  const entityId = def ? syncV2GetEntityIdFromRowId(rowId, def) : rowId;
  return {
    id: rowId,
    data: {
      id: entityId,
      _deleted: true,
      _deletedCloudKey: rowId,
      _deletedEntity: def ? def.deleteType : "unknown",
      _deletedAt: pushTs,
      lastModifiedBy: syncV2GetSessionId()
    },
    last_modified: pushTs,
    is_syncing: false,
    updated_at: new Date().toISOString()
  };
}

function syncV2SplitMetadata(sourceState) {
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

function syncV2BuildMetadataForPush(pushTs) {
  const metadata = syncV2SplitMetadata(state);
  metadata._lastModified = pushTs;
  metadata.lastModifiedBy = syncV2GetSessionId();
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
  if (ageMs >= SYNC_V2_STALE_LOCK_MS) {
    console.warn(`[CloudSyncV2] Ignoring stale lock from ${reason}; age=${ageMs}ms`);
    return false;
  }
  return true;
}

function syncV2NoteLegacyLock(row, reason = "") {
  if (isCloudSyncLockActive(row, reason)) {
    syncV2Log(`Legacy global lock observed during ${reason || "sync"}; continuing with row-level sync.`);
  }
}

function withTimeout(promise, ms = 10000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Cloud request timed out after ${ms}ms.`)), ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

async function syncV2FetchMetadata(options = {}) {
  // summaryOnly: skip the heavy `data` JSON blob when only timestamps/locks are needed (polling path).
  const columns = options.summaryOnly
    ? "id, last_modified, is_syncing, updated_at"
    : "id, data, last_modified, is_syncing, updated_at";
  const { data, error } = await withTimeout(
    supabaseClient
      .from(SYNC_V2_TABLE)
      .select(columns)
      .eq("id", SYNC_V2_METADATA_ID)
      .maybeSingle(),
    10000
  );
  if (error) throw error;
  return data || null;
}

async function syncV2EnsureMetadataRow(options = {}) {
  const existing = await syncV2FetchMetadata(options);
  if (existing) return existing;

  const now = Date.now();
  const row = {
    id: SYNC_V2_METADATA_ID,
    data: { _lastModified: now, lastModifiedBy: syncV2GetSessionId() },
    last_modified: now,
    is_syncing: false,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from(SYNC_V2_TABLE).upsert(row);
  if (error) throw error;
  return row;
}

async function syncV2FetchLatestRowSummary() {
  const { data, error } = await withTimeout(
    supabaseClient
      .from(SYNC_V2_TABLE)
      .select("id, last_modified")
      .order("last_modified", { ascending: false })
      .limit(1),
    10000
  );
  if (error) throw error;
  return (data && data[0]) || null;
}

function syncV2WatermarkFromRows(rows, metadataRow = null) {
  let watermark = Number(metadataRow && metadataRow.last_modified) || 0;
  (rows || []).forEach(row => {
    watermark = Math.max(watermark, Number(row && row.last_modified) || 0);
  });
  return watermark;
}

async function syncV2GetCloudWatermark(metadataRow = null) {
  const latest = await syncV2FetchLatestRowSummary();
  return Math.max(
    Number(metadataRow && metadataRow.last_modified) || 0,
    Number(latest && latest.last_modified) || 0
  );
}

async function syncV2FetchAllRows() {
  const rows = [];
  let lastSeenId = "";

  for (let page = 0; page < SYNC_V2_FULL_MAX_PAGES; page++) {
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, `May: Dang tai du lieu (${page + 1})...`, "#f59e0b");
    }
    updateStartupStatus(`Dang tai cloud snapshot: trang ${page + 1}...`);

    let query = supabaseClient
      .from(SYNC_V2_TABLE)
      .select("id, data, last_modified")
      .order("id")
      .limit(SYNC_V2_PAGE_SIZE);
    if (lastSeenId) query = query.gt("id", lastSeenId);

    const { data, error } = await withTimeout(query, 20000);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < SYNC_V2_PAGE_SIZE) break;
    lastSeenId = data[data.length - 1].id;
  }

  if (rows.length >= SYNC_V2_FULL_MAX_PAGES * SYNC_V2_PAGE_SIZE) {
    throw new Error("Cloud full pull reached safety limit; refusing partial startup data.");
  }

  return rows;
}

async function syncV2FetchRowsSince(sinceTs) {
  const rows = [];
  let lastSeenId = "";

  for (let page = 0; page < SYNC_V2_DELTA_MAX_PAGES; page++) {
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, `May: Quet thay doi (${page + 1})...`, "#f59e0b");
    }

    let query = supabaseClient
      .from(SYNC_V2_TABLE)
      .select("id, data, last_modified")
      .gt("last_modified", sinceTs)
      .order("id")
      .limit(SYNC_V2_PAGE_SIZE);
    if (lastSeenId) query = query.gt("id", lastSeenId);

    const { data, error } = await withTimeout(query, 15000);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < SYNC_V2_PAGE_SIZE) break;
    lastSeenId = data[data.length - 1].id;
  }

  if (rows.length >= SYNC_V2_DELTA_MAX_PAGES * SYNC_V2_PAGE_SIZE) {
    throw new Error("Cloud incremental pull reached safety limit; retry full sync.");
  }

  return rows;
}

function syncV2StateFromRows(rows, options = {}) {
  const cloudState = syncV2DefaultState();
  const voucherChunks = [];
  const partnerChunks = [];
  let metadataRow = null;

  (rows || []).forEach(row => {
    if (!row || !row.id) return;

    if (row.id === SYNC_V2_METADATA_ID) {
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

    const def = syncV2GetRowDef(row.id);
    if (def && row.data) {
      if (row.data._deleted) {
        if (!Array.isArray(cloudState.deletedIds)) cloudState.deletedIds = [];
        if (!Array.isArray(cloudState.deletedCloudKeys)) cloudState.deletedCloudKeys = [];
        const entityId = syncV2GetEntityIdFromRowId(row.id, def);
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

  const watermark = options.watermark || syncV2WatermarkFromRows(rows, metadataRow);
  cloudState._lastModified = Math.max(Number(cloudState._lastModified) || 0, watermark);
  cloudState._cloudWatermark = watermark;
  return { state: syncV2DeduplicateState(cloudState), watermark, metadataRow };
}

// Deduplicates entity arrays by id (highest _updatedAt wins) and drops items
// listed in deletedIds. Mutates sourceState in place instead of deep-cloning
// the whole state; every call site owns its input exclusively (freshly built
// cloud snapshots), so in-place is safe.
function syncV2DeduplicateState(sourceState) {
  const result = sourceState || syncV2DefaultState();
  const deleted = new Set(Array.isArray(result.deletedIds) ? result.deletedIds : []);
  SYNC_V2_ENTITY_DEFS.forEach(def => {
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

const SYNC_V2_MERGE_ENTITY_KEYS = ["vouchers", "products", "partners", "cashEntries", "escrowItems"];
// The big three are timestamp-stamped by computeDelta on every push, so an
// equal _updatedAt means "same version": keep the local object (no clone, no
// change flagged). cashEntries/escrowItems ride inside the metadata row without
// per-item stamping, so ties there fall back to a content compare with the old
// cloud-wins semantics (they are small arrays).
const SYNC_V2_TIE_KEEP_LOCAL_KEYS = new Set(["vouchers", "products", "partners"]);

function syncV2NewMergeStats() {
  return {
    changed: false,
    changedIdsByEntity: { vouchers: new Set(), products: new Set(), partners: new Set() }
  };
}

// id -> item across all entity arrays (first occurrence wins, mirroring the
// old syncV2FindActiveItem scan order).
function syncV2BuildActiveItemMap(s) {
  const map = new Map();
  if (!s) return map;
  SYNC_V2_MERGE_ENTITY_KEYS.forEach(key => {
    (s[key] || []).forEach(item => {
      if (item && item.id && !map.has(item.id)) map.set(item.id, item);
    });
  });
  return map;
}

// Merge one entity array. Local items are carried by reference (they already
// belong to the caller's local state); cloud winners are cloned only when
// options.cloneWinners is set, so the same object never ends up in both the
// live state and the lastSyncState snapshot.
function syncV2MergeEntityArrays(stateKey, localArr, cloudArr, deleted, options) {
  const stats = options.stats || null;
  const changedIds = stats ? stats.changedIdsByEntity[stateKey] : null;
  const tieKeepsLocal = SYNC_V2_TIE_KEEP_LOCAL_KEYS.has(stateKey);
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
      } else if (cloudTs === localTs && !tieKeepsLocal) {
        applyCloud = !syncV2Equal(localItem, item);
      }
    }
    if (!applyCloud) return;
    map.set(item.id, options.cloneWinners ? syncV2Clone(item) : item);
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
function syncV2MetaComparable(meta) {
  const comparable = { ...(meta || {}) };
  delete comparable._lastModified;
  delete comparable._cloudWatermark;
  delete comparable._lastPulledCloudTs;
  delete comparable.lastModifiedBy;
  delete comparable.deletedIds;
  delete comparable.deletedCloudKeys;
  delete comparable.cashEntries;
  delete comparable.escrowItems;
  return syncV2StableStringify(comparable);
}

function syncV2MergeMetadata(localState, cloudState) {
  const localMeta = syncV2SplitMetadata(localState || {});
  const cloudMeta = syncV2SplitMetadata(cloudState || {});
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
function syncV2MergeStatesCore(localState, cloudState, options = {}) {
  const stats = options.collectStats ? syncV2NewMergeStats() : null;
  const mergeOptions = { cloneWinners: !!options.cloneWinners, stats };

  const localTs = Number(localState._lastModified) || 0;
  const cloudTs = Number(cloudState._lastModified || cloudState._cloudWatermark) || 0;
  const localDeleted = Array.isArray(localState.deletedIds) ? localState.deletedIds : [];
  const cloudDeleted = Array.isArray(cloudState.deletedIds) ? cloudState.deletedIds : [];

  const deleted = new Set();
  if (localDeleted.length > 0 || cloudDeleted.length > 0) {
    // One id->item map per side instead of a linear scan per deleted id.
    const cloudActive = syncV2BuildActiveItemMap(cloudState);
    const localActive = syncV2BuildActiveItemMap(localState);
    localDeleted.forEach(id => {
      const cloudItem = cloudActive.get(id);
      if (cloudItem && (Number(cloudItem._updatedAt) || 0) > localTs) return;
      deleted.add(id);
    });
    cloudDeleted.forEach(id => {
      const localItem = localActive.get(id);
      if (localItem && (Number(localItem._updatedAt) || 0) > cloudTs) return;
      deleted.add(id);
    });
  }

  const deletedIds = Array.from(deleted);
  if (deletedIds.length > 0) {
    syncV2Log(`mergeStates: localTs=${localTs}, cloudTs=${cloudTs}, cloudDeleted size=${cloudDeleted.length}, deletedIds size=${deletedIds.length}, sample=${JSON.stringify(deletedIds.slice(0, 5))}`);
  }

  const entityArrays = {};
  SYNC_V2_MERGE_ENTITY_KEYS.forEach(key => {
    entityArrays[key] = syncV2MergeEntityArrays(key, localState[key], cloudState[key], deleted, mergeOptions);
  });

  const mergedMeta = syncV2MergeMetadata(localState, cloudState);
  // Overridden by the entity merge below; drop before compare/clone.
  delete mergedMeta.cashEntries;
  delete mergedMeta.escrowItems;
  if (stats && !stats.changed) {
    stats.changed = syncV2MetaComparable(mergedMeta) !== syncV2MetaComparable(syncV2SplitMetadata(localState));
  }

  const merged = {
    ...(options.cloneMetadata ? syncV2Clone(mergedMeta) : mergedMeta),
    ...entityArrays,
    deletedIds,
    deletedCloudKeys: Array.from(new Set([
      ...(localState.deletedCloudKeys || []),
      ...(cloudState.deletedCloudKeys || [])
    ])),
    _lastModified: Math.max(localTs, cloudTs),
    _cloudWatermark: Math.max(Number(localState._cloudWatermark) || 0, Number(cloudState._cloudWatermark) || cloudTs)
  };

  return { state: merged, stats };
}

function mergeStates(localState, cloudState) {
  if (!localState) return syncV2Clone(cloudState);
  if (!cloudState) return syncV2Clone(localState);
  return syncV2MergeStatesCore(localState, cloudState, { cloneWinners: true, cloneMetadata: true }).state;
}

// Builds the next cloud snapshot (future lastSyncState) from the previous one
// plus the freshly fetched partial rows. No cloning: the previous snapshot is
// replaced wholesale and never aliases the live state, and partial rows are
// exclusively owned by this pull.
function syncV2MergeCloudSnapshot(baseCloudState, partialCloudState) {
  if (!baseCloudState) return partialCloudState ? partialCloudState : syncV2DefaultState();
  if (!partialCloudState) return baseCloudState;
  return syncV2MergeStatesCore(baseCloudState, partialCloudState, { cloneWinners: false, cloneMetadata: false }).state;
}

async function persistStateCacheAfterCloudPull(cacheState = state) {
  try {
    const json = JSON.stringify(cacheState);
    if (window.electronAPI && typeof window.electronAPI.writeStateFile === "function") {
      const result = await window.electronAPI.writeStateFile(json);
      if (result && result.ok && typeof initializeLastSavedState === "function") {
        initializeLastSavedState(cacheState);
      } else if (result && !result.ok) {
        console.error("[CloudSyncV2] Cannot write state file:", result.error);
      }
    } else {
      localStorage.setItem("rd_accounting_online_cache", json);
      if (typeof initializeLastSavedState === "function") initializeLastSavedState(cacheState);
    }
  } catch (err) {
    console.error("[CloudSyncV2] Cannot persist local cache:", err);
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
async function syncV2PersistPullDeltaToCache(mergedState, changedIdsByEntity = null) {
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

    SYNC_V2_ENTITY_DEFS.forEach(def => {
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
      syncV2Log("Pull delta persist: khong co thay doi cuc bo, bo qua ghi SQLite.");
      return true;
    }

    const result = await window.electronAPI.writeStateDelta(delta);
    if (!result || !result.ok) {
      console.error("[CloudSyncV2] Pull delta write failed:", result && result.error);
      return false;
    }

    // Apply the delta to the SQLite snapshot, mirroring executeSaveState's bookkeeping.
    Object.keys(delta.metadata).forEach(key => {
      lastSavedState[key] = JSON.parse(delta.metadata[key]);
    });
    SYNC_V2_ENTITY_DEFS.forEach(def => {
      delta[def.stateKey].upsert.forEach(item => {
        lastSavedState[def.stateKey].set(item.id, JSON.parse(JSON.stringify(item)));
      });
      delta[def.stateKey].deleteIds.forEach(id => {
        lastSavedState[def.stateKey].delete(id);
      });
    });

    syncV2Log(`Pull delta persist: vouchers +${delta.vouchers.upsert.length}/-${delta.vouchers.deleteIds.length}, products +${delta.products.upsert.length}/-${delta.products.deleteIds.length}, partners +${delta.partners.upsert.length}/-${delta.partners.deleteIds.length}, metadata ${Object.keys(delta.metadata).length} keys.`);
    return true;
  } catch (err) {
    console.error("[CloudSyncV2] Pull delta persist error, falling back to full persist:", err);
    return false;
  }
}

function syncV2RefreshUiAfterPull() {
  if (typeof recalculateAccounting === "function") recalculateAccounting(false);
  if (typeof filterDebts === "function") filterDebts();
  if (typeof filterPartners === "function") filterPartners();
  if (typeof filterCash === "function") filterCash();
  if (typeof initExcelIntegration === "function") initExcelIntegration();
  if (typeof refreshOpenPartnerLedgerModal === "function") refreshOpenPartnerLedgerModal();
  if (typeof refreshUI === "function") refreshUI();
}

function syncV2NeedsPushAfterPull(mergedState, cloudSnapshot) {
  const mergedComparable = syncV2Clone(mergedState);
  const cloudComparable = syncV2Clone(cloudSnapshot || {});
  delete mergedComparable._lastPulledCloudTs;
  delete cloudComparable._lastPulledCloudTs;
  return !syncV2Equal(mergedComparable, cloudComparable);
}

// Mutates mergedState in place (its entity arrays are freshly built by the
// merge, so no defensive clone is needed) and returns how many items were
// pruned so the caller can factor it into the "anything changed" decision.
function syncV2PruneStaleLocalOnlyItems(mergedState, localBeforePull, cloudSnapshot, checkpointTs) {
  const checkpoint = Number(checkpointTs) || 0;
  if (checkpoint <= 0) return 0;

  let prunedCount = 0;
  SYNC_V2_ENTITY_DEFS.forEach(def => {
    const cloudIds = new Set((cloudSnapshot[def.stateKey] || []).filter(item => item && item.id).map(item => item.id));
    const localIds = new Set((localBeforePull[def.stateKey] || []).filter(item => item && item.id).map(item => item.id));
    const before = (mergedState[def.stateKey] || []);
    const kept = before.filter(item => {
      if (!item || !item.id) return false;
      if (cloudIds.has(item.id)) return true;
      if (!localIds.has(item.id)) return true;
      return (Number(item._updatedAt) || 0) > checkpoint - 2000;
    });
    prunedCount += before.length - kept.length;
    mergedState[def.stateKey] = kept;
  });

  return prunedCount;
}

function deferCloudPull(reason) {
  deferredCloudPull = true;
  deferredCloudPullReason = reason || "editing";
  updateCloudSyncBadge(false, "May: Cho luu phieu de dong bo", "#f59e0b");
}

function scheduleCloudPull(reason, options = {}) {
  if (!options.force && isVoucherEntryModalOpen()) {
    deferCloudPull(reason);
    return;
  }
  pullAndMergeFromCloud({ reason, ...options });
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

  if (pullPending) {
    pullPending = false;
    setTimeout(() => pullAndMergeFromCloud({ reason: "pending-after-startup" }), 250);
  }

}

async function pullAndMergeFromCloud(options = {}) {
  if (!cloudSyncActive || !supabaseClient) return;

  if (!isStartupPullCompleted && !options.startup) {
    pullPending = true;
    return;
  }

  if (!options.force && isVoucherEntryModalOpen()) {
    deferCloudPull(options.reason || "editing");
    return;
  }

  if (isPulling) {
    pullPending = true;
    return;
  }

  isPulling = true;
  pullPending = false;
  syncV2Log(`pullAndMergeFromCloud bat dau, ly do: ${options.reason || "unknown"}, forceFull: ${!!options.forceFull}`);

  try {
    const metadata = await syncV2EnsureMetadataRow();
    syncV2NoteLegacyLock(metadata, options.reason || "pull");

    const checkpoint = options.forceFull ? 0 : getPullCheckpointTs();
    let rows;
    let watermark;
    let cloudSnapshot;

    if (options.forceFull || checkpoint === 0) {
      syncV2Log(`Full reconcile pull (${options.reason || "unknown"}).`);
      rows = await syncV2FetchAllRows();
      watermark = syncV2WatermarkFromRows(rows, metadata);
      cloudSnapshot = syncV2StateFromRows(rows, { watermark }).state;
    } else {
      const cloudWatermark = await syncV2GetCloudWatermark(metadata);
      syncV2Log(`Kiem tra incremental: cloudWatermark=${cloudWatermark}, checkpoint=${checkpoint}`);
      if (cloudWatermark <= checkpoint && !options.retryFullIfNoChanges) {
        syncV2Log("Cloud watermark <= checkpoint, khong co thay doi, thoat.");
        updateCloudSyncBadge(true, "May: Da ket noi", "#10b981");
        return;
      }

      rows = await syncV2FetchRowsSince(checkpoint);
      syncV2Log(`Da tai ${rows.length} dong thay doi tu cloud since ${checkpoint}`);
      if (rows.length === 0 && options.retryFullIfNoChanges) {
        syncV2Log("Khong co dong thay doi incremental, thuc hien full pull de bao dam...");
        rows = await syncV2FetchAllRows();
        watermark = syncV2WatermarkFromRows(rows, metadata);
        cloudSnapshot = syncV2StateFromRows(rows, { watermark }).state;
      } else {
        if (!rows.some(row => row.id === SYNC_V2_METADATA_ID)) {
          rows.push(metadata);
        }
        watermark = Math.max(cloudWatermark, syncV2WatermarkFromRows(rows, metadata));
        const partialCloud = syncV2StateFromRows(rows, { watermark }).state;
        // Refresh from window in case the cached snapshot was loaded after this script initialized
        // (initApp sets window.lastSyncState during startup) - same pattern as computeDelta.
        lastSyncState = window.lastSyncState || lastSyncState;
        cloudSnapshot = syncV2MergeCloudSnapshot(lastSyncState || syncV2DefaultState(), partialCloud);
        cloudSnapshot._cloudWatermark = watermark;
        cloudSnapshot._lastModified = Math.max(Number(cloudSnapshot._lastModified) || 0, watermark);
      }
    }

    // Let the renderer paint after the network fetch / snapshot build, before
    // the synchronous merge phase.
    await syncV2YieldToUi();

    // From here until `state` is updated there must be NO awaits: the merge
    // reads the live state and user edits mid-merge would otherwise be lost.
    const vouchersBefore = Array.isArray(state.vouchers) ? state.vouchers.length : 0;
    const mergeResult = syncV2MergeStatesCore(state, cloudSnapshot, {
      cloneWinners: true,
      cloneMetadata: true,
      collectStats: true
    });
    const merged = mergeResult.state;
    const stats = mergeResult.stats;
    const prunedCount = syncV2PruneStaleLocalOnlyItems(merged, state, cloudSnapshot, checkpoint);
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
    syncV2Log(`Ket qua merge: vouchers truoc=${vouchersBefore}, sau=${state.vouchers.length}, thay doi=${hasChanges ? "co" : "khong"}, pruned=${prunedCount}`);

    if (hasChanges) {
      const deltaPersisted = await syncV2PersistPullDeltaToCache(state, stats.changedIdsByEntity);
      if (!deltaPersisted) {
        // Fallback: no SQLite snapshot available or delta write failed -> full rewrite.
        await persistStateCacheAfterCloudPull(state);
      }
      // One more paint opportunity before the heavy recalc/refresh.
      await syncV2YieldToUi();
      syncV2RefreshUiAfterPull();
    } else {
      syncV2Log("Pull khong lam thay doi du lieu; bo qua recalc/refreshUI/persist.");
    }

    updateCloudSyncBadge(true, "May: Da ket noi", "#10b981");
  } catch (err) {
    if (typeof addErrorLog === "function") addErrorLog("CloudSyncV2.pull", err.message, err);
    updateCloudSyncBadge(false, "May: Loi ket noi", "#ef4444");
    throw err;
  } finally {
    isPulling = false;
    if (pullPending) {
      pullPending = false;
      setTimeout(() => pullAndMergeFromCloud({ reason: "pending" }), 250);
    }
  }
}

async function pullFromCloudOnStartup() {
  if (!cloudSyncActive || !supabaseClient) return;

  // Incremental startup pull when we have a valid checkpoint AND a cached cloud snapshot
  // to merge partial rows into; full pull only on first run / cleared storage.
  const startupCheckpoint = getPullCheckpointTs();
  const hasBaseSnapshot = !!(window.lastSyncState || lastSyncState);
  const needFullPull = !(startupCheckpoint > 0 && hasBaseSnapshot);
  updateStartupStatus(needFullPull ? "Dang full-reconcile du lieu cloud..." : "Dang dong bo thay doi tu cloud...");
  syncV2Log(`Startup pull mode: ${needFullPull ? "full" : `incremental (checkpoint=${startupCheckpoint})`}.`);

  try {
    await pullAndMergeFromCloud({ startup: true, forceFull: needFullPull, force: true, reason: "startup" });
    finishStartupPull();
    updateCloudSyncBadge(true, "May: Da ket noi", "#10b981");
    syncV2Log("Startup reconcile completed.");
  } catch (err) {
    console.error("[CloudSyncV2] Startup reconcile failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSyncV2.startup", err.message, err);
    updateCloudSyncBadge(false, "May: Loi tai startup", "#ef4444");
    finishStartupPull();
  }
}

function syncV2MetadataDiffers(localMeta, cloudMeta) {
  const localComparable = syncV2Clone(localMeta || {});
  const cloudComparable = syncV2Clone(cloudMeta || {});
  delete localComparable.lastModifiedBy;
  delete cloudComparable.lastModifiedBy;
  delete localComparable._lastPulledCloudTs;
  delete cloudComparable._lastPulledCloudTs;
  return !syncV2Equal(localComparable, cloudComparable);
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

  SYNC_V2_ENTITY_DEFS.forEach(def => {
    const currentItems = Array.isArray(state[def.stateKey]) ? state[def.stateKey] : [];
    const previousItems = Array.isArray(lastSyncState && lastSyncState[def.stateKey]) ? lastSyncState[def.stateKey] : [];
    const previousMap = new Map(previousItems.filter(item => item && item.id).map(item => [item.id, item]));
    const currentMap = new Map(currentItems.filter(item => item && item.id).map(item => [item.id, item]));

    currentItems.forEach(item => {
      if (!item || !item.id) return;
      const previous = previousMap.get(item.id);
      if (!previous || !syncV2Equal(previous, item)) {
        item._updatedAt = Math.max(Number(item._updatedAt) || 0, pushTs, now);
        rowsToUpsert.push(makeRow(`${def.rowPrefix}${item.id}`, item));
      }
    });

    previousItems.forEach(item => {
      if (item && item.id && !currentMap.has(item.id)) {
        rowsToUpsert.push(syncV2MakeTombstoneRow(`${def.rowPrefix}${item.id}`, pushTs));
      }
    });
  });

  if (Array.isArray(state.deletedCloudKeys)) {
    state.deletedCloudKeys.forEach(key => {
      if (key) rowsToUpsert.push(syncV2MakeTombstoneRow(key, pushTs));
    });
  } else if (Array.isArray(state.deletedIds)) {
    state.deletedIds.forEach(id => {
      const key = `v_${id}`;
      if (id) rowsToUpsert.push(syncV2MakeTombstoneRow(key, pushTs));
    });
  }

  const localMeta = syncV2BuildMetadataForPush(pushTs);
  const cloudMeta = syncV2SplitMetadata(lastSyncState || {});
  if (!lastSyncState || syncV2MetadataDiffers(localMeta, cloudMeta)) {
    rowsToUpsert.push(makeRow(SYNC_V2_METADATA_ID, localMeta));
  }

  return {
    rowsToUpsert: Array.from(new Map(rowsToUpsert.map(row => [row.id, row])).values()),
    idsToDelete: []
  };
}

async function syncV2PrePullBeforePush() {
  const metadata = await syncV2EnsureMetadataRow();
  syncV2NoteLegacyLock(metadata, "pre-push");

  const cloudWatermark = await syncV2GetCloudWatermark(metadata);
  const checkpoint = getPullCheckpointTs();
  if (cloudWatermark > checkpoint) {
    syncV2Log(`Pre-push pull because cloud ${cloudWatermark} > checkpoint ${checkpoint}.`);
    await pullAndMergeFromCloud({ reason: "pre-push", force: true });
  }
}

async function syncV2UpsertRows(rows) {
  for (let i = 0; i < rows.length; i += SYNC_V2_BATCH_SIZE) {
    const batch = rows.slice(i, i + SYNC_V2_BATCH_SIZE);
    const { error } = await supabaseClient.from(SYNC_V2_TABLE).upsert(batch);
    if (error) throw error;
  }
}

async function syncV2DeleteRows(ids) {
  for (let i = 0; i < ids.length; i += SYNC_V2_DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + SYNC_V2_DELETE_BATCH_SIZE);
    const { error } = await supabaseClient.from(SYNC_V2_TABLE).delete().in("id", batch);
    if (error) throw error;
  }
}

async function pushToCloud() {
  if (!cloudSyncActive || !supabaseClient) return;
  if (!isStartupPullCompleted) {
    syncV2Log("Skipped push while startup pull is running; next local save or manual push will upload changes.");
    return;
  }
  if (isPushing) {
    pushPending = true;
    return;
  }

  isPushing = true;
  pushPending = false;
  updateCloudSyncBadge(false, "May: Dang day...", "#f59e0b");

  try {
    const metadataBefore = await syncV2EnsureMetadataRow();
    const cloudWatermarkBefore = await syncV2GetCloudWatermark(metadataBefore);
    const pushTs = Math.max(Date.now(), Number(state._lastModified) || 0, cloudWatermarkBefore + 1);
    state._lastModified = pushTs;

    const finalMetadata = syncV2BuildMetadataForPush(pushTs);
    const { rowsToUpsert, idsToDelete } = computeDelta();
    const entityRows = rowsToUpsert.filter(row => row.id !== SYNC_V2_METADATA_ID);
    const tombstoneRows = entityRows.filter(row => row.data && row.data._deleted);
    if (entityRows.length > 0) await syncV2UpsertRows(entityRows);
    if (idsToDelete.length > 0) await syncV2DeleteRows(idsToDelete);

    const finalRow = {
      id: SYNC_V2_METADATA_ID,
      data: finalMetadata,
      last_modified: pushTs,
      is_syncing: false,
      updated_at: new Date().toISOString()
    };
    await syncV2UpsertRows([finalRow]);

    if (tombstoneRows.length > 0) {
      state.deletedIds = [];
      state.deletedCloudKeys = [];
    }
    state._cloudWatermark = pushTs;
    // [Perf] Cap nhat snapshot dong bo bang cach ap dung dung cac dong vua day,
    // thay vi deep-clone toan bo state (gay dung hinh UI voi du lieu lon).
    syncV2ApplyPushToLastSyncState(entityRows, pushTs);
    // [Fix] KHÔNG cập nhật checkpoint watermark của pull khi push, để luồng check/pull 
    // tiếp theo tải về và hợp nhất đầy đủ các thay đổi song song trên cloud (ví dụ đơn bị xóa).
    // persistLastPulledCloudTs(pushTs);
    // [Perf] Khong ghi lai toan bo SQLite sau khi push: du lieu cuc bo da duoc
    // executeSaveState (js/state.js) luu qua duong delta truoc khi push. Cac thay doi
    // bookkeeping trong luc push (_lastModified, _updatedAt, deletedIds da xoa) se duoc
    // luu o lan save/pull ke tiep va an toan neu mat (tombstone gui lai idempotent).
    updateCloudSyncBadge(true, "May: Da ket noi", "#10b981");
    syncV2Log(`Push completed: ${entityRows.length} upsert, ${tombstoneRows.length} tombstone, ${idsToDelete.length} physical delete.`);
  } catch (err) {
    console.error("[CloudSyncV2] Push failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSyncV2.push", err.message, err);
    updateCloudSyncBadge(false, "May: Loi day", "#ef4444");
    if (!pushRetryTimeout) {
      pushRetryTimeout = setTimeout(() => {
        pushRetryTimeout = null;
        if (cloudSyncActive && supabaseClient) pushToCloud();
      }, 5000);
    }
  } finally {
    isPushing = false;
    if (pushPending) {
      pushPending = false;
      setTimeout(() => pushToCloud(), 300);
    }
  }
}

async function checkCloudMetadataForChanges(reason = "poll") {
  if (!cloudSyncActive || !supabaseClient || isPulling || isPushing) return;
  const now = Date.now();
  if (now - lastCloudMetadataPollAt < SYNC_V2_POLL_MIN_GAP_MS) return;
  lastCloudMetadataPollAt = now;

  try {
    // Lightweight summary only: the full metadata `data` blob is fetched later by the pull itself.
    const metadata = await syncV2EnsureMetadataRow({ summaryOnly: true });
    syncV2NoteLegacyLock(metadata, reason);

    const cloudWatermark = await syncV2GetCloudWatermark(metadata);
    const checkpoint = getPullCheckpointTs();

    if (cloudWatermark > checkpoint) {
      scheduleCloudPull(reason);
      return;
    }

    if (checkpoint > cloudWatermark && now - lastCheckpointRecoveryAt > SYNC_V2_RECOVERY_GAP_MS) {
      lastCheckpointRecoveryAt = now;
      syncV2Log(`Checkpoint skew recovery (${reason}): local ${checkpoint}, cloud ${cloudWatermark}.`);
      scheduleCloudPull(`${reason}-checkpoint-recovery`, { forceFull: true });
    }
  } catch (err) {
    console.warn("[CloudSyncV2] Metadata check failed:", err);
  }
}

function stopCloudMetadataPolling() {
  if (cloudMetadataPollTimer) {
    clearInterval(cloudMetadataPollTimer);
    cloudMetadataPollTimer = null;
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
  cloudMetadataPollTimer = setInterval(() => checkCloudMetadataForChanges("poll"), SYNC_V2_POLL_INTERVAL_MS);
  setTimeout(() => checkCloudMetadataForChanges("poll-initial"), 1000);
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
  }, SYNC_V2_RECONNECT_DELAY_MS);
}

function listenToCloudChanges() {
  if (!cloudSyncActive || !supabaseClient) return;
  stopRealtimeReconnect();
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabaseClient
    .channel("rd-accounting-sync-v2")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: SYNC_V2_TABLE,
        filter: "id=eq.metadata"
      },
      payload => {
        const row = payload.new;
        if (!row) return;
        if (row.data && row.data.lastModifiedBy === syncV2GetSessionId()) return;
        syncV2NoteLegacyLock(row, "realtime");
        scheduleCloudPull("realtime");
      }
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        // Realtime is healthy: polling is redundant. Keep the focus/visibility
        // change-check attached as a safety net.
        attachCloudFocusCheck();
        stopCloudMetadataPolling();
        syncV2Log("Realtime subscribed; metadata polling stopped (fallback only).");
        checkCloudMetadataForChanges("realtime-subscribed");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        updateCloudSyncBadge(false, "May: Realtime fallback polling", "#f59e0b");
        startCloudMetadataPolling();
        reconnectRealtimeLater(status);
      }
    });
}

function initCloudSync() {
  if (!cloudSyncSettings.enabled) {
    cloudSyncActive = false;
    isStartupPullCompleted = true;
    updateCloudSyncBadge(false, "May: Tat", "#64748b");
    hideStartupOverlay();
    return;
  }

  if (!cloudSyncSettings.supabaseUrl || !cloudSyncSettings.supabaseAnonKey) {
    cloudSyncActive = false;
    isStartupPullCompleted = true;
    updateCloudSyncBadge(false, "May: Chua cau hinh", "#ef4444");
    hideStartupOverlay();
    return;
  }

  if (typeof supabase === "undefined" || !supabase.createClient) {
    cloudSyncActive = false;
    isStartupPullCompleted = true;
    updateCloudSyncBadge(false, "May: Khong co mang", "#ef4444");
    hideStartupOverlay();
    return;
  }

  startSupabaseClient();
}

async function startSupabaseClient() {
  try {
    stopCloudMetadataPolling();
    stopRealtimeReconnect();
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    updateCloudSyncBadge(false, "May: Dang ket noi...", "#f59e0b");
    supabaseClient = supabase.createClient(cloudSyncSettings.supabaseUrl, cloudSyncSettings.supabaseAnonKey);
    cloudSyncActive = true;
    isStartupPullCompleted = false;

    await syncV2EnsureMetadataRow();
    await pullFromCloudOnStartup();
    listenToCloudChanges();
    startCloudMetadataPolling();

    const forcePullBtn = document.getElementById("btn-force-pull");
    if (forcePullBtn) forcePullBtn.style.display = "inline-block";
    const forcePushBtn = document.getElementById("btn-force-push");
    if (forcePushBtn) forcePushBtn.style.display = "inline-block";
  } catch (err) {
    console.error("[CloudSyncV2] Init failed:", err);
    if (typeof addErrorLog === "function") addErrorLog("CloudSyncV2.init", err.message, err);
    cloudSyncActive = false;
    isStartupPullCompleted = true;
    stopCloudMetadataPolling();
    stopRealtimeReconnect();
    updateCloudSyncBadge(false, "May: Loi khoi tao", "#ef4444");
    hideStartupOverlay();
  }
}

function forcePushToCloud() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return;
  }
  if (isVoucherEntryModalOpen()) {
    showToast("Hãy lưu hoặc đóng phiếu đang nhập trước khi đẩy cloud.", "warning");
    return;
  }
  if (confirm("Bạn có chắc muốn đẩy dữ liệu cục bộ lên cloud?")) {
    state._lastModified = Date.now();
    pushToCloud().then(() => showToast("Đã đẩy dữ liệu lên cloud.", "success"));
  }
}

function forcePullFromCloud() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return;
  }
  pullAndMergeFromCloud({ reason: "manual-full", forceFull: true, force: true })
    .then(() => showToast("Đã tải và hợp nhất dữ liệu cloud.", "success"))
    .catch(err => showToast("Lỗi tải cloud: " + err.message, "danger"));
}

function manualIncrementalSync() {
  if (!cloudSyncActive || !supabaseClient) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return;
  }
  pullAndMergeFromCloud({ reason: "manual", retryFullIfNoChanges: true, force: true })
    .then(() => showToast("Đồng bộ cloud thành công.", "success"))
    .catch(err => showToast("Lỗi đồng bộ: " + err.message, "danger"));
}

function updateCloudSyncBadge(connected, text, color = "#64748b") {
  const badge = document.getElementById("cloud-sync-badge");
  const icon = document.getElementById("cloud-sync-icon");
  const textEl = document.getElementById("cloud-sync-status-text");
  const glyph = document.getElementById("cloud-sync-status-glyph");

  if (!badge || !icon || !textEl) return;

  const statusText = String(text || "");
  textEl.textContent = statusText;
  badge.title = statusText;
  badge.setAttribute("aria-label", statusText);

  badge.classList.remove("sync-offline", "sync-active", "sync-syncing", "sync-error");
  icon.style.color = "";

  const lower = statusText.toLowerCase();
  const isSyncing = lower.includes("dang") || lower.includes("tai") || lower.includes("day") || lower.includes("đang") || lower.includes("quet") || lower.includes("cho");
  const isError = color === "#ef4444" || lower.includes("loi") || lower.includes("lỗi") || lower.includes("error");

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

  for (let page = 0; page < 30; page++) {
    let query = client.from(SYNC_V2_TABLE).select("id, last_modified").gte("id", lower);
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
  const { error } = await client.from(SYNC_V2_TABLE).insert({
    id: lockId,
    data: { voucherId, rowPrefix, reservedBy: syncV2GetSessionId(), reservedAt: now },
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
    const { data, error } = await client.from(SYNC_V2_TABLE).select("id").in("id", batch);
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
window.__syncV2Internals__ = {
  syncV2StateFromRows,
  syncV2FetchAllRows,
  syncV2FetchRowsSince,
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
  fetchExistingCloudIdsByKeysFromClient
};
window.__syncInternals__ = window.__syncV2Internals__;
