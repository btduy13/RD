/* ==========================================================================
   VOUCHER FILTERS — Pure filter helpers (UI-agnostic)
   ========================================================================== */

function filterVouchersByType(vouchers, type) {
  if (!Array.isArray(vouchers)) return [];
  if (!type) return vouchers.slice();
  return vouchers.filter((v) => v && v.type === type);
}

function filterVouchersByDateRange(vouchers, fromDate, toDate) {
  if (!Array.isArray(vouchers)) return [];
  return vouchers.filter((v) => {
    if (!v) return false;
    if (fromDate && v.date < fromDate) return false;
    if (toDate && v.date > toDate) return false;
    return true;
  });
}

function sortVouchersDesc(vouchers) {
  return vouchers.slice().sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (db !== da) return db.localeCompare(da);
    return String(b.id || "").localeCompare(String(a.id || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

window.filterVouchersByType = filterVouchersByType;
window.filterVouchersByDateRange = filterVouchersByDateRange;
window.sortVouchersDesc = sortVouchersDesc;
