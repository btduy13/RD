
function renderDashboard() {
  const fromDate = document.getElementById("search-dashboard-from") ? document.getElementById("search-dashboard-from").value : "";
  const toDate = document.getElementById("search-dashboard-to") ? document.getElementById("search-dashboard-to").value : "";

  // Cập nhật nhãn kỳ báo cáo hiển thị
  const rangeDisplay = document.getElementById("dashboard-date-range-display");
  if (rangeDisplay) {
    if (fromDate && toDate) {
      rangeDisplay.innerText = `Kỳ báo cáo: ${fromDate.split("-").reverse().join("/")} - ${toDate.split("-").reverse().join("/")}`;
    } else if (fromDate) {
      rangeDisplay.innerText = `Kỳ báo cáo: Từ ngày ${fromDate.split("-").reverse().join("/")}`;
    } else if (toDate) {
      rangeDisplay.innerText = `Kỳ báo cáo: Đến ngày ${toDate.split("-").reverse().join("/")}`;
    } else {
      rangeDisplay.innerText = "Toàn bộ thời gian";
    }
  }

  // A. Tổng quỹ tiền: Dư nợ TK 111 + TK 112 (tính lũy kế đến toDate)
  const bal111 = getAccountBalance("111", toDate);
  const bal112 = getAccountBalance("112", toDate);
  document.getElementById("kpi-cash-value").innerText = formatVND(bal111 + bal112);

  // B. Tổng doanh thu kỳ này: Tổng Có phát sinh TK 511 (trong khoảng từ/đến ngày)
  let totalRevenue = 0;
  state.vouchers.forEach(v => {
    if (v.type === "sales") {
      if (fromDate && v.date < fromDate) return;
      if (toDate && v.date > toDate) return;
      v.items.forEach(item => {
        totalRevenue += item.amount;
      });
    }
  });
  document.getElementById("kpi-revenue-value").innerText = formatVND(totalRevenue);

  // C. Giá trị tồn kho: Tổng giá trị hàng hóa (lũy kế đến toDate)
  const totalInventoryVal = getInventoryValueAt(toDate);
  document.getElementById("kpi-inventory-value").innerText = formatVND(totalInventoryVal);

  const acctEscrowPay = state.accountingStandard === "TT200" ? "244" : "1386";
  const acctEscrowReceive = state.accountingStandard === "TT200" ? "344" : "3386";
  const bal244 = getAccountBalance(acctEscrowPay, toDate);
  const bal344 = getAccountBalance(acctEscrowReceive, toDate);

  const escrowValueEl = document.getElementById("kpi-escrow-value");
  if (escrowValueEl) {
    escrowValueEl.innerText = formatVND(bal244 + bal344);
  }

  // CẢNH BÁO SẢN PHẨM ÂM KHO
  renderDashboardNegativeStocks();

  // RENDER HOẠT ĐỘNG GẦN ĐÂY
  renderRecentActivities();

  // RENDER CÔNG NỢ & ĐƠN HÀNG CHƯA TẤT TOÁN
  renderDashboardDebts();
}

function filterDashboard() {
  renderDashboard();
}

