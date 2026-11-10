/* ==========================================================================
   PHÂN HỆ TIỀN LƯƠNG & THUẾ TNCN — renderPayrollTab() vào #payroll-root
   state.employees: [{ id, name, taxCode, idNo, dept "admin"|"sales", region "I"–"IV", dependants,
                       resident, foreign, casual, shortContract, partTime, insSalary, baseSalary, active, _updatedAt }]
   state.payrolls:  [{ id = period "YYYY-MM", period, payDate, locked, voucherId,
                       lines: [{ employeeId, name, dept, gross, allowancesTaxFree, ...computePayslip }], _updatedAt }]
   ========================================================================== */

let payrollUi = { editingEmployeeId: null, period: "", quarter: "", year: "" };

const prEsc = v => escapeHtmlText(v);
const prNum = v => formatVNDNoSymbol(Math.round(Number(v) || 0));
const prEl = id => document.getElementById(id);

function payrollCanEdit() {
  if (window.currentUser && window.currentUser.role === "viewer") {
    showToast("Tài khoản chỉ xem không được sửa dữ liệu lương.", "error");
    return false;
  }
  return true;
}

function payrollEnsureState() {
  if (!Array.isArray(state.employees)) state.employees = [];
  if (!Array.isArray(state.payrolls)) state.payrolls = [];
}

