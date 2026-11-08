/* ==========================================================================
   STATE DIFF — So sánh entity nhanh bằng _updatedAt + so sánh cấu trúc (không JSON.stringify)
   ========================================================================== */

// Metadata keys persisted to SQLite (main.js), diffed on save (here) and after a
// pull (cloud-sync.js). _lastModified is written separately: it changes on
// every save and must not by itself count as a change.
const STATE_METADATA_KEYS = [
  "companyName", "address", "taxCode", "accountingStandard",
  "preparerName", "chiefAccountantName", "directorName", "allowNegativeStock",
  "initialBalances", "partnerOpeningBalances", "partnerOpeningBalanceTs",
  "deletedIds", "deletedCloudKeys", "_deletedCloudKeyTs", "_lastPulledCloudTs", "_cloudDatasetIdentity", "_pendingCloudWrite",
  "cashEntries", "escrowItems", "employees", "payrolls", "taxSettings", "salesTemplatesData", "users", "actionLogs",
  "schemaVersion"
];

// Structural equality for JSON data without serialising: a save at ~20k vouchers
// re-checks every entity, and recalculation rewrites derived fields (entries,
// cogsUnit, remainingDebt, vatBreakdown) without bumping _updatedAt.
// undefined == null mirrors JSON (the saved snapshot is a JSON clone).
function sameJsonValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameJsonValue(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  for (const k in a) if (a[k] !== undefined && !sameJsonValue(a[k], b[k])) return false;
  for (const k in b) if (b[k] !== undefined && a[k] === undefined) return false;
  return true;
}

function entityChanged(prev, current) {
  if (!prev || !current) return true;
  if ((Number(prev._updatedAt) || 0) !== (Number(current._updatedAt) || 0)) return true;
  return !sameJsonValue(prev, current);
}

function touchEntityUpdatedAt(entity) {
  if (!entity || typeof entity !== "object") return entity;
  entity._updatedAt = Date.now();
  return entity;
}

const TOMBSTONE_LOCAL_KEEP_MS = 180 * 24 * 60 * 60 * 1000;

function pruneResolvedDeletionMarkers(currentState, now = Date.now()) {
  if (!currentState || typeof currentState !== "object") return currentState;

  // Old local tombstones only bloat every save. Safe to forget once no local
  // write is pending (the deletion reached the cloud as a typed tombstone row,
  // which stays authoritative and a full snapshot pull re-delivers it). Keys
  // without a timestamp have unknown age and are kept.
  const tombstoneTs = currentState._deletedCloudKeyTs;
  if (!currentState._pendingCloudWrite && tombstoneTs && typeof tombstoneTs === "object" && Array.isArray(currentState.deletedCloudKeys)) {
    const expired = new Set(Object.keys(tombstoneTs).filter(key => {
      const ts = Number(tombstoneTs[key]) || 0;
      return ts > 0 && ts < now - TOMBSTONE_LOCAL_KEEP_MS;
    }));
    if (expired.size > 0) {
      currentState.deletedCloudKeys = currentState.deletedCloudKeys.filter(key => !expired.has(String(key)));
      expired.forEach(key => delete tombstoneTs[key]);
    }
  }

  const activeIds = new Set();
  const activeCloudKeys = new Set();
  const addActive = (items, prefix, includeLegacyKey = false) => {
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!item || item.id === undefined || item.id === null || item.id === "") return;
      const id = String(item.id);
      activeIds.add(id);
      activeCloudKeys.add(`${prefix}${id}`);
      if (includeLegacyKey) activeCloudKeys.add(id);
    });
  };

  // Legacy unprefixed tombstones represented vouchers. Typed markers must be
  // compared against their own entity collection so p_X is not discarded just
  // because an unrelated voucher/partner also happens to use ID X.
  addActive(currentState.vouchers, "v_", true);
  addActive(currentState.products, "p_");
  addActive(currentState.partners, "part_");
  addActive(currentState.cashEntries, "cash_");
  addActive(currentState.escrowItems, "escrow_");
  addActive(currentState.employees, "emp_");
  addActive(currentState.payrolls, "pay_");

  if (Array.isArray(currentState.deletedIds)) {
    currentState.deletedIds = currentState.deletedIds.filter(id =>
      id !== undefined && id !== null && id !== "" && !activeIds.has(String(id))
    );
  }
  if (Array.isArray(currentState.deletedCloudKeys)) {
    currentState.deletedCloudKeys = currentState.deletedCloudKeys.filter(key =>
      key !== undefined && key !== null && key !== "" && !activeCloudKeys.has(String(key))
    );
  }
  if (currentState._deletedCloudKeyTs && typeof currentState._deletedCloudKeyTs === "object") {
    const keptKeys = new Set(
      (Array.isArray(currentState.deletedCloudKeys) ? currentState.deletedCloudKeys : [])
        .map(key => String(key))
    );
    Object.keys(currentState._deletedCloudKeyTs).forEach(key => {
      if (!keptKeys.has(String(key)) || activeCloudKeys.has(String(key))) {
        delete currentState._deletedCloudKeyTs[key];
      }
    });
  }

  return currentState;
}

