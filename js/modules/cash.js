
// Tìm hóa đơn bán hàng liên quan cho chứng từ phiếu thu/chi
function findRelatedSalesVoucher(voucherId, description, partnerId, amount) {
  const v = state.vouchers.find(x => x.id === voucherId);
  if (!v) return null;

  // 1. Tìm theo số chứng từ bán hàng trong diễn giải (ví dụ: BH39244, BH-25-0001, BH 42026, v.v.)
  const descStr = (description || v.description || "").toString();
  const bhMatch = descStr.match(/BH\s*-?\s*\d+/i);
  if (bhMatch) {
    const matchedId = bhMatch[0].toUpperCase().replace(/\s/g, "").replace("-", ""); // Chuẩn hóa mã
    const relatedSales = state.vouchers.find(x => x.type === "sales" && x.id.toUpperCase().replace("-", "") === matchedId);
    if (relatedSales) return relatedSales;
  }

  // 2. Thử tìm bằng các số dài >= 3 trong diễn giải khớp với mã hóa đơn bán hàng
  const numMatches = descStr.match(/\d+/g);
  if (numMatches) {
    for (const num of numMatches) {
      if (num.length >= 3) {
        // Chỉ so khớp nếu phần số của voucher ID bằng đúng num (không khớp substring gây false positive như năm 2026)
        const relatedSales = state.vouchers.find(x => {
          if (x.type !== "sales") return false;
          const numericPart = x.id.replace(/^\D+/, "").replace(/-/g, "");
          return numericPart === num;
        });
        if (relatedSales) return relatedSales;
      }
    }
  }

  // 3. Tìm hóa đơn bán hàng gần nhất của đối tác này có cùng số tiền
  const amt = amount || v.amount || 0;
  if (amt > 0) {
    const relatedSales = state.vouchers.find(x => x.type === "sales" && String(x.partnerId) === String(partnerId) && Math.abs(x.totalAmount - amt) < 100);
    if (relatedSales) return relatedSales;
  }

  return null;
}
let filteredCashList = [];

// --- Phân hệ Thu/Chi ---
function recalculateCashKpis() {
  const balance111 = getAccountBalance("111");
  const balance112 = getAccountBalance("112");

  let totalReceipts = 0;
  let totalPayments = 0;

  state.vouchers.forEach(v => {
    const isCashVoucher = v.type === "receipt" || v.type === "payment" || (v.type && v.type.startsWith("escrow_"));
    if (!isCashVoucher) return;

    if (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") {
      totalReceipts += v.amount;
    } else if (v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive") {
      totalPayments += v.amount;
    }
  });

  const cashEl = document.getElementById("cash-kpi-cash");
  const bankEl = document.getElementById("cash-kpi-bank");
  const recEl = document.getElementById("cash-kpi-receipts");
  const payEl = document.getElementById("cash-kpi-payments");

  if (cashEl) cashEl.innerText = formatVND(balance111);
  if (bankEl) bankEl.innerText = formatVND(balance112);
  if (recEl) recEl.innerText = formatVND(totalReceipts);
  if (payEl) payEl.innerText = formatVND(totalPayments);
}

