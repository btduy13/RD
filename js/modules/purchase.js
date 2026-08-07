// State variables for column filters
let purchaseColumnFilters = {
  id: "", date: "", partner: "", description: "", paymentMethod: "",
  totalMin: "", totalMax: "", entries: ""
};

let purchaseOrderColumnFilters = {
  id: "", date: "", partner: "", description: "", paymentMethod: "",
  totalMin: "", totalMax: "", entries: ""
};

let purchaseReturnColumnFilters = {
  id: "", date: "", partner: "", description: "", paymentMethod: "",
  totalMin: "", totalMax: "", entries: ""
};

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Debounced render triggers
const debouncedRenderPurchaseTable = debounce(renderPurchaseTable, 300);
const debouncedRenderPurchaseOrderTable = debounce(renderPurchaseOrderTable, 300);
const debouncedRenderPurchaseReturnTable = debounce(renderPurchaseReturnTable, 300);

function onPurchaseFilterChange() {
  purchaseColumnFilters.id = document.getElementById("filter-purchase-id")?.value || "";
  purchaseColumnFilters.date = document.getElementById("filter-purchase-date")?.value || "";
  purchaseColumnFilters.partner = document.getElementById("filter-purchase-partner")?.value || "";
  purchaseColumnFilters.description = document.getElementById("filter-purchase-desc")?.value || "";
  purchaseColumnFilters.paymentMethod = document.getElementById("filter-purchase-payment")?.value || "";
  purchaseColumnFilters.totalMin = document.getElementById("filter-purchase-total-min")?.value || "";
  purchaseColumnFilters.totalMax = document.getElementById("filter-purchase-total-max")?.value || "";
  purchaseColumnFilters.entries = document.getElementById("filter-purchase-entries")?.value || "";
  
  purchaseCurrentPage = 1;
  debouncedRenderPurchaseTable();
}

function onPurchaseOrderFilterChange() {
  purchaseOrderColumnFilters.id = document.getElementById("filter-purchase-order-id")?.value || "";
  purchaseOrderColumnFilters.date = document.getElementById("filter-purchase-order-date")?.value || "";
  purchaseOrderColumnFilters.partner = document.getElementById("filter-purchase-order-partner")?.value || "";
  purchaseOrderColumnFilters.description = document.getElementById("filter-purchase-order-desc")?.value || "";
  purchaseOrderColumnFilters.paymentMethod = document.getElementById("filter-purchase-order-payment")?.value || "";
  purchaseOrderColumnFilters.totalMin = document.getElementById("filter-purchase-order-total-min")?.value || "";
  purchaseOrderColumnFilters.totalMax = document.getElementById("filter-purchase-order-total-max")?.value || "";
  purchaseOrderColumnFilters.entries = document.getElementById("filter-purchase-order-entries")?.value || "";

  purchaseOrderCurrentPage = 1;
  debouncedRenderPurchaseOrderTable();
}

function onPurchaseReturnFilterChange() {
  purchaseReturnColumnFilters.id = document.getElementById("filter-purchase-return-id")?.value || "";
  purchaseReturnColumnFilters.date = document.getElementById("filter-purchase-return-date")?.value || "";
  purchaseReturnColumnFilters.partner = document.getElementById("filter-purchase-return-partner")?.value || "";
  purchaseReturnColumnFilters.description = document.getElementById("filter-purchase-return-desc")?.value || "";
  purchaseReturnColumnFilters.paymentMethod = document.getElementById("filter-purchase-return-payment")?.value || "";
  purchaseReturnColumnFilters.totalMin = document.getElementById("filter-purchase-return-total-min")?.value || "";
  purchaseReturnColumnFilters.totalMax = document.getElementById("filter-purchase-return-total-max")?.value || "";
  purchaseReturnColumnFilters.entries = document.getElementById("filter-purchase-return-entries")?.value || "";

  purchaseReturnCurrentPage = 1;
  debouncedRenderPurchaseReturnTable();
}

