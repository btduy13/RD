let escrowCurrentPage = 1;

// 9. RENDER DỮ LIỆU PHÂN HỆ KÝ QUỸ (ESCROW)
function renderEscrowTable() {
  const tbody = document.getElementById("escrow-table-body");
  if (!tbody) return;

  let escrows = state.vouchers.filter(v => v.type.startsWith("escrow_"));

  // Advanced search filters
  const query = document.getElementById("search-escrow") ? document.getElementById("search-escrow").value : "";
  const fromDate = document.getElementById("search-escrow-from") ? document.getElementById("search-escrow-from").value : "";
  const toDate = document.getElementById("search-escrow-to") ? document.getElementById("search-escrow-to").value : "";

  if (query) {
    escrows = escrows.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.amount);
    });
  }

  if (fromDate) {
    escrows = escrows.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    escrows = escrows.filter(v => v.date <= toDate);
  }

  // Sắp xếp số chứng từ giảm dần (to nhất lên trước)
  escrows.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = escrows.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (escrowCurrentPage > totalPages) escrowCurrentPage = totalPages;
  if (escrowCurrentPage < 1) escrowCurrentPage = 1;

  const startIdx = (escrowCurrentPage - 1) * 30;
  const displayedEscrows = escrows.slice(startIdx, startIdx + 30);

  // Update pagination info header
  const countEl = document.getElementById("escrow-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị chứng từ từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} chứng từ (Trang ${escrowCurrentPage}/${totalPages})`;
  }

  // Reset check-all-escrow checkbox
  const checkAll = document.getElementById("check-all-escrow");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchEscrowsUI === "function") updateBatchEscrowsUI();

  // Render pagination controls
  const paginationControls = document.getElementById("escrow-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(1)" ${escrowCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(${escrowCurrentPage - 1})" ${escrowCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, escrowCurrentPage - 2);
      let endPage = Math.min(totalPages, escrowCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === escrowCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeEscrowPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === escrowCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(${escrowCurrentPage + 1})" ${escrowCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(${totalPages})" ${escrowCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} chứng từ
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedEscrows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy chứng từ ký quỹ nào phù hợp.</td></tr>`;
    return;
  }

  const typeLabels = {
    escrow_pay: { name: "Chi ký quỹ đi (Tài sản)", class: "badge-info", acct: state.accountingStandard === "TT200" ? "244" : "1386" },
    escrow_receive: { name: "Nhận ký quỹ về (Nợ phải trả)", class: "badge-success", acct: state.accountingStandard === "TT200" ? "344" : "3386" },
    escrow_refund_pay: { name: "Tất toán ký quỹ đi", class: "badge-warning", acct: state.accountingStandard === "TT200" ? "244" : "1386" },
    escrow_refund_receive: { name: "Tất toán nhận ký quỹ", class: "badge-warning", acct: state.accountingStandard === "TT200" ? "344" : "3386" }
  };

  tbody.innerHTML = displayedEscrows.map(v => {
    const lbl = typeLabels[v.type] || { name: "Ký quỹ", class: "badge-info", acct: "" };
    const isRefund = v.type.includes("refund");
    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="escrow-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchEscrowsUI()">
        </td>
        <td class="font-numeric" style="font-weight:700;">${v.id}</td>
        <td>${v.date}</td>
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
        <td><span class="badge ${lbl.class}">${lbl.name}</span></td>
        <td>${v.description}</td>
        <td class="font-numeric" style="font-weight:700; color:var(--color-primary);">${lbl.acct}</td>
        <td class="text-right font-numeric" style="font-weight:700; ${isRefund ? 'color: var(--text-muted);' : ''}">${formatVND(v.amount)}</td>
        <td>
          <span class="badge ${isRefund ? 'badge-danger' : 'badge-success'}">
            ${isRefund ? 'Đã tất toán' : 'Đang hiệu lực'}
          </span>
        </td>
        <td style="text-align: center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" style="height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0 8px;">Xem/In</button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Lọc ký quỹ
function filterEscrowTable() {
  escrowCurrentPage = 1;
  renderEscrowTable();
}

function clearEscrowDateFilter() {
  const fromEl = document.getElementById("search-escrow-from");
  const toEl = document.getElementById("search-escrow-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  filterEscrowTable();
}

function changeEscrowPage(p) {
  escrowCurrentPage = p;
  renderEscrowTable();
}

// Thay đổi loại ký quỹ trong Form
function handleEscrowTypeChange() {
  const type = document.getElementById("esc-type").value;
  const activeWrap = document.getElementById("esc-active-selection-wrapper");
  const returnGroup = document.getElementById("escrow-expected-date-group");

  // Ẩn/Hiện combo tất toán nếu là nghiệp vụ hoàn trả
  if (type.includes("refund")) {
    activeWrap.style.display = "";
    returnGroup.style.display = "none";
    populateActiveEscrowsDropdown();
    autoFillEscrowRefundData();
  } else {
    activeWrap.style.display = "none";
    returnGroup.style.display = "";
    populatePartnerDropdown("esc-partner", null);

    // Thiết lập giá trị mặc định cho form tạo mới
    document.getElementById("esc-amount").value = Number(10000000).toLocaleString("vi-VN");
    document.getElementById("esc-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("esc-return-date").value = "";
    document.getElementById("esc-desc").value = type === "escrow_pay" ? "Chi tiền gửi ký quỹ bảo lãnh" : "Nhận tiền đặt cọc ký quỹ của đối tác";
  }
}

// Nạp các khoản ký quỹ đang còn hiệu lực vào combo
function populateActiveEscrowsDropdown() {
  const select = document.getElementById("esc-active-selection");
  const type = document.getElementById("esc-type").value;

  if (!select) return;

  // Lọc các ký quỹ gốc mang đi hoặc nhận về chưa từng được tất toán
  const allVouchers = state.vouchers;
  const refundedIds = allVouchers
    .filter(v => v.type.includes("refund"))
    .map(v => v.escrowRefId);

  // Lọc loại ký quỹ tương ứng
  const targetType = type === "escrow_refund_pay" ? "escrow_pay" : "escrow_receive";
  const actives = allVouchers.filter(v => v.type === targetType && !refundedIds.includes(v.id));

  if (actives.length === 0) {
    select.innerHTML = `<option value="">-- Không có khoản ký quỹ khả dụng --</option>`;
  } else {
    select.innerHTML = actives.map(a => `<option value="${a.id}">${a.id} - ${a.partnerName} (${formatVND(a.amount)})</option>`).join("");
  }
}

// Tự điền thông tin khi chọn tất toán khoản ký quỹ
function autoFillEscrowRefundData() {
  const refId = document.getElementById("esc-active-selection").value;
  if (!refId) return;

  const originVoucher = state.vouchers.find(v => v.id === refId);
  if (originVoucher) {
    document.getElementById("esc-partner").innerHTML = `<option value="${originVoucher.partnerId}">${originVoucher.partnerName}</option>`;
    document.getElementById("esc-amount").value = Number(originVoucher.amount || 0).toLocaleString("vi-VN");
    document.getElementById("esc-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("esc-desc").value = `Tất toán hoàn trả theo chứng từ gốc ${originVoucher.id}`;
  }
}

// Ghi sổ chứng từ Ký quỹ
function handleEscrowSubmit(e) {
  e.preventDefault();

  const type = document.getElementById("esc-type").value;
  const partnerInputVal = document.getElementById("esc-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;

  const refId = document.getElementById("esc-active-selection").value;

  if (type.includes("refund") && !refId) {
    showToast("Không có khoản ký quỹ gốc nào để thực hiện tất toán!", "danger");
    return;
  }

  const newVoucher = {
    id: `KQ-${new Date().getFullYear().toString().substring(2)}-${(state.vouchers.filter(v => v.type.startsWith('escrow_')).length + 1).toString().padStart(4, '0')}`,
    type,
    date: document.getElementById("esc-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("esc-payment-method").value,
    amount: parseInt(document.getElementById("esc-amount").value.replace(/\D/g, "")) || 0,
    description: document.getElementById("esc-desc").value,
    expectedReturnDate: document.getElementById("esc-return-date") ? document.getElementById("esc-return-date").value : "",
    escrowRefId: type.includes("refund") ? refId : null, // Liên kết đến chứng từ ký quỹ gốc
    isManual: true,
    _sessionId: clientSessionId
  };

  state.vouchers.push(newVoucher);
  saveState();
  recalculateAccounting();

  closeModal("modal-add-escrow");
  showToast("Ghi nhận nghiệp vụ ký quỹ thành công!", "success");
}

function toggleSelectAllEscrows(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".escrow-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchEscrowsUI();
}

function updateBatchEscrowsUI() {
  const checkboxes = document.querySelectorAll(".escrow-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-escrow");
  const count = document.getElementById("selected-escrows-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-escrow");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteEscrows() {
  const checked = Array.from(document.querySelectorAll(".escrow-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} chứng từ ký quỹ đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    saveState();
    recalculateAccounting();

    const master = document.getElementById("check-all-escrow");
    if (master) master.checked = false;

    updateBatchEscrowsUI();

    if (typeof safeRefreshAllModules === "function") {
      safeRefreshAllModules();
    } else {
      renderEscrowTable();
      if (typeof filterCash === "function") {
        filterCash();
        if (typeof recalculateCashKpis === "function") recalculateCashKpis();
      }
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof filterDebts === "function") filterDebts();
      if (typeof filterPartners === "function") filterPartners();
      if (typeof renderInventoryTable === "function") renderInventoryTable();
    }

    showToast(`Đã xóa thành công ${checked.length} chứng từ ký quỹ!`, "success");
  }
}

function exportEscrowsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredEscrows = state.vouchers.filter(v => v.type.startsWith("escrow_"));

  const query = document.getElementById("search-escrow") ? document.getElementById("search-escrow").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-escrow-from") ? document.getElementById("search-escrow-from").value : "";
  const toDate = document.getElementById("search-escrow-to") ? document.getElementById("search-escrow-to").value : "";

  if (query) {
    filteredEscrows = filteredEscrows.filter(v =>
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
    );
  }
  if (fromDate) filteredEscrows = filteredEscrows.filter(v => v.date >= fromDate);
  if (toDate) filteredEscrows = filteredEscrows.filter(v => v.date <= toDate);
  filteredEscrows.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const headerBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totalBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const fntTitle = { name: "Times New Roman", sz: 13, bold: true };
    const fntHdr = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const fntBold = { name: "Times New Roman", sz: 11, bold: true };
    const fntNorm = { name: "Times New Roman", sz: 11 };
    const cCenter = { horizontal: "center", vertical: "center" };
    const cLeft = { horizontal: "left", vertical: "center", wrapText: true };
    const cRight = { horizontal: "right", vertical: "center" };
    const numFmt = "#,##0 ;[Red](#,##0)";
    const dateFmt = "dd/mm/yyyy";

    const setCell = (ws, r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    const typeNames = {
      escrow_pay: "Chi ký quỹ đi (Tài sản)",
      escrow_receive: "Nhận ký quỹ về (Nợ phải trả)",
      escrow_refund_pay: "Tất toán ký quỹ đi",
      escrow_refund_receive: "Tất toán nhận ký quỹ"
    };

    // ROW 0: Tiêu đề
    const compName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
    setCell(ws, 0, 0, compName, 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

    // ROW 1: Tên báo cáo
    setCell(ws, 1, 0, "DANH SÁCH CHỨNG TỪ KÝ QUỸ", 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

    // ROW 2: Headers cột
    const headers = ["Ngày chứng từ", "Số chứng từ", "Đối tác liên quan", "Loại nghiệp vụ", "Diễn giải", "Tài khoản", "Số tiền ký quỹ", "Trạng thái"];
    headers.forEach((h, c) => {
      setCell(ws, 2, c, h, 's', { font: fntHdr, fill: headerBg, alignment: cCenter, border: border4 }, null);
    });

    // DATA ROWS
    let rowIdx = 3;
    let totalAmt = 0;
    filteredEscrows.forEach((v, idx) => {
      const bg = idx % 2 === 0 ? null : altBg;
      const bs = (al) => ({ font: fntNorm, fill: bg, alignment: al, border: border4 });
      const acct = v.type.includes("receive") || v.type.includes("refund_receive")
        ? (state.accountingStandard === "TT200" ? "344" : "3386")
        : (state.accountingStandard === "TT200" ? "244" : "1386");
      const status = v.type.includes("refund") ? "Đã tất toán" : "Đang hiệu lực";

      setCell(ws, rowIdx, 0, dateStrToSerial(v.date), 'n', bs(cCenter), dateFmt);
      setCell(ws, rowIdx, 1, v.id, 's', bs(cCenter), null);
      setCell(ws, rowIdx, 2, v.partnerName || getPartnerNameForVoucher(v), 's', bs(cLeft), null);
      setCell(ws, rowIdx, 3, typeNames[v.type] || "Ký quỹ", 's', bs(cLeft), null);
      setCell(ws, rowIdx, 4, v.description, 's', bs(cLeft), null);
      setCell(ws, rowIdx, 5, acct, 's', bs(cCenter), null);
      setCell(ws, rowIdx, 6, v.amount || 0, 'n', bs(cRight), numFmt);
      setCell(ws, rowIdx, 7, status, 's', bs(cCenter), null);

      totalAmt += v.amount || 0;
      rowIdx++;
    });

    // DÒNG TỔNG
    const ts = (al) => ({ font: fntBold, fill: totalBg, alignment: al, border: border4 });
    setCell(ws, rowIdx, 0, "TỔNG CỘNG", 's', ts(cLeft), null);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 5 } });
    setCell(ws, rowIdx, 6, totalAmt, 'n', ts(cRight), numFmt);
    setCell(ws, rowIdx, 7, "", 's', ts(cCenter), null);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: 7 } });
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 28 },
      { wch: 35 }, { wch: 12 }, { wch: 18 }, { wch: 16 }
    ];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 20 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Ky quy");

    let dateRangeSuffix = "";
    if (fromDate || toDate) dateRangeSuffix = `_${fromDate || ""}_${toDate || ""}`;
    const outName = `Ky_quy_${new Date().toISOString().split('T')[0]}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel ký quỹ: ${err.message}`, "danger");
  }
}
// Escrows
window.filterEscrowTable = filterEscrowTable;
window.changeEscrowPage = changeEscrowPage;
window.clearEscrowDateFilter = clearEscrowDateFilter;
window.toggleSelectAllEscrows = toggleSelectAllEscrows;
window.updateBatchEscrowsUI = updateBatchEscrowsUI;
window.batchDeleteEscrows = batchDeleteEscrows;
window.exportEscrowsToExcel = exportEscrowsToExcel;