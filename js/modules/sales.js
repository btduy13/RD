
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
      const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
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

  return `${prefix}${maxNum + 1}`;
}

// Xử lý nộp form Bán hàng (Có xác thực kiểm kho hàng tồn)
function handleSalesSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-sales");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

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
      if (inputIdEl) inputIdEl.value = voucherId;
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
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100 * 100) / 100 : 0;
    }
    addSalesFormRow(prodVal, item.qty, item.price, discountPercent);
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

    const master = document.getElementById("check-all-sales");
    if (master) master.checked = false;

    updateBatchSalesUI();
    showToast(`Đã xóa thành công ${checked.length} chứng từ bán hàng!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
      // recalculateAccounting đã gọi refreshUI() bên trong
    }, 0);
  }
}

function resetEditingSalesId() {
  editingSalesId = null;
}

let salesReturnCurrentPage = 1;
let editingSalesReturnId = null;

// switchSalesSubTab
function switchSalesSubTab(subTabId) {
  const btnInvoice = document.getElementById("tab-btn-sales-invoice");
  const btnReturn = document.getElementById("tab-btn-sales-return");

  if (btnInvoice) btnInvoice.classList.remove("active");
  if (btnReturn) btnReturn.classList.remove("active");

  if (subTabId === "invoice" && btnInvoice) btnInvoice.classList.add("active");
  if (subTabId === "return" && btnReturn) btnReturn.classList.add("active");

  const panelInvoice = document.getElementById("sales-subtab-invoice");
  const panelReturn = document.getElementById("sales-subtab-return");

  if (panelInvoice) panelInvoice.style.display = "none";
  if (panelReturn) panelReturn.style.display = "none";

  if (subTabId === "invoice" && panelInvoice) {
    panelInvoice.style.display = "block";
    renderSalesTable();
  } else if (subTabId === "return" && panelReturn) {
    panelReturn.style.display = "block";
    renderSalesReturnTable();
  }
}

// renderSalesReturnTable
function renderSalesReturnTable() {
  const tbody = document.getElementById("sales-return-table-body");
  if (!tbody) return;

  let returns = state.vouchers.filter(v => v.type === "sales_return");

  const query = document.getElementById("search-sales-return") ? document.getElementById("search-sales-return").value : "";
  const fromDate = document.getElementById("search-sales-return-from") ? document.getElementById("search-sales-return-from").value : "";
  const toDate = document.getElementById("search-sales-return-to") ? document.getElementById("search-sales-return-to").value : "";

  // Lọc nâng cao
  const advPayment = document.getElementById("adv-filter-sales-return-payment") ? document.getElementById("adv-filter-sales-return-payment").value : "";

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

  if (salesReturnCurrentPage > totalPages) salesReturnCurrentPage = totalPages;
  if (salesReturnCurrentPage < 1) salesReturnCurrentPage = 1;

  const startIdx = (salesReturnCurrentPage - 1) * 30;
  const displayedReturns = returns.slice(startIdx, startIdx + 30);

  // Cập nhật thông tin phân trang trên tiêu đề bảng
  const countEl = document.getElementById("sales-return-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị đơn hàng từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} đơn hàng (Trang ${salesReturnCurrentPage}/${totalPages})`;
  }

  // Reset check-all-sales-return checkbox
  const checkAll = document.getElementById("check-all-sales-return");
  if (checkAll) checkAll.checked = false;
  updateBatchSalesReturnsUI();

  // Render các nút chuyển trang động
  const paginationControls = document.getElementById("sales-return-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeSalesReturnPage(1)" ${salesReturnCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeSalesReturnPage(${salesReturnCurrentPage - 1})" ${salesReturnCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, salesReturnCurrentPage - 2);
      let endPage = Math.min(totalPages, salesReturnCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === salesReturnCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeSalesReturnPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === salesReturnCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeSalesReturnPage(${salesReturnCurrentPage + 1})" ${salesReturnCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeSalesReturnPage(${totalPages})" ${salesReturnCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
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
          <input type="checkbox" class="sales-return-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchSalesReturnsUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-success); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '131' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '131' ? 'Công nợ (131)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
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
            <button class="edit-btn" onclick="editSalesReturnVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa hóa đơn" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
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

function filterSalesReturnTable() {
  salesReturnCurrentPage = 1;
  renderSalesReturnTable();
}

function clearSalesReturnDateFilter() {
  const fromEl = document.getElementById("search-sales-return-from");
  const toEl = document.getElementById("search-sales-return-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  filterSalesReturnTable();
}

function changeSalesReturnPage(p) {
  salesReturnCurrentPage = p;
  renderSalesReturnTable();
}

// addSalesReturnFormRow
function addSalesReturnFormRow(productIdVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("sales-return-form-items-body");
  if (!tbody) return;

  const rowId = `sales-ret-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Gõ mã hoặc tên sản phẩm..." required list="datalist-sales-products" oninput="autoFillSalesReturnPrice(this)" onblur="autoFillSalesReturnPrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right number-format" required value="${qtyVal}" oninput="recalculateSalesReturnTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-price text-right number-format" required value="${Number(priceVal).toLocaleString("vi-VN")}" oninput="recalculateSalesReturnTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-discount text-right number-format" required value="${discountVal}" oninput="recalculateSalesReturnTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculateSalesReturnTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);
  recalculateSalesReturnTotals();

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

// autoFillSalesReturnPrice
function autoFillSalesReturnPrice(selectEl) {
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
    recalculateSalesReturnTotals();
  }
}

// recalculateSalesReturnTotals
function recalculateSalesReturnTotals() {
  const rows = document.querySelectorAll("#sales-return-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = parseInt(document.getElementById("sales-ret-tax-rate").value) || 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  document.getElementById("sales-ret-subtotal-display").value = formatVND(subtotal);
  document.getElementById("sales-ret-tax-display").value = formatVND(taxAmount);
  document.getElementById("sales-ret-total-display").value = formatVND(total);
}

// generateNextSalesReturnVoucherId
function generateNextSalesReturnVoucherId() {
  const prefix = "BTL";
  const regex = /^BTL(\d+)$/;
  let maxNum = 0;

  state.vouchers.forEach(v => {
    if (v.type === 'sales_return') {
      const match = v.id.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  if (maxNum === 0) {
    maxNum = 1000;
  }

  return `${prefix}${maxNum + 1}`;
}

// resetSalesReturnForm
function resetSalesReturnForm() {
  editingSalesReturnId = null;
  const modalTitle = document.querySelector("#modal-add-sales-return .card-title");
  if (modalTitle) modalTitle.innerText = "Chứng từ Hàng bán trả lại nhập kho";

  const idEl = document.getElementById("sales-ret-id");
  if (idEl) idEl.value = "";

  const tbody = document.getElementById("sales-return-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("sales-ret-desc").value = "Nhập hàng bán trả lại";
  document.getElementById("sales-ret-date").value = new Date().toISOString().split("T")[0];
  
  addSalesReturnFormRow();
  setTimeout(() => {
    const el = document.getElementById("sales-ret-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

// handleSalesReturnSubmit
function handleSalesReturnSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-sales-return");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const inputIdEl = document.getElementById("sales-ret-id");
  let voucherId = inputIdEl ? inputIdEl.value.trim() : "";

  if (editingSalesReturnId) {
    if (!voucherId) {
      showToast("Số chứng từ không được để trống!", "danger");
      return;
    }
  } else {
    if (!voucherId) {
      voucherId = generateNextSalesReturnVoucherId();
      if (inputIdEl) inputIdEl.value = voucherId;
    }
  }

  // Kiểm tra trùng số chứng từ
  const isDuplicate = state.vouchers.some(v => {
    if (editingSalesReturnId && v.id.toLowerCase() === editingSalesReturnId.toLowerCase()) return false;
    return v.id.toLowerCase() === voucherId.toLowerCase();
  });

  if (isDuplicate) {
    showToast("Số chứng từ đã tồn tại, vui lòng nhập số khác!", "danger");
    return;
  }

  const rows = document.querySelectorAll("#sales-return-form-items-body tr");
  if (rows.length === 0) {
    showToast("Vui lòng thêm ít nhất một sản phẩm trả lại!", "danger");
    return;
  }

  const partnerInputVal = document.getElementById("sales-ret-partner").value;
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
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
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

  const newVoucher = {
    id: voucherId,
    type: "sales_return",
    date: document.getElementById("sales-ret-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("sales-ret-payment").value,
    description: document.getElementById("sales-ret-desc").value,
    items: voucherItems,
    taxRate: parseInt(document.getElementById("sales-ret-tax-rate").value) || 0,
    isManual: true,
    _sessionId: clientSessionId
  };

  const isEdit = !!editingSalesReturnId;
  if (editingSalesReturnId) {
    const idx = state.vouchers.findIndex(v => v.id === editingSalesReturnId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    }
    
    // Nếu đổi mã chứng từ: lưu lại vết xóa mã cũ và cập nhật liên kết ký quỹ
    if (voucherId !== editingSalesReturnId) {
      if (typeof trackDeletedIds === "function") {
        trackDeletedIds([editingSalesReturnId]);
      }
      state.vouchers.forEach(v => {
        if (v.escrowRefId === editingSalesReturnId) {
          v.escrowRefId = voucherId;
        }
      });
    }

    editingSalesReturnId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  saveState();
  recalculateAccounting();

  closeModal("modal-add-sales-return");
  showToast(isEdit ? "Cập nhật chứng từ trả lại thành công!" : "Lập chứng từ trả lại hàng thành công!", "success");
}

// editSalesReturnVoucher
function editSalesReturnVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingSalesReturnId = id;

  const modalTitle = document.querySelector("#modal-add-sales-return .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa chứng từ hàng bán trả lại: ${id}`;

  const idEl = document.getElementById("sales-ret-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("sales-ret-date").value = v.date;
  document.getElementById("sales-ret-partner").value = getPartnerNameForVoucher(v);
  document.getElementById("sales-ret-desc").value = v.description;
  document.getElementById("sales-ret-payment").value = v.paymentMethod;
  if (document.getElementById("sales-ret-tax-rate")) {
    document.getElementById("sales-ret-tax-rate").value = v.taxRate || 0;
  }

  const tbody = document.getElementById("sales-return-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100 * 100) / 100 : 0;
    }
    addSalesReturnFormRow(prodVal, item.qty, item.price, discountPercent);
  });

  openModal("modal-add-sales-return");
}

// toggleSelectAllSalesReturns, updateBatchSalesReturnsUI, batchDeleteSalesReturns
function toggleSelectAllSalesReturns(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".sales-return-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchSalesReturnsUI();
}

function updateBatchSalesReturnsUI() {
  const checkboxes = document.querySelectorAll(".sales-return-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-sales-return");
  const count = document.getElementById("selected-sales-returns-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-sales-return");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteSalesReturns() {
  const checked = Array.from(document.querySelectorAll(".sales-return-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa và hủy ghi sổ ${checked.length} chứng từ trả lại đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    // Remove references
    state.vouchers.forEach(v => {
      if (v.escrowRefId && idsToDelete.includes(v.escrowRefId)) {
        v.escrowRefId = null;
      }
    });

    const master = document.getElementById("check-all-sales-return");
    if (master) master.checked = false;

    updateBatchSalesReturnsUI();
    showToast(`Đã xóa thành công ${checked.length} chứng từ trả lại hàng!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
  }
}

// exportSalesReturnsToExcel
function exportSalesReturnsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredReturns = state.vouchers.filter(v => v.type === "sales_return");

  const query = document.getElementById("search-sales-return") ? document.getElementById("search-sales-return").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-sales-return-from") ? document.getElementById("search-sales-return-from").value : "";
  const toDate = document.getElementById("search-sales-return-to") ? document.getElementById("search-sales-return-to").value : "";

  if (query) {
    filteredReturns = filteredReturns.filter(v =>
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
    );
  }
  if (fromDate) filteredReturns = filteredReturns.filter(v => v.date >= fromDate);
  if (toDate) filteredReturns = filteredReturns.filter(v => v.date <= toDate);
  filteredReturns.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

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

    const compName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
    setCell(ws, 0, 0, compName, 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 21 } });

    setCell(ws, 1, 0, "SỔ CHI TIẾT HÀNG BÁN TRẢ LẠI THEO MÃ QUY CÁCH", 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 21 } });

    setCell(ws, 2, 0, dateRangeText, 's', { font: fntSub, alignment: cCenter }, null);
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 21 } });

    const headers = ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn", "Mã hàng", "Tên hàng", "ĐVT", "Mã quy cách 1", "Mã quy cách 2", "Mã quy cách 3", "Mã quy cách 4", "Mã quy cách 5", "Số lượng trả lại", "Đơn giá", "Phí trước hải quan", "Phí hàng về kho", "Giá trị trả lại", "Chiết khấu", "Số lượng bán", "Giá trị bán", "Giá trị giảm giá"];
    headers.forEach((h, c) => {
      setCell(ws, 3, c, h, 's', { font: fntHdr, fill: headerBg, alignment: cCenter, border: border4 }, null);
    });

    let rowIdx = 4;
    let totalGross = 0;

    filteredReturns.forEach((v, vIdx) => {
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
        setCell(ws, rowIdx, 5, "", 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 6, v.description, 's', baseStyle(cLeft), null);
        setCell(ws, rowIdx, 7, "", 's', baseStyle(cCenter), null);
        for (let ci = 8; ci <= 12; ci++) setCell(ws, rowIdx, ci, "", 's', baseStyle(cLeft), null);
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

    const totalBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const totalStyle = (al) => ({ font: fntBold, fill: totalBg, alignment: al, border: border4 });
    setCell(ws, rowIdx, 0, "TỔNG CỘNG", 's', { font: fntBold, fill: totalBg, alignment: cLeft, border: border4 }, null);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 12 } });
    setCell(ws, rowIdx, 13, 0, 'n', totalStyle(cRight), "#,##0.##");
    setCell(ws, rowIdx, 14, 0, 'n', totalStyle(cRight), numFmt);
    setCell(ws, rowIdx, 15, 0, 'n', totalStyle(cRight), numFmt);
    setCell(ws, rowIdx, 16, 0, 'n', totalStyle(cRight), numFmt);
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

    XLSX.utils.book_append_sheet(wb, ws, "Hang ban tra lai");

    let dateRangeSuffix = "";
    if (fromDate || toDate) dateRangeSuffix = `_${fromDate || ""}_${toDate || ""}`;
    const outName = `Hang_ban_tra_lai_chi_tiet_${new Date().toISOString().split('T')[0]}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel hàng bán trả lại: ${err.message}`, "danger");
  }
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

window.switchSalesSubTab = switchSalesSubTab;
window.renderSalesReturnTable = renderSalesReturnTable;
window.filterSalesReturnTable = filterSalesReturnTable;
window.clearSalesReturnDateFilter = clearSalesReturnDateFilter;
window.changeSalesReturnPage = changeSalesReturnPage;
window.addSalesReturnFormRow = addSalesReturnFormRow;
window.autoFillSalesReturnPrice = autoFillSalesReturnPrice;
window.recalculateSalesReturnTotals = recalculateSalesReturnTotals;
window.resetSalesReturnForm = resetSalesReturnForm;
window.handleSalesReturnSubmit = handleSalesReturnSubmit;
window.editSalesReturnVoucher = editSalesReturnVoucher;
window.toggleSelectAllSalesReturns = toggleSelectAllSalesReturns;
window.updateBatchSalesReturnsUI = updateBatchSalesReturnsUI;
window.batchDeleteSalesReturns = batchDeleteSalesReturns;
window.exportSalesReturnsToExcel = exportSalesReturnsToExcel;