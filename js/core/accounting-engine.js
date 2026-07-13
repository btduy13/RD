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

function calculateInventoryValueAt(products, vouchers, toDate) {
  const balances = new Map();
  (Array.isArray(products) ? products : []).forEach(product => {
    if (!product || product.id === undefined || product.id === null) return;
    const stock = Number(product.initialStock) || 0;
    const avgCost = Number(product.initialCost) || 0;
    balances.set(String(product.id), {
      stock,
      avgCost,
      totalValue: stock * avgCost,
      lastPurchasePrice: Number(product.lastPurchasePrice) || avgCost
    });
  });

  const chronological = [...(Array.isArray(vouchers) ? vouchers : [])].sort((a, b) =>
    String(a && a.date || "").localeCompare(String(b && b.date || ""))
  );

  chronological.forEach(voucher => {
    if (!voucher || (toDate && String(voucher.date || "") > toDate) || !Array.isArray(voucher.items)) return;

    voucher.items.forEach(item => {
      if (!item) return;
      const balance = balances.get(String(item.productId));
      if (!balance) return;

      const qty = Number(item.qty) || 0;
      if (qty <= 0) return;
      const price = Number(item.price) || 0;
      const rawAmount = Number(item.amount);
      const itemAmount = Number.isFinite(rawAmount) ? rawAmount : Math.round(qty * price);

      if (voucher.type === "purchase") {
        const oldStock = balance.stock;
        balance.stock = Number((balance.stock + qty).toFixed(3));
        balance.totalValue += itemAmount;

        if (oldStock >= 0 && balance.stock > 0) {
          balance.avgCost = Math.round((balance.totalValue / balance.stock) * 100) / 100;
        } else if (balance.stock > 0) {
          balance.avgCost = price;
          balance.totalValue = Math.round(balance.stock * balance.avgCost);
        } else {
          if (!balance.avgCost || balance.avgCost <= 0) balance.avgCost = price;
          balance.totalValue = Math.round(balance.stock * balance.avgCost);
        }
        balance.lastPurchasePrice = price;
        return;
      }

      if (!balance.avgCost || balance.avgCost <= 0) {
        balance.avgCost = balance.lastPurchasePrice || price || 0;
      }
      const rawCogs = Number(item.cogsAmount);
      const cogsAmount = Number.isFinite(rawCogs)
        ? rawCogs
        : Math.round(qty * balance.avgCost);

      if (voucher.type === "sales_return") {
        balance.stock = Number((balance.stock + qty).toFixed(3));
        balance.totalValue += cogsAmount;
        if (balance.stock > 0) balance.avgCost = Math.round((balance.totalValue / balance.stock) * 100) / 100;
      } else if (voucher.type === "sales" || voucher.type === "purchase_return") {
        balance.stock = Number((balance.stock - qty).toFixed(3));
        balance.totalValue -= cogsAmount;
        if (balance.stock <= 0) balance.totalValue = 0;
        else balance.avgCost = Math.round((balance.totalValue / balance.stock) * 100) / 100;
      } else if (voucher.type === "inventory_adjust") {
        const adjustmentAmount = Number.isFinite(rawAmount)
          ? rawAmount
          : Math.round(qty * balance.avgCost);
        if (item.adjustDir === "in") {
          balance.stock = Number((balance.stock + qty).toFixed(3));
          balance.totalValue += adjustmentAmount;
          if (balance.stock > 0) balance.avgCost = Math.round((balance.totalValue / balance.stock) * 100) / 100;
        } else {
          balance.stock = Number((balance.stock - qty).toFixed(3));
          balance.totalValue -= adjustmentAmount;
          if (balance.stock <= 0) balance.totalValue = 0;
          else balance.avgCost = Math.round((balance.totalValue / balance.stock) * 100) / 100;
        }
      }
    });
  });

  let totalValue = 0;
  balances.forEach(balance => { totalValue += Number(balance.totalValue) || 0; });
  return totalValue;
}

window.getRecalcWatermark = getRecalcWatermark;
window.shouldSkipFullRecalc = shouldSkipFullRecalc;
window.markAccountingValid = markAccountingValid;
window.invalidateAccounting = invalidateAccounting;
window.calculateInventoryValueAt = calculateInventoryValueAt;
