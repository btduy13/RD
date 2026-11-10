// Dự phòng nợ phải thu khó đòi (TK 2293) và xóa nợ theo TT 48/2019 (sửa bởi TT 24/2022, hiệu lực đến 31/12/2026).
// Trích lập chỉ tại ngày lập BCTC năm; tuổi nợ tính từ hạn thanh toán; bù trừ phải trả cùng đối tượng (Điều 6 k3g).

const PROVISION_BANDS = [
  { months: 36, rate: 100, label: "Từ 3 năm" },
  { months: 24, rate: 70, label: "2 – dưới 3 năm" },
  { months: 12, rate: 50, label: "1 – dưới 2 năm" },
  { months: 6, rate: 30, label: "6 tháng – dưới 1 năm" }
];
const WRITE_OFF_REASONS = {
  closed: { label: "Phá sản / giải thể / ngừng hoạt động", deductible: true },
  person: { label: "Cá nhân chết / mất tích / bị truy cứu", deductible: true },
  full3y: { label: "Đã trích 100% đủ 3 năm chưa thu được", deductible: true },
  other: { label: "Khác (không đủ điều kiện TT 48 — chi phí không được trừ)", deductible: false }
};
const provisionUi = { date: "", creditDays: null, writeOffDate: "", openingDate: "" };

const provDate = (iso, months, days) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + (months || 0), d + (days || 0))).toISOString().slice(0, 10);
};
// Năm tài chính gần nhất đã kết thúc (mặc định ngày trích lập).
const lastYearEnd = () => `${Number(getLocalDateString().slice(0, 4)) - 1}-12-31`;
const provisionExpenseAccount = () => isTT99Family(state.accountingStandard) ? "6426" : "642";
// Công nợ theo đối tác đến ngày; bỏ nhóm "chưa khớp đối tác" (không phải một đối tượng nợ).
const partnerDebtsAt = date => calculatePartnerDebts("", date).filter(d => d && d.id && d.type !== "unmatched");
const isProvisionVoucher =(v, year) => v && v.type === "general_journal" && v.provisionYear && (year === undefined || v.provisionYear === year);

// Số dư Có 2293 đến ngày (skip: bỏ qua chứng từ, vd. phiếu trích lập đang tính lại).
function provisionBalance2293(date, skip) {
  const m = sumAccountMovements(state, c => c === "2293", "", date, skip);
  return -(m.beforeNet + m.debit - m.credit);
}

// Ngày số dư đầu kỳ mặc định: ngày chứng từ sớm nhất trong sổ.
const earliestVoucherDate = () => (state.vouchers || []).reduce((m, v) => v && v.date && (!m || String(v.date) < m) ? String(v.date) : m, "");