function clearPurchaseColumnFilters() {
  purchaseColumnFilters = {
    id: "", date: "", partner: "", description: "", paymentMethod: "", totalMin: "", totalMax: "", entries: ""
  };
  const ids = ["filter-purchase-id", "filter-purchase-date", "filter-purchase-partner", 
               "filter-purchase-desc", "filter-purchase-payment", "filter-purchase-total-min", 
               "filter-purchase-total-max", "filter-purchase-entries"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderPurchaseTable();
}

function clearPurchaseOrderColumnFilters() {
  purchaseOrderColumnFilters = {
    id: "", date: "", partner: "", description: "", paymentMethod: "", totalMin: "", totalMax: "", entries: ""
  };
  const ids = ["filter-purchase-order-id", "filter-purchase-order-date", "filter-purchase-order-partner", 
               "filter-purchase-order-desc", "filter-purchase-order-payment", "filter-purchase-order-total-min", 
               "filter-purchase-order-total-max", "filter-purchase-order-entries"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderPurchaseOrderTable();
}

function clearPurchaseReturnColumnFilters() {
  purchaseReturnColumnFilters = {
    id: "", date: "", partner: "", description: "", paymentMethod: "", totalMin: "", totalMax: "", entries: ""
  };
  const ids = ["filter-purchase-return-id", "filter-purchase-return-date", "filter-purchase-return-partner", 
               "filter-purchase-return-desc", "filter-purchase-return-payment", "filter-purchase-return-total-min", 
               "filter-purchase-return-total-max", "filter-purchase-return-entries"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderPurchaseReturnTable();
}

function buildPurchaseTableRowHtml(v) {
  const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
  return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="purchase-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchPurchasesUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-primary); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td style="font-weight:600; color:var(--text-primary);">${getPartnerNameForVoucher(v)}</td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '331' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '331' ? 'Công nợ (331)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric" style="font-weight:700; color:var(--color-primary);">${formatVND(v.totalAmount)}</td>
        <td>
          <div class="accounting-detail-box">
            ${v.entries.map(e => `
              <div class="accounting-entry-row">
                <span>Nợ <span class="acct-debit">${e.debit}</span> / Có <span class="acct-credit">${e.credit}</span></span>
                <span class="font-numeric">${formatVND(e.amount)}</span>
              </div>
            `).join("")}
          </div>
        </td>
        <td style="text-align: center;">
          <div class="table-actions">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="edit-btn" onclick="editPurchaseVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa hóa đơn">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
}

function renderPurchaseTable() {
  const tbody = document.getElementById("purchase-table-body");
  if (!tbody) return;

  let purchases = state.vouchers.filter(v => v.type === "purchase");

  // Advanced search filters
  const query = document.getElementById("search-purchase") ? document.getElementById("search-purchase").value : "";
  const fromDate = document.getElementById("search-purchase-from") ? document.getElementById("search-purchase-from").value : "";
  const toDate = document.getElementById("search-purchase-to") ? document.getElementById("search-purchase-to").value : "";

  // Lọc nâng cao
  const advPayment = document.getElementById("adv-filter-purchase-payment") ? document.getElementById("adv-filter-purchase-payment").value : "";

  if (query) {
    purchases = purchases.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    purchases = purchases.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    purchases = purchases.filter(v => v.date <= toDate);
  }

  if (advPayment) {
    purchases = purchases.filter(v => v.paymentMethod === advPayment);
  }

  // Lọc theo từng cột (Column Filters)
  if (purchaseColumnFilters.id) {
    const val = purchaseColumnFilters.id.toLowerCase();
    purchases = purchases.filter(v => String(v.id).toLowerCase().includes(val));
  }
  if (purchaseColumnFilters.date) {
    const val = purchaseColumnFilters.date.toLowerCase();
    purchases = purchases.filter(v => {
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      return formattedDate.includes(val) || v.date.includes(val);
    });
  }
  if (purchaseColumnFilters.partner) {
    const val = purchaseColumnFilters.partner.toLowerCase();
    purchases = purchases.filter(v => getPartnerNameForVoucher(v).toLowerCase().includes(val));
  }
  if (purchaseColumnFilters.description) {
    const val = purchaseColumnFilters.description.toLowerCase();
    purchases = purchases.filter(v => (v.description || "").toLowerCase().includes(val));
  }
  if (purchaseColumnFilters.paymentMethod) {
    purchases = purchases.filter(v => v.paymentMethod === purchaseColumnFilters.paymentMethod);
  }
  if (purchaseColumnFilters.totalMin !== "") {
    purchases = purchases.filter(v => v.totalAmount >= parseFloat(purchaseColumnFilters.totalMin));
  }
  if (purchaseColumnFilters.totalMax !== "") {
    purchases = purchases.filter(v => v.totalAmount <= parseFloat(purchaseColumnFilters.totalMax));
  }
  if (purchaseColumnFilters.entries) {
    const val = purchaseColumnFilters.entries.toLowerCase();
    purchases = purchases.filter(v => 
      v.entries && v.entries.some(e => 
        e.debit.toLowerCase().includes(val) || 
        e.credit.toLowerCase().includes(val)
      )
    );
  }

  // Sắp xếp số chứng từ giảm dần (to nhất lên trước)
  purchases.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = purchases.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (purchaseCurrentPage > totalPages) purchaseCurrentPage = totalPages;
  if (purchaseCurrentPage < 1) purchaseCurrentPage = 1;

  const startIdx = (purchaseCurrentPage - 1) * 30;
  const displayedPurchases = purchases.slice(startIdx, startIdx + 30);

  // Cập nhật thông tin phân trang trên tiêu đề bảng
  const countEl = document.getElementById("purchase-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị đơn hàng từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} đơn hàng (Trang ${purchaseCurrentPage}/${totalPages})`;
  }

  // Reset check-all-purchase checkbox
  const checkAll = document.getElementById("check-all-purchase");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchPurchasesUI === "function") updateBatchPurchasesUI();

  // Render phân trang bằng shared component
  renderPagination('purchase-pagination-controls', purchaseCurrentPage, totalPages, totalCount, 'changePurchasePage');

  if (displayedPurchases.length === 0) {
    renderEmptyState(tbody, 9, 'Không tìm thấy hóa đơn mua hàng', 'Nhấn nút tạo mới để thêm hóa đơn mua hàng');
    return;
  }


  const forceFullPurchaseRender = purchaseCurrentPage !== window._lastPurchaseRenderPage;
  window._lastPurchaseRenderPage = purchaseCurrentPage;
  renderTableIncremental(tbody, displayedPurchases, buildPurchaseTableRowHtml, (v) => v.id, {
    emptyColspan: 9,
    emptyMessage: "Không tìm thấy hóa đơn mua hàng",
    forceFullRender: forceFullPurchaseRender
  });
}

// Lọc hóa đơn mua hàng
function filterPurchaseTable() {
  purchaseCurrentPage = 1;
  renderPurchaseTable();
}

function clearPurchaseDateFilter() {
  if (window.rdpClearInput) {
    rdpClearInput('search-purchase-from');
    rdpClearInput('search-purchase-to');
  } else {
    const fromEl = document.getElementById('search-purchase-from');
    const toEl = document.getElementById('search-purchase-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  filterPurchaseTable();
}

function changePurchasePage(p) {
  purchaseCurrentPage = p;
  renderPurchaseTable();
}
let purchaseCurrentPage = 1;
let purchaseOrderCurrentPage = 1;

// 11. CÁC HÀM XỬ LÝ FORM & THÊM CHỨNG TỪ

// Bổ sung các hàng sản phẩm động vào form Mua hàng
// Bổ sung các hàng sản phẩm động vào form Mua hàng
function addPurchaseFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0, insertAfterRow = null) {
  return addDynamicFormTableRow("purchase-form-items-body", {
    productId: productIdVal,
    qty: qtyVal,
    price: priceVal,
    discount: discountVal
  }, insertAfterRow);
}

// Tự động điền đơn giá mua hàng của sản phẩm được chọn
function autoFillPurchasePrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");

  if (prod && row) {
    if (document.activeElement !== selectEl) {
      selectEl.value = `${prod.name} (${prod.id})`;
    }
    ensureProductExcelRow(prod);
    const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
      ? prod.lastPurchasePrice
      : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
        ? Number(prod.excelRow[20])
        : (prod.avgCost || prod.initialCost || 10000));

    row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
    recalculatePurchaseTotals();
  }
}

// Tính toán lại tổng tiền trong form Mua
function recalculatePurchaseTotals() {
  return recalculateDynamicFormTable("purchase-form-items-body");
}

// Reset form mua hàng
function resetPurchaseForm() {
  const modalTitle = document.querySelector("#modal-add-purchase .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Mua hàng nhập kho";
  resetDynamicVoucherForm("form-purchase", { date: getLocalDateString() });
  // Auto-focus vào ô Nhà cung cấp (trường đầu tiên hiển thị của form mua)
  setTimeout(() => {
    const el = document.getElementById("pur-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

// Xử lý nộp form Mua hàng
async function handlePurchaseSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-purchase");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const inputIdEl = document.getElementById("pur-id");
  let voucherId = inputIdEl ? inputIdEl.value.trim() : "";

  if (editingPurchaseId) {
    if (!voucherId) {
      showToast("Số chứng từ không được để trống!", "danger");
      return;
    }
  } else {
    if (!voucherId) {
      const paymentMethod = document.getElementById("pur-payment").value;
      voucherId = generateNextPurchaseVoucherId(paymentMethod);
      if (inputIdEl) inputIdEl.value = voucherId;
    }
  }

  // Kiểm tra trùng số chứng từ
  const isDuplicate = state.vouchers.some(v => {
    if (editingPurchaseId && String(v.id).toLowerCase() === editingPurchaseId.toLowerCase()) return false;
    return String(v.id).toLowerCase() === voucherId.toLowerCase();
  });

  if (isDuplicate) {
    showToast("Số chứng từ đã tồn tại, vui lòng nhập số khác!", "danger");
    return;
  }

  const rows = document.querySelectorAll("#purchase-form-items-body tr");
  if (rows.length === 0) {
    showToast("Vui lòng thêm ít nhất một sản phẩm cần mua!", "danger");
    return;
  }

  const voucherItems = [];
  let hasError = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productInputVal = row.querySelector(".item-productId").value;
    const resolvedProduct = resolveProduct(productInputVal);

    if (!resolvedProduct) {
      showToast(`Không tìm thấy sản phẩm nào khớp với từ khóa "${productInputVal}"!`, "danger");
      hasError = true;
      break;
    }

    const productId = resolvedProduct.id;
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseDynamicMoney(row.querySelector(".item-price").value);
    const discount = parseDynamicDiscount(row.querySelector(".item-discount").value);
    const lineError = validateDynamicVoucherLine(qty, price, discount);
    if (lineError) {
      showToast(`Dòng ${i + 1}: ${lineError}`, "danger");
      hasError = true;
      break;
    }
    const amount = Math.round(qty * price * (1 - discount / 100));

    voucherItems.push({
      productId,
      qty,
      price,
      discount,
      amount
    });
  }

  if (hasError) return;

  const modalId = "modal-add-purchase";
  if (!beginVoucherSubmit(modalId, "Đang kiểm tra dữ liệu...")) return;

  try {
    if (!editingPurchaseId || voucherId !== editingPurchaseId) {
      setVoucherFormStatus(modalId, "Đang kiểm tra số chứng từ trên cloud...", "cloud");
      if (typeof ensureCloudSafeVoucherIdForSave === "function") {
        voucherId = await ensureCloudSafeVoucherIdForSave({
          currentId: voucherId,
          editingId: editingPurchaseId,
          prefix: "NK",
          fallbackBase: 8459,
          padLength: 5,
          inputEl: inputIdEl
        });
      }
    }

    const partnerInputVal = document.getElementById("pur-partner").value;
    const resolvedPartner = resolvePartner(partnerInputVal, "supplier");
    const partnerId = resolvedPartner.id;
    const partnerName = resolvedPartner.name;
    const paymentMethod = document.getElementById("pur-payment").value;
    const newVoucher = {
    id: voucherId,
    type: "purchase",
    date: document.getElementById("pur-date").value,
    partnerId,
    partnerName,
    paymentMethod,
    description: document.getElementById("pur-desc").value,
    items: voucherItems,
    taxRate: 0,
    taxAmount: 0,
    isManual: true,
    _updatedAt: Date.now(),
    _sessionId: clientSessionId
  };

  const isEdit = !!editingPurchaseId;
  const oldId = editingPurchaseId;

  if (editingPurchaseId) {
    const idx = state.vouchers.findIndex(v => v.id === editingPurchaseId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      if (state.vouchers[idx].debtAdjustment !== undefined) {
        newVoucher.debtAdjustment = state.vouchers[idx].debtAdjustment;
      }
      state.vouchers[idx] = newVoucher;
    } else {
      // Chứng từ gốc biến mất trong lúc sửa — vẫn phải ghi lại bản đang sửa.
      state.vouchers.push(newVoucher);
    }
    
    // Nếu đổi mã chứng từ: lưu lại vết xóa mã cũ và cập nhật liên kết ký quỹ
    if (voucherId !== editingPurchaseId) {
      if (typeof trackDeletedIds === "function") {
        trackDeletedIds([editingPurchaseId]);
      }
      state.vouchers.forEach(v => {
        if (v.escrowRefId === editingPurchaseId) {
          v.escrowRefId = voucherId;
        }
      });
    }

    editingPurchaseId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  recalculateAccounting(false);
  setVoucherFormStatus(modalId, "Đang lưu và đồng bộ máy khác...", "sync");
  const cloudCommitted = await saveStateAndSyncVoucher();

  closeModal(modalId);
  showToast(
    cloudCommitted
      ? (isEdit ? "Cập nhật chứng từ mua hàng thành công!" : "Lập chứng từ mua hàng thành công!")
      : "Chứng từ đã lưu trên máy này và đang chờ đồng bộ sang máy khác.",
    cloudCommitted ? "success" : "warning"
  );
  } catch (err) {
    console.error("[Purchase] Lưu chứng từ mua hàng thất bại:", err);
    if (typeof addErrorLog === "function") addErrorLog("handlePurchaseSubmit.save", err.message, err);
    setVoucherFormStatus(modalId, "Không thể lưu chứng từ. Vui lòng thử lại.", "error");
    showToast("Không thể lưu chứng từ. Vui lòng thử lại.", "danger");
  } finally {
    endVoucherSubmit(modalId);
  }
}
let editingPurchaseId = null;
let editingPurchaseOrderId = null;
let purchaseSubmitInProgress = false;
let purchaseOrderSubmitInProgress = false;

function generateNextPurchaseVoucherId(paymentMethod) {
  const prefix = "NK";
  let maxNum = typeof getMaxLocalVoucherSequence === "function"
    ? getMaxLocalVoucherSequence(prefix)
    : 0;
  if (!maxNum) {
    const regex = /^NK(\d+)$/;
    (state.vouchers || []).forEach(v => {
      if (!v || v.type !== "purchase") return;
      const match = String(v.id).match(regex);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    });
  }
  if (maxNum === 0) maxNum = 8459;
  return `${prefix}${(maxNum + 1).toString().padStart(5, "0")}`;
}

function editPurchaseVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseId = id;
  if (typeof updateVoucherModeBadge === "function") updateVoucherModeBadge("modal-add-purchase", true);

  const modalTitle = document.querySelector("#modal-add-purchase .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa chứng từ mua hàng: ${id}`;

  const idEl = document.getElementById("pur-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("pur-date").value = v.date;
  const pObj1 = getPartnerForVoucher(v);
  document.getElementById("pur-partner").value = pObj1 ? `${pObj1.name} (${pObj1.id})` : (v.partnerName || "");
  document.getElementById("pur-desc").value = v.description;
  document.getElementById("pur-payment").value = v.paymentMethod;
  if (document.getElementById("pur-tax-rate")) {
    document.getElementById("pur-tax-rate").value = v.taxRate || 0;
  }

  const formItems = v.items.map(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    return {
      productId: prodVal,
      qty: item.qty,
      price: item.price,
      discount: normalizeDynamicDiscountValue(item.discount, item.qty, item.price)
    };
  });
  replaceDynamicFormTableRows("purchase-form-items-body", formItems);

  openModal("modal-add-purchase");
}

// Đăng ký toàn cục các hàm cho thiết bị Electron


// ==========================================================
// CÁC HÀM XỬ LÝ BATCH SELECTION & BATCH DELETE (VOUCHERS & PRODUCTS)
// ==========================================================

function toggleSelectAllPurchases(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".purchase-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchPurchasesUI();
}

function updateBatchPurchasesUI() {
  const checkboxes = document.querySelectorAll(".purchase-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-purchase");
  const count = document.getElementById("selected-purchases-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-purchase");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

async function batchDeletePurchases() {
  const checked = Array.from(document.querySelectorAll(".purchase-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  const ok = await showConfirmModal({
    title: "Xác nhận xóa mua hàng",
    message: `Bạn có chắc chắn muốn xóa ${checked.length} chứng từ mua hàng đã chọn?`,
    confirmText: "Xóa chứng từ",
    cancelText: "Hủy bỏ",
    type: "danger"
  });
  if (!ok) return;

  const idsToDelete = checked.map(cb => String(cb.value));
  const deleteSet = new Set(idsToDelete);
  trackDeletedIds(idsToDelete);
  state.vouchers = state.vouchers.filter(v => !deleteSet.has(String(v.id)));

  if (typeof resetBatchSelectionUI === "function") {
    resetBatchSelectionUI({
      checkboxSelector: ".purchase-checkbox",
      masterId: "check-all-purchase",
      buttonId: "btn-batch-delete-purchase",
      countId: "selected-purchases-count"
    });
  } else {
    const master = document.getElementById("check-all-purchase");
    if (master) master.checked = false;
    updateBatchPurchasesUI();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  const cloudCommitted = typeof saveStateAndSyncVoucher === "function"
    ? await saveStateAndSyncVoucher()
    : (saveState(), true);
  recalculateAccounting();
  showToast(
    cloudCommitted ? `Đã xóa thành công ${checked.length} chứng từ mua hàng!` : "Đã xóa trên máy này và đang chờ đồng bộ.",
    cloudCommitted ? "success" : "warning"
  );
    if (typeof resetBatchSelectionUI === "function") {
      resetBatchSelectionUI({
        checkboxSelector: ".purchase-checkbox",
        masterId: "check-all-purchase",
        buttonId: "btn-batch-delete-purchase",
        countId: "selected-purchases-count"
      });
    }
}

function exportPurchasesToExcel(detailed = true) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredPurchases = state.vouchers.filter(v => v.type === "purchase");
  const query = document.getElementById("search-purchase") ? document.getElementById("search-purchase").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-purchase-from") ? document.getElementById("search-purchase-from").value : "";
  const toDate = document.getElementById("search-purchase-to") ? document.getElementById("search-purchase-to").value : "";

  if (query) filteredPurchases = filteredPurchases.filter(v =>
    matchStr(v.id, query) ||
    matchStr(v.partnerName, query) ||
    matchStr(v.description, query)
  );
  if (fromDate) filteredPurchases = filteredPurchases.filter(v => v.date >= fromDate);
  if (toDate) filteredPurchases = filteredPurchases.filter(v => v.date <= toDate);
  filteredPurchases.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const fromStr = fromDate ? formatDateDisplay(fromDate) : '01/01/' + new Date().getFullYear();
    const toStr = toDate ? formatDateDisplay(toDate) : formatDateDisplay(new Date());

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
      // ── Format chính xác MISA SO_CHI_TIET_MUA_HANG ──
      // Col: 0=Ngày HT | 1=Ngày CT | 2=Số CT | 3=Ngày HĐ | 4=Số HĐ
      //      5=Mã hàng | 6=Tên hàng | 7=ĐVT
      //      8=SL mua | 9=Đơn giá | 10=Giá trị mua | 11=Chiết khấu
      //      12=SL trả lại | 13=Giá trị trả lại | 14=Giá trị giảm giá | 15=Mã thống kê
      const NCOLS = 16;

      // ROW 0: Tiêu đề (MISA: "SỔ CHI TIẾT MUA HÀNG")
      sc(0, 0, "SỔ CHI TIẾT MUA HÀNG", 's', { font: fntT, alignment: cC });
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });

      // ROW 1: Phạm vi ngày (MISA: "Từ ngày ... đến ngày ...")
      sc(1, 0, `Từ ngày ${fromStr} đến ngày ${toStr}`, 's', { font: fntSub, alignment: cC });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });

      // ROW 2: Headers — tên cột CHÍNH XÁC theo MISA để import ngược được
      const headers = [
        "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn",
        "Mã hàng", "Tên hàng", "ĐVT",
        "Số lượng mua", "Đơn giá", "Giá trị mua", "Chiết khấu",
        "Số lượng trả lại", "Giá trị trả lại", "Giá trị giảm giá", "Mã thống kê"
      ];
      headers.forEach((h, c) => sc(2, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: b4 }));

      // DATA ROWS — từ row 3, 1 dòng mỗi sản phẩm
      let rowIdx = 3;
      let totalQty = 0, totalGross = 0, totalCK = 0;

      filteredPurchases.forEach((v, vi) => {
        const bg = vi % 2 === 0 ? null : altBg;
        const bs = al => ({ font: fntN, fill: bg, alignment: al, border: b4 });
        const ns = al => ({ font: fntN, fill: bg, alignment: al || cR, border: b4 });

        const writeRow = (productId, productName, unit, qty, price, grossAmt, ckAmt) => {
          sc(rowIdx, 0,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày HT
          sc(rowIdx, 1,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày CT
          sc(rowIdx, 2,  v.id,              's',  bs(cC));                 // Số CT
          sc(rowIdx, 3,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày HĐ
          sc(rowIdx, 4,  v.invoiceNo || "", 's',  bs(cC));                 // Số HĐ
          sc(rowIdx, 5,  productId,         's',  bs(cC));                 // Mã hàng
          sc(rowIdx, 6,  productName,       's',  bs(cL));                 // Tên hàng
          sc(rowIdx, 7,  unit,              's',  bs(cC));                 // ĐVT
          sc(rowIdx, 8,  qty,               'n',  ns(cR), "#,##0.##");     // SL mua
          sc(rowIdx, 9,  price,             'n',  ns(cR), numFmt);         // Đơn giá
          sc(rowIdx, 10, grossAmt,          'n',  ns(cR), numFmt);         // Giá trị mua
          sc(rowIdx, 11, ckAmt,             'n',  ns(cR), numFmt);         // Chiết khấu
          sc(rowIdx, 12, 0,                 'n',  ns(cR), "#,##0.##");     // SL trả lại
          sc(rowIdx, 13, 0,                 'n',  ns(cR), numFmt);         // GT trả lại
          sc(rowIdx, 14, 0,                 'n',  ns(cR), numFmt);         // GT giảm giá
          sc(rowIdx, 15, "",                's',  bs(cC));                 // Mã thống kê
          totalQty += qty; totalGross += grossAmt; totalCK += ckAmt;
          rowIdx++;
        };

        if (v.items && v.items.length > 0) {
          v.items.forEach(item => {
            const prod = (state.products || []).find(p => String(p.id) === String(item.productId));
            const qty = item.qty || 0;
            const price = item.price || 0;
            const grossAmt = getVoucherLineGrossAmount(item);
            const ckAmt = getVoucherLineDiscountAmount(item);
            writeRow(
              item.productId || "",
              prod ? prod.name : (item.productName || item.productId || ""),
              prod ? (prod.unit || "Cái") : (item.unit || "Cái"),
              qty, price, grossAmt, ckAmt
            );
          });
        } else {
          const gross = (v.totalAmount || 0) - (v.taxAmount || 0);
          writeRow("", v.description || v.id, "", 0, 0, gross, 0);
        }
      });

      // DÒNG TỔNG
      const ts = al => ({ font: fntB, fill: totBg, alignment: al, border: b4 });
      sc(rowIdx, 0, "TỔNG CỘNG", 's', ts(cL));
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 7 } });
      for (let c = 1; c <= 7; c++) sc(rowIdx, c, "", 's', ts(cL));
      sc(rowIdx, 8,  totalQty,  'n', ts(cR), "#,##0.##");
      sc(rowIdx, 9,  0,         'n', ts(cR), numFmt);
      sc(rowIdx, 10, totalGross,'n', ts(cR), numFmt);
      sc(rowIdx, 11, totalCK,   'n', ts(cR), numFmt);
      sc(rowIdx, 12, 0,         'n', ts(cR), "#,##0.##");
      sc(rowIdx, 13, 0,         'n', ts(cR), numFmt);
      sc(rowIdx, 14, 0,         'n', ts(cR), numFmt);
      sc(rowIdx, 15, "",        's', ts(cC));

      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: NCOLS - 1 } });
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
        { wch: 14 }, { wch: 30 }, { wch: 7 },
        { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 12 }
      ];
      ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 22 }];

      XLSX.utils.book_append_sheet(wb, ws, "Báo cáo");
      const suffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
      const outName = `SO_CHI_TIET_MUA_HANG_${getLocalDateString()}${suffix}.xlsx`;
      XLSX.writeFile(wb, outName);
      showToast(`Đã xuất Excel: ${outName}`, "success");
    } else {
      // ── Xuất danh sách hóa đơn mua hàng (chi tiet = false -> chi xuat ten/thong tin phieu) ──
      const NCOLS = 11;

      // ROW 0: Tiêu đề
      sc(0, 0, "DANH SÁCH HÓA ĐƠN MUA HÀNG", 's', { font: fntT, alignment: cC });
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });

      // ROW 1: Phạm vi ngày
      sc(1, 0, `Từ ngày ${fromStr} đến ngày ${toStr}`, 's', { font: fntSub, alignment: cC });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });

      // ROW 2: Headers
      const headers = [
        "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn",
        "Nhà cung cấp", "Diễn giải", "Tiền hàng", "Tiền thuế GTGT", "Tổng cộng thanh toán", "Phương thức thanh toán"
      ];
      headers.forEach((h, c) => sc(2, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: b4 }));

      let rowIdx = 3;
      let totalAmountGross = 0;
      let totalAmountTax = 0;
      let totalAmountTotal = 0;

      filteredPurchases.forEach((v, vi) => {
        const bg = vi % 2 === 0 ? null : altBg;
        const bs = al => ({ font: fntN, fill: bg, alignment: al, border: b4 });
        const ns = al => ({ font: fntN, fill: bg, alignment: al || cR, border: b4 });

        const taxAmt = v.taxAmount || 0;
        const totalAmt = v.totalAmount || 0;
        const grossAmt = totalAmt - taxAmt;
        const partnerName = v.partnerName || getPartnerNameForVoucher(v);

        sc(rowIdx, 0,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày HT
        sc(rowIdx, 1,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày CT
        sc(rowIdx, 2,  v.id,              's',  bs(cC));                 // Số CT
        sc(rowIdx, 3,  dateStrToSerial(v.date), 'n', bs(cC), dateFmt);  // Ngày HĐ
        sc(rowIdx, 4,  v.invoiceNo || "", 's',  bs(cC));                 // Số HĐ
        sc(rowIdx, 5,  partnerName,       's',  bs(cL));                 // Nhà cung cấp
        sc(rowIdx, 6,  v.description || "", 's', bs(cL));                 // Diễn giải
        sc(rowIdx, 7,  grossAmt,          'n',  ns(cR), numFmt);         // Tiền hàng
        sc(rowIdx, 8,  taxAmt,            'n',  ns(cR), numFmt);         // Tiền thuế
        sc(rowIdx, 9,  totalAmt,          'n',  ns(cR), numFmt);         // Tổng cộng
        sc(rowIdx, 10, v.paymentMethod === '331' ? 'Công nợ (331)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)', 's', bs(cC));

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
        { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
        { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }
      ];
      ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 22 }];

      XLSX.utils.book_append_sheet(wb, ws, "Danh sach");
      const suffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
      const outName = `DANH_SACH_MUA_HANG_${getLocalDateString()}${suffix}.xlsx`;
      XLSX.writeFile(wb, outName);
      showToast(`Đã xuất Excel: ${outName}`, "success");
    }
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel mua hàng: ${err.message}`, "danger");
  }
}


window.editPurchaseVoucher = editPurchaseVoucher;
window.resetPurchaseForm = resetPurchaseForm;
window.autoFillPurchasePrice = autoFillPurchasePrice;
// Purchases
window.changePurchasePage = changePurchasePage;
window.clearPurchaseDateFilter = clearPurchaseDateFilter;
window.toggleSelectAllPurchases = toggleSelectAllPurchases;
window.updateBatchPurchasesUI = updateBatchPurchasesUI;
window.batchDeletePurchases = batchDeletePurchases;
window.exportPurchasesToExcel = exportPurchasesToExcel;
window.renderPurchaseTable = renderPurchaseTable;
window.filterPurchaseTable = filterPurchaseTable;



// ==========================================================================
// PHÂN HỆ ĐƠN ĐẶT HÀNG (PURCHASE ORDERS)
// ==========================================================================

function switchPurchaseSubTab(subTabId) {
  const btnInvoice = document.getElementById("tab-btn-purchase-invoice");
  const btnOrder = document.getElementById("tab-btn-purchase-order");
  const btnReturn = document.getElementById("tab-btn-purchase-return");

  if (btnInvoice) btnInvoice.classList.remove("active");
  if (btnOrder) btnOrder.classList.remove("active");
  if (btnReturn) btnReturn.classList.remove("active");

  if (subTabId === "invoice" && btnInvoice) btnInvoice.classList.add("active");
  if (subTabId === "order" && btnOrder) btnOrder.classList.add("active");
  if (subTabId === "return" && btnReturn) btnReturn.classList.add("active");

  const panelInvoice = document.getElementById("purchase-subtab-invoice");
  const panelOrder = document.getElementById("purchase-subtab-order");
  const panelReturn = document.getElementById("purchase-subtab-return");

  if (panelInvoice) panelInvoice.style.display = "none";
  if (panelOrder) panelOrder.style.display = "none";
  if (panelReturn) panelReturn.style.display = "none";

  if (subTabId === "invoice" && panelInvoice) {
    panelInvoice.style.display = "flex";
    renderPurchaseTable();
  } else if (subTabId === "order" && panelOrder) {
    panelOrder.style.display = "flex";
    renderPurchaseOrderTable();
  } else if (subTabId === "return" && panelReturn) {
    panelReturn.style.display = "flex";
    renderPurchaseReturnTable();
  }
}

function generateNextPurchaseOrderVoucherId() {
  const prefix = "ĐMH";
  let maxNum = 0;
  if (typeof getMaxLocalVoucherSequence === "function") {
    maxNum = Math.max(
      getMaxLocalVoucherSequence("ĐMH"),
      getMaxLocalVoucherSequence("DMH")
    );
  }
  if (!maxNum) {
    const regex = /^(ĐMH|DMH)(\d{5})$/i;
    (state.vouchers || []).forEach(v => {
      if (!v || v.type !== "purchase_order" || !v.id) return;
      const match = String(v.id).match(regex);
      if (match) maxNum = Math.max(maxNum, parseInt(match[2], 10) || 0);
    });
  }
  return `${prefix}${(maxNum + 1).toString().padStart(5, "0")}`;
}

function addPurchaseOrderFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0, insertAfterRow = null) {
  return addDynamicFormTableRow("purchase-order-form-items-body", {
    productId: productIdVal,
    qty: qtyVal,
    price: priceVal,
    discount: discountVal
  }, insertAfterRow);
}

function autoFillPurchaseOrderPrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");

  if (prod && row) {
    if (document.activeElement !== selectEl) {
      selectEl.value = `${prod.name} (${prod.id})`;
    }
    ensureProductExcelRow(prod);
    const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
      ? prod.lastPurchasePrice
      : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
        ? Number(prod.excelRow[20])
        : (prod.avgCost || prod.initialCost || 10000));

    row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
    recalculatePurchaseOrderTotals();
  }
}

function recalculatePurchaseOrderTotals() {
  return recalculateDynamicFormTable("purchase-order-form-items-body");
}

function resetPurchaseOrderForm() {
  const modalTitle = document.querySelector("#modal-add-purchase-order .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Đơn đặt hàng";
  resetDynamicVoucherForm("form-purchase-order", { date: getLocalDateString() });
  // Auto-focus vào ô Nhà cung cấp
  setTimeout(() => {
    const el = document.getElementById("pur-order-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

async function handlePurchaseOrderSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-purchase-order");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const inputIdEl = document.getElementById("pur-order-id");
  let voucherId = inputIdEl ? inputIdEl.value.trim() : "";

  if (editingPurchaseOrderId) {
    if (!voucherId) {
      showToast("Số chứng từ không được để trống!", "danger");
      return;
    }
  } else {
    if (!voucherId) {
      voucherId = generateNextPurchaseOrderVoucherId();
      if (inputIdEl) inputIdEl.value = voucherId;
    }
  }

  // Kiểm tra trùng số chứng từ (không phân biệt ĐMH và DMH)
  const isDuplicate = state.vouchers.some(v => {
    if (editingPurchaseOrderId && removeAccents(v.id).toLowerCase() === removeAccents(editingPurchaseOrderId).toLowerCase()) return false;
    return removeAccents(v.id).toLowerCase() === removeAccents(voucherId).toLowerCase();
  });

  if (isDuplicate) {
    showToast("Số chứng từ đã tồn tại, vui lòng nhập số khác!", "danger");
    return;
  }

  const rows = document.querySelectorAll("#purchase-order-form-items-body tr");
  if (rows.length === 0) {
    showToast("Vui lòng thêm ít nhất một sản phẩm cần đặt!", "danger");
    return;
  }

  const voucherItems = [];
  let hasError = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productInputVal = row.querySelector(".item-productId").value;
    const resolvedProduct = resolveProduct(productInputVal);

    if (!resolvedProduct) {
      showToast(`Không tìm thấy sản phẩm nào khớp với từ khóa "${productInputVal}"!`, "danger");
      hasError = true;
      break;
    }

    const productId = resolvedProduct.id;
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseDynamicMoney(row.querySelector(".item-price").value);
    const discount = parseDynamicDiscount(row.querySelector(".item-discount").value);
    const lineError = validateDynamicVoucherLine(qty, price, discount);
    if (lineError) {
      showToast(`Dòng ${i + 1}: ${lineError}`, "danger");
      hasError = true;
      break;
    }
    const amount = Math.round(qty * price * (1 - discount / 100));

    voucherItems.push({
      productId,
      qty,
      price,
      discount,
      amount
    });
  }

  if (hasError) return;

  const modalId = "modal-add-purchase-order";
  if (!beginVoucherSubmit(modalId, "Đang kiểm tra dữ liệu...")) return;

  try {
    if (!editingPurchaseOrderId || voucherId !== editingPurchaseOrderId) {
      setVoucherFormStatus(modalId, "Đang kiểm tra số chứng từ trên cloud...", "cloud");
      if (typeof ensureCloudSafeVoucherIdForSave === "function") {
        voucherId = await ensureCloudSafeVoucherIdForSave({
          currentId: voucherId,
          editingId: editingPurchaseOrderId,
          prefix: "ĐMH",
          prefixes: ["ĐMH", "DMH"],
          fallbackBase: 0,
          padLength: 5,
          inputEl: inputIdEl
        });
      }
    }

    const paymentMethod = document.getElementById("pur-order-payment").value;
    const partnerInputVal = document.getElementById("pur-order-partner").value;
    const resolvedPartner = resolvePartner(partnerInputVal, "supplier");
    const partnerId = resolvedPartner.id;
    const partnerName = resolvedPartner.name;

    const newVoucher = {
    id: voucherId,
    type: "purchase_order",
    date: document.getElementById("pur-order-date").value,
    partnerId,
    partnerName,
    paymentMethod,
    description: document.getElementById("pur-order-desc").value,
    items: voucherItems,
    taxRate: 0,
    taxAmount: 0,
    isManual: true,
    _updatedAt: Date.now(),
    _sessionId: clientSessionId
  };

  const isEdit = !!editingPurchaseOrderId;
  if (editingPurchaseOrderId) {
    const idx = state.vouchers.findIndex(v => v.id === editingPurchaseOrderId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    } else {
      // Chứng từ gốc biến mất trong lúc sửa — vẫn phải ghi lại bản đang sửa.
      state.vouchers.push(newVoucher);
    }
    
    // Nếu đổi mã chứng từ: lưu lại vết xóa mã cũ và cập nhật liên kết ký quỹ
    if (voucherId !== editingPurchaseOrderId) {
      if (typeof trackDeletedIds === "function") {
        trackDeletedIds([editingPurchaseOrderId]);
      }
      state.vouchers.forEach(v => {
        if (v.escrowRefId === editingPurchaseOrderId) {
          v.escrowRefId = voucherId;
        }
      });
    }

    editingPurchaseOrderId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  recalculateAccounting(false);
  setVoucherFormStatus(modalId, "Đang lưu và đồng bộ máy khác...", "sync");
  const cloudCommitted = await saveStateAndSyncVoucher();

  closeModal(modalId);
  showToast(
    cloudCommitted
      ? (isEdit ? "Cập nhật đơn đặt hàng thành công!" : "Lập đơn đặt hàng thành công!")
      : "Đơn đặt hàng đã lưu trên máy này và đang chờ đồng bộ sang máy khác.",
    cloudCommitted ? "success" : "warning"
  );
  } catch (err) {
    console.error("[PurchaseOrder] Lưu đơn đặt hàng thất bại:", err);
    if (typeof addErrorLog === "function") addErrorLog("handlePurchaseOrderSubmit.save", err.message, err);
    setVoucherFormStatus(modalId, "Không thể lưu đơn đặt hàng. Vui lòng thử lại.", "error");
    showToast("Không thể lưu đơn đặt hàng. Vui lòng thử lại.", "danger");
  } finally {
    endVoucherSubmit(modalId);
  }
}

function editPurchaseOrderVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseOrderId = id;
  if (typeof updateVoucherModeBadge === "function") updateVoucherModeBadge("modal-add-purchase-order", true);

  const modalTitle = document.querySelector("#modal-add-purchase-order .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa đơn đặt hàng: ${id}`;

  const idEl = document.getElementById("pur-order-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("pur-order-date").value = v.date;
  const pObj2 = getPartnerForVoucher(v);
  document.getElementById("pur-order-partner").value = pObj2 ? `${pObj2.name} (${pObj2.id})` : (v.partnerName || "");
  document.getElementById("pur-order-desc").value = v.description;
  document.getElementById("pur-order-payment").value = v.paymentMethod;
  if (document.getElementById("pur-order-tax-rate")) {
    document.getElementById("pur-order-tax-rate").value = v.taxRate || 0;
  }

  const formItems = v.items.map(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    return {
      productId: prodVal,
      qty: item.qty,
      price: item.price,
      discount: normalizeDynamicDiscountValue(item.discount, item.qty, item.price)
    };
  });
  replaceDynamicFormTableRows("purchase-order-form-items-body", formItems);

  openModal("modal-add-purchase-order");
}