function renderCashTable() {
  const tbody = document.getElementById("cash-table-body");
  if (!tbody) return;

  const totalCount = filteredCashList.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  if (cashPage > totalPages) cashPage = totalPages;
  if (cashPage < 1) cashPage = 1;

  const startIdx = (cashPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredCashList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy chứng từ nào</td></tr>`;
  } else {
    pageItems.forEach(v => {
      const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu Thu" : "Phiếu Chi";
      const isReceipt = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
      const methodLabel = v.paymentMethod === "111" ? "Tiền mặt (111)" : "Ngân hàng (112)";

      const tr = document.createElement("tr");
      const escapedPartnerId = escapeHtmlAttr(v.partnerId);
      const escapedVoucherId = escapeHtmlAttr(v.id);
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "voucher");
      tr.setAttribute("data-subtype", v.type);
      tr.setAttribute("data-id", escapedVoucherId);
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="cash-checkbox" value="${escapedVoucherId}" onchange="updateBatchCashUI()">
        </td>
        <td>${formattedDate}</td>
        <td>${formattedDate}</td>
        <td style="font-weight:bold; color:var(--color-primary);">${v.id}</td>
        <td><a href="#" onclick="viewPartnerLedger('${escapedPartnerId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${getPartnerNameForVoucher(v)}</a></td>
        <td>${v.description}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric">${formatVND(v.amount).replace("đ", "")}</td>
        <td>
          <span class="badge ${isReceipt ? 'badge-success' : 'badge-danger'}">
            ${typeLabel}
          </span>
        </td>
        <td>${methodLabel}</td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapedVoucherId}')" title="Xem và In mẫu chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapedVoucherId}')" title="Xóa và Hủy ghi sổ chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const paginationInfo = document.getElementById("cash-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = totalCount > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, totalCount)} trong số ${totalCount} chứng từ (Trang ${cashPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 chứng từ`;
  }

  // Reset check-all-cash checkbox
  const checkAll = document.getElementById("check-all-cash");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchCashUI === "function") updateBatchCashUI();

  // Render pagination controls
  const paginationControls = document.getElementById("cash-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(1)" ${cashPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(${cashPage - 1})" ${cashPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, cashPage - 2);
      let endPage = Math.min(totalPages, cashPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === cashPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeCashPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === cashPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(${cashPage + 1})" ${cashPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(${totalPages})" ${cashPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(endIdx, totalCount)} của ${totalCount} chứng từ
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }
}

function changeCashPage(p) {
  cashPage = p;
  renderCashTable();
}

function filterCash() {
  const query = document.getElementById("cash-search-input") ? document.getElementById("cash-search-input").value : "";
  const filterType = document.getElementById("cash-type-filter") ? document.getElementById("cash-type-filter").value : "all";
  const filterMethod = document.getElementById("cash-method-filter") ? document.getElementById("cash-method-filter").value : "all";
  const fromDate = document.getElementById("search-cash-from") ? document.getElementById("search-cash-from").value : "";
  const toDate = document.getElementById("search-cash-to") ? document.getElementById("search-cash-to").value : "";

  filteredCashList = state.vouchers.filter(v => {
    const isCash = v.type === "receipt" || v.type === "payment" || (v.type && v.type.startsWith("escrow_"));
    if (!isCash) return false;

    const partnerName = getPartnerNameForVoucher(v);
    const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query, v.amount);

    let matchesType = true;
    if (filterType === "receipt") {
      matchesType = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
    } else if (filterType === "payment") {
      matchesType = v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive";
    }

    let matchesMethod = true;
    if (filterMethod !== "all") {
      matchesMethod = v.paymentMethod === filterMethod;
    }

    let matchesDate = true;
    if (fromDate && v.date < fromDate) matchesDate = false;
    if (toDate && v.date > toDate) matchesDate = false;

    return matchesQuery && matchesType && matchesMethod && matchesDate;
  });

  filteredCashList.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da < db) return 1;
    if (da > db) return -1;
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  cashPage = 1;
  renderCashTable();
}

