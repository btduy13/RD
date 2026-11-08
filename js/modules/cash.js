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
let editingReceiptId = null;
let editingPaymentId = null;
let editingJournalId = null;
if (typeof registerVoucherEditForm === "function") {
  registerVoucherEditForm({ key: "general_journal", getEditingId: () => editingJournalId, setEditingId: value => { editingJournalId = value || null; } });
  registerVoucherEditForm({ key: "receipt", getEditingId: () => editingReceiptId, setEditingId: value => { editingReceiptId = value || null; } });
  registerVoucherEditForm({ key: "payment", getEditingId: () => editingPaymentId, setEditingId: value => { editingPaymentId = value || null; } });
}

function resetReceiptForm() {
    editingReceiptId = null;
    const modalTitle = document.querySelector("#modal-add-receipt .card-title");
    if (modalTitle) modalTitle.innerText = "Lập Phiếu Thu Tiền (Cash Receipt)";
    if (typeof updateVoucherModeBadge === "function") updateVoucherModeBadge("modal-add-receipt", false);
    const submitBtn = document.querySelector("#form-receipt button[type='submit']");
    if (submitBtn) submitBtn.innerText = "Ghi sổ";
}

// TK Nợ mặc định của phiếu chi theo đối tác (TT133/TT200): chi cho khách (lẻ / doanh nghiệp /
// công trình) là Nợ 131, chi cho NCC là Nợ 331. Chỉ đổi giữa 131/331 khi người dùng chưa tự chọn.
let paymentDebitChosen = false;

function markPaymentDebitChosen() {
    paymentDebitChosen = true;
}

function onPaymentPartnerChange() {
    if (paymentDebitChosen) return;
    const debitEl = document.getElementById("payment-debit");
    const partnerEl = document.getElementById("payment-partner");
    if (!debitEl || !partnerEl || (debitEl.value !== "131" && debitEl.value !== "331")) return;
    const p = typeof findExistingPartner === "function" ? findExistingPartner(partnerEl.value) : null;
    if (!p) return;
    debitEl.value = (p.type === "supplier" || p.type === "both") ? "331" : "131";
}

function resetPaymentForm() {
    paymentDebitChosen = false;
    editingPaymentId = null;
    const modalTitle = document.querySelector("#modal-add-payment .card-title");
    if (modalTitle) modalTitle.innerText = "Lập Phiếu Chi Tiền (Cash Payment)";
    if (typeof updateVoucherModeBadge === "function") updateVoucherModeBadge("modal-add-payment", false);
    const submitBtn = document.querySelector("#form-payment button[type='submit']");
    if (submitBtn) submitBtn.innerText = "Ghi sổ";
}

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

function calculateCashListTotals(vouchers) {
    return (Array.isArray(vouchers) ? vouchers : []).reduce((totals, voucher) => {
        const amount = Number(voucher.amount ?? voucher.totalAmount ?? 0);
        if (!Number.isFinite(amount)) return totals;

        if (voucher.type === "receipt" || voucher.type === "escrow_receive" || voucher.type === "escrow_refund_pay") {
            totals.receipts += amount;
        } else if (voucher.type === "payment" || voucher.type === "escrow_pay" || voucher.type === "escrow_refund_receive") {
            totals.payments += amount;
        }
        return totals;
    }, { receipts: 0, payments: 0 });
}

