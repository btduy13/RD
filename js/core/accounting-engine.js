/* ==========================================================================
   ACCOUNTING ENGINE — Watermark / skip-recalc helpers (pure, no DOM)
   ========================================================================== */

function getRecalcWatermark(state) {
  const vouchers = state.vouchers || [];
  let maxUpdatedAt = 0;
  vouchers.forEach((v) => {
    const ts = Number(v && v._updatedAt) || 0;
    if (ts > maxUpdatedAt) maxUpdatedAt = ts;
  });
  return {
    voucherCount: vouchers.length,
    productCount: (state.products || []).length,
    lastModified: Number(state._lastModified) || 0,
    maxVoucherUpdatedAt: maxUpdatedAt
  };
}

function shouldSkipFullRecalc(state, shouldSave, forceFullRecalc) {
  if (forceFullRecalc) return false;
  if (shouldSave !== false) return false;
  if (state._accountingValid !== true) return false;
  const validTs = Number(state._accountingValidTs) || 0;
  const lastMod = Number(state._lastModified) || 0;
  if (validTs < lastMod) return false;
  const saved = state._recalcWatermark;
  if (!saved) return false;
  const current = getRecalcWatermark(state);
  return (
    saved.voucherCount === current.voucherCount &&
    saved.productCount === current.productCount &&
    saved.lastModified === current.lastModified &&
    saved.maxVoucherUpdatedAt === current.maxVoucherUpdatedAt
  );
}

function markAccountingValid(state) {
  state._accountingValid = true;
  state._accountingValidTs = Date.now();
  state._recalcWatermark = getRecalcWatermark(state);
}

function invalidateAccounting(state) {
  state._accountingValid = false;
  state._recalcWatermark = null;
}

window.getRecalcWatermark = getRecalcWatermark;
window.shouldSkipFullRecalc = shouldSkipFullRecalc;
window.markAccountingValid = markAccountingValid;
window.invalidateAccounting = invalidateAccounting;
