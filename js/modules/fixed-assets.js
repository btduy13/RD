/* ==========================================================================
   TÀI SẢN CỐ ĐỊNH & CCDC (TT45/2013, sửa đổi TT147/2016, TT28/2017) — renderFixedAssetsTab() vào #fixed-assets-root
   state.fixedAssets: [{ id, name, kind "tscd"|"ccdc", group, assetAccount (211x/213x/242), expenseAccount,
                         cost, startDate "YYYY-MM" (tháng đưa vào sử dụng), months, sourceVoucherIds[], disposedDate?, note, _updatedAt }]
   Trích khấu hao: MỘT phiếu general_journal mỗi tháng (depMonth), Nợ TK chi phí / Có 2141 (213x → 2143, CCDC → 242).
   ========================================================================== */

let fixedAssetsUi = { editingId: null, draft: null, picked: [], runMonth: "" };

const FA_MIN_TSCD_COST = 30000000; // TT45 Điều 3: nguyên giá từ 30 triệu, thời gian sử dụng trên 1 năm
const FA_CCDC_MAX_MONTHS = 36; // phân bổ CCDC/chi phí trả trước tối đa 3 năm (thuế TNDN)
// Khung thời gian trích khấu hao (năm), TT45 Phụ lục I — chỉ các nhóm hay dùng.
const FA_FRAMES = {
  vehicle: { label: "Phương tiện vận tải đường bộ", min: 6, max: 10 },
  office: { label: "Thiết bị, dụng cụ quản lý", min: 3, max: 8 },
  machinery: { label: "Máy móc, thiết bị", min: 5, max: 15 },
  building: { label: "Nhà cửa, vật kiến trúc", min: 6, max: 50 },
  other: { label: "Khác (không kiểm tra khung)" }
};

const faEsc = v => escapeHtmlText(v);
const faNum = v => formatVNDNoSymbol(Math.round(Number(v) || 0));
const faEl = id => document.getElementById(id);
const faMonthLabel = m => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