function renderCashListTotals(vouchers) {
    const totals = calculateCashListTotals(vouchers);
    const receiptEl = document.getElementById("cash-filtered-receipt-total");
    const paymentEl = document.getElementById("cash-filtered-payment-total");

    if (receiptEl) receiptEl.innerText = formatVND(totals.receipts);
    if (paymentEl) paymentEl.innerText = formatVND(totals.payments);
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

    renderCashListTotals(filteredCashList);

    tbody.innerHTML = "";
    if (pageItems.length === 0) {
        renderEmptyState(tbody, 10, 'Không tìm thấy chứng từ nào', 'Nhấn "Lập Phiếu Thu" hoặc "Lập Phiếu Chi" để thêm chứng từ');
    } else {
        pageItems.forEach(v => {
                    const isJournal = v.type === "general_journal";
                    const typeLabel = isJournal ? "Phiếu KT" : (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu Thu" : "Phiếu Chi";
                    const isReceipt = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
                    const methodLabel = isJournal ? "" : v.paymentMethod === "111" ? "Tiền mặt (111)" : "Ngân hàng (112)";

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
        <td style="font-weight:bold; color:var(--color-primary);">${escapeHtmlText(v.id)}</td>
        <td>${isJournal ? "" : `<a href="#" onclick="viewPartnerLedger('${escapedPartnerId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${escapeHtmlText(getPartnerNameForVoucher(v))}</a>`}</td>
        <td class="cell-clip" title="${escapeHtmlText(v.description || "")}">${escapeHtmlText(v.description || "")}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric">${formatVND(v.amount).replace("đ", "")}</td>
        <td>
          <span class="badge ${isJournal ? 'badge-info' : isReceipt ? 'badge-success' : 'badge-danger'}">
            ${typeLabel}
          </span>
        </td>
        <td>${methodLabel}</td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapedVoucherId}')" title="Xem và In mẫu chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            ${(v.type === "receipt" || v.type === "payment" || isJournal) ? `
            <button class="edit-btn" onclick="event.stopPropagation(); ${isJournal ? `editGeneralJournalVoucher('${escapedVoucherId}')` : v.type === "receipt" ? `editReceiptVoucher('${escapedVoucherId}')` : `editPaymentVoucher('${escapedVoucherId}')`}" title="Chỉnh sửa phiếu" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>` : ""}
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
    const isCash = v.type === "receipt" || v.type === "payment" || v.type === "general_journal" || (v.type && v.type.startsWith("escrow_"));
    if (!isCash) return false;

    const partnerName = getPartnerNameForVoucher(v);
    const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query, v.amount);

    let matchesType = true;
    if (filterType === "receipt") {
      matchesType = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
    } else if (filterType === "payment") {
      matchesType = v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive";
    } else if (filterType === "needsReview") {
      matchesType = v.needsReview === true;
    } else if (filterType === "general_journal") {
      matchesType = v.type === "general_journal";
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
    return naturalCompare(b.id, a.id);
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

// Tài khoản ký quỹ trên form thu/chi theo chế độ kế toán hiện hành
// (TT200: 344/244, TT133: 3386/1386), khớp với bút toán ghi sổ.
function syncCashDepositAccountOptions() {
  if (typeof document === "undefined" || !document) return;
  const isTT200 = isTT99Family(state.accountingStandard);
  const apply = (selectId, codes, label) => {
    const select = document.getElementById(selectId);
    if (!select || !select.options) return;
    Array.from(select.options).forEach(option => {
      if (!codes.includes(String(option.value))) return;
      const code = isTT200 ? codes[0] : codes[1];
      option.value = code;
      option.textContent = `${label} (TK ${code})`;
    });
  };
  apply("receipt-credit", ["344", "3386"], "Nhận ký quỹ, ký cược");
  apply("payment-debit", ["244", "1386"], "Chi ký quỹ, ký cược");
  // Nộp thuế TNCN/TNDN nhà thầu, phí – lệ phí (F1): tên lấy từ danh mục tài khoản của chế độ hiện hành.
  const debitSelect = document.getElementById("payment-debit");
  if (debitSelect && debitSelect.options && typeof getAccountName === "function") {
    ["3334", "3335", "3339"].forEach(code => {
      const name = getAccountName(code, state.accountingStandard);
      if (name && !Array.from(debitSelect.options).some(option => option.value === code)) debitSelect.add(new Option(`${name} (TK ${code})`, code));
    });
  }
}

// Tài khoản lưu trên phiếu có thể thuộc chế độ cũ: hiển thị theo chế độ hiện hành.
function cashDepositAccountForForm(type, entry) {
  if (typeof mapCashDepositEntries !== "function") return entry;
  const probe = { type, entries: [entry] };
  mapCashDepositEntries(probe, state.accountingStandard);
  return probe.entries[0];
}

function openAddReceiptModal() {
  document.getElementById("form-receipt").reset();
  resetReceiptForm();
  syncCashDepositAccountOptions();
  document.getElementById("receipt-date").value = getLocalDateString();
  openModal("modal-add-receipt");
}

function openAddPaymentModal() {
  document.getElementById("form-payment").reset();
  resetPaymentForm();
  syncCashDepositAccountOptions();
  document.getElementById("payment-date").value = getLocalDateString();
  openModal("modal-add-payment");
}

function editReceiptVoucher(id) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v || v.type !== "receipt") return;

  editingReceiptId = id;
  if (typeof noteVoucherEditOpened === "function") noteVoucherEditOpened("receipt", v);

  const modalTitle = document.querySelector("#modal-add-receipt .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa Phiếu Thu: ${id}`;

  syncCashDepositAccountOptions();
  const entry = cashDepositAccountForForm("receipt", (v.entries && v.entries[0]) || {});
  document.getElementById("receipt-date").value = v.date || getLocalDateString();
  const pObj = typeof getPartnerForVoucher === "function" ? getPartnerForVoucher(v) : null;
  document.getElementById("receipt-partner").value = pObj ? `${pObj.name} (${pObj.id})` : (v.partnerName || "");
  document.getElementById("receipt-debit").value = entry.debit || v.paymentMethod || "111";
  document.getElementById("receipt-credit").value = entry.credit || "131";
  document.getElementById("receipt-amount").value = formatVND(v.amount || 0).replace("đ", "").trim();
  document.getElementById("receipt-desc").value = v.description || "";

  const submitBtn = document.querySelector("#form-receipt button[type='submit']");
  if (submitBtn) submitBtn.innerText = "Cập nhật";

  openModal("modal-add-receipt");
}

function editPaymentVoucher(id) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v || v.type !== "payment") return;

  editingPaymentId = id;
  if (typeof noteVoucherEditOpened === "function") noteVoucherEditOpened("payment", v);

  const modalTitle = document.querySelector("#modal-add-payment .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa Phiếu Chi: ${id}`;

  syncCashDepositAccountOptions();
  const entry = cashDepositAccountForForm("payment", (v.entries && v.entries[0]) || {});
  document.getElementById("payment-date").value = v.date || getLocalDateString();
  const pObj = typeof getPartnerForVoucher === "function" ? getPartnerForVoucher(v) : null;
  document.getElementById("payment-partner").value = pObj ? `${pObj.name} (${pObj.id})` : (v.partnerName || "");
  document.getElementById("payment-debit").value = entry.debit || "331";
  paymentDebitChosen = true; // tài khoản đã lưu là lựa chọn của kế toán — không tự đổi
  document.getElementById("payment-credit").value = entry.credit || v.paymentMethod || "111";
  document.getElementById("payment-amount").value = formatVND(v.amount || 0).replace("đ", "").trim();
  document.getElementById("payment-desc").value = v.description || "";

  const submitBtn = document.querySelector("#form-payment button[type='submit']");
  if (submitBtn) submitBtn.innerText = "Cập nhật";

  openModal("modal-add-payment");
}

function generateNextReceiptVoucherId() {
  const prefix = "PT";
  let maxNum = typeof getMaxLocalVoucherSequence === "function"
    ? getMaxLocalVoucherSequence(prefix)
    : 0;
  if (!maxNum) {
    const regex = /^PT(\d+)$/;
    (state.vouchers || []).forEach(v => {
      const match = v && v.id && String(v.id).match(regex);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    });
  }
  if (maxNum === 0) maxNum = 13122;
  return `${prefix}${maxNum + 1}`;
}

function generateNextPaymentVoucherId() {
  const prefix = "PC";
  let maxNum = typeof getMaxLocalVoucherSequence === "function"
    ? getMaxLocalVoucherSequence(prefix)
    : 0;
  if (!maxNum) {
    const regex = /^PC(\d+)$/;
    (state.vouchers || []).forEach(v => {
      const match = v && v.id && String(v.id).match(regex);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    });
  }
  if (maxNum === 0) maxNum = 7194;
  return `${prefix}${maxNum + 1}`;
}

async function handleReceiptSubmit(e) {
  e.preventDefault();

  const modalId = "modal-add-receipt";
  const modal = document.getElementById(modalId);
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const date = document.getElementById("receipt-date").value;
  const partnerVal = document.getElementById("receipt-partner").value;
  const debit = document.getElementById("receipt-debit").value;
  const credit = document.getElementById("receipt-credit").value;
  const amount = parseInt(document.getElementById("receipt-amount").value.replace(/\D/g, "")) || 0;
  const desc = document.getElementById("receipt-desc").value.trim();

  if (!date || ((/^(131|331)/.test(debit) || /^(131|331)/.test(credit)) && !partnerVal.trim())) {
    showToast("Vui lòng nhập ngày và đối tác khi hạch toán công nợ.", "danger");
    return;
  }

  if (amount <= 0) {
    showToast("Số tiền phải lớn hơn 0!", "danger");
    return;
  }

  if (!beginVoucherSubmit(modalId, "Đang lưu phiếu thu...")) return;

  // Sync may have renumbered/replaced the voucher while this form was open.
  if (typeof reconcileVoucherEditForm === "function") reconcileVoucherEditForm("receipt");
  const editId = editingReceiptId;
  const oldVoucher = editId ? state.vouchers.find(v => v.id === editId) : null;
  let stagedVoucher = null;
  let localSaved = false;
  try {
    if (editId && !oldVoucher) throw new Error("Chứng từ đang sửa không còn tồn tại. Hãy tải lại danh sách.");
    const partnerObj = resolvePartner(partnerVal, (String(debit).startsWith("331") || String(credit).startsWith("331")) ? "supplier" : "retail");
    if (!partnerObj) throw new Error("Tên đối tác không hợp lệ.");
    const isEdit = !!editId;
    let id = editId || generateNextReceiptVoucherId();

    if (!editId && typeof ensureCloudSafeVoucherIdForSave === "function") {
      setVoucherFormStatus(modalId, "Đang kiểm tra số phiếu thu trên cloud...", "cloud");
      id = await ensureCloudSafeVoucherIdForSave({
        currentId: id,
        prefix: "PT",
        fallbackBase: 13122
      });
    }

    const updatedVoucher = {
      ...(oldVoucher || {}),
      id,
      type: "receipt",
      date,
      partnerId: partnerObj.id,
      partnerName: partnerObj.name,
      paymentMethod: debit,
      description: desc,
      amount,
      isManual: true,
      _updatedAt: Date.now(),
      _sessionId: clientSessionId,
      entries: [
        { debit, credit, amount, desc }
      ]
    };
    // Kế toán đã lưu lại từ form sửa: bỏ cờ "cần rà soát" của lần nhập Excel.
    delete updatedVoucher.needsReview;

    if (editId) {
      const idx = state.vouchers.findIndex(v => v.id === editId);
      if (idx < 0 || state.vouchers[idx] !== oldVoucher) throw new Error("Chứng từ đã thay đổi. Hãy mở lại trước khi sửa.");
      state.vouchers[idx] = updatedVoucher;
    } else {
      if (state.vouchers.some(v => v.id === id)) throw new Error("Số phiếu đã tồn tại. Vui lòng thử lại.");
      state.vouchers.push(updatedVoucher);
    }
    stagedVoucher = updatedVoucher;

    setVoucherFormStatus(modalId, "Đang đồng bộ máy khác...", "sync");
    recalculateAccounting(false);
    const cloudCommitted = await saveStateAndSyncVoucher();
    localSaved = true;
    resetReceiptForm();

    closeModal(modalId);
    showToast(
      cloudCommitted
        ? (isEdit ? "Cập nhật phiếu thu thành công!" : "Lập phiếu thu thành công!")
        : "Phiếu thu đã lưu trên máy này và đang chờ đồng bộ sang máy khác.",
      cloudCommitted ? "success" : "warning"
    );
    document.getElementById("form-receipt").reset();

    filterCash();
    recalculateCashKpis();
  } catch (err) {
    if (!localSaved && stagedVoucher) {
      const idx = state.vouchers.indexOf(stagedVoucher);
      if (idx >= 0) {
        if (oldVoucher) state.vouchers[idx] = oldVoucher;
        else state.vouchers.splice(idx, 1);
      }
      recalculateAccounting(false);
    }
    console.error("[Cash] Lưu phiếu thu thất bại:", err);
    setVoucherFormStatus(modalId, "Không thể lưu phiếu thu. Vui lòng thử lại.", "error");
    showToast("Không thể lưu phiếu thu. Vui lòng thử lại.", "danger");
  } finally {
    endVoucherSubmit(modalId);
  }
}

async function handlePaymentSubmit(e) {
  e.preventDefault();

  const modalId = "modal-add-payment";
  const modal = document.getElementById(modalId);
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const date = document.getElementById("payment-date").value;
  const partnerVal = document.getElementById("payment-partner").value;
  const debit = document.getElementById("payment-debit").value;
  const credit = document.getElementById("payment-credit").value;
  const amount = parseInt(document.getElementById("payment-amount").value.replace(/\D/g, "")) || 0;
  const desc = document.getElementById("payment-desc").value.trim();

  if (!date || ((/^(131|331)/.test(debit) || /^(131|331)/.test(credit)) && !partnerVal.trim())) {
    showToast("Vui lòng nhập ngày và đối tác khi hạch toán công nợ.", "danger");
    return;
  }

  if (amount <= 0) {
    showToast("Số tiền phải lớn hơn 0!", "danger");
    return;
  }

  if (!beginVoucherSubmit(modalId, "Đang lưu phiếu chi...")) return;

  // Sync may have renumbered/replaced the voucher while this form was open.
  if (typeof reconcileVoucherEditForm === "function") reconcileVoucherEditForm("payment");
  const editId = editingPaymentId;
  const oldVoucher = editId ? state.vouchers.find(v => v.id === editId) : null;
  let stagedVoucher = null;
  let localSaved = false;
  try {
    if (editId && !oldVoucher) throw new Error("Chứng từ đang sửa không còn tồn tại. Hãy tải lại danh sách.");
    const partnerObj = resolvePartner(partnerVal, (String(debit).startsWith("331") || String(credit).startsWith("331")) ? "supplier" : "retail");
    if (!partnerObj) throw new Error("Tên đối tác không hợp lệ.");
    const isEdit = !!editId;
    let id = editId || generateNextPaymentVoucherId();

    if (!editId && typeof ensureCloudSafeVoucherIdForSave === "function") {
      setVoucherFormStatus(modalId, "Đang kiểm tra số phiếu chi trên cloud...", "cloud");
      id = await ensureCloudSafeVoucherIdForSave({
        currentId: id,
        prefix: "PC",
        fallbackBase: 7194
      });
    }

    const updatedVoucher = {
      ...(oldVoucher || {}),
      id,
      type: "payment",
      date,
      partnerId: partnerObj.id,
      partnerName: partnerObj.name,
      paymentMethod: credit,
      description: desc,
      amount,
      isManual: true,
      _updatedAt: Date.now(),
      _sessionId: clientSessionId,
      entries: [
        { debit, credit, amount, desc }
      ]
    };
    // Kế toán đã lưu lại từ form sửa: bỏ cờ "cần rà soát" của lần nhập Excel.
    delete updatedVoucher.needsReview;

    if (editId) {
      const idx = state.vouchers.findIndex(v => v.id === editId);
      if (idx < 0 || state.vouchers[idx] !== oldVoucher) throw new Error("Chứng từ đã thay đổi. Hãy mở lại trước khi sửa.");
      state.vouchers[idx] = updatedVoucher;
    } else {
      if (state.vouchers.some(v => v.id === id)) throw new Error("Số phiếu đã tồn tại. Vui lòng thử lại.");
      state.vouchers.push(updatedVoucher);
    }
    stagedVoucher = updatedVoucher;

    setVoucherFormStatus(modalId, "Đang đồng bộ máy khác...", "sync");
    recalculateAccounting(false);
    const cloudCommitted = await saveStateAndSyncVoucher();
    localSaved = true;
    resetPaymentForm();

    closeModal(modalId);
    showToast(
      cloudCommitted
        ? (isEdit ? "Cập nhật phiếu chi thành công!" : "Lập phiếu chi thành công!")
        : "Phiếu chi đã lưu trên máy này và đang chờ đồng bộ sang máy khác.",
      cloudCommitted ? "success" : "warning"
    );
    document.getElementById("form-payment").reset();

    filterCash();
    recalculateCashKpis();
  } catch (err) {
    if (!localSaved && stagedVoucher) {
      const idx = state.vouchers.indexOf(stagedVoucher);
      if (idx >= 0) {
        if (oldVoucher) state.vouchers[idx] = oldVoucher;
        else state.vouchers.splice(idx, 1);
      }
      recalculateAccounting(false);
    }
    console.error("[Cash] Lưu phiếu chi thất bại:", err);
    setVoucherFormStatus(modalId, "Không thể lưu phiếu chi. Vui lòng thử lại.", "error");
    showToast("Không thể lưu phiếu chi. Vui lòng thử lại.", "danger");
  } finally {
    endVoucherSubmit(modalId);
  }
}

// ---------------------------------------------------------------------------
// Phiếu kế toán tổng hợp (general_journal): bút toán tay Nợ/Có theo danh mục tài khoản.
// ---------------------------------------------------------------------------
function validateGeneralJournalEntries(entries, std) {
  if (!entries.length) return "Cần ít nhất một dòng bút toán.";
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!isValidAccount(e.debit, std)) return `Dòng ${i + 1}: TK Nợ "${e.debit}" không có trong danh mục tài khoản.`;
    if (!isValidAccount(e.credit, std)) return `Dòng ${i + 1}: TK Có "${e.credit}" không có trong danh mục tài khoản.`;
    if (!(Number(e.amount) > 0)) return `Dòng ${i + 1}: số tiền phải lớn hơn 0.`;
  }
  return "";
}

