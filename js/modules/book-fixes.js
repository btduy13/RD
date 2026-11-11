/* ==========================================================================
   SỬA SỔ CÓ XÁC NHẬN — trích lương/BHXH bị bỏ sót và số dư đầu kỳ chưa cân.
   Mẫu như computeCashAccountFixSuggestions / applyCashAccountFixes (debts.js): compute chỉ đọc,
   apply cần người dùng không phải "chỉ xem", hỏi xác nhận, bỏ qua kỳ đã khóa sổ, ghi sổ lại, lưu & đồng bộ.
   Không có gì được áp dụng tự động.
   ========================================================================== */

const BF_FOLD = text => String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
const bfRound2 = n => Math.round(n * 100) / 100;
const bfMonthEnd = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const bfReadOnly = () => !!(typeof window !== "undefined" && window.currentUser && window.currentUser.role === "viewer");
const bfLocked = v => typeof isVoucherInLockedPeriod === "function" && isVoucherInLockedPeriod(state, v);
const bfMoney = v => (typeof formatVND === "function" ? formatVND(v) : String(Math.round(v)));
const bfDate = d => (typeof formatDateDisplay === "function" ? formatDateDisplay(d) : d);
const bfEsc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const bfConfirm = (title, message, confirmText) => typeof showConfirmModal === "function"
  ? showConfirmModal({ title, message, confirmText, cancelText: "Hủy bỏ", type: "warning" }) : Promise.resolve(true);

// Ngày mở sổ: ngày chứng từ ghi sổ sớm nhất (báo giá, đơn đặt hàng không ghi sổ).
function getBooksOpeningDate() {
  return (state.vouchers || []).reduce((min, v) => {
    if (!v || !v.date || v.type === "sales_quotation" || v.type === "purchase_order") return min;
    const d = String(v.date).slice(0, 10);
    return !min || d < min ? d : min;
  }, "");
}

// Kỳ nêu trong diễn giải: "T6/2025", "tháng 13 /2025", "t11", "tháng 01", "T1+ tết 2025", "tết 2025".
// Trả về { end, label, kind: "month"|"year" } hoặc null. Tháng không ghi năm: năm của ngày chi, lùi một năm khi tháng
// lớn hơn tháng chi (chi lương T12 vào tháng 1). Lương tháng 13 tính vào tháng 12.
function parseDescribedPeriod(description, payDate) {
  const desc = BF_FOLD(description);
  const payY = Number(String(payDate || "").slice(0, 4)), payM = Number(String(payDate || "").slice(5, 7));
  const mm = desc.match(/(?:^|[^a-z0-9])(?:t|thang)\s*(\d{1,2})(?!\d)(?:\s*\/\s*(\d{4}))?/);
  if (mm) {
    let month = Number(mm[1]);
    if (month >= 1 && month <= 13) {
      let year = mm[2] ? Number(mm[2]) : payY;
      if (!mm[2] && payY && (month === 13 ? payM <= 6 : month > payM)) year -= 1;
      if (year) {
        const label = `${month === 13 ? "tháng 13" : "T" + month}/${year}`;
        if (month === 13) month = 12;
        return { end: bfMonthEnd(year, month), label, kind: "month" };
      }
    }
  }
  const yy = desc.match(/(?:^|[^0-9])(20\d{2})(?![0-9])/);
  if (yy) return { end: `${yy[1]}-12-31`, label: `năm ${yy[1]}`, kind: "year" };
  return null;
}