function buildStateDelta(state, lastSavedState) {
  const delta = {
    metadata: {},
    vouchers: { upsert: [], deleteIds: [] },
    products: { upsert: [], deleteIds: [] },
    partners: { upsert: [], deleteIds: [] }
  };

  let hasVoucherChanges = false;
  let hasProductChanges = false;
  let hasPartnerChanges = false;

  const currentVouchers = state.vouchers || [];
  const currentVoucherIds = new Set();
  const addedVouchers = [];
  const updatedVouchers = [];

  currentVouchers.forEach((v) => {
    if (!v || !v.id) return;
    currentVoucherIds.add(v.id);
    const prev = lastSavedState.vouchers.get(v.id);
    if (!prev) {
      delta.vouchers.upsert.push(v);
      addedVouchers.push(v.id);
      hasVoucherChanges = true;
    } else if (entityChanged(prev, v)) {
      delta.vouchers.upsert.push(v);
      updatedVouchers.push(v.id);
      hasVoucherChanges = true;
    }
  });

  for (const id of lastSavedState.vouchers.keys()) {
    if (!currentVoucherIds.has(id)) {
      delta.vouchers.deleteIds.push(id);
      hasVoucherChanges = true;
    }
  }

  const currentProducts = state.products || [];
  const currentProductIds = new Set();
  const addedProducts = [];
  const updatedProducts = [];

  currentProducts.forEach((p) => {
    if (!p || !p.id) return;
    currentProductIds.add(p.id);
    const prev = lastSavedState.products.get(p.id);
    if (!prev) {
      delta.products.upsert.push(p);
      addedProducts.push(p.id);
      hasProductChanges = true;
    } else if (entityChanged(prev, p)) {
      delta.products.upsert.push(p);
      updatedProducts.push(p.id);
      hasProductChanges = true;
    }
  });

  for (const id of lastSavedState.products.keys()) {
    if (!currentProductIds.has(id)) {
      delta.products.deleteIds.push(id);
      hasProductChanges = true;
    }
  }

  const currentPartners = state.partners || [];
  const currentPartnerIds = new Set();
  const addedPartners = [];
  const updatedPartners = [];

  currentPartners.forEach((p) => {
    if (!p || !p.id) return;
    currentPartnerIds.add(p.id);
    const prev = lastSavedState.partners.get(p.id);
    if (!prev) {
      delta.partners.upsert.push(p);
      addedPartners.push(p.id);
      hasPartnerChanges = true;
    } else if (entityChanged(prev, p)) {
      delta.partners.upsert.push(p);
      updatedPartners.push(p.id);
      hasPartnerChanges = true;
    }
  });

  for (const id of lastSavedState.partners.keys()) {
    if (!currentPartnerIds.has(id)) {
      delta.partners.deleteIds.push(id);
      hasPartnerChanges = true;
    }
  }

  let hasMetaChanges = false;
  STATE_METADATA_KEYS.forEach((key) => {
    if (!sameJsonValue(state[key], lastSavedState[key])) {
      delta.metadata[key] = JSON.stringify(state[key] !== undefined ? state[key] : null);
      hasMetaChanges = true;
    }
  });

  return {
    delta,
    hasChanges: hasMetaChanges || hasVoucherChanges || hasProductChanges || hasPartnerChanges,
    addedVouchers,
    updatedVouchers,
    addedProducts,
    updatedProducts,
    addedPartners,
    updatedPartners
  };
}

function applyDeltaToSnapshot(lastSavedState, delta) {
  Object.keys(delta.metadata).forEach((key) => {
    lastSavedState[key] = JSON.parse(delta.metadata[key]);
  });
  delta.vouchers.upsert.forEach((v) => {
    lastSavedState.vouchers.set(v.id, JSON.parse(JSON.stringify(v)));
  });
  delta.vouchers.deleteIds.forEach((id) => {
    lastSavedState.vouchers.delete(id);
  });
  delta.products.upsert.forEach((p) => {
    lastSavedState.products.set(p.id, JSON.parse(JSON.stringify(p)));
  });
  delta.products.deleteIds.forEach((id) => {
    lastSavedState.products.delete(id);
  });
  delta.partners.upsert.forEach((p) => {
    lastSavedState.partners.set(p.id, JSON.parse(JSON.stringify(p)));
  });
  delta.partners.deleteIds.forEach((id) => {
    lastSavedState.partners.delete(id);
  });
}

if (typeof window !== "undefined") {
  window.STATE_METADATA_KEYS = STATE_METADATA_KEYS;
  window.sameJsonValue = sameJsonValue;
  window.entityChanged = entityChanged;
  window.touchEntityUpdatedAt = touchEntityUpdatedAt;
  window.pruneResolvedDeletionMarkers = pruneResolvedDeletionMarkers;
  window.buildStateDelta = buildStateDelta;
  window.applyDeltaToSnapshot = applyDeltaToSnapshot;
}
// main.js (Node) reads the shared metadata key list.
if (typeof module !== "undefined" && module.exports) module.exports = { STATE_METADATA_KEYS };
