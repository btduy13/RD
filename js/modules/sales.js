
// State variables for column filters
let salesColumnFilters = {
  id: "", date: "", partner: "", description: "", paymentMethod: "",
  revMin: "", revMax: "", cogsMin: "", cogsMax: "", totalMin: "", totalMax: "", entries: ""
};

let salesReturnColumnFilters = {
  id: "", date: "", partner: "", description: "", paymentMethod: "",
  totalMin: "", totalMax: "", entries: ""
};

let quotationColumnFilters = {
  id: "", date: "", partner: "", description: "", paymentMethod: "",
  totalMin: "", totalMax: ""
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
const debouncedRenderSalesTable = debounce(renderSalesTable, 300);
const debouncedRenderSalesReturnTable = debounce(renderSalesReturnTable, 300);
const debouncedRenderQuotationTable = debounce(renderQuotationTable, 300);

function onSalesFilterChange() {
  salesColumnFilters.id = document.getElementById("filter-sales-id")?.value || "";
  salesColumnFilters.date = document.getElementById("filter-sales-date")?.value || "";
  salesColumnFilters.partner = document.getElementById("filter-sales-partner")?.value || "";
  salesColumnFilters.description = document.getElementById("filter-sales-desc")?.value || "";
  salesColumnFilters.paymentMethod = document.getElementById("filter-sales-payment")?.value || "";
  salesColumnFilters.revMin = document.getElementById("filter-sales-rev-min")?.value || "";
  salesColumnFilters.revMax = document.getElementById("filter-sales-rev-max")?.value || "";
  salesColumnFilters.cogsMin = document.getElementById("filter-sales-cogs-min")?.value || "";
  salesColumnFilters.cogsMax = document.getElementById("filter-sales-cogs-max")?.value || "";
  salesColumnFilters.totalMin = document.getElementById("filter-sales-total-min")?.value || "";
  salesColumnFilters.totalMax = document.getElementById("filter-sales-total-max")?.value || "";
  salesColumnFilters.entries = document.getElementById("filter-sales-entries")?.value || "";
  
  salesCurrentPage = 1;
  debouncedRenderSalesTable();
}

function onSalesReturnFilterChange() {
  salesReturnColumnFilters.id = document.getElementById("filter-sales-return-id")?.value || "";
  salesReturnColumnFilters.date = document.getElementById("filter-sales-return-date")?.value || "";
  salesReturnColumnFilters.partner = document.getElementById("filter-sales-return-partner")?.value || "";
  salesReturnColumnFilters.description = document.getElementById("filter-sales-return-desc")?.value || "";
  salesReturnColumnFilters.paymentMethod = document.getElementById("filter-sales-return-payment")?.value || "";
  salesReturnColumnFilters.totalMin = document.getElementById("filter-sales-return-total-min")?.value || "";
  salesReturnColumnFilters.totalMax = document.getElementById("filter-sales-return-total-max")?.value || "";
  salesReturnColumnFilters.entries = document.getElementById("filter-sales-return-entries")?.value || "";

  salesReturnCurrentPage = 1;
  debouncedRenderSalesReturnTable();
}

function onQuotationFilterChange() {
  quotationColumnFilters.id = document.getElementById("filter-quotation-id")?.value || "";
  quotationColumnFilters.date = document.getElementById("filter-quotation-date")?.value || "";
  quotationColumnFilters.partner = document.getElementById("filter-quotation-partner")?.value || "";
  quotationColumnFilters.description = document.getElementById("filter-quotation-desc")?.value || "";
  quotationColumnFilters.paymentMethod = document.getElementById("filter-quotation-payment")?.value || "";
  quotationColumnFilters.totalMin = document.getElementById("filter-quotation-total-min")?.value || "";
  quotationColumnFilters.totalMax = document.getElementById("filter-quotation-total-max")?.value || "";

  quotationCurrentPage = 1;
  debouncedRenderQuotationTable();
}

function clearSalesColumnFilters() {
  salesColumnFilters = {
    id: "", date: "", partner: "", description: "", paymentMethod: "",
    revMin: "", revMax: "", cogsMin: "", cogsMax: "", totalMin: "", totalMax: "", entries: ""
  };
  const ids = ["filter-sales-id", "filter-sales-date", "filter-sales-partner", "filter-sales-desc", 
               "filter-sales-payment", "filter-sales-rev-min", "filter-sales-rev-max", 
               "filter-sales-cogs-min", "filter-sales-cogs-max", "filter-sales-total-min", 
               "filter-sales-total-max", "filter-sales-entries"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderSalesTable();
}

function clearSalesReturnColumnFilters() {
  salesReturnColumnFilters = {
    id: "", date: "", partner: "", description: "", paymentMethod: "", totalMin: "", totalMax: "", entries: ""
  };
  const ids = ["filter-sales-return-id", "filter-sales-return-date", "filter-sales-return-partner", 
               "filter-sales-return-desc", "filter-sales-return-payment", "filter-sales-return-total-min", 
               "filter-sales-return-total-max", "filter-sales-return-entries"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderSalesReturnTable();
}

function clearQuotationColumnFilters() {
  quotationColumnFilters = {
    id: "", date: "", partner: "", description: "", paymentMethod: "", totalMin: "", totalMax: ""
  };
  const ids = ["filter-quotation-id", "filter-quotation-date", "filter-quotation-partner", 
               "filter-quotation-desc", "filter-quotation-payment", "filter-quotation-total-min", 
               "filter-quotation-total-max"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderQuotationTable();
}

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

  // Lọc theo từng cột (Column Filters)
  if (salesColumnFilters.id) {
    const val = salesColumnFilters.id.toLowerCase();
    sales = sales.filter(v => v.id.toLowerCase().includes(val));
  }
  if (salesColumnFilters.date) {
    const val = salesColumnFilters.date.toLowerCase();
    sales = sales.filter(v => {
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      return formattedDate.includes(val) || v.date.includes(val);
    });
  }
  if (salesColumnFilters.partner) {
    const val = salesColumnFilters.partner.toLowerCase();
    sales = sales.filter(v => getPartnerNameForVoucher(v).toLowerCase().includes(val));
  }
  if (salesColumnFilters.description) {
    const val = salesColumnFilters.description.toLowerCase();
    sales = sales.filter(v => (v.description || "").toLowerCase().includes(val));
  }
  if (salesColumnFilters.paymentMethod) {
    sales = sales.filter(v => v.paymentMethod === salesColumnFilters.paymentMethod);
  }
  if (salesColumnFilters.revMin !== "") {
    sales = sales.filter(v => v.totalAmount >= parseFloat(salesColumnFilters.revMin));
  }
  if (salesColumnFilters.revMax !== "") {
    sales = sales.filter(v => v.totalAmount <= parseFloat(salesColumnFilters.revMax));
  }
  if (salesColumnFilters.cogsMin !== "") {
    sales = sales.filter(v => v.cogsAmount >= parseFloat(salesColumnFilters.cogsMin));
  }
  if (salesColumnFilters.cogsMax !== "") {
    sales = sales.filter(v => v.cogsAmount <= parseFloat(salesColumnFilters.cogsMax));
  }
  if (salesColumnFilters.totalMin !== "") {
    sales = sales.filter(v => v.totalAmount >= parseFloat(salesColumnFilters.totalMin));
  }
  if (salesColumnFilters.totalMax !== "") {
    sales = sales.filter(v => v.totalAmount <= parseFloat(salesColumnFilters.totalMax));
  }
  if (salesColumnFilters.entries) {
    const val = salesColumnFilters.entries.toLowerCase();
    sales = sales.filter(v => 
      v.entries && v.entries.some(e => 
        e.debit.toLowerCase().includes(val) || 
        e.credit.toLowerCase().includes(val)
      )
    );
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

  // Render phân trang bằng shared component
  renderPagination('sales-pagination-controls', salesCurrentPage, totalPages, totalCount, 'changeSalesPage');

  if (displayedSales.length === 0) {
    renderEmptyState(tbody, 11, 'Không tìm thấy hóa đơn bán hàng', 'Nhấn nút tạo mới để thêm hóa đơn bán hàng');
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
  if (window.rdpClearInput) {
    rdpClearInput('search-sales-from');
    rdpClearInput('search-sales-to');
  } else {
    const fromEl = document.getElementById('search-sales-from');
    const toEl = document.getElementById('search-sales-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  filterSalesTable();
}

function changeSalesPage(p) {
  salesCurrentPage = p;
  renderSalesTable();
}

// Bổ sung các hàng sản phẩm động vào form Bán hàng
function addSalesFormRow(productIdVal = "", descVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("sales-form-items-body");
  if (!tbody) return;

  const rowId = `sale-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Mã SP..." required list="datalist-sales-products" oninput="autoFillProductPrice(this)" onblur="autoFillProductPrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-desc" placeholder="Mô tả..." value="${escapeHtmlAttr(descVal)}"
        ${descVal ? 'data-user-edited="1"' : ''}
        oninput="this.dataset.userEdited='1'">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right qty-format" required value="${Number.isInteger(qtyVal) ? qtyVal : qtyVal.toString().replace(".", ",")}" oninput="recalculateSalesTotals()">
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

  // Auto-focus vào ô sản phẩm của dòng vừa tạo khi add tay
  if (!productIdVal) {
    const allRows = tbody.querySelectorAll("tr");
    const newRow = allRows[allRows.length - 1];
    if (newRow) {
      const firstInput = newRow.querySelector(".item-productId");
      if (firstInput) {
        setTimeout(() => { firstInput.focus(); }, 30);
      }
    }
  }
}

// Lấy giá bán từ thông tin mặt hàng
function autoFillProductPrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");
  const isBlur = document.activeElement !== selectEl;

  if (prod && row) {
    if (isBlur) {
      // Khi blur: đặt lại mã SP về đúng ID sản phẩm
      selectEl.value = prod.id;
      // Tự điền mô tả khi blur — chỉ điền nếu user CHƯA tự sửa
      const descEl = row.querySelector(".item-desc");
      if (descEl && !descEl.dataset.userEdited) {
        descEl.value = prod.name;
      }
    }
    // Điền giá bán (cả khi input và blur)
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
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0;
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
  document.getElementById("sale-date").value = getLocalDateString();
  const noteEl = document.getElementById("sale-note");
  if (noteEl) noteEl.value = "";
  addSalesFormRow();
  // Auto-focus vào ô “Khách hàng mua” — trường quan trọng nhất khi mở form
  setTimeout(() => {
    const el = document.getElementById("sale-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

function generateNextSalesVoucherId(paymentMethod) {
  const prefix = "BH";

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
    maxNum = 44340;
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
    const itemDesc = row.querySelector(".item-desc") ? row.querySelector(".item-desc").value.trim() : "";
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0;
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
      itemDesc,
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
    note: document.getElementById("sale-note") ? document.getElementById("sale-note").value.trim() : "",
    items: voucherItems,
    taxRate: parseInt(document.getElementById("sale-tax-rate").value),
    isManual: true,
    _updatedAt: Date.now(),
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
  if (typeof viewVoucher === "function") {
    viewVoucher(newVoucher.id || voucherId);
  }
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
  if (document.getElementById("sale-note")) {
    document.getElementById("sale-note").value = v.note || "";
  }
  if (document.getElementById("sale-tax-rate")) {
    document.getElementById("sale-tax-rate").value = v.taxRate || 0;
  }

  const tbody = document.getElementById("sales-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodId = prod ? prod.id : item.productId;
    const itemDesc = item.itemDesc || (prod ? prod.name : item.productId);
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100) : 0;
    }
    addSalesFormRow(prodId, itemDesc, item.qty, item.price, discountPercent);
    // Đánh dấu mô tả đã được điền sẵn → không bị ghi đè bởi autoFill khi blur
    if (itemDesc) {
      const lastRow = document.querySelector("#sales-form-items-body tr:last-child");
      if (lastRow) {
        const descEl = lastRow.querySelector(".item-desc");
        if (descEl) descEl.dataset.userEdited = "1";
      }
    }
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
  const btnQuotation = document.getElementById("tab-btn-sales-quotation");
  const btnTemplate = document.getElementById("tab-btn-sales-template");

  if (btnInvoice) btnInvoice.classList.remove("active");
  if (btnReturn) btnReturn.classList.remove("active");
  if (btnQuotation) btnQuotation.classList.remove("active");
  if (btnTemplate) btnTemplate.classList.remove("active");

  if (subTabId === "invoice" && btnInvoice) btnInvoice.classList.add("active");
  if (subTabId === "return" && btnReturn) btnReturn.classList.add("active");
  if (subTabId === "quotation" && btnQuotation) btnQuotation.classList.add("active");
  if (subTabId === "template" && btnTemplate) btnTemplate.classList.add("active");

  const panelInvoice = document.getElementById("sales-subtab-invoice");
  const panelReturn = document.getElementById("sales-subtab-return");
  const panelQuotation = document.getElementById("sales-subtab-quotation");
  const panelTemplate = document.getElementById("sales-subtab-template");

  if (panelInvoice) panelInvoice.style.display = "none";
  if (panelReturn) panelReturn.style.display = "none";
  if (panelQuotation) panelQuotation.style.display = "none";
  if (panelTemplate) panelTemplate.style.display = "none";

  if (subTabId === "invoice" && panelInvoice) {
    panelInvoice.style.display = "block";
    renderSalesTable();
  } else if (subTabId === "return" && panelReturn) {
    panelReturn.style.display = "block";
    renderSalesReturnTable();
  } else if (subTabId === "quotation" && panelQuotation) {
    panelQuotation.style.display = "block";
    renderQuotationTable();
  } else if (subTabId === "template" && panelTemplate) {
    panelTemplate.style.display = "block";
    renderSalesTemplateTable();
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

  // Lọc theo từng cột (Column Filters)
  if (salesReturnColumnFilters.id) {
    const val = salesReturnColumnFilters.id.toLowerCase();
    returns = returns.filter(v => v.id.toLowerCase().includes(val));
  }
  if (salesReturnColumnFilters.date) {
    const val = salesReturnColumnFilters.date.toLowerCase();
    returns = returns.filter(v => {
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      return formattedDate.includes(val) || v.date.includes(val);
    });
  }
  if (salesReturnColumnFilters.partner) {
    const val = salesReturnColumnFilters.partner.toLowerCase();
    returns = returns.filter(v => getPartnerNameForVoucher(v).toLowerCase().includes(val));
  }
  if (salesReturnColumnFilters.description) {
    const val = salesReturnColumnFilters.description.toLowerCase();
    returns = returns.filter(v => (v.description || "").toLowerCase().includes(val));
  }
  if (salesReturnColumnFilters.paymentMethod) {
    returns = returns.filter(v => v.paymentMethod === salesReturnColumnFilters.paymentMethod);
  }
  if (salesReturnColumnFilters.totalMin !== "") {
    returns = returns.filter(v => v.totalAmount >= parseFloat(salesReturnColumnFilters.totalMin));
  }
  if (salesReturnColumnFilters.totalMax !== "") {
    returns = returns.filter(v => v.totalAmount <= parseFloat(salesReturnColumnFilters.totalMax));
  }
  if (salesReturnColumnFilters.entries) {
    const val = salesReturnColumnFilters.entries.toLowerCase();
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
  if (window.rdpClearInput) {
    rdpClearInput('search-sales-return-from');
    rdpClearInput('search-sales-return-to');
  } else {
    const fromEl = document.getElementById('search-sales-return-from');
    const toEl = document.getElementById('search-sales-return-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
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
      <input type="text" class="form-control item-qty text-right qty-format" required value="${Number.isInteger(qtyVal) ? qtyVal : qtyVal.toString().replace(".", ",")}" oninput="recalculateSalesReturnTotals()">
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

  // Auto-focus vào ô sản phẩm của dòng vừa tạo khi add tay
  if (!productIdVal) {
    const allRows = tbody.querySelectorAll("tr");
    const newRow = allRows[allRows.length - 1];
    if (newRow) {
      const firstInput = newRow.querySelector(".item-productId");
      if (firstInput) {
        setTimeout(() => { firstInput.focus(); }, 30);
      }
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
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0;
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
  document.getElementById("sales-ret-date").value = getLocalDateString();
  
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
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0;
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
    _updatedAt: Date.now(),
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
  if (typeof viewVoucher === "function") {
    viewVoucher(newVoucher.id || voucherId);
  }
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
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100) : 0;
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

  if (query) filteredReturns = filteredReturns.filter(v =>
    matchStr(v.id, query) ||
    matchStr(v.partnerName, query) ||
    matchStr(v.description, query)
  );
  if (fromDate) filteredReturns = filteredReturns.filter(v => v.date >= fromDate);
  if (toDate) filteredReturns = filteredReturns.filter(v => v.date <= toDate);
  filteredReturns.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    // ── MISA SO_CHI_TIET_BAN_HANG format (cùng cột, nhưng SL bán=0, SL trả lại=thực tế) ──
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];
    const today = new Date().toLocaleDateString('vi-VN');
    const NCOLS = 19;

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
    sc(1, 0, "SỔ CHI TIẾT HÀNG BÁN TRẢ LẠI", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });
    sc(2, 0, `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`, 's', { font: fntSub, alignment: cC });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS - 1 } });

    // Cùng cấu trúc cột SO_CHI_TIET_BAN_HANG — MISA nhận import ngược
    const headers = [
      "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn",
      "Diễn giải chung", "Diễn giải", "Mã khách hàng", "Tên khách hàng",
      "Mã hàng", "Tên hàng", "ĐVT",
      "Tổng số lượng bán", "Đơn giá", "Doanh số bán", "Chiết khấu",
      "Tổng số lượng trả lại", "Giá trị trả lại", "Giá trị giảm giá"
    ];
    headers.forEach((h, c) => sc(3, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: b4 }));

    let rowIdx = 4;
    let totalQtyRet = 0, totalGrossRet = 0;

    filteredReturns.forEach((v, vi) => {
      const bg = vi % 2 === 0 ? null : altBg;
      const bs = al => ({ font: fntN, fill: bg, alignment: al, border: b4 });
      const ns = al => ({ font: fntN, fill: bg, alignment: al || cR, border: b4 });
      const partnerId = v.partnerId || "";
      const partnerName = v.partnerName || getPartnerNameForVoucher(v);
      const descCommon = v.description || "";

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
        sc(rowIdx, 12, 0, 'n', ns(cR), "#,##0.##");      // SL bán = 0
        sc(rowIdx, 13, price, 'n', ns(cR), numFmt);       // Đơn giá
        sc(rowIdx, 14, 0, 'n', ns(cR), numFmt);           // Doanh số bán = 0
        sc(rowIdx, 15, ckAmt, 'n', ns(cR), numFmt);       // Chiết khấu
        sc(rowIdx, 16, qty, 'n', ns(cR), "#,##0.##");     // SL trả lại
        sc(rowIdx, 17, grossAmt, 'n', ns(cR), numFmt);    // GT trả lại
        sc(rowIdx, 18, 0, 'n', ns(cR), numFmt);           // GT giảm giá
        totalQtyRet += qty;
        totalGrossRet += grossAmt;
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
        writeRow(v.id, descCommon, "", 0, 0, gross, 0);
      }
    });

    const ts = al => ({ font: fntB, fill: totBg, alignment: al, border: b4 });
    sc(rowIdx, 0, "TỔNG CỘNG", 's', ts(cL));
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 11 } });
    for (let c = 1; c <= 11; c++) sc(rowIdx, c, "", 's', ts(cL));
    sc(rowIdx, 12, 0, 'n', ts(cR), "#,##0.##");
    sc(rowIdx, 13, 0, 'n', ts(cR), numFmt);
    sc(rowIdx, 14, 0, 'n', ts(cR), numFmt);
    sc(rowIdx, 15, 0, 'n', ts(cR), numFmt);
    sc(rowIdx, 16, totalQtyRet, 'n', ts(cR), "#,##0.##");
    sc(rowIdx, 17, totalGrossRet, 'n', ts(cR), numFmt);
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

    XLSX.utils.book_append_sheet(wb, ws, "SO CHI TIET BAN TRA LAI");
    const suffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
    const outName = `SO_CHI_TIET_HANG_BAN_TRA_LAI_${getLocalDateString()}${suffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel hàng bán trả lại: ${err.message}`, "danger");
  }
}

// ==========================================================================
// PHÂN HỆ BÁO GIÁ (QUOTATION)
// ==========================================================================

let quotationCurrentPage = 1;
let editingQuotationId = null;

function resetEditingQuotationId() {
  editingQuotationId = null;
}

// renderQuotationTable
function renderQuotationTable() {
  const tbody = document.getElementById("quotation-table-body");
  if (!tbody) return;

  let quotations = state.vouchers.filter(v => v.type === "sales_quotation");

  // Advanced search filters
  const query = document.getElementById("search-quotation") ? document.getElementById("search-quotation").value : "";
  const fromDate = document.getElementById("search-quotation-from") ? document.getElementById("search-quotation-from").value : "";
  const toDate = document.getElementById("search-quotation-to") ? document.getElementById("search-quotation-to").value : "";
  const advPayment = document.getElementById("adv-filter-quotation-payment") ? document.getElementById("adv-filter-quotation-payment").value : "";

  if (query) {
    quotations = quotations.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""}\t${partnerName}\t${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    quotations = quotations.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    quotations = quotations.filter(v => v.date <= toDate);
  }
  if (advPayment) {
    quotations = quotations.filter(v => v.paymentMethod === advPayment);
  }

  // Lọc theo từng cột (Column Filters)
  if (quotationColumnFilters.id) {
    const val = quotationColumnFilters.id.toLowerCase();
    quotations = quotations.filter(v => v.id.toLowerCase().includes(val));
  }
  if (quotationColumnFilters.date) {
    const val = quotationColumnFilters.date.toLowerCase();
    quotations = quotations.filter(v => {
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      return formattedDate.includes(val) || v.date.includes(val);
    });
  }
  if (quotationColumnFilters.partner) {
    const val = quotationColumnFilters.partner.toLowerCase();
    quotations = quotations.filter(v => getPartnerNameForVoucher(v).toLowerCase().includes(val));
  }
  if (quotationColumnFilters.description) {
    const val = quotationColumnFilters.description.toLowerCase();
    quotations = quotations.filter(v => (v.description || "").toLowerCase().includes(val));
  }
  if (quotationColumnFilters.paymentMethod) {
    quotations = quotations.filter(v => v.paymentMethod === quotationColumnFilters.paymentMethod);
  }
  if (quotationColumnFilters.totalMin !== "") {
    quotations = quotations.filter(v => v.totalAmount >= parseFloat(quotationColumnFilters.totalMin));
  }
  if (quotationColumnFilters.totalMax !== "") {
    quotations = quotations.filter(v => v.totalAmount <= parseFloat(quotationColumnFilters.totalMax));
  }

  // Sắp xếp GIẢM DẦN theo ngày chứng từ (mới nhất lên trước), nếu cùng ngày thì theo số chứng từ giảm dần
  quotations.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = quotations.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (quotationCurrentPage > totalPages) quotationCurrentPage = totalPages;
  if (quotationCurrentPage < 1) quotationCurrentPage = 1;

  const startIdx = (quotationCurrentPage - 1) * 30;
  const displayedQuotations = quotations.slice(startIdx, startIdx + 30);

  // Cập nhật thông tin phân trang trên tiêu đề bảng
  const countEl = document.getElementById("quotation-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị báo giá từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} báo giá (Trang ${quotationCurrentPage}/${totalPages})`;
  }

  // Reset check-all-quotation checkbox
  const checkAll = document.getElementById("check-all-quotation");
  if (checkAll) checkAll.checked = false;
  updateBatchQuotationsUI();

  // Render phân trang bằng shared component
  renderPagination('quotation-pagination-controls', quotationCurrentPage, totalPages, totalCount, 'changeQuotationPage');

  if (displayedQuotations.length === 0) {
    renderEmptyState(tbody, 8, 'Không tìm thấy phiếu báo giá', 'Nhấn nút tạo mới để thêm báo giá');
    return;
  }

  tbody.innerHTML = displayedQuotations.map(v => {
    const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="quotation-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchQuotationsUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-success); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '131' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '131' ? 'Công nợ (131)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric" style="font-weight:700; color:var(--color-success);">${formatVND(v.totalAmount)}</td>
        <td style="text-align: center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu báo giá" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="convert-btn" onclick="convertQuotationToOrder('${escapeHtmlAttr(v.id)}')" title="Chuyển thành Đơn bán hàng" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-warning); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
            <button class="edit-btn" onclick="editQuotationVoucher('${escapeHtmlAttr(v.id)}')" title="Chỉnh sửa báo giá" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa báo giá" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterQuotationTable() {
  quotationCurrentPage = 1;
  renderQuotationTable();
}

function clearQuotationDateFilter() {
  if (window.rdpClearInput) {
    rdpClearInput('search-quotation-from');
    rdpClearInput('search-quotation-to');
  } else {
    const fromEl = document.getElementById('search-quotation-from');
    const toEl = document.getElementById('search-quotation-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  filterQuotationTable();
}

function changeQuotationPage(p) {
  quotationCurrentPage = p;
  renderQuotationTable();
}

// Bổ sung các hàng sản phẩm động vào form Báo giá
function addQuotationFormRow(productIdVal = "", descVal = "", qtyVal = 1, priceVal = 0, discountVal = 0) {
  const tbody = document.getElementById("quotation-form-items-body");
  if (!tbody) return;

  const rowId = `quotation-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Mã SP..." required list="datalist-sales-products" oninput="autoFillQuotationPrice(this)" onblur="autoFillQuotationPrice(this)" value="${escapeHtmlAttr(productIdVal)}">
    </td>
    <td>
      <input type="text" class="form-control item-desc" placeholder="Mô tả..." value="${escapeHtmlAttr(descVal)}"
        ${descVal ? 'data-user-edited="1"' : ''}
        oninput="this.dataset.userEdited='1'">
    </td>
    <td>
      <input type="text" class="form-control item-qty text-right qty-format" required value="${Number.isInteger(qtyVal) ? qtyVal : qtyVal.toString().replace(".", ",")}" oninput="recalculateQuotationTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-price text-right number-format" required value="${Number(priceVal).toLocaleString("vi-VN")}" oninput="recalculateQuotationTotals()">
    </td>
    <td>
      <input type="text" class="form-control item-discount text-right number-format" required value="${discountVal}" oninput="recalculateQuotationTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculateQuotationTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);
  recalculateQuotationTotals();

  // Auto-focus vào ô sản phẩm của dòng vừa tạo khi add tay
  if (!productIdVal) {
    const allRows = tbody.querySelectorAll("tr");
    const newRow = allRows[allRows.length - 1];
    if (newRow) {
      const firstInput = newRow.querySelector(".item-productId");
      if (firstInput) {
        setTimeout(() => { firstInput.focus(); }, 30);
      }
    }
  }
}

// Lấy giá bán từ thông tin mặt hàng cho báo giá
function autoFillQuotationPrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");
  const isBlur = document.activeElement !== selectEl;

  if (prod && row) {
    if (isBlur) {
      selectEl.value = prod.id;
      const descInput = row.querySelector(".item-desc");
      if (descInput && !descInput.dataset.userEdited) {
        descInput.value = prod.name;
      }
    }
    ensureProductExcelRow(prod);
    const salePriceVal = prod.salePrice1 !== undefined && prod.salePrice1 > 0
      ? prod.salePrice1
      : (prod.excelRow && prod.excelRow[21] !== undefined && Number(prod.excelRow[21]) > 0
        ? Number(prod.excelRow[21])
        : (Math.round(prod.avgCost * 1.35 / 1000) * 1000 || 50000));

    row.querySelector(".item-price").value = Number(salePriceVal).toLocaleString("vi-VN");
    recalculateQuotationTotals();
  }
}

// Tính toán lại tổng tiền trong form Báo giá
function recalculateQuotationTotals() {
  const rows = document.querySelectorAll("#quotation-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = parseInt(document.getElementById("quotation-tax-rate").value) || 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  document.getElementById("quotation-subtotal-display").value = formatVND(subtotal);
  document.getElementById("quotation-tax-display").value = formatVND(taxAmount);
  document.getElementById("quotation-total-display").value = formatVND(total);
}

// Reset form báo giá
function resetQuotationForm() {
  editingQuotationId = null;
  const modalTitle = document.querySelector("#modal-add-sales-quotation .card-title");
  if (modalTitle) modalTitle.innerText = "Lập Phiếu Báo Giá";

  const idEl = document.getElementById("quotation-id");
  if (idEl) idEl.value = "";

  const tbody = document.getElementById("quotation-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("quotation-desc").value = "Báo giá hàng hóa";
  document.getElementById("quotation-date").value = getLocalDateString();
  addQuotationFormRow();
  setTimeout(() => {
    const el = document.getElementById("quotation-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

function generateNextQuotationVoucherId() {
  const prefix = "BG";
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  let maxNum = 0;

  state.vouchers.forEach(v => {
    const match = v.id.match(regex);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  });

  if (maxNum === 0) {
    maxNum = 10000;
  }

  return `${prefix}${maxNum + 1}`;
}

// Xử lý nộp form Báo giá
function handleQuotationSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-sales-quotation");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const inputIdEl = document.getElementById("quotation-id");
  let voucherId = inputIdEl ? inputIdEl.value.trim() : "";

  if (editingQuotationId) {
    if (!voucherId) {
      showToast("Số báo giá không được để trống!", "danger");
      return;
    }
  } else {
    if (!voucherId) {
      voucherId = generateNextQuotationVoucherId();
      if (inputIdEl) inputIdEl.value = voucherId;
    }
  }

  // Kiểm tra trùng số chứng từ
  const isDuplicate = state.vouchers.some(v => {
    if (editingQuotationId && v.id.toLowerCase() === editingQuotationId.toLowerCase()) return false;
    return v.id.toLowerCase() === voucherId.toLowerCase();
  });

  if (isDuplicate) {
    showToast("Số báo giá đã tồn tại, vui lòng nhập số khác!", "danger");
    return;
  }

  const rows = document.querySelectorAll("#quotation-form-items-body tr");
  if (rows.length === 0) {
    showToast("Vui lòng thêm ít nhất một sản phẩm cần báo giá!", "danger");
    return;
  }

  const partnerInputVal = document.getElementById("quotation-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;

  const voucherItems = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productInputVal = row.querySelector(".item-productId").value;
    const resolvedProduct = resolveProduct(productInputVal);

    if (!resolvedProduct) {
      showToast(`Không tìm thấy sản phẩm nào khớp với từ khóa "${productInputVal}"!`, "danger");
      return;
    }

    const productId = resolvedProduct.id;
    const itemDesc = row.querySelector(".item-desc") ? row.querySelector(".item-desc").value.trim() : "";
    const qty = safeParseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));

    voucherItems.push({
      productId,
      itemDesc,
      qty,
      price,
      discount,
      amount
    });
  }

  const newVoucher = {
    id: voucherId,
    type: "sales_quotation",
    date: document.getElementById("quotation-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("quotation-payment").value,
    description: document.getElementById("quotation-desc").value,
    items: voucherItems,
    taxRate: parseInt(document.getElementById("quotation-tax-rate").value),
    isManual: true,
    _updatedAt: Date.now(),
    _sessionId: clientSessionId
  };

  if (editingQuotationId) {
    const idx = state.vouchers.findIndex(v => v.id === editingQuotationId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    }
    
    if (voucherId !== editingQuotationId) {
      if (typeof trackDeletedIds === "function") {
        trackDeletedIds([editingQuotationId]);
      }
    }
    editingQuotationId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  saveState();
  recalculateAccounting();

  closeModal("modal-add-sales-quotation");
  showToast("Lập phiếu báo giá thành công!", "success");
  if (typeof viewVoucher === "function") {
    viewVoucher(newVoucher.id || voucherId);
  }
}

function editQuotationVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingQuotationId = id;

  const modalTitle = document.querySelector("#modal-add-sales-quotation .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa phiếu báo giá: ${id}`;

  const idEl = document.getElementById("quotation-id");
  if (idEl) idEl.value = v.id;

  document.getElementById("quotation-date").value = v.date;
  document.getElementById("quotation-partner").value = getPartnerNameForVoucher(v);
  document.getElementById("quotation-desc").value = v.description;
  document.getElementById("quotation-payment").value = v.paymentMethod;
  if (document.getElementById("quotation-tax-rate")) {
    document.getElementById("quotation-tax-rate").value = v.taxRate || 0;
  }

  const tbody = document.getElementById("quotation-form-items-body");
  if (tbody) tbody.innerHTML = "";

  v.items.forEach(item => {
    const prod = state.products.find(p => String(p.id) === String(item.productId));
    const prodId = prod ? prod.id : item.productId;
    const itemDesc = item.itemDesc || (prod ? prod.name : item.productId);
    let discountPercent = item.discount || 0;
    if (discountPercent > 100) {
      const gross = (item.qty || 0) * (item.price || 0);
      discountPercent = gross > 0 ? Math.round((discountPercent / gross) * 100) : 0;
    }
    addQuotationFormRow(prodId, itemDesc, item.qty, item.price, discountPercent);
  });

  openModal("modal-add-sales-quotation");
}

window.convertQuotationToOrder = function(id) {
  const qIdx = state.vouchers.findIndex(v => v.id === id && v.type === "sales_quotation");
  if (qIdx === -1) {
    if (typeof showToast === "function") showToast("Không tìm thấy báo giá!", "danger");
    return;
  }
  
  if (!confirm(`Bạn có chắc muốn chuyển báo giá ${id} thành Đơn bán hàng?\nBáo giá này sẽ bị xóa sau khi chuyển đổi thành công.`)) {
    return;
  }
  
  const quotation = state.vouchers[qIdx];
  const paymentMethod = quotation.paymentMethod || '131';
  let orderId = `BH${Date.now()}`;
  if (typeof generateNextSalesVoucherId === "function") {
    orderId = generateNextSalesVoucherId(paymentMethod);
  }
  
  const newOrder = JSON.parse(JSON.stringify(quotation));
  newOrder.id = orderId;
  newOrder.type = "sales";
  
  if (newOrder.description) {
    newOrder.description = newOrder.description.replace(/báo giá/gi, "Đơn hàng");
  } else {
    newOrder.description = "Đơn hàng từ báo giá";
  }
  
  state.vouchers.splice(qIdx, 1);
  if (typeof trackDeletedIds === "function") trackDeletedIds([id]);
  
  state.vouchers.unshift(newOrder); 
  
  if (typeof showToast === "function") {
    showToast(`Đã chuyển báo giá ${id} thành đơn hàng ${orderId}!`, "success");
  }
  
  if (typeof recalculateAccounting === "function") recalculateAccounting();
  if (typeof renderSalesTable === "function") renderSalesTable();
  if (typeof renderQuotationTable === "function") renderQuotationTable();
  
  if (typeof switchSalesSubTab === "function") {
    switchSalesSubTab('invoice');
  }
};

function toggleSelectAllQuotations(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".quotation-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchQuotationsUI();
}

function updateBatchQuotationsUI() {
  const checkboxes = document.querySelectorAll(".quotation-checkbox:checked");
  const count = checkboxes.length;
  const batchBtn = document.getElementById("btn-batch-delete-quotation");
  const countEl = document.getElementById("selected-quotations-count");

  if (batchBtn) {
    if (count > 0) {
      batchBtn.style.display = "inline-flex";
    } else {
      batchBtn.style.display = "none";
    }
  }
  if (countEl) countEl.innerText = count;
}

function batchDeleteQuotations() {
  const checkboxes = document.querySelectorAll(".quotation-checkbox:checked");
  const ids = Array.from(checkboxes).map(cb => cb.value);
  if (ids.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${ids.length} báo giá đã chọn không?`)) {
    try {
      trackDeletedIds(ids);
      state.vouchers = state.vouchers.filter(v => !ids.includes(v.id));
      showToast(`Đã xóa thành công ${ids.length} báo giá!`, "success");
      saveState();
      recalculateAccounting();
    } catch (err) {
      console.error(err);
      showToast(`Lỗi khi xóa hàng loạt báo giá: ${err.message}`, "danger");
    }
  }
}

// exportQuotationsToExcel
function exportQuotationsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  let filteredQuotations = state.vouchers.filter(v => v.type === "sales_quotation");

  const query = document.getElementById("search-quotation") ? document.getElementById("search-quotation").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-quotation-from") ? document.getElementById("search-quotation-from").value : "";
  const toDate = document.getElementById("search-quotation-to") ? document.getElementById("search-quotation-to").value : "";

  if (query) filteredQuotations = filteredQuotations.filter(v =>
    matchStr(v.id, query) ||
    matchStr(v.partnerName, query) ||
    matchStr(v.description, query)
  );
  if (fromDate) filteredQuotations = filteredQuotations.filter(v => v.date >= fromDate);
  if (toDate) filteredQuotations = filteredQuotations.filter(v => v.date <= toDate);
  filteredQuotations.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const fntT = { name: "Times New Roman", sz: 13, bold: true };
    const fntSub = { name: "Times New Roman", sz: 11, italic: true };
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

    const today = new Date().toLocaleDateString('vi-VN');
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — DANH SÁCH BÁO GIÁ", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });

    sc(1, 0, `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`, 's', { font: fntSub, alignment: cC });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });

    const headers = ["Ngày báo giá", "Số báo giá", "Khách hàng", "Diễn giải", "Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Đơn giá", "Tổng thanh toán"];
    headers.forEach((h, c) => sc(2, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    let rowIdx = 3;
    let totalAmt = 0;

    filteredQuotations.forEach((v, idx) => {
      const bg = idx % 2 === 0 ? null : altBg;
      const bs = (al) => ({ font: fntN, fill: bg, alignment: al, border: border4 });

      const dateStr = v.date ? v.date.split("-").reverse().join("/") : "";
      
      v.items.forEach(item => {
        const prod = state.products.find(p => String(p.id) === String(item.productId)) || { name: item.productId };

        sc(rowIdx, 0, dateStr, 's', bs(cC));
        sc(rowIdx, 1, v.id, 's', bs(cC));
        sc(rowIdx, 2, v.partnerName, 's', bs(cL));
        sc(rowIdx, 3, v.description, 's', bs(cL));
        sc(rowIdx, 4, item.productId, 's', bs(cC));
        sc(rowIdx, 5, prod.name, 's', bs(cL));
        sc(rowIdx, 6, prod.unit || "Cái", 's', bs(cC));
        sc(rowIdx, 7, item.qty, 'n', bs(cR), "#,##0.0");
        sc(rowIdx, 8, item.price, 'n', bs(cR), numFmt);
        sc(rowIdx, 9, item.amount, 'n', bs(cR), numFmt);

        totalAmt += item.amount;
        rowIdx++;
      });
    });

    // ROW CỐI: Tổng cộng
    sc(rowIdx, 0, "TỔNG CỘNG", 's', { font: fntB, fill: totBg, alignment: cC, border: border4 });
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 8 } });
    for (let c = 1; c <= 8; c++) {
      sc(rowIdx, c, "", 's', { fill: totBg, border: border4 });
    }
    sc(rowIdx, 9, totalAmt, 'n', { font: fntB, fill: totBg, alignment: cR, border: border4 }, numFmt);

    ws['!merges'] = merges;
    ws['!ref'] = `A1:J${rowIdx + 1}`;
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 30 }, { wch: 12 },
      { wch: 25 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 16 }
    ];
    ws['!rows'] = [
      { hpt: 22 }, { hpt: 20 }, { hpt: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Bao gia chi tiet");

    let dateRangeSuffix = "";
    if (fromDate || toDate) dateRangeSuffix = `_${fromDate || ""}_${toDate || ""}`;
    const outName = `Bao_gia_chi_tiet_${getLocalDateString()}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel báo giá: ${err.message}`, "danger");
  }
}

window.resetEditingQuotationId = resetEditingQuotationId;
window.renderQuotationTable = renderQuotationTable;
window.filterQuotationTable = filterQuotationTable;
window.toggleSelectAllQuotations = toggleSelectAllQuotations;
window.updateBatchQuotationsUI = updateBatchQuotationsUI;
window.batchDeleteQuotations = batchDeleteQuotations;
window.editQuotationVoucher = editQuotationVoucher;
window.resetQuotationForm = resetQuotationForm;
window.changeQuotationPage = changeQuotationPage;
window.clearQuotationDateFilter = clearQuotationDateFilter;
window.addQuotationFormRow = addQuotationFormRow;
window.autoFillQuotationPrice = autoFillQuotationPrice;
window.recalculateQuotationTotals = recalculateQuotationTotals;
window.handleQuotationSubmit = handleQuotationSubmit;
window.exportQuotationsToExcel = exportQuotationsToExcel;

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

// Column filter triggers
window.onSalesFilterChange = onSalesFilterChange;
window.clearSalesColumnFilters = clearSalesColumnFilters;
window.onSalesReturnFilterChange = onSalesReturnFilterChange;
window.clearSalesReturnColumnFilters = clearSalesReturnColumnFilters;
window.onQuotationFilterChange = onQuotationFilterChange;
window.clearQuotationColumnFilters = clearQuotationColumnFilters;

// ----------------------------------------------------
// PHIẾU MẪU (SALES TEMPLATE) IMPLEMENTATION
// ----------------------------------------------------
let allTemplateFiles = []; // To cache template file info

function renderSalesTemplateTable() {
  const tbody = document.getElementById("sales-template-table-body");
  if (!tbody) return;
  
  // Sử dụng dữ liệu tĩnh được biên dịch sẵn
  allTemplateFiles = window.salesTemplatesData || [];
  displaySalesTemplateTable(allTemplateFiles);
}

function displaySalesTemplateTable(list) {
  const tbody = document.getElementById("sales-template-table-body");
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">Không tìm thấy phiếu mẫu nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => `
    <tr>
      <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
      <td style="font-weight: 600; color: var(--color-primary);">${escapeHtmlAttr(item.filename)}</td>
      <td>${escapeHtmlAttr(item.desc)}</td>
      <td style="text-align: center;">
        <button class="btn btn-primary btn-sm" onclick="modifySalesTemplate('${escapeHtmlAttr(item.filename)}')">
          Xem / Sửa
        </button>
      </td>
    </tr>
  `).join("");
}

let currentTemplateCategory = 'all';

function filterTemplateCategory(category) {
  currentTemplateCategory = category;
  
  // Cập nhật trạng thái active cho các pill buttons
  const categories = ['all', 'daubon', 'rapbcn', 'khac'];
  categories.forEach(cat => {
    const btn = document.getElementById(`filter-pill-${cat}`);
    if (btn) {
      if (cat === category) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });

  // Gọi lại hàm filter
  filterSalesTemplateTable();
}

function filterSalesTemplateTable() {
  const query = (document.getElementById("search-sales-template")?.value || "").trim().toLowerCase();
  
  let filtered = allTemplateFiles;

  // 1. Lọc theo danh mục
  if (currentTemplateCategory === 'daubon') {
    filtered = filtered.filter(item => item.filename.toLowerCase().includes('dau bon'));
  } else if (currentTemplateCategory === 'rapbcn') {
    filtered = filtered.filter(item => item.filename.toLowerCase().includes('rap bcn'));
  } else if (currentTemplateCategory === 'khac') {
    filtered = filtered.filter(item => !item.filename.toLowerCase().includes('dau bon') && !item.filename.toLowerCase().includes('rap bcn'));
  }

  // 2. Lọc theo ô tìm kiếm
  if (query) {
    filtered = filtered.filter(item => 
      item.filename.toLowerCase().includes(query) || 
      item.desc.toLowerCase().includes(query)
    );
  }

  displaySalesTemplateTable(filtered);
}


function modifySalesTemplate(filename) {
  try {
    const template = (window.salesTemplatesData || []).find(t => t.filename === filename);
    if (!template) {
      alert(`Không tìm thấy mẫu: ${filename}`);
      return;
    }

    // 1. Reset form bán hàng hiện tại
    resetSalesForm();

    // 2. Clear tbody của mặt hàng để add từ template
    const tbody = document.getElementById("sales-form-items-body");
    if (tbody) tbody.innerHTML = "";

    // 3. Đọc thông tin mô tả/diễn giải
    document.getElementById("sale-desc").value = template.desc || "Bán hàng theo mẫu";

    // Đặt khách hàng mặc định là Khách lẻ
    document.getElementById("sale-partner").value = "Khách lẻ";

    // 4. Duyệt các mặt hàng có sẵn trong template
    let matchedProductsCount = 0;
    const totalProductsCount = template.items.length;

    for (const item of template.items) {
      const itemName = item.name;
      const qty = item.qty;
      const price = item.price;

      // Đối sánh mặt hàng trong cơ sở dữ liệu
      const prod = findProductByName(itemName);
      let productId = "";
      let finalDesc = itemName;
      if (prod) {
        productId = prod.id;
        finalDesc = prod.name;
        matchedProductsCount++;
      } else {
        console.warn(`Không khớp sản phẩm: "${itemName}"`);
      }

      // Thêm dòng vào form bán hàng
      addSalesFormRow(productId, finalDesc, qty, price, 0);
    }

    recalculateSalesTotals();

    // Mở modal bán hàng
    openModal('modal-add-sales');
    if (typeof showToast === "function") {
      showToast(`Đã tải mẫu ${filename}. Khớp ${matchedProductsCount}/${totalProductsCount} sản phẩm.`, "success");
    } else {
      alert(`Đã tải mẫu ${filename}. Khớp ${matchedProductsCount}/${totalProductsCount} sản phẩm.`);
    }
  } catch (err) {
    console.error('Lỗi sửa phiếu mẫu:', err);
    alert(`Lỗi: ${err.message}`);
  }
}


function findProductByName(name) {
  if (!name) return null;
  
  // Helper to normalize strings
  const normalize = (str) => {
    if (!str) return '';
    return str.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, 'd').replace(/[\s\(\)\-\/\.,_]/g, '');
  };

  // Tokenize and filter out noise
  const tokenize = (str) => {
    if (!str) return [];
    let s = str.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, 'd');
    s = s.replace(/ø/g, '').replace(/phi/g, '').replace(/day/g, '').replace(/ly/g, '').replace(/x\d+([.,]\d+)?mm/g, '');
    return s.split(/[\s\(\)\-\/\.,_]+/).filter(x => x.length > 0 && x !== 'bm' && x !== 'binh' && x !== 'minh');
  };

  const nameTokens = tokenize(name);
  if (nameTokens.length === 0) return null;

  // 1. Khớp chính xác tuyệt đối sau khi chuẩn hóa
  const cleanName = normalize(name);
  let exact = state.products.find(p => normalize(p.name) === cleanName);
  if (exact) return exact;

  // 2. Khớp theo token giao nhau thông minh
  let bestMatch = null;
  let maxIntersection = 0;

  for (const p of state.products) {
    const pTokens = tokenize(p.name);
    const intersection = nameTokens.filter(t => pTokens.includes(t));
    if (intersection.length > 0) {
      // Tránh khớp lệch kích thước (ví dụ 34 và 27)
      const templateSize = nameTokens.find(t => /^\d+$/.test(t));
      const productSize = pTokens.find(t => /^\d+$/.test(t));
      if (templateSize && productSize && templateSize !== productSize) {
        continue;
      }

      // Tránh khớp lệch loại sản phẩm (ví dụ co, te, ong, loi, van, keo)
      const types = ['co', 'te', 'ong', 'loi', 'chech', 'racco', 'van', 'bit', 'kép', 'mang song', 'noi', 'nut'];
      let typeMismatch = false;
      for (const t of types) {
        if (nameTokens.includes(t) && !pTokens.includes(t)) {
          typeMismatch = true;
          break;
        }
        if (pTokens.includes(t) && !nameTokens.includes(t)) {
          typeMismatch = true;
          break;
        }
      }
      if (typeMismatch) continue;

      if (intersection.length > maxIntersection) {
        maxIntersection = intersection.length;
        bestMatch = p;
      }
    }
  }

  if (maxIntersection >= 1) {
    return bestMatch;
  }
  return null;
}

// Register template functions on window
window.renderSalesTemplateTable = renderSalesTemplateTable;
window.filterSalesTemplateTable = filterSalesTemplateTable;
window.modifySalesTemplate = modifySalesTemplate;
window.filterTemplateCategory = filterTemplateCategory;