function clearCashDateFilter() {
  if (window.rdpClearInput) {
    rdpClearInput('search-cash-from');
    rdpClearInput('search-cash-to');
  } else {
    const fromEl = document.getElementById('search-cash-from');
    const toEl = document.getElementById('search-cash-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  filterCash();
}

function openAddReceiptModal() {
  document.getElementById("form-receipt").reset();
  document.getElementById("receipt-date").value = new Date().toISOString().split("T")[0];
  openModal("modal-add-receipt");
}

function openAddPaymentModal() {
  document.getElementById("form-payment").reset();
  document.getElementById("payment-date").value = new Date().toISOString().split("T")[0];
  openModal("modal-add-payment");
}

function generateNextReceiptVoucherId() {
  const prefix = "PT";
  const regex = /^PT(\d+)$/;
  let maxNum = 0;

  state.vouchers.forEach(v => {
    if (v && v.id) {
      const match = v.id.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  if (maxNum === 0) {
    maxNum = 13122; // default safe fallback based on DB state
  }

  return `${prefix}${maxNum + 1}`;
}

function generateNextPaymentVoucherId() {
  const prefix = "PC";
  const regex = /^PC(\d+)$/;
  let maxNum = 0;

  state.vouchers.forEach(v => {
    if (v && v.id) {
      const match = v.id.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  if (maxNum === 0) {
    maxNum = 7194; // default safe fallback based on DB state
  }

  return `${prefix}${maxNum + 1}`;
}

function handleReceiptSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-receipt");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const date = document.getElementById("receipt-date").value;
  const partnerVal = document.getElementById("receipt-partner").value;
  const debit = document.getElementById("receipt-debit").value;
  const credit = document.getElementById("receipt-credit").value;
  const amount = parseInt(document.getElementById("receipt-amount").value.replace(/\D/g, "")) || 0;
  const desc = document.getElementById("receipt-desc").value.trim();

  const partnerObj = resolvePartner(partnerVal);

  const id = generateNextReceiptVoucherId();

  const newVoucher = {
    id,
    type: "receipt",
    date,
    partnerId: partnerObj.id,
    partnerName: partnerObj.name,
    paymentMethod: debit,
    description: desc,
    amount,
    isManual: true,
    _sessionId: clientSessionId,
    entries: [
      { debit, credit, amount, desc }
    ]
  };

  state.vouchers.push(newVoucher);
  saveState();
  recalculateAccounting();

  closeModal("modal-add-receipt");
  document.getElementById("form-receipt").reset();
  showToast("Lập phiếu thu thành công!", "success");

  filterCash();
  recalculateCashKpis();
}

function handlePaymentSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-payment");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const date = document.getElementById("payment-date").value;
  const partnerVal = document.getElementById("payment-partner").value;
  const debit = document.getElementById("payment-debit").value;
  const credit = document.getElementById("payment-credit").value;
  const amount = parseInt(document.getElementById("payment-amount").value.replace(/\D/g, "")) || 0;
  const desc = document.getElementById("payment-desc").value.trim();

  const partnerObj = resolvePartner(partnerVal);

  const id = generateNextPaymentVoucherId();

  const newVoucher = {
    id,
    type: "payment",
    date,
    partnerId: partnerObj.id,
    partnerName: partnerObj.name,
    paymentMethod: credit,
    description: desc,
    amount,
    isManual: true,
    _sessionId: clientSessionId,
    entries: [
      { debit, credit, amount, desc }
    ]
  };

  state.vouchers.push(newVoucher);
  saveState();
  recalculateAccounting();

  closeModal("modal-add-payment");
  document.getElementById("form-payment").reset();
  showToast("Lập phiếu chi thành công!", "success");

  filterCash();
  recalculateCashKpis();
}

function exportCashToExcel() {
  const fallbackHeaders = [
    ["DANH SÁCH THU, CHI TIỀN"],
    ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Diễn giải", "Số tiền", "Đối tượng", "Lý do thu/chi", "Ngày ghi sổ quỹ", "Loại chứng từ", "Số chứng từ CUKCUK"]
  ];

  const query = document.getElementById("cash-search-input") ? document.getElementById("cash-search-input").value.toLowerCase() : "";
  const filterType = document.getElementById("cash-type-filter") ? document.getElementById("cash-type-filter").value : "all";
  const filterMethod = document.getElementById("cash-method-filter") ? document.getElementById("cash-method-filter").value : "all";
  const fromDate = document.getElementById("search-cash-from") ? document.getElementById("search-cash-from").value : "";
  const toDate = document.getElementById("search-cash-to") ? document.getElementById("search-cash-to").value : "";

  let filteredCash = state.vouchers.filter(v => {
    const isCash = v.type === "receipt" || v.type === "payment" || (v.type && v.type.startsWith("escrow_"));
    if (!isCash) return false;

    const partnerName = getPartnerNameForVoucher(v);
    const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query, v.amount);

    let matchesType = true;
    if (filterType === "receipt") {
      matchesType = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
    } else if (filterType === "payment") {
      matchesType = v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive";
    }

    let matchesMethod = true;
    if (filterMethod !== "all") {
      matchesMethod = v.paymentMethod === filterMethod;
    }

    let matchesDate = true;
    if (fromDate && v.date < fromDate) matchesDate = false;
    if (toDate && v.date > toDate) matchesDate = false;

    return matchesQuery && matchesType && matchesMethod && matchesDate;
  });

  filteredCash.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da < db) return 1;
    if (da > db) return -1;
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const cashMapper = (v, r) => {
    if (!v.excelRow) {
      v.excelRow = createDefaultVoucherExcelRow(v);
    }
    for (let i = 0; i < 10; i++) {
      r[i] = v.excelRow[i] !== undefined ? v.excelRow[i] : "";
    }
    const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu thu" : "Phiếu chi";
    r[0] = v.date;   // Ngày hạch toán (sẽ được convert sang serial bởi exportExcelWithTemplate)
    r[1] = v.date;   // Ngày chứng từ
    r[2] = v.id;     // Số chứng từ
    r[3] = v.description;  // Diễn giải
    r[4] = v.amount || v.totalAmount || 0;  // Số tiền
    r[5] = v.partnerName || getPartnerNameForVoucher(v);  // Đối tượng
    r[6] = v.description;  // Lý do thu/chi
    r[7] = v.date;   // Ngày ghi sổ quỹ
    r[8] = typeLabel;  // Loại chứng từ
    r[9] = v.id;     // Số chứng từ gốc
  };

  let dateRangeSuffix = "";
  if (fromDate || toDate) {
    dateRangeSuffix = `_tu_${fromDate || "truoc"}_den_${toDate || "sau"}`;
  }

  exportExcelWithTemplate(
    'excel/Thu__chi_tien.xlsx',
    `Thu__chi_tien_${new Date().toISOString().split("T")[0]}${dateRangeSuffix}.xlsx`,
    filteredCash,
    cashMapper,
    fallbackHeaders,
    cashMapper
  );
}

function exportSalesToExcel(detailed = true) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  let filteredSales = state.vouchers.filter(v => v.type === "sales" || v.type === "sales_return");

  const query = document.getElementById("search-sales") ? document.getElementById("search-sales").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-sales-from") ? document.getElementById("search-sales-from").value : "";
  const toDate = document.getElementById("search-sales-to") ? document.getElementById("search-sales-to").value : "";

  if (query) filteredSales = filteredSales.filter(v =>
    matchStr(v.id, query) ||
    matchStr(v.partnerName, query) ||
    matchStr(v.description, query)
  );
  if (fromDate) filteredSales = filteredSales.filter(v => v.date >= fromDate);
  if (toDate) filteredSales = filteredSales.filter(v => v.date <= toDate);
  filteredSales.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];
    const today = new Date().toLocaleDateString('vi-VN');

    const thin = { style: "thin", color: { rgb: "BBBBBB" } };
    const b4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const fntT = { name: "Times New Roman", sz: 12, bold: true };
    const fntSub = { name: "Times New Roman", sz: 10, italic: true };
    const fntH = { name: "Times New Roman", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
    const fntB = { name: "Times New Roman", sz: 10, bold: true };
    const fntN = { name: "Times New Roman", sz: 10 };
    const cC = { horizontal: "center", vertical: "center" };
    const cL = { horizontal: "left", vertical: "center", wrapText: true };
    const cR = { horizontal: "right", vertical: "center" };
    const numFmt = "#,##0 ;[Red](#,##0)";
    const dateFmt = "dd/mm/yyyy";

    const sc = (r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    if (detailed) {
      // ── MISA SO_CHI_TIET_BAN_HANG format ──
      // Col: Ngày HT | Ngày CT | Số CT | Ngày HĐ | Số HĐ | DG chung | DG riêng |
      //      Mã KH | Tên KH | Mã hàng | Tên hàng | ĐVT | SL bán | Đơn giá |
      //      Doanh số | CK | SL trả lại | GT trả lại | GT giảm giá
      const NCOLS = 19;

      // ROW 0: Tên công ty
      sc(0, 0, state.companyName || "Công Ty Cổ Phần Rạng Đông", 's', { font: fntT, alignment: cL });
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });

      // ROW 1: Tiêu đề báo cáo (giống MISA)
      sc(1, 0, "SỔ CHI TIẾT BÁN HÀNG", 's', { font: fntT, alignment: cC });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });

      // ROW 2: Phạm vi ngày
      sc(2, 0, `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`, 's', { font: fntSub, alignment: cC });
      merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS - 1 } });

      // ROW 3: Headers (đúng tên cột MISA để có thể import lại)
      const headers = [
        "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn",
        "Diễn giải chung", "Diễn giải", "Mã khách hàng", "Tên khách hàng",
        "Mã hàng", "Tên hàng", "ĐVT",
        "Tổng số lượng bán", "Đơn giá", "Doanh số bán", "Chiết khấu",
        "Tổng số lượng trả lại", "Giá trị trả lại", "Giá trị giảm giá"
      ];
      headers.forEach((h, c) => sc(3, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: b4 }));

      // DATA ROWS — 1 dòng mỗi sản phẩm trong mỗi chứng từ
      let rowIdx = 4;
      let totalQty = 0, totalGross = 0, totalCK = 0;
      let totalReturnQty = 0, totalReturnValue = 0;

      filteredSales.forEach((v, vi) => {
        const bg = vi % 2 === 0 ? null : altBg;
        const bs = al => ({ font: fntN, fill: bg, alignment: al, border: b4 });
        const ns = al => ({ font: fntN, fill: bg, alignment: al || cR, border: b4 });
        const partnerId = v.partnerId || "";
        const partnerName = v.partnerName || getPartnerNameForVoucher(v);
        const descCommon = v.description || "";
        const isReturn = v.type === "sales_return";

        const writeRow = (productId, productName, unit, qty, price, grossAmt, ckAmt) => {
          sc(rowIdx, 0, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
          sc(rowIdx, 1, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
          sc(rowIdx, 2, v.id, 's', bs(cC));
          sc(rowIdx, 3, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
          sc(rowIdx, 4, v.invoiceNo || "", 's', bs(cC));
          sc(rowIdx, 5, descCommon, 's', bs(cL));
          sc(rowIdx, 6, productName, 's', bs(cL));
          sc(rowIdx, 7, partnerId, 's', bs(cC));
          sc(rowIdx, 8, partnerName, 's', bs(cL));
          sc(rowIdx, 9, productId, 's', bs(cC));
          sc(rowIdx, 10, productName, 's', bs(cL));
          sc(rowIdx, 11, unit, 's', bs(cC));
          
          if (isReturn) {
            sc(rowIdx, 12, 0, 'n', ns(cR), "#,##0.##");  // SL bán
            sc(rowIdx, 13, price, 'n', ns(cR), numFmt);    // Đơn giá
            sc(rowIdx, 14, 0, 'n', ns(cR), numFmt);        // Doanh số bán
            sc(rowIdx, 15, 0, 'n', ns(cR), numFmt);        // Chiết khấu
            sc(rowIdx, 16, qty, 'n', ns(cR), "#,##0.##");  // SL trả lại
            sc(rowIdx, 17, grossAmt, 'n', ns(cR), numFmt);  // GT trả lại
            sc(rowIdx, 18, 0, 'n', ns(cR), numFmt);        // GT giảm giá
            totalReturnQty += qty;
            totalReturnValue += grossAmt;
          } else {
            sc(rowIdx, 12, qty, 'n', ns(cR), "#,##0.##");  // SL bán
            sc(rowIdx, 13, price, 'n', ns(cR), numFmt);    // Đơn giá
            sc(rowIdx, 14, grossAmt, 'n', ns(cR), numFmt); // Doanh số bán
            sc(rowIdx, 15, ckAmt, 'n', ns(cR), numFmt);    // Chiết khấu
            sc(rowIdx, 16, 0, 'n', ns(cR), "#,##0.##");    // SL trả lại
            sc(rowIdx, 17, 0, 'n', ns(cR), numFmt);        // GT trả lại
            sc(rowIdx, 18, 0, 'n', ns(cR), numFmt);        // GT giảm giá
            totalQty += qty;
            totalGross += grossAmt;
            totalCK += ckAmt;
          }
          rowIdx++;
        };

        if (v.items && v.items.length > 0) {
          v.items.forEach(item => {
            const prod = (state.products || []).find(p => String(p.id) === String(item.productId));
            const qty = item.qty || 0;
            const price = item.price || 0;
            const grossAmt = qty * price;
            const ckAmt = grossAmt * ((item.discount || 0) / 100);
            writeRow(
              item.productId || "",
              prod ? prod.name : (item.productName || item.productId || ""),
              prod ? (prod.unit || "Cái") : (item.unit || "Cái"),
              qty, price, grossAmt, ckAmt
            );
          });
        } else {
          // Voucher không có items → 1 dòng tổng
          const gross = (v.totalAmount || 0) - (v.taxAmount || 0);
          writeRow(v.id, descCommon, "", 0, 0, gross, 0);
        }
      });

      // DÒNG TỔNG
      const ts = al => ({ font: fntB, fill: totBg, alignment: al, border: b4 });
      sc(rowIdx, 0, "TỔNG CỘNG", 's', ts(cL));
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 11 } });
      for (let c = 1; c <= 11; c++) sc(rowIdx, c, "", 's', ts(cL));
      sc(rowIdx, 12, totalQty, 'n', ts(cR), "#,##0.##");
      sc(rowIdx, 13, 0, 'n', ts(cR), numFmt);
      sc(rowIdx, 14, totalGross, 'n', ts(cR), numFmt);
      sc(rowIdx, 15, totalCK, 'n', ts(cR), numFmt);
      sc(rowIdx, 16, totalReturnQty, 'n', ts(cR), "#,##0.##");
      sc(rowIdx, 17, totalReturnValue, 'n', ts(cR), numFmt);
      sc(rowIdx, 18, 0, 'n', ts(cR), numFmt);

      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: NCOLS - 1 } });
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
        { wch: 26 }, { wch: 26 }, { wch: 16 }, { wch: 28 },
        { wch: 14 }, { wch: 28 }, { wch: 7 },
        { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 10 }, { wch: 14 }, { wch: 12 }
      ];
      ws['!rows'] = [{ hpt: 20 }, { hpt: 22 }, { hpt: 16 }, { hpt: 22 }];

      XLSX.utils.book_append_sheet(wb, ws, "SO CHI TIET BAN HANG");
      const suffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
      const outName = `SO_CHI_TIET_BAN_HANG_${new Date().toISOString().split('T')[0]}${suffix}.xlsx`;
      XLSX.writeFile(wb, outName);
      showToast(`Đã xuất Excel: ${outName}`, "success");
    } else {
      // ── Xuất danh sách hóa đơn bán hàng (chi tiet = false -> chi xuat thong tin phieu) ──
      const NCOLS = 11;

      // ROW 0: Tên công ty
      sc(0, 0, state.companyName || "Công Ty Cổ Phần Rạng Đông", 's', { font: fntT, alignment: cL });
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });

      // ROW 1: Tiêu đề báo cáo
      sc(1, 0, "DANH SÁCH HÓA ĐƠN BÁN HÀNG", 's', { font: fntT, alignment: cC });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });

      // ROW 2: Phạm vi ngày
      sc(2, 0, `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`, 's', { font: fntSub, alignment: cC });
      merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS - 1 } });

      // ROW 3: Headers
      const headers = [
        "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn",
        "Khách hàng", "Diễn giải chung", "Doanh số bán", "Thuế GTGT", "Tổng cộng thanh toán", "Phương thức thanh toán"
      ];
      headers.forEach((h, c) => sc(3, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: b4 }));

      let rowIdx = 4;
      let totalAmountGross = 0;
      let totalAmountTax = 0;
      let totalAmountTotal = 0;

      filteredSales.forEach((v, vi) => {
        const bg = vi % 2 === 0 ? null : altBg;
        const bs = al => ({ font: fntN, fill: bg, alignment: al, border: b4 });
        const ns = al => ({ font: fntN, fill: bg, alignment: al || cR, border: b4 });

        const isReturn = v.type === "sales_return";
        const sign = isReturn ? -1 : 1;

        const taxAmt = (v.taxAmount || 0) * sign;
        const totalAmt = (v.totalAmount || 0) * sign;
        const grossAmt = totalAmt - taxAmt;
        const partnerName = v.partnerName || getPartnerNameForVoucher(v);

        sc(rowIdx, 0,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày HT
        sc(rowIdx, 1,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày CT
        sc(rowIdx, 2,  v.id,              's',  bs(cC));                 // Số CT
        sc(rowIdx, 3,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày HĐ
        sc(rowIdx, 4,  v.invoiceNo || "", 's',  bs(cC));                 // Số HĐ
        sc(rowIdx, 5,  partnerName,       's',  bs(cL));                 // Khách hàng
        sc(rowIdx, 6,  v.description || "", 's', bs(cL));                 // Diễn giải chung
        sc(rowIdx, 7,  grossAmt,          'n',  ns(cR), numFmt);         // Doanh số bán (BTL hiển thị số âm)
        sc(rowIdx, 8,  taxAmt,            'n',  ns(cR), numFmt);         // Tiền thuế
        sc(rowIdx, 9,  totalAmt,          'n',  ns(cR), numFmt);         // Tổng cộng
        sc(rowIdx, 10, isReturn ? 'Trả hàng' : (v.paymentMethod === '131' ? 'Công nợ (131)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'), 's', bs(cC));

        totalAmountGross += grossAmt;
        totalAmountTax += taxAmt;
        totalAmountTotal += totalAmt;
        rowIdx++;
      });

      // DÒNG TỔNG CỘNG
      const ts = al => ({ font: fntB, fill: totBg, alignment: al, border: b4 });
      sc(rowIdx, 0, "TỔNG CỘNG", 's', ts(cL));
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 6 } });
      for (let c = 1; c <= 6; c++) sc(rowIdx, c, "", 's', ts(cL));
      sc(rowIdx, 7,  totalAmountGross,  'n', ts(cR), numFmt);
      sc(rowIdx, 8,  totalAmountTax,    'n', ts(cR), numFmt);
      sc(rowIdx, 9,  totalAmountTotal,  'n', ts(cR), numFmt);
      sc(rowIdx, 10, "",                's', ts(cC));

      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: NCOLS - 1 } });
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
        { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }
      ];
      ws['!rows'] = [{ hpt: 20 }, { hpt: 22 }, { hpt: 16 }, { hpt: 22 }];

      XLSX.utils.book_append_sheet(wb, ws, "Danh sach");
      const suffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
      const outName = `DANH_SACH_BAN_HANG_${new Date().toISOString().split('T')[0]}${suffix}.xlsx`;
      XLSX.writeFile(wb, outName);
      showToast(`Đã xuất Excel: ${outName}`, "success");
    }
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel bán hàng: ${err.message}`, "danger");
  }
}

function toggleSelectAllCash(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".cash-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchCashUI();
}

function updateBatchCashUI() {
  const checkboxes = document.querySelectorAll(".cash-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-cash");
  const count = document.getElementById("selected-cash-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-cash");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteCash() {
  const checked = Array.from(document.querySelectorAll(".cash-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} chứng từ thu chi đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    const master = document.getElementById("check-all-cash");
    if (master) master.checked = false;

    updateBatchCashUI();
    showToast(`Đã xóa thành công ${checked.length} chứng từ thu chi!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
  }
}
// Cash
window.filterCash = filterCash;
window.recalculateCashKpis = recalculateCashKpis;
window.changeCashPage = changeCashPage;
window.clearCashDateFilter = clearCashDateFilter;
window.toggleSelectAllCash = toggleSelectAllCash;
window.updateBatchCashUI = updateBatchCashUI;
window.batchDeleteCash = batchDeleteCash;
window.exportCashToExcel = exportCashToExcel;