// Loại khoản chi theo TK Nợ và diễn giải: "salary" | "bonus" | "insurance" | "vat" | null.
// Hoa hồng/trích thầu (quy tắc chuyển 641) và "lương" là tên đường/địa danh ("Lương Thế Vinh", "Đô Lương") không phải lương.
function classifyPayrollPayment(account, description) {
  const acc = String(account ?? "").trim();
  const desc = BF_FOLD(description);
  if (acc === "334") {
    if (/hoa hong|(^|[^a-z])(chi|trich) thau/.test(desc)) return null;
    if (/(^|[^a-z])(chi|tra|thanh toan) (tien )?thuong([^a-z]|$)|thuong tet|(^|[^a-z])li xi([^a-z]|$)/.test(desc)) return "bonus";
    if (/(^|[^a-z])(chi|tra|thanh toan) (tien )?luong([^a-z]|$)|(^|[^a-z])luong (t|thang)\s*\d/.test(desc)) return "salary";
    return null;
  }
  if (acc === "338") return /(^|[^a-z])bh(xh|x|yt|tn)([^a-z]|$)|bao hiem/.test(desc) ? "insurance" : null;
  if (acc === "3331" || acc === "333") {
    // Phiếu gộp thuế với phí vận chuyển/bốc xếp không phải một khoản thuế GTGT phải nộp.
    if (/\+|van chuyen|boc xep|(^|[^a-z0-9])phi([^a-z0-9]|$)|nhap khau|(^|[^a-z])nk([^a-z]|$)/.test(desc)) return null;
    return desc.includes("gtgt") ? "vat" : null;
  }
  return null;
}

// Kỳ của khoản chi so với ngày mở sổ. Không nêu kỳ: lương/BHXH/GTGT (khoản trả theo tháng, hạn nộp tháng sau)
// chi ngay trong tháng mở sổ là của tháng trước ngày mở sổ; khoản thưởng không nêu kỳ thuộc ngày chi.
function resolvePaymentPeriod(v, kind, description, openingDate) {
  const period = parseDescribedPeriod(description, v.date);
  if (period) return { ...period, preOpening: !!openingDate && period.end < openingDate, inferred: false };
  const periodic = kind !== "bonus";
  if (periodic && openingDate && String(v.date || "").slice(0, 7) === openingDate.slice(0, 7)) {
    return { end: "", label: "kỳ trước ngày mở sổ (chi trong tháng mở sổ, không ghi kỳ)", kind: "inferred", preOpening: true, inferred: true };
  }
  return null;
}

const PAYROLL_ACCRUAL_NO_SPLIT = "Chưa tách 10,5% BHXH/BHYT/BHTN phần người lao động (trừ vào lương) vì không có bảng lương";
const payrollAccrualExpenseAccount = () => (isTT99Family(state.accountingStandard) ? "642" : "6422");
const payrollAccrualId = (paymentId, account) => `${account === "338" ? "TBH" : "TL"}-${paymentId}`;