function clearDashboardDateFilter() {
  const fromEl = document.getElementById("search-dashboard-from");
  const toEl = document.getElementById("search-dashboard-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  renderDashboard();
}

function renderDashboardDebts() {
  const fromDate = document.getElementById("search-dashboard-from") ? document.getElementById("search-dashboard-from").value : "";
  const toDate = document.getElementById("search-dashboard-to") ? document.getElementById("search-dashboard-to").value : "";

  // 1. Render các đơn hàng chưa tất toán (đang nợ)
  const unsettledTbody = document.getElementById("dashboard-unsettled-orders");
  if (unsettledTbody) {
    unsettledTbody.innerHTML = "";

    const unsettled = [];

    // A. Thêm các hóa đơn bán hàng chưa tất toán
    let salesVouchers = state.vouchers.filter(v => v.type === "sales");
    if (fromDate) salesVouchers = salesVouchers.filter(v => v.date >= fromDate);
    if (toDate) salesVouchers = salesVouchers.filter(v => v.date <= toDate);

    salesVouchers.forEach(v => {
      const totalAmt = v.totalAmount || v.amount || 0;
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131") ? totalAmt : 0;
      }
      if (v.remainingDebt > 0) {
        unsettled.push({
          id: v.id,
          partnerId: v.partnerId,
          partnerName: getPartnerNameForVoucher(v),
          totalAmount: totalAmt,
          remainingDebt: v.remainingDebt,
          date: v.date,
          isOpening: false
        });
      }
    });

    // B. Thêm các công nợ đầu kỳ của đối tác
    state.partners.forEach(p => {
      if (fromDate && "2026-01-01" < fromDate) return;
      if (toDate && "2026-01-01" > toDate) return;
      const opening = state.partnerOpeningBalances[p.id];
      if (opening) {
        const val = p.type === "customer" ? (opening.debit || 0) : (opening.credit || 0);
        if (val > 0) {
          unsettled.push({
            id: `OP-${p.id}`,
            partnerId: p.id,
            partnerName: p.name,
            totalAmount: val,
            remainingDebt: val,
            date: "2026-01-01",
            isOpening: true
          });
        }
      }
    });

    // Sắp xếp đơn hàng nợ lâu nhất lên đầu
    unsettled.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (unsettled.length === 0) {
      unsettledTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:15px;">Không có đơn hàng nào đang nợ</td></tr>`;
    } else {
      unsettled.forEach(item => {
        const tr = document.createElement("tr");
        const isOp = item.isOpening;
        const escapedId = escapeHtmlAttr(item.id);
        const escapedPartnerId = escapeHtmlAttr(item.partnerId);
        const idCol = isOp
          ? `<span style="color:var(--text-secondary); font-style:italic;">Dư đầu kỳ</span>`
          : `<a href="#" onclick="viewVoucher('${escapedId}'); return false;" style="color:var(--color-primary);">${escapedId}</a>`;

        tr.innerHTML = `
          <td style="font-weight:bold;">${idCol}</td>
          <td><a href="#" onclick="viewPartnerLedger('${escapedPartnerId}'); return false;" style="font-weight:600; color:var(--text-primary); text-decoration:underline;">${item.partnerName}</a></td>
          <td style="text-align:right;" class="font-numeric">${formatVND(item.totalAmount).replace("đ", "")}</td>
          <td style="text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${formatVND(item.remainingDebt).replace("đ", "")}</td>
          <td style="text-align:center;">
            <button class="btn btn-secondary btn-sm" onclick="promptEditOrderDebt('${escapedId}')" style="padding: 2px 6px; font-size:11px;">Sửa</button>
          </td>
        `;
        unsettledTbody.appendChild(tr);
      });
    }
  }

  // 2. Render nhắc nhở các công nợ chưa thu được lâu ngày
  const agedTbody = document.getElementById("dashboard-aged-debts");
  if (agedTbody) {
    agedTbody.innerHTML = "";

    const agedDebts = [];
    const today = new Date("2026-05-25");

    // A. Thêm hóa đơn bán hàng chưa tất toán
    let salesVouchers = state.vouchers.filter(v => v.type === "sales");
    if (fromDate) salesVouchers = salesVouchers.filter(v => v.date >= fromDate);
    if (toDate) salesVouchers = salesVouchers.filter(v => v.date <= toDate);

    salesVouchers.forEach(v => {
      const totalAmt = v.totalAmount || v.amount || 0;
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131") ? totalAmt : 0;
      }

      if (v.remainingDebt > 0) {
        const docDate = new Date(v.date);
        const diffTime = today - docDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        agedDebts.push({
          partnerId: v.partnerId,
          partnerName: getPartnerNameForVoucher(v),
          remainingDebt: v.remainingDebt,
          date: v.date,
          days: diffDays
        });
      }
    });

    // B. Thêm các công nợ đầu kỳ đối tác (đặc biệt là khách hàng nợ lâu ngày)
    state.partners.forEach(p => {
      if (fromDate && "2026-01-01" < fromDate) return;
      if (toDate && "2026-01-01" > toDate) return;
      if (p.type === "customer") {
        const opening = state.partnerOpeningBalances[p.id];
        const val = opening ? (opening.debit || 0) : 0;
        if (val > 0) {
          const docDate = new Date("2026-01-01");
          const diffTime = today - docDate;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          agedDebts.push({
            partnerId: p.id,
            partnerName: p.name,
            remainingDebt: val,
            date: "01/01/2026 (Đầu kỳ)",
            days: diffDays
          });
        }
      }
    });

    // Ưu tiên nợ trễ nhiều ngày nhất lên đầu
    agedDebts.sort((a, b) => b.days - a.days);

    if (agedDebts.length === 0) {
      agedTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:15px;">Không có công nợ quá hạn</td></tr>`;
    } else {
      agedDebts.forEach(item => {
        const tr = document.createElement("tr");

        let dayClass = "badge-info";
        let dayLabel = `${item.days} ngày`;
        if (item.days > 90) {
          dayClass = "badge-danger";
        } else if (item.days > 30) {
          dayClass = "badge-warning";
        }

        tr.innerHTML = `
          <td><a href="#" onclick="viewPartnerLedger('${escapeHtmlAttr(item.partnerId)}'); return false;" style="font-weight:600; color:var(--text-primary); text-decoration:underline;">${item.partnerName}</a></td>
          <td style="text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${formatVND(item.remainingDebt).replace("đ", "")}</td>
          <td>${item.date}</td>
          <td style="text-align:center;"><span class="badge ${dayClass}">${dayLabel}</span></td>
        `;
        agedTbody.appendChild(tr);
      });
    }
  }

  // 3. Render giá trị KPI công nợ
  const kpiReceivable = document.getElementById("kpi-debt-receivable");
  const kpiPayable = document.getElementById("kpi-debt-payable");

  if (kpiReceivable || kpiPayable) {
    const calculatedDebts = calculatePartnerDebts(toDate);
    let totalRec = 0;
    let totalPay = 0;
    calculatedDebts.forEach(d => {
      totalRec += d.closingDebit;
      totalPay += d.closingCredit;
    });
    if (kpiReceivable) kpiReceivable.innerText = formatVND(totalRec);
    if (kpiPayable) kpiPayable.innerText = formatVND(totalPay);
  }
}