// Bảng tính trích lập tại ngày date. creditDays: số ngày được nợ khi chứng từ không có hạn thanh toán.
// openingDate: phần nợ không khớp hóa đơn Nợ 131 nào là số dư đầu kỳ, tính tuổi từ ngày này.
function computeDoubtfulDebtProvision(date, creditDays = 0, openingDate = "") {
  creditDays = Math.max(Number(creditDays) || 0, 0);
  openingDate = openingDate || earliestVoucherDate();
  const debts = partnerDebtsAt(date);
  const resolvePid = createVoucherPartnerResolver(state.partners);
  const invoices = new Map();
  state.vouchers.forEach(v => {
    if (!v || !Array.isArray(v.entries) || String(v.date || "") > date) return;
    const amount = v.entries.reduce((s, e) => s + (e && String(e.debit ?? "").startsWith("131") ? Number(e.amount) || 0 : 0), 0);
    if (amount <= 0) return;
    const pid = resolvePid(v);
    if (!invoices.has(pid)) invoices.set(pid, []);
    invoices.get(pid).push({ id: v.id, date: v.date, amount });
  });
  const evidence = state.provisionEvidence || {};
  const rows = [];
  debts.forEach(d => {
    const gross = Number(d.kpiReceivable) || 0;
    if (gross <= 0) return;
    const payable = Number(d.kpiPayable) || 0;
    const net = Math.max(gross - payable, 0);
    // FIFO: tiền thu đã trừ hóa đơn cũ nhất, nên số còn nợ thuộc các hóa đơn mới nhất.
    let left = gross;
    const byRate = new Map();
    (invoices.get(d.id) || []).sort((a, b) => b.date.localeCompare(a.date)).forEach(inv => {
      if (left <= 0) return;
      const open = Math.min(inv.amount, left);
      left -= open;
      const due = provDate(inv.date, 0, creditDays);
      const band = PROVISION_BANDS.find(b => provDate(due, b.months) <= date);
      if (band) byRate.set(band.rate, (byRate.get(band.rate) || 0) + open);
    });
    let opening = null;
    if (left > 0 && openingDate) {
      const band = PROVISION_BANDS.find(b => provDate(provDate(openingDate, 0, creditDays), b.months) <= date);
      opening = { amount: left, from: openingDate, rate: band ? band.rate : 0 };
      if (band) byRate.set(band.rate, (byRate.get(band.rate) || 0) + left);
      left = 0;
    }
    if (!byRate.size) return;
    // TT48 k3g: trích trên số sau bù trừ, phân bổ tỷ lệ theo từng nhóm tuổi nợ (ví dụ 30 − 10 → 1 + 5 + 4,67 triệu).
    const factor = gross ? net / gross : 0;
    const bands = PROVISION_BANDS.filter(b => byRate.has(b.rate)).map(b => {
      const amount = Math.round(byRate.get(b.rate) * factor);
      return { rate: b.rate, label: b.label, gross: byRate.get(b.rate), amount, provision: Math.round(amount * b.rate / 100) };
    });
    rows.push({
      partnerId: d.id, name: d.name, gross, payable, net, undated: left, opening, bands,
      provision: bands.reduce((s, b) => s + b.provision, 0), evidence: !!evidence[d.id]
    });
  });
  rows.sort((a, b) => b.provision - a.provision);
  const required = rows.reduce((s, r) => s + r.provision, 0);
  const deductible = rows.filter(r => r.evidence).reduce((s, r) => s + r.provision, 0);
  return { date, creditDays, openingDate, rows, required, deductible, nonDeductible: required - deductible };
}

// Phiếu kế toán trích lập/hoàn nhập năm: chỉ ghi phần chênh lệch giữa số phải trích và số dư 2293 (TT48 k3).
function buildProvisionVoucher(date, creditDays = 0, openingDate = "") {
  const year = Number(String(date).slice(0, 4));
  const calc = computeDoubtfulDebtProvision(date, creditDays, openingDate);
  const current = provisionBalance2293(date, v => isProvisionVoucher(v, year));
  const diff = calc.required - current;
  const exp = provisionExpenseAccount();
  const desc = diff >= 0 ? `Trích lập dự phòng nợ phải thu khó đòi năm ${year}` : `Hoàn nhập dự phòng nợ phải thu khó đòi năm ${year}`;
  const amount = Math.abs(diff);
  const provisionByPartner = {};
  calc.rows.forEach(r => { if (r.provision) provisionByPartner[r.partnerId] = r.provision; });
  return {
    calc, current, diff,
    voucher: {
      type: "general_journal", date, provisionYear: year, provisionCreditDays: calc.creditDays, provisionOpeningDate: calc.openingDate, provisionByPartner,
      description: desc, amount, totalAmount: amount,
      entries: amount ? [diff > 0 ? { debit: exp, credit: "2293", amount, desc } : { debit: "2293", credit: exp, amount, desc }] : []
    }
  };
}

// Dự phòng đã trích cho riêng đối tác còn dùng được tại ngày xóa nợ.
function partnerProvisionAvailable(partnerId, date) {
  const last = state.vouchers.filter(v => isProvisionVoucher(v) && String(v.date) <= date).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!last) return 0;
  const used = (state.writtenOffDebts || []).filter(w => w.partnerId === partnerId && String(w.date) >= String(last.date))
    .reduce((s, w) => s + (Number(w.provisionUsed) || 0), 0);
  const own = Math.max((Number((last.provisionByPartner || {})[partnerId]) || 0) - used, 0);
  return Math.min(own, Math.max(provisionBalance2293(date), 0));
}

