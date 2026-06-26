
// 6. REN
// 6. RENDER DỮ LIỆU PHÂN HỆ MUA HÀNG (PURCHASING)
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
    renderEmptyState(tbody, 8, 'Không tìm thấy hóa đơn mua hàng', 'Nhấn nút tạo mới để thêm hóa đơn mua hàng');
    return;
  }


  tbody.innerHTML = displayedPurchases.map(v => {
    const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="purchase-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchPurchasesUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-primary); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
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
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="edit-btn" onclick="editPurchaseVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa hóa đơn" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
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

// Đổ dữ liệu Đối tác vào dropdown trong form nhập liệu
function populatePartnerDropdown(elementId, filterType) {
  const input = document.getElementById(elementId);
  if (input) {
    input.value = ""; // Xóa giá trị cũ để người dùng nhập mới
  }
}

// Bổ sung các hàng sản phẩm động vào form Mua hàng
// Bổ sung các hàng sản phẩm động vào form Mua hàng
function addPurchaseFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("purchase-form-items-body");
  if (!tbody) return;

  const rowId = `pur-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Gõ mã hoặc tên sản phẩm..." required list="datalist-purchase-products" oninput="autoFillPurchasePrice(this)" onblur="autoFillPurchasePrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right qty-format" required value="${Number.isInteger(qtyVal) ? qtyVal : qtyVal.toString().replace(".", ",")}" oninput="recalculatePurchaseTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-price text-right number-format" required value="${Number(priceVal).toLocaleString("vi-VN")}" oninput="recalculatePurchaseTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-discount text-right number-format" required value="${discountVal}" oninput="recalculatePurchaseTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculatePurchaseTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);

  // Auto-focus vào ô sản phẩm của dòng vừa tạo
  const allRows = tbody.querySelectorAll("tr");
  const newRow = allRows[allRows.length - 1];
  if (newRow) {
    const firstInput = newRow.querySelector(".item-productId");
    if (firstInput) {
      setTimeout(() => { firstInput.focus(); }, 30);
    }
  }

  recalculatePurchaseTotals();
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
  const rows = document.querySelectorAll("#purchase-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/[^\d.]/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = 0;
  const taxAmount = 0;
  const total = subtotal;

  if (document.getElementById("pur-subtotal-display")) {
    document.getElementById("pur-subtotal-display").value = formatVND(subtotal);
  }
  if (document.getElementById("pur-tax-display")) {
    document.getElementById("pur-tax-display").value = formatVND(taxAmount);
  }
  if (document.getElementById("pur-total-display")) {
    document.getElementById("pur-total-display").value = formatVND(total);
  }
}

// Reset form mua hàng
function resetPurchaseForm() {
  editingPurchaseId = null;
  const modalTitle = document.querySelector("#modal-add-purchase .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Mua hàng nhập kho";

  const idEl = document.getElementById("pur-id");
  if (idEl) idEl.value = "";

  const tbody = document.getElementById("purchase-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("pur-desc").value = "Mua vật tư hàng hóa nhập kho";
  document.getElementById("pur-date").value = new Date().toISOString().split("T")[0];
  
  addPurchaseFormRow();
  // Auto-focus vào ô ngày hạch toán (trường đầu tiên hiển thị của form mua)
  setTimeout(() => {
    const el = document.getElementById("pur-date");
    if (el) el.focus();
  }, 60);
}

// Xử lý nộp form Mua hàng
function handlePurchaseSubmit(e) {
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
    if (editingPurchaseId && v.id.toLowerCase() === editingPurchaseId.toLowerCase()) return false;
    return v.id.toLowerCase() === voucherId.toLowerCase();
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

  const partnerInputVal = document.getElementById("pur-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;

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
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/[^\d.]/g, "")) || 0;
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
      state.vouchers[idx] = newVoucher;
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

  saveState();
  recalculateAccounting();

  closeModal("modal-add-purchase");
  showToast(isEdit ? "Cập nhật chứng từ mua hàng thành công!" : "Lập chứng từ mua hàng thành công!", "success");
}
let editingPurchaseId = null;
let editingPurchaseOrderId = null;

function generateNextPurchaseVoucherId(paymentMethod) {
  const prefix = "NK";
  const regex = /^NK(\d+)$/;
  let maxNum = 0;

  state.vouchers.forEach(v => {
    if (v.type === 'purchase') {
      const match = v.id.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  // Giá trị mặc định an toàn nếu chưa có hoặc số maxNum quá nhỏ so với lịch sử
  if (maxNum === 0) {
    maxNum = 8459; // Vì số trong ảnh là NK08459
  }

  return `${prefix}${(maxNum + 1).toString().padStart(5, '0')}`;
}

function editPurchaseVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseId = id;

  const modalTitle = document.querySelector("#modal-add-purchase .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa chứng từ mua hàng: ${id}`;

  const idEl = document.getElementById("pur-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("pur-date").value = v.date;
  document.getElementById("pur-partner").value = getPartnerNameForVoucher(v);
  document.getElementById("pur-desc").value = v.description;
  document.getElementById("pur-payment").value = v.paymentMethod;
  if (document.getElementById("pur-tax-rate")) {
    document.getElementById("pur-tax-rate").value = v.taxRate || 0;
  }

  const tbody = document.getElementById("purchase-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100 * 100) / 100 : 0;
    }
    addPurchaseFormRow(prodVal, item.qty, item.price, discountPercent);
  });

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

function batchDeletePurchases() {
  const checked = Array.from(document.querySelectorAll(".purchase-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} chứng từ mua hàng đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    const master = document.getElementById("check-all-purchase");
    if (master) master.checked = false;

    updateBatchPurchasesUI();
    showToast(`Đã xóa thành công ${checked.length} chứng từ mua hàng!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
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

    const fromStr = fromDate ? new Date(fromDate).toLocaleDateString('vi-VN') : '01/01/' + new Date().getFullYear();
    const toStr = toDate ? new Date(toDate).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');

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
            const grossAmt = item.amount || (qty * price);
            const ckAmt = item.discount ? grossAmt * (item.discount / 100) : 0;
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
      const outName = `SO_CHI_TIET_MUA_HANG_${new Date().toISOString().split('T')[0]}${suffix}.xlsx`;
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
      const outName = `DANH_SACH_MUA_HANG_${new Date().toISOString().split('T')[0]}${suffix}.xlsx`;
      XLSX.writeFile(wb, outName);
      showToast(`Đã xuất Excel: ${outName}`, "success");
    }
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel mua hàng: ${err.message}`, "danger");
  }
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
    panelInvoice.style.display = "block";
    renderPurchaseTable();
  } else if (subTabId === "order" && panelOrder) {
    panelOrder.style.display = "block";
    renderPurchaseOrderTable();
  } else if (subTabId === "return" && panelReturn) {
    panelReturn.style.display = "block";
    renderPurchaseReturnTable();
  }
}

function generateNextPurchaseOrderVoucherId() {
  const currentYear = new Date().getFullYear().toString().substring(2);
  const prefix = `ĐMH-${currentYear}-`;
  const regex = new RegExp(`^ĐMH-${currentYear}-(\\d+)$`);
  let maxNum = 0;

  state.vouchers.forEach(v => {
    if (v.type === 'purchase_order') {
      const match = v.id.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  return `${prefix}${(maxNum + 1).toString().padStart(4, '0')}`;
}

function addPurchaseOrderFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("purchase-order-form-items-body");
  if (!tbody) return;

  const rowId = `pur-order-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Gõ mã hoặc tên sản phẩm..." required list="datalist-purchase-products" oninput="autoFillPurchaseOrderPrice(this)" onblur="autoFillPurchaseOrderPrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right qty-format" required value="${Number.isInteger(qtyVal) ? qtyVal : qtyVal.toString().replace(".", ",")}" oninput="recalculatePurchaseOrderTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-price text-right number-format" required value="${Number(priceVal).toLocaleString("vi-VN")}" oninput="recalculatePurchaseOrderTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-discount text-right number-format" required value="${discountVal}" oninput="recalculatePurchaseOrderTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculatePurchaseOrderTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);

  // Auto-focus vào ô sản phẩm của dòng vừa tạo
  const allRows = tbody.querySelectorAll("tr");
  const newRow = allRows[allRows.length - 1];
  if (newRow) {
    const firstInput = newRow.querySelector(".item-productId");
    if (firstInput) {
      setTimeout(() => { firstInput.focus(); }, 30);
    }
  }

  recalculatePurchaseOrderTotals();
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
  const rows = document.querySelectorAll("#purchase-order-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/[^\d.]/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = 0;
  const taxAmount = 0;
  const total = subtotal;

  if (document.getElementById("pur-order-subtotal-display")) {
    document.getElementById("pur-order-subtotal-display").value = formatVND(subtotal);
  }
  if (document.getElementById("pur-order-tax-display")) {
    document.getElementById("pur-order-tax-display").value = formatVND(taxAmount);
  }
  if (document.getElementById("pur-order-total-display")) {
    document.getElementById("pur-order-total-display").value = formatVND(total);
  }
}

function resetPurchaseOrderForm() {
  editingPurchaseOrderId = null;
  const modalTitle = document.querySelector("#modal-add-purchase-order .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Đơn đặt hàng";

  const idEl = document.getElementById("pur-order-id");
  if (idEl) idEl.value = "";

  const tbody = document.getElementById("purchase-order-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("pur-order-desc").value = "Đơn đặt hàng mua vật tư hàng hóa";
  document.getElementById("pur-order-date").value = new Date().toISOString().split("T")[0];

  addPurchaseOrderFormRow();
  // Auto-focus vào ô ngày hạch toán
  setTimeout(() => {
    const el = document.getElementById("pur-order-date");
    if (el) el.focus();
  }, 60);
}

function handlePurchaseOrderSubmit(e) {
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

  // Kiểm tra trùng số chứng từ
  const isDuplicate = state.vouchers.some(v => {
    if (editingPurchaseOrderId && v.id.toLowerCase() === editingPurchaseOrderId.toLowerCase()) return false;
    return v.id.toLowerCase() === voucherId.toLowerCase();
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

  const partnerInputVal = document.getElementById("pur-order-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;

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
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/[^\d.]/g, "")) || 0;
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

  const paymentMethod = document.getElementById("pur-order-payment").value;
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

  saveState();
  recalculateAccounting();

  closeModal("modal-add-purchase-order");
  showToast(isEdit ? "Cập nhật đơn đặt hàng thành công!" : "Lập đơn đặt hàng thành công!", "success");
}

function editPurchaseOrderVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseOrderId = id;

  const modalTitle = document.querySelector("#modal-add-purchase-order .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa đơn đặt hàng: ${id}`;

  const idEl = document.getElementById("pur-order-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("pur-order-date").value = v.date;
  document.getElementById("pur-order-partner").value = getPartnerNameForVoucher(v);
  document.getElementById("pur-order-desc").value = v.description;
  document.getElementById("pur-order-payment").value = v.paymentMethod;
  if (document.getElementById("pur-order-tax-rate")) {
    document.getElementById("pur-order-tax-rate").value = v.taxRate || 0;
  }

  const tbody = document.getElementById("purchase-order-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100 * 100) / 100 : 0;
    }
    addPurchaseOrderFormRow(prodVal, item.qty, item.price, discountPercent);
  });

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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy đơn đặt hàng nào phù hợp.</td></tr>`;
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
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '331' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '331' ? 'Công nợ (331)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric" style="font-weight:700; color:var(--color-primary);">${formatVND(v.totalAmount)}</td>
        <td>
          <div class="accounting-detail-box" style="color: var(--text-muted); text-align: center; font-style: italic;">
            (Không hạch toán kho/sổ cái)
          </div>
        </td>
        <td style="text-align: center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu đơn hàng" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="edit-btn" onclick="editPurchaseOrderVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa đơn hàng" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa đơn hàng" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
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

function batchDeletePurchaseOrders() {
  const checked = Array.from(document.querySelectorAll(".purchase-order-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} đơn đặt hàng đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    const master = document.getElementById("check-all-purchase-order");
    if (master) master.checked = false;

    updateBatchPurchaseOrdersUI();
    showToast(`Đã xóa thành công ${checked.length} đơn đặt hàng!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
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

    const today = new Date().toLocaleDateString('vi-VN');
    let dateRangeText = `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`;

    // --- ROW 0: Tiêu đề chính ---
    const compName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
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
          setCell(ws, rowIdx, 17, itemGross - discVal, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 18, discVal, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 19, 0, 'n', numStyle(cRight), "#,##0.##");
          setCell(ws, rowIdx, 20, 0, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 21, 0, 'n', numStyle(cRight), numFmt);

          totalGross += itemGross - discVal;
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
    const outName = `Don_dat_hang_chi_tiet_${new Date().toISOString().split('T')[0]}${dateRangeSuffix}.xlsx`;
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy chứng từ trả lại hàng nào phù hợp.</td></tr>`;
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
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="edit-btn" onclick="editPurchaseReturnVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa hóa đơn" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
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

function addPurchaseReturnFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("purchase-return-form-items-body");
  if (!tbody) return;

  const rowId = `ret-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Gõ mã hoặc tên sản phẩm..." required list="datalist-purchase-products" oninput="autoFillPurchaseReturnPrice(this)" onblur="autoFillPurchaseReturnPrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right qty-format" required value="${Number.isInteger(qtyVal) ? qtyVal : qtyVal.toString().replace(".", ",")}" oninput="recalculatePurchaseReturnTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-price text-right number-format" required value="${Number(priceVal).toLocaleString("vi-VN")}" oninput="recalculatePurchaseReturnTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-discount text-right number-format" required value="${discountVal}" oninput="recalculatePurchaseReturnTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculatePurchaseReturnTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);

  const allRows = tbody.querySelectorAll("tr");
  const newRow = allRows[allRows.length - 1];
  if (newRow) {
    const firstInput = newRow.querySelector(".item-productId");
    if (firstInput) {
      setTimeout(() => { firstInput.focus(); }, 30);
    }
  }

  recalculatePurchaseReturnTotals();
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
  const rows = document.querySelectorAll("#purchase-return-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/[^\d.]/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = 0;
  const taxAmount = 0;
  const total = subtotal;

  if (document.getElementById("ret-subtotal-display")) {
    document.getElementById("ret-subtotal-display").value = formatVND(subtotal);
  }
  if (document.getElementById("ret-tax-display")) {
    document.getElementById("ret-tax-display").value = formatVND(taxAmount);
  }
  if (document.getElementById("ret-total-display")) {
    document.getElementById("ret-total-display").value = formatVND(total);
  }
}

function resetPurchaseReturnForm() {
  editingPurchaseReturnId = null;
  const modalTitle = document.querySelector("#modal-add-purchase-return .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Nhập hàng trả lại từ khách hàng";

  const idEl = document.getElementById("pur-return-id");
  if (idEl) idEl.value = "";

  const tbody = document.getElementById("purchase-return-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("ret-desc").value = "Nhập hàng trả lại từ khách hàng";
  document.getElementById("ret-date").value = new Date().toISOString().split("T")[0];

  addPurchaseReturnFormRow();
  setTimeout(() => {
    const el = document.getElementById("ret-date");
    if (el) el.focus();
  }, 60);
}

let editingPurchaseReturnId = null;

function handlePurchaseReturnSubmit(e) {
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
    if (editingPurchaseReturnId && v.id.toLowerCase() === editingPurchaseReturnId.toLowerCase()) return false;
    return v.id.toLowerCase() === voucherId.toLowerCase();
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

  const partnerInputVal = document.getElementById("ret-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;

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
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/[^\d.]/g, "")) || 0;
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

  const paymentMethod = document.getElementById("ret-payment").value;
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

  saveState();
  recalculateAccounting();

  closeModal("modal-add-purchase-return");
  showToast(isEdit ? "Cập nhật chứng từ trả lại thành công!" : "Lập chứng từ trả lại thành công!", "success");
}

function generateNextPurchaseReturnVoucherId() {
  const prefix = "MTL";
  const regex = /^MTL(\d+)$/;
  let maxNum = 0;

  state.vouchers.forEach(v => {
    if (v.type === 'purchase_return') {
      const match = v.id.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  if (maxNum === 0) {
    maxNum = 8459; // Để đồng bộ với các số NK08459, trả lại bắt đầu từ MTL08460
  }

  return `${prefix}${(maxNum + 1).toString().padStart(5, '0')}`;
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
  document.getElementById("ret-partner").value = getPartnerNameForVoucher(v);
  document.getElementById("ret-desc").value = v.description;
  document.getElementById("ret-payment").value = v.paymentMethod;

  const tbody = document.getElementById("purchase-return-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100 * 100) / 100 : 0;
    }
    addPurchaseReturnFormRow(prodVal, item.qty, item.price, discountPercent);
  });

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

function batchDeletePurchaseReturns() {
  const checked = Array.from(document.querySelectorAll(".purchase-return-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} chứng từ trả lại hàng đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    const master = document.getElementById("check-all-purchase-return");
    if (master) master.checked = false;

    updateBatchPurchaseReturnsUI();
    showToast(`Đã xóa thành công ${checked.length} chứng từ trả lại hàng!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
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
    const today = new Date().toLocaleDateString('vi-VN');
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

    sc(0, 0, state.companyName || "Công Ty Cổ Phần Rạng Đông", 's', { font: fntT, alignment: cL });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });
    sc(1, 0, "SỔ CHI TIẾT HÀNG TRẢ LẠI MUA", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });
    sc(2, 0, `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`, 's', { font: fntSub, alignment: cC });
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
          const grossAmt = item.amount || (qty * price);
          const ckAmt = item.discount ? grossAmt * (item.discount / 100) : 0;
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
    const outName = `SO_CHI_TIET_HANG_TRA_LAI_MUA_${new Date().toISOString().split('T')[0]}${suffix}.xlsx`;
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

