/* ==========================================================================
   ACCOUNTING ENGINE — Watermark / skip-recalc helpers (pure, no DOM)
   ========================================================================== */

// Deterministic voucher order for valuation / allocation (moving-average cost, COGS, FIFO debt).
// Same date -> stock-in before stock-out, then id (string compare),
// so every workstation computes identical figures regardless of array order.
const ACCOUNTING_TYPE_RANK = {
  purchase: 0, sales_return: 0,
  sales: 2, purchase_return: 2
};
// An inventory adjustment whose every line increases stock is a stock-in.
function accountingTypeRank(voucher) {
  const type = voucher && voucher.type;
  if (type === "inventory_adjust") {
    const items = Array.isArray(voucher.items) ? voucher.items : [];
    return items.length > 0 && items.every(item => item && item.adjustDir === "in") ? 0 : 1;
  }
  return Object.prototype.hasOwnProperty.call(ACCOUNTING_TYPE_RANK, type) ? ACCOUNTING_TYPE_RANK[type] : 1;
}
function compareVouchersForAccounting(a, b) {
  const da = String(a && a.date || "");
  const db = String(b && b.date || "");
  if (da < db) return -1;
  if (da > db) return 1;
  const ra = accountingTypeRank(a);
  const rb = accountingTypeRank(b);
  if (ra !== rb) return ra - rb;
  const ia = String(a && a.id !== undefined && a.id !== null ? a.id : "");
  const ib = String(b && b.id !== undefined && b.id !== null ? b.id : "");
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

// Resolves a voucher's partner id for COMPUTATION / lookups only; never writes back to the voucher.
// Exact (trimmed) id match wins; otherwise a strict name/id lookup, but a name shared by several
// partners is not guessed (raw id is kept).
function createVoucherPartnerResolver(partners) {
  const idSet = new Set();
  const nameCount = Object.create(null);
  (Array.isArray(partners) ? partners : []).forEach(p => {
    if (!p) return;
    if (p.id !== undefined && p.id !== null) idSet.add(String(p.id).trim());
    const nk = p.name !== undefined && p.name !== null ? String(p.name).trim().toLowerCase() : "";
    if (nk) nameCount[nk] = (nameCount[nk] || 0) + 1;
  });
  return function resolveVoucherPartnerId(v) {
    if (!v) return "";
    const raw = v.partnerId !== undefined && v.partnerId !== null ? String(v.partnerId) : "";
    if (idSet.has(raw.trim())) return raw.trim();
    if (typeof getPartnerForVoucher !== "function") return raw;
    // Only the partnerId field is used (partnerName is a display snapshot and must not rebind a voucher).
    const p = getPartnerForVoucher({ partnerId: raw }, { strict: true });
    if (!p || p.id === undefined || p.id === null) return raw;
    const nk = String(p.name || "").trim().toLowerCase();
    if (nk && nameCount[nk] > 1) return raw;
    return String(p.id);
  };
}

function accountingInputFingerprint(value) {
  const text = JSON.stringify(value);
  let first = 2166136261, second = 5381;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`;
}

function getRecalcWatermark(state) {
  const vouchers = state.vouchers || [];
  let maxUpdatedAt = 0;
  vouchers.forEach((v) => {
    const ts = Number(v && v._updatedAt) || 0;
    if (ts > maxUpdatedAt) maxUpdatedAt = ts;
  });
  return {
    inputs: accountingInputFingerprint({
      standard: state.accountingStandard,
      openings: state.partnerOpeningBalances,
      partners: (state.partners || []).map(p => [p.id, p.type]),
      products: (state.products || []).map(p => [p.id, p.initialStock, p.initialCost, p.actualStock]),
      vouchers: vouchers.map(v => [v.id, v.type, v.date, v.partnerId, v.paymentMethod,
        v.amount, v.taxRate, v.items, v.entries, v.debtAdjustment, v.isImported, v.isManual])
    }),
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
    saved.inputs === current.inputs &&
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

  const chronological = [...(Array.isArray(vouchers) ? vouchers : [])].sort(compareVouchersForAccounting);

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

window.createVoucherPartnerResolver = createVoucherPartnerResolver;
window.compareVouchersForAccounting = compareVouchersForAccounting;
window.getRecalcWatermark = getRecalcWatermark;
window.shouldSkipFullRecalc = shouldSkipFullRecalc;
window.markAccountingValid = markAccountingValid;
window.invalidateAccounting = invalidateAccounting;
window.calculateInventoryValueAt = calculateInventoryValueAt;
