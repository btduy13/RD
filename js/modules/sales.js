
let salesCurrentPage = 1;

// 7. RENDER DỮ LIỆU PHÂN HỆ BÁN HÀNG (SALES)
function renderSalesTable() {
  const tbody = document.getElementById("sales-table-body");
  if (!tbody) return;

  let sales = state.vouchers.filter(v => v.type === "sales");

  // Advanced search filters
  const query = document.getElementById("search-sales") ? document.getElementById("search-sales").value : "";
  const fromDate = document.getElementById("search-sales-from") ? document.getElementById("search-sales-from").value : "";
  const toDate = document.getElementById("search-sales-to") ? document.getElementById("search-sales-to").value : "";

  // Lọc nâng cao
  const advPayment = document.getElementById("adv-filter-sales-payment") ? document.getElementById("adv-filter-sales-payment").value : "";

  if (query) {
    sales = sales.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    sales = sales.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    sales = sales.filter(v => v.date <= toDate);
  }

  if (advPayment) {
    sales = sales.filter(v => v.paymentMethod === advPayment);
  }

  // Sắp xếp GIẢM DẦN theo ngày chứng từ (mới nhất lên trước), nếu cùng ngày thì sắp xếp theo số chứng từ giảm dần
  sales.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = sales.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (salesCurrentPage > totalPages) salesCurrentPage = totalPages;
  if (salesCurrentPage < 1) salesCurrentPage = 1;

  const startIdx = (salesCurrentPage - 1) * 30;
  const displayedSales = sales.slice(startIdx, startIdx + 30);

  // Cập nhật thông tin phân trang trên tiêu đề bảng
  const countEl = document.getElementById("sales-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị đơn hàng từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} đơn hàng (Trang ${salesCurrentPage}/${totalPages})`;
  }

  // Reset check-all-sales checkbox
  const checkAll = document.getElementById("check-all-sales");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchSalesUI === "function") updateBatchSalesUI();

  // Render các nút chuyển trang động
  const paginationControls = document.getElementById("sales-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeSalesPage(1)" ${salesCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeSalesPage(${salesCurrentPage - 1})" ${salesCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, salesCurrentPage - 2);
      let endPage = Math.min(totalPages, salesCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === salesCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeSalesPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === salesCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeSalesPage(${salesCurrentPage + 1})" ${salesCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeSalesPage(${totalPages})" ${salesCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} đơn bán hàng
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedSales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy hóa đơn bán hàng nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayedSales.map(v => {
    // Định dạng ngày lập hiển thị dạng Ngày/Tháng/Năm (DD/MM/YYYY)
    const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";

    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="sale-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchSalesUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-success); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '131' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '131' ? 'Công nợ (131)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric">${formatVND(v.totalAmount)}</td>
        <td class="text-right font-numeric" style="color:var(--text-secondary);">${formatVND(v.cogsAmount)}</td>
        <td class="text-right font-numeric" style="font-weight:700; color:var(--color-success);">${formatVND(v.totalAmount)}</td>
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
            <button class="edit-btn" onclick="editSalesVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa hóa đơn" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
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

// Lọc hóa đơn bán hàng
function filterSalesTable() {
  salesCurrentPage = 1;
  renderSalesTable();
}

function clearSalesDateFilter() {
  const fromEl = document.getElementById("search-sales-from");
  const toEl = document.getElementById("search-sales-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  filterSalesTable();
}

function changeSalesPage(p) {
  salesCurrentPage = p;
  renderSalesTable();
}

// Bổ sung các hàng sản phẩm động vào form Bán hàng
function addSalesFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("sales-form-items-body");
  if (!tbody) return;

  const rowId = `sale-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Gõ mã hoặc tên sản phẩm..." required list="datalist-sales-products" oninput="autoFillProductPrice(this)" onblur="autoFillProductPrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right number-format" required value="${qtyVal}" oninput="recalculateSalesTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-price text-right number-format" required value="${Number(priceVal).toLocaleString("vi-VN")}" oninput="recalculateSalesTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-discount text-right number-format" required value="${discountVal}" oninput="recalculateSalesTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculateSalesTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);
  recalculateSalesTotals();

  // Auto-focus vào ô sản phẩm của dòng vừa tạo
  const allRows = tbody.querySelectorAll("tr");
  const newRow = allRows[allRows.length - 1];
  if (newRow) {
    const firstInput = newRow.querySelector(".item-productId");
    if (firstInput) {
      setTimeout(() => { firstInput.focus(); }, 30);
    }
  }
}

// Lấy giá bán từ thông tin mặt hàng
function autoFillProductPrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");

  if (prod && row) {
    if (document.activeElement !== selectEl) {
      selectEl.value = `${prod.name} (${prod.id})`;
    }
    ensureProductExcelRow(prod);
    const salePriceVal = prod.salePrice1 !== undefined && prod.salePrice1 > 0
      ? prod.salePrice1
      : (prod.excelRow && prod.excelRow[21] !== undefined && Number(prod.excelRow[21]) > 0
        ? Number(prod.excelRow[21])
        : (Math.round(prod.avgCost * 1.35 / 1000) * 1000 || 50000));

    row.querySelector(".item-price").value = Number(salePriceVal).toLocaleString("vi-VN");
    recalculateSalesTotals();
  }
}

// Tính toán lại tổng tiền trong form Bán
function recalculateSalesTotals() {
  const rows = document.querySelectorAll("#sales-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = parseInt(document.getElementById("sale-tax-rate").value) || 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  document.getElementById("sale-subtotal-display").value = formatVND(subtotal);
  document.getElementById("sale-tax-display").value = formatVND(taxAmount);
  document.getElementById("sale-total-display").value = formatVND(total);
}

let editingSalesId = null;

// Reset form bán hàng
function resetSalesForm() {
  editingSalesId = null;
  const modalTitle = document.querySelector("#modal-add-sales .card-title");
  if (modalTitle) modalTitle.innerText = "Lập hóa đơn bán hàng xuất kho";

  const idEl = document.getElementById("sale-id");
  if (idEl) idEl.value = "";

  const tbody = document.getElementById("sales-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("sale-desc").value = "Bán hàng xuất kho";
  document.getElementById("sale-date").value = new Date().toISOString().split("T")[0];
  addSalesFormRow();
  // Auto-focus vào ô “Khách hàng mua” — trường quan trọng nhất khi mở form
  setTimeout(() => {
    const el = document.getElementById("sale-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

function generateNextSalesVoucherId(paymentMethod) {
  const isCredit = (paymentMethod === "131");
  const prefix = isCredit ? "BH" : "PT";

  // Tìm tất cả các chứng từ có ID khớp với tiền tố + số
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  let maxNum = 0;

  state.vouchers.forEach(v => {
    const match = v.id.match(regex);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  });

  // Giá trị mặc định an toàn nếu chưa có chứng từ nào
  if (maxNum === 0) {
    maxNum = isCredit ? 44340 : 13122;
  }

  let nextId = `${prefix}${maxNum + 1}`;
  
  if (Array.isArray(state.deletedIds)) {
    let checkNum = maxNum + 1;
    while (state.deletedIds.includes(nextId)) {
      checkNum++;
      nextId = `${prefix}${checkNum}`;
    }
  }

  return nextId;
}

// Xử lý nộp form Bán hàng (Có xác thực kiểm kho hàng tồn)
function handleSalesSubmit(e) {
  e.preventDefault();

  const inputIdEl = document.getElementById("sale-id");
  let voucherId = inputIdEl ? inputIdEl.value.trim() : "";

  if (editingSalesId) {
    if (!voucherId) {
      showToast("Số chứng từ không được để trống!", "danger");
      return;
    }
  } else {
    if (!voucherId) {
      voucherId = generateNextSalesVoucherId(document.getElementById("sale-payment").value);
    }
  }

  // Kiểm tra trùng số chứng từ
  const isDuplicate = state.vouchers.some(v => {
    if (editingSalesId && v.id.toLowerCase() === editingSalesId.toLowerCase()) return false;
    return v.id.toLowerCase() === voucherId.toLowerCase();
  });

  if (isDuplicate) {
    showToast("Số chứng từ đã tồn tại, vui lòng nhập số khác!", "danger");
    return;
  }

  const rows = document.querySelectorAll("#sales-form-items-body tr");
  if (rows.length === 0) {
    showToast("Vui lòng thêm ít nhất một sản phẩm cần bán!", "danger");
    return;
  }

  const partnerInputVal = document.getElementById("sale-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;

  const voucherItems = [];
  let isStockInsufficient = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productInputVal = row.querySelector(".item-productId").value;
    const resolvedProduct = resolveProduct(productInputVal);

    if (!resolvedProduct) {
      showToast(`Không tìm thấy sản phẩm nào khớp với từ khóa "${productInputVal}"!`, "danger");
      isStockInsufficient = true;
      break;
    }

    const productId = resolvedProduct.id;
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));

    // Kiểm tra hàng tồn kho khả dụng (Cộng lại lượng đã bán cũ của chứng từ này nếu đang edit)
    let oldQty = 0;
    if (editingSalesId) {
      const oldVoucher = state.vouchers.find(v => v.id === editingSalesId);
      if (oldVoucher) {
        const oldItem = oldVoucher.items.find(item => String(item.productId) === String(productId));
        if (oldItem) oldQty = oldItem.qty || 0;
      }
    }
    if ((resolvedProduct.stock + oldQty) < qty) {
      showToast(`Cảnh báo: Hàng tồn kho sản phẩm "${resolvedProduct.name}" không đủ (Còn tồn ${resolvedProduct.stock + oldQty}, cần bán ${qty})!`, "warning");
    }

    voucherItems.push({
      productId,
      qty,
      price,
      discount,
      amount
    });
  }

  if (isStockInsufficient) return;

  const newVoucher = {
    id: voucherId,
    type: "sales",
    date: document.getElementById("sale-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("sale-payment").value,
    description: document.getElementById("sale-desc").value,
    items: voucherItems,
    taxRate: parseInt(document.getElementById("sale-tax-rate").value),
    isManual: true,
    _sessionId: clientSessionId
  };

  if (editingSalesId) {
    const idx = state.vouchers.findIndex(v => v.id === editingSalesId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    }
    
    // Nếu đổi mã chứng từ: lưu lại vết xóa mã cũ và cập nhật liên kết ký quỹ
    if (voucherId !== editingSalesId) {
      if (typeof trackDeletedIds === "function") {
        trackDeletedIds([editingSalesId]);
      }
      state.vouchers.forEach(v => {
        if (v.escrowRefId === editingSalesId) {
          v.escrowRefId = voucherId;
        }
      });
    }

    editingSalesId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  saveState();
  recalculateAccounting();

  closeModal("modal-add-sales");
  showToast("Lập hóa đơn bán hàng thành công!", "success");
}

function editSalesVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingSalesId = id;

  const modalTitle = document.querySelector("#modal-add-sales .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa hóa đơn bán hàng: ${id}`;

  const idEl = document.getElementById("sale-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("sale-date").value = v.date;
  document.getElementById("sale-partner").value = getPartnerNameForVoucher(v);
  document.getElementById("sale-desc").value = v.description;
  document.getElementById("sale-payment").value = v.paymentMethod;
  if (document.getElementById("sale-tax-rate")) {
    document.getElementById("sale-tax-rate").value = v.taxRate || 0;
  }

  const tbody = document.getElementById("sales-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    addSalesFormRow(prodVal, item.qty, item.price, item.discount);
  });

  openModal("modal-add-sales");
}

function toggleSelectAllSales(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".sale-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchSalesUI();
}

function updateBatchSalesUI() {
  const checkboxes = document.querySelectorAll(".sale-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-sales");
  const count = document.getElementById("selected-sales-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-sales");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteSales() {
  const checked = Array.from(document.querySelectorAll(".sale-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa và hủy ghi sổ ${checked.length} chứng từ đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    // Remove references
    state.vouchers.forEach(v => {
      if (v.escrowRefId && idsToDelete.includes(v.escrowRefId)) {
        v.escrowRefId = null;
      }
    });

    saveState();
    recalculateAccounting();

    const master = document.getElementById("check-all-sales");
    if (master) master.checked = false;

    updateBatchSalesUI();

    if (typeof safeRefreshAllModules === "function") {
      safeRefreshAllModules();
    } else {
      if (typeof filterSalesTable === "function") filterSalesTable();
      if (typeof filterCash === "function") {
        filterCash();
        if (typeof recalculateCashKpis === "function") recalculateCashKpis();
      }
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof filterDebts === "function") filterDebts();
      if (typeof filterPartners === "function") filterPartners();
      if (typeof renderInventoryTable === "function") renderInventoryTable();
    }

    showToast(`Đã xóa thành công ${checked.length} chứng từ bán hàng!`, "success");
  }
}

function resetEditingSalesId() {
  editingSalesId = null;
}
window.resetEditingSalesId = resetEditingSalesId;
window.renderSalesTable = renderSalesTable;
window.filterSalesTable = filterSalesTable;
window.toggleSelectAllSales = toggleSelectAllSales;
window.updateBatchSalesUI = updateBatchSalesUI;
window.batchDeleteSales = batchDeleteSales;
window.editSalesVoucher = editSalesVoucher;
window.resetSalesForm = resetSalesForm;
window.changeSalesPage = changeSalesPage;
window.clearSalesDateFilter = clearSalesDateFilter;