// Bảng HTML từ mảng 2 chiều (dòng đầu là tiêu đề); số được định dạng, chuỗi được escape.
function prTable(aoa, extraStyle = "") {
  const [head, ...rows] = aoa;
  const cell = v => typeof v === "number" ? `<td style="text-align:right;">${prNum(v)}</td>` : `<td>${prEsc(v)}</td>`;
  return `<table class="data-table" style="width:100%;font-size:12px;${extraStyle}"><thead><tr>${head.map(h => `<th>${prEsc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(cell).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" style="text-align:center;">Không có dữ liệu</td></tr>`}</tbody></table>`;
}

/* ---------------------------- Nhân viên ---------------------------- */

function payrollEmployeeForm(e) {
  const v = e || { id: `NV${String(state.employees.length + 1).padStart(3, "0")}`, dept: "admin", region: "I", dependants: 0, resident: true, active: true, insSalary: 0, baseSalary: 0 };
  const opt = (val, cur, label) => `<option value="${val}"${val === cur ? " selected" : ""}>${label}</option>`;
  const chk = (id, on, label) => `<label><input type="checkbox" id="${id}"${on ? " checked" : ""}> ${label}</label>`;
  return `<form onsubmit="savePayrollEmployee(event)" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin:8px 0;padding:8px;border:1px solid var(--border-color,#ddd);border-radius:6px;">
    <label>Mã NV<input id="pe-id" class="form-control" required value="${escapeHtmlText(v.id)}"${e ? " readonly" : ""}></label>
    <label>Họ tên<input id="pe-name" class="form-control" required value="${escapeHtmlText(v.name || "")}"></label>
    <label>MST cá nhân<input id="pe-taxCode" class="form-control" value="${escapeHtmlText(v.taxCode || "")}"></label>
    <label>CCCD/Hộ chiếu<input id="pe-idNo" class="form-control" value="${escapeHtmlText(v.idNo || "")}"></label>
    <label>Bộ phận<select id="pe-dept" class="form-control">${opt("admin", v.dept, "Quản lý (642)")}${opt("sales", v.dept, "Bán hàng (641)")}</select></label>
    <label>Vùng lương tối thiểu<select id="pe-region" class="form-control">${["I", "II", "III", "IV"].map(r => opt(r, v.region, "Vùng " + r)).join("")}</select></label>
    <label>Số người phụ thuộc<input id="pe-dependants" type="number" min="0" class="form-control" value="${Number(v.dependants) || 0}"></label>
    <label>Lương đóng BH<input id="pe-insSalary" type="number" min="0" class="form-control" value="${Number(v.insSalary) || 0}"></label>
    <label>Lương cơ bản (gợi ý bảng lương)<input id="pe-baseSalary" type="number" min="0" class="form-control" value="${Number(v.baseSalary) || 0}"></label>
    <div style="display:flex;flex-direction:column;gap:4px;">${chk("pe-resident", v.resident !== false, "Cá nhân cư trú")}${chk("pe-foreign", v.foreign, "Lao động nước ngoài (không BHTN)")}${chk("pe-casual", v.casual, "Không HĐLĐ / HĐ dưới 1 tháng (khấu trừ 10%, không BH)")}${chk("pe-shortContract", v.shortContract, "HĐLĐ 1 đến dưới 3 tháng (khấu trừ 10%, có BH)")}${chk("pe-partTime", v.partTime, "Không trọn thời gian (lương dưới sàn thì không đóng BH)")}${chk("pe-active", v.active !== false, "Đang làm việc")}</div>
    <div style="display:flex;gap:8px;align-items:end;"><button type="submit" class="btn btn-primary">Lưu</button><button type="button" class="btn btn-secondary" onclick="editPayrollEmployee(null)">Hủy</button></div>
  </form>`;
}

function editPayrollEmployee(id) {
  payrollUi.editingEmployeeId = id;
  renderPayrollTab();
}

function savePayrollEmployee(ev) {
  ev.preventDefault();
  if (!payrollCanEdit()) return;
  const id = prEl("pe-id").value.trim();
  const existing = state.employees.find(e => e.id === id);
  if (existing && payrollUi.editingEmployeeId !== id) { showToast("Mã nhân viên đã tồn tại.", "error"); return; }
  const emp = Object.assign(existing || { id }, {
    name: prEl("pe-name").value.trim(), taxCode: prEl("pe-taxCode").value.trim(), idNo: prEl("pe-idNo").value.trim(),
    dept: prEl("pe-dept").value, region: prEl("pe-region").value, dependants: Math.max(0, parseInt(prEl("pe-dependants").value, 10) || 0),
    insSalary: Math.max(0, Number(prEl("pe-insSalary").value) || 0), baseSalary: Math.max(0, Number(prEl("pe-baseSalary").value) || 0),
    resident: prEl("pe-resident").checked, foreign: prEl("pe-foreign").checked, casual: prEl("pe-casual").checked,
    shortContract: prEl("pe-shortContract").checked && !prEl("pe-casual").checked, partTime: prEl("pe-partTime").checked, active: prEl("pe-active").checked,
    _updatedAt: Date.now()
  });
  if (!existing) state.employees.push(emp);
  payrollUi.editingEmployeeId = null;
  saveState();
  showToast("Đã lưu nhân viên.", "success");
  renderPayrollTab();
}

async function deletePayrollEmployee(id) {
  if (!payrollCanEdit()) return;
  if (state.payrolls.some(p => (p.lines || []).some(l => l.employeeId === id))) {
    showToast("Nhân viên đã có trong bảng lương — hãy chuyển sang 'Nghỉ việc' thay vì xóa.", "warning");
    return;
  }
  if (!await showConfirmModal({ title: "Xóa nhân viên", message: `Xóa nhân viên ${id}?`, confirmText: "Xóa" })) return;
  state.employees = state.employees.filter(e => e.id !== id);
  if (typeof trackDeletedIds === "function") trackDeletedIds([id], "employee");
  saveState();
  renderPayrollTab();
}

/* ---------------------------- Bảng lương ---------------------------- */

function payrollComputeLine(line, payDate, period) {
  const emp = state.employees.find(e => e.id === line.employeeId) || {};
  const slip = computePayslip(emp, { gross: line.gross, allowancesTaxFree: line.allowancesTaxFree, payDate, period });
  return { employeeId: line.employeeId, name: emp.name || line.name || "", dept: emp.dept || line.dept || "admin", ...slip };
}

function openPayrollPeriod() {
  payrollUi.period = prEl("pr-period").value;
  renderPayrollTab();
}

function createPayroll() {
  if (!payrollCanEdit()) return;
  const period = prEl("pr-period").value;
  if (!/^\d{4}-\d{2}$/.test(period)) { showToast("Chọn tháng lương.", "warning"); return; }
  if (state.payrolls.some(p => p.id === period)) { payrollUi.period = period; renderPayrollTab(); return; }
  const [y, m] = period.split("-").map(Number);
  // Mặc định ngày cuối tháng lương; người dùng sửa thành ngày trả thực tế (thuế TNCN tra theo ngày này).
  const payDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const lines = state.employees.filter(e => e.active !== false)
    .map(e => payrollComputeLine({ employeeId: e.id, gross: Number(e.baseSalary) || 0, allowancesTaxFree: 0 }, payDate, period));
  state.payrolls.push({ id: period, period, payDate, locked: false, lines, _updatedAt: Date.now() });
  payrollUi.period = period;
  saveState();
  renderPayrollTab();
}

// Đọc ô nhập trên màn hình vào bảng lương và tính lại (không lưu).
function payrollReadForm(p) {
  const payDate = prEl("pr-paydate").value || p.payDate;
  p.payDate = payDate;
  p.lines = p.lines.map((l, i) => payrollComputeLine({
    ...l,
    gross: Math.max(0, Number(prEl(`pr-gross-${i}`).value) || 0),
    allowancesTaxFree: Math.max(0, Number(prEl(`pr-allow-${i}`).value) || 0)
  }, payDate, p.period));
  p._updatedAt = Date.now();
}

function payrollVoucher(p) {
  return {
    id: `BL-${p.period}`, type: "payroll", date: p.payDate, payrollId: p.id,
    description: `Bảng lương tháng ${p.period.slice(5)}/${p.period.slice(0, 4)}`,
    totalAmount: p.lines.reduce((s, l) => s + l.gross, 0), items: [], isManual: true,
    entries: buildPayrollEntries(p, state.accountingStandard),
    _updatedAt: Date.now(), _sessionId: typeof clientSessionId !== "undefined" ? clientSessionId : ""
  };
}

async function savePayroll(post = false) {
  if (!payrollCanEdit()) return;
  const p = state.payrolls.find(x => x.id === payrollUi.period);
  if (!p) return;
  if (!p.locked) payrollReadForm(p);
  else if (!post) { showToast("Bảng lương đã khóa.", "warning"); return; }
  // Bảng lương đã ghi sổ thì mọi lần lưu đều cập nhật lại chứng từ để sổ sách khớp bảng lương.
  if (post || p.voucherId) {
    const v = payrollVoucher(p);
    if (!v.entries.length) { showToast("Bảng lương không có số liệu để ghi sổ.", "warning"); return; }
    const idx = state.vouchers.findIndex(x => x.id === v.id);
    if (typeof blockLockedPeriodEdit === "function" && blockLockedPeriodEdit(v, state.vouchers[idx])) return;
    if (idx >= 0) state.vouchers[idx] = { ...state.vouchers[idx], ...v };
    else state.vouchers.push(v);
    p.voucherId = v.id;
    recalculateAccounting(false);
    try {
      const cloudCommitted = await saveStateAndSyncVoucher();
      showToast(cloudCommitted ? `Đã ghi sổ chứng từ ${v.id}.` : `Chứng từ ${v.id} đã lưu trên máy này và đang chờ đồng bộ.`, cloudCommitted ? "success" : "warning");
    } catch (err) {
      console.error("[Payroll] Ghi sổ thất bại:", err);
      showToast("Không thể lưu chứng từ lương. Vui lòng thử lại.", "danger");
    }
    if (typeof markAllTabsDirty === "function") markAllTabsDirty();
  } else {
    saveState();
    showToast("Đã lưu bảng lương.", "success");
  }
  renderPayrollTab();
}

function togglePayrollLock() {
  if (!payrollCanEdit()) return;
  const p = state.payrolls.find(x => x.id === payrollUi.period);
  if (!p) return;
  if (!p.locked) payrollReadForm(p);
  p.locked = !p.locked;
  p._updatedAt = Date.now();
  saveState();
  renderPayrollTab();
}

async function deletePayroll() {
  if (!payrollCanEdit()) return;
  const p = state.payrolls.find(x => x.id === payrollUi.period);
  if (!p) return;
  if (p.locked) { showToast("Bảng lương đã khóa — mở khóa trước khi xóa.", "warning"); return; }
  if (p.voucherId && typeof blockLockedPeriodEdit === "function" && blockLockedPeriodEdit(null, state.vouchers.find(v => v.id === p.voucherId))) return;
  if (!await showConfirmModal({ title: "Xóa bảng lương", message: `Xóa bảng lương ${p.period}${p.voucherId ? " và chứng từ " + p.voucherId : ""}?`, confirmText: "Xóa" })) return;
  state.payrolls = state.payrolls.filter(x => x !== p);
  if (typeof trackDeletedIds === "function") trackDeletedIds([p.id], "payroll");
  if (p.voucherId) {
    state.vouchers = state.vouchers.filter(v => v.id !== p.voucherId);
    if (typeof trackDeletedIds === "function") trackDeletedIds([p.voucherId], "voucher");
    recalculateAccounting(false);
    try { await saveStateAndSyncVoucher(); } catch (err) { console.error("[Payroll] Xóa chứng từ lương:", err); }
    if (typeof markAllTabsDirty === "function") markAllTabsDirty();
  } else {
    saveState();
  }
  renderPayrollTab();
}

/* ------------------------- Tổng hợp & quyết toán ------------------------- */

function payrollLinesBetween(from, to) {
  return state.payrolls.filter(p => p.payDate >= from && p.payDate <= to).flatMap(p => p.lines || []);
}

const payrollEmp = id => state.employees.find(e => e.id === id) || {};

// 05/KK-TNCN: tổng hợp theo NGÀY CHI TRẢ trong quý.
function payrollQuarterAoa(year, q) {
  const from = `${year}-${String(q * 3 - 2).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10);
  const lines = payrollLinesBetween(from, to);
  const isRes = l => payrollEmp(l.employeeId).resident !== false;
  const ids = f => new Set(lines.filter(f).map(l => l.employeeId)).size;
  const sum = (f, k) => lines.filter(f).reduce((s, l) => s + (k === "tnct" ? l.gross - l.allowancesTaxFree : Number(l[k]) || 0), 0);
  const all = () => true;
  return [["Chỉ tiêu", "Giá trị"],
    ["Tổng số người lao động", ids(all)],
    ["Trong đó: cá nhân cư trú có hợp đồng lao động", ids(l => isRes(l) && !payrollEmp(l.employeeId).casual)], // gồm cả HĐLĐ 1–3 tháng
    ["Tổng số cá nhân đã khấu trừ thuế", ids(l => l.pit > 0)],
    ["Tổng thu nhập chịu thuế trả cho cá nhân", sum(all, "tnct")],
    ["Trong đó: cá nhân cư trú", sum(isRes, "tnct")],
    ["Trong đó: cá nhân không cư trú", sum(l => !isRes(l), "tnct")],
    ["Tổng TNCT trả cho cá nhân thuộc diện khấu trừ", sum(l => l.pit > 0, "tnct")],
    ["Tổng số thuế TNCN đã khấu trừ", sum(all, "pit")],
    ["Trong đó: cá nhân cư trú", sum(isRes, "pit")],
    ["Trong đó: cá nhân không cư trú", sum(l => !isRes(l), "pit")]];
}

// 05/QTT-TNCN: tính lại cả năm theo biểu năm cho từng người.
function payrollAnnualAoa(year) {
  const lines = payrollLinesBetween(`${year}-01-01`, `${year}-12-31`);
  const byEmp = new Map();
  lines.forEach(l => byEmp.set(l.employeeId, [...(byEmp.get(l.employeeId) || []), l]));
  const rows = [...byEmp].map(([id, ls]) => {
    const e = payrollEmp(id);
    const r = computeAnnualSettlement(e, ls, year);
    return [id, e.name || ls[0].name || "", e.taxCode || "", r.eligible ? "Quyết toán thay" : "Không quyết toán thay", r.gross - r.allowancesTaxFree, r.insEmployee, r.deduction || 0, r.taxable, r.pitDue, r.withheld, r.diff];
  });
  return [["Mã NV", "Họ tên", "MST", "Diện", "TNCT", "BH bắt buộc", "Giảm trừ gia cảnh", "Thu nhập tính thuế", "Thuế phải nộp", "Đã khấu trừ", "Chênh lệch (+ nộp thêm)"], ...rows];
}

function payrollSheetAoa(p) {
  return [["Mã NV", "Họ tên", "Tổng thu nhập", "Phụ cấp miễn thuế", "BH người LĐ", "BH doanh nghiệp", "Giảm trừ", "Thu nhập tính thuế", "Thuế TNCN", "Thực lĩnh"],
    ...p.lines.map(l => [l.employeeId, l.name, l.gross, l.allowancesTaxFree, l.insEmployee, l.insEmployer, l.deductionSelf + l.deductionDependants, l.taxable, l.pit, l.net])];
}

function payrollOutputAoa(kind) {
  if (kind === "sheet") {
    const p = state.payrolls.find(x => x.id === payrollUi.period);
    return p && { title: `Bảng lương tháng ${p.period} — ngày chi trả ${formatDateDisplay(p.payDate)}`, file: `Bang_luong_${p.period}`, aoa: payrollSheetAoa(p) };
  }
  if (kind === "quarter") {
    const [y, q] = payrollUi.quarter.split("-Q").map(Number);
    return { title: `Tổng hợp 05/KK-TNCN quý ${q}/${y}`, file: `05KK_TNCN_Q${q}_${y}`, aoa: payrollQuarterAoa(y, q) };
  }
  const y = Number(payrollUi.year);
  return { title: `Số liệu quyết toán 05/QTT-TNCN năm ${y}`, file: `05QTT_TNCN_${y}`, aoa: payrollAnnualAoa(y) };
}

function exportPayrollOutput(kind) {
  const o = payrollOutputAoa(kind);
  if (!o || typeof XLSX === "undefined") return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[o.title], [], ...o.aoa]), "Sheet1");
  XLSX.writeFile(wb, `${o.file}.xlsx`);
}

async function printPayrollOutput(kind) {
  const o = payrollOutputAoa(kind);
  if (!o) return;
  const html = `<div style="font-family:'Times New Roman',serif;padding:16px;"><div>${prEsc(state.companyName || "")} — MST ${prEsc(state.taxCode || "")}</div>
    <h3 style="text-align:center;">${prEsc(o.title)}</h3>${prTable(o.aoa, "border-collapse:collapse;")}
    <style>table,th,td{border:1px solid #000;padding:3px;}</style></div>`;
  if (window.electronAPI && typeof window.electronAPI.printHtml === "function") {
    const res = await window.electronAPI.printHtml(html, 1, "A4", { directPrint: false, deviceName: "", copies: 1 });
    if (res && res.ok === false) showToast("Không in được: " + (res.error || ""), "error");
    return;
  }
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${prEsc(o.title)}</title>${html}`);
  w.document.close();
  w.print();
}

/* ---------------------------- Render ---------------------------- */

function renderPayrollTab() {
  const root = prEl("payroll-root");
  if (!root) return;
  payrollEnsureState();
  const today = getLocalDateString();
  if (!payrollUi.period) payrollUi.period = today.slice(0, 7);
  if (!payrollUi.year) payrollUi.year = today.slice(0, 4);
  if (!payrollUi.quarter) payrollUi.quarter = `${today.slice(0, 4)}-Q${Math.ceil(Number(today.slice(5, 7)) / 3)}`;
  const editing = payrollUi.editingEmployeeId;
  const btn = (label, onclick, cls = "btn-secondary", disabled = false) => `<button class="btn ${cls}" onclick="${onclick}"${disabled ? " disabled" : ""}>${label}</button>`;
  const outBtns = kind => `${btn("In", `printPayrollOutput('${kind}')`)}${btn("Xuất Excel", `exportPayrollOutput('${kind}')`)}`;

  const empRows = state.employees.map(e => `<tr${e.active === false ? ' style="opacity:.55;"' : ""}>
    <td>${prEsc(e.id)}</td><td>${prEsc(e.name)}</td><td>${prEsc(e.taxCode || "")}</td><td>${e.dept === "sales" ? "Bán hàng" : "Quản lý"}</td><td>${prEsc(e.region || "I")}</td>
    <td style="text-align:right;">${Number(e.dependants) || 0}</td><td>${e.casual ? "Vãng lai" : e.shortContract ? "HĐ 1–3 tháng" : e.resident === false ? "Không cư trú" : "Cư trú"}${e.foreign ? ", nước ngoài" : ""}</td>
    <td style="text-align:right;">${prNum(e.insSalary)}</td><td>${e.active === false ? "Nghỉ việc" : "Đang làm"}</td>
    <td style="white-space:nowrap;">${btn("Sửa", `editPayrollEmployee('${escapeHtmlAttr(e.id)}')`)} ${btn("Xóa", `deletePayrollEmployee('${escapeHtmlAttr(e.id)}')`)}</td></tr>`).join("");

  const p = state.payrolls.find(x => x.id === payrollUi.period);
  let sheet = `<p>Chưa có bảng lương tháng này. ${btn("Tạo bảng lương", "createPayroll()", "btn-primary")}</p>`;
  if (p) {
    const dis = p.locked ? " disabled" : "";
    const tot = k => p.lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
    sheet = `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:8px 0;">
        <label>Ngày chi trả <input id="pr-paydate" type="date" class="form-control" value="${escapeHtmlText(p.payDate)}"${dis}></label>
        <span>${p.locked ? "Đã khóa" : "Đang soạn"}${p.voucherId ? ` · Đã ghi sổ: ${prEsc(p.voucherId)}` : ""}</span>
        ${btn("Lưu & tính lại", "savePayroll(false)", "btn-secondary", p.locked)}${btn(p.voucherId ? "Cập nhật ghi sổ" : "Ghi sổ", "savePayroll(true)", "btn-primary")}
        ${btn(p.locked ? "Mở khóa" : "Khóa", "togglePayrollLock()")}${btn("Xóa", "deletePayroll()", "btn-secondary", p.locked)}${outBtns("sheet")}
      </div>
      <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12px;">
        <thead><tr><th>Mã NV</th><th>Họ tên</th><th>Tổng thu nhập</th><th>Phụ cấp miễn thuế</th><th>BH người LĐ</th><th>BH DN</th><th>Giảm trừ</th><th>TN tính thuế</th><th>Thuế TNCN</th><th>Thực lĩnh</th></tr></thead>
        <tbody>${p.lines.map((l, i) => `<tr><td>${prEsc(l.employeeId)}</td><td>${prEsc(l.name)}</td>
          <td><input id="pr-gross-${i}" type="number" min="0" class="form-control" style="min-width:110px;" value="${Number(l.gross) || 0}"${dis}></td>
          <td><input id="pr-allow-${i}" type="number" min="0" class="form-control" style="min-width:100px;" value="${Number(l.allowancesTaxFree) || 0}"${dis}></td>
          <td style="text-align:right;">${prNum(l.insEmployee)}</td><td style="text-align:right;">${prNum(l.insEmployer)}</td>
          <td style="text-align:right;">${prNum(l.deductionSelf + l.deductionDependants)}</td><td style="text-align:right;">${prNum(l.taxable)}</td>
          <td style="text-align:right;">${prNum(l.pit)}</td><td style="text-align:right;">${prNum(l.net)}</td></tr>`).join("")}</tbody>
        <tfoot><tr style="font-weight:600;"><td colspan="2">Tổng cộng</td><td style="text-align:right;">${prNum(tot("gross"))}</td><td style="text-align:right;">${prNum(tot("allowancesTaxFree"))}</td>
          <td style="text-align:right;">${prNum(tot("insEmployee"))}</td><td style="text-align:right;">${prNum(tot("insEmployer"))}</td><td></td><td></td>
          <td style="text-align:right;">${prNum(tot("pit"))}</td><td style="text-align:right;">${prNum(tot("net"))}</td></tr></tfoot>
      </table></div>
      ${p.payDate && p.payDate.slice(0, 4) !== p.period.slice(0, 4) ? `<p style="font-size:12px;color:var(--color-warning,#b45309);">Ngày chi trả khác năm với tháng lương: thuế TNCN tính theo biểu và giảm trừ của năm ${prEsc(p.payDate.slice(0, 4))}.</p>` : ""}
      <p style="font-size:12px;opacity:.8;">Ngày chi trả mặc định là ngày cuối tháng lương — sửa thành ngày trả thực tế. Thuế TNCN (biểu, giảm trừ, ngưỡng 10%) tra theo ngày chi trả; trần/sàn/tỷ lệ bảo hiểm tra theo tháng lương. Nhân viên mới thêm sau khi tạo bảng lương: xóa và tạo lại bảng lương tháng.</p>`;
  }

  const [qy, qq] = payrollUi.quarter.split("-Q");
  root.innerHTML = `
  <div class="card"><div class="card-header-bar"><span class="card-title">Danh mục nhân viên</span>
      ${btn("Thêm nhân viên", "editPayrollEmployee('')", "btn-primary")}</div>
    ${editing !== null ? payrollEmployeeForm(state.employees.find(e => e.id === editing)) : ""}
    <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12px;">
      <thead><tr><th>Mã</th><th>Họ tên</th><th>MST</th><th>Bộ phận</th><th>Vùng</th><th>NPT</th><th>Tình trạng thuế</th><th>Lương đóng BH</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${empRows || '<tr><td colspan="10" style="text-align:center;">Chưa có nhân viên</td></tr>'}</tbody></table></div>
  </div>
  <div class="card" style="margin-top:16px;"><div class="card-header-bar"><span class="card-title">Bảng lương tháng</span>
      <span><input id="pr-period" type="month" class="form-control" style="display:inline-block;width:auto;" value="${escapeHtmlText(payrollUi.period)}" onchange="openPayrollPeriod()"></span></div>
    ${sheet}
  </div>
  <div class="card" style="margin-top:16px;"><div class="card-header-bar"><span class="card-title">Tổng hợp tờ khai 05/KK-TNCN (quý)</span>
      <span><input type="number" class="form-control" style="display:inline-block;width:90px;" value="${escapeHtmlText(qy)}" onchange="payrollUi.quarter=this.value+'-Q${escapeHtmlAttr(qq)}';renderPayrollTab()">
      <select class="form-control" style="display:inline-block;width:auto;" onchange="payrollUi.quarter='${escapeHtmlAttr(qy)}-Q'+this.value;renderPayrollTab()">${[1, 2, 3, 4].map(n => `<option value="${n}"${String(n) === qq ? " selected" : ""}>Quý ${n}</option>`).join("")}</select>
      ${outBtns("quarter")}</span></div>
    <p style="font-size:12px;opacity:.8;">Khai theo quý từ kỳ tháng 4/2026 đến hết 28/02/2027 (NQ 66.16/2026). Thu nhập ghi nhận theo ngày chi trả.</p>
    ${prTable(payrollQuarterAoa(Number(qy), Number(qq)))}
  </div>
  <div class="card" style="margin-top:16px;"><div class="card-header-bar"><span class="card-title">Số liệu quyết toán 05/QTT-TNCN (năm)</span>
      <span><input type="number" class="form-control" style="display:inline-block;width:90px;" value="${escapeHtmlText(payrollUi.year)}" onchange="payrollUi.year=this.value;renderPayrollTab()">${outBtns("annual")}</span></div>
    <p style="font-size:12px;opacity:.8;">Tính lại cả năm theo biểu năm (ngưỡng bậc × 12); giảm trừ bản thân 12 tháng, người phụ thuộc theo số tháng đã giảm trừ trên bảng lương. Mẫu 05/QTT-TNCN cho năm 2026 chưa xác minh (TT 87/2026, TT 89/2026).</p>
    <div style="overflow-x:auto;">${prTable(payrollAnnualAoa(Number(payrollUi.year)))}</div>
  </div>`;
}

Object.assign(window, {
  renderPayrollTab, editPayrollEmployee, savePayrollEmployee, deletePayrollEmployee, openPayrollPeriod, createPayroll,
  savePayroll, togglePayrollLock, deletePayroll, exportPayrollOutput, printPayrollOutput
});
