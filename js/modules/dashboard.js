// Bàn làm việc: việc cần xử lý → tiền → xu hướng → danh sách công việc.
// Phần "tính toán thuần" không đụng DOM (tests/dashboard-tests.js nạp trong vm).

// ---------------------------------------------------------------------------
// Tính toán thuần
// ---------------------------------------------------------------------------
const dashDayNumber = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
};
const dashIsoFromDay = day => new Date(day * 86400000).toISOString().slice(0, 10);
const dashToday = () => (typeof getLocalDateString === "function" ? getLocalDateString() : new Date().toISOString().slice(0, 10));
const dashRound2 = n => Math.round(n * 100) / 100;

// Số liệu thẻ KPI: tiền, ký quỹ (đã nộp 244|1386 dư Nợ + đã nhận 344|3386 dư Có, cùng hiện số dương),
// doanh thu thuần và lãi gộp như B02. prev = kỳ liền trước cùng số ngày, chỉ khi có đủ từ ngày và đến ngày.
function computeDashboardKpis(st, fromDate, toDate) {
  const net = code => { const t = getAccountTurnover(st, code, "", toDate); return t.closeDebit - t.closeCredit; };
  const tt99 = isTT99Family(st.accountingStandard);
  const pl = computeProfitLoss(st, fromDate, toDate);
  const cashOnHand = net("111"), bank = net("112");
  const kpis = {
    cashOnHand, bank, cash: cashOnHand + bank,
    escrow: net(tt99 ? "244" : "1386") - net(tt99 ? "344" : "3386"),
    revenue: pl.netRevenue, grossProfit: pl.grossProfit,
    margin: pl.netRevenue ? pl.grossProfit / pl.netRevenue : null,
    prev: null
  };
  const fromDay = dashDayNumber(fromDate), toDay = dashDayNumber(toDate);
  if (fromDay <= toDay) { // NaN (thiếu ngày) → false
    const prevPl = computeProfitLoss(st, dashIsoFromDay(fromDay - (toDay - fromDay + 1)), dashIsoFromDay(fromDay - 1));
    kpis.prev = { revenue: prevPl.netRevenue, grossProfit: prevPl.grossProfit };
  }
  return kpis;
}

// Doanh thu thuần / giá vốn 12 tháng kết thúc ở tháng chứa endDate (tháng cuối chỉ tính đến endDate).
// Một lượt qua bút toán, cùng quy ước với computeProfitLoss + sumAccountMovements: bỏ period_close,
// chứng từ không ghi sổ (không có entries) không tính; 511 Có − 511 Nợ − (521 Nợ − 521 Có); 632 Nợ − Có.
function computeDashboardMonthlySeries(st, endDate) {
  const end = String(endDate || "").slice(0, 10);
  const year = Number(end.slice(0, 4)), month = Number(end.slice(5, 7));
  const months = [];
  for (let i = 11; i >= 0; i--) {
    months.push({ month: new Date(Date.UTC(year, month - 1 - i, 1)).toISOString().slice(0, 7), revenue: 0, cogs: 0 });
  }
  const byMonth = new Map(months.map(row => [row.month, row]));
  ((st && st.vouchers) || []).forEach(v => {
    if (!v || v.type === "period_close" || !Array.isArray(v.entries)) return;
    const date = String(v.date || "");
    const row = date > end ? null : byMonth.get(date.slice(0, 7));
    if (!row) return;
    v.entries.forEach(e => {
      if (!e) return;
      const amount = Number(e.amount) || 0;
      const debit = String(e.debit ?? "").trim(), credit = String(e.credit ?? "").trim();
      if (debit.startsWith("511") || debit.startsWith("521")) row.revenue -= amount;
      if (credit.startsWith("511") || credit.startsWith("521")) row.revenue += amount;
      if (debit.startsWith("632")) row.cogs += amount;
      if (credit.startsWith("632")) row.cogs -= amount;
    });
  });
  months.forEach(row => {
    row.revenue = dashRound2(row.revenue);
    row.cogs = dashRound2(row.cogs);
    row.grossProfit = dashRound2(row.revenue - row.cogs);
  });
  return months;
}