// Quét phiếu chi Nợ 334/338/3331: { rows (đề xuất trích), preOpening (khoản của kỳ trước ngày mở sổ) }.
function scanPayrollPayments() {
  const openingDate = getBooksOpeningDate();
  const accrued = new Set();
  (state.vouchers || []).forEach(v => { if (v && v.accrualFor) accrued.add(String(v.accrualFor)); });
  const ids = new Set((state.vouchers || []).map(v => v && String(v.id)));
  const out = { openingDate, rows: [], preOpening: [] };
  (state.vouchers || []).forEach(v => {
    if (!v || v.type !== "payment" || !Array.isArray(v.entries)) return;
    v.entries.forEach((e, index) => {
      if (!e) return;
      const account = String(e.debit ?? "").trim();
      const description = e.desc || v.description || "";
      const kind = classifyPayrollPayment(account, description);
      const amount = bfRound2(Number(e.amount) || 0);
      if (!kind || !(amount > 0)) return;
      const period = resolvePaymentPeriod(v, kind, description, openingDate);
      const base = { paymentId: v.id, paymentDate: v.date || "", account: kind === "vat" ? "3331" : account, amount, description, kind, period: period ? period.label : "" };
      if (period && period.preOpening) { out.preOpening.push(base); return; }
      if (kind === "vat") return; // thuế GTGT trong kỳ đã có Có 3331 từ hóa đơn bán — không trích
      const suffix = v.entries.length > 1 ? `-${index + 1}` : "";
      const id = payrollAccrualId(v.id, account) + suffix;
      if (accrued.has(String(v.id)) || ids.has(id)) return;
      const date = period && period.kind === "month" && period.end >= (openingDate || "") ? period.end : String(v.date || "").slice(0, 10);
      // Bảng lương của tháng đã ghi sổ (BL-YYYY-MM) thì lương tháng đó đã có Có 334.
      if (kind === "salary" && ids.has(`BL-${date.slice(0, 7)}`)) return;
      out.rows.push({
        ...base, id, date, expenseAccount: payrollAccrualExpenseAccount(),
        reason: `${account === "338" ? "Đã nộp BHXH (Nợ 338)" : "Đã chi lương/thưởng (Nợ 334)"} nhưng chưa có bút toán trích Có ${account}: ghi chi phí bằng số đã chi${date !== String(v.date || "").slice(0, 10) ? `, ngày cuối ${period.label}` : ", ngày chi"}. ${PAYROLL_ACCRUAL_NO_SPLIT}.`
      });
    });
  });
  const byDate = (a, b) => String(a.date || a.paymentDate).localeCompare(String(b.date || b.paymentDate)) || String(a.paymentId).localeCompare(String(b.paymentId));
  // Hai phiếu cùng TK cùng kỳ (vd. nộp BHXH T04/2026 hai lần): vẫn đề xuất theo số đã chi, nhưng đánh dấu để kế toán xem.
  const seen = new Map();
  out.rows.forEach(r => { if (r.kind !== "bonus" && r.period) { const k = `${r.account}|${r.period}`; seen.set(k, (seen.get(k) || 0) + 1); } });
  out.rows.forEach(r => { if (r.kind !== "bonus" && r.period && seen.get(`${r.account}|${r.period}`) > 1) r.warning = `Có hơn một phiếu chi ${r.account} cho ${r.period} — kiểm tra trùng.`; });
  out.rows.sort(byDate);
  out.preOpening.sort(byDate);
  return out;
}

// Đề xuất phiếu kế toán Nợ chi phí quản lý / Có 334 (Có 338) bằng số đã chi. Chỉ đọc.
function computePayrollAccrualSuggestions() {
  return scanPayrollPayments().rows;
}

function buildPayrollAccrualVoucher(r) {
  const what = r.account === "338" ? "Trích BHXH" : r.kind === "bonus" ? "Trích thưởng" : "Trích lương";
  const desc = `${what}${r.period && r.date !== r.paymentDate ? " " + r.period : ""} (theo phiếu chi ${r.paymentId}; ${PAYROLL_ACCRUAL_NO_SPLIT.toLowerCase()})`;
  return {
    id: r.id, type: "general_journal", date: r.date, description: desc,
    amount: r.amount, totalAmount: r.amount, accrualFor: r.paymentId, payrollAccrual: r.account, isManual: true,
    entries: [{ debit: r.expenseAccount, credit: r.account, amount: r.amount, desc }],
    _updatedAt: Date.now(), _sessionId: typeof clientSessionId !== "undefined" ? clientSessionId : ""
  };
}