// Xóa nợ: Nợ 2293 (tối đa dự phòng của đối tác) + Nợ 642 (phần thiếu) / Có 131 — không qua quỹ (TT48 k4c).
function buildWriteOffVoucher(partnerId, date, reasonKey) {
  const d = partnerDebtsAt(date).find(x => String(x.id) === String(partnerId));
  const amount = d ? Math.round(Number(d.kpiReceivable) || 0) : 0;
  const reason = WRITE_OFF_REASONS[reasonKey];
  if (!amount || !reason) return null;
  const provisionUsed = Math.min(partnerProvisionAvailable(partnerId, date), amount);
  const desc = `Xóa nợ phải thu khó đòi ${d.name || partnerId}: ${reason.label}`;
  const entries = [];
  if (provisionUsed) entries.push({ debit: "2293", credit: "131", amount: provisionUsed, desc });
  if (amount > provisionUsed) entries.push({ debit: provisionExpenseAccount(), credit: "131", amount: amount - provisionUsed, desc });
  return {
    voucher: { type: "general_journal", date, partnerId, partnerName: d.name || "", writeOff: true, description: desc, amount, totalAmount: amount, entries },
    record: { partnerId, partnerName: d.name || "", amount, provisionUsed, date, reason: reasonKey, deductible: reason.deductible }
  };
}

// Thu tiền sau ngày xóa nợ: phải ghi Có 711 (thu nhập khác, chịu thuế — NĐ 320 Điều 3).
function findReceiptsAfterWriteOff() {
  const list = state.writtenOffDebts || [];
  if (!list.length) return [];
  const resolvePid = createVoucherPartnerResolver(state.partners);
  return state.vouchers.filter(v => v && v.type === "receipt").map(v => {
    const pid = resolvePid(v);
    const w = list.find(x => x.partnerId === pid && String(v.date || "") > String(x.date));
    if (!w) return null;
    const on711 = (v.entries || []).some(e => e && String(e.credit ?? "").startsWith("711"));
    return on711 ? null : { id: v.id, date: v.date, partnerId: pid, partnerName: w.partnerName, amount: Number(v.amount) || 0 };
  }).filter(Boolean);
}

const provisionReadOnly = () => !!(window.currentUser && window.currentUser.role === "viewer");
const provConfirm = (title, message) => typeof showConfirmModal === "function"
  ? showConfirmModal({ title, message, confirmText: "Đồng ý", cancelText: "Hủy bỏ", type: "warning" }) : Promise.resolve(confirm(message));

// Thêm/thay chứng từ, ghi sổ lại, lưu & đồng bộ; lỗi thì hoàn tác (mẫu applyCashAccountFixes / phiếu kế toán).
async function saveProvisionVoucher(voucher, matches, after) {
  const idx = matches ? state.vouchers.findIndex(matches) : -1;
  const old = idx >= 0 ? state.vouchers[idx] : null;
  if (typeof blockLockedPeriodEdit === "function" && blockLockedPeriodEdit(voucher, old)) return;
  const id = voucher.id || (old ? old.id : await getCloudSafeVoucherId({ prefix: "PKT", fallbackBase: 0 }));
  const next = { ...(old || {}), ...voucher, id, isManual: true, _updatedAt: Math.max(Date.now(), (Number(old && old._updatedAt) || 0) + 1) };
  if (typeof clientSessionId !== "undefined") next._sessionId = clientSessionId;
  const snapshot = { evidence: state.provisionEvidence, writtenOff: state.writtenOffDebts };
  if (old) state.vouchers[idx] = next; else state.vouchers.push(next);
  // Phiếu trích lập bản cũ mang số PKT: thay bằng DP-YYYY, tombstone số cũ để máy khác cũng xóa.
  const tomb = old && old.id !== id && typeof trackDeletedIds === "function" ? trackDeletedIds([old.id], "voucher") : null;
  if (after) after(next);
  try {
    recalculateAccounting(false);
    const synced = await saveStateAndSyncVoucher();
    showToast(synced ? `Đã lưu phiếu kế toán ${id}.` : `Đã lưu phiếu kế toán ${id} trên máy này, đang chờ đồng bộ.`, synced ? "success" : "warning");
  } catch (err) {
    const at = state.vouchers.indexOf(next);
    if (at >= 0) { if (old) state.vouchers[at] = old; else state.vouchers.splice(at, 1); }
    if (tomb && typeof rollbackTrackedDeletedIds === "function") rollbackTrackedDeletedIds(tomb);
    state.provisionEvidence = snapshot.evidence;
    state.writtenOffDebts = snapshot.writtenOff;
    recalculateAccounting(false);
    console.error("[Provisions] Lưu phiếu kế toán thất bại:", err);
    showToast("Không thể lưu phiếu kế toán: " + err.message, "danger");
  }
  if (typeof refreshUI === "function") refreshUI();
  renderProvisionsTab();
}

