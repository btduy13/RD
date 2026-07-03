/* ==========================================================================
   PRODUCT IDENTITY — Chuẩn hóa mã hàng (browser wrappers)
   ========================================================================== */

const _pcd = typeof ProductCaseDedupe !== "undefined" ? ProductCaseDedupe : null;

function normalizeProductId(id) {
  return _pcd ? _pcd.normalizeProductId(id) : String(id || "").trim().toUpperCase();
}

function productIdKey(id) {
  return _pcd ? _pcd.productIdKey(id) : String(id || "").trim().toLowerCase();
}

function findProductIndexById(id, products) {
  return _pcd
    ? _pcd.findProductIndexById(id, products)
    : (products || []).findIndex((p) => productIdKey(p.id) === productIdKey(id));
}

function findProductById(id, products) {
  const list = products || (typeof state !== "undefined" ? state.products : []);
  const idx = findProductIndexById(id, list);
  return idx >= 0 ? list[idx] : null;
}

function dedupeProductCatalogCase(options) {
  const opts = options || {};
  if (!_pcd || typeof state === "undefined") {
    return { ok: false, error: "ProductCaseDedupe unavailable" };
  }

  const result = _pcd.dedupeProductCatalogOnState(state, {
    touchUpdatedAt: typeof touchEntityUpdatedAt === "function" ? touchEntityUpdatedAt : null
  });

  if (result.changed && opts.recalculate !== false) {
    if (typeof invalidateAccounting === "function") invalidateAccounting(state);
    if (typeof recalculateAccounting === "function") recalculateAccounting(true);
    else if (typeof saveStateSync === "function") saveStateSync();
    else if (typeof saveState === "function") saveState();
  }

  // #region agent log
  if (typeof fetch === "function") {
    fetch("http://127.0.0.1:7918/ingest/0b4f62c8-cbbb-4c88-8d5a-276392bdbf4f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "de6ae3" }, body: JSON.stringify({ sessionId: "de6ae3", runId: opts.runId || "post-fix", hypothesisId: "H1-H4-fix", location: "product-identity.js:dedupeProductCatalogCase", message: "product case dedupe", data: result, timestamp: Date.now() }) }).catch(() => {});
  }
  // #endregion

  return result;
}

window.normalizeProductId = normalizeProductId;
window.productIdKey = productIdKey;
window.findProductIndexById = findProductIndexById;
window.findProductById = findProductById;
window.dedupeProductCatalogCase = dedupeProductCatalogCase;