async function applyPayrollAccrualSuggestions() {
  if (bfReadOnly()) { showToast("Tài khoản chỉ xem không được lập chứng từ.", "error"); return { created: [], skipped: 0 }; }
  const rows = computePayrollAccrualSuggestions();
  if (!rows.length) { showToast("Không còn khoản lương/BHXH nào cần trích.", "info"); return { created: [], skipped: 0 }; }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const ok = await bfConfirm("Trích lương, BHXH bị bỏ sót",
    `Lập ${rows.length} phiếu kế toán Nợ ${payrollAccrualExpenseAccount()} / Có 334 hoặc Có 338, tổng ${bfMoney(total)}, bằng đúng số đã chi trên từng phiếu chi. `
    + `Ngày ghi là ngày cuối tháng nêu trong diễn giải (không nêu thì ngày chi). ${PAYROLL_ACCRUAL_NO_SPLIT}; khi có bảng lương cần lập lại theo bảng lương.`,
    "Lập phiếu trích");
  if (!ok) return { created: [], skipped: 0 };
  const created = [];
  let skipped = 0;
  rows.forEach(r => {
    const v = buildPayrollAccrualVoucher(r);
    if (bfLocked(v)) { skipped++; return; }
    state.vouchers.push(v);
    created.push(v);
  });
  const note = skipped ? ` Bỏ qua ${skipped} phiếu thuộc kỳ đã khóa sổ.` : "";
  if (!created.length) { showToast(note.trim(), "warning"); return { created, skipped }; }
  if (typeof recalculateAccounting === "function") recalculateAccounting(false);
  try {
    if (typeof saveStateAndSyncVoucher === "function") await saveStateAndSyncVoucher();
    else saveState();
  } catch (err) {
    const drop = new Set(created);
    state.vouchers = state.vouchers.filter(v => !drop.has(v));
    if (typeof recalculateAccounting === "function") recalculateAccounting(false);
    console.error("[BookFixes] Lưu phiếu trích lương thất bại:", err);
    showToast("Không lưu được phiếu trích: " + err.message, "error");
    return { created: [], skipped };
  }
  if (typeof logUserAction === "function") {
    logUserAction("Trích lương bị bỏ sót", `Lập ${created.length} phiếu (${bfMoney(created.reduce((s, v) => s + v.amount, 0))}): ${created.slice(0, 30).map(v => `${v.id} ${v.entries[0].debit}/${v.entries[0].credit} ${Math.round(v.amount)}`).join("; ")}${created.length > 30 ? "…" : ""}`);
  }
  showToast(`Đã lập ${created.length} phiếu trích lương/BHXH.${note}`, "success");
  if (typeof markAllTabsDirty === "function") markAllTabsDirty();
  renderPayrollAccrualBlock();
  return { created: created.map(v => v.id), skipped };
}

/* ------------------------- Số dư đầu kỳ chưa cân ------------------------- */

// Tổng dư Nợ / dư Có đầu kỳ như kiểm tra ở Tổng quan (dashboard.js): TT133 đọc 244/344 gộp vào 1386/3386.
function openingBalanceTotals(st = state) {
  const std = st.accountingStandard;
  const codes = new Set(Object.keys(st.initialBalances || {}).filter(code => !isHiddenOpeningAlias(code, std)));
  if (!isTT99Family(std) && typeof TT133_OPENING_ALIASES === "object") Object.keys(TT133_OPENING_ALIASES).forEach(code => codes.add(code));
  let debit = 0, credit = 0;
  codes.forEach(code => {
    const ob = getOpeningBalanceForAccount(st.initialBalances, code, std);
    if (ob.type === "credit") credit += Number(ob.balance) || 0; else debit += Number(ob.balance) || 0;
  });
  return { debit, credit, difference: bfRound2(debit - credit) };
}

const OPENING_PLUG_ACCOUNT = "4211";
const OPENING_PLUG_NOTE = "Đây là số cân đối cho phần số liệu bị thiếu trước ngày mở sổ, không phải số thật; phải thay bằng số thật (vốn góp, vay, lợi nhuận lũy kế…) khi có BCTC năm 2024.";
const openingSigned = code => {
  const ob = (state.initialBalances || {})[code];
  return ob ? (ob.type === "credit" ? -1 : 1) * (Number(ob.balance) || 0) : 0; // + dư Nợ, − dư Có
};

