/* ==========================================================================
   PRODUCT CASE DEDUPE — Gộp mã hàng trùng (khác hoa/thường), dùng chung Node + Browser
   ========================================================================== */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ProductCaseDedupe = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeProductId(id) {
    return String(id || "").trim().toUpperCase();
  }

  function productIdKey(id) {
    return String(id || "").trim().toLowerCase();
  }

  function findProductIndexById(id, products) {
    const key = productIdKey(id);
    if (!key) return -1;
    return (products || []).findIndex((p) => productIdKey(p.id) === key);
  }

  function findProductById(id, products) {
    const idx = findProductIndexById(id, products);
    return idx >= 0 ? products[idx] : null;
  }

  function countVoucherRefsForProductId(productId, vouchers) {
    const key = productIdKey(productId);
    if (!key) return 0;
    let count = 0;
    (vouchers || []).forEach((v) => {
      (v.items || []).forEach((item) => {
        if (productIdKey(item.productId) === key) count++;
      });
    });
    return count;
  }

  function pickCanonicalProduct(group, vouchers) {
    return group.slice().sort((a, b) => {
      const refDiff = countVoucherRefsForProductId(b.id, vouchers) - countVoucherRefsForProductId(a.id, vouchers);
      if (refDiff !== 0) return refDiff;

      const stockDiff = (Number(b.stock) || 0) - (Number(a.stock) || 0);
      if (stockDiff !== 0) return stockDiff;

      const aNorm = normalizeProductId(a.id);
      const bNorm = normalizeProductId(b.id);
      if (aNorm === String(a.id) && bNorm !== String(b.id)) return -1;
      if (bNorm === String(b.id) && aNorm !== String(a.id)) return 1;

      return String(a.id).length - String(b.id).length;
    })[0];
  }

  function mergeProductRecordFields(canonical, others, touchUpdatedAt) {
    let totalStock = Number(canonical.stock) || 0;
    let totalValue = Number(canonical.totalValue);
    if (!Number.isFinite(totalValue)) {
      totalValue = totalStock * (Number(canonical.avgCost) || 0);
    }

    others.forEach((other) => {
      const oStock = Number(other.stock) || 0;
      let oValue = Number(other.totalValue);
      if (!Number.isFinite(oValue)) oValue = oStock * (Number(other.avgCost) || 0);
      totalStock += oStock;
      totalValue += oValue;

      if (!canonical.name && other.name) canonical.name = other.name;
      else if (other.name && String(other.name).length > String(canonical.name || "").length) {
        canonical.name = other.name;
      }
      if (!canonical.unit && other.unit) canonical.unit = other.unit;
      if (!canonical.group && other.group) canonical.group = other.group;
      if (canonical.minStock == null && other.minStock != null) canonical.minStock = other.minStock;
      if (!canonical.salePrice1 && other.salePrice1) canonical.salePrice1 = other.salePrice1;
    });

    canonical.stock = totalStock;
    if (canonical.actualStock == null || others.length > 0) {
      canonical.actualStock = totalStock;
    }
    canonical.avgCost = totalStock > 0 ? Math.round(totalValue / totalStock) : (Number(canonical.avgCost) || 0);
    canonical.totalValue = totalStock * canonical.avgCost;
    canonical.id = normalizeProductId(canonical.id);
    if (typeof touchUpdatedAt === "function") touchUpdatedAt(canonical);
    else canonical._updatedAt = Date.now();
  }

  function reassignVoucherProductIds(stateObj, fromIds, toId, touchUpdatedAt) {
    const fromKeys = new Set((fromIds || []).map((id) => productIdKey(id)).filter(Boolean));
    const targetId = normalizeProductId(toId);
    if (fromKeys.size === 0 || !targetId) return 0;

    let changed = 0;
    (stateObj.vouchers || []).forEach((v) => {
      if (!v || !Array.isArray(v.items)) return;
      let voucherTouched = false;
      v.items.forEach((item) => {
        if (!item || !fromKeys.has(productIdKey(item.productId))) return;
        if (String(item.productId) !== targetId) {
          item.productId = targetId;
          changed++;
          voucherTouched = true;
        }
      });
      if (voucherTouched) {
        if (typeof touchUpdatedAt === "function") touchUpdatedAt(v);
        else v._updatedAt = Date.now();
      }
    });
    return changed;
  }

  function trackRemovedProductIds(stateObj, removedIds) {
    if (!Array.isArray(removedIds) || removedIds.length === 0) return;
    // Product deletions MUST be typed ("p_<id>") in deletedCloudKeys. Untyped
    // entries in deletedIds are treated as VOUCHER tombstones by the sync engine,
    // so a removed product whose ID matches a voucher number would delete that
    // voucher on every machine.
    if (!Array.isArray(stateObj.deletedCloudKeys)) stateObj.deletedCloudKeys = [];
    const existing = new Set(stateObj.deletedCloudKeys.map((key) => String(key)));
    removedIds.forEach((id) => {
      const s = String(id);
      if (!s) return;
      const typedKey = "p_" + s;
      if (!existing.has(typedKey)) {
        stateObj.deletedCloudKeys.push(typedKey);
        existing.add(typedKey);
      }
    });
  }

  function dedupeProductCatalogOnState(stateObj, options) {
    const opts = options || {};
    if (!stateObj || !Array.isArray(stateObj.products)) {
      return { ok: false, error: "invalid state" };
    }

    const touchUpdatedAt = opts.touchUpdatedAt || null;
    const products = stateObj.products;
    const beforeCount = products.length;
    const groups = {};

    products.forEach((p) => {
      const key = productIdKey(p.id);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    const objectsToRemove = new Set();
    const removedIds = [];
    let mergedGroupCount = 0;
    let voucherItemUpdates = 0;
    let idNormalizeCount = 0;
    const mergedSamples = [];

    Object.entries(groups).forEach(([key, group]) => {
      if (group.length <= 1) {
        const only = group[0];
        const norm = normalizeProductId(only.id);
        if (String(only.id) !== norm) {
          voucherItemUpdates += reassignVoucherProductIds(stateObj, [only.id], norm, touchUpdatedAt);
          only.id = norm;
          idNormalizeCount++;
        }
        return;
      }

      mergedGroupCount++;
      const canonical = pickCanonicalProduct(group, stateObj.vouchers);
      const others = group.filter((p) => p !== canonical);
      mergeProductRecordFields(canonical, others, touchUpdatedAt);
      voucherItemUpdates += reassignVoucherProductIds(stateObj, group.map((p) => p.id), canonical.id, touchUpdatedAt);
      others.forEach((p) => {
        objectsToRemove.add(p);
        removedIds.push(String(p.id));
      });
      if (mergedSamples.length < 8) {
        mergedSamples.push({
          key,
          kept: canonical.id,
          removed: others.map((p) => p.id)
        });
      }
    });

    if (objectsToRemove.size > 0) {
      stateObj.products = products.filter((p) => !objectsToRemove.has(p));
      trackRemovedProductIds(stateObj, removedIds);
    }

    const afterCount = stateObj.products.length;
    const removedCount = beforeCount - afterCount;
    const changed = removedCount > 0 || voucherItemUpdates > 0 || idNormalizeCount > 0;

    if (changed) {
      stateObj._lastModified = Date.now();
      stateObj._accountingValid = false;
    }

    return {
      ok: true,
      changed,
      beforeCount,
      afterCount,
      mergedGroupCount,
      removedCount,
      voucherItemUpdates,
      idNormalizeCount,
      mergedSamples
    };
  }

  function isGarbageProductId(id) {
    const s = String(id || "").trim();
    if (!s) return true;
    if (s.length <= 1) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return true;
    if (/^\d+$/.test(s) && s.length <= 4) return true;
    if (/^(BTL|BHTL|MHTL|PTL|TRH|NK|PX)\d{3,}$/i.test(s)) return true;
    if (/^(PT|PC)\d{3,}$/i.test(s) && s.length > 4) return true;
    return false;
  }

  function cleanGarbageProducts(stateObj, options) {
    const opts = options || {};
    if (!stateObj || !Array.isArray(stateObj.products)) {
      return { ok: false, removed: 0 };
    }

    const referencedIds = new Set();
    (stateObj.vouchers || []).forEach((v) => {
      (v.items || []).forEach((item) => {
        if (item && item.productId) referencedIds.add(String(item.productId));
      });
    });

    const beforeCount = stateObj.products.length;
    const removedIds = [];

    stateObj.products = stateObj.products.filter((p) => {
      const id = String(p.id || "").trim();
      if (!isGarbageProductId(id)) return true;
      if (referencedIds.has(id)) return true;
      const hasStock = (Number(p.stock) || 0) !== 0;
      const hasValue = (Number(p.totalValue) || 0) !== 0;
      if (hasStock || hasValue) return true;
      removedIds.push(id);
      return false;
    });

    if (removedIds.length > 0) {
      trackRemovedProductIds(stateObj, removedIds);
      stateObj._lastModified = Date.now();
      stateObj._accountingValid = false;
    }

    return {
      ok: true,
      removed: removedIds.length,
      beforeCount,
      afterCount: stateObj.products.length,
      samples: removedIds.slice(0, 20)
    };
  }

  return {
    normalizeProductId,
    productIdKey,
    findProductIndexById,
    findProductById,
    dedupeProductCatalogOnState,
    cleanGarbageProducts
  };
});