function renderPurchaseOrderTable() {
  const tbody = document.getElementById("purchase-order-table-body");
  if (!tbody) return;

  let orders = state.vouchers.filter(v => v.type === "purchase_order");

  // Advanced search filters
  const query = document.getElementById("search-purchase-order") ? document.getElementById("search-purchase-order").value : "";
  const fromDate = document.getElementById("search-purchase-order-from") ? document.getElementById("search-purchase-order-from").value : "";
  const toDate = document.getElementById("search-purchase-order-to") ? document.getElementById("search-purchase-order-to").value : "";

  // Lọc nâng cao
  const advPayment = document.getElementById("adv-filter-purchase-order-payment") ? document.getElementById("adv-filter-purchase-order-payment").value : "";

  if (query) {
    orders = orders.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    orders = orders.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    orders = orders.filter(v => v.date <= toDate);
  }

  if (advPayment) {
    orders = orders.filter(v => v.paymentMethod === advPayment);
  }

  // Lọc theo từng cột (Column Filters)
  if (purchaseOrderColumnFilters.id) {
    const val = purchaseOrderColumnFilters.id.toLowerCase();
    orders = orders.filter(v => String(v.id).toLowerCase().includes(val));
  }
  if (purchaseOrderColumnFilters.date) {
    const val = purchaseOrderColumnFilters.date.toLowerCase();
    orders = orders.filter(v => {
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      return formattedDate.includes(val) || v.date.includes(val);
    });
  }
  if (purchaseOrderColumnFilters.partner) {
    const val = purchaseOrderColumnFilters.partner.toLowerCase();
    orders = orders.filter(v => getPartnerNameForVoucher(v).toLowerCase().includes(val));
  }
  if (purchaseOrderColumnFilters.description) {
    const val = purchaseOrderColumnFilters.description.toLowerCase();
    orders = orders.filter(v => (v.description || "").toLowerCase().includes(val));
  }
  if (purchaseOrderColumnFilters.paymentMethod) {
    orders = orders.filter(v => v.paymentMethod === purchaseOrderColumnFilters.paymentMethod);
  }
  if (purchaseOrderColumnFilters.totalMin !== "") {
    orders = orders.filter(v => v.totalAmount >= parseFloat(purchaseOrderColumnFilters.totalMin));
  }
  if (purchaseOrderColumnFilters.totalMax !== "") {
    orders = orders.filter(v => v.totalAmount <= parseFloat(purchaseOrderColumnFilters.totalMax));
  }
  if (purchaseOrderColumnFilters.entries) {
    const val = purchaseOrderColumnFilters.entries.toLowerCase();
    orders = orders.filter(v => 
      v.entries && v.entries.some(e => 
        e.debit.toLowerCase().includes(val) || 
        e.credit.toLowerCase().includes(val)
      )
    );
  }

  // Sắp xếp số đơn hàng giảm dần
  orders.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = orders.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (purchaseOrderCurrentPage > totalPages) purchaseOrderCurrentPage = totalPages;
  if (purchaseOrderCurrentPage < 1) purchaseOrderCurrentPage = 1;

  const startIdx = (purchaseOrderCurrentPage - 1) * 30;
  const displayedOrders = orders.slice(startIdx, startIdx + 30);

  // Cập nhật thông tin phân trang trên tiêu đề bảng
  const countEl = document.getElementById("purchase-order-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị đơn hàng từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} đơn hàng (Trang ${purchaseOrderCurrentPage}/${totalPages})`;
  }

  // Reset check-all-purchase-order checkbox
  const checkAll = document.getElementById("check-all-purchase-order");
  if (checkAll) checkAll.checked = false;
  updateBatchPurchaseOrdersUI();

  // Render các nút chuyển trang động
  const paginationControls = document.getElementById("purchase-order-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseOrderPage(1)" ${purchaseOrderCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseOrderPage(${purchaseOrderCurrentPage - 1})" ${purchaseOrderCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, purchaseOrderCurrentPage - 2);
      let endPage = Math.min(totalPages, purchaseOrderCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === purchaseOrderCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changePurchaseOrderPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === purchaseOrderCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseOrderPage(${purchaseOrderCurrentPage + 1})" ${purchaseOrderCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseOrderPage(${totalPages})" ${purchaseOrderCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} đơn hàng
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy đơn đặt hàng nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayedOrders.map(v => {
    const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="purchase-order-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchPurchaseOrdersUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-primary); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td style="font-weight:600; color:var(--text-primary);">${getPartnerNameForVoucher(v)}</td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '331' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '331' ? 'Công nợ (331)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric" style="font-weight:700; color:var(--color-primary);">${formatVND(v.totalAmount)}</td>
        <td>
          <div class="accounting-detail-box" style="color: var(--text-muted); text-align: center; font-style: italic;">
            (Không hạch toán kho/sổ cái)
          </div>
        </td>
        <td style="text-align: center;">
          <div class="table-actions">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu đơn hàng">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="edit-btn" onclick="editPurchaseOrderVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa đơn hàng">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa đơn hàng">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterPurchaseOrderTable() {
  purchaseOrderCurrentPage = 1;
  renderPurchaseOrderTable();
}

function clearPurchaseOrderDateFilter() {
  if (window.rdpClearInput) {
    rdpClearInput('search-purchase-order-from');
    rdpClearInput('search-purchase-order-to');
  } else {
    const fromEl = document.getElementById('search-purchase-order-from');
    const toEl = document.getElementById('search-purchase-order-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  filterPurchaseOrderTable();
}

function changePurchaseOrderPage(p) {
  purchaseOrderCurrentPage = p;
  renderPurchaseOrderTable();
}

function toggleSelectAllPurchaseOrders(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".purchase-order-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchPurchaseOrdersUI();
}

function updateBatchPurchaseOrdersUI() {
  const checkboxes = document.querySelectorAll(".purchase-order-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-purchase-order");
  const count = document.getElementById("selected-purchase-orders-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-purchase-order");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

async function batchDeletePurchaseOrders() {
  const checked = Array.from(document.querySelectorAll(".purchase-order-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  const ok = await showConfirmModal({
    title: "Xác nhận xóa đơn đặt hàng",
    message: `Bạn có chắc chắn muốn xóa ${checked.length} đơn đặt hàng đã chọn?`,
    confirmText: "Xóa đơn hàng",
    cancelText: "Hủy bỏ",
    type: "danger"
  });
  if (!ok) return;

  const idsToDelete = checked.map(cb => String(cb.value));
  const deleteSet = new Set(idsToDelete);
  trackDeletedIds(idsToDelete);
  state.vouchers = state.vouchers.filter(v => !deleteSet.has(String(v.id)));

  if (typeof resetBatchSelectionUI === "function") {
    resetBatchSelectionUI({
      checkboxSelector: ".purchase-order-checkbox",
      masterId: "check-all-purchase-order",
      buttonId: "btn-batch-delete-purchase-order",
      countId: "selected-purchase-orders-count"
    });
  } else {
    const master = document.getElementById("check-all-purchase-order");
    if (master) master.checked = false;
    updateBatchPurchaseOrdersUI();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  const cloudCommitted = typeof saveStateAndSyncVoucher === "function"
    ? await saveStateAndSyncVoucher()
    : (saveState(), true);
  recalculateAccounting();
  showToast(
    cloudCommitted ? `Đã xóa thành công ${checked.length} đơn đặt hàng!` : "Đã xóa trên máy này và đang chờ đồng bộ.",
    cloudCommitted ? "success" : "warning"
  );
    if (typeof resetBatchSelectionUI === "function") {
      resetBatchSelectionUI({
        checkboxSelector: ".purchase-order-checkbox",
        masterId: "check-all-purchase-order",
        buttonId: "btn-batch-delete-purchase-order",
        countId: "selected-purchase-orders-count"
      });
    }
}

function exportPurchaseOrdersToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredOrders = state.vouchers.filter(v => v.type === "purchase_order");

  const query = document.getElementById("search-purchase-order") ? document.getElementById("search-purchase-order").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-purchase-order-from") ? document.getElementById("search-purchase-order-from").value : "";
  const toDate = document.getElementById("search-purchase-order-to") ? document.getElementById("search-purchase-order-to").value : "";

  if (query) {
    filteredOrders = filteredOrders.filter(v =>
      matchStr(v.id, query) ||
      matchStr(v.partnerName, query) ||
      matchStr(v.description, query)
    );
  }
  if (fromDate) filteredOrders = filteredOrders.filter(v => v.date >= fromDate);
  if (toDate) filteredOrders = filteredOrders.filter(v => v.date <= toDate);
  filteredOrders.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    // --- Style presets ---
    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const headerBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const fntTitle = { name: "Times New Roman", sz: 13, bold: true };
    const fntSub = { name: "Times New Roman", sz: 11, italic: true };
    const fntHdr = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const fntBold = { name: "Times New Roman", sz: 11, bold: true };
    const fntNorm = { name: "Times New Roman", sz: 11 };
    const cCenter = { horizontal: "center", vertical: "center" };
    const cLeft = { horizontal: "left", vertical: "center" };
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

    const today = formatDateDisplay(new Date());
    let dateRangeText = `Từ ngày: ${fromDate ? formatDateDisplay(fromDate) : 'đầu kỳ'}   Đến ngày: ${toDate ? formatDateDisplay(toDate) : today}`;

    // --- ROW 0: Tiêu đề chính ---
    const compName = state.companyName || "Công Ty Cổ Phần SX Và ĐT Phát Triển Rạng Đông";
    setCell(ws, 0, 0, compName, 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 21 } });

    // --- ROW 1: Tên báo cáo ---
    setCell(ws, 1, 0, "SỔ CHI TIẾT ĐƠN ĐẶT HÀNG THEO MÃ QUY CÁCH", 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 21 } });

    // --- ROW 2: Phạm vi ngày ---
    setCell(ws, 2, 0, dateRangeText, 's', { font: fntSub, alignment: cCenter }, null);
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 21 } });

    // --- ROW 3: Header cột ---
    const headers = ["Ngày hạch toán", "Ngày chứng từ", "Số đơn hàng", "Ngày hóa đơn", "Số hóa đơn", "Mã hàng", "Tên hàng", "ĐVT", "Mã quy cách 1", "Mã quy cách 2", "Mã quy cách 3", "Mã quy cách 4", "Mã quy cách 5", "Số lượng", "Đơn giá", "Phí trước hải quan", "Phí hàng về kho", "Thành tiền", "Chiết khấu", "Số lượng trả lại", "Giá trị trả lại", "Giá trị giảm giá"];
    headers.forEach((h, c) => {
      setCell(ws, 3, c, h, 's', { font: fntHdr, fill: headerBg, alignment: cCenter, border: border4 }, null);
    });

    let rowIdx = 4;
    let totalGross = 0;

    filteredOrders.forEach((v, vIdx) => {
      const rowBg = vIdx % 2 === 0 ? null : altBg;
      const baseStyle = (align) => ({ font: fntNorm, fill: rowBg, alignment: align, border: border4 });
      const numStyle = (align) => ({ font: fntNorm, fill: rowBg, alignment: align || cRight, border: border4 });

      if (v.items && v.items.length > 0) {
        v.items.forEach(item => {
          const prod = state.products ? state.products.find(p => String(p.id) === String(item.productId)) : null;
          const itemGross = (item.qty || 0) * (item.price || 0);
          const discVal = itemGross * ((item.discount || 0) / 100);

          setCell(ws, rowIdx, 0, dateStrToSerial(v.date), 'n', baseStyle(cCenter), dateFmt);
          setCell(ws, rowIdx, 1, dateStrToSerial(v.date), 'n', baseStyle(cCenter), dateFmt);
          setCell(ws, rowIdx, 2, v.id, 's', baseStyle(cCenter), null);
          setCell(ws, rowIdx, 3, dateStrToSerial(v.date), 'n', baseStyle(cCenter), dateFmt);
          setCell(ws, rowIdx, 4, v.invoiceNo || "", 's', baseStyle(cCenter), null);
          setCell(ws, rowIdx, 5, item.productId || "", 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 6, prod ? prod.name : (item.productName || item.productId || ""), 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 7, prod ? (prod.unit || "Cái") : (item.unit || "Cái"), 's', baseStyle(cCenter), null);
          setCell(ws, rowIdx, 8, "", 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 9, "", 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 10, "", 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 11, "", 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 12, "", 's', baseStyle(cLeft), null);
          setCell(ws, rowIdx, 13, item.qty || 0, 'n', numStyle(cRight), "#,##0.##");
          setCell(ws, rowIdx, 14, item.price || 0, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 15, 0, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 16, 0, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 17, itemGross, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 18, discVal, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 19, 0, 'n', numStyle(cRight), "#,##0.##");
          setCell(ws, rowIdx, 20, 0, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 21, 0, 'n', numStyle(cRight), numFmt);

          totalGross += itemGross;
          rowIdx++;
        });
      } else {
        const gross = v.totalAmount - (v.taxAmount || 0);
        setCell(ws, rowIdx, 0, dateStrToSerial(v.date), 'n', baseStyle(cCenter), dateFmt);
        setCell(ws, rowIdx, 1, dateStrToSerial(v.date), 'n', baseStyle(cCenter), dateFmt);
        setCell(ws, rowIdx, 2, v.id, 's', baseStyle(cCenter), null);
        setCell(ws, rowIdx, 3, dateStrToSerial(v.date), 'n', baseStyle(cCenter), dateFmt);
        setCell(ws, rowIdx, 4, v.invoiceNo || "", 's', baseStyle(cCenter), null);
        setCell(ws, rowIdx, 5, "GENERIC", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 6, "Đơn đặt hàng chi tiết tổng", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 7, "Cái", 's', baseStyle(cCenter), null);
        setCell(ws, rowIdx, 8, "", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 9, "", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 10, "", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 11, "", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 12, "", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 13, 0, 'n', numStyle(cRight), "#,##0.##");
        setCell(ws, rowIdx, 14, 0, 'n', numStyle(cRight), numFmt);
        setCell(ws, rowIdx, 15, 0, 'n', numStyle(cRight), numFmt);
        setCell(ws, rowIdx, 16, 0, 'n', numStyle(cRight), numFmt);
        setCell(ws, rowIdx, 17, gross, 'n', numStyle(cRight), numFmt);
        setCell(ws, rowIdx, 18, 0, 'n', numStyle(cRight), numFmt);
        setCell(ws, rowIdx, 19, 0, 'n', numStyle(cRight), "#,##0.##");
        setCell(ws, rowIdx, 20, 0, 'n', numStyle(cRight), numFmt);
        setCell(ws, rowIdx, 21, 0, 'n', numStyle(cRight), numFmt);

        totalGross += gross;
        rowIdx++;
      }
    });

    // --- DÒNG TỔNG ---
    const totalBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const totalStyle = (al) => ({ font: fntBold, fill: totalBg, alignment: al, border: border4 });
    setCell(ws, rowIdx, 0, "TỔNG CỘNG", 's', { font: fntBold, fill: totalBg, alignment: cLeft, border: border4 }, null);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 16 } });
    setCell(ws, rowIdx, 17, totalGross, 'n', totalStyle(cRight), numFmt);
    setCell(ws, rowIdx, 18, 0, 'n', totalStyle(cRight), numFmt);
    setCell(ws, rowIdx, 19, 0, 'n', totalStyle(cRight), "#,##0.##");
    setCell(ws, rowIdx, 20, 0, 'n', totalStyle(cRight), numFmt);
    setCell(ws, rowIdx, 21, 0, 'n', totalStyle(cRight), numFmt);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: 21 } });
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 },
      { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 13 }, { wch: 13 },
      { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }
    ];
    ws['!rows'] = [
      { hpt: 22 }, { hpt: 20 }, { hpt: 16 }, { hpt: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Don dat hang");

    let dateRangeSuffix = "";
    if (fromDate || toDate) dateRangeSuffix = `_${fromDate || ""}_${toDate || ""}`;
    const outName = `Don_dat_hang_chi_tiet_${getLocalDateString()}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel đơn đặt hàng: ${err.message}`, "danger");
  }
}