// { difference, lines: [{ account, side, amount, reason, evidence? , before?, after? }] }
// difference = dư Nợ − dư Có đầu kỳ hiện tại. Dòng 334/338/3331: khoản chi sau ngày mở sổ cho kỳ trước (chỉ khi TK chưa có
// số dư đầu kỳ). Phần còn lại vào 4211; 4211 đã có số dư thì điều chỉnh số dư đó (dùng lại được sau các lần sửa khác).
function computeOpeningBalancePlug() {
  const { difference } = openingBalanceTotals();
  const lines = [];
  const scan = scanPayrollPayments();
  const groups = new Map();
  scan.preOpening.forEach(p => {
    const g = groups.get(p.account) || { amount: 0, items: [] };
    g.amount += p.amount;
    g.items.push(p);
    groups.set(p.account, g);
  });
  const label = { "334": "lương phải trả", "338": "BHXH phải nộp", "3331": "thuế GTGT phải nộp" };
  let remaining = difference;
  ["334", "338", "3331"].forEach(account => {
    const g = groups.get(account);
    if (!g || Math.abs(openingSigned(account)) >= 0.005) return;
    const amount = bfRound2(g.amount);
    lines.push({
      account, side: "credit", amount,
      reason: `Nợ đầu kỳ có chứng từ: ${label[account]} kỳ trước ngày mở sổ, đã chi sau ngày mở sổ (${g.items.map(i => `${i.paymentId} ${bfDate(i.paymentDate)} "${i.description}"`).join("; ")}).`,
      evidence: g.items.map(i => i.paymentId)
    });
    remaining = bfRound2(remaining - amount); // ghi thêm dư Có → giảm (dư Nợ − dư Có)
  });
  if (Math.abs(remaining) >= 0.01) {
    const before = openingSigned(OPENING_PLUG_ACCOUNT);
    const after = bfRound2(before - remaining);
    const side = remaining > 0 ? "credit" : "debit";
    lines.push({
      account: OPENING_PLUG_ACCOUNT, side, amount: Math.abs(remaining),
      before: { type: before > 0 ? "debit" : "credit", balance: Math.abs(before) },
      after: { type: after > 0 ? "debit" : "credit", balance: Math.abs(after) },
      reason: `Phần chênh lệch còn lại ghi ${side === "credit" ? "Có" : "Nợ"} TK 4211 (lợi nhuận sau thuế chưa phân phối lũy kế đến cuối năm trước — TT99 ghi điều chỉnh sai sót kỳ trước vào 4211)`
        + `${Math.abs(before) >= 0.005 ? `: điều chỉnh số dư 4211 đang có (${before > 0 ? "dư Nợ" : "dư Có"} ${bfMoney(Math.abs(before))}) thành ${after > 0 ? "dư Nợ" : "dư Có"} ${bfMoney(Math.abs(after))}` : ""}. ${OPENING_PLUG_NOTE}`
    });
  }
  return { difference, openingDate: scan.openingDate, lines };
}

