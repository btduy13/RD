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
  const idByUpper = new Map();
  const nameCount = Object.create(null);
  (Array.isArray(partners) ? partners : []).forEach(p => {
    if (!p) return;
    if (p.id !== undefined && p.id !== null) {
      const key = String(p.id).trim();
      idSet.add(key);
      if (!idByUpper.has(key.toUpperCase())) idByUpper.set(key.toUpperCase(), key);
    }
    const nk = p.name !== undefined && p.name !== null ? String(p.name).trim().toLowerCase() : "";
    if (nk) nameCount[nk] = (nameCount[nk] || 0) + 1;
  });
  return function resolveVoucherPartnerId(v) {
    if (!v) return "";
    const raw = v.partnerId !== undefined && v.partnerId !== null ? String(v.partnerId) : "";
    if (idSet.has(raw.trim())) return raw.trim();
    // Mã đối tác là chữ hoa: chứng từ ghi mã khác hoa/thường vẫn thuộc đúng đối tác
    const upperHit = idByUpper.get(raw.trim().toUpperCase());
    if (upperHit) return upperHit;
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

// ---------------------------------------------------------------------------
// Gợi ý sửa tài khoản đối ứng trên phiếu thu/chi — dùng chung cho nhập Excel sổ quỹ và
// công cụ rà soát ở tab Công nợ. Chỉ gợi ý khi có bằng chứng rõ (đối tác đã có chứng từ
// ghi công nợ, mô tả nêu rõ GTGT/môn bài/trả nợ); trường hợp mơ hồ để kế toán tự quyết.
// ---------------------------------------------------------------------------
function foldAccountingText(text) {
  return String(text || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}

function isBankLikePartner(partner, partnerId) {
  const text = foldAccountingText(`${partnerId || ""} ${partner && partner.name || ""}`);
  return /ngan hang|bank|sacom/.test(text);
}

// Số chứng từ ghi công nợ theo đối tác: hóa đơn bán chịu (131) và phiếu nhập mua chịu (331).
function buildPartnerDebtVoucherStats(vouchers) {
  const stats = new Map();
  (vouchers || []).forEach(v => {
    if (!v || !v.partnerId) return;
    const pid = String(v.partnerId);
    const method = String(v.paymentMethod ?? "").trim();
    let s = stats.get(pid);
    if (!s) { s = { salesOn131: 0, purchasesOn331: 0 }; stats.set(pid, s); }
    if (v.type === "sales" && method === "131") s.salesOn131++;
    if (v.type === "purchase" && method === "331") s.purchasesOn331++;
  });
  return stats;
}

// Trả về { from, to, reason } hoặc null. account: TK ghi Có (phiếu thu) / ghi Nợ (phiếu chi).
function suggestCashAccountFix(type, account, description, partner, partnerId, stats) {
  const acc = String(account ?? "").trim();
  const desc = foldAccountingText(description);
  const st = stats || { salesOn131: 0, purchasesOn331: 0 };
  const hasLoanWord = /(^|[^a-z0-9])vay([^a-z0-9]|$)/.test(desc) || desc.includes("giai ngan");
  const fix = (to, reason) => ({ from: acc, to, reason });
  if (type === "payment") {
    // Phiếu gộp thuế với phí vận chuyển/bốc xếp ("thuế GTGT + phí lô hàng") cần tách tay — không gợi ý.
    const mixedTaxPayment = /\+|van chuyen|boc xep|(^|[^a-z0-9])phi([^a-z0-9]|$)/.test(desc);
    if (acc === "333" && desc.includes("gtgt") && !mixedTaxPayment) return fix("3331", "Nộp thuế GTGT ghi giảm TK 3331 (thuế GTGT phải nộp), không ghi TK tổng hợp 333");
    if (acc === "333" && desc.includes("mon bai")) return fix("3338", "Lệ phí môn bài hạch toán TK 3338");
    if (!partnerId) return null;
    if (acc === "341" && !hasLoanWord && !isBankLikePartner(partner, partnerId) && /(^|[^a-z0-9])no([^a-z0-9]|$)/.test(desc) && st.purchasesOn331 > 0) {
      return fix("331", "Trả nợ nhà cung cấp (đối tác có phiếu nhập ghi Có 331), không phải trả nợ vay 341");
    }
    if (acc === "156" && st.purchasesOn331 > 0) {
      return fix("331", "Thanh toán cho NCC đã có phiếu nhập ghi Có 331 — ghi Nợ 156 lần nữa sẽ tăng kho hai lần");
    }
    return null;
  }
  if (type === "receipt") {
    if (!partnerId) return null;
    if (acc === "341" && !hasLoanWord && !isBankLikePartner(partner, partnerId)) {
      return fix("131", "Tiền khách trả (ngân hàng trong diễn giải chỉ là kênh chuyển khoản), không phải tiền vay 341");
    }
    if (acc === "511" && st.salesOn131 > 0) {
      return fix("131", "Khách đã có hóa đơn bán chịu ghi Nợ 131 — thu tiền ghi Có 511 lần nữa làm doanh thu tăng hai lần");
    }
  }
  return null;
}

// Gợi ý cho cả một phiếu thu/chi: chỉ xét vế đối ứng (Có của phiếu thu, Nợ của phiếu chi).
function suggestCashVoucherAccountFixes(v, partner, stats) {
  if (!v || (v.type !== "receipt" && v.type !== "payment") || !Array.isArray(v.entries)) return [];
  const side = v.type === "receipt" ? "credit" : "debit";
  const out = [];
  v.entries.forEach((e, index) => {
    if (!e) return;
    const s = suggestCashAccountFix(v.type, e[side], e.desc || v.description, partner, v.partnerId, stats);
    if (s) out.push({ ...s, index, side, amount: Number(e.amount) || 0 });
  });
  return out;
}

// Số dư đầu kỳ ký quỹ: TT133 không có TK 244/344 — số dư đã khai ở 244/344 (tên ghi rõ "TK 1386/3386
// theo TT133") được đọc gộp vào 1386/3386, khớp với bút toán ký quỹ (mapCashDepositEntries). Chỉ đọc,
// không đổi dữ liệu đã lưu, để chuyển lại TT200 vẫn giữ nguyên số dư gốc.
const TT133_OPENING_ALIASES = { "1386": "244", "3386": "344" };
const TT133_OPENING_ALIAS_SOURCES = new Set(Object.values(TT133_OPENING_ALIASES));

function isHiddenOpeningAlias(code, standard) {
  return standard !== "TT200" && TT133_OPENING_ALIAS_SOURCES.has(String(code));
}

function getOpeningBalanceForAccount(initialBalances, code, standard) {
  const all = initialBalances || {};
  const key = String(code);
  const primary = all[key];
  const aliasKey = standard !== "TT200" ? TT133_OPENING_ALIASES[key] : undefined;
  const alias = aliasKey ? all[aliasKey] : undefined;
  if (!alias) return primary || { type: "debit", balance: 0 };
  const signed = ob => ob ? (ob.type === "credit" ? -1 : 1) * (Number(ob.balance) || 0) : 0;
  const type = (primary || alias).type === "credit" ? "credit" : "debit";
  const net = signed(primary) + signed(alias);
  return { name: (primary && primary.name) || alias.name, type, balance: type === "credit" ? -net : net };
}

window.getOpeningBalanceForAccount = getOpeningBalanceForAccount;
window.isHiddenOpeningAlias = isHiddenOpeningAlias;
// ---------------------------------------------------------------------------
// Số dư đầu kỳ TK 131/331 = tổng số dư đầu kỳ chi tiết đối tác (khách: Nợ − Có; NCC: Có − Nợ).
// Chi tiết đối tác đồng bộ cloud theo TỪNG mã còn tổng 131/331 đồng bộ cả tài khoản, nên sau khi
// pull ghép số dư từ nhiều máy thì phải cộng lại (applyPartnerOpeningTotals) — nếu không Sổ cái 131
// lệch công nợ chi tiết.
// ---------------------------------------------------------------------------
function computePartnerOpeningTotals(partners, openings) {
  let customerNet = 0, supplierNet = 0;
  const all = openings || {};
  (partners || []).forEach(p => {
    if (!p) return;
    const op = all[p.id];
    if (!op) return;
    const debit = Number(op.debit) || 0, credit = Number(op.credit) || 0;
    if (p.type === "supplier") supplierNet += credit - debit;
    else customerNet += debit - credit;
  });
  const round2 = n => Math.round(n * 100) / 100;
  return { customerNet: round2(customerNet), supplierNet: round2(supplierNet) };
}

// Ghi tổng vào initialBalances["131"/"331"] của targetState (chỉ khi tài khoản đã khai báo).
// Trả về true nếu có thay đổi.
function applyPartnerOpeningTotals(targetState) {
  if (!targetState || !targetState.initialBalances || !targetState.partnerOpeningBalances) return false;
  const { customerNet, supplierNet } = computePartnerOpeningTotals(targetState.partners, targetState.partnerOpeningBalances);
  let changed = false;
  const put = (code, net, positiveType, negativeType) => {
    const ib = targetState.initialBalances[code];
    if (!ib) return;
    const type = net >= 0 ? positiveType : negativeType;
    const balance = Math.abs(net);
    if (ib.type === type && Math.abs((Number(ib.balance) || 0) - balance) < 0.005) return;
    targetState.initialBalances[code] = { ...ib, type, balance };
    changed = true;
  };
  put("131", customerNet, "debit", "credit");
  put("331", supplierNet, "credit", "debit");
  return changed;
}

// Dấu vân tay các dữ liệu làm thay đổi tổng 131/331: số dư đầu kỳ từng mã + loại đối tác.
function partnerOpeningTotalsInputKey(st) {
  if (!st) return "";
  const openings = st.partnerOpeningBalances || {};
  const parts = [];
  (st.partners || []).forEach(p => {
    if (!p || !openings[p.id]) return;
    const op = openings[p.id];
    parts.push(JSON.stringify([String(p.id), p.type === "supplier" ? "S" : "C", Number(op.debit) || 0, Number(op.credit) || 0]));
  });
  return parts.sort().join(",");
}

window.computePartnerOpeningTotals = computePartnerOpeningTotals;
window.applyPartnerOpeningTotals = applyPartnerOpeningTotals;
window.partnerOpeningTotalsInputKey = partnerOpeningTotalsInputKey;
window.buildPartnerDebtVoucherStats = buildPartnerDebtVoucherStats;
window.suggestCashAccountFix = suggestCashAccountFix;
window.suggestCashVoucherAccountFixes = suggestCashVoucherAccountFixes;
window.isBankLikePartner = isBankLikePartner;
window.createVoucherPartnerResolver = createVoucherPartnerResolver;
window.compareVouchersForAccounting = compareVouchersForAccounting;
window.getRecalcWatermark = getRecalcWatermark;
window.shouldSkipFullRecalc = shouldSkipFullRecalc;
window.markAccountingValid = markAccountingValid;
window.invalidateAccounting = invalidateAccounting;
window.calculateInventoryValueAt = calculateInventoryValueAt;