// ==========================================================================
// PHÂN HỆ HÀNG TRẢ LẠI (PURCHASE RETURNS)
// ==========================================================================
let purchaseReturnCurrentPage = 1;

function renderPurchaseReturnTable() {
  const tbody = document.getElementById("purchase-return-table-body");
  if (!tbody) return;

  let returns = state.vouchers.filter(v => v.type === "purchase_return");

  const query = document.getElementById("search-purchase-return") ? document.getElementById("search-purchase-return").value : "";
  const fromDate = document.getElementById("search-purchase-return-from") ? document.getElementById("search-purchase-return-from").value : "";
  const toDate = document.getElementById("search-purchase-return-to") ? document.getElementById("search-purchase-return-to").value : "";

  // Lọc nâng cao
  const advPayment = document.getElementById("adv-filter-purchase-return-payment") ? document.getElementById("adv-filter-purchase-return-payment").value : "";

  if (query) {
    returns = returns.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    returns = returns.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    returns = returns.filter(v => v.date <= toDate);
  }

  if (advPayment) {
    returns = returns.filter(v => v.paymentMethod === advPayment);
  }

  // Lọc theo từng cột (Column Filters)
  if (purchaseReturnColumnFilters.id) {
    const val = purchaseReturnColumnFilters.id.toLowerCase();
    returns = returns.filter(v => String(v.id).toLowerCase().includes(val));
  }
  if (purchaseReturnColumnFilters.date) {
    const val = purchaseReturnColumnFilters.date.toLowerCase();
    returns = returns.filter(v => {
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      return formattedDate.includes(val) || v.date.includes(val);
    });
  }
  if (purchaseReturnColumnFilters.partner) {
    const val = purchaseReturnColumnFilters.partner.toLowerCase();
    returns = returns.filter(v => getPartnerNameForVoucher(v).toLowerCase().includes(val));
  }
  if (purchaseReturnColumnFilters.description) {
    const val = purchaseReturnColumnFilters.description.toLowerCase();
    returns = returns.filter(v => (v.description || "").toLowerCase().includes(val));
  }
  if (purchaseReturnColumnFilters.paymentMethod) {
    returns = returns.filter(v => v.paymentMethod === purchaseReturnColumnFilters.paymentMethod);
  }
  if (purchaseReturnColumnFilters.totalMin !== "") {
    returns = returns.filter(v => v.totalAmount >= parseFloat(purchaseReturnColumnFilters.totalMin));
  }
  if (purchaseReturnColumnFilters.totalMax !== "") {
    returns = returns.filter(v => v.totalAmount <= parseFloat(purchaseReturnColumnFilters.totalMax));
  }
  if (purchaseReturnColumnFilters.entries) {
    const val = purchaseReturnColumnFilters.entries.toLowerCase();
    returns = returns.filter(v => 
      v.entries && v.entries.some(e => 
        e.debit.toLowerCase().includes(val) || 
        e.credit.toLowerCase().includes(val)
      )
    );
  }

  // Sắp xếp số chứng từ giảm dần (mới nhất lên trước)
  returns.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = returns.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (purchaseReturnCurrentPage > totalPages) purchaseReturnCurrentPage = totalPages;
  if (purchaseReturnCurrentPage < 1) purchaseReturnCurrentPage = 1;

  const startIdx = (purchaseReturnCurrentPage - 1) * 30;
  const displayedReturns = returns.slice(startIdx, startIdx + 30);

  // Cập nhật thông tin phân trang trên tiêu đề bảng
  const countEl = document.getElementById("purchase-return-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị đơn hàng từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} đơn hàng (Trang ${purchaseReturnCurrentPage}/${totalPages})`;
  }

  // Reset check-all-purchase-return checkbox
  const checkAll = document.getElementById("check-all-purchase-return");
  if (checkAll) checkAll.checked = false;
  updateBatchPurchaseReturnsUI();

  // Render các nút chuyển trang động
  const paginationControls = document.getElementById("purchase-return-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseReturnPage(1)" ${purchaseReturnCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseReturnPage(${purchaseReturnCurrentPage - 1})" ${purchaseReturnCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, purchaseReturnCurrentPage - 2);
      let endPage = Math.min(totalPages, purchaseReturnCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === purchaseReturnCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changePurchaseReturnPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === purchaseReturnCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseReturnPage(${purchaseReturnCurrentPage + 1})" ${purchaseReturnCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changePurchaseReturnPage(${totalPages})" ${purchaseReturnCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} đơn trả lại hàng
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedReturns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy chứng từ trả lại hàng nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayedReturns.map(v => {
    const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="purchase-return-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchPurchaseReturnsUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-primary); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td style="font-weight:600; color:var(--text-primary);">${getPartnerNameForVoucher(v)}</td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '131' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '131' ? 'Công nợ (131)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric" style="font-weight:700; color:var(--color-primary);">${formatVND(v.totalAmount)}</td>
        <td>
          <div class="accounting-detail-box">
            ${v.entries.map(e => `
              <div class="accounting-entry-row">
                <span>Nợ <span class="acct-debit">${e.debit}</span> / Có <span class="acct-credit">${e.credit}</span></span>
                <span class="font-numeric">${formatVND(e.amount)}</span>
              </div>
            `).join("")}
          </div>
        </td>
        <td style="text-align: center;">
          <div class="table-actions">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="edit-btn" onclick="editPurchaseReturnVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa hóa đơn">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterPurchaseReturnTable() {
  purchaseReturnCurrentPage = 1;
  renderPurchaseReturnTable();
}

function clearPurchaseReturnDateFilter() {
  if (window.rdpClearInput) {
    rdpClearInput('search-purchase-return-from');
    rdpClearInput('search-purchase-return-to');
  } else {
    const fromEl = document.getElementById('search-purchase-return-from');
    const toEl = document.getElementById('search-purchase-return-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  filterPurchaseReturnTable();
}

function changePurchaseReturnPage(p) {
  purchaseReturnCurrentPage = p;
  renderPurchaseReturnTable();
}

function addPurchaseReturnFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0, insertAfterRow = null) {
  return addDynamicFormTableRow("purchase-return-form-items-body", {
    productId: productIdVal,
    qty: qtyVal,
    price: priceVal,
    discount: discountVal
  }, insertAfterRow);
}

function autoFillPurchaseReturnPrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");

  if (prod && row) {
    if (document.activeElement !== selectEl) {
      selectEl.value = `${prod.name} (${prod.id})`;
    }
    ensureProductExcelRow(prod);
    const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
      ? prod.lastPurchasePrice
      : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
        ? Number(prod.excelRow[20])
        : (prod.avgCost || prod.initialCost || 10000));

    row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
    recalculatePurchaseReturnTotals();
  }
}

function recalculatePurchaseReturnTotals() {
  return recalculateDynamicFormTable("purchase-return-form-items-body");
}

function resetPurchaseReturnForm() {
  const modalTitle = document.querySelector("#modal-add-purchase-return .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Hàng trả lại mua";
  resetDynamicVoucherForm("form-purchase-return", { date: getLocalDateString() });
  // Auto-focus vào ô Nhà cung cấp
  setTimeout(() => {
    const el = document.getElementById("ret-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

let editingPurchaseReturnId = null;
let purchaseReturnSubmitInProgress = false;

async function handlePurchaseReturnSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-purchase-return");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const inputIdEl = document.getElementById("pur-return-id");
  let voucherId = inputIdEl ? inputIdEl.value.trim() : "";

  if (editingPurchaseReturnId) {
    if (!voucherId) {
      showToast("Số chứng từ không được để trống!", "danger");
      return;
    }
  } else {
    if (!voucherId) {
      voucherId = generateNextPurchaseReturnVoucherId();
      if (inputIdEl) inputIdEl.value = voucherId;
    }
  }

  // Kiểm tra trùng số chứng từ
  const isDuplicate = state.vouchers.some(v => {
    if (editingPurchaseReturnId && String(v.id).toLowerCase() === editingPurchaseReturnId.toLowerCase()) return false;
    return String(v.id).toLowerCase() === voucherId.toLowerCase();
  });

  if (isDuplicate) {
    showToast("Số chứng từ đã tồn tại, vui lòng nhập số khác!", "danger");
    return;
  }

  const rows = document.querySelectorAll("#purchase-return-form-items-body tr");
  if (rows.length === 0) {
    showToast("Vui lòng thêm ít nhất một sản phẩm trả lại!", "danger");
    return;
  }

  const voucherItems = [];
  let hasError = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productInputVal = row.querySelector(".item-productId").value;
    const resolvedProduct = resolveProduct(productInputVal);

    if (!resolvedProduct) {
      showToast(`Không tìm thấy sản phẩm nào khớp với từ khóa "${productInputVal}"!`, "danger");
      hasError = true;
      break;
    }

    const productId = resolvedProduct.id;
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseDynamicMoney(row.querySelector(".item-price").value);
    const discount = parseDynamicDiscount(row.querySelector(".item-discount").value);
    const lineError = validateDynamicVoucherLine(qty, price, discount);
    if (lineError) {
      showToast(`Dòng ${i + 1}: ${lineError}`, "danger");
      hasError = true;
      break;
    }
    const amount = Math.round(qty * price * (1 - discount / 100));

    voucherItems.push({
      productId,
      qty,
      price,
      discount,
      amount
    });
  }

  if (hasError) return;

  const modalId = "modal-add-purchase-return";
  if (!beginVoucherSubmit(modalId, "Đang kiểm tra dữ liệu...")) return;

  try {
    if (!editingPurchaseReturnId || voucherId !== editingPurchaseReturnId) {
      setVoucherFormStatus(modalId, "Đang kiểm tra số chứng từ trên cloud...", "cloud");
      if (typeof ensureCloudSafeVoucherIdForSave === "function") {
        voucherId = await ensureCloudSafeVoucherIdForSave({
          currentId: voucherId,
          editingId: editingPurchaseReturnId,
          prefix: "MTL",
          fallbackBase: 8459,
          padLength: 5,
          inputEl: inputIdEl
        });
      }
    }

    const paymentMethod = document.getElementById("ret-payment").value;
    const partnerInputVal = document.getElementById("ret-partner").value;
    const resolvedPartner = resolvePartner(partnerInputVal, "supplier");
    const partnerId = resolvedPartner.id;
    const partnerName = resolvedPartner.name;

    const newVoucher = {
    id: voucherId,
    type: "purchase_return",
    date: document.getElementById("ret-date").value,
    partnerId,
    partnerName,
    paymentMethod,
    description: document.getElementById("ret-desc").value,
    items: voucherItems,
    taxRate: 0,
    taxAmount: 0,
    isManual: true,
    _updatedAt: Date.now(),
    _sessionId: clientSessionId
  };

  const isEdit = !!editingPurchaseReturnId;
  if (editingPurchaseReturnId) {
    const idx = state.vouchers.findIndex(v => v.id === editingPurchaseReturnId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    } else {
      // Chứng từ gốc biến mất trong lúc sửa — vẫn phải ghi lại bản đang sửa.
      state.vouchers.push(newVoucher);
    }
    
    // Nếu đổi mã chứng từ: lưu lại vết xóa mã cũ và cập nhật liên kết ký quỹ
    if (voucherId !== editingPurchaseReturnId) {
      if (typeof trackDeletedIds === "function") {
        trackDeletedIds([editingPurchaseReturnId]);
      }
      state.vouchers.forEach(v => {
        if (v.escrowRefId === editingPurchaseReturnId) {
          v.escrowRefId = voucherId;
        }
      });
    }

    editingPurchaseReturnId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  recalculateAccounting(false);
  setVoucherFormStatus(modalId, "Đang lưu và đồng bộ máy khác...", "sync");
  const cloudCommitted = await saveStateAndSyncVoucher();

  closeModal(modalId);
  showToast(
    cloudCommitted
      ? (isEdit ? "Cập nhật chứng từ trả lại thành công!" : "Lập chứng từ trả lại thành công!")
      : "Chứng từ đã lưu trên máy này và đang chờ đồng bộ sang máy khác.",
    cloudCommitted ? "success" : "warning"
  );
  } catch (err) {
    console.error("[PurchaseReturn] Lưu chứng từ trả lại thất bại:", err);
    if (typeof addErrorLog === "function") addErrorLog("handlePurchaseReturnSubmit.save", err.message, err);
    setVoucherFormStatus(modalId, "Không thể lưu chứng từ. Vui lòng thử lại.", "error");
    showToast("Không thể lưu chứng từ. Vui lòng thử lại.", "danger");
  } finally {
    endVoucherSubmit(modalId);
  }
}

function generateNextPurchaseReturnVoucherId() {
  const prefix = "MTL";
  let maxNum = typeof getMaxLocalVoucherSequence === "function"
    ? getMaxLocalVoucherSequence(prefix)
    : 0;
  if (!maxNum) {
    const regex = /^MTL(\d+)$/;
    (state.vouchers || []).forEach(v => {
      if (!v || v.type !== "purchase_return") return;
      const match = String(v.id).match(regex);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    });
  }
  if (maxNum === 0) maxNum = 8459;
  return `${prefix}${(maxNum + 1).toString().padStart(5, "0")}`;
}

function editPurchaseReturnVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseReturnId = id;

  const modalTitle = document.querySelector("#modal-add-purchase-return .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa chứng từ trả lại hàng: ${id}`;

  const idEl = document.getElementById("pur-return-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("ret-date").value = v.date;
  const pObj3 = getPartnerForVoucher(v);
  document.getElementById("ret-partner").value = pObj3 ? `${pObj3.name} (${pObj3.id})` : (v.partnerName || "");
  document.getElementById("ret-desc").value = v.description;
  document.getElementById("ret-payment").value = v.paymentMethod;

  const formItems = v.items.map(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    return {
      productId: prodVal,
      qty: item.qty,
      price: item.price,
      discount: normalizeDynamicDiscountValue(item.discount, item.qty, item.price)
    };
  });
  replaceDynamicFormTableRows("purchase-return-form-items-body", formItems);

  openModal("modal-add-purchase-return");
}

function toggleSelectAllPurchaseReturns(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".purchase-return-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchPurchaseReturnsUI();
}

function updateBatchPurchaseReturnsUI() {
  const checkboxes = document.querySelectorAll(".purchase-return-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-purchase-return");
  const count = document.getElementById("selected-purchase-returns-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-purchase-return");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

async function batchDeletePurchaseReturns() {
  const checked = Array.from(document.querySelectorAll(".purchase-return-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  const ok = await showConfirmModal({
    title: "Xác nhận xóa mua hàng trả lại",
    message: `Bạn có chắc chắn muốn xóa ${checked.length} chứng từ trả lại hàng đã chọn?`,
    confirmText: "Xóa chứng từ",
    cancelText: "Hủy bỏ",
    type: "danger"
  });
  if (!ok) return;

  const idsToDelete = checked.map(cb => String(cb.value));
  const deleteSet = new Set(idsToDelete);
  trackDeletedIds(idsToDelete);
  state.vouchers = state.vouchers.filter(v => !deleteSet.has(String(v.id)));

  if (typeof resetBatchSelectionUI === "function") {
    resetBatchSelectionUI({
      checkboxSelector: ".purchase-return-checkbox",
      masterId: "check-all-purchase-return",
      buttonId: "btn-batch-delete-purchase-return",
      countId: "selected-purchase-returns-count"
    });
  } else {
    const master = document.getElementById("check-all-purchase-return");
    if (master) master.checked = false;
    updateBatchPurchaseReturnsUI();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  const cloudCommitted = typeof saveStateAndSyncVoucher === "function"
    ? await saveStateAndSyncVoucher()
    : (saveState(), true);
  recalculateAccounting();
  showToast(
    cloudCommitted ? `Đã xóa thành công ${checked.length} chứng từ trả lại hàng!` : "Đã xóa trên máy này và đang chờ đồng bộ.",
    cloudCommitted ? "success" : "warning"
  );
    if (typeof resetBatchSelectionUI === "function") {
      resetBatchSelectionUI({
        checkboxSelector: ".purchase-return-checkbox",
        masterId: "check-all-purchase-return",
        buttonId: "btn-batch-delete-purchase-return",
        countId: "selected-purchase-returns-count"
      });
    }
}

function exportPurchaseReturnsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredReturns = state.vouchers.filter(v => v.type === "purchase_return");
  const query = document.getElementById("search-purchase-return") ? document.getElementById("search-purchase-return").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-purchase-return-from") ? document.getElementById("search-purchase-return-from").value : "";
  const toDate = document.getElementById("search-purchase-return-to") ? document.getElementById("search-purchase-return-to").value : "";

  if (query) filteredReturns = filteredReturns.filter(v =>
    matchStr(v.id, query) ||
    matchStr(v.partnerName, query) ||
    matchStr(v.description, query)
  );
  if (fromDate) filteredReturns = filteredReturns.filter(v => v.date >= fromDate);
  if (toDate) filteredReturns = filteredReturns.filter(v => v.date <= toDate);
  filteredReturns.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];
    const today = formatDateDisplay(new Date());
    const NCOLS = 16;

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

    sc(0, 0, state.companyName || "Công Ty Cổ Phần SX Và ĐT Phát Triển Rạng Đông", 's', { font: fntT, alignment: cL });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });
    sc(1, 0, "SỔ CHI TIẾT HÀNG TRẢ LẠI MUA", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });
    sc(2, 0, `Từ ngày: ${fromDate ? formatDateDisplay(fromDate) : 'đầu kỳ'}   Đến ngày: ${toDate ? formatDateDisplay(toDate) : today}`, 's', { font: fntSub, alignment: cC });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS - 1 } });

    const headers = [
      "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn",
      "Diễn giải", "Mã NCC", "Tên NCC",
      "Mã hàng", "Tên hàng", "ĐVT",
      "Số lượng trả lại", "Đơn giá", "Giá trị trả lại", "Chiết khấu", "Giá trị giảm giá"
    ];
    headers.forEach((h, c) => sc(3, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: b4 }));

    let rowIdx = 4;
    let totalQty = 0, totalGross = 0, totalCK = 0;

    filteredReturns.forEach((v, vi) => {
      const bg = vi % 2 === 0 ? null : altBg;
      const bs = al => ({ font: fntN, fill: bg, alignment: al, border: b4 });
      const ns = al => ({ font: fntN, fill: bg, alignment: al || cR, border: b4 });
      const partnerId = v.partnerId || "";
      const partnerName = v.partnerName || getPartnerNameForVoucher(v);
      const desc = v.description || "";

      const writeRow = (productId, productName, unit, qty, price, grossAmt, ckAmt) => {
        sc(rowIdx, 0, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
        sc(rowIdx, 1, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
        sc(rowIdx, 2, v.id, 's', bs(cC));
        sc(rowIdx, 3, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
        sc(rowIdx, 4, v.invoiceNo || "", 's', bs(cC));
        sc(rowIdx, 5, desc, 's', bs(cL));
        sc(rowIdx, 6, partnerId, 's', bs(cC));
        sc(rowIdx, 7, partnerName, 's', bs(cL));
        sc(rowIdx, 8, productId, 's', bs(cC));
        sc(rowIdx, 9, productName, 's', bs(cL));
        sc(rowIdx, 10, unit, 's', bs(cC));
        sc(rowIdx, 11, qty, 'n', ns(cR), "#,##0.##");
        sc(rowIdx, 12, price, 'n', ns(cR), numFmt);
        sc(rowIdx, 13, grossAmt, 'n', ns(cR), numFmt);
        sc(rowIdx, 14, ckAmt, 'n', ns(cR), numFmt);
        sc(rowIdx, 15, 0, 'n', ns(cR), numFmt);
        totalQty += qty; totalGross += grossAmt; totalCK += ckAmt;
        rowIdx++;
      };

      if (v.items && v.items.length > 0) {
        v.items.forEach(item => {
          const prod = (state.products || []).find(p => String(p.id) === String(item.productId));
          const qty = item.qty || 0;
          const price = item.price || 0;
          const grossAmt = getVoucherLineGrossAmount(item);
          const ckAmt = getVoucherLineDiscountAmount(item);
          writeRow(item.productId || "", prod ? prod.name : (item.productName || item.productId || ""), prod ? (prod.unit || "Cái") : (item.unit || "Cái"), qty, price, grossAmt, ckAmt);
        });
      } else {
        const gross = (v.totalAmount || 0) - (v.taxAmount || 0);
        writeRow(v.id, desc, "", 0, 0, gross, 0);
      }
    });

    const ts = al => ({ font: fntB, fill: totBg, alignment: al, border: b4 });
    sc(rowIdx, 0, "TỔNG CỘNG", 's', ts(cL));
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 10 } });
    for (let c = 1; c <= 10; c++) sc(rowIdx, c, "", 's', ts(cL));
    sc(rowIdx, 11, totalQty, 'n', ts(cR), "#,##0.##");
    sc(rowIdx, 12, 0, 'n', ts(cR), numFmt);
    sc(rowIdx, 13, totalGross, 'n', ts(cR), numFmt);
    sc(rowIdx, 14, totalCK, 'n', ts(cR), numFmt);
    sc(rowIdx, 15, 0, 'n', ts(cR), numFmt);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: NCOLS - 1 } });
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
      { wch: 26 }, { wch: 14 }, { wch: 28 },
      { wch: 14 }, { wch: 28 }, { wch: 7 },
      { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }
    ];
    ws['!rows'] = [{ hpt: 20 }, { hpt: 22 }, { hpt: 16 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "SO CHI TIET TRA LAI MUA");
    const suffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
    const outName = `SO_CHI_TIET_HANG_TRA_LAI_MUA_${getLocalDateString()}${suffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel hàng trả lại: ${err.message}`, "danger");
  }
}
window.exportPurchaseReturnsToExcel = exportPurchaseReturnsToExcel;