async function applyProvisionEntry() {
  if (provisionReadOnly()) { showToast("Tài khoản chỉ xem không được lập chứng từ.", "error"); return; }
  const { voucher, calc, current, diff } = buildProvisionVoucher(provisionUi.date, provisionUi.creditDays, provisionUi.openingDate);
  const exists = state.vouchers.some(v => isProvisionVoucher(v, voucher.provisionYear));
  if (!diff && !exists) { showToast(`Số dư 2293 đã bằng số phải trích (${formatVND(calc.required)}).`, "info"); return; }
  const line = voucher.entries[0];
  const msg = `${exists ? "Cập nhật" : "Lập"} phiếu kế toán ngày ${formatDateDisplay(voucher.date)}: phải trích ${formatVND(calc.required)}, `
    + `số dư 2293 hiện có ${formatVND(current)}. ${line ? `Nợ ${line.debit} / Có ${line.credit} ${formatVND(line.amount)}.` : "Không cần bút toán."}`;
  if (!(await provConfirm("Trích lập dự phòng nợ khó đòi", msg))) return;
  // Số phiếu cố định theo năm (như BL- của bảng lương): hai máy cùng trích một năm ghi đè nhau thay vì nhân đôi.
  const id = `DP-${voucher.provisionYear}`;
  const hasOwn = state.vouchers.some(v => v && v.id === id);
  await saveProvisionVoucher({ ...voucher, id }, v => hasOwn ? v.id === id : isProvisionVoucher(v, voucher.provisionYear));
}

async function applyDebtWriteOff() {
  if (provisionReadOnly()) { showToast("Tài khoản chỉ xem không được lập chứng từ.", "error"); return; }
  const pid = (document.getElementById("prov-wo-partner") || {}).value || "";
  const reason = (document.getElementById("prov-wo-reason") || {}).value || "";
  const date = (document.getElementById("prov-wo-date") || {}).value || "";
  if (!pid || !reason || !date) { showToast("Chọn đối tác, lý do xóa nợ theo TT 48 và ngày.", "warning"); return; }
  const built = buildWriteOffVoucher(pid, date, reason);
  if (!built) { showToast("Đối tác không còn nợ phải thu tại ngày này.", "warning"); return; }
  const { voucher, record } = built;
  const msg = `Xóa nợ ${record.partnerName}: ${formatVND(record.amount)} (Nợ 2293 ${formatVND(record.provisionUsed)}, Nợ ${provisionExpenseAccount()} ${formatVND(record.amount - record.provisionUsed)} / Có 131). `
    + (record.deductible ? "Cần lưu biên bản Hội đồng xử lý nợ, quyết định xóa nợ và chứng cứ theo TT 48." : "Lý do không thuộc TT 48: phần chi phí KHÔNG được trừ khi tính thuế TNDN.");
  if (!(await provConfirm("Xóa nợ phải thu khó đòi", msg))) return;
  await saveProvisionVoucher(voucher, null, saved => {
    state.writtenOffDebts = [...(state.writtenOffDebts || []), { ...record, voucherId: saved.id }];
  });
}

async function toggleProvisionEvidence(partnerId, checked) {
  if (provisionReadOnly()) return;
  state.provisionEvidence = { ...(state.provisionEvidence || {}), [partnerId]: !!checked };
  if (!checked) delete state.provisionEvidence[partnerId];
  saveState();
  renderProvisionsTab();
}

function setProvisionUi(field, value) {
  provisionUi[field] = field === "creditDays" ? Math.max(Number(value) || 0, 0) : value;
  renderProvisionsTab();
}

