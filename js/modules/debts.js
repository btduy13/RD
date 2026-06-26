let filteredDebtsList = [];
let currentDebtsViewTab = 'project'; // 'project' | 'partner'
let filteredDebtsGroupedList = [];
let debtsGroupedPage = 1;
let activePartnerNameForGroupedLedger = "";

// --- Phân hệ Công nợ ---
function calculatePartnerDebts(toDate = "") {
  const debts = {};

  state.partners.forEach(p => {
    const opening = state.partnerOpeningBalances[p.id] || { debit: 0, credit: 0 };
    debts[p.id] = {
      id: p.id,
      name: p.name,
      type: p.type,
      address: p.address || "",
      taxCode: p.taxCode || "",
      phone: p.phone || "",
      openingDebit: opening.debit || 0,
      openingCredit: opening.credit || 0,
      debitTrans: 0,
      creditTrans: 0,
      closingDebit: 0,
      closingCredit: 0
    };
  });

  state.vouchers.forEach(v => {
    if (toDate && v.date > toDate) return;
    if (!v.entries) return;
    const pId = v.partnerId;
    const d = debts[pId];
    if (!d) return;

    v.entries.forEach(e => {
      // Khách hàng (customer): chỉ đọc TK 131
      if (d.type === "customer") {
        if (e.debit.startsWith("131"))  d.debitTrans  += e.amount; // Tăng phải thu (bán chịu)
        if (e.credit.startsWith("131")) d.creditTrans += e.amount; // Giảm phải thu (thu tiền / trả lại)
      }
      // Nhà cung cấp (supplier): chỉ đọc TK 331
      else if (d.type === "supplier") {
        if (e.credit.startsWith("331")) d.creditTrans += e.amount; // Tăng phải trả (mua chịu)
        if (e.debit.startsWith("331"))  d.debitTrans  += e.amount; // Giảm phải trả (thanh toán / trả hàng)
      }
      // Đối tác cả 2 loại (both): đọc cả 131 lẫn 331, nhưng theo đúng chiều
      else {
        if (e.debit.startsWith("131"))  d.debitTrans  += e.amount;
        if (e.credit.startsWith("131")) d.creditTrans += e.amount;
        if (e.credit.startsWith("331")) d.creditTrans += e.amount;
        if (e.debit.startsWith("331"))  d.debitTrans  += e.amount;
      }
    });
  });

  Object.keys(debts).forEach(id => {
    const d = debts[id];
    if (d.type === "customer") {
      const balance = d.openingDebit - d.openingCredit + d.debitTrans - d.creditTrans;
      if (balance >= 0) {
        d.closingDebit = balance;
        d.closingCredit = 0;
      } else {
        d.closingDebit = 0;
        d.closingCredit = -balance;
      }
    } else {
      const balance = d.openingCredit - d.openingDebit + d.creditTrans - d.debitTrans;
      if (balance >= 0) {
        d.closingCredit = balance;
        d.closingDebit = 0;
      } else {
        d.closingCredit = 0;
        d.closingDebit = -balance;
      }
    }
  });

  return Object.values(debts);
}