function resetEditingPurchaseIds() {
  editingPurchaseId = null;
  editingPurchaseOrderId = null;
  editingPurchaseReturnId = null;
}
window.resetEditingPurchaseIds = resetEditingPurchaseIds;
window.renderPurchaseTable = renderPurchaseTable;
window.filterPurchaseTable = filterPurchaseTable;

// Column filter triggers
window.onPurchaseFilterChange = onPurchaseFilterChange;
window.clearPurchaseColumnFilters = clearPurchaseColumnFilters;
window.onPurchaseOrderFilterChange = onPurchaseOrderFilterChange;
window.clearPurchaseOrderColumnFilters = clearPurchaseOrderColumnFilters;
window.onPurchaseReturnFilterChange = onPurchaseReturnFilterChange;
window.clearPurchaseReturnColumnFilters = clearPurchaseReturnColumnFilters;

if (typeof registerDynamicFormTable === "function") {
  registerDynamicFormTable(createStandardDynamicFormTableConfig({
    key: "purchase",
    tbodyId: "purchase-form-items-body",
    formId: "form-purchase",
    modalId: "modal-add-purchase",
    rowIdPrefix: "pur-row",
    productLabel: "Tên sản phẩm",
    priceLabel: "Đơn giá mua (đ)",
    productListId: "datalist-purchase-products",
    onProductInput: autoFillPurchasePrice,
    totals: { fixedTaxRate: 0, subtotalId: "pur-subtotal-display", taxId: "pur-tax-display", totalId: "pur-total-display" },
    fieldIds: { id: "pur-id", partner: "pur-partner", date: "pur-date", payment: "pur-payment", desc: "pur-desc", taxRate: "pur-tax-rate" },
    fieldDefaults: { payment: "331", desc: "Mua vật tư hàng hóa nhập kho", taxRate: "0" },
    getEditingId: () => editingPurchaseId,
    setEditingId: value => { editingPurchaseId = value || null; }
  }));
  registerDynamicFormTable(createStandardDynamicFormTableConfig({
    key: "purchase-order",
    tbodyId: "purchase-order-form-items-body",
    formId: "form-purchase-order",
    modalId: "modal-add-purchase-order",
    rowIdPrefix: "pur-order-row",
    productLabel: "Tên sản phẩm",
    priceLabel: "Đơn giá mua (đ)",
    productListId: "datalist-purchase-products",
    onProductInput: autoFillPurchaseOrderPrice,
    totals: { fixedTaxRate: 0, subtotalId: "pur-order-subtotal-display", taxId: "pur-order-tax-display", totalId: "pur-order-total-display" },
    fieldIds: { id: "pur-order-id", partner: "pur-order-partner", date: "pur-order-date", payment: "pur-order-payment", desc: "pur-order-desc", taxRate: "pur-order-tax-rate" },
    fieldDefaults: { payment: "331", desc: "Đơn đặt hàng mua vật tư hàng hóa", taxRate: "0" },
    getEditingId: () => editingPurchaseOrderId,
    setEditingId: value => { editingPurchaseOrderId = value || null; }
  }));
  registerDynamicFormTable(createStandardDynamicFormTableConfig({
    key: "purchase-return",
    tbodyId: "purchase-return-form-items-body",
    formId: "form-purchase-return",
    modalId: "modal-add-purchase-return",
    rowIdPrefix: "ret-row",
    productLabel: "Tên sản phẩm",
    priceLabel: "Đơn giá trả lại (đ)",
    productListId: "datalist-purchase-products",
    onProductInput: autoFillPurchaseReturnPrice,
    totals: { fixedTaxRate: 0, subtotalId: "ret-subtotal-display", taxId: "ret-tax-display", totalId: "ret-total-display" },
    fieldIds: { id: "pur-return-id", partner: "ret-partner", date: "ret-date", payment: "ret-payment", desc: "ret-desc", taxRate: "ret-tax-rate" },
    fieldDefaults: { payment: "331", desc: "Trả lại hàng mua cho nhà cung cấp", taxRate: "0" },
    getEditingId: () => editingPurchaseReturnId,
    setEditingId: value => { editingPurchaseReturnId = value || null; }
  }));
}

