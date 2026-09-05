/* ==========================================================================
   STATE DIFF — So sánh entity nhanh bằng _updatedAt + hash thay vì JSON.stringify
   ========================================================================== */

const ENTITY_WATCH_FIELDS = {
  voucher: [
    "_updatedAt", "type", "date", "partnerId", "description", "paymentMethod",
    "totalAmount", "amount", "entries", "debtAdjustment", "cogsAmount", "remainingDebt", "taxRate", "note", "items",
    "partnerName", "isManual", "isImported", "escrowRefId"
  ],
  product: [
    "_updatedAt", "name", "unit", "stock", "avgCost", "totalValue",
    "initialStock", "initialCost", "actualStock", "lastPurchasePrice"
  ],
  partner: [
    "_updatedAt", "name", "type", "phone", "address", "taxCode", "contacts"
  ]
};

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function entityContentHash(entity, kind) {
  const fields = ENTITY_WATCH_FIELDS[kind] || ["_updatedAt"];
  const parts = fields.map((key) => {
    const val = entity[key];
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
  return fnv1aHash(parts.join("\x1e"));
}

function entityChanged(prev, current, kind) {
  if (!prev) return true;
  if (!current) return true;
  const prevTs = Number(prev._updatedAt) || 0;
  const curTs = Number(current._updatedAt) || 0;
  if (curTs !== prevTs) return true;
  return entityContentHash(prev, kind) !== entityContentHash(current, kind);
}

function touchEntityUpdatedAt(entity) {
  if (!entity || typeof entity !== "object") return entity;
  entity._updatedAt = Date.now();
  return entity;
}

function pruneResolvedDeletionMarkers(currentState) {
  if (!currentState || typeof currentState !== "object") return currentState;

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
    } else if (entityChanged(prev, v, "voucher")) {
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
    } else if (entityChanged(prev, p, "product")) {
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
    } else if (entityChanged(prev, p, "partner")) {
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

  const metadataKeys = [
    "companyName", "address", "taxCode", "accountingStandard",
    "initialBalances", "partnerOpeningBalances", "partnerOpeningBalanceTs",
    "deletedIds", "deletedCloudKeys", "_deletedCloudKeyTs", "_lastPulledCloudTs", "_cloudDatasetIdentity", "_pendingCloudWrite",
    "cashEntries", "escrowItems", "salesTemplatesData", "users", "actionLogs",
    "schemaVersion", "_accountingValid", "_accountingValidTs", "_recalcWatermark"
  ];

  let hasMetaChanges = false;
  metadataKeys.forEach((key) => {
    const currentValStr = JSON.stringify(state[key] !== undefined ? state[key] : null);
    const prevValStr = JSON.stringify(lastSavedState[key] !== undefined ? lastSavedState[key] : null);
    if (currentValStr !== prevValStr) {
      delta.metadata[key] = currentValStr;
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

window.entityChanged = entityChanged;
window.entityContentHash = entityContentHash;
window.touchEntityUpdatedAt = touchEntityUpdatedAt;
window.pruneResolvedDeletionMarkers = pruneResolvedDeletionMarkers;
window.buildStateDelta = buildStateDelta;
window.applyDeltaToSnapshot = applyDeltaToSnapshot;