function renderDebtsTable() {
  const tbody = document.getElementById("debts-table-body");
  if (!tbody) return;

  const debtsItemsPerPage = 30;
  const total = filteredDebtsList.length;
  const totalPages = Math.ceil(total / debtsItemsPerPage) || 1;

  if (debtsPage > totalPages) debtsPage = totalPages;
  if (debtsPage < 1) debtsPage = 1;

  const startIdx = (debtsPage - 1) * debtsItemsPerPage;
  const endIdx = startIdx + debtsItemsPerPage;
  const pageItems = filteredDebtsList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy công nợ đối tác nào</td></tr>`;
  } else {
    // Tính tổng cộng cho toàn bộ danh sách đã lọc (filteredDebtsList)
    let totalOpeningDebit = 0;
    let totalOpeningCredit = 0;
    let totalDebitTrans = 0;
    let totalCreditTrans = 0;
    let totalClosingDebit = 0;
    let totalClosingCredit = 0;

    filteredDebtsList.forEach(d => {
      totalOpeningDebit += d.openingDebit || 0;
      totalOpeningCredit += d.openingCredit || 0;
      totalDebitTrans += d.debitTrans || 0;
      totalCreditTrans += d.creditTrans || 0;
      totalClosingDebit += d.closingDebit || 0;
      totalClosingCredit += d.closingCredit || 0;
    });

    const trTotal = document.createElement("tr");
    trTotal.style.fontWeight = "bold";
    trTotal.style.backgroundColor = "var(--bg-tertiary)";
    trTotal.style.borderBottom = "2px solid var(--border-color)";
    trTotal.innerHTML = `
      <td></td>
      <td></td>
      <td style="font-weight:bold; color:var(--text-primary);">TỔNG CỘNG</td>
      <td style="text-align:right; font-weight:bold;" class="font-numeric">${totalOpeningDebit > 0 ? formatVND(totalOpeningDebit).replace("đ", "") : "-"}</td>
      <td style="text-align:right; font-weight:bold;" class="font-numeric">${totalOpeningCredit > 0 ? formatVND(totalOpeningCredit).replace("đ", "") : "-"}</td>
      <td style="text-align:right; color:var(--color-primary); font-weight:bold;" class="font-numeric">${totalDebitTrans > 0 ? formatVND(totalDebitTrans).replace("đ", "") : "-"}</td>
      <td style="text-align:right; color:var(--color-warning); font-weight:bold;" class="font-numeric">${totalCreditTrans > 0 ? formatVND(totalCreditTrans).replace("đ", "") : "-"}</td>
      <td style="text-align:right; font-weight:bold; color:var(--color-success);" class="font-numeric">${totalClosingDebit > 0 ? formatVND(totalClosingDebit).replace("đ", "") : "-"}</td>
      <td style="text-align:right; font-weight:bold; color:var(--color-warning);" class="font-numeric">${totalClosingCredit > 0 ? formatVND(totalClosingCredit).replace("đ", "") : "-"}</td>
      <td></td>
    `;
    tbody.appendChild(trTotal);

    pageItems.forEach(d => {
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(d.id);
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "partner");
      tr.setAttribute("data-id", escapedId);
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="debt-checkbox" value="${escapedId}" onchange="updateBatchDebtsUI()">
        </td>
        <td style="font-weight:bold; color:var(--color-primary);">${d.id}</td>
        <td style="font-weight:600;"><a href="#" onclick="viewPartnerLedger('${escapedId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${d.name}</a></td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${d.openingDebit > 0 ? formatVND(d.openingDebit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${d.openingCredit > 0 ? formatVND(d.openingCredit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; color:var(--color-primary); font-weight:500;" class="font-numeric">${d.debitTrans > 0 ? formatVND(d.debitTrans).replace("đ", "") : "-"}</td>
        <td style="text-align:right; color:var(--color-warning); font-weight:500;" class="font-numeric">${d.creditTrans > 0 ? formatVND(d.creditTrans).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${d.closingDebit > 0 ? 'text-success' : ''}">${d.closingDebit > 0 ? formatVND(d.closingDebit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${d.closingCredit > 0 ? 'text-warning' : ''}">${d.closingCredit > 0 ? formatVND(d.closingCredit).replace("đ", "") : "-"}</td>
        <td style="text-align:center;">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="btn btn-secondary btn-sm" onclick="viewPartnerLedger('${escapedId}')" style="padding: 2px 8px;">Xem Sổ</button>
            <button class="btn btn-primary btn-sm" onclick="promptEditPartnerOpeningDebt('${escapedId}')" style="padding: 2px 8px; background-color: var(--color-primary); border-color: var(--color-primary);">Sửa</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const paginationInfo = document.getElementById("debts-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} đối tác (Trang ${debtsPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  // Reset check-all-debts checkbox
  const checkAll = document.getElementById("check-all-debts");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchDebtsUI === "function") updateBatchDebtsUI();

  // Render pagination controls
  const paginationControls = document.getElementById("debts-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(1)" ${debtsPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(${debtsPage - 1})" ${debtsPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, debtsPage - 2);
      let endPage = Math.min(totalPages, debtsPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === debtsPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeDebtsPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === debtsPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(${debtsPage + 1})" ${debtsPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(${totalPages})" ${debtsPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} của ${total} đối tác
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }
}

function changeDebtsPage(p) {
  debtsPage = p;
  renderDebtsTable();
}

function filterDebts() {
  const query = document.getElementById("debt-search-input") ? document.getElementById("debt-search-input").value : "";
  const filterType = document.getElementById("debt-type-filter") ? document.getElementById("debt-type-filter").value : "all";
  const activeOnly = document.getElementById("debt-active-only-filter") ? document.getElementById("debt-active-only-filter").checked : false;

  const allDebts = calculatePartnerDebts();

  filteredDebtsList = allDebts.filter(d => {
    const combined = `${d.id || ""}\t${d.name || ""}`;
    const debtVal = Math.max(d.closingDebit || 0, d.closingCredit || 0);
    const matchesQuery = matchAdvancedQuery(combined, query, debtVal);

    let matchesType = true;
    if (filterType === "131") {
      matchesType = d.type === "customer";
    } else if (filterType === "331") {
      matchesType = d.type === "supplier";
    }

    let matchesActive = true;
    if (activeOnly) {
      matchesActive = (d.closingDebit > 0 || d.closingCredit > 0);
    }

    return matchesQuery && matchesType && matchesActive;
  });

  debtsPage = 1;

  if (currentDebtsViewTab === 'partner') {
    // --- Tab 2: Theo Đối tác ---
    const allGrouped = calculatePartnerDebtsGrouped();
    filteredDebtsGroupedList = allGrouped.filter(g => {
      const debtVal = Math.max(g.closingDebit || 0, g.closingCredit || 0);
      const matchesQuery = matchAdvancedQuery(g.name || '', query, debtVal);

      let matchesType = true;
      if (filterType === "131") matchesType = g.primaryType === "customer";
      else if (filterType === "331") matchesType = g.primaryType === "supplier";

      let matchesActive = true;
      if (activeOnly) matchesActive = (g.closingDebit > 0 || g.closingCredit > 0);

      return matchesQuery && matchesType && matchesActive;
    });
    debtsGroupedPage = 1;
    renderDebtsGroupedTable();
  } else {
    renderDebtsTable();
  }
}

// Tính công nợ gộp theo tên đối tác (case-insensitive)
function calculatePartnerDebtsGrouped() {
  const allDebts = calculatePartnerDebts();

  // Build map: normalizedName → group
  const groups = {};
  allDebts.forEach(d => {
    const key = (d.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!groups[key]) {
      groups[key] = {
        name: d.name, // giữ tên gốc của mã đầu tiên
        primaryType: d.type,
        openingDebit: 0,
        openingCredit: 0,
        debitTrans: 0,
        creditTrans: 0,
        closingDebit: 0,
        closingCredit: 0,
        childIds: [],       // danh sách mã thành phần
        childNames: [],     // danh sách tên gốc của từng mã
      };
    }
    const g = groups[key];
    g.openingDebit  += d.openingDebit  || 0;
    g.openingCredit += d.openingCredit || 0;
    g.debitTrans    += d.debitTrans    || 0;
    g.creditTrans   += d.creditTrans   || 0;
    g.childIds.push(d.id);
    g.childNames.push(d.id); // dùng mã để hiển thị
    // Nếu có nhiều loại, ưu tiên 'customer' rồi 'supplier' rồi 'both'
    if (d.type === 'customer') g.primaryType = 'customer';
    else if (d.type === 'supplier' && g.primaryType !== 'customer') g.primaryType = 'supplier';
  });

  // Tính lại số dư cuối kỳ dựa trên tổng gộp
  return Object.values(groups).map(g => {
    const balance = g.openingDebit - g.openingCredit + g.debitTrans - g.creditTrans;
    if (g.primaryType === 'customer') {
      // customer: Nợ > 0 là KH đang nợ; Có > 0 là công ty nợ KH
      if (balance >= 0) { g.closingDebit = balance; g.closingCredit = 0; }
      else               { g.closingDebit = 0; g.closingCredit = -balance; }
    } else {
      // supplier
      const supBalance = g.openingCredit - g.openingDebit + g.creditTrans - g.debitTrans;
      if (supBalance >= 0) { g.closingCredit = supBalance; g.closingDebit = 0; }
      else                  { g.closingCredit = 0; g.closingDebit = -supBalance; }
    }
    return g;
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

// Render bảng Tab 2: Theo Đối tác
function renderDebtsGroupedTable() {
  const tbody = document.getElementById('debts-by-partner-body');
  const infoEl = document.getElementById('debts-by-partner-info');
  const paginEl = document.getElementById('debts-by-partner-pagination');
  if (!tbody) return;

  const perPage = 30;
  const total = filteredDebtsGroupedList.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  if (debtsGroupedPage > totalPages) debtsGroupedPage = totalPages;
  if (debtsGroupedPage < 1) debtsGroupedPage = 1;

  const startIdx = (debtsGroupedPage - 1) * perPage;
  const pageItems = filteredDebtsGroupedList.slice(startIdx, startIdx + perPage);

  if (infoEl) infoEl.innerText = `Hiển thị ${startIdx + 1}–${Math.min(startIdx + perPage, total)} trong số ${total} đối tác (gộp theo tên)`;

  tbody.innerHTML = '';
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy đối tác nào</td></tr>`;
  } else {
    // Dòng TỔNG CỘNG
    let totOD = 0, totOC = 0, totDT = 0, totCT = 0, totCD = 0, totCC = 0;
    filteredDebtsGroupedList.forEach(g => {
      totOD += g.openingDebit  || 0;
      totOC += g.openingCredit || 0;
      totDT += g.debitTrans    || 0;
      totCT += g.creditTrans   || 0;
      totCD += g.closingDebit  || 0;
      totCC += g.closingCredit || 0;
    });
    const trTot = document.createElement('tr');
    trTot.style.fontWeight = 'bold';
    trTot.style.backgroundColor = 'var(--bg-tertiary)';
    trTot.style.borderBottom = '2px solid var(--border-color)';
    trTot.innerHTML = `
      <td style="font-weight:bold; color:var(--text-primary);">TỔNG CỘNG</td>
      <td></td>
      <td style="text-align:right; font-weight:bold;" class="font-numeric">${totOD > 0 ? formatVND(totOD).replace('đ','') : '-'}</td>
      <td style="text-align:right; font-weight:bold;" class="font-numeric">${totOC > 0 ? formatVND(totOC).replace('đ','') : '-'}</td>
      <td style="text-align:right; color:var(--color-primary); font-weight:bold;" class="font-numeric">${totDT > 0 ? formatVND(totDT).replace('đ','') : '-'}</td>
      <td style="text-align:right; color:var(--color-warning); font-weight:bold;" class="font-numeric">${totCT > 0 ? formatVND(totCT).replace('đ','') : '-'}</td>
      <td style="text-align:right; font-weight:bold; color:var(--color-success);" class="font-numeric">${totCD > 0 ? formatVND(totCD).replace('đ','') : '-'}</td>
      <td style="text-align:right; font-weight:bold; color:var(--color-warning);" class="font-numeric">${totCC > 0 ? formatVND(totCC).replace('đ','') : '-'}</td>
      <td></td>
    `;
    tbody.appendChild(trTot);

    pageItems.forEach(g => {
      const encodedName = encodeURIComponent(g.name);
      const countBadge = g.childIds.length > 1
        ? `<span style="display:inline-block; background:var(--color-primary); color:#fff; border-radius:9px; padding:1px 8px; font-size:11px; font-weight:700; margin-left:6px;">${g.childIds.length} mã</span>`
        : '';
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.innerHTML = `
        <td style="font-weight:600;">
          <a href="#" onclick="viewGroupedPartnerLedger(decodeURIComponent('${encodedName}')); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${g.name}</a>
          ${countBadge}
        </td>
        <td style="text-align:center;">
          <button onclick="toggleGroupChildren(this)" style="font-size:11px; padding:2px 8px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary); cursor:pointer; color:var(--text-secondary);">Xem mã</button>
          <div class="group-children" style="display:none; margin-top:6px; font-size:11px; color:var(--text-muted); line-height:1.7;">${g.childNames.map(id => `<span style='display:block;'>• ${id}</span>`).join('')}</div>
        </td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${g.openingDebit > 0 ? formatVND(g.openingDebit).replace('đ','') : '-'}</td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${g.openingCredit > 0 ? formatVND(g.openingCredit).replace('đ','') : '-'}</td>
        <td style="text-align:right; color:var(--color-primary); font-weight:500;" class="font-numeric">${g.debitTrans > 0 ? formatVND(g.debitTrans).replace('đ','') : '-'}</td>
        <td style="text-align:right; color:var(--color-warning); font-weight:500;" class="font-numeric">${g.creditTrans > 0 ? formatVND(g.creditTrans).replace('đ','') : '-'}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${g.closingDebit > 0 ? 'text-success' : ''}">${g.closingDebit > 0 ? formatVND(g.closingDebit).replace('đ','') : '-'}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${g.closingCredit > 0 ? 'text-warning' : ''}">${g.closingCredit > 0 ? formatVND(g.closingCredit).replace('đ','') : '-'}</td>
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="viewGroupedPartnerLedger(decodeURIComponent('${encodedName}'))" style="padding:2px 8px;">Xem Sổ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Phân trang
  if (paginEl) {
    if (totalPages <= 1) {
      paginEl.style.display = 'none';
    } else {
      paginEl.style.display = 'flex';
      let html = `<span style="font-size:12px; color:var(--text-secondary); font-weight:500;">Hiển thị ${startIdx+1}–${Math.min(startIdx+perPage,total)} của ${total}</span><div style="display:flex; gap:4px; align-items:center;">`;
      html += `<button class="btn btn-secondary btn-sm" onclick="changeDebtsGroupedPage(1)" ${debtsGroupedPage===1?'disabled':''} style="padding:4px 10px; font-size:12px;">« Đầu</button>`;
      html += `<button class="btn btn-secondary btn-sm" onclick="changeDebtsGroupedPage(${debtsGroupedPage-1})" ${debtsGroupedPage===1?'disabled':''} style="padding:4px 10px; font-size:12px;">‹ Trước</button>`;
      const sp = Math.max(1, debtsGroupedPage-2), ep = Math.min(totalPages, debtsGroupedPage+2);
      for (let p = sp; p <= ep; p++) {
        html += `<button class="btn ${p===debtsGroupedPage?'btn-success':'btn-secondary'} btn-sm" onclick="changeDebtsGroupedPage(${p})" style="padding:4px 10px; font-size:12px; font-weight:${p===debtsGroupedPage?'800':'normal'};">${p}</button>`;
      }
      html += `<button class="btn btn-secondary btn-sm" onclick="changeDebtsGroupedPage(${debtsGroupedPage+1})" ${debtsGroupedPage===totalPages?'disabled':''} style="padding:4px 10px; font-size:12px;">Sau ›</button>`;
      html += `<button class="btn btn-secondary btn-sm" onclick="changeDebtsGroupedPage(${totalPages})" ${debtsGroupedPage===totalPages?'disabled':''} style="padding:4px 10px; font-size:12px;">Cuối »</button>`;
      html += `</div>`;
      paginEl.innerHTML = html;
    }
  }
}

function changeDebtsGroupedPage(p) {
  debtsGroupedPage = p;
  renderDebtsGroupedTable();
}

function toggleGroupChildren(btn) {
  const div = btn.nextElementSibling;
  if (!div) return;
  if (div.style.display === 'none') {
    div.style.display = 'block';
    btn.textContent = 'Ẩn mã';
  } else {
    div.style.display = 'none';
    btn.textContent = 'Xem mã';
  }
}

// Chuyển giữa 2 tab con trong màn hình Công nợ
function switchDebtsViewTab(tabName) {
  currentDebtsViewTab = tabName;

  const projectContainer = document.getElementById('debts-by-project-container');
  const partnerContainer = document.getElementById('debts-by-partner-container');
  const btnProject = document.getElementById('debts-tab-btn-project');
  const btnPartner = document.getElementById('debts-tab-btn-partner');

  if (tabName === 'project') {
    if (projectContainer) projectContainer.style.display = '';
    if (partnerContainer) partnerContainer.style.display = 'none';
    if (btnProject) {
      btnProject.style.borderBottom = '3px solid var(--color-primary)';
      btnProject.style.background = 'var(--bg-secondary)';
      btnProject.style.color = 'var(--color-primary)';
    }
    if (btnPartner) {
      btnPartner.style.borderBottom = '3px solid transparent';
      btnPartner.style.background = 'transparent';
      btnPartner.style.color = 'var(--text-secondary)';
    }
  } else {
    if (projectContainer) projectContainer.style.display = 'none';
    if (partnerContainer) partnerContainer.style.display = '';
    if (btnPartner) {
      btnPartner.style.borderBottom = '3px solid var(--color-primary)';
      btnPartner.style.background = 'var(--bg-secondary)';
      btnPartner.style.color = 'var(--color-primary)';
    }
    if (btnProject) {
      btnProject.style.borderBottom = '3px solid transparent';
      btnProject.style.background = 'transparent';
      btnProject.style.color = 'var(--text-secondary)';
    }
  }

  filterDebts();
}

// Xem sổ chi tiết gộp: lấy chứng từ từ tất cả các mã cùng tên đối tác
function viewGroupedPartnerLedger(partnerName) {
  const normalizedName = (partnerName || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // Tìm tất cả đối tác cùng tên
  const matchingPartners = state.partners.filter(p =>
    (p.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName
  );
  if (matchingPartners.length === 0) return;

  const matchingIds = new Set(matchingPartners.map(p => p.id));
  const primaryType = matchingPartners.find(p => p.type === 'customer')?.type
    || matchingPartners[0].type;

  // Tính tổng số dư đầu kỳ gộp
  let totalOpeningDebit = 0, totalOpeningCredit = 0;
  matchingPartners.forEach(p => {
    const op = state.partnerOpeningBalances[p.id] || { debit: 0, credit: 0 };
    totalOpeningDebit  += op.debit  || 0;
    totalOpeningCredit += op.credit || 0;
  });

  const openingVal = primaryType === 'customer'
    ? totalOpeningDebit - totalOpeningCredit
    : totalOpeningCredit - totalOpeningDebit;
  const openingText = primaryType === 'customer'
    ? (openingVal >= 0 ? `${formatVND(openingVal)} (Nợ)` : `${formatVND(-openingVal)} (Có)`)
    : (openingVal >= 0 ? `${formatVND(openingVal)} (Có)` : `${formatVND(-openingVal)} (Nợ)`);

  // Cập nhật tiêu đề modal
  const idList = matchingPartners.map(p => p.id).join(', ');
  document.getElementById('partner-ledger-subtitle').innerText =
    `Đối tác: ${partnerName} | ${matchingPartners.length} mã: ${idList.length > 80 ? idList.slice(0,80)+'...' : idList}`;
  document.getElementById('partner-ledger-opening').innerText = openingText;

  const tbody = document.getElementById('partner-ledger-table-body');
  tbody.innerHTML = '';

  // Thu thập tất cả chứng từ từ các mã con
  let debitSum = 0, creditSum = 0;
  const ledgerEntries = [];

  state.vouchers.forEach(v => {
    if (!matchingIds.has(v.partnerId)) return;
    if (!v.entries) return;

    let debitAmount = 0, creditAmount = 0;
    const offsetAccountSet = new Set();

    v.entries.forEach(e => {
      let isRelevant = false;
      if (primaryType === 'customer') {
        isRelevant = (e.debit && e.debit.startsWith('131')) || (e.credit && e.credit.startsWith('131'));
      } else if (primaryType === 'supplier') {
        isRelevant = (e.debit && e.debit.startsWith('331')) || (e.credit && e.credit.startsWith('331'));
      } else {
        isRelevant = ((e.debit && e.debit.startsWith('131')) || (e.credit && e.credit.startsWith('131')))
                  || ((e.debit && e.debit.startsWith('331')) || (e.credit && e.credit.startsWith('331')));
      }
      if (!isRelevant) return;
      if ((e.debit && e.debit.startsWith('131')) || (e.debit && e.debit.startsWith('331'))) {
        debitAmount += e.amount;
        offsetAccountSet.add(e.credit);
      } else {
        creditAmount += e.amount;
        offsetAccountSet.add(e.debit);
      }
    });

    if (debitAmount > 0 || creditAmount > 0) {
      ledgerEntries.push({
        date: v.date,
        id: v.id,
        partnerId: v.partnerId,
        desc: v.description,
        offsetAccount: Array.from(offsetAccountSet).join(', '),
        debit: debitAmount,
        credit: creditAmount
      });
      debitSum += debitAmount;
      creditSum += creditAmount;
    }
  });

  ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (ledgerEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Không có giao dịch phát sinh công nợ trong kỳ</td></tr>`;
  } else {
    ledgerEntries.forEach(le => {
      const tr = document.createElement('tr');
      const escapedViewId = escapeHtmlAttr(le.id);
      const originalVoucher = state.vouchers.find(x => x.id === le.id);
      const vType = originalVoucher ? originalVoucher.type : '';
      tr.className = 'clickable-row';
      tr.setAttribute('data-type', 'voucher');
      tr.setAttribute('data-subtype', vType);
      tr.setAttribute('data-id', escapeHtmlAttr(le.id));
      // Hiển thị mã đối tác con nếu có nhiều mã
      const partnerIdNote = matchingPartners.length > 1
        ? ` <span style="font-size:11px; color:var(--text-muted); font-style:italic;">[${le.partnerId}]</span>`
        : '';
      tr.innerHTML = `
        <td>${le.date}</td>
        <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedViewId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${le.id}</a>${partnerIdNote}</td>
        <td>${le.desc}</td>
        <td style="text-align:center; font-weight:700;">${le.offsetAccount}</td>
        <td style="text-align:right; font-weight:500;">${le.debit > 0 ? formatVND(le.debit).replace('đ','') : '-'}</td>
        <td style="text-align:right; font-weight:500;">${le.credit > 0 ? formatVND(le.credit).replace('đ','') : '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Tính số dư cuối kỳ gộp
  let closingVal = primaryType === 'customer'
    ? openingVal + debitSum - creditSum
    : openingVal + creditSum - debitSum;
  const closingText = primaryType === 'customer'
    ? (closingVal >= 0 ? `${formatVND(closingVal)} (Nợ)` : `${formatVND(-closingVal)} (Có)`)
    : (closingVal >= 0 ? `${formatVND(closingVal)} (Có)` : `${formatVND(-closingVal)} (Nợ)`);

  document.getElementById('partner-ledger-closing').innerText = closingText;

  // Sử dụng lại môđan sẵn có
  activePartnerIdForLedger = matchingPartners[0].id;
  activePartnerNameForGroupedLedger = partnerName;
  switchPartnerLedgerTab('entries');
  openModal('modal-view-partner-ledger');
}


let currentPartnerLedgerTab = "entries";
let activePartnerIdForLedger = "";

function viewPartnerLedger(partnerId) {
  const p = state.partners.find(item => item.id === partnerId);
  if (!p) return;

  activePartnerIdForLedger = partnerId;
  activePartnerNameForGroupedLedger = "";

  const opening = state.partnerOpeningBalances[p.id] || { debit: 0, credit: 0 };
  const openingText = p.type === "customer"
    ? (opening.debit >= opening.credit ? `${formatVND(opening.debit - opening.credit)} (Nợ)` : `${formatVND(opening.credit - opening.debit)} (Có)`)
    : (opening.credit >= opening.debit ? `${formatVND(opening.credit - opening.debit)} (Có)` : `${formatVND(opening.debit - opening.credit)} (Nợ)`);

  document.getElementById("partner-ledger-subtitle").innerText = `Đối tác: ${p.id} - ${p.name} | Loại: ${p.type === 'customer' ? 'Khách hàng' : 'Nhà cung cấp'}`;
  document.getElementById("partner-ledger-opening").innerText = openingText;

  const tbody = document.getElementById("partner-ledger-table-body");
  tbody.innerHTML = "";

  let debitSum = 0;
  let creditSum = 0;

  const ledgerEntries = [];
  state.vouchers.forEach(v => {
    if (v.partnerId !== p.id) return;
    if (!v.entries) return;

    let debitAmount = 0;
    let creditAmount = 0;
    let offsetAccountSet = new Set();

    v.entries.forEach(e => {
      let isRelevant = false;
      if (p.type === "customer") {
        isRelevant = e.debit.startsWith("131") || e.credit.startsWith("131");
      } else if (p.type === "supplier") {
        isRelevant = e.debit.startsWith("331") || e.credit.startsWith("331");
      } else {
        isRelevant = (e.debit.startsWith("131") || e.credit.startsWith("131"))
                  || (e.debit.startsWith("331") || e.credit.startsWith("331"));
      }
      if (!isRelevant) return;

      if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
        debitAmount += e.amount;
        offsetAccountSet.add(e.credit);
      } else {
        creditAmount += e.amount;
        offsetAccountSet.add(e.debit);
      }
    });

    if (debitAmount > 0 || creditAmount > 0) {
      ledgerEntries.push({
        date: v.date,
        id: v.id,
        desc: v.description,
        offsetAccount: Array.from(offsetAccountSet).join(", "),
        debit: debitAmount,
        credit: creditAmount
      });

      debitSum += debitAmount;
      creditSum += creditAmount;
    }
  });

  ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (ledgerEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Không có giao dịch phát sinh công nợ trong kỳ</td></tr>`;
  } else {
    ledgerEntries.forEach(le => {
      const tr = document.createElement("tr");

      // Tìm chứng từ bán hàng liên quan nếu đây là một phiếu thu công nợ
      let viewId = le.id;
      let displayId = le.id;

      if (le.id.startsWith("PT") || le.id.startsWith("PC") || le.credit > 0) {
        const relatedSales = findRelatedSalesVoucher(le.id, le.desc, p.id, le.credit || le.debit);
        if (relatedSales) {
          viewId = relatedSales.id;
          displayId = `${le.id} (${relatedSales.id})`;
        }
      }

      const escapedViewId = escapeHtmlAttr(viewId);
      const originalVoucher = state.vouchers.find(x => x.id === le.id);
      const vType = originalVoucher ? originalVoucher.type : "";

      tr.className = "clickable-row";
      tr.setAttribute("data-type", "voucher");
      tr.setAttribute("data-subtype", vType);
      tr.setAttribute("data-id", escapeHtmlAttr(le.id));

      tr.innerHTML = `
        <td>${le.date}</td>
        <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedViewId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${displayId}</a></td>
        <td>${le.desc}</td>
        <td style="text-align:center; font-weight:700;">${le.offsetAccount}</td>
        <td style="text-align:right; font-weight:500;">${le.debit > 0 ? formatVND(le.debit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:500;">${le.credit > 0 ? formatVND(le.credit).replace("đ", "") : "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  let closingVal = 0;
  let closingText = "";
  if (p.type === "customer") {
    closingVal = (opening.debit - opening.credit) + debitSum - creditSum;
    closingText = closingVal >= 0 ? `${formatVND(closingVal)} (Nợ)` : `${formatVND(-closingVal)} (Có)`;
  } else {
    closingVal = (opening.credit - opening.debit) + creditSum - debitSum;
    closingText = closingVal >= 0 ? `${formatVND(closingVal)} (Có)` : `${formatVND(-closingVal)} (Nợ)`;
  }

  document.getElementById("partner-ledger-closing").innerText = closingText;

  // Reset về tab Lịch sử công nợ mặc định
  switchPartnerLedgerTab("entries");

  openModal("modal-view-partner-ledger");
}

async function exportPartnerDebtExcel(partnerId) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  const p = state.partners.find(item => item.id === partnerId);
  if (!p) {
    showToast("Không tìm thấy đối tác này!", "danger");
    return;
  }

  try {
    // 1. Get ledger data (supporting grouped accounts)
    let matchingPartners = [p];
    if (activePartnerNameForGroupedLedger) {
      const normalizedName = activePartnerNameForGroupedLedger.trim().toLowerCase().replace(/\s+/g, ' ');
      matchingPartners = state.partners.filter(item =>
        (item.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName
      );
    }
    const matchingIds = new Set(matchingPartners.map(item => item.id));
    const primaryType = matchingPartners.find(item => item.type === 'customer')?.type || p.type;

    let totalOpeningDebit = 0;
    let totalOpeningCredit = 0;
    matchingPartners.forEach(item => {
      const op = state.partnerOpeningBalances[item.id] || { debit: 0, credit: 0 };
      totalOpeningDebit += op.debit || 0;
      totalOpeningCredit += op.credit || 0;
    });

    let openingVal = 0;
    if (primaryType === "customer") {
      openingVal = totalOpeningDebit - totalOpeningCredit;
    } else {
      openingVal = totalOpeningCredit - totalOpeningDebit;
    }

    let debitSum = 0;
    let creditSum = 0;
    const ledgerEntries = [];
    state.vouchers.forEach(v => {
      if (!matchingIds.has(v.partnerId)) return;
      if (!v.entries) return;

      let debitAmount = 0;
      let creditAmount = 0;
      let offsetAccountSet = new Set();

      v.entries.forEach(e => {
        let isRelevant = false;
        if (primaryType === "customer") {
          isRelevant = e.debit.startsWith("131") || e.credit.startsWith("131");
        } else if (primaryType === "supplier") {
          isRelevant = e.debit.startsWith("331") || e.credit.startsWith("331");
        } else {
          isRelevant = (e.debit.startsWith("131") || e.credit.startsWith("131"))
                    || (e.debit.startsWith("331") || e.credit.startsWith("331"));
        }
        if (!isRelevant) return;

        if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
          debitAmount += e.amount;
          offsetAccountSet.add(e.credit);
        } else {
          creditAmount += e.amount;
          offsetAccountSet.add(e.debit);
        }
      });

      if (debitAmount > 0 || creditAmount > 0) {
        ledgerEntries.push({
          date: v.date,
          id: v.id,
          partnerId: v.partnerId,
          desc: v.description,
          offsetAccount: Array.from(offsetAccountSet).join(", "),
          debit: debitAmount,
          credit: creditAmount
        });

        debitSum += debitAmount;
        creditSum += creditAmount;
      }
    });

    ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate closing balance
    let closingVal = 0;
    if (primaryType === "customer") {
      closingVal = openingVal + debitSum - creditSum;
    } else {
      closingVal = openingVal + creditSum - debitSum;
    }

    // Determine min/max dates
    const pad = (n) => n.toString().padStart(2, '0');
    let fromDateStr = "01/01/2026";
    let toDateStr = new Date().toLocaleDateString('vi-VN');
    if (ledgerEntries.length > 0) {
      const dates = ledgerEntries.map(e => new Date(e.date));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      fromDateStr = `${pad(minDate.getDate())}/${pad(minDate.getMonth() + 1)}/${minDate.getFullYear()}`;
      toDateStr = `${pad(maxDate.getDate())}/${pad(maxDate.getMonth() + 1)}/${maxDate.getFullYear()}`;
    }

    // =========================================================
    // 2. BUILD WORKBOOK FROM SCRATCH (clean 5-column layout)
    // Columns: A=Ngày, B=Số CT, C=Diễn giải, D=Số tiền, E=Số dư
    // =========================================================
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    // --- Style presets ---
    const fontTitle = { name: "Times New Roman", sz: 14, bold: true };
    const fontSubtitle = { name: "Times New Roman", sz: 11, italic: true };
    const fontCompany = { name: "Times New Roman", sz: 12, bold: true };
    const fontAddr = { name: "Times New Roman", sz: 10 };
    const fontNormal = { name: "Times New Roman", sz: 11 };
    const fontBold = { name: "Times New Roman", sz: 11, bold: true };
    const fontItalic = { name: "Times New Roman", sz: 11, italic: true };
    const fontHeader = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const alignCenter = { horizontal: "center", vertical: "center" };
    const alignLeft = { horizontal: "left", vertical: "center" };
    const alignRight = { horizontal: "right", vertical: "center" };
    const alignCenterWrap = { horizontal: "center", vertical: "center", wrapText: true };
    const thinBorder = { style: "thin", color: { rgb: "999999" } };
    const border4 = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    const headerBg = { patternType: "solid", fgColor: { rgb: "2F5496" } };
    const headerBorder = {
      top: { style: "thin", color: { rgb: "1F3864" } },
      bottom: { style: "thin", color: { rgb: "1F3864" } },
      left: { style: "thin", color: { rgb: "1F3864" } },
      right: { style: "thin", color: { rgb: "1F3864" } }
    };
    const altRowBg = { patternType: "solid", fgColor: { rgb: "F2F7FB" } };

    // Helper to set cell
    const setCell = (ref, v, t, style, z) => {
      ws[ref] = { v, t, s: style };
      if (z) ws[ref].z = z;
    };

    let row = 0; // 0-indexed

    // --- ROW 0: Company Name ---
    setCell("A1", "CÔNG TY CỔ PHẦN RẠNG ĐÔNG", "s",
      { font: fontCompany, alignment: alignCenter });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });

    // --- ROW 1: Sub Title / Trung tâm ---
    setCell("A2", "TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY", "s",
      { font: fontCompany, alignment: alignCenter });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });

    // --- ROW 2: Address ---
    setCell("A3", "Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh", "s",
      { font: fontAddr, alignment: alignCenter });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 4 } });

    // --- ROW 3: Tel/Hotline ---
    setCell("A4", "Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074", "s",
      { font: fontAddr, alignment: alignCenter });
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 4 } });

    // --- ROW 4: blank ---

    // --- ROW 5: Title ---
    setCell("A6", "THÔNG BÁO CÔNG NỢ", "s",
      { font: fontTitle, alignment: alignCenter });
    merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 4 } });

    // --- ROW 6: Print date ---
    setCell("A7", `Ngày in: ${new Date().toLocaleDateString('vi-VN')}`, "s",
      { font: fontSubtitle, alignment: alignCenter });
    merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: 4 } });

    // --- ROW 7: blank ---

    // --- ROW 8: Kính gửi + Kỳ ---
    setCell("A9", "Kính gửi:", "s", { font: fontBold, alignment: alignLeft });
    setCell("D9", `Kỳ: Từ ngày ${fromDateStr} đến ngày ${toDateStr}`, "s",
      { font: fontNormal, alignment: alignRight });
    merges.push({ s: { r: 8, c: 3 }, e: { r: 8, c: 4 } });

    // --- ROW 9: Đơn vị ---
    const idList = matchingPartners.map(item => item.id).join(', ');
    const unitText = `${p.name} (${idList})`;
    const address = matchingPartners.map(item => item.address).filter(Boolean)[0] || p.address || "";

    setCell("A10", `Đơn vị: ${unitText}`, "s",
      { font: fontNormal, alignment: alignLeft });
    merges.push({ s: { r: 9, c: 0 }, e: { r: 9, c: 2 } });

    // --- ROW 10: Địa chỉ + Số dư cuối kỳ ---
    setCell("A11", `Địa chỉ: ${address}`, "s",
      { font: fontNormal, alignment: alignLeft });
    merges.push({ s: { r: 10, c: 0 }, e: { r: 10, c: 2 } });
    setCell("D11", "Số dư cuối kỳ:", "s",
      { font: fontBold, alignment: alignRight });
    setCell("E11", closingVal, "n",
      { font: { name: "Times New Roman", sz: 12, bold: true, color: { rgb: "C00000" } }, alignment: alignRight }, '#,##0');

    // --- ROW 11: MST + Số dư đầu kỳ ---
    setCell("A12", `Mã số thuế: ${p.taxCode || ""}`, "s",
      { font: fontNormal, alignment: alignLeft });
    merges.push({ s: { r: 11, c: 0 }, e: { r: 11, c: 2 } });
    setCell("D12", "Số dư đầu kỳ:", "s",
      { font: fontNormal, alignment: alignRight });
    setCell("E12", openingVal, "n",
      { font: fontBold, alignment: alignRight }, '#,##0');

    // --- ROW 12: blank ---

    // --- ROW 13: Table header (row index 13, Excel row 14) ---
    const hdrRow = 13;
    const hdrCols = [
      { col: "A", label: "Ngày", align: alignCenterWrap },
      { col: "B", label: "Số chứng từ", align: alignCenterWrap },
      { col: "C", label: "Diễn giải", align: alignCenterWrap },
      { col: "D", label: "Số tiền", align: alignCenterWrap },
      { col: "E", label: "Số dư", align: alignCenterWrap }
    ];
    hdrCols.forEach(h => {
      const ref = h.col + (hdrRow + 1);
      setCell(ref, h.label, "s", {
        font: fontHeader,
        alignment: h.align,
        fill: headerBg,
        border: headerBorder
      });
    });

    // --- DATA ROWS ---
    let currentBalance = openingVal;
    const dataStartRow = hdrRow + 1; // row index 12

    ledgerEntries.forEach((le, idx) => {
      const r = dataStartRow + idx;
      const excelRow = r + 1;

      let amount = 0;
      if (primaryType === "customer") {
        amount = le.debit - le.credit;
      } else {
        amount = le.credit - le.debit;
      }
      currentBalance += amount;

      const dVal = new Date(le.date);
      const dateFormatted = `${pad(dVal.getDate())}/${pad(dVal.getMonth() + 1)}/${dVal.getFullYear()}`;

      const isAlt = idx % 2 === 1;
      const rowFill = isAlt ? altRowBg : undefined;

      const makeStyle = (align) => {
        const s = { font: fontNormal, alignment: align, border: border4 };
        if (rowFill) s.fill = rowFill;
        return s;
      };
      const makeStyleBold = (align) => {
        const s = { font: fontBold, alignment: align, border: border4 };
        if (rowFill) s.fill = rowFill;
        return s;
      };

      const subCodeStr = matchingPartners.length > 1 ? ` [${le.partnerId}]` : "";

      setCell("A" + excelRow, dateFormatted, "s", makeStyle(alignCenter));
      setCell("B" + excelRow, le.id + subCodeStr, "s", makeStyle(alignCenter));
      setCell("C" + excelRow, le.desc, "s", makeStyle(alignLeft));
      setCell("D" + excelRow, amount, "n", makeStyle(alignRight), '#,##0;(#,##0);"-"');
      setCell("E" + excelRow, currentBalance, "n", makeStyleBold(alignRight), '#,##0;(#,##0);"-"');
    });

    // --- TOTALS ROW ---
    const totalsRowIdx = dataStartRow + ledgerEntries.length;
    const totalsExcelRow = totalsRowIdx + 1;
    const totalBg = { patternType: "solid", fgColor: { rgb: "D6E4F0" } };
    const totalBorder = {
      top: { style: "medium", color: { rgb: "2F5496" } },
      bottom: { style: "medium", color: { rgb: "2F5496" } },
      left: thinBorder,
      right: thinBorder
    };

    setCell("A" + totalsExcelRow, "", "s", { font: fontBold, fill: totalBg, border: totalBorder });
    setCell("B" + totalsExcelRow, "", "s", { font: fontBold, fill: totalBg, border: totalBorder });
    setCell("C" + totalsExcelRow, "TỔNG CỘNG", "s",
      { font: fontBold, alignment: alignRight, fill: totalBg, border: totalBorder });

    const totalAmount = ledgerEntries.reduce((sum, le) => {
      if (primaryType === "customer") return sum + le.debit - le.credit;
      return sum + le.credit - le.debit;
    }, 0);
    setCell("D" + totalsExcelRow, totalAmount, "n",
      { font: fontBold, alignment: alignRight, fill: totalBg, border: totalBorder }, '#,##0;(#,##0);"-"');
    setCell("E" + totalsExcelRow, closingVal, "n",
      { font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "C00000" } }, alignment: alignRight, fill: totalBg, border: totalBorder }, '#,##0;(#,##0);"-"');

    // --- SIGNATURE SECTION ---
    const sigRow = totalsRowIdx + 3;
    const sigExcelRow = sigRow + 1;
    setCell("D" + sigExcelRow, "Người lập phiếu", "s",
      { font: fontBold, alignment: alignCenter });
    merges.push({ s: { r: sigRow, c: 3 }, e: { r: sigRow, c: 4 } });

    const sigSubRow = sigRow + 1;
    setCell("D" + (sigSubRow + 1), "(Ký, họ tên)", "s",
      { font: fontItalic, alignment: alignCenter });
    merges.push({ s: { r: sigSubRow, c: 3 }, e: { r: sigSubRow, c: 4 } });

    // --- COLUMN WIDTHS ---
    ws['!cols'] = [
      { wch: 14 },  // A: Ngày
      { wch: 16 },  // B: Số chứng từ
      { wch: 50 },  // C: Diễn giải
      { wch: 20 },  // D: Số tiền
      { wch: 22 }   // E: Số dư
    ];

    // --- ROW HEIGHTS ---
    ws['!rows'] = [];
    ws['!rows'][0] = { hpt: 20 }; // Company Name
    ws['!rows'][1] = { hpt: 18 }; // Subtitle / Trung tâm
    ws['!rows'][2] = { hpt: 16 }; // Address
    ws['!rows'][3] = { hpt: 16 }; // Tel/Hotline
    // Title row
    ws['!rows'][5] = { hpt: 26 };
    // Header row
    ws['!rows'][hdrRow] = { hpt: 22 };

    // --- MERGES ---
    ws['!merges'] = merges;

    // --- SHEET RANGE ---
    const lastRow = sigSubRow + 4;
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 4 } });

    XLSX.utils.book_append_sheet(wb, ws, "Thông báo công nợ");

    // --- SAVE ---
    XLSX.writeFile(wb, `Thong_bao_cong_no_${p.id}.xlsx`);
    showToast(`Đã xuất thông báo công nợ thành công cho đối tác ${p.name}!`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất thông báo công nợ: ${err.message}`, "danger");
  }
}

function exportCurrentPartnerDebtExcel() {
  if (!activePartnerIdForLedger) {
    showToast("Không tìm thấy đối tác hiện tại!", "danger");
    return;
  }
  exportPartnerDebtExcel(activePartnerIdForLedger);
}

function previewPartnerDebtNotice(partnerId) {
  const p = state.partners.find(item => item.id === partnerId);
  if (!p) {
    showToast("Không tìm thấy đối tác này!", "danger");
    return;
  }

  // Get ledger data (supporting grouped accounts)
  let matchingPartners = [p];
  if (activePartnerNameForGroupedLedger) {
    const normalizedName = activePartnerNameForGroupedLedger.trim().toLowerCase().replace(/\s+/g, ' ');
    matchingPartners = state.partners.filter(item =>
      (item.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName
    );
  }
  const matchingIds = new Set(matchingPartners.map(item => item.id));
  const primaryType = matchingPartners.find(item => item.type === 'customer')?.type || p.type;

  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  matchingPartners.forEach(item => {
    const op = state.partnerOpeningBalances[item.id] || { debit: 0, credit: 0 };
    totalOpeningDebit += op.debit || 0;
    totalOpeningCredit += op.credit || 0;
  });

  let openingVal = 0;
  if (primaryType === "customer") {
    openingVal = totalOpeningDebit - totalOpeningCredit;
  } else {
    openingVal = totalOpeningCredit - totalOpeningDebit;
  }

  let debitSum = 0;
  let creditSum = 0;
  const ledgerEntries = [];
  state.vouchers.forEach(v => {
    if (!matchingIds.has(v.partnerId)) return;
    if (!v.entries) return;

    let debitAmount = 0;
    let creditAmount = 0;
    let offsetAccountSet = new Set();

    v.entries.forEach(e => {
      let isRelevant = false;
      if (primaryType === "customer") {
        isRelevant = e.debit.startsWith("131") || e.credit.startsWith("131");
      } else if (primaryType === "supplier") {
        isRelevant = e.debit.startsWith("331") || e.credit.startsWith("331");
      } else {
        isRelevant = (e.debit.startsWith("131") || e.credit.startsWith("131"))
                  || (e.debit.startsWith("331") || e.credit.startsWith("331"));
      }
      if (!isRelevant) return;

      if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
        debitAmount += e.amount;
        offsetAccountSet.add(e.credit);
      } else {
        creditAmount += e.amount;
        offsetAccountSet.add(e.debit);
      }
    });

    if (debitAmount > 0 || creditAmount > 0) {
      ledgerEntries.push({
        date: v.date,
        id: v.id,
        partnerId: v.partnerId,
        desc: v.description,
        offsetAccount: Array.from(offsetAccountSet).join(", "),
        debit: debitAmount,
        credit: creditAmount
      });

      debitSum += debitAmount;
      creditSum += creditAmount;
    }
  });

  ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate closing balance
  let closingVal = 0;
  if (primaryType === "customer") {
    closingVal = openingVal + debitSum - creditSum;
  } else {
    closingVal = openingVal + creditSum - debitSum;
  }

  // Determine min/max dates
  let fromDateStr = "01/01/2026";
  let toDateStr = new Date().toLocaleDateString('vi-VN');
  if (ledgerEntries.length > 0) {
    const dates = ledgerEntries.map(e => new Date(e.date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const pad = (n) => n.toString().padStart(2, '0');
    fromDateStr = `${pad(minDate.getDate())}/${pad(minDate.getMonth() + 1)}/${minDate.getFullYear()}`;
    toDateStr = `${pad(maxDate.getDate())}/${pad(maxDate.getMonth() + 1)}/${maxDate.getFullYear()}`;
  }

  const formatDebtAmount = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    const formatted = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
    const clean = formatted.replace(/[₫đ\sVND]/g, '').trim();
    if (val < 0) {
      const absClean = clean.replace('-', '').replace('(', '').replace(')', '');
      return `-${absClean}`;
    }
    return clean;
  };

  const idList = matchingPartners.map(item => item.id).join(', ');
  const unitText = `${p.name} (${idList})`;
  const address = matchingPartners.map(item => item.address).filter(Boolean)[0] || p.address || "";

  let tableRowsHtml = "";
  let currentBalance = openingVal;
  ledgerEntries.forEach((le) => {
    let amount = 0;
    if (primaryType === "customer") {
      amount = le.debit - le.credit;
    } else {
      amount = le.credit - le.debit;
    }
    currentBalance += amount;

    const dVal = new Date(le.date);
    const pad = (n) => n.toString().padStart(2, '0');
    const dateFormatted = `${pad(dVal.getDate())}/${pad(dVal.getMonth() + 1)}/${dVal.getFullYear()}`;

    const subCodeStr = matchingPartners.length > 1
      ? `<br><span style="font-size:8.5px; color:#555; font-style:italic;">[${le.partnerId}]</span>`
      : "";

    tableRowsHtml += `
      <tr>
        <td style="text-align: center; border: 1px solid #000; padding: 6px;">${dateFormatted}</td>
        <td style="text-align: center; font-family: monospace; font-weight: 500; border: 1px solid #000; padding: 6px;">${le.id}${subCodeStr}</td>
        <td style="border: 1px solid #000; padding: 6px;">${le.desc}</td>
        <td style="text-align: right; font-family: 'Times New Roman', serif; border: 1px solid #000; padding: 6px;" class="font-numeric">${formatDebtAmount(amount)}</td>
        <td style="text-align: right; font-family: 'Times New Roman', serif; font-weight: bold; border: 1px solid #000; padding: 6px;" class="font-numeric">${formatDebtAmount(currentBalance)}</td>
      </tr>
    `;
  });

  if (ledgerEntries.length === 0) {
    tableRowsHtml = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 20px; color: #666; font-style: italic; border: 1px solid #000;">
          Không có phát sinh nghiệp vụ công nợ trong kỳ.
        </td>
      </tr>
    `;
  }

  const printArea = document.getElementById("voucher-print-area");
  if (!printArea) return;

  const content = `
    <div class="printable-voucher" style="max-width: 800px; padding: 10px; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; line-height: 1.25; background-color: #fff; margin: 0 auto; box-sizing: border-box;">
      <style>
        .debt-notice-table th {
          border: 1px solid #000 !important;
          padding: 4px 6px;
          text-align: center;
          font-weight: bold;
        }
        .debt-notice-table td {
          border: 1px solid #000 !important;
          padding: 4px 6px;
          vertical-align: middle;
        }
        @media print {
          .printable-voucher {
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            font-size: 10px !important;
          }
          .debt-notice-table th, .debt-notice-table td {
            padding: 3px 5px !important;
            font-size: 9.5px !important;
          }
        }
      </style>

      <!-- Header -->
      <div style="position: relative; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; text-align: center; min-height: 50px;">
        <!-- Logo Rạng Đông thực tế từ file logo.jpg -->
        <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 80px;">
          <img src="logo.jpg" style="max-height: 45px; max-width: 75px; object-fit: contain;" alt="Logo" onerror="this.style.display='none'" />
        </div>

        <!-- Thông tin công ty chính xác theo mẫu giấy (Tránh wrap lỗi căn lề và không bị tràn) -->
        <div style="color: #000; padding: 0 10px 0 90px;">
          <div style="font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap;">CÔNG TY CỔ PHẦN RẠNG ĐÔNG</div>
          <div style="font-weight: bold; font-size: 9.5px; text-transform: uppercase; margin-top: 2px; white-space: nowrap;">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY</div>
          <div style="font-size: 9.5px; margin-top: 2px; white-space: nowrap;">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
          <div style="font-size: 9.5px; margin-top: 1px; font-weight: 500; white-space: nowrap;">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
        </div>
      </div>

      <!-- Title -->
      <div style="text-align: center; margin-bottom: 12px;">
        <div style="font-size: 17px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">THÔNG BÁO CÔNG NỢ</div>
        <div style="font-size: 9.5px; font-style: italic; margin-top: 2px;">Ngày in: ${new Date().toLocaleDateString('vi-VN')}</div>
      </div>

      <!-- Info -->
      <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 3px 12px; margin-bottom: 8px; font-size: 10.5px;">
        <div><strong>Kính gửi:</strong></div>
        <div><strong>Kỳ:</strong> Từ ngày ${fromDateStr} đến ngày ${toDateStr}</div>
        
        <div><strong>Đơn vị:</strong> ${unitText}</div>
        <div><strong>Số dư đầu kỳ:</strong> <span style="font-weight: bold;">${formatDebtAmount(openingVal)} đ</span></div>
        
        <div><strong>Địa chỉ:</strong> ${address}</div>
        <div><strong>Số dư cuối kỳ:</strong> <span style="font-weight: bold; color: var(--color-primary);">${formatDebtAmount(closingVal)} đ</span></div>
        
        <div><strong>Mã số thuế:</strong> ${p.taxCode || ""}</div>
        <div></div>
      </div>


      <!-- Table -->
      <table class="debt-notice-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="width: 13%; text-align: center;">Ngày</th>
            <th style="width: 15%; text-align: center;">Số chứng từ</th>
            <th style="width: 42%; text-align: left;">Diễn giải</th>
            <th style="width: 15%; text-align: right;">Số tiền</th>
            <th style="width: 15%; text-align: right;">Số dư</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Footer -->
      <div style="display: flex; justify-content: flex-end; margin-top: 10px; page-break-inside: avoid; break-inside: avoid;">
        <div style="width: 200px; text-align: center; font-size: 11px; page-break-inside: avoid; break-inside: avoid;">
          <strong>Người lập phiếu</strong><br>
          <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
          <div style="height: 38px;"></div>
        </div>
      </div>
    </div>
  `;

  printArea.innerHTML = content;
  // Change title of modal temporarily
  const modalTitle = document.querySelector("#modal-view-voucher .card-title");
  if (modalTitle) {
    modalTitle.innerText = "Xem trước Thông báo Công nợ";
  }
  openModal("modal-view-voucher");
}

function previewCurrentPartnerDebtNotice() {
  if (!activePartnerIdForLedger) {
    showToast("Không tìm thấy đối tác hiện tại!", "danger");
    return;
  }
  previewPartnerDebtNotice(activePartnerIdForLedger);
}

function switchPartnerLedgerTab(tabName) {
  currentPartnerLedgerTab = tabName;
  const btnEntries = document.getElementById("partner-ledger-tab-btn-entries");
  const btnOrders = document.getElementById("partner-ledger-tab-btn-orders");
  const conEntries = document.getElementById("partner-ledger-container-entries");
  const conOrders = document.getElementById("partner-ledger-container-orders");

  if (tabName === "entries") {
    if (btnEntries) {
      btnEntries.classList.add("active");
      btnEntries.style.color = "var(--color-primary)";
      btnEntries.style.fontWeight = "700";
    }
    if (btnOrders) {
      btnOrders.classList.remove("active");
      btnOrders.style.color = "var(--text-secondary)";
      btnOrders.style.fontWeight = "600";
    }
    if (conEntries) conEntries.style.display = "block";
    if (conOrders) conOrders.style.display = "none";
  } else {
    if (btnOrders) {
      btnOrders.classList.add("active");
      btnOrders.style.color = "var(--color-primary)";
      btnOrders.style.fontWeight = "700";
    }
    if (btnEntries) {
      btnEntries.classList.remove("active");
      btnEntries.style.color = "var(--text-secondary)";
      btnEntries.style.fontWeight = "600";
    }
    if (conEntries) conEntries.style.display = "none";
    if (conOrders) conOrders.style.display = "block";
    renderPartnerLedgerOrders();
  }
}

function renderPartnerLedgerOrders() {
  const tbody = document.getElementById("partner-ledger-orders-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const pId = activePartnerIdForLedger;
  const orders = state.vouchers.filter(v => String(v.partnerId) === String(pId) && (v.type === "sales" || v.type === "purchase" || v.type === "purchase_return" || v.type === "sales_return"));

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy hóa đơn mua/bán nào của đối tác này</td></tr>`;
    return;
  }

  orders.forEach(o => {
    const totalAmt = o.totalAmount || o.amount || 0;
    ensureRemainingDebt(o);

    const tr = document.createElement("tr");
    const escapedOrderId = escapeHtmlAttr(o.id);
    tr.className = "clickable-row";
    tr.setAttribute("data-type", "voucher");
    tr.setAttribute("data-subtype", o.type);
    tr.setAttribute("data-id", escapedOrderId);
    tr.innerHTML = `
      <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedOrderId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${o.id}</a></td>
      <td>${o.date}</td>
      <td>${o.description}</td>
      <td style="text-align:right; font-weight:500;">${formatVND(totalAmt).replace("đ", "")}</td>
      <td style="text-align:right; font-weight:700; color:${o.remainingDebt > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">${formatVND(o.remainingDebt).replace("đ", "")}</td>
      <td style="text-align:center; display:flex; justify-content:center; gap:4px;">
        <button class="btn btn-primary btn-sm" onclick="editOrderFromLedger('${escapedOrderId}', '${o.type}')" style="padding: 2px 8px; font-size: 11px;">Sửa đơn</button>
        <button class="btn btn-secondary btn-sm" onclick="promptEditOrderDebt('${escapedOrderId}')" style="padding: 2px 8px; font-size: 11px;">Sửa nợ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function promptEditOrderDebt(voucherId) {
  try {
    console.log("promptEditOrderDebt custom modal called with:", voucherId);
    if (voucherId && voucherId.startsWith("OP-")) {
      const partnerId = voucherId.substring(3);
      promptEditPartnerOpeningDebt(partnerId);
      return;
    }

    const v = state.vouchers.find(x => x.id === voucherId);
    if (!v) {
      console.error("Voucher not found in state.vouchers for ID:", voucherId);
      if (typeof addErrorLog === "function") {
        addErrorLog("promptEditOrderDebt", `Không tìm thấy chứng từ với ID: ${voucherId}`);
      }
      return;
    }

    const totalAmt = v.totalAmount || v.amount || 0;
    ensureRemainingDebt(v);

    // Mở modal sửa công nợ đơn hàng
    document.getElementById("modal-edit-debt-title").innerText = "Chỉnh sửa Công nợ Đơn hàng";
    document.getElementById("edit-debt-target-id").value = voucherId;
    document.getElementById("edit-debt-type").value = "voucher";

    const partnerName = getPartnerNameForVoucher(v);
    document.getElementById("edit-debt-info-text").innerHTML = `
      <strong>Mã hóa đơn:</strong> ${v.id}<br>
      <strong>Đối tác:</strong> ${partnerName}<br>
      <strong>Tổng tiền hóa đơn:</strong> ${formatVND(totalAmt)}
    `;

    document.getElementById("group-edit-debt-voucher").style.display = "block";
    document.getElementById("group-edit-debt-partner").style.display = "none";

    document.getElementById("edit-debt-voucher-value").value = Number(v.remainingDebt || 0).toLocaleString("vi-VN");

    openModal("modal-edit-debt");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptEditOrderDebt", err.message, err);
    }
  }
}

function promptEditPartnerOpeningDebt(partnerId) {
  try {
    console.log("promptEditPartnerOpeningDebt custom modal called with:", partnerId);
    const p = state.partners.find(x => String(x.id) === String(partnerId));
    if (!p) {
      console.error("Partner not found for ID:", partnerId);
      if (typeof addErrorLog === "function") {
        addErrorLog("promptEditPartnerOpeningDebt", `Không tìm thấy đối tác với mã: ${partnerId}`);
      }
      showToast(`Không tìm thấy đối tác với mã: ${partnerId}`, "danger");
      return;
    }

    const currentBal = state.partnerOpeningBalances[partnerId] || { debit: 0, credit: 0 };
    const currentDebit = currentBal.debit || 0;
    const currentCredit = currentBal.credit || 0;

    // Mở modal sửa công nợ đầu kỳ
    document.getElementById("modal-edit-debt-title").innerText = "Chỉnh sửa Số dư Công nợ đầu kỳ";
    document.getElementById("edit-debt-target-id").value = partnerId;
    document.getElementById("edit-debt-type").value = "partner";

    const typeLabel = p.type === "customer" ? "Khách hàng" : "Nhà cung cấp";
    document.getElementById("edit-debt-info-text").innerHTML = `
      <strong>Mã đối tác:</strong> ${p.id}<br>
      <strong>Tên đối tác:</strong> ${p.name}<br>
      <strong>Phân loại:</strong> ${typeLabel}
    `;

    document.getElementById("group-edit-debt-voucher").style.display = "none";
    document.getElementById("group-edit-debt-partner").style.display = "block";

    document.getElementById("edit-debt-partner-debit").value = Number(currentDebit).toLocaleString("vi-VN");
    document.getElementById("edit-debt-partner-credit").value = Number(currentCredit).toLocaleString("vi-VN");

    openModal("modal-edit-debt");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptEditPartnerOpeningDebt", err.message, err);
    }
  }
}

function handleEditDebtSubmit(e) {
  try {
    e.preventDefault();

    const modal = document.getElementById("modal-edit-debt");
    if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
      return;
    }

    const targetId = document.getElementById("edit-debt-target-id").value;
    const editType = document.getElementById("edit-debt-type").value;

    console.log("handleEditDebtSubmit targetId:", targetId, "type:", editType);

    if (editType === "voucher") {
      const v = state.vouchers.find(x => x.id === targetId);
      if (!v) {
        if (typeof addErrorLog === "function") {
          addErrorLog("handleEditDebtSubmit", `Không tìm thấy chứng từ với ID: ${targetId}`);
        }
        return;
      }
      const totalAmt = v.totalAmount || v.amount || 0;
      const newDebt = parseInt(document.getElementById("edit-debt-voucher-value").value.replace(/\D/g, "")) || 0;

      if (newDebt < 0 || newDebt > totalAmt) {
        showToast(`Số tiền nợ hợp lệ phải từ 0đ đến ${formatVND(totalAmt)}!`, "danger");
        return;
      }

      v.remainingDebt = newDebt;
      saveState();
      showToast(`Cập nhật nợ đơn hàng ${v.id} thành ${formatVND(newDebt)} thành công!`, "success");
    }

    else if (editType === "partner") {
      const newDebit = parseInt(document.getElementById("edit-debt-partner-debit").value.replace(/\D/g, "")) || 0;
      const newCredit = parseInt(document.getElementById("edit-debt-partner-credit").value.replace(/\D/g, "")) || 0;

      if (newDebit < 0 || newCredit < 0) {
        showToast("Số dư đầu kỳ phải lớn hơn hoặc bằng 0đ!", "danger");
        return;
      }

      state.partnerOpeningBalances = state.partnerOpeningBalances || {};
      state.partnerOpeningBalances[targetId] = { debit: newDebit, credit: newCredit };

      saveState();
      recalculateAccounting();
      showToast(`Cập nhật số dư công nợ đầu kỳ đối tác ${targetId} thành công!`, "success");
    }

    closeModal("modal-edit-debt");

    // Vẽ lại toàn bộ giao diện liên quan
    renderDashboardDebts();
    filterDebts();
    if (activePartnerIdForLedger) {
      renderPartnerLedgerOrders();
    }
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("handleEditDebtSubmit", err.message, err);
    }
  }
}

function exportDebtsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const khBg = { patternType: "solid", fgColor: { rgb: "EBF3FF" } };
    const nccBg = { patternType: "solid", fgColor: { rgb: "FFF3EB" } };
    const fntT = { name: "Times New Roman", sz: 13, bold: true };
    const fntH = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const fntB = { name: "Times New Roman", sz: 11, bold: true };
    const fntN = { name: "Times New Roman", sz: 11 };
    const cC = { horizontal: "center", vertical: "center" };
    const cL = { horizontal: "left", vertical: "center", wrapText: true };
    const cR = { horizontal: "right", vertical: "center" };
    const numFmt = "#,##0 ;[Red](#,##0)";

    const sc = (r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    // Columns: Mã(0) Tên(1) Loại(2) Dư ĐK Nợ(3) Dư ĐK Có(4) PS Nợ(5) PS Có(6) Dư CK Nợ(7) Dư CK Có(8) Địa chỉ(9) MST(10) ĐT(11)
    const headers = ["Mã", "Tên khách hàng / NCC", "Loại", "Dư ĐK Nợ", "Dư ĐK Có", "PS Nợ trong kỳ", "PS Có trong kỳ", "Dư CK Nợ", "Dư CK Có", "Địa chỉ", "Mã số thuế", "Điện thoại"];
    const ncols = headers.length;

    // ROW 0: Tiêu đề
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — SỔ DƯ CÔNG NỢ", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Headers
    headers.forEach((h, c) => sc(1, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    const calculatedDebts = calculatePartnerDebts();
    let rowIdx = 2;
    let totalOpeningDebitKH = 0, totalOpeningCreditKH = 0, totalOpeningDebitNCC = 0, totalOpeningCreditNCC = 0;
    let totalDebitKH = 0, totalCreditKH = 0;
    let totalDebitNCC = 0, totalCreditNCC = 0;
    let totalClosingDebitKH = 0, totalClosingCreditKH = 0, totalClosingDebitNCC = 0, totalClosingCreditNCC = 0;

    calculatedDebts.forEach((d, idx) => {
      const isKH = d.type === "customer";

      const bg = idx % 2 === 0 ? (isKH ? null : { patternType: "solid", fgColor: { rgb: "FFFAF5" } }) : (isKH ? altBg : { patternType: "solid", fgColor: { rgb: "FFF0E0" } });
      const bs = (al) => ({ font: fntN, fill: bg, alignment: al, border: border4 });
      const ns = (al) => ({ font: fntN, fill: bg, alignment: al || cR, border: border4 });

      sc(rowIdx, 0, d.id || "", 's', bs(cC));
      sc(rowIdx, 1, d.name || "", 's', bs(cL));
      sc(rowIdx, 2, isKH ? "KH" : "NCC", 's', bs(cC));
      sc(rowIdx, 3, d.openingDebit || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 4, d.openingCredit || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 5, d.debitTrans || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 6, d.creditTrans || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 7, d.closingDebit || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 8, d.closingCredit || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 9, d.address || "", 's', bs(cL));
      sc(rowIdx, 10, d.taxCode || "", 's', bs(cC));
      sc(rowIdx, 11, d.phone || "", 's', bs(cC));

      if (isKH) {
        totalOpeningDebitKH += d.openingDebit || 0;
        totalOpeningCreditKH += d.openingCredit || 0;
        totalDebitKH += d.debitTrans || 0;
        totalCreditKH += d.creditTrans || 0;
        totalClosingDebitKH += d.closingDebit || 0;
        totalClosingCreditKH += d.closingCredit || 0;
      } else {
        totalOpeningDebitNCC += d.openingDebit || 0;
        totalOpeningCreditNCC += d.openingCredit || 0;
        totalDebitNCC += d.debitTrans || 0;
        totalCreditNCC += d.creditTrans || 0;
        totalClosingDebitNCC += d.closingDebit || 0;
        totalClosingCreditNCC += d.closingCredit || 0;
      }
      rowIdx++;
    });

    // DÒNG TỔNG KHÁCH HÀNG
    const ts = (al) => ({ font: fntB, fill: totBg, alignment: al, border: border4 });
    sc(rowIdx, 0, "TỔNG KHÁCH HÀNG", 's', ts(cL)); merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    sc(rowIdx, 3, totalOpeningDebitKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 4, totalOpeningCreditKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 5, totalDebitKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 6, totalCreditKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 7, totalClosingDebitKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 8, totalClosingCreditKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 9, "", 's', ts(cL)); sc(rowIdx, 10, "", 's', ts(cC)); sc(rowIdx, 11, "", 's', ts(cC));
    rowIdx++;

    // DÒNG TỔNG NCC
    sc(rowIdx, 0, "TỔNG NHÀ CUNG CẤP", 's', ts(cL)); merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    sc(rowIdx, 3, totalOpeningDebitNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 4, totalOpeningCreditNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 5, totalDebitNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 6, totalCreditNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 7, totalClosingDebitNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 8, totalClosingCreditNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 9, "", 's', ts(cL)); sc(rowIdx, 10, "", 's', ts(cC)); sc(rowIdx, 11, "", 's', ts(cC));

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 38 }, { wch: 14 }, { wch: 14 }];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Cong no");
    const outName = `Cong_no_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel công nợ: ${err.message}`, "danger");
  }
}
window.promptEditOrderDebt = promptEditOrderDebt;
window.promptEditPartnerOpeningDebt = promptEditPartnerOpeningDebt;
window.handleEditDebtSubmit = handleEditDebtSubmit;
window.viewPartnerLedger = viewPartnerLedger;

function toggleSelectAllDebts(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".debt-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchDebtsUI();
}

function updateBatchDebtsUI() {
  const checkboxes = document.querySelectorAll(".debt-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-debts");
  const count = document.getElementById("selected-debts-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-debts");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteDebts() {
  const checked = Array.from(document.querySelectorAll(".debt-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa (đặt số dư đầu kỳ về 0) cho ${checked.length} công nợ đã chọn?`)) {
    const idsToReset = checked.map(cb => cb.value);
    idsToReset.forEach(id => {
      state.partnerOpeningBalances[id] = { debit: 0, credit: 0 };
    });

    const master = document.getElementById("check-all-debts");
    if (master) master.checked = false;

    updateBatchDebtsUI();
    showToast(`Đã reset số dư đầu kỳ cho ${checked.length} đối tác!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
  }
}
window.exportCurrentPartnerDebtExcel = exportCurrentPartnerDebtExcel;
window.previewCurrentPartnerDebtNotice = previewCurrentPartnerDebtNotice;
// Debts
window.filterDebts = filterDebts;
window.changeDebtsPage = changeDebtsPage;
window.toggleSelectAllDebts = toggleSelectAllDebts;
window.updateBatchDebtsUI = updateBatchDebtsUI;
window.batchDeleteDebts = batchDeleteDebts;
window.exportDebtsToExcel = exportDebtsToExcel;
// Grouped / dual-tab
window.switchDebtsViewTab = switchDebtsViewTab;
window.renderDebtsGroupedTable = renderDebtsGroupedTable;
window.changeDebtsGroupedPage = changeDebtsGroupedPage;
window.toggleGroupChildren = toggleGroupChildren;
window.viewGroupedPartnerLedger = viewGroupedPartnerLedger;

function editOrderFromLedger(voucherId, voucherType) {
  closeModal('modal-view-partner-ledger');
  
  if (voucherType === 'sales') {
    if (typeof window.editSalesVoucher === 'function') {
      window.editSalesVoucher(voucherId);
    } else {
      showToast('Không tìm thấy chức năng sửa hóa đơn bán hàng!', 'danger');
    }
  } else if (voucherType === 'purchase') {
    if (typeof window.editPurchaseVoucher === 'function') {
      window.editPurchaseVoucher(voucherId);
    } else {
      showToast('Không tìm thấy chức năng sửa hóa đơn mua hàng!', 'danger');
    }
  } else if (voucherType === 'purchase_return') {
    if (typeof window.editPurchaseReturnVoucher === 'function') {
      window.editPurchaseReturnVoucher(voucherId);
    } else {
      showToast('Không tìm thấy chức năng sửa trả lại hàng mua!', 'danger');
    }
  } else if (voucherType === 'sales_return') {
    if (typeof window.editSalesReturnVoucher === 'function') {
      window.editSalesReturnVoucher(voucherId);
    } else {
      showToast('Không tìm thấy chức năng sửa hàng bán trả lại!', 'danger');
    }
  } else if (voucherType === 'purchase_order') {
    if (typeof window.editPurchaseOrderVoucher === 'function') {
      window.editPurchaseOrderVoucher(voucherId);
    } else {
      showToast('Không tìm thấy chức năng sửa đơn đặt hàng!', 'danger');
    }
  } else {
    showToast(`Không hỗ trợ sửa loại chứng từ: ${voucherType}`, 'warning');
  }
}
window.editOrderFromLedger = editOrderFromLedger;