// Tuổi nợ tại ngày asOf. items: [{ date, remainingDebt }].
function computeDashboardAging(items, asOf) {
  const buckets = [
    { label: "0–30 ngày", maxDays: 30 }, { label: "31–90 ngày", maxDays: 90 },
    { label: "91–180 ngày", maxDays: 180 }, { label: "Trên 180 ngày", maxDays: Infinity }
  ].map(b => ({ ...b, amount: 0, count: 0 }));
  const asOfDay = dashDayNumber(asOf);
  (items || []).forEach(item => {
    const days = asOfDay - dashDayNumber(item.date);
    const bucket = buckets.find(b => !(days > b.maxDays)); // ngày lỗi (NaN) rơi vào nhóm đầu
    bucket.amount += Number(item.remainingDebt) || 0;
    bucket.count++;
  });
  return buckets;
}

// Kiểm tra sổ sách. Trả về [{ key, severity, title, detail, count, amount, action }], nặng trước;
// mục không có vấn đề không xuất hiện. action: mã tab cho switchTab, "debt-audit", hoặc mã công cụ sửa
// ("opening-plug", "payroll-accrual" — runDashboardAction mở công cụ nếu module đã nạp).
// Kiểm tra c/d dùng công cụ ở debts.js (đọc state toàn cục) — bỏ qua khi module chưa nạp.
function computeDashboardHealth(st, toDate, fromDate) {
  const items = [];
  const add = (key, severity, title, count, amount, action, detail) =>
    items.push({ key, severity, title, detail, count, amount: dashRound2(amount), action });
  const std = st.accountingStandard;

  // a. Số dư đầu kỳ: tổng dư Nợ = tổng dư Có. Đọc qua getOpeningBalanceForAccount để số dư 244/344
  // khai theo TT133 chỉ tính một lần (ở 1386/3386).
  const codes = new Set(Object.keys(st.initialBalances || {}).filter(code => !isHiddenOpeningAlias(code, std)));
  if (!isTT99Family(std) && typeof TT133_OPENING_ALIASES === "object") Object.keys(TT133_OPENING_ALIASES).forEach(code => codes.add(code));
  let openDebit = 0, openCredit = 0;
  codes.forEach(code => {
    const ob = getOpeningBalanceForAccount(st.initialBalances, code, std);
    if (ob.type === "credit") openCredit += Number(ob.balance) || 0; else openDebit += Number(ob.balance) || 0;
  });
  const openDiff = dashRound2(openDebit - openCredit);
  if (Math.abs(openDiff) >= 1) {
    add("opening-unbalanced", "danger", "Số dư đầu kỳ chưa cân", 1, Math.abs(openDiff),
      typeof window.openOpeningBalancePlug === "function" ? "opening-plug" : "reports",
      `Dư Nợ ${formatVND(openDebit)} · Dư Có ${formatVND(openCredit)} · lệch ${formatVND(Math.abs(openDiff))}`);
  }

  // b. Quỹ tiền âm
  const negativeCash = ["111", "112"].map(code => {
    const t = getAccountTurnover(st, code, "", toDate);
    return { code, net: t.closeDebit - t.closeCredit };
  }).filter(x => x.net < 0);
  if (negativeCash.length) {
    add("cash-negative", "danger", "Quỹ tiền đang âm", negativeCash.length, negativeCash.reduce((s, x) => s - x.net, 0), "cash",
      negativeCash.map(x => `TK ${x.code} âm ${formatVND(-x.net)}`).join(" · "));
  }

  const voucherRows = (key, rows, title) => {
    if (!rows.length) return;
    const amount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    add(key, "warning", title, rows.length, amount, "debt-audit", `${rows.length} phiếu · ${formatVND(amount)}`);
  };
  // c. Phiếu thu/chi sai TK đối ứng
  if (typeof computeCashAccountFixSuggestions === "function") {
    voucherRows("cash-account-fix", computeCashAccountFixSuggestions(), "Phiếu thu/chi sai tài khoản đối ứng");
  }
  if (typeof computeBankChannelFixes === "function") {
    voucherRows("bank-channel-fix", computeBankChannelFixes(), "Phiếu chuyển khoản đang ghi quỹ tiền mặt 111");
  }
  if (typeof computeRetailDoubleCashFixes === "function") {
    voucherRows("retail-double-cash", computeRetailDoubleCashFixes(), "Bán lẻ ghi tiền mặt hai lần (hóa đơn 111 và phiếu thu 131)");
  }
  // d. Phiếu kiểm kê chưa rõ nguyên nhân
  if (typeof computeInventoryAdjustCauseFixes === "function") {
    voucherRows("inventory-adjust-cause", computeInventoryAdjustCauseFixes(), "Phiếu kiểm kê chưa rõ nguyên nhân (đang ghi 632/711)");
  }
  // Lương/BHXH đã chi (Nợ 334/338) nhưng chưa có bút toán trích chi phí
  if (typeof computePayrollAccrualSuggestions === "function") {
    const rows = computePayrollAccrualSuggestions() || [];
    if (rows.length) {
      const amount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      add("payroll-accrual", "warning", "Lương/BHXH đã chi nhưng chưa trích chi phí", rows.length, amount, "payroll-accrual",
        `${rows.length} khoản · ${formatVND(amount)}`);
    }
  }

  // e. Âm kho
  const negativeStock = (st.products || []).filter(p => p && (Number(p.stock) || 0) < 0);
  if (negativeStock.length) {
    const amount = negativeStock.reduce((s, p) => s - (Number(p.stock) || 0) * (Number(p.avgCost) || 0), 0);
    add("negative-stock", "warning", "Sản phẩm âm kho", negativeStock.length, amount, "inventory",
      `${negativeStock.length} sản phẩm · ${formatVND(amount)} theo giá bình quân`);
  }

  // f. Hóa đơn bán trong kỳ không có thuế GTGT. Bỏ qua khi doanh nghiệp không tính thuế trên hóa đơn
  // (không chịu thuế / phương pháp trực tiếp) và hóa đơn chỉ gồm dòng KCT/KKKNT.
  const vatMethod = (st.taxSettings || {}).vatMethod;
  if (vatMethod !== "khong_chiu" && vatMethod !== "truc_tiep") {
    let count = 0, amount = 0;
    (st.vouchers || []).forEach(v => {
      if (!v || v.type !== "sales") return;
      const date = String(v.date || "");
      if ((fromDate && date < fromDate) || (toDate && date > toDate)) return;
      const breakdown = v.vatBreakdown || computeVatBreakdown(v.items, v.taxRate || 0).breakdown;
      const rates = Object.keys(breakdown);
      if (rates.some(r => breakdown[r].tax > 0) || (rates.length && rates.every(r => r === "KCT" || r === "KKKNT"))) return;
      count++;
      amount += Number(v.totalAmount || v.amount) || 0;
    });
    if (count) add("sales-no-vat", "info", "Hóa đơn bán hàng không có thuế GTGT", count, amount, "sales", `${count} hóa đơn · ${formatVND(amount)}`);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Biểu đồ SVG (chuỗi HTML thuần; màu lấy từ biến CSS qua class trong dashboard.css)
// ---------------------------------------------------------------------------
function dashCompactMoney(n) {
  const abs = Math.abs(n);
  const fmt = (v, unit) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}${unit}`;
  if (abs >= 1e9) return fmt(n / 1e9, " tỷ");
  if (abs >= 1e6) return fmt(n / 1e6, " tr");
  return fmt(n, "");
}

const dashMonthLabel = ym => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const DASH_CHART_EMPTY = '<p class="dash-chart-empty">Chưa có số liệu trong khoảng thời gian này.</p>';

function renderDashboardMonthlyChart(series) {
  const values = series.flatMap(s => [s.revenue, s.cogs, s.grossProfit]);
  if (!values.some(Boolean)) return DASH_CHART_EMPTY;
  const W = 720, H = 280, L = 56, R = 8, T = 12, B = 28;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(0, ...values), min = Math.min(0, ...values);
  const raw = (max - min) / 4, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const top = Math.ceil(max / step) * step, bottom = Math.floor(min / step) * step;
  const y = v => T + ((top - v) / (top - bottom)) * plotH;
  const n = (v, d = 1) => Number(v.toFixed(d));

  let grid = "";
  for (let t = bottom; t <= top + step / 2; t += step) {
    const zero = Math.abs(t) < step / 2;
    grid += `<line class="${zero ? "dash-chart-axis" : "dash-chart-grid"}" x1="${L}" x2="${W - R}" y1="${n(y(t))}" y2="${n(y(t))}"/>`
      + `<text x="${L - 8}" y="${n(y(t) + 4)}" text-anchor="end">${dashCompactMoney(zero ? 0 : t)}</text>`;
  }
  const groupW = plotW / series.length, barW = Math.min(16, (groupW - 12) / 2);
  const bar = (cls, x, value, label, s) => {
    const y0 = y(0), yv = y(value);
    return `<rect class="${cls}" x="${n(x)}" y="${n(Math.min(y0, yv))}" width="${n(barW)}" height="${n(Math.abs(y0 - yv))}" rx="2">`
      + `<title>Tháng ${dashMonthLabel(s.month)} — ${label}: ${formatVND(value)}</title></rect>`;
  };
  const centers = series.map((_, i) => L + groupW * i + groupW / 2);
  const bars = series.map((s, i) =>
    bar("dash-chart-revenue", centers[i] - barW - 1, s.revenue, "Doanh thu thuần", s)
    + bar("dash-chart-cogs", centers[i] + 1, s.cogs, "Giá vốn", s)
    + `<text x="${n(centers[i])}" y="${H - 8}" text-anchor="middle">${s.month.slice(5, 7)}/${s.month.slice(2, 4)}</text>`).join("");
  const line = `<polyline class="dash-chart-line" points="${series.map((s, i) => `${n(centers[i])},${n(y(s.grossProfit))}`).join(" ")}"/>`
    + series.map((s, i) => `<circle class="dash-chart-dot" cx="${n(centers[i])}" cy="${n(y(s.grossProfit))}" r="4">`
      + `<title>Tháng ${dashMonthLabel(s.month)} — Lãi gộp: ${formatVND(s.grossProfit)}</title></circle>`).join("");
  const sum = key => series.reduce((total, s) => total + s[key], 0);
  const label = `Doanh thu thuần và giá vốn 12 tháng, ${dashMonthLabel(series[0].month)} đến ${dashMonthLabel(series[series.length - 1].month)}. `
    + `Tổng doanh thu thuần ${formatVND(sum("revenue"))}, giá vốn ${formatVND(sum("cogs"))}, lãi gộp ${formatVND(sum("grossProfit"))}.`;
  return `<svg class="dash-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtmlAttr(label)}">${grid}${bars}${line}</svg>`;
}

function renderDashboardAgingChart(buckets) {
  const max = Math.max(...buckets.map(b => b.amount));
  if (!(max > 0)) return '<p class="dash-chart-empty">Không có khoản phải thu nào còn nợ.</p>';
  const W = 360, ROW = 50;
  const rows = buckets.map((b, i) => {
    const top = i * ROW, width = b.amount > 0 ? Math.max(2, (b.amount / max) * W) : 0;
    return `<text x="0" y="${top + 14}">${b.label}</text>`
      + `<text class="dash-chart-value" x="${W}" y="${top + 14}" text-anchor="end">${formatVND(b.amount)}</text>`
      + `<rect class="dash-chart-track" x="0" y="${top + 22}" width="${W}" height="12" rx="3"/>`
      + `<rect class="dash-chart-aging" x="0" y="${top + 22}" width="${Number(width.toFixed(1))}" height="12" rx="3">`
      + `<title>${b.label}: ${formatVND(b.amount)} (${b.count} khoản)</title></rect>`;
  }).join("");
  const label = "Tuổi nợ phải thu. " + buckets.map(b => `${b.label}: ${formatVND(b.amount)}`).join("; ") + ".";
  return `<svg class="dash-chart" viewBox="0 0 ${W} ${buckets.length * ROW - 10}" role="img" aria-label="${escapeHtmlAttr(label)}">${rows}</svg>`;
}

// ---------------------------------------------------------------------------
// Hiển thị
// ---------------------------------------------------------------------------
const dashEl = id => document.getElementById(id);
const dashDates = () => ({
  fromDate: dashEl("search-dashboard-from") ? dashEl("search-dashboard-from").value : "",
  toDate: dashEl("search-dashboard-to") ? dashEl("search-dashboard-to").value : ""
});

function dashSetMoney(el, value) {
  if (!el) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) el.textContent = formatVND(value);
  else animateCountUp(el, value);
}

// "+12,3% so với kỳ trước"; ẩn khi không có kỳ trước hoặc kỳ trước bằng 0.
function dashSetDelta(el, current, previous) {
  if (!el) return;
  const show = typeof previous === "number" && previous !== 0;
  el.hidden = !show;
  if (!show) return;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  el.className = `dash-delta ${pct >= 0 ? "dash-delta-up" : "dash-delta-down"}`;
  el.textContent = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% so với kỳ trước`;
}

function renderDashboard() {
  const { fromDate, toDate } = dashDates();
  const display = iso => iso.split("-").reverse().join("/");

  const rangeDisplay = dashEl("dashboard-date-range-display");
  if (rangeDisplay) {
    rangeDisplay.innerText = fromDate && toDate ? `Kỳ báo cáo: ${display(fromDate)} - ${display(toDate)}`
      : fromDate ? `Kỳ báo cáo: Từ ngày ${display(fromDate)}`
      : toDate ? `Kỳ báo cáo: Đến ngày ${display(toDate)}` : "Toàn bộ thời gian";
  }

  renderDashboardHealth(computeDashboardHealth(state, toDate, fromDate));

  // KPI: cùng nguồn Sổ cái với báo cáo
  const kpis = computeDashboardKpis(state, fromDate, toDate);
  dashSetMoney(dashEl("kpi-cash-value"), kpis.cash);
  const cashSub = dashEl("kpi-cash-sub");
  if (cashSub) {
    cashSub.innerHTML = `TM ${formatVND(kpis.cashOnHand)} · <span class="${kpis.bank < 0 ? "dash-text-danger" : ""}">NH ${formatVND(kpis.bank)}</span>`;
  }
  dashSetMoney(dashEl("kpi-revenue-value"), kpis.revenue);
  dashSetDelta(dashEl("kpi-revenue-delta"), kpis.revenue, kpis.prev && kpis.prev.revenue);
  dashSetMoney(dashEl("kpi-gross-value"), kpis.grossProfit);
  const marginEl = dashEl("kpi-gross-margin");
  if (marginEl) {
    marginEl.textContent = kpis.margin === null ? "Chưa có doanh thu"
      : `Biên lãi gộp ${(kpis.margin * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  }
  dashSetDelta(dashEl("kpi-gross-delta"), kpis.grossProfit, kpis.prev && kpis.prev.grossProfit);
  dashSetMoney(dashEl("kpi-inventory-value"), getInventoryValueAt(toDate));
  dashSetMoney(dashEl("kpi-escrow-value"), kpis.escrow);

  const monthlyEl = dashEl("dash-chart-monthly");
  if (monthlyEl) monthlyEl.innerHTML = renderDashboardMonthlyChart(computeDashboardMonthlySeries(state, toDate || dashToday()));

  renderDashboardNegativeStocks();
  renderRecentActivities();
  renderDashboardDebts();

  if (typeof updateSidebarBadges === "function") updateSidebarBadges();
}

const DASH_SEVERITY_LABELS = { danger: "Nghiêm trọng", warning: "Cảnh báo", info: "Lưu ý" };

function renderDashboardHealth(items) {
  const status = dashEl("dash-health-status"), list = dashEl("dash-health-list");
  if (!status || !list) return;
  status.className = `badge ${!items.length ? "badge-success" : items.some(i => i.severity === "danger") ? "badge-danger" : "badge-warning"}`;
  status.textContent = items.length ? `${items.length} vấn đề` : "Sổ sách ổn";
  list.innerHTML = items.length ? items.map(item => `
    <li class="dash-health-item dash-sev-${item.severity}">
      <span class="dash-dot" aria-hidden="true"></span>
      <span class="dash-health-text">
        <span class="dash-health-title"><span class="dash-sr">${DASH_SEVERITY_LABELS[item.severity]}: </span>${escapeHtmlText(item.title)}</span>
        <span class="dash-health-detail font-numeric" title="${escapeHtmlAttr(item.detail)}">${escapeHtmlText(item.detail)}</span>
      </span>
      <button type="button" class="btn btn-secondary btn-sm" aria-label="Xem: ${escapeHtmlAttr(item.title)}"
        onclick="runDashboardAction('${escapeHtmlAttr(item.action)}')">Xem</button>
    </li>`).join("") : '<li class="dash-health-ok">Không có vấn đề nào cần xử lý.</li>';
}

// "debt-audit": bảng kiểm chứng ở tab Công nợ › Tổng quan; "opening-plug"/"payroll-accrual": công cụ sửa
// (về tab Báo cáo/Lương khi module chưa nạp); còn lại là mã tab.
const DASH_TOOL_ACTIONS = { "opening-plug": ["openOpeningBalancePlug", "reports"], "payroll-accrual": ["openPayrollAccrualFixes", "payroll"] };
function runDashboardAction(action) {
  const tool = DASH_TOOL_ACTIONS[action];
  if (tool) {
    if (typeof window[tool[0]] === "function") window[tool[0]]();
    else switchTab(tool[1]);
    return;
  }
  if (action !== "debt-audit") { switchTab(action); return; }
  switchTab("debts");
  if (typeof switchDebtsViewTab === "function") switchDebtsViewTab("overview");
  const audit = dashEl("debt-audit-section");
  if (audit) audit.scrollIntoView({ block: "start" });
}

function filterDashboard() {
  renderDashboard();
}

function clearDashboardDateFilter() {
  if (window.rdpClearInput) {
    rdpClearInput('search-dashboard-from');
    rdpClearInput('search-dashboard-to');
  } else {
    const fromEl = document.getElementById('search-dashboard-from');
    const toEl = document.getElementById('search-dashboard-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  renderDashboard();
}

// Các khoản còn nợ đến toDate: hóa đơn bán chưa tất toán + số dư đầu kỳ đối tác. Dựng một lần cho
// danh sách chưa tất toán, công nợ lâu ngày và biểu đồ tuổi nợ. receivable = khoản phải thu khách hàng.
function buildDashboardDebtItems(toDate) {
  // Ngày số dư đầu kỳ = ngày chứng từ đầu tiên, cùng nguồn với bảng trích lập dự phòng (provisions.js).
  const openingDate = (typeof earliestVoucherDate === "function" && earliestVoucherDate()) || dashToday();
  const todayDay = dashDayNumber(dashToday());
  const items = [];
  state.vouchers.forEach(v => {
    if (v.type !== "sales" || (toDate && v.date > toDate)) return;
    ensureRemainingDebt(v);
    if (!(v.remainingDebt > 0)) return;
    items.push({
      id: v.id, partnerId: v.partnerId, partnerName: getPartnerNameForVoucher(v),
      totalAmount: v.totalAmount || v.amount || 0, remainingDebt: v.remainingDebt,
      date: v.date, isOpening: false, receivable: true
    });
  });
  if (!toDate || openingDate <= toDate) {
    state.partners.forEach(p => {
      const opening = state.partnerOpeningBalances[p.id];
      const receivable = p.type !== "supplier";
      const val = opening ? (receivable ? opening.debit : opening.credit) || 0 : 0;
      if (val > 0) {
        items.push({
          id: `OP-${p.id}`, partnerId: p.id, partnerName: p.name,
          totalAmount: val, remainingDebt: val, date: openingDate, isOpening: true, receivable
        });
      }
    });
  }
  items.forEach(item => { item.days = todayDay - dashDayNumber(item.date); });
  // Nợ lâu nhất lên đầu
  return items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function renderDashboardDebts() {
  const { fromDate, toDate } = dashDates();
  const allItems = buildDashboardDebtItems(toDate);
  const inPeriod = allItems.filter(item => !fromDate || item.date >= fromDate);
  const partnerLink = item => `<a href="#" class="dash-link dash-link-strong" onclick="viewPartnerLedger('${escapeHtmlAttr(item.partnerId)}'); return false;">${escapeHtmlText(item.partnerName)}</a>`;
  const money = value => formatVND(value).replace("đ", "");

  // 1. Đơn hàng chưa tất toán — tối đa 30 dòng nợ lâu nhất để tránh quá tải DOM
  const unsettledTbody = dashEl("dashboard-unsettled-orders");
  if (unsettledTbody) {
    const rows = inPeriod.slice(0, 30);
    if (!rows.length) {
      renderEmptyState(unsettledTbody, 5, 'Không có đơn hàng nào đang nợ', 'Tất cả đơn hàng đã được thanh toán đủ');
    } else {
      unsettledTbody.innerHTML = rows.map(item => {
        const escapedId = escapeHtmlAttr(item.id);
        const idCol = item.isOpening
          ? `<span class="dash-text-muted">Dư đầu kỳ</span>`
          : `<a href="#" class="dash-link" onclick="viewVoucher('${escapedId}'); return false;">${escapedId}</a>`;
        return `
          <tr>
            <td class="dash-cell-strong">${idCol}</td>
            <td>${partnerLink(item)}</td>
            <td class="text-right font-numeric">${money(item.totalAmount)}</td>
            <td class="text-right font-numeric dash-text-warning">${money(item.remainingDebt)}</td>
            <td class="dash-cell-center">
              <button class="btn btn-secondary btn-sm" onclick="promptEditOrderDebt('${escapedId}')">Sửa</button>
            </td>
          </tr>`;
      }).join("");
    }
  }

  // 2. Công nợ phải thu lâu ngày
  const agedTbody = dashEl("dashboard-aged-debts");
  if (agedTbody) {
    const rows = inPeriod.filter(item => item.receivable).slice(0, 30);
    if (!rows.length) {
      renderEmptyState(agedTbody, 4, 'Không có công nợ quá hạn', 'Không có khoản nợ nào vượt hạn thanh toán');
    } else {
      agedTbody.innerHTML = rows.map(item => `
        <tr>
          <td>${partnerLink(item)}</td>
          <td class="text-right font-numeric dash-text-warning">${money(item.remainingDebt)}</td>
          <td>${formatDateDisplay(item.date)}${item.isOpening ? " (Đầu kỳ)" : ""}</td>
          <td class="dash-cell-center"><span class="badge ${item.days > 90 ? "badge-danger" : item.days > 30 ? "badge-warning" : "badge-info"}">${item.days} ngày</span></td>
        </tr>`).join("");
    }
  }

  // 3. Tuổi nợ phải thu: mọi khoản còn nợ đến toDate (không cắt theo từ ngày), tuổi tính đến hôm nay
  const agingEl = dashEl("dash-chart-aging");
  if (agingEl) agingEl.innerHTML = renderDashboardAgingChart(computeDashboardAging(allItems.filter(item => item.receivable), dashToday()));

  // 4. Công nợ theo Sổ cái — cùng cách phân loại theo vai trò với màn Công nợ (getDebtKpiParts trong debts.js)
  const kpiDebts = toDate ? calculatePartnerDebts("", toDate) : calculatePartnerDebts();
  let totalRec = 0, totalPay = 0, totalSupplierReceivable = 0;
  kpiDebts.forEach(d => {
    const parts = getDebtKpiParts(d);
    totalRec += parts.receivable;
    totalPay += parts.payable;
    totalSupplierReceivable += parts.supplierReceivable;
  });
  const setText = (id, value) => { const el = dashEl(id); if (el) el.innerText = formatVND(value); };
  setText("kpi-debt-receivable", totalRec);
  setText("kpi-debt-payable", totalPay);
  setText("kpi-debt-supplier-receivable", totalSupplierReceivable);
}

function renderDashboardNegativeStocks() {
  const tbody = document.getElementById("dashboard-negative-stock-list");
  const countEl = document.getElementById("dashboard-negative-stock-count");
  if (!tbody || !countEl) return;

  const negativeProducts = (state.products || []).filter(p => (p.stock || 0) < 0);
  countEl.innerText = `${negativeProducts.length} sản phẩm`;
  countEl.className = `badge ${negativeProducts.length ? "badge-danger" : "badge-success"}`;
  if (negativeProducts.length === 0) {
    renderEmptyState(tbody, 5, 'Không có sản phẩm nào bị âm kho', 'Tồn kho các sản phẩm đều trong giới hạn cho phép');
    return;
  }

  tbody.innerHTML = negativeProducts.map(p => {
    const escapedId = escapeHtmlAttr(p.id);
    const stockVal = Number((p.stock || 0).toFixed(3));
    return `
      <tr>
        <td class="font-numeric dash-cell-strong">
          <a href="#" class="dash-link" onclick="viewStockLedgerForProduct('${escapedId}'); return false;">${escapeHtmlText(p.id)}</a>
        </td>
        <td class="dash-cell-strong">${escapeHtmlText(p.name)}</td>
        <td class="dash-cell-center">${escapeHtmlText(p.unit || 'Cái')}</td>
        <td class="text-right font-numeric dash-text-danger">${stockVal}</td>
        <td class="text-right font-numeric">${formatVND(p.avgCost || 0)}</td>
      </tr>
    `;
  }).join("");
}

function renderRecentActivities() {
  const container = document.getElementById("dashboard-recent-activities");
  if (!container) return;

  const { fromDate, toDate } = dashDates();

  // Lấy tối đa 6 giao dịch gần nhất
  let recents = [...state.vouchers];
  if (fromDate) recents = recents.filter(v => v.date >= fromDate);
  if (toDate) recents = recents.filter(v => v.date <= toDate);
  recents = recents.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  if (recents.length === 0) {
    container.innerHTML = `<p class="dash-chart-empty">Không có giao dịch gần đây trong khoảng thời gian này.</p>`;
    return;
  }

  const badgeLabels = {
    purchase: "Mua hàng",
    purchase_order: "Đơn đặt hàng",
    purchase_return: "Hàng trả lại",
    sales: "Bán hàng",
    escrow_pay: "Ký quỹ đi",
    escrow_receive: "Nhận ký quỹ",
    escrow_refund_pay: "Thu ký quỹ",
    escrow_refund_receive: "Trả ký quỹ"
  };

  container.innerHTML = recents.map(v => {
    const amount = v.totalAmount || v.amount || 0;
    return `
      <div class="activity-item type-${v.type}">
        <div class="activity-desc">
          <span class="activity-title">${escapeHtmlText(v.description)}</span>
          <span class="activity-date">${formatDateDisplay(v.date)} &bull; ${escapeHtmlText(v.id)}</span>
        </div>
        <div class="dash-activity-side">
          <span class="activity-price font-numeric">${formatVND(amount)}</span>
          <span class="badge dash-badge-sm ${v.type === 'sales' ? 'badge-success' : v.type === 'purchase' ? 'badge-info' : v.type === 'purchase_order' ? 'badge-warning' : v.type === 'purchase_return' ? 'badge-danger' : 'badge-secondary'}">
            ${badgeLabels[v.type] || "Chứng từ"}
          </span>
        </div>
      </div>
    `;
  }).join("");
}
// Dashboard
window.renderDashboard = renderDashboard;
window.filterDashboard = filterDashboard;
window.computeDashboardKpis = computeDashboardKpis;
window.computeDashboardHealth = computeDashboardHealth;
window.computeDashboardMonthlySeries = computeDashboardMonthlySeries;
window.computeDashboardAging = computeDashboardAging;
window.runDashboardAction = runDashboardAction;
window.clearDashboardDateFilter = clearDashboardDateFilter;