function addGeneralJournalRow(entry = {}) {
  const tbody = document.getElementById("gj-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="form-control gj-debit" list="datalist-gj-accounts" placeholder="TK Nợ" aria-label="TK Nợ"></td>
    <td><input type="text" class="form-control gj-credit" list="datalist-gj-accounts" placeholder="TK Có" aria-label="TK Có"></td>
    <td><input type="text" class="form-control text-right number-format gj-amount" placeholder="0" aria-label="Số tiền"></td>
    <td><input type="text" class="form-control gj-desc" placeholder="Diễn giải dòng" aria-label="Diễn giải dòng"></td>
    <td style="text-align:center;"><button type="button" class="trash-btn" title="Xóa dòng" aria-label="Xóa dòng" onclick="if (this.closest('tbody').rows.length > 1) this.closest('tr').remove()">×</button></td>`;
  tr.querySelector(".gj-debit").value = entry.debit || "";
  tr.querySelector(".gj-credit").value = entry.credit || "";
  tr.querySelector(".gj-amount").value = entry.amount ? Number(entry.amount).toLocaleString("vi-VN") : "";
  tr.querySelector(".gj-desc").value = entry.desc || "";
  tbody.appendChild(tr);
}

function generateNextGeneralJournalId() {
  const maxNum = typeof getMaxLocalVoucherSequence === "function" ? getMaxLocalVoucherSequence("PKT") : 0;
  return `PKT${maxNum + 1}`;
}

function openGeneralJournalModal(v = null) {
  editingJournalId = v ? v.id : null;
  if (typeof noteVoucherEditOpened === "function") noteVoucherEditOpened("general_journal", v);
  const list = document.getElementById("datalist-gj-accounts");
  if (list && typeof getChartOfAccounts === "function") {
    list.innerHTML = getChartOfAccounts(state.accountingStandard).filter(a => !a.hidden)
      .map(a => `<option value="${escapeHtmlAttr(a.code)}">${escapeHtmlText(a.name)}</option>`).join("");
  }
  const title = document.querySelector("#modal-general-journal .card-title");
  if (title) title.innerText = v ? `Chỉnh sửa phiếu kế toán: ${v.id}` : "Lập phiếu kế toán tổng hợp";
  const idEl = document.getElementById("gj-id");
  idEl.value = v ? v.id : generateNextGeneralJournalId();
  idEl.readOnly = !!v;
  document.getElementById("gj-date").value = v ? v.date : getLocalDateString();
  document.getElementById("gj-desc").value = v ? v.description || "" : "";
  document.getElementById("gj-rows").innerHTML = "";
  ((v && v.entries && v.entries.length) ? v.entries : [{}]).forEach(entry => addGeneralJournalRow(entry));
  openModal("modal-general-journal");
}

function editGeneralJournalVoucher(id) {
  const v = state.vouchers.find(x => x.id === id && x.type === "general_journal");
  if (v) openGeneralJournalModal(v);
}

function readGeneralJournalEntries(description) {
  return Array.from(document.querySelectorAll("#gj-rows tr")).map(tr => ({
    debit: tr.querySelector(".gj-debit").value.trim(),
    credit: tr.querySelector(".gj-credit").value.trim(),
    amount: parseInt(tr.querySelector(".gj-amount").value.replace(/\D/g, ""), 10) || 0,
    desc: tr.querySelector(".gj-desc").value.trim() || description
  }));
}

// Lưu/sửa giống phiếu thu/chi: số chứng từ an toàn theo cloud, khôi phục khi lưu lỗi, đồng bộ qua saveStateAndSyncVoucher.
async function handleGeneralJournalSubmit(e) {
  e.preventDefault();
  const modalId = "modal-general-journal";
  const date = document.getElementById("gj-date").value;
  const description = document.getElementById("gj-desc").value.trim();
  const entries = readGeneralJournalEntries(description);
  const error = !date ? "Vui lòng nhập ngày chứng từ." : validateGeneralJournalEntries(entries, state.accountingStandard);
  if (error) {
    showToast(error, "danger");
    return;
  }
  if (!beginVoucherSubmit(modalId, "Đang lưu phiếu kế toán...")) return;

  if (typeof reconcileVoucherEditForm === "function") reconcileVoucherEditForm("general_journal");
  const editId = editingJournalId;
  const oldVoucher = editId ? state.vouchers.find(v => v.id === editId) : null;
  let stagedVoucher = null;
  let localSaved = false;
  try {
    if (editId && !oldVoucher) throw new Error("Chứng từ đang sửa không còn tồn tại. Hãy tải lại danh sách.");
    let id = editId || document.getElementById("gj-id").value.trim() || generateNextGeneralJournalId();
    if (!editId && typeof ensureCloudSafeVoucherIdForSave === "function") {
      setVoucherFormStatus(modalId, "Đang kiểm tra số phiếu trên cloud...", "cloud");
      id = await ensureCloudSafeVoucherIdForSave({ currentId: id, prefix: "PKT", fallbackBase: 0 });
    }
    const updatedVoucher = {
      ...(oldVoucher || {}),
      id,
      type: "general_journal",
      date,
      description,
      amount: entries.reduce((sum, entry) => sum + entry.amount, 0),
      entries,
      isManual: true,
      _updatedAt: Date.now(),
      _sessionId: clientSessionId
    };
    if (editId) {
      const idx = state.vouchers.findIndex(v => v.id === editId);
      if (idx < 0 || state.vouchers[idx] !== oldVoucher) throw new Error("Chứng từ đã thay đổi. Hãy mở lại trước khi sửa.");
      state.vouchers[idx] = updatedVoucher;
    } else {
      if (state.vouchers.some(v => v.id === id)) throw new Error("Số phiếu đã tồn tại. Vui lòng thử lại.");
      state.vouchers.push(updatedVoucher);
    }
    stagedVoucher = updatedVoucher;

    setVoucherFormStatus(modalId, "Đang đồng bộ máy khác...", "sync");
    recalculateAccounting(false);
    const cloudCommitted = await saveStateAndSyncVoucher();
    localSaved = true;
    editingJournalId = null;
    closeModal(modalId);
    showToast(
      cloudCommitted
        ? (editId ? "Cập nhật phiếu kế toán thành công!" : "Lập phiếu kế toán thành công!")
        : "Phiếu kế toán đã lưu trên máy này và đang chờ đồng bộ sang máy khác.",
      cloudCommitted ? "success" : "warning"
    );
    if (typeof filterCash === "function") filterCash();
  } catch (err) {
    if (!localSaved && stagedVoucher) {
      const idx = state.vouchers.indexOf(stagedVoucher);
      if (idx >= 0) {
        if (oldVoucher) state.vouchers[idx] = oldVoucher;
        else state.vouchers.splice(idx, 1);
      }
      recalculateAccounting(false);
    }
    console.error("[Cash] Lưu phiếu kế toán thất bại:", err);
    setVoucherFormStatus(modalId, "Không thể lưu phiếu kế toán. Vui lòng thử lại.", "error");
    showToast("Không thể lưu phiếu kế toán. Vui lòng thử lại.", "danger");
  } finally {
    endVoucherSubmit(modalId);
  }
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
    } else if (filterType === "needsReview") {
      matchesType = v.needsReview === true;
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
    return naturalCompare(b.id, a.id);
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
    `Thu__chi_tien_${getLocalDateString()}${dateRangeSuffix}.xlsx`,
    filteredCash,
    cashMapper,
    fallbackHeaders,
    cashMapper
  );
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

async function batchDeleteCash() {
  if (window.assertCanWriteRole?.() === false) return; // utils.js có thể chưa nạp (sandbox test)
  const checked = Array.from(document.querySelectorAll(".cash-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  const ok = await showConfirmModal({
    title: "Xác nhận xóa phiếu thu chi",
    message: `Bạn có chắc chắn muốn xóa ${checked.length} chứng từ thu chi đã chọn?`,
    confirmText: "Xóa chứng từ",
    cancelText: "Hủy bỏ",
    type: "danger"
  });
  if (!ok) return;

  const idsToDelete = checked.map(cb => String(cb.value));
  const deleteSet = new Set(idsToDelete);
  const removed = state.vouchers.filter(v => deleteSet.has(String(v.id)));
  const deletionToken = trackDeletedIds(idsToDelete, 'voucher');
  let localSaved = false;
  try {
    state.vouchers = state.vouchers.filter(v => !deleteSet.has(String(v.id)));
    recalculateAccounting(false);
    const cloudCommitted = await saveStateAndSyncVoucher();
    localSaved = true;
    if (typeof resetBatchSelectionUI === "function") {
      resetBatchSelectionUI({ checkboxSelector: ".cash-checkbox", masterId: "check-all-cash", buttonId: "btn-batch-delete-cash", countId: "selected-cash-count" });
    }
    showToast(cloudCommitted ? `Đã xóa thành công ${removed.length} chứng từ thu chi!` : "Đã xóa trên máy này và đang chờ đồng bộ.", cloudCommitted ? "success" : "warning");
  } catch (err) {
    if (!localSaved) {
      const active = new Set(state.vouchers.map(v => String(v.id)));
      state.vouchers.push(...removed.filter(v => !active.has(String(v.id))));
      if (typeof rollbackTrackedDeletedIds === "function") rollbackTrackedDeletedIds(deletionToken);
      recalculateAccounting(false);
    }
    console.error("[Cash] Không thể xóa phiếu thu chi:", err);
    showToast("Không thể lưu thao tác xóa phiếu thu chi. Vui lòng thử lại.", "danger");
  }
}
// Cash
window.filterCash = filterCash;
window.recalculateCashKpis = recalculateCashKpis;
window.calculateCashListTotals = calculateCashListTotals;
window.changeCashPage = changeCashPage;
window.clearCashDateFilter = clearCashDateFilter;
window.toggleSelectAllCash = toggleSelectAllCash;
window.updateBatchCashUI = updateBatchCashUI;
window.batchDeleteCash = batchDeleteCash;
window.exportCashToExcel = exportCashToExcel;
window.editReceiptVoucher = editReceiptVoucher;
window.editPaymentVoucher = editPaymentVoucher;
window.openAddReceiptModal = openAddReceiptModal;
window.openAddPaymentModal = openAddPaymentModal;
window.onPaymentPartnerChange = onPaymentPartnerChange;
window.markPaymentDebitChosen = markPaymentDebitChosen;
window.syncCashDepositAccountOptions = syncCashDepositAccountOptions;
window.validateGeneralJournalEntries = validateGeneralJournalEntries;
window.addGeneralJournalRow = addGeneralJournalRow;
window.openGeneralJournalModal = openGeneralJournalModal;
window.editGeneralJournalVoucher = editGeneralJournalVoucher;
window.handleGeneralJournalSubmit = handleGeneralJournalSubmit;