async function applyOpeningBalancePlug() {
  if (bfReadOnly()) { showToast("Tài khoản chỉ xem không được sửa số dư.", "error"); return false; }
  const plug = computeOpeningBalancePlug();
  if (!plug.lines.length) { showToast("Số dư đầu kỳ đã cân, không cần bổ sung.", "info"); return false; }
  // Cùng đường sửa số dư đầu kỳ như các màn hình khác: đã khóa sổ thì chỉ quản trị viên, và phải xác nhận.
  if (typeof confirmOpeningBalanceEdit === "function" && !(await confirmOpeningBalanceEdit())) return false;
  const text = plug.lines.map(l => `${l.side === "credit" ? "Có" : "Nợ"} ${l.account} ${bfMoney(l.amount)}`).join("; ");
  const ok = await bfConfirm("Bổ sung số dư đầu kỳ cho cân",
    `Số dư đầu kỳ đang lệch ${bfMoney(Math.abs(plug.difference))} (dư ${plug.difference > 0 ? "Nợ" : "Có"} lớn hơn). Sẽ ghi: ${text}. `
    + `Các dòng 334/338/3331 có chứng từ chi sau ngày mở sổ cho kỳ trước. Dòng 4211 là số cân đối cho phần số liệu bị thiếu trước ngày mở sổ`
    + `${plug.openingDate ? ` (${bfDate(plug.openingDate)})` : ""}, KHÔNG phải số thật: khi có BCTC năm 2024 phải thay bằng số thật (vốn góp, vay, lợi nhuận lũy kế…). Số dư TK 131/331 không đổi.`,
    "Ghi số dư đầu kỳ");
  if (!ok) return false;
  const snapshot = JSON.parse(JSON.stringify(state.initialBalances || {}));
  state.initialBalances = state.initialBalances || {};
  const names = { "334": "Phải trả người lao động", "338": "Phải trả, phải nộp khác", "3331": "Thuế GTGT phải nộp", "4211": "Lợi nhuận sau thuế chưa phân phối lũy kế đến cuối năm trước" };
  plug.lines.forEach(l => {
    const old = state.initialBalances[l.account];
    const name = (old && old.name) || (typeof getAccountName === "function" && getAccountName(l.account, state.accountingStandard)) || names[l.account];
    const signed = bfRound2(openingSigned(l.account) + (l.side === "debit" ? l.amount : -l.amount));
    state.initialBalances[l.account] = { ...(old || {}), name, type: signed > 0 ? "debit" : "credit", balance: Math.abs(signed) };
  });
  if (typeof recalculateAccounting === "function") recalculateAccounting(false);
  try {
    if (typeof saveStateAndSyncVoucher === "function") await saveStateAndSyncVoucher();
    else saveState();
  } catch (err) {
    state.initialBalances = snapshot;
    if (typeof recalculateAccounting === "function") recalculateAccounting(false);
    console.error("[BookFixes] Lưu số dư đầu kỳ thất bại:", err);
    showToast("Không lưu được số dư đầu kỳ: " + err.message, "error");
    return false;
  }
  if (typeof logUserAction === "function") {
    logUserAction("Sửa số dư đầu kỳ", `Bổ sung số dư đầu kỳ cho cân (lệch ${Math.round(plug.difference)}): ${text}. Số 4211 là số cân đối tạm, thay khi có BCTC 2024.`);
  }
  showToast("Đã ghi số dư đầu kỳ bổ sung. Nhớ thay số 4211 bằng số thật khi có BCTC năm 2024.", "success");
  if (typeof markAllTabsDirty === "function") markAllTabsDirty();
  renderOpeningBalancePlugBanner();
  return true;
}

/* ---------------------------- Giao diện ---------------------------- */