function renderDashboardNegativeStocks() {
  const tbody = document.getElementById("dashboard-negative-stock-list");
  const countEl = document.getElementById("dashboard-negative-stock-count");
  if (!tbody || !countEl) return;

  const negativeProducts = (state.products || []).filter(p => (p.stock || 0) < 0);
  countEl.innerText = `${negativeProducts.length} sản phẩm`;
  if (negativeProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Không có sản phẩm nào bị âm kho.</td></tr>`;
    return;
  }

  tbody.innerHTML = negativeProducts.map(p => {
    const escapedId = escapeHtmlAttr(p.id);
    const stockVal = Number((p.stock || 0).toFixed(3));
    return `
      <tr>
        <td class="font-numeric" style="font-weight: 700;">
          <a onclick="viewStockLedgerForProduct('${escapedId}')" style="cursor: pointer; color: var(--color-primary); text-decoration: underline;">${p.id}</a>
        </td>
        <td><span style="font-weight: 600; color: var(--text-primary);">${p.name}</span></td>
        <td style="text-align: center;">${p.unit || 'Cái'}</td>
        <td class="text-right font-numeric" style="color: var(--color-danger); font-weight: 700;">${stockVal}</td>
        <td class="text-right font-numeric">${formatVND(p.avgCost || 0)}</td>
      </tr>
    `;
  }).join("");
}

function renderRecentActivities() {
  const container = document.getElementById("dashboard-recent-activities");
  if (!container) return;

  const fromDate = document.getElementById("search-dashboard-from") ? document.getElementById("search-dashboard-from").value : "";
  const toDate = document.getElementById("search-dashboard-to") ? document.getElementById("search-dashboard-to").value : "";

  // Lấy tối đa 6 giao dịch gần nhất
  let recents = [...state.vouchers];
  if (fromDate) recents = recents.filter(v => v.date >= fromDate);
  if (toDate) recents = recents.filter(v => v.date <= toDate);
  recents = recents.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  if (recents.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">Không có giao dịch gần đây trong khoảng thời gian này.</div>`;
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
          <span class="activity-title">${v.description}</span>
          <span class="activity-date">${v.date} &bull; ${v.id}</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
          <span class="activity-price font-numeric">${formatVND(amount)}</span>
          <span class="badge ${v.type === 'sales' ? 'badge-success' : v.type === 'purchase' ? 'badge-info' : v.type === 'purchase_order' ? 'badge-warning' : v.type === 'purchase_return' ? 'badge-danger' : 'badge-secondary'}" style="font-size:9px; padding:2px 6px;">
            ${badgeLabels[v.type] || "Chứng từ"}
          </span>
        </div>
      </div>
    `;
  }).join("");
}
// Dashboard
window.filterDashboard = filterDashboard;
window.clearDashboardDateFilter = clearDashboardDateFilter;