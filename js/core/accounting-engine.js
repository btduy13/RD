/* ==========================================================================
   ACCOUNTING ENGINE — thứ tự ghi sổ, định giá kho, kết chuyển (pure, no DOM)
   ========================================================================== */

// Deterministic voucher order for valuation / allocation (moving-average cost, COGS, FIFO debt).
// Same date -> stock-in before stock-out, then id (string compare),
// so every workstation computes identical figures regardless of array order.
const ACCOUNTING_TYPE_RANK = {
  purchase: 0, sales_return: 0,
  sales: 2, purchase_return: 2,
  period_close: 3 // kết chuyển cuối kỳ đứng sau mọi chứng từ cùng ngày
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

// +1 nhập kho, −1 xuất kho, 0 không đổi tồn.
function stockDirection(type, item) {
  if (type === "purchase" || type === "sales_return") return 1;
  if (type === "sales" || type === "purchase_return") return -1;
  if (type === "inventory_adjust") return item && item.adjustDir === "in" ? 1 : -1;
  return 0;
}

// Số dư đầu kỳ một mặt hàng (initialStock/initialCost do recalculateAccounting chốt).
function stockOpening(p) {
  const stock = Number((Number(p.initialStock) || 0).toFixed(3));
  const avgCost = Number(p.initialCost) || 0;
  return { stock, avgCost, totalValue: stock * avgCost, lastPurchasePrice: p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : avgCost };
}

// Định giá một dòng hàng theo bình quân gia quyền liên hoàn — dùng chung cho recalculateAccounting và
// calculateInventoryValueAt để giá trị kho tại mọi ngày khớp sổ 156. b = { stock, avgCost, totalValue, lastPurchasePrice }.
// Trả về { unit, value, adjust }: value = giá trị dòng (giá vốn khi xuất); adjust = chênh lệch khi lần nhập bù hết tồn âm.
function applyStockItem(b, type, item) {
  const dir = stockDirection(type, item);
  if (!dir || !item) return null;
  const qty = Number(item.qty) || 0;
  const vatInCost = type === "purchase" || type === "purchase_return" ? Number(item.vatInCost) || 0 : 0;
  let unit, value;
  if (type === "purchase") {
    value = (Number(item.amount) || 0) + vatInCost;
    unit = qty ? roundMoney2(value / qty) : Number(item.price) || 0;
    b.lastPurchasePrice = item.price;
  } else {
    if (type === "inventory_adjust") unit = b.avgCost || b.lastPurchasePrice || Number(item.price) || 0;
    else unit = b.avgCost = b.avgCost > 0 ? b.avgCost : (b.lastPurchasePrice || 0);
    value = Math.round(qty * unit);
  }
  const before = b.stock;
  b.stock = Number((before + dir * qty).toFixed(3));
  b.totalValue += dir > 0 ? value : -(value + vatInCost);
  let adjust = 0;
  if (dir > 0 && before < 0 && b.stock >= 0) {
    // Lần nhập bù hết tồn âm: đặt lại theo đơn giá lần nhập; chênh lệch là giá vốn đã xuất âm chưa đúng (632 – 156).
    b.avgCost = unit;
    const reset = Math.round(b.stock * unit);
    adjust = Math.round(b.totalValue - reset);
    b.totalValue = reset;
  } else if (b.stock > 0) {
    b.avgCost = roundMoney2(b.totalValue / b.stock);
  } else if (b.stock === 0) {
    b.totalValue = 0;
  } else if (!(b.avgCost > 0)) {
    b.avgCost = unit; // còn âm: giữ giá trị lũy kế (âm) để sổ 156 khớp kho
  }
  return { unit, value, adjust };
}

// Tồn kho âm không được phép (TT99 TK 156, VAS 02): mã hàng mà chứng từ xuất này làm tồn âm (hoặc âm thêm)
// tại vị trí chứng từ hoặc bất kỳ lúc nào sau đó. st.allowNegativeStock = true tắt kiểm tra.
function findNegativeStockProducts(st, voucher) {
  if (!st || st.allowNegativeStock === true || !voucher || !Array.isArray(voucher.items)) return [];
  const ids = new Set(voucher.items.filter(i => i && stockDirection(voucher.type, i) < 0).map(i => String(i.productId)));
  if (!ids.size) return [];
  const others = (st.vouchers || []).filter(v => v && v.id !== voucher.id);
  // Sửa chứng từ: so với bản đã lưu (thay thế nó), không so với "không có chứng từ" — lưu lại bản cũ không đổi không bị chặn.
  const prev = (st.vouchers || []).find(v => v && v.id === voucher.id);
  const from = prev && compareVouchersForAccounting(prev, voucher) < 0 ? prev : voucher;
  const lowest = ins => {
    const stock = new Map(), low = new Map();
    (st.products || []).forEach(p => { if (p && ids.has(String(p.id))) stock.set(String(p.id), stockOpening(p).stock); });
    const apply = v => (v.items || []).forEach(item => {
      const id = item && String(item.productId);
      if (stock.has(id)) stock.set(id, Number((stock.get(id) + stockDirection(v.type, item) * (Number(item.qty) || 0)).toFixed(3)));
    });
    const mark = () => stock.forEach((s, id) => low.set(id, Math.min(low.has(id) ? low.get(id) : s, s)));
    let started = false;
    (ins ? [...others, ins] : others).sort(compareVouchersForAccounting).forEach(v => {
      if (!started && compareVouchersForAccounting(v, from) >= 0) { started = true; mark(); }
      apply(v);
      if (started) mark();
    });
    if (!started) mark();
    return low;
  };
  const withIt = lowest(voucher), before = lowest(prev);
  return [...withIt.keys()].filter(id => withIt.get(id) < -0.0005 && withIt.get(id) < before.get(id) - 0.0005);
}

// Mã hàng tồn âm cuối ngày `date` (không cho kết chuyển/khóa kỳ khi còn tồn âm).
function negativeStockProductsAt(st, date) {
  const stock = new Map(((st && st.products) || []).filter(Boolean).map(p => [String(p.id), stockOpening(p).stock]));
  ((st && st.vouchers) || []).forEach(v => {
    if (!v || (date && String(v.date || "") > date)) return;
    (v.items || []).forEach(item => {
      const id = item && String(item.productId);
      if (stock.has(id)) stock.set(id, stock.get(id) + stockDirection(v.type, item) * (Number(item.qty) || 0));
    });
  });
  return [...stock].filter(([, s]) => s < -0.0005).map(([id]) => id);
}

function calculateInventoryValueAt(products, vouchers, toDate) {
  const balances = new Map();
  (Array.isArray(products) ? products : []).forEach(product => {
    if (product && product.id !== undefined && product.id !== null) balances.set(String(product.id), stockOpening(product));
  });
  [...(Array.isArray(vouchers) ? vouchers : [])].sort(compareVouchersForAccounting).forEach(voucher => {
    if (!voucher || (toDate && String(voucher.date || "") > toDate) || !Array.isArray(voucher.items)) return;
    voucher.items.forEach(item => {
      const balance = item && balances.get(String(item.productId));
      if (balance) applyStockItem(balance, voucher.type, item);
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
    if (v.type === "sales" && method === "131") {
      s.salesOn131++;
      if (v.date && (!s.firstSale131 || v.date < s.firstSale131)) s.firstSale131 = v.date;
    }
    if (v.type === "purchase" && method === "331") s.purchasesOn331++;
  });
  return stats;
}

// Trả về { from, to, reason } hoặc null. account: TK ghi Có (phiếu thu) / ghi Nợ (phiếu chi).
// date (tùy chọn): ngày phiếu — chỉ tính hóa đơn bán chịu lập từ ngày đó trở về trước.
function suggestCashAccountFix(type, account, description, partner, partnerId, stats, date) {
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
    // Cặp "thu khác Có 131 / chi khác" tất toán khoản khách không trả: xóa nợ khó đòi (chưa lập dự phòng 2293) vào 642.
    if (acc === "341" && !hasLoanWord && /khong thu duoc|kho doi|xoa no/.test(desc)) {
      return fix("642", "Xóa nợ phải thu không thu được: ghi chi phí quản lý (Nợ 642), không phải trả nợ vay 341. Cách đúng: lập Phiếu kế toán xóa nợ (Nợ 2293/642 / Có 131) ở tab Tài sản & dự phòng");
    }
    // Đối tác không còn trong danh mục nên không thể là khoản nợ NCC; trích thầu cho thợ/thầu giới thiệu khách là chi phí bán hàng.
    if (acc === "331" && !partner && /(^|[^a-z])(chi|trich) thau/.test(desc)) {
      return fix("641", "Chi trích thầu (hoa hồng) cho thợ/thầu giới thiệu khách: chi phí bán hàng 641, không phải trả nợ NCC 331");
    }
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
    if (acc === "511" && st.salesOn131 > 0 && !(date && st.firstSale131 && st.firstSale131 > date)) {
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
    const s = suggestCashAccountFix(v.type, e[side], e.desc || v.description, partner, v.partnerId, stats, v.date);
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
  return !isTT99Family(standard) && TT133_OPENING_ALIAS_SOURCES.has(String(code));
}

function getOpeningBalanceForAccount(initialBalances, code, standard) {
  const all = initialBalances || {};
  const key = String(code);
  const primary = all[key];
  const aliasKey = !isTT99Family(standard) ? TT133_OPENING_ALIASES[key] : undefined;
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

// ---------------------------------------------------------------------------
// Thuế GTGT theo từng dòng (C1): item.vatRate (0|5|8|10|"KCT"|"KKKNT") ưu tiên hơn thuế suất chứng từ.
// Thuế tính và làm tròn theo từng nhóm thuế suất; KCT/KKKNT thuế 0 nhưng vẫn theo dõi doanh số.
// Chứng từ cũ (không có item.vatRate) ra đúng một nhóm = round(tổng × v.taxRate%) như trước.
// ---------------------------------------------------------------------------
function vatRateKey(rate) {
  const text = String(rate ?? "").trim().toUpperCase();
  if (text === "KCT" || text === "KKKNT") return text;
  return String(Number(text) || 0);
}

function computeVatBreakdown(items, defaultRate) {
  const breakdown = {};
  let subtotal = 0, tax = 0;
  (items || []).forEach(item => {
    if (!item) return;
    const own = item.vatRate !== undefined && item.vatRate !== null && item.vatRate !== "";
    const key = vatRateKey(own ? item.vatRate : defaultRate);
    const amount = Number(item.amount) || 0;
    (breakdown[key] = breakdown[key] || { base: 0, tax: 0 }).base += amount;
    subtotal += amount;
  });
  Object.keys(breakdown).forEach(key => {
    breakdown[key].tax = Math.round(breakdown[key].base * ((Number(key) || 0) / 100));
    tax += breakdown[key].tax;
  });
  return { breakdown, subtotal, tax };
}

// ---------------------------------------------------------------------------
// Số dư / phát sinh tài khoản trong kỳ [from, to]. match(code) chọn mã (tiền tố hoặc đúng mã).
// from/to rỗng = không giới hạn. "Trước kỳ" = số dư khai báo + phát sinh trước from.
// ---------------------------------------------------------------------------
function sumAccountMovements(st, match, from, to, skipVoucher) {
  let beforeNet = 0, debit = 0, credit = 0;
  const tt133 = !isTT99Family(st && st.accountingStandard);
  const aliasTarget = Object.fromEntries(Object.entries(TT133_OPENING_ALIASES).map(([k, v]) => [v, k]));
  Object.entries((st && st.initialBalances) || {}).forEach(([key, ob]) => {
    // TT133 đọc số dư 244/344 như 1386/3386 (giống getOpeningBalanceForAccount)
    const mapped = tt133 && aliasTarget[key] ? aliasTarget[key] : key;
    if (ob && match(mapped)) beforeNet += (ob.type === "credit" ? -1 : 1) * (Number(ob.balance) || 0);
  });
  ((st && st.vouchers) || []).forEach(v => {
    if (!v || !Array.isArray(v.entries) || (skipVoucher && skipVoucher(v))) return;
    const date = String(v.date || "");
    if (to && date > to) return;
    const before = from && date < from;
    v.entries.forEach(e => {
      if (!e) return;
      const amount = Number(e.amount) || 0;
      if (match(String(e.debit ?? "").trim())) { if (before) beforeNet += amount; else debit += amount; }
      if (match(String(e.credit ?? "").trim())) { if (before) beforeNet -= amount; else credit += amount; }
    });
  });
  return { beforeNet, debit, credit };
}

const roundMoney2 = n => Math.round(n * 100) / 100;

// Gồm TK con theo tiền tố (vd. "112" gồm "1121").
function getAccountTurnover(st, code, from, to) {
  const prefix = String(code ?? "").trim();
  const { beforeNet, debit, credit } = sumAccountMovements(st, c => c.startsWith(prefix), from, to);
  const closeNet = beforeNet + debit - credit;
  return {
    openDebit: roundMoney2(Math.max(beforeNet, 0)), openCredit: roundMoney2(Math.max(-beforeNet, 0)),
    debit: roundMoney2(debit), credit: roundMoney2(credit),
    closeDebit: roundMoney2(Math.max(closeNet, 0)), closeCredit: roundMoney2(Math.max(-closeNet, 0))
  };
}

// ---------------------------------------------------------------------------
// Kết chuyển cuối kỳ — bút toán cho chứng từ period_close ngày `to`, theo thứ tự (B5, xac_minh_truoc_sua.md):
// 1) bù trừ GTGT Nợ 3331 / Có 1331 số nhỏ hơn; 2) 521 → 511 (TT133 không có 521); 3) 511/515/711 → 911;
// 4) 911 → 632/635/641/642/811; 5) 821 → 911; 6) 911 → 4212 (lãi Nợ 911/Có 4212; lỗ Nợ 4212/Có 911).
// Lần kết chuyển đầu tiên của năm (có `from`) còn chuyển số dư 4212 cuối năm trước sang 4211 (B1, TT99 TK 421 điểm e)
// và kết quả năm trước chưa kết chuyển thẳng vào 4211.
// Tính trên số dư lũy kế đến `to` từng mã chi tiết; kết chuyển ngày `to` trở về sau không tính (ghi sổ lại vẫn cùng kết quả).
// ---------------------------------------------------------------------------
const PERIOD_CLOSE_GROUPS = ["521", "511", "515", "711", "632", "635", "641", "642", "811", "821", "911"];
const PERIOD_CLOSE_ORDER = [["511", "515", "711"], ["632", "635", "641", "642", "811"], ["821"]];
const isPeriodCloseCode = c => PERIOD_CLOSE_GROUPS.some(g => c.startsWith(g));

// Số dư (Nợ − Có) lũy kế theo mã chi tiết, cộng dần theo thứ tự ghi sổ: recalculateAccounting sinh mọi kết chuyển
// trong một lượt (quét lại toàn bộ chứng từ cho từng kết chuyển là O(n × số kỳ)).
function createCloseLedger(st) {
  const net = {}, yearStart = {}, closedYears = new Set();
  let year = "", posted = false;
  const add = (code, amount) => { code = String(code ?? "").trim(); if (code) net[code] = (net[code] || 0) + amount; };
  // TT133 đọc số dư khai báo 244/344 như 1386/3386 (giống getOpeningBalanceForAccount)
  const alias = isTT99Family(st && st.accountingStandard) ? {} : Object.fromEntries(Object.entries(TT133_OPENING_ALIASES).map(([k, v]) => [v, k]));
  Object.entries((st && st.initialBalances) || {}).forEach(([key, ob]) => {
    if (ob) add(alias[key] || key, (ob.type === "credit" ? -1 : 1) * (Number(ob.balance) || 0));
  });
  // Số dư trước 01/01 năm y; số dư khai báo coi là lũy kế năm đầu tiên có chứng từ (như các TK kết quả).
  const enterYear = y => { if (y > year) { yearStart[y] = posted ? { ...net } : {}; year = y; } };
  return {
    net,
    post(v) {
      if (!v) return;
      const date = String(v.date || "");
      enterYear(date.slice(0, 4));
      posted = true;
      if (v.type === "period_close") closedYears.add(date.slice(0, 4));
      (Array.isArray(v.entries) ? v.entries : []).forEach(e => {
        if (!e) return;
        const amount = Number(e.amount) || 0;
        add(e.debit, amount); add(e.credit, -amount);
      });
    },
    close(from, to) {
      const y = String(to || "").slice(0, 4);
      enterYear(y);
      const prior = from && !closedYears.has(y) ? yearStart[y] || {} : null;
      const sumOf = (map, test) => roundMoney2(Object.keys(map).filter(test).reduce((sum, c) => sum + map[c], 0));
      const entries = [];
      const push = (debit, credit, amount, desc) => {
        const value = roundMoney2(amount);
        if (value > 0) entries.push({ debit, credit, amount: value, desc });
      };
      const prior4212 = prior ? sumOf(prior, c => c.startsWith("4212")) : 0;
      if (prior4212 < 0) push("4212", "4211", -prior4212, "Kết chuyển lợi nhuận sau thuế năm trước sang TK 4211");
      else if (prior4212 > 0) push("4211", "4212", prior4212, "Kết chuyển lỗ năm trước sang TK 4211");

      const vatIn = sumOf(net, c => c.startsWith("1331"));
      const vatOut = -sumOf(net, c => c.startsWith("3331"));
      if (vatIn > 0 && vatOut > 0) push("3331", "1331", Math.min(vatIn, vatOut), "Khấu trừ thuế GTGT đầu vào với đầu ra");

      const nets = {};
      Object.keys(net).filter(isPeriodCloseCode).forEach(c => { nets[c] = roundMoney2(net[c]); });
      // 521 → 511 (521 dư Nợ: Nợ 511 / Có 521)
      Object.keys(nets).filter(c => c.startsWith("521")).sort().forEach(c => {
        if (nets[c] > 0) push("511", c, nets[c], "Kết chuyển các khoản giảm trừ doanh thu");
        else push(c, "511", -nets[c], "Kết chuyển các khoản giảm trừ doanh thu");
        nets["511"] = roundMoney2((nets["511"] || 0) + nets[c]);
        delete nets[c];
      });
      let result = 0; // Có 911 − Nợ 911 (dương = lãi)
      Object.keys(nets).filter(c => c.startsWith("911")).forEach(c => { result -= nets[c]; });
      PERIOD_CLOSE_ORDER.forEach(group => Object.keys(nets).filter(c => group.some(g => c.startsWith(g))).sort().forEach(c => {
        const n = nets[c];
        if (n < 0) push(c, "911", -n, `Kết chuyển TK ${c} sang TK 911`);
        else if (n > 0) push("911", c, n, `Kết chuyển TK ${c} sang TK 911`);
        result -= n;
      }));
      const priorResult = prior ? -sumOf(prior, isPeriodCloseCode) : 0;
      result = roundMoney2(result - priorResult);
      if (priorResult > 0) push("911", "4211", priorResult, "Kết chuyển lãi sau thuế năm trước");
      else if (priorResult < 0) push("4211", "911", -priorResult, "Kết chuyển lỗ năm trước");
      if (result > 0) push("911", "4212", result, "Kết chuyển lãi sau thuế");
      else if (result < 0) push("4212", "911", -result, "Kết chuyển lỗ");
      return entries;
    }
  };
}

function buildPeriodCloseEntries(st, from, to) {
  const ledger = createCloseLedger(st);
  ((st && st.vouchers) || [])
    .filter(v => v && Array.isArray(v.entries) && !(to && String(v.date || "") > to) && !(v.type === "period_close" && String(v.date || "") >= String(to || "")))
    .sort(compareVouchersForAccounting)
    .forEach(v => ledger.post(v));
  return ledger.close(from, to);
}

// Khóa sổ (Luật Kế toán Đ26, TT99 Đ13): chứng từ ngày ≤ st.lockedThrough không được thêm, sửa, xóa.
// Chỉ chặn thao tác người dùng — recalculateAccounting vẫn tính lại trường suy diễn của kỳ đã khóa.
// Báo giá, đơn đặt hàng không ghi sổ nên không bị khóa.
const UNPOSTED_VOUCHER_TYPES = ["sales_quotation", "purchase_order"];
function isVoucherInLockedPeriod(st, v) {
  const lock = String((st && st.lockedThrough) || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lock) || !v || !v.date || UNPOSTED_VOUCHER_TYPES.includes(v.type)) return false;
  return String(v.date).slice(0, 10) <= lock;
}

// NĐ 181/2025 Đ26.2.g (sửa bởi NĐ 144/2026): hóa đơn mua chịu (Có 331) từ ngưỡng tiền mặt (gồm thuế) đến khi
// trả bằng tiền mặt (Có 111) thì thuế GTGT đầu vào tương ứng phần trả tiền mặt không được khấu trừ, điều chỉnh
// giảm vào kỳ thanh toán. Chỉ liệt kê để cảnh báo, không tự ghi sổ. Tất toán FIFO theo NCC như recalculateAccounting.
// shortcut: bỏ qua phiếu chi Nợ 331 cho đối tác vai trò khách (recalc đọc thành 131) — hiếm, chỉ làm lệch cảnh báo.
function getNonDeductibleCashSettlements(st) {
  const resolvePid = createVoucherPartnerResolver(st && st.partners);
  const openingCredit = Object.create(null);
  ((st && st.partners) || []).forEach(p => {
    const op = p && p.type === "supplier" && ((st.partnerOpeningBalances || {})[p.id]);
    if (op) openingCredit[p.id] = Math.max((Number(op.credit) || 0) - (Number(op.debit) || 0), 0);
  });
  const invoices = Object.create(null), advances = Object.create(null), out = [];
  const record = (inv, pay, amount) => {
    const v = inv.v, rule = typeof getTaxRule === "function" ? getTaxRule("vat.cashThreshold", v.date) : null;
    const total = Number(v.totalAmount) || 0, tax = Number(v.taxAmount) || 0;
    if (!rule || total < rule.value || !(tax > 0) || v.vatNonDeductible) return;
    out.push({ paymentId: pay.id, paymentDate: pay.date, purchaseId: v.id, partnerId: inv.pid, amount, vat: Math.round(tax * amount / total) });
  };
  // Trả trước rồi mới có hóa đơn: phần trả trước bằng tiền mặt cũng là trả tiền mặt cho hóa đơn đó.
  const settle = (queue, amount, onUse) => {
    let left = amount;
    while (left > 0 && queue.length) {
      const used = Math.min(queue[0].remaining, left);
      queue[0].remaining -= used;
      left -= used;
      if (used > 0) onUse(queue[0], used);
      if (queue[0].remaining <= 0) queue.shift();
    }
    return left;
  };
  ((st && st.vouchers) || []).filter(v => v && Array.isArray(v.entries)).sort(compareVouchersForAccounting).forEach(v => {
    const pid = resolvePid(v);
    if (!pid) return;
    const invQ = invoices[pid] || (invoices[pid] = []), advQ = advances[pid] || (advances[pid] = []);
    if (v.type === "purchase") {
      const credit = v.entries.reduce((s, e) => s + (e && String(e.credit || "").startsWith("331") ? Number(e.amount) || 0 : 0), 0);
      if (!(credit > 0)) return;
      const inv = { v, pid, remaining: credit };
      inv.remaining = settle(advQ, credit, (adv, used) => { if (adv.cash) record(inv, adv.v, used); });
      if (inv.remaining > 0) invQ.push(inv);
      return;
    }
    v.entries.forEach(e => {
      if (!e || !String(e.debit || "").startsWith("331")) return;
      const cash = String(e.credit || "").startsWith("111");
      let left = Number(e.amount) || 0;
      const fromOpening = Math.min(openingCredit[pid] || 0, left);
      openingCredit[pid] = (openingCredit[pid] || 0) - fromOpening;
      left = settle(invQ, left - fromOpening, (inv, used) => { if (cash) record(inv, v, used); });
      if (left > 0) advQ.push({ v, cash, remaining: left });
    });
  });
  return out;
}

window.computeVatBreakdown = computeVatBreakdown;
window.getAccountTurnover = getAccountTurnover;
window.buildPeriodCloseEntries = buildPeriodCloseEntries;
window.createCloseLedger = createCloseLedger;
window.computePartnerOpeningTotals = computePartnerOpeningTotals;
window.applyPartnerOpeningTotals = applyPartnerOpeningTotals;
window.partnerOpeningTotalsInputKey = partnerOpeningTotalsInputKey;
window.buildPartnerDebtVoucherStats = buildPartnerDebtVoucherStats;
window.suggestCashAccountFix = suggestCashAccountFix;
window.suggestCashVoucherAccountFixes = suggestCashVoucherAccountFixes;
window.isBankLikePartner = isBankLikePartner;
window.createVoucherPartnerResolver = createVoucherPartnerResolver;
window.compareVouchersForAccounting = compareVouchersForAccounting;
window.calculateInventoryValueAt = calculateInventoryValueAt;
window.findNegativeStockProducts = findNegativeStockProducts;
window.negativeStockProductsAt = negativeStockProductsAt;
window.isVoucherInLockedPeriod = isVoucherInLockedPeriod;
window.getNonDeductibleCashSettlements = getNonDeductibleCashSettlements;