function renderPayrollAccrualBlock() {
  const root = typeof document !== "undefined" && document.getElementById("payroll-accrual-root");
  if (!root) return;
  const scan = scanPayrollPayments();
  const rows = scan.rows;
  const pre = scan.preOpening.filter(p => p.account !== "3331");
  if (!rows.length && !pre.length) { root.innerHTML = ""; return; }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const ro = bfReadOnly() ? " disabled" : "";
  const body = rows.map(r => `<tr><td>${bfEsc(r.id)}</td><td>${bfEsc(bfDate(r.date))}</td><td>${bfEsc(r.paymentId)} (${bfEsc(bfDate(r.paymentDate))})</td>
      <td>${bfEsc(r.description)}${r.warning ? `<div style="color:var(--color-warning,#b45309);font-size:11px;">${bfEsc(r.warning)}</div>` : ""}</td>
      <td>Nợ ${bfEsc(r.expenseAccount)} / Có ${bfEsc(r.account)}</td><td style="text-align:right;">${bfMoney(r.amount)}</td></tr>`).join("");
  root.innerHTML = `<div class="card" id="payroll-accrual-block" style="margin-bottom:16px;"><div class="card-header-bar"><span class="card-title">Lương, BHXH đã chi nhưng chưa trích chi phí</span></div>
    <p style="font-size:12px;opacity:.85;">Các phiếu chi Nợ 334 (lương, thưởng) và Nợ 338 (BHXH) không có bút toán trích Có 334/338 nên hai TK này dư Nợ và chi phí bị thiếu.
      Đề xuất lập phiếu kế toán Nợ ${bfEsc(payrollAccrualExpenseAccount())} / Có 334 (Có 338) bằng đúng số đã chi, ngày cuối tháng nêu trong diễn giải. ${bfEsc(PAYROLL_ACCRUAL_NO_SPLIT)}.
      Hoa hồng/trích thầu không thuộc diện này.</p>
    ${rows.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12px;"><thead><tr><th>Số phiếu trích</th><th>Ngày ghi</th><th>Phiếu chi</th><th>Diễn giải</th><th>Bút toán</th><th style="text-align:right;">Số tiền</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr style="font-weight:600;"><td colspan="5">Tổng ${rows.length} phiếu</td><td style="text-align:right;">${bfMoney(total)}</td></tr></tfoot></table></div>
    <button type="button" class="btn btn-primary btn-sm" data-role-required="write"${ro} style="margin-top:8px;" onclick="applyPayrollAccrualSuggestions()">Lập ${rows.length} phiếu trích</button>` : ""}
    ${pre.length ? `<p style="font-size:12px;margin-top:8px;">Không trích (khoản của kỳ trước ngày mở sổ ${bfEsc(bfDate(scan.openingDate))}, là nợ đầu kỳ — xử lý ở Báo cáo › Số dư đầu kỳ):
      ${pre.map(p => `${bfEsc(p.paymentId)} ${bfEsc(p.description)} ${bfMoney(p.amount)}`).join("; ")}.
      <a href="#" onclick="openOpeningBalancePlug(); return false;">Mở số dư đầu kỳ</a></p>` : ""}
  </div>`;
}

function renderOpeningBalancePlugBanner() {
  const root = typeof document !== "undefined" && document.getElementById("opening-plug-root");
  if (!root) return;
  const plug = computeOpeningBalancePlug();
  if (!plug.lines.length) { root.innerHTML = ""; return; }
  const ro = bfReadOnly() ? " disabled" : "";
  const totals = openingBalanceTotals();
  root.innerHTML = `<div class="card" id="opening-plug-banner" style="margin-bottom:16px;border-left:4px solid var(--color-warning,#b45309);">
    <div class="card-header-bar"><span class="card-title">Số dư đầu kỳ chưa cân: lệch ${bfMoney(Math.abs(plug.difference))}</span></div>
    <p style="font-size:12px;">Dư Nợ đầu kỳ ${bfMoney(totals.debit)} · Dư Có ${bfMoney(totals.credit)}. Phần lệch là số liệu bị thiếu trước ngày mở sổ${plug.openingDate ? ` ${bfEsc(bfDate(plug.openingDate))}` : ""}. Đề xuất ghi số dư đầu kỳ:</p>
    <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12px;"><thead><tr><th>TK</th><th>Bên</th><th style="text-align:right;">Số tiền</th><th>Căn cứ</th></tr></thead>
      <tbody>${plug.lines.map(l => `<tr><td>${bfEsc(l.account)}</td><td>${l.side === "credit" ? "Có" : "Nợ"}</td><td style="text-align:right;">${bfMoney(l.amount)}</td><td>${bfEsc(l.reason)}</td></tr>`).join("")}</tbody></table></div>
    <p style="font-size:12px;color:var(--color-warning,#b45309);">${bfEsc(OPENING_PLUG_NOTE)}</p>
    <button type="button" class="btn btn-primary btn-sm" data-role-required="write"${ro} onclick="applyOpeningBalancePlug()">Ghi số dư đầu kỳ bổ sung</button>
  </div>`;
}

function bfScrollTo(id) {
  const el = typeof document !== "undefined" && document.getElementById(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openPayrollAccrualFixes() {
  if (typeof switchTab === "function") switchTab("payroll");
  renderPayrollAccrualBlock();
  bfScrollTo("payroll-accrual-root");
}

function openOpeningBalancePlug() {
  if (typeof switchTab === "function") switchTab("reports");
  renderOpeningBalancePlugBanner();
  bfScrollTo("opening-plug-root");
}

Object.assign(window, {
  getBooksOpeningDate, parseDescribedPeriod, classifyPayrollPayment, computePayrollAccrualSuggestions, applyPayrollAccrualSuggestions,
  computeOpeningBalancePlug, applyOpeningBalancePlug, openingBalanceTotals, renderPayrollAccrualBlock, renderOpeningBalancePlugBanner,
  openPayrollAccrualFixes, openOpeningBalancePlug
});