function renderProvisionsTab() {
  const root = document.getElementById("provisions-root");
  if (!root) return;
  const esc = escapeHtmlText;
  const money = v => formatVND(v);
  if (!provisionUi.date) provisionUi.date = lastYearEnd();
  if (!provisionUi.writeOffDate) provisionUi.writeOffDate = getLocalDateString();
  const year = Number(provisionUi.date.slice(0, 4));
  const booked = state.vouchers.find(v => isProvisionVoucher(v, year));
  if (provisionUi.creditDays === null) provisionUi.creditDays = booked ? Number(booked.provisionCreditDays) || 0 : 0;
  if (!provisionUi.openingDate) provisionUi.openingDate = (booked && booked.provisionOpeningDate) || earliestVoucherDate();
  const { voucher, calc, current, diff } = buildProvisionVoucher(provisionUi.date, provisionUi.creditDays, provisionUi.openingDate);
  const ro = provisionReadOnly() ? " disabled" : "";
  const rows = calc.rows.flatMap(r => r.bands.map((b, i) => `<tr>
      <td>${i ? "" : esc(r.name || r.partnerId)}${!i && r.opening ? `<div class="text-muted" style="font-size:11px;">Số dư đầu kỳ (từ ${esc(formatDateDisplay(r.opening.from))}): ${money(r.opening.amount)}</div>` : ""}</td>
      <td class="text-right font-numeric">${i ? "" : money(r.gross)}</td>
      <td class="text-right font-numeric">${i ? "" : money(r.payable)}</td>
      <td>${esc(b.label)}</td><td class="text-right font-numeric">${money(b.amount)}</td>
      <td class="text-right">${b.rate}%</td><td class="text-right font-numeric">${money(b.provision)}</td>
      <td style="text-align:center;">${i ? "" : `<input type="checkbox" aria-label="Có hồ sơ TT 48" ${r.evidence ? "checked" : ""}${ro}
        onchange="toggleProvisionEvidence(${esc(JSON.stringify(String(r.partnerId)))}, this.checked)">`}</td></tr>`)).join("");
  const reg = state.writtenOffDebts || [];
  const late = findReceiptsAfterWriteOff();
  const debtors = partnerDebtsAt(provisionUi.writeOffDate).filter(d => d.kpiReceivable > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "vi"));
  root.innerHTML = `
  <div class="card"><div class="card-header"><h3 class="card-title">Dự phòng nợ phải thu khó đòi (TK 2293)</h3></div>
    <p class="text-muted">Theo TT 48/2019/TT-BTC (sửa bởi TT 24/2022), hiệu lực đến 31/12/2026. Trích lập tại ngày lập BCTC năm; mỗi khoản nợ cần hợp đồng/cam kết nợ,
      biên bản đối chiếu hoặc công văn đòi nợ có bằng chứng gửi. Chỉ khách hàng tích "Có hồ sơ" được tính vào chi phí được trừ.</p>
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:end;">
      <label>Ngày trích lập <input type="date" class="form-control" value="${esc(provisionUi.date)}" onchange="setProvisionUi('date', this.value)"></label>
      <label>Số ngày được nợ <input type="number" min="0" class="form-control" value="${provisionUi.creditDays}" onchange="setProvisionUi('creditDays', this.value)"></label>
      <label>Ngày số dư đầu kỳ <input type="date" class="form-control" value="${esc(provisionUi.openingDate)}" onchange="setProvisionUi('openingDate', this.value)"></label>
    </div>
    <p class="text-muted">Giả định: chứng từ không lưu hạn thanh toán, nên hạn = ngày hóa đơn + ${provisionUi.creditDays} ngày. Tiền thu trừ vào hóa đơn cũ nhất (FIFO); phần nợ không có hóa đơn là số dư đầu kỳ, tính tuổi từ ngày số dư đầu kỳ.
      Số dư phải trả cùng đối tượng (Dư Có 331) được bù trừ, phân bổ theo tỷ lệ. Chưa áp dụng thang nhanh cho bán lẻ trả góp (TT 48 k2b).</p>
    <div class="table-responsive"><table class="table"><thead><tr><th>Đối tượng</th><th class="text-right">Phải thu</th><th class="text-right">Phải trả bù trừ</th>
      <th>Thời gian quá hạn</th><th class="text-right">Số nợ sau bù trừ</th><th class="text-right">Tỷ lệ</th><th class="text-right">Dự phòng</th><th>Có hồ sơ</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="text-muted">Không có khoản nợ quá hạn từ 6 tháng tại ngày ${esc(formatDateDisplay(calc.date))}.</td></tr>`}</tbody></table></div>
    <p>Phải trích: <b>${money(calc.required)}</b> (được trừ: ${money(calc.deductible)}; không được trừ: ${money(calc.nonDeductible)}).
      Số dư 2293 hiện có: ${money(current)}. ${diff > 0 ? `Trích thêm ${money(diff)}` : diff < 0 ? `Hoàn nhập ${money(-diff)}` : "Không chênh lệch"}.
      ${booked ? `Đã có phiếu ${esc(booked.id)} cho năm ${year} — lập lại sẽ cập nhật phiếu này.` : ""}</p>
    <button type="button" class="btn btn-primary btn-sm" data-role-required="write"${ro} onclick="applyProvisionEntry()">Lập bút toán trích lập</button>
    <span class="text-muted">${voucher.entries[0] ? `Nợ ${voucher.entries[0].debit} / Có ${voucher.entries[0].credit}` : ""}</span>
  </div>
  <div class="card" style="margin-top:16px;"><div class="card-header"><h3 class="card-title">Xóa nợ phải thu khó đòi</h3></div>
    <p class="text-muted">Bút toán Nợ 2293 (tối đa dự phòng đã trích cho đối tượng) + Nợ ${provisionExpenseAccount()} (phần thiếu) / Có 131, không qua quỹ.
      Cần biên bản Hội đồng xử lý nợ, quyết định xóa nợ và chứng cứ theo TT 48 Điều 6 k4.</p>
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:end;">
      <label>Đối tượng <select id="prov-wo-partner" class="form-control"><option value="">— Chọn —</option>
        ${debtors.map(d => `<option value="${esc(d.id)}">${esc(d.name || d.id)} — ${money(d.kpiReceivable)}</option>`).join("")}</select></label>
      <label>Lý do <select id="prov-wo-reason" class="form-control"><option value="">— Chọn lý do TT 48 —</option>
        ${Object.entries(WRITE_OFF_REASONS).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join("")}</select></label>
      <label>Ngày <input type="date" id="prov-wo-date" class="form-control" value="${esc(provisionUi.writeOffDate)}" onchange="setProvisionUi('writeOffDate', this.value)"></label>
      <button type="button" class="btn btn-danger btn-sm" data-role-required="write"${ro} onclick="applyDebtWriteOff()">Xóa nợ</button>
    </div>
    <h4 style="margin-top:16px;">Sổ theo dõi nợ đã xóa (theo dõi tối thiểu 10 năm)</h4>
    <div class="table-responsive"><table class="table"><thead><tr><th>Ngày</th><th>Đối tượng</th><th class="text-right">Số tiền</th><th class="text-right">Dùng dự phòng</th>
      <th>Lý do</th><th>Chi phí được trừ</th><th>Phiếu</th></tr></thead><tbody>
      ${reg.map(w => `<tr><td>${esc(formatDateDisplay(w.date))}</td><td>${esc(w.partnerName || w.partnerId)}</td><td class="text-right font-numeric">${money(w.amount)}</td>
        <td class="text-right font-numeric">${money(w.provisionUsed || 0)}</td><td>${esc((WRITE_OFF_REASONS[w.reason] || {}).label || w.reason)}</td>
        <td>${w.deductible ? "Có" : "Không"}</td><td>${esc(w.voucherId || "")}</td></tr>`).join("") || `<tr><td colspan="7" class="text-muted">Chưa có khoản nợ nào đã xóa.</td></tr>`}
    </tbody></table></div>
    ${late.map(r => `<p style="color:var(--color-warning);">Phiếu thu ${esc(r.id)} ngày ${esc(formatDateDisplay(r.date))} của ${esc(r.partnerName || r.partnerId)} (${money(r.amount)}) sau ngày xóa nợ:
      nên ghi Có 711 (thu nhập khác) thay vì Có 131.</p>`).join("")}
  </div>`;
}

Object.assign(window, {
  computeDoubtfulDebtProvision, buildProvisionVoucher, buildWriteOffVoucher, partnerProvisionAvailable, findReceiptsAfterWriteOff,
  applyProvisionEntry, applyDebtWriteOff, toggleProvisionEvidence, setProvisionUi, renderProvisionsTab
});