function faMonthAdd(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function faEnsureState() {
  if (!Array.isArray(state.fixedAssets)) state.fixedAssets = [];
}

function faCanEdit() {
  if (window.currentUser && window.currentUser.role === "viewer") {
    showToast("Tài khoản chỉ xem không được sửa tài sản.", "error");
    return false;
  }
  return true;
}

function faDefaultExpenseAccount(std = state.accountingStandard) {
  return typeof isTT99Family === "function" && isTT99Family(std) ? "6424" : "6422";
}

function faCreditAccount(a) {
  if (a.kind === "ccdc") return a.assetAccount || "242";
  return /^(213|2113)/.test(String(a.assetAccount || "")) ? "2143" : "2141"; // TT133: TSCĐ vô hình là 2113
}

// Lịch phân bổ đường thẳng theo tháng, bắt đầu từ tháng đưa vào sử dụng.
// Dùng floor (không round) để phần dư tháng cuối không bao giờ âm; chênh tối đa (months-1) đồng.
function faSchedule(a) {
  const cost = Math.round(Number(a.cost) || 0);
  const months = Math.max(1, parseInt(a.months, 10) || 1);
  const start = String(a.startDate || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || cost <= 0) return [];
  const per = Math.floor(cost / months);
  const stop = a.disposedDate ? String(a.disposedDate).slice(0, 7) : null; // thôi trích từ tháng sau tháng ghi giảm
  const rows = [];
  for (let i = 0; i < months; i++) {
    const month = faMonthAdd(start, i);
    if (stop && month > stop) break;
    rows.push({ month, amount: i === months - 1 ? cost - per * (months - 1) : per });
  }
  return rows;
}

function faAmountForMonth(a, month) {
  const row = faSchedule(a).find(r => r.month === month);
  return row ? row.amount : 0;
}

// Lũy kế và giá trị còn lại đến hết tháng chứa `date`.
function faBookValue(a, date) {
  const month = String(date || "").slice(0, 7);
  const accumulated = faSchedule(a).filter(r => r.month <= month).reduce((s, r) => s + r.amount, 0);
  const cost = Math.round(Number(a.cost) || 0);
  return { cost, accumulated, net: cost - accumulated };
}

function faWarnings(a) {
  const w = [];
  const months = parseInt(a.months, 10) || 0;
  if (a.kind === "tscd" && Number(a.cost) < FA_MIN_TSCD_COST) w.push("Nguyên giá dưới 30 triệu: không đủ điều kiện TSCĐ (TT45 Điều 3), nên ghi nhận là CCDC/TK 242.");
  if (a.kind === "ccdc" && months > FA_CCDC_MAX_MONTHS) w.push("CCDC/chi phí trả trước phân bổ tối đa 36 tháng khi tính thuế TNDN.");
  const f = FA_FRAMES[a.group];
  if (a.kind === "tscd" && f && f.min && (months < f.min * 12 || months > f.max * 12)) {
    w.push(`${f.label}: khung khấu hao ${f.min}–${f.max} năm (${f.min * 12}–${f.max * 12} tháng) theo TT45 Phụ lục I.`);
  }
  if (a.kind === "tscd" && !/^21[13]/.test(String(a.assetAccount || ""))) w.push("TSCĐ phải ghi ở TK 211/213.");
  if (a.kind === "ccdc" && !String(a.assetAccount || "").startsWith("242")) w.push("CCDC/chi phí trả trước phân bổ ghi ở TK 242.");
  return w;
}

function faIsDepVoucher(v) {
  return v && v.type === "general_journal" && !!v.depMonth;
}

/* ---------------------------- Nhận từ chứng từ ---------------------------- */

// Dòng chứng từ ghi Nợ 211/213/242 chưa gắn với tài sản nào (mua trả nhiều đợt → chọn nhiều phiếu gộp một tài sản).
function faCandidateLines() {
  faEnsureState();
  const used = new Set(state.fixedAssets.flatMap(a => a.sourceVoucherIds || []));
  const rows = [];
  (state.vouchers || []).forEach(v => {
    if (!v || faIsDepVoucher(v) || used.has(v.id)) return;
    const lines = (v.entries || []).filter(e => e && /^(21[13]|242)/.test(String(e.debit || "").trim()) && Number(e.amount) > 0);
    if (!lines.length) return;
    rows.push({
      voucherId: v.id, date: v.date || "", account: String(lines[0].debit).trim(),
      amount: lines.reduce((s, e) => s + Number(e.amount), 0),
      desc: lines[0].desc || v.description || ""
    });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.voucherId).localeCompare(String(b.voucherId)));
}

function faDraftFromLines(lines) {
  const last = lines[lines.length - 1];
  const ccdc = last.account.startsWith("242");
  const vehicle = /xe|ô tô|oto/i.test(lines.map(l => l.desc).join(" "));
  const group = ccdc ? "other" : vehicle ? "vehicle" : "other";
  return {
    name: lines[0].desc, kind: ccdc ? "ccdc" : "tscd", group, assetAccount: lines[0].account,
    expenseAccount: faDefaultExpenseAccount(), cost: lines.reduce((s, l) => s + l.amount, 0),
    // Đưa vào sử dụng sau đợt thanh toán cuối; kế toán sửa theo biên bản bàn giao.
    startDate: last.date.slice(0, 7), months: ccdc ? FA_CCDC_MAX_MONTHS : vehicle ? 72 : 60,
    sourceVoucherIds: lines.map(l => l.voucherId), note: ""
  };
}

function toggleFixedAssetPick(voucherId, on) {
  fixedAssetsUi.picked = fixedAssetsUi.picked.filter(id => id !== voucherId);
  if (on) fixedAssetsUi.picked.push(voucherId);
}

function createFixedAssetFromPicked() {
  if (!faCanEdit()) return;
  const lines = faCandidateLines().filter(l => fixedAssetsUi.picked.includes(l.voucherId));
  if (!lines.length) { showToast("Chọn ít nhất một chứng từ.", "warning"); return; }
  fixedAssetsUi.editingId = "";
  fixedAssetsUi.draft = faDraftFromLines(lines);
  fixedAssetsUi.picked = [];
  renderFixedAssetsTab();
}

/* ---------------------------- Danh mục ---------------------------- */

// Mã duy nhất giữa các máy (max+1 cục bộ thì hai máy cùng sinh TS010).
function faNextId() {
  return `TS${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function editFixedAsset(id) {
  fixedAssetsUi.editingId = id;
  fixedAssetsUi.draft = null;
  renderFixedAssetsTab();
}

function faForm(a) {
  const v = a || fixedAssetsUi.draft || { kind: "tscd", group: "other", assetAccount: "211", expenseAccount: faDefaultExpenseAccount(), cost: 0, startDate: getLocalDateString().slice(0, 7), months: 60, note: "" };
  const opt = (val, cur, label) => `<option value="${val}"${val === cur ? " selected" : ""}>${label}</option>`;
  return `<form onsubmit="saveFixedAsset(event)" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin:8px 0;padding:8px;border:1px solid var(--border-color,#ddd);border-radius:6px;">
    <label>Tên tài sản<input id="fa-name" class="form-control" required value="${faEsc(v.name || "")}"></label>
    <label>Loại<select id="fa-kind" class="form-control">${opt("tscd", v.kind, "TSCĐ (khấu hao)")}${opt("ccdc", v.kind, "CCDC / chi phí trả trước (242)")}</select></label>
    <label>Nhóm (khung TT45)<select id="fa-group" class="form-control">${Object.entries(FA_FRAMES).map(([k, f]) => opt(k, v.group, f.label)).join("")}</select></label>
    <label>TK tài sản<input id="fa-asset-acc" class="form-control" required value="${faEsc(v.assetAccount || "")}"></label>
    <label>TK chi phí<input id="fa-exp-acc" class="form-control" required value="${faEsc(v.expenseAccount || "")}"></label>
    <label>Nguyên giá / giá trị phân bổ<input id="fa-cost" type="number" min="1" class="form-control" required value="${Number(v.cost) || 0}"></label>
    <label>Tháng đưa vào sử dụng<input id="fa-start" type="month" class="form-control" required value="${faEsc(v.startDate || "")}"></label>
    <label>Số tháng khấu hao/phân bổ<input id="fa-months" type="number" min="1" class="form-control" required value="${parseInt(v.months, 10) || 1}"></label>
    <label>Ngày ghi giảm (thanh lý)<input id="fa-disposed" type="date" class="form-control" value="${faEsc(v.disposedDate || "")}"></label>
    <label>Ghi chú<input id="fa-note" class="form-control" value="${faEsc(v.note || "")}"></label>
    <div style="grid-column:1/-1;font-size:12px;opacity:.8;">${(v.sourceVoucherIds || []).length ? `Chứng từ gốc: ${faEsc(v.sourceVoucherIds.join(", "))}` : ""}</div>
    <div style="display:flex;gap:8px;align-items:end;"><button type="submit" class="btn btn-primary" data-role-required="write">Lưu</button><button type="button" class="btn btn-secondary" onclick="editFixedAsset(null)">Hủy</button></div>
  </form>`;
}

function saveFixedAsset(ev) {
  ev.preventDefault();
  if (!faCanEdit()) return;
  faEnsureState();
  const existing = state.fixedAssets.find(a => a.id === fixedAssetsUi.editingId);
  const values = {
    name: faEl("fa-name").value.trim(), kind: faEl("fa-kind").value, group: faEl("fa-group").value,
    assetAccount: faEl("fa-asset-acc").value.trim(), expenseAccount: faEl("fa-exp-acc").value.trim(),
    cost: Math.round(Number(faEl("fa-cost").value) || 0), startDate: faEl("fa-start").value,
    months: parseInt(faEl("fa-months").value, 10) || 0, disposedDate: faEl("fa-disposed").value || "", note: faEl("fa-note").value.trim()
  };
  const std = state.accountingStandard;
  const bad = [values.assetAccount, values.expenseAccount].find(c => typeof isValidAccount === "function" && !isValidAccount(c, std));
  if (bad) { showToast(`TK "${bad}" không có trong danh mục tài khoản.`, "error"); return; }
  if (!(values.cost > 0) || !(values.months > 0) || !/^\d{4}-\d{2}$/.test(values.startDate)) {
    showToast("Nhập nguyên giá, tháng bắt đầu và số tháng hợp lệ.", "error");
    return;
  }
  const asset = Object.assign(existing || { id: faNextId(), sourceVoucherIds: (fixedAssetsUi.draft && fixedAssetsUi.draft.sourceVoucherIds) || [] }, values, { _updatedAt: Date.now() });
  if (!existing) state.fixedAssets.push(asset);
  fixedAssetsUi.editingId = null;
  fixedAssetsUi.draft = null;
  saveState();
  const w = faWarnings(asset);
  showToast(w.length ? `Đã lưu. Lưu ý: ${w[0]}` : "Đã lưu tài sản.", w.length ? "warning" : "success");
  renderFixedAssetsTab();
}

async function deleteFixedAsset(id) {
  if (!faCanEdit()) return;
  if ((state.vouchers || []).some(v => faIsDepVoucher(v) && (v.entries || []).some(e => e.assetId === id))) {
    showToast("Tài sản đã trích khấu hao — hãy ghi giảm (ngày thanh lý) thay vì xóa.", "warning");
    return;
  }
  if (!await showConfirmModal({ title: "Xóa tài sản", message: `Xóa tài sản ${id}?`, confirmText: "Xóa" })) return;
  state.fixedAssets = state.fixedAssets.filter(a => a.id !== id);
  if (typeof trackDeletedIds === "function") trackDeletedIds([id], "fixedAsset");
  saveState();
  renderFixedAssetsTab();
}

/* ---------------------------- Trích khấu hao ---------------------------- */

function faDepEntries(month) {
  return state.fixedAssets.map(a => ({ a, amount: faAmountForMonth(a, month) })).filter(x => x.amount > 0).map(({ a, amount }) => ({
    debit: a.expenseAccount || faDefaultExpenseAccount(), credit: faCreditAccount(a), amount,
    desc: `${a.kind === "ccdc" ? "Phân bổ" : "Khấu hao"} ${a.name} tháng ${faMonthLabel(month)}`, assetId: a.id
  }));
}

// Tháng cần trích: tháng chọn (luôn lập lại) + các tháng trước chưa có phiếu khi catchUp.
function faMonthsToPost(toMonth, catchUp) {
  if (!catchUp) return [toMonth];
  const starts = state.fixedAssets.map(a => String(a.startDate || "").slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  if (!starts.length) return [toMonth];
  const posted = new Set(state.vouchers.filter(faIsDepVoucher).map(v => v.depMonth));
  const out = [];
  for (let m = starts[0]; m <= toMonth; m = faMonthAdd(m, 1)) {
    if (m === toMonth || (!posted.has(m) && faDepEntries(m).length)) out.push(m);
  }
  return out;
}

// Lập (hoặc thay) phiếu khấu hao cho từng tháng; tháng không còn số liệu thì xóa phiếu cũ.
async function postFixedAssetDepreciation(toMonth, catchUp = false) {
  if (!faCanEdit()) return { posted: [], removed: [] };
  faEnsureState();
  if (!/^\d{4}-\d{2}$/.test(toMonth || "")) { showToast("Chọn tháng trích khấu hao.", "warning"); return { posted: [], removed: [] }; }
  const posted = [], removed = [];
  let lockedHit = false;
  for (const month of faMonthsToPost(toMonth, catchUp)) {
    const entries = faDepEntries(month);
    const old = state.vouchers.find(v => v && v.id === `KH-${month}`) || state.vouchers.find(v => faIsDepVoucher(v) && v.depMonth === month);
    const [y, m] = month.split("-").map(Number);
    const date = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    // Khóa sổ: tháng bù thuộc kỳ đã khóa thì bỏ qua lặng lẽ; tháng đang chọn thì báo cho người dùng.
    if (typeof isVoucherInLockedPeriod === "function" && [{ type: "general_journal", date }, old].some(x => isVoucherInLockedPeriod(state, x))) {
      if (month === toMonth && typeof blockLockedPeriodEdit === "function") lockedHit = blockLockedPeriodEdit({ type: "general_journal", date }, old);
      continue;
    }
    if (!entries.length) {
      if (old) {
        state.vouchers = state.vouchers.filter(v => v !== old);
        if (typeof trackDeletedIds === "function") trackDeletedIds([old.id], "voucher");
        removed.push(old.id);
      }
      continue;
    }
    // Số phiếu cố định theo tháng (như BL- của bảng lương): hai máy cùng trích một tháng ghi đè nhau thay vì nhân đôi.
    const id = `KH-${month}`;
    const v = {
      ...(old || {}),
      id,
      type: "general_journal", depMonth: month,
      date,
      description: `Trích khấu hao TSCĐ, phân bổ CCDC tháng ${faMonthLabel(month)}`,
      amount: entries.reduce((s, e) => s + e.amount, 0), entries, isManual: true,
      _updatedAt: Math.max(Date.now(), old ? (Number(old._updatedAt) || 0) + 1 : 0),
      _sessionId: typeof clientSessionId !== "undefined" ? clientSessionId : ""
    };
    if (old && old.id !== id) {
      // Phiếu PKT cũ (bản trước) → thay bằng KH-YYYY-MM, tombstone số cũ để máy khác cũng xóa.
      state.vouchers = state.vouchers.filter(x => x !== old);
      if (typeof trackDeletedIds === "function") trackDeletedIds([old.id], "voucher");
      state.vouchers.push(v);
    } else if (old) state.vouchers[state.vouchers.indexOf(old)] = v;
    else state.vouchers.push(v);
    posted.push(v.id);
  }
  if (!posted.length && !removed.length) { if (!lockedHit) showToast("Không có tài sản nào cần trích trong kỳ.", "info"); return { posted, removed }; }
  recalculateAccounting(false);
  try {
    const cloudCommitted = await saveStateAndSyncVoucher();
    showToast(`Đã lập ${posted.length} phiếu khấu hao${removed.length ? `, xóa ${removed.length} phiếu trống` : ""}${cloudCommitted ? "." : " (đang chờ đồng bộ)."}`, cloudCommitted ? "success" : "warning");
  } catch (err) {
    console.error("[FixedAssets] Ghi sổ khấu hao thất bại:", err);
    showToast("Không lưu được phiếu khấu hao: " + err.message, "error");
  }
  if (typeof logUserAction === "function") logUserAction("Trích khấu hao", `Tháng ${toMonth}${catchUp ? " (bù các tháng thiếu)" : ""}: ${posted.join(", ")}`);
  if (typeof markAllTabsDirty === "function") markAllTabsDirty();
  if (faEl("fixed-assets-root")) renderFixedAssetsTab();
  return { posted, removed };
}

function runFixedAssetDepreciation(catchUp) {
  const month = (faEl("fa-run-month") || {}).value || fixedAssetsUi.runMonth;
  fixedAssetsUi.runMonth = month;
  return postFixedAssetDepreciation(month, catchUp);
}

/* ---------------------------- Render ---------------------------- */

function renderFixedAssetsTab() {
  const root = faEl("fixed-assets-root");
  if (!root) return;
  faEnsureState();
  if (!fixedAssetsUi.runMonth) fixedAssetsUi.runMonth = getLocalDateString().slice(0, 7);
  const runMonth = fixedAssetsUi.runMonth;
  const asOf = new Date(Date.UTC(Number(runMonth.slice(0, 4)), Number(runMonth.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const btn = (label, onclick, cls = "btn-secondary", write = true) => `<button class="btn ${cls}"${write ? ' data-role-required="write"' : ""} onclick="${onclick}">${label}</button>`;
  const editing = fixedAssetsUi.editingId;

  const rows = state.fixedAssets.map(a => {
    const bv = faBookValue(a, asOf);
    const warn = faWarnings(a);
    return `<tr${a.disposedDate ? ' style="opacity:.55;"' : ""}>
      <td>${faEsc(a.id)}</td><td>${faEsc(a.name)}${warn.length ? `<div style="color:var(--danger-color,#c0392b);font-size:11px;">${warn.map(faEsc).join("<br>")}</div>` : ""}</td>
      <td>${a.kind === "ccdc" ? "CCDC" : "TSCĐ"}</td><td>${faEsc(a.assetAccount)} → ${faEsc(a.expenseAccount)}</td>
      <td>${faEsc(a.startDate ? faMonthLabel(a.startDate) : "")}</td><td style="text-align:right;">${parseInt(a.months, 10) || 0}</td>
      <td style="text-align:right;">${faNum(bv.cost)}</td><td style="text-align:right;">${faNum(faAmountForMonth(a, runMonth))}</td>
      <td style="text-align:right;">${faNum(bv.accumulated)}</td><td style="text-align:right;">${faNum(bv.net)}</td>
      <td>${faEsc((a.sourceVoucherIds || []).join(", "))}</td>
      <td style="white-space:nowrap;">${btn("Sửa", `editFixedAsset('${escapeHtmlAttr(a.id)}')`)} ${btn("Xóa", `deleteFixedAsset('${escapeHtmlAttr(a.id)}')`)}</td></tr>`;
  }).join("");

  const cands = faCandidateLines();
  const candRows = cands.map(l => `<tr><td><input type="checkbox"${fixedAssetsUi.picked.includes(l.voucherId) ? " checked" : ""} onchange="toggleFixedAssetPick('${escapeHtmlAttr(l.voucherId)}', this.checked)" aria-label="Chọn ${faEsc(l.voucherId)}"></td>
    <td>${faEsc(l.voucherId)}</td><td>${faEsc(formatDateDisplay(l.date))}</td><td>${faEsc(l.account)}</td><td style="text-align:right;">${faNum(l.amount)}</td><td>${faEsc(l.desc)}</td></tr>`).join("");

  const depVouchers = state.vouchers.filter(faIsDepVoucher).sort((a, b) => b.depMonth.localeCompare(a.depMonth)).slice(0, 24);

  root.innerHTML = `
  <div class="card"><div class="card-header-bar"><span class="card-title">Sổ tài sản cố định & CCDC</span>
      ${btn("Thêm tài sản", "editFixedAsset('')", "btn-primary")}</div>
    ${editing !== null ? faForm(state.fixedAssets.find(a => a.id === editing)) : ""}
    <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12px;">
      <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>TK tài sản → chi phí</th><th>Bắt đầu</th><th>Số tháng</th><th>Nguyên giá</th><th>Khấu hao tháng ${faEsc(faMonthLabel(runMonth))}</th><th>Lũy kế</th><th>Còn lại</th><th>Chứng từ gốc</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="12" style="text-align:center;">Chưa có tài sản</td></tr>'}</tbody></table></div>
    <p style="font-size:12px;opacity:.8;">Khấu hao đường thẳng theo tháng từ tháng đưa vào sử dụng (TT45/2013); tháng cuối nhận phần dư. TSCĐ hữu hình ghi Có 2141, vô hình (213) Có 2143, CCDC Có 242.</p>
  </div>
  <div class="card" style="margin-top:16px;"><div class="card-header-bar"><span class="card-title">Trích khấu hao / phân bổ</span>
      <span><input id="fa-run-month" type="month" class="form-control" style="display:inline-block;width:auto;" value="${faEsc(runMonth)}" onchange="fixedAssetsUi.runMonth=this.value;renderFixedAssetsTab()">
      ${btn(`Trích khấu hao tháng ${faEsc(faMonthLabel(runMonth))}`, "runFixedAssetDepreciation(false)", "btn-primary")}
      ${btn("Trích bù các tháng còn thiếu", "runFixedAssetDepreciation(true)")}</span></div>
    <p style="font-size:12px;opacity:.8;">Mỗi tháng một phiếu kế toán; chạy lại cùng tháng sẽ lập lại phiếu đó theo sổ tài sản hiện tại.</p>
    ${depVouchers.length ? `<table class="data-table" style="width:100%;font-size:12px;"><thead><tr><th>Tháng</th><th>Số phiếu</th><th>Số tiền</th></tr></thead><tbody>
      ${depVouchers.map(v => `<tr><td>${faEsc(faMonthLabel(v.depMonth))}</td><td>${faEsc(v.id)}</td><td style="text-align:right;">${faNum(v.amount)}</td></tr>`).join("")}</tbody></table>` : "<p>Chưa trích khấu hao tháng nào.</p>"}
  </div>
  <div class="card" style="margin-top:16px;"><div class="card-header-bar"><span class="card-title">Tạo từ chứng từ ghi Nợ 211/213/242</span>
      ${btn("Tạo tài sản từ chứng từ đã chọn", "createFixedAssetFromPicked()", "btn-primary")}</div>
    <p style="font-size:12px;opacity:.8;">Mua trả nhiều đợt: chọn tất cả các phiếu của cùng một tài sản để gộp nguyên giá.</p>
    <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12px;">
      <thead><tr><th></th><th>Chứng từ</th><th>Ngày</th><th>TK Nợ</th><th>Số tiền</th><th>Diễn giải</th></tr></thead>
      <tbody>${candRows || '<tr><td colspan="6" style="text-align:center;">Không còn chứng từ chưa ghi sổ tài sản</td></tr>'}</tbody></table></div>
  </div>`;
}

Object.assign(window, {
  fixedAssetsUi, renderFixedAssetsTab, editFixedAsset, saveFixedAsset, deleteFixedAsset, toggleFixedAssetPick, createFixedAssetFromPicked,
  postFixedAssetDepreciation, runFixedAssetDepreciation,
  faSchedule, faBookValue, faWarnings, faCandidateLines, faDraftFromLines, faMonthsToPost
});
