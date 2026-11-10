/* ==========================================================================
   LỊCH THUẾ, TIỀN CHẬM NỘP, KHUNG PHẠT (G1–G3)
   Phần tính toán thuần (Node-testable) + giao diện renderTaxCalendar() vào #tax-calendar-root.
   ========================================================================== */

function taxCalRule(key, date) {
  const fn = typeof getTaxRule === "function" ? getTaxRule : require("../core/tax-rules.js").getTaxRule;
  const rule = fn(key, date);
  return rule ? rule.value : null;
}

// Ngày dạng "YYYY-MM-DD" tính theo UTC để không lệch múi giờ.
const taxCalIso = d => d.toISOString().slice(0, 10);
const taxCalDate = s => new Date(s + "T00:00:00Z");
const taxCalLastDay = (y, m) => taxCalIso(new Date(Date.UTC(y, m, 0))); // m: 1–12
const taxCalDays = (from, to) => Math.round((taxCalDate(to) - taxCalDate(from)) / 86400000);

// Hạn rơi vào thứ Bảy, Chủ nhật hoặc ngày nghỉ lễ → lùi sang ngày làm việc kế tiếp.
function computeDueDate(rawDate) {
  const d = taxCalDate(String(rawDate).slice(0, 10));
  for (;;) {
    const iso = taxCalIso(d);
    const holidays = taxCalRule("holidays", iso) || [];
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.some(h => h.date === iso)) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

// NĐ 245/2026: gia hạn nộp thuế GTGT 2026 cho DN nhỏ, siêu nhỏ và ngành được liệt kê (chỉ áp khi thuộc diện).
// Nguồn từng mốc (gồm Q2/2026 → 02/11/2026): research_notes/.../quan_ly_thue_han_nop.md, mục NĐ 245/2026.
const TAX_CALENDAR_EXTENSIONS = {
  "GTGT|2026-05": "2026-11-20",
  "GTGT|2026-06": "2026-12-21", "GTGT|2026-07": "2026-12-21", "GTGT|2026-08": "2026-12-21", "GTGT|2026-09": "2026-12-21",
  "GTGT|Q2/2026": "2026-11-02"
};

// settings: { vatPeriod: "month"|"quarter", pitPeriod: "month"|"quarter", prevYearRevenue: { [năm tính thuế]: doanh thu năm trước } } — mặc định quý.
function buildTaxCalendar(year, settings = {}) {
  const y = Number(year);
  const items = [];
  const push = (tax, label, period, rawDate, ref) => {
    const ext = TAX_CALENDAR_EXTENSIONS[`${tax}|${period}`];
    items.push({ tax, label, period, rawDate, dueDate: computeDueDate(rawDate), ...(ext ? { extendedDue: ext } : {}), ref });
  };
  const periodic = (tax, name, mode) => {
    if (mode === "month") {
      for (let m = 1; m <= 12; m++) {
        const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
        push(tax, `${name} tháng ${String(m).padStart(2, "0")}/${y}`, `${y}-${String(m).padStart(2, "0")}`, `${ny}-${String(nm).padStart(2, "0")}-20`, "NĐ 252 Đ10 — ngày 20 tháng sau");
      }
    } else {
      for (let q = 1; q <= 4; q++) {
        const ny = q === 4 ? y + 1 : y, nm = q === 4 ? 1 : q * 3 + 1;
        push(tax, `${name} quý ${q}/${y}`, `Q${q}/${y}`, taxCalLastDay(ny, nm), "NĐ 252 Đ10 — ngày cuối tháng đầu quý sau");
      }
    }
  };
  periodic("GTGT", "Tờ khai GTGT", settings.vatPeriod === "month" ? "month" : "quarter");
  periodic("TNCN", "Tờ khai 05/KK-TNCN", settings.pitPeriod === "month" ? "month" : "quarter");
  // NĐ 141/2026: DN doanh thu năm ≤ 1 tỷ miễn TNDN → không tạm nộp. Chỉ xét khi đã nhập doanh thu năm trước (Báo cáo thuế).
  const citExempt = taxCalCitExempt(y, settings.prevYearRevenue);
  for (let q = 1; q <= 4 && !citExempt; q++) {
    const ny = q === 4 ? y + 1 : y, nm = q === 4 ? 1 : q * 3 + 1;
    // Quý kết thúc trước 01/7/2026 theo Luật QLT 38/2019 Đ55 (NĐ 126): ngày 30 tháng đầu quý sau; từ quý 3/2026 Luật 108/NĐ 252.
    if (y * 4 + q < 2026 * 4 + 3) push("TNDN", `Tạm nộp TNDN quý ${q}/${y}`, `Q${q}/${y}`, `${ny}-${String(nm).padStart(2, "0")}-30`, "Luật QLT 38/2019 Đ55 — ngày 30 tháng đầu quý sau");
    else push("TNDN", `Tạm nộp TNDN quý ${q}/${y}`, `Q${q}/${y}`, taxCalLastDay(ny, nm), "Luật QLT 108/2025, NĐ 252 Đ24.2 — ngày cuối tháng đầu quý sau (một nguồn LuatVietnam ghi ngày 30 — nộp trước ngày 30 cho an toàn)");
  }
  // BHXH/BHYT/BHTN/KPCĐ: chậm nhất ngày cuối tháng sau tháng lương. Lùi hạn khi rơi vào ngày nghỉ là suy luận theo NĐ 252 Đ3.7.
  for (let m = 1; m <= 12; m++) {
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    push("BHXH", `Đóng BHXH, BHYT, BHTN, KPCĐ tháng ${String(m).padStart(2, "0")}/${y}`, `${y}-${String(m).padStart(2, "0")}`, taxCalLastDay(ny, nm), "Luật BHXH 2024 — ngày cuối tháng tiếp theo");
  }
  push("TNDN", `Quyết toán TNDN năm ${y}`, String(y), taxCalLastDay(y + 1, 3), "NĐ 252 Đ10 — ngày cuối tháng thứ 3");
  push("BCTC", `Nộp BCTC năm ${y}`, String(y), taxCalLastDay(y + 1, 3), "Luật Kế toán — 90 ngày (chưa xác minh lại với TT99)");
  push("TNCN", `Quyết toán TNCN năm ${y} (05/QTT-TNCN)`, String(y), taxCalLastDay(y + 1, 3), "NĐ 252 Đ10 — ngày cuối tháng thứ 3");
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// prevYearRevenue: { [năm tính thuế]: doanh thu năm trước } (taxSettings, nhập ở Báo cáo thuế); chưa nhập → không miễn.
function taxCalCitExempt(year, prevYearRevenue) {
  const limit = taxCalRule("cit.exemptRevenue", `${year}-12-31`);
  const rev = (prevYearRevenue || {})[year];
  return limit != null && rev != null && rev !== "" && Number(rev) <= limit;
}

// Tiền chậm nộp = số tiền × 0,03% × số ngày chậm (từ ngày sau hạn nộp đến ngày nộp), trừ ngày được loại trừ (gia hạn, khoanh nợ, sự cố hệ thống).
function lateInterest(amount, dueDate, paidDate, excludedDays = 0) {
  const days = Math.max(0, taxCalDays(dueDate, paidDate) - (Number(excludedDays) || 0));
  return { days, interest: Math.round((Number(amount) || 0) * 0.0003 * days) };
}

// Khung phạt chậm nộp tờ khai — NĐ 125/2020 Đ13 sửa bởi NĐ 310/2025; cá nhân bằng một nửa tổ chức.
// Quá 90 ngày: không phát sinh thuế phải nộp → 8–15 tr; có số thuế phải nộp → 15–25 tr.
function lateFilingPenaltyTier(daysLate, isIndividual = false, hasTaxDue = true) {
  const d = Number(daysLate) || 0;
  if (d <= 0) return null;
  const tiers = [[30, 2e6, 5e6], [60, 5e6, 8e6], [90, 8e6, 15e6], [Infinity, ...(hasTaxDue ? [15e6, 25e6] : [8e6, 15e6])]];
  const [, min, max] = tiers.find(t => d <= t[0]);
  const k = isIndividual ? 0.5 : 1;
  return {
    min: min * k, max: max * k, warning: d <= 5,
    note: d <= 5 ? "Có tình tiết giảm nhẹ: phạt cảnh cáo" : d > 90 && hasTaxDue ? "Khi đã nộp đủ thuế và tiền chậm nộp trước khi có quyết định thanh tra, kiểm tra; nếu chưa nộp có thể bị xử lý trốn thuế" : ""
  };
}

/* ---------------------------- Giao diện ---------------------------- */

function getTaxSettings() {
  const s = (typeof state !== "undefined" && state.taxSettings) || {};
  return { vatPeriod: s.vatPeriod === "month" ? "month" : "quarter", pitPeriod: s.pitPeriod === "month" ? "month" : "quarter", extension245: !!s.extension245 };
}

function setTaxSetting(key, value) {
  if (window.currentUser && window.currentUser.role === "viewer") { showToast("Tài khoản chỉ xem không được sửa cài đặt.", "error"); renderTaxCalendar(); return; }
  state.taxSettings = { ...(state.taxSettings || {}), ...getTaxSettings(), [key]: value }; // giữ vatInputs, prevYearRevenue
  saveState();
  renderTaxCalendar();
}

function renderTaxCalendar() {
  const root = document.getElementById("tax-calendar-root");
  if (!root) return;
  const esc = escapeHtmlText;
  const s = getTaxSettings();
  const today = getLocalDateString();
  const y = Number(today.slice(0, 4));
  const prevYearRevenue = (state.taxSettings || {}).prevYearRevenue || {};
  const citExemptNote = taxCalCitExempt(y, prevYearRevenue)
    ? `<p style="font-size:12px;opacity:.8;">Doanh thu năm ${y - 1} đã nhập ≤ 1 tỷ: không liệt kê tạm nộp TNDN năm ${y} (NĐ 141/2026 miễn thuế TNDN cho DN doanh thu năm ≤ 1 tỷ). Nếu doanh thu năm ${y} vượt 1 tỷ thì vẫn phải quyết toán và nộp thuế.</p>` : "";
  const rows = [y - 1, y, y + 1].flatMap(yr => buildTaxCalendar(yr, { ...s, prevYearRevenue }))
    .filter(it => taxCalDays(today, s.extension245 && it.extendedDue ? it.extendedDue : it.dueDate) >= -30)
    .filter(it => taxCalDays(today, it.dueDate) <= 365);
  const sel = (key, val) => `<select class="form-control" onchange="setTaxSetting('${key}', this.value)">
      <option value="quarter"${val === "quarter" ? " selected" : ""}>Theo quý</option>
      <option value="month"${val === "month" ? " selected" : ""}>Theo tháng</option></select>`;
  root.innerHTML = `
  <div class="card" style="margin-top:16px;">
    <div class="card-header-bar"><span class="card-title">Lịch hạn nộp thuế</span></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:8px 0;">
      <label>Kỳ khai GTGT ${sel("vatPeriod", s.vatPeriod)}</label>
      <label>Kỳ khai TNCN ${sel("pitPeriod", s.pitPeriod)}</label>
      <label><input type="checkbox" ${s.extension245 ? "checked" : ""} onchange="setTaxSetting('extension245', this.checked)"> Thuộc diện gia hạn NĐ 245/2026</label>
    </div>
    ${s.pitPeriod === "month" ? `<p style="font-size:12px;color:var(--color-warning);">Kỳ tháng 04/2026–02/2027: tờ khai 05/KK-TNCN bắt buộc khai theo QUÝ (NQ 66.16/2026; hệ thống thuế không nhận tờ khai tháng). Hạn tháng trong bảng không áp dụng cho các kỳ này.</p>` : ""}
    <p style="font-size:12px;opacity:.8;">TNCN khai theo quý từ kỳ tháng 4/2026 đến hết 28/02/2027 (NQ 66.16/2026). Hạn rơi vào ngày nghỉ được lùi sang ngày làm việc kế tiếp.</p>${citExemptNote}
    <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;">
      <thead><tr><th>Hạn nộp</th><th>Còn (ngày)</th><th>Nghĩa vụ</th><th>Hạn gốc</th><th>Căn cứ</th></tr></thead>
      <tbody>${rows.map(it => {
        const due = s.extension245 && it.extendedDue ? it.extendedDue : it.dueDate;
        const left = taxCalDays(today, due);
        const style = left < 0 ? "color:var(--color-danger);" : left <= 90 ? "background:rgba(245,158,11,.12);font-weight:600;" : "";
        return `<tr style="${style}"><td>${esc(formatDateDisplay(due))}${due !== it.dueDate ? " (gia hạn)" : ""}</td><td>${left < 0 ? "Quá hạn " + -left : left}</td>
          <td>${esc(it.label)}</td><td>${esc(formatDateDisplay(it.rawDate))}</td><td style="font-size:11px;">${esc(it.ref)}</td></tr>`;
      }).join("")}</tbody></table></div>
  </div>
  <div class="card" style="margin-top:16px;">
    <div class="card-header-bar"><span class="card-title">Tính tiền chậm nộp & khung phạt</span></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:8px 0;">
      <label>Số thuế chậm nộp<br><input id="tc-amount" class="form-control" type="number" min="0" step="1"></label>
      <label>Hạn nộp (tờ khai và tiền thuế)<br><input id="tc-due" class="form-control" type="date"></label>
      <label>Ngày nộp tiền thuế<br><input id="tc-paid" class="form-control" type="date" value="${today}"></label>
      <label>Ngày nộp tờ khai (bỏ trống nếu đúng hạn)<br><input id="tc-filed" class="form-control" type="date"></label>
      <label>Số ngày loại trừ<br><input id="tc-excluded" class="form-control" type="number" min="0" value="0"></label>
      <label><input id="tc-individual" type="checkbox"> Cá nhân</label>
      <button class="btn btn-primary" onclick="calcTaxLateInterest()">Tính</button>
    </div>
    <div id="tc-result" aria-live="polite"></div>
  </div>`;
}

function calcTaxLateInterest() {
  const v = id => document.getElementById(id);
  if (!v("tc-due").value || !v("tc-paid").value) { showToast("Nhập hạn nộp và ngày nộp.", "warning"); return; }
  const amount = Number(v("tc-amount").value) || 0;
  const r = lateInterest(amount, v("tc-due").value, v("tc-paid").value, v("tc-excluded").value);
  // Chậm nộp tiền thuế chỉ tính tiền chậm nộp; phạt là lỗi riêng, đếm từ hạn nộp đến ngày nộp TỜ KHAI.
  const fileDays = v("tc-filed").value ? Math.max(0, taxCalDays(v("tc-due").value, v("tc-filed").value)) : 0;
  const p = lateFilingPenaltyTier(fileDays, v("tc-individual").checked, amount > 0);
  v("tc-result").innerHTML = `<p>Số ngày chậm nộp tiền thuế: <b>${r.days}</b> — Tiền chậm nộp (0,03%/ngày): <b>${formatVND(r.interest)}</b></p>` +
    (p ? `<p>Nộp chậm tờ khai ${fileDays} ngày: phạt ${formatVND(p.min)} – ${formatVND(p.max)}${p.note ? " (" + escapeHtmlText(p.note) + ")" : ""}. Nhiều tờ khai cùng loại thuế nộp chậm cùng ngày chỉ tính một lỗi ở khung cao nhất.</p>` : "");
}

const TAX_CALENDAR_API = { computeDueDate, buildTaxCalendar, lateInterest, lateFilingPenaltyTier, TAX_CALENDAR_EXTENSIONS };
if (typeof window !== "undefined") Object.assign(window, TAX_CALENDAR_API, { renderTaxCalendar, setTaxSetting, calcTaxLateInterest });
if (typeof module !== "undefined" && module.exports) module.exports = TAX_CALENDAR_API;
