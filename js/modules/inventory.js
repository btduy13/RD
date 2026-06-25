let inventoryCurrentPage = 1;

// 8. RENDER DỮ LIỆU PHÂN HỆ KHO HÀNG (INVENTORY)
function renderInventoryTable(filterQuery = "") {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;

  let products = state.products || [];

  const query = filterQuery || (document.getElementById("search-inventory") ? document.getElementById("search-inventory").value : "");
  if (query) {
    products = products.filter(p => {
      const combined = `${p.id || ""} ${p.name || ""}`;
      return matchAdvancedQuery(combined, query, p.stock || 0);
    });
  }

  const totalCount = products.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (inventoryCurrentPage > totalPages) inventoryCurrentPage = totalPages;
  if (inventoryCurrentPage < 1) inventoryCurrentPage = 1;

  const startIdx = (inventoryCurrentPage - 1) * 30;
  const displayedProducts = products.slice(startIdx, startIdx + 30);

  // Update pagination info header
  const countEl = document.getElementById("inventory-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị sản phẩm từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} sản phẩm (Trang ${inventoryCurrentPage}/${totalPages})`;
  }

  // Reset check-all-products checkbox
  const checkAll = document.getElementById("check-all-products");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchProductsUI === "function") updateBatchProductsUI();

  // Render pagination controls
  const paginationControls = document.getElementById("inventory-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeInventoryPage(1)" ${inventoryCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeInventoryPage(${inventoryCurrentPage - 1})" ${inventoryCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, inventoryCurrentPage - 2);
      let endPage = Math.min(totalPages, inventoryCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === inventoryCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeInventoryPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === inventoryCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeInventoryPage(${inventoryCurrentPage + 1})" ${inventoryCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeInventoryPage(${totalPages})" ${inventoryCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} sản phẩm
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy sản phẩm phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayedProducts.map(p => {
    const isLow = (p.stock || 0) <= (p.minStock || 0);
    const escapedId = escapeHtmlAttr(p.id);
    ensureProductExcelRow(p);
    const initialCostVal = p.initialCost !== undefined ? p.initialCost : (p.excelRow[19] !== undefined ? Number(p.excelRow[19]) : 0);
    const lastPurchasePriceVal = p.excelRow[20] !== undefined ? Number(p.excelRow[20]) : (p.avgCost || 0);
    const salePriceVal = p.salePrice1 !== undefined ? p.salePrice1 : (p.excelRow[21] !== undefined ? Number(p.excelRow[21]) : 0);

    return `
      <tr class="clickable-row" data-type="product" data-id="${escapedId}">
        <td style="text-align: center;">
          <input type="checkbox" class="product-checkbox" value="${escapedId}" onchange="updateBatchProductsUI()">
        </td>
        <td class="font-numeric" style="font-weight:700;">${p.id}</td>
        <td><span style="font-weight:600; color:var(--text-primary);">${p.name}</span></td>
        <td>${p.unit || "Cái"}</td>
        <td class="text-right font-numeric" style="color: var(--text-secondary);">${formatVND(initialCostVal)}</td>
        <td class="text-right font-numeric" style="color: var(--text-secondary);">${formatVND(lastPurchasePriceVal)}</td>
        <td class="text-right font-numeric" style="color: var(--color-success); font-weight: 600;">${formatVND(salePriceVal)}</td>
        <td class="text-right font-numeric" style="font-weight:700; ${isLow ? 'color: var(--color-danger);' : ''}">${p.stock || 0}</td>
        <td class="text-right font-numeric">${formatVND(p.avgCost || 0)}</td>
        <td class="text-right font-numeric" style="font-weight:700;">${formatVND(p.totalValue || 0)}</td>
        <td>
          <span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">
            ${isLow ? 'Cảnh báo tồn thấp' : 'Đầy đủ'}
          </span>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn btn-secondary" onclick="viewStockLedgerForProduct('${escapedId}')" title="Xem Sổ thẻ kho" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-warning); cursor: pointer; transition: all 0.2s; padding: 0;">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 15px; height: 15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
            </button>
            <button class="btn btn-secondary" onclick="promptQuickImport('${escapedId}')" title="Nhập kho nhanh" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s; padding: 0;">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 15px; height: 15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </button>
            <button class="btn btn-secondary" onclick="promptEditProductPrice('${escapedId}')" title="Chỉnh sửa sản phẩm" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); cursor: pointer; transition: all 0.2s; padding: 0;">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 15px; height: 15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            </button>
            <button class="btn btn-secondary" onclick="deleteProduct('${escapedId}')" title="Xóa mặt hàng" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s; padding: 0;">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 15px; height: 15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Lọc sản phẩm tồn kho hiệu năng cực cao (0ms jank-free) dùng bộ lọc trong bộ nhớ
function filterInventoryTable() {
  inventoryCurrentPage = 1;
  const query = document.getElementById("search-inventory") ? document.getElementById("search-inventory").value : "";
  renderInventoryTable(query);
}

function changeInventoryPage(p) {
  inventoryCurrentPage = p;
  const query = document.getElementById("search-inventory") ? document.getElementById("search-inventory").value : "";
  renderInventoryTable(query);
}

// === HỆ THỐNG QUẢN LÝ THẺ KHO CHI TIẾT SPLIT VIEW ===
let selectedLedgerProductId = null;

// Nạp danh sách thẻ kho chi tiết theo từng sản phẩm (Backward-compatibility)
function populateProductLedgerDropdown() {
  renderLedgerProductList();
}

// Render danh sách mặt hàng bên cột trái
function renderLedgerProductList() {
  const container = document.getElementById("ledger-product-list");
  if (!container) return;

  const queryInput = document.getElementById("search-ledger-products");
  const query = queryInput ? queryInput.value.toLowerCase().trim() : "";

  let products = state.products || [];
  if (query) {
    products = products.filter(p =>
      matchStr(p.id, query) ||
      matchStr(p.name, query)
    );
  }

  if (products.length === 0) {
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">Không tìm thấy sản phẩm</div>`;
    return;
  }

  // Đảm bảo selectedLedgerProductId luôn hợp lệ
  if (!selectedLedgerProductId || !state.products.some(p => String(p.id) === String(selectedLedgerProductId))) {
    selectedLedgerProductId = products[0].id;
  }

  const html = products.map(p => {
    const isActive = String(p.id) === String(selectedLedgerProductId);
    return `
      <div class="ledger-product-item ${isActive ? 'active' : ''}" onclick="selectLedgerProduct('${escapeHtmlAttr(p.id)}')">
        <div style="font-weight: 700; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
          <span>${escapeHtmlAttr(p.id)}</span>
          <span style="font-size: 11px; color: var(--text-secondary); background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px;">${escapeHtmlAttr(p.unit || 'Cái')}</span>
        </div>
        <div style="font-size: 12px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtmlAttr(p.name)}">
          ${escapeHtmlAttr(p.name)}
        </div>
        <div style="font-size: 11px; margin-top: 6px; display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Tồn kho:</span>
          <span style="font-weight: 600; color: ${p.stock > 0 ? 'var(--color-success)' : 'var(--text-muted)'};">${p.stock || 0}</span>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

// Click chọn sản phẩm trên danh sách
function selectLedgerProduct(productId) {
  selectedLedgerProductId = productId;
  renderLedgerProductList();
  renderStockLedger();
}

// Gõ tìm kiếm sản phẩm bên cột trái
function filterLedgerProducts() {
  renderLedgerProductList();
}

// Render lịch sử nhập xuất của 1 mặt hàng (Thẻ kho chi tiết - Cột phải)
function renderStockLedger() {
  const tbody = document.getElementById("stock-ledger-body");
  if (!tbody) return;

  if (!selectedLedgerProductId && state.products && state.products.length > 0) {
    selectedLedgerProductId = state.products[0].id;
  }

  const prodId = selectedLedgerProductId;
  if (!prodId) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); padding: 20px;">Vui lòng khai báo sản phẩm trước để xem thẻ kho</td></tr>`;
    return;
  }

  const prod = state.products.find(p => String(p.id) === String(prodId));
  if (!prod) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); padding: 20px;">Không tìm thấy sản phẩm được chọn</td></tr>`;
    return;
  }

  // Cập nhật tiêu đề & thông tin
  const titleEl = document.getElementById("ledger-detail-title");
  if (titleEl) {
    titleEl.innerHTML = `Sổ thẻ kho chi tiết: <span style="color:var(--color-primary);">${escapeHtmlAttr(prod.name)}</span>`;
  }
  const subtitleEl = document.getElementById("ledger-detail-subtitle");
  if (subtitleEl) {
    subtitleEl.innerHTML = `Mã: <span style="font-weight: 700; color:var(--text-primary);">${escapeHtmlAttr(prod.id)}</span> | ĐVT: <span style="font-weight: 700; color:var(--text-primary);">${escapeHtmlAttr(prod.unit || 'Cái')}</span>`;
  }

  const origProd = DEFAULT_DATA.products.find(o => o.id === prodId);
  const initStock = origProd ? origProd.stock : (prod.initialStock || 0);
  const initCost = origProd ? origProd.avgCost : (prod.initialCost || 0);

  const fromDate = document.getElementById("search-ledger-from") ? document.getElementById("search-ledger-from").value : "";
  const toDate = document.getElementById("search-ledger-to") ? document.getElementById("search-ledger-to").value : "";

  let html = "";

  // 1. Số dư dòng đầu tiên: Tồn đầu kỳ
  html += `
    <tr style="background-color: rgba(255, 255, 255, 0.02); font-style: italic;">
      <td>01/01/2026</td>
      <td style="font-weight:600; color:var(--text-muted);">TỒN ĐẦU KỲ</td>
      <td class="text-right font-numeric">-</td>
      <td class="text-right font-numeric">-</td>
      <td class="text-right font-numeric" style="font-weight:700;">${formatVND(initCost)} (Tồn: ${initStock})</td>
    </tr>
  `;

  // 2. Lọc chứng từ phát sinh chứa sản phẩm này
  let filteredVouchers = state.vouchers.filter(v => {
    if (v.type !== "purchase" && v.type !== "sales" && v.type !== "purchase_return" && v.type !== "sales_return") return false;
    const item = v.items.find(i => i.productId === prodId);
    if (!item) return false;
    if (fromDate && v.date < fromDate) return false;
    if (toDate && v.date > toDate) return false;
    return true;
  });

  // Sắp xếp chứng từ tăng dần theo ngày
  filteredVouchers.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  let runningStock = initStock;

  filteredVouchers.forEach(v => {
    const item = v.items.find(i => i.productId === prodId);
    if (!item) return;

    if (v.type === "purchase") {
      runningStock += item.qty;
      html += `
        <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
          <td>${v.date}</td>
          <td class="font-numeric" style="color:var(--color-primary); cursor:pointer; font-weight:700;" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')">${v.id}</td>
          <td class="text-right font-numeric" style="color: var(--color-primary); font-weight:700;">+${item.qty}</td>
          <td class="text-right font-numeric">-</td>
          <td class="text-right font-numeric">${formatVND(item.price)} (Tồn: ${runningStock})</td>
        </tr>
      `;
    } else if (v.type === "purchase_return" || v.type === "sales_return") {
      runningStock += item.qty;
      html += `
        <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
          <td>${v.date}</td>
          <td class="font-numeric" style="color:var(--color-success); cursor:pointer; font-weight:700;" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')">${v.id}</td>
          <td class="text-right font-numeric" style="color: var(--color-success); font-weight:700;">+${item.qty}</td>
          <td class="text-right font-numeric">-</td>
          <td class="text-right font-numeric">${formatVND(item.price)} (Tồn: ${runningStock})</td>
        </tr>
      `;
    } else if (v.type === "sales") {
      runningStock -= item.qty;
      html += `
        <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
          <td>${v.date}</td>
          <td class="font-numeric" style="color:var(--color-success); cursor:pointer; font-weight:700;" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')">${v.id}</td>
          <td class="text-right font-numeric">-</td>
          <td class="text-right font-numeric" style="color: var(--color-warning); font-weight:700;">-${item.qty}</td>
          <td class="text-right font-numeric" style="color: var(--text-secondary);">${formatVND(item.cogsUnit || 0)} (Tồn: ${runningStock})</td>
        </tr>
      `;
    }
  });

  tbody.innerHTML = html;
}

// Xuất file Excel thẻ kho chi tiết cao cấp
function exportStockLedgerToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    const prodId = selectedLedgerProductId;
    if (!prodId) {
      showToast("Chưa chọn sản phẩm để xuất thẻ kho!", "warning");
      return;
    }
    const prod = state.products.find(p => String(p.id) === String(prodId));
    if (!prod) return;

    const fromDate = document.getElementById("search-ledger-from") ? document.getElementById("search-ledger-from").value : "";
    const toDate = document.getElementById("search-ledger-to") ? document.getElementById("search-ledger-to").value : "";

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
    const fntH = { name: "Times New Roman", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
    const fntB = { name: "Times New Roman", sz: 10, bold: true };
    const fntN = { name: "Times New Roman", sz: 10 };
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

    const headers = ["Ngày", "Số chứng từ", "Diễn giải", "Nhập (SL)", "Xuất (SL)", "Đơn giá", "Tồn kho"];
    const ncols = headers.length;

    // ROW 0: Tiêu đề lớn
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — SỔ THẺ KHO CHI TIẾT", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Tên sản phẩm
    sc(1, 0, `Sản phẩm: ${prod.name} (${prod.id}) — ĐVT: ${prod.unit || 'Cái'}`, 's', { font: fntB, alignment: cL });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } });

    // ROW 2: Khoảng thời gian
    let dateStr = "Thời gian: Toàn bộ";
    if (fromDate || toDate) {
      dateStr = `Thời gian: ${fromDate ? 'Từ ' + fromDate : ''} ${toDate ? 'Đến ' + toDate : ''}`;
    }
    sc(2, 0, dateStr, 's', { font: fntSub, alignment: cL });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: ncols - 1 } });

    // ROW 3: Khoảng trống

    // ROW 4: Headers
    headers.forEach((h, c) => sc(4, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    const origProd = DEFAULT_DATA.products.find(o => o.id === prodId);
    const initStock = origProd ? origProd.stock : (prod.initialStock || 0);
    const initCost = origProd ? origProd.avgCost : (prod.initialCost || 0);

    // ROW 5: Tồn đầu kỳ
    let rowIdx = 5;
    const bs = (al, bg) => ({ font: fntN, fill: bg, alignment: al, border: border4 });
    const ts = (al) => ({ font: fntB, fill: totBg, alignment: al, border: border4 });

    sc(rowIdx, 0, "01/01/2026", 's', bs(cC, null));
    sc(rowIdx, 1, "TỒN ĐẦU KỲ", 's', bs(cL, null));
    sc(rowIdx, 2, "Số dư đầu kỳ", 's', bs(cL, null));
    sc(rowIdx, 3, "-", 's', bs(cR, null));
    sc(rowIdx, 4, "-", 's', bs(cR, null));
    sc(rowIdx, 5, initCost, 'n', bs(cR, null), numFmt);
    sc(rowIdx, 6, initStock, 'n', bs(cR, null), "#,##0.##");
    rowIdx++;

    // DATA ROWS
    let filteredVouchers = state.vouchers.filter(v => {
      if (v.type !== "purchase" && v.type !== "sales" && v.type !== "purchase_return" && v.type !== "sales_return") return false;
      const item = v.items.find(i => i.productId === prodId);
      if (!item) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;
      return true;
    });

    filteredVouchers.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

    let runningStock = initStock;
    let totalImport = 0, totalExport = 0;

    filteredVouchers.forEach((v, idx) => {
      const item = v.items.find(i => i.productId === prodId);
      if (!item) return;

      const bg = idx % 2 === 0 ? null : altBg;

      sc(rowIdx, 0, v.date, 's', bs(cC, bg));
      sc(rowIdx, 1, v.id, 's', bs(cC, bg));
      sc(rowIdx, 2, v.description || (v.type === 'purchase' ? 'Nhập kho mua hàng' : (v.type === 'purchase_return' || v.type === 'sales_return') ? 'Nhập hàng trả lại' : 'Xuất kho bán hàng'), 's', bs(cL, bg));

      if (v.type === "purchase") {
        runningStock += item.qty;
        totalImport += item.qty;
        sc(rowIdx, 3, item.qty, 'n', bs(cR, bg), "#,##0.##");
        sc(rowIdx, 4, "-", 's', bs(cR, bg));
        sc(rowIdx, 5, item.price, 'n', bs(cR, bg), numFmt);
      } else if (v.type === "purchase_return" || v.type === "sales_return") {
        runningStock += item.qty;
        totalImport += item.qty;
        sc(rowIdx, 3, item.qty, 'n', bs(cR, bg), "#,##0.##");
        sc(rowIdx, 4, "-", 's', bs(cR, bg));
        sc(rowIdx, 5, item.price, 'n', bs(cR, bg), numFmt);
      } else {
        runningStock -= item.qty;
        totalExport += item.qty;
        sc(rowIdx, 3, "-", 's', bs(cR, bg));
        sc(rowIdx, 4, item.qty, 'n', bs(cR, bg), "#,##0.##");
        sc(rowIdx, 5, item.cogsUnit || 0, 'n', bs(cR, bg), numFmt);
      }

      sc(rowIdx, 6, runningStock, 'n', bs(cR, bg), "#,##0.##");
      rowIdx++;
    });

    // DÒNG TỔNG CỘNG
    sc(rowIdx, 0, "TỔNG CỘNG PHÁT SINH", 's', ts(cL));
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    sc(rowIdx, 3, totalImport, 'n', ts(cR), "#,##0.##");
    sc(rowIdx, 4, totalExport, 'n', ts(cR), "#,##0.##");
    sc(rowIdx, 5, "", 's', ts(cC));
    sc(rowIdx, 6, runningStock, 'n', ts(cR), "#,##0.##");

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
    ws['!rows'] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 20 }, { hpt: 12 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "The kho chi tiet");
    const outName = `The_kho_chi_tiet_${prodId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel thẻ kho: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel thẻ kho: ${err.message}`, "danger");
  }
}

// Xử lý nộp form Thêm mặt hàng mới
function handleProductSubmit(e) {
  e.preventDefault();

  const modal = document.getElementById("modal-add-product");
  if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
    return;
  }

  const idEl = document.getElementById("prod-id");
  let id = idEl ? idEl.value.trim().toUpperCase() : "";
  if (!id) {
    id = `SP${(state.products.length + 1).toString().padStart(3, '0')}`;
    if (idEl) idEl.value = id;
  }
  const name = document.getElementById("prod-name").value.trim();
  const unit = document.getElementById("prod-unit").value.trim();
  const initialStock = safeParseFloat(document.getElementById("prod-stock").value) || 0;
  const initialCost = parseInt(document.getElementById("prod-cost").value.replace(/\D/g, "")) || 0;
  const salePrice1 = parseInt(document.getElementById("prod-sale-price").value.replace(/\D/g, "")) || 0;
  const minStock = safeParseFloat(document.getElementById("prod-min-stock").value) || 0;

  const nature = document.getElementById("prod-nature").value;
  const group = document.getElementById("prod-group").value.trim();
  const inactive = document.getElementById("prod-inactive").checked;

  // Kiểm tra trùng mã
  if (state.products.some(p => String(p.id) === String(id))) {
    showToast(`Mã sản phẩm "${id}" đã tồn tại!`, "danger");
    return;
  }

  const newProduct = {
    id,
    name,
    unit,
    stock: initialStock,
    avgCost: initialCost,
    totalValue: initialStock * initialCost,
    initialStock, // Lưu giữ đầu kỳ để tính thẻ kho
    actualStock: initialStock,
    initialCost,
    salePrice1,
    minStock,
    nature,
    group,
    inactive
  };

  // Tạo excelRow ngay cho sản phẩm mới (tự động phân bổ Tài khoản & Kho theo chuẩn VN)
  ensureProductExcelRow(newProduct);

  // Cập nhật cả số dư đầu kỳ trong tài khoản 156 của Bảng Cân đối
  state.products.push(newProduct);

  // Cộng dồn giá trị sản phẩm vào Số dư đầu kỳ tài khoản 156
  let newInvOpBal = 0;
  state.products.forEach(p => {
    // Nếu sản phẩm có trong mặc định, nó đã được cộng, ta lấy thực tế
    const orig = DEFAULT_DATA.products.find(o => o.id === p.id);
    newInvOpBal += orig ? orig.totalValue : ((p.initialStock || 0) * (p.initialCost || 0));
  });
  state.initialBalances["156"].balance = newInvOpBal;

  // Cân đối lại vốn góp TK 411 để tổng Nợ = tổng Có
  rebalanceEquity();

  saveState();
  recalculateAccounting();

  closeModal("modal-add-product");
  showToast(`Khai báo mặt hàng "${name}" thành công!`, "success");

  // Reset form
  document.getElementById("form-product").reset();

  // Cập nhật lại cache datalist gợi ý của hóa đơn
  cacheProductOptions();

  // Vẽ lại bảng tồn kho nếu đang xem tab tồn kho
  if (typeof renderInventoryTable === "function") {
    renderInventoryTable();
  }
}

// Bắt lỗi runtime không được xử lý
window.onerror = function (message, source, lineno, colno, error) {
  const errMsg = `${message} tại ${source}:${lineno}:${colno}`;
  addErrorLog("Global Runtime Error", errMsg, error);
  return false;
};

// Bắt lỗi Promise bị Reject mà không được catch
window.onunhandledrejection = function (event) {
  const reason = event.reason;
  const errMsg = reason ? (reason.message || String(reason)) : "Unhandled Promise Rejection";
  addErrorLog("Unhandled Promise", errMsg, reason instanceof Error ? reason : null);
};

window.promptQuickImport = promptQuickImport;
window.handleQuickImportSubmit = handleQuickImportSubmit;
window.promptEditProductPrice = promptEditProductPrice;
window.handleEditProductPriceSubmit = handleEditProductPriceSubmit;

// ==========================================================================
// CÁC CHỨC NĂNG QUẢN LÝ KHO HÀNG MỞ RỘNG (EXTENDED INVENTORY MANAGEMENT)
// ==========================================================================
function promptQuickImport(productId) {
  try {
    console.log("promptQuickImport called with:", productId);
    const p = state.products.find(x => String(x.id) === String(productId));
    if (!p) {
      if (typeof addErrorLog === "function") {
        addErrorLog("promptQuickImport", `Không tìm thấy sản phẩm với mã: ${productId}`);
      }
      showToast(`Không tìm thấy sản phẩm với mã: ${productId}`, "danger");
      return;
    }

    document.getElementById("quick-import-prod-id").value = p.id;
    document.getElementById("quick-import-info-text").innerHTML = `
      <strong>Mã hàng:</strong> ${p.id}<br>
      <strong>Tên hàng:</strong> ${p.name}<br>
      <strong>ĐVT:</strong> ${p.unit || "Cái"}<br>
      <strong>Tồn kho hiện tại:</strong> <span style="font-weight:bold; color:var(--color-primary);">${p.stock || 0}</span>
    `;

    document.getElementById("quick-import-qty").value = "";
    document.getElementById("quick-import-price").value = Number(p.avgCost || p.initialCost || 0).toLocaleString("vi-VN");

    openModal("modal-quick-import");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptQuickImport", err.message, err);
    }
  }
}

function handleQuickImportSubmit(e) {
  try {
    e.preventDefault();

    const prodId = document.getElementById("quick-import-prod-id").value;
    const qty = safeParseFloat(document.getElementById("quick-import-qty").value) || 0;
    const price = parseInt(document.getElementById("quick-import-price").value.replace(/\D/g, "")) || 0;

    if (qty <= 0 || price < 0) {
      showToast("Số lượng nhập phải lớn hơn 0 và Đơn giá phải lớn hơn hoặc bằng 0đ!", "danger");
      return;
    }

    const p = state.products.find(x => String(x.id) === String(prodId));
    if (!p) return;

    // Tìm nhà cung cấp đầu tiên hoặc dùng mặc định
    const supplier = state.partners.find(x => x.type === "supplier") || { id: "NCC001", name: "Nhà cung cấp vãng lai" };

    // Tạo mã chứng từ nhập kho nhanh
    const quickId = "PNK-Q" + Math.floor(1000 + Math.random() * 9000);
    const amount = qty * price;

    // Tạo phiếu nhập kho
    const voucher = {
      id: quickId,
      type: "purchase",
      date: new Date().toISOString().slice(0, 10),
      partnerId: supplier.id,
      partnerName: supplier.name,
      paymentMethod: "331", // Nợ TK 156 / Có TK 331
      description: `Nhập kho nhanh hàng hóa: ${p.name} (Số lượng: ${qty})`,
      amount: amount,
      totalAmount: amount,
      taxRate: 0,
      taxAmount: 0,
      isManual: true,
      _sessionId: clientSessionId,
      items: [
        {
          productId: p.id,
          qty: qty,
          price: price,
          amount: amount
        }
      ],
      entries: [
        {
          debit: "156",
          credit: "331",
          amount: amount,
          desc: `Nhập kho nhanh mặt hàng ${p.id}`
        }
      ]
    };

    state.vouchers.push(voucher);

    saveState();
    recalculateAccounting();
    closeModal("modal-quick-import");
    showToast(`Nhập nhanh ${qty} ${p.unit || 'Cái'} hàng ${p.name} thành công!`, "success");

    // Vẽ lại bảng tồn kho và thẻ kho
    renderInventoryTable();
    populateProductLedgerDropdown();
    renderStockLedger();
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("handleQuickImportSubmit", err.message, err);
    }
  }
}

function promptEditProductPrice(productId) {
  try {
    console.log("promptEditProductPrice called with:", productId);
    const p = state.products.find(x => String(x.id) === String(productId));
    if (!p) {
      if (typeof addErrorLog === "function") {
        addErrorLog("promptEditProductPrice", `Không tìm thấy sản phẩm với mã: ${productId}`);
      }
      showToast(`Không tìm thấy sản phẩm với mã: ${productId}`, "danger");
      return;
    }

    // Đảm bảo có excelRow đầy đủ
    ensureProductExcelRow(p);

    const formatNum = (v) => v !== undefined && v !== null && !isNaN(v) ? Number(v).toLocaleString("vi-VN") : "0";

    document.getElementById("edit-prod-id").value = p.id;
    document.getElementById("edit-prod-id-display").value = p.id;
    document.getElementById("edit-prod-name").value = p.name;
    document.getElementById("edit-prod-unit").value = p.unit || "Cái";

    const initialCostVal = p.initialCost !== undefined ? p.initialCost : (p.avgCost || 0);
    const initialStockVal = p.initialStock !== undefined ? p.initialStock : (p.stock || 0);
    const avgCostVal = p.avgCost || 0;
    const minStockVal = p.minStock || 5;
    const salePrice1Val = p.salePrice1 !== undefined ? p.salePrice1 : (p.excelRow && p.excelRow[21] !== undefined ? Number(p.excelRow[21]) : 0);

    document.getElementById("edit-prod-initial-cost").value = formatNum(initialCostVal);
    document.getElementById("edit-prod-initial-stock").value = formatNum(initialStockVal);
    document.getElementById("edit-prod-avg-cost").value = formatNum(avgCostVal);
    document.getElementById("edit-prod-min-stock").value = formatNum(minStockVal);
    document.getElementById("edit-prod-sale-price").value = formatNum(salePrice1Val);

    document.getElementById("edit-prod-nature").value = p.nature || p.excelRow[2] || "Vật tư hàng hóa";
    document.getElementById("edit-prod-group").value = p.group || p.excelRow[3] || "";

    const isInactive = p.inactive || p.excelRow[30] === 1 || p.excelRow[30] === "1" || p.excelRow[30] === "True" || p.excelRow[30] === "true" || p.excelRow[30] === true;
    document.getElementById("edit-prod-inactive").checked = !!isInactive;

    openModal("modal-edit-product-price");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptEditProductPrice", err.message, err);
    }
  }
}

function handleEditProductPriceSubmit(e) {
  try {
    e.preventDefault();

    const prodId = document.getElementById("edit-prod-id").value;
    const name = document.getElementById("edit-prod-name").value.trim();
    const unit = document.getElementById("edit-prod-unit").value.trim();

    const initialCost = parseInt(document.getElementById("edit-prod-initial-cost").value.replace(/\D/g, "")) || 0;
    const initialStock = safeParseFloat(document.getElementById("edit-prod-initial-stock").value) || 0;
    const avgCost = parseInt(document.getElementById("edit-prod-avg-cost").value.replace(/\D/g, "")) || 0;
    const minStock = safeParseFloat(document.getElementById("edit-prod-min-stock").value) || 0;
    const salePrice1 = parseInt(document.getElementById("edit-prod-sale-price").value.replace(/\D/g, "")) || 0;

    const nature = document.getElementById("edit-prod-nature").value;
    const group = document.getElementById("edit-prod-group").value.trim();
    const inactive = document.getElementById("edit-prod-inactive").checked;

    if (!name || !unit) {
      showToast("Vui lòng điền đầy đủ Tên sản phẩm và Đơn vị tính!", "danger");
      return;
    }

    const p = state.products.find(x => String(x.id) === String(prodId));
    if (!p) return;

    p.name = name;
    p.unit = unit;
    p.initialCost = initialCost;
    p.initialStock = initialStock;
    p.actualStock = initialStock;
    p.avgCost = avgCost;
    p.minStock = minStock;
    p.salePrice1 = salePrice1;

    p.nature = nature;
    p.group = group;
    p.inactive = inactive;

    // Cập nhật giá trị tồn ban đầu
    p.stock = initialStock;
    p.totalValue = initialStock * initialCost;

    // Đồng bộ vào excelRow
    ensureProductExcelRow(p);

    saveState();
    recalculateAccounting();
    closeModal("modal-edit-product-price");
    showToast(`Đã cập nhật thông tin và đơn giá sản phẩm ${p.id} thành công!`, "success");

    // Vẽ lại bảng tồn kho và thẻ kho
    renderInventoryTable();
    populateProductLedgerDropdown();
    renderStockLedger();
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("handleEditProductPriceSubmit", err.message, err);
    }
  }
}

function toggleSelectAllProducts(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".product-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchProductsUI();
}

function updateBatchProductsUI() {
  const checkboxes = document.querySelectorAll(".product-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-products");
  const count = document.getElementById("selected-products-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-products");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteProducts() {
  const checked = Array.from(document.querySelectorAll(".product-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} sản phẩm đã chọn? Các chứng từ liên quan có thể bị ảnh hưởng.`)) {
    const idsToDelete = checked.map(cb => cb.value);
    state.products = state.products.filter(p => !idsToDelete.includes(p.id));

    const master = document.getElementById("check-all-products");
    if (master) master.checked = false;

    updateBatchProductsUI();
    showToast(`Đã xóa thành công ${checked.length} sản phẩm!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
  }
}

function clearAllProducts() {
  if (confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ sản phẩm trong kho hàng? Tất cả sản phẩm, số lượng tồn và giá trị tồn sẽ bị xóa sạch.")) {
    if (confirm("Xác nhận lại một lần nữa: Hành động này không thể hoàn tác. Bạn thực sự muốn xóa sạch toàn bộ sản phẩm?")) {
      const idsToDelete = state.products.map(p => p.id);
      trackDeletedIds(idsToDelete);
      state.products = [];
      // Cập nhật số dư tài khoản 156 về 0
      if (state.initialBalances && state.initialBalances["156"]) {
        state.initialBalances["156"].balance = 0;
      }
      if (typeof rebalanceEquity === "function") rebalanceEquity();

      showToast("Đã xóa sạch toàn bộ sản phẩm trong kho hàng!", "warning");

      // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
      setTimeout(() => {
        saveState();
        recalculateAccounting();
      }, 0);
    }
  }
}
window.clearAllProducts = clearAllProducts;

function deleteProduct(prodId) {
  if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${prodId}"? Dữ liệu tồn kho liên quan có thể bị ảnh hưởng.`)) {
    trackDeletedIds([prodId]);
    state.products = state.products.filter(p => p.id !== prodId);
    showToast(`Đã xóa sản phẩm ${prodId}!`, "success");

    // Trì hoãn công việc nặng sang frame tiếp theo để tránh brick UI
    setTimeout(() => {
      saveState();
      recalculateAccounting();
    }, 0);
  }
}

// Quản lý hiển thị tab con của Kho hàng
function switchInventorySubTab(subTabId) {
  // Update buttons active class
  const btnSummary = document.getElementById("tab-btn-inventory-summary");
  const btnLedger = document.getElementById("tab-btn-inventory-ledger");
  if (btnSummary && btnLedger) {
    if (subTabId === "summary") {
      btnSummary.classList.add("active");
      btnLedger.classList.remove("active");
    } else {
      btnSummary.classList.remove("active");
      btnLedger.classList.add("active");
    }
  }

  // Update panels display
  const panelSummary = document.getElementById("inventory-subtab-summary");
  const panelLedger = document.getElementById("inventory-subtab-ledger");
  if (panelSummary && panelLedger) {
    if (subTabId === "summary") {
      panelSummary.style.display = "block";
      panelLedger.style.display = "none";
    } else {
      panelSummary.style.display = "none";
      panelLedger.style.display = "block";
      // Render stock ledger when switching to it, in case it wasn't rendered
      renderStockLedger();
    }
  }
}

// Chuyển sang thẻ kho chi tiết cho một sản phẩm cụ thể
// Fix: Đồng bộ biến selectedLedgerProductId, reset ô tìm kiếm, render và scroll đến đúng mặt hàng bên cột trái
function viewStockLedgerForProduct(productId) {
  // Bước 1: Chuyển sang tab Kho hàng trước
  switchTab("inventory");

  // Bước 2: Chuyển sang thẻ kho chi tiết trước
  switchInventorySubTab("ledger");

  // Bước 2: Thiết lập sản phẩm được chọn
  selectedLedgerProductId = productId;

  // Bước 3: Reset từ khóa tìm kiếm sản phẩm để chắc chắn hiển thị sản phẩm được chọn
  const searchInput = document.getElementById("search-ledger-products");
  if (searchInput) {
    searchInput.value = "";
  }

  // Bước 4: Chờ DOM hiển thị và render danh sách bên cột trái cùng dữ liệu chi tiết bên cột phải
  requestAnimationFrame(() => {
    renderLedgerProductList();
    renderStockLedger();

    // Bước 5: Tự động cuộn danh sách cột trái đến phần tử được chọn
    const container = document.getElementById("ledger-product-list");
    if (container) {
      const items = container.querySelectorAll(".ledger-product-item");
      for (const item of items) {
        if (item.getAttribute("onclick") && item.getAttribute("onclick").includes(productId)) {
          item.scrollIntoView({ block: "nearest", behavior: "smooth" });
          break;
        }
      }
    }

    // Bước 6: Cuộn bảng chi tiết (cột phải) lên đầu để dễ theo dõi
    const ledgerBody = document.getElementById("stock-ledger-body");
    if (ledgerBody) {
      const parentTable = ledgerBody.closest(".table-responsive");
      if (parentTable) {
        parentTable.scrollTo(0, 0);
      }
    }
  });
}

// Đăng ký toàn cục các hàm
window.switchInventorySubTab = switchInventorySubTab;
window.viewStockLedgerForProduct = viewStockLedgerForProduct;
window.selectLedgerProduct = selectLedgerProduct;

// ==========================================================================
// THÊM NHANH MẶT HÀNG TỪ MODAL BÁN HÀNG
// ==========================================================================

/**
 * Mở modal thêm nhanh mặt hàng, reset form và focus vào ô tên
 */
function openQuickAddProductModal() {
  // Reset form
  const form = document.getElementById("form-quick-add-product");
  if (form) form.reset();
  const unitEl = document.getElementById("qap-prod-unit");
  if (unitEl) unitEl.value = "Cái";
  const stockEl = document.getElementById("qap-prod-stock");
  if (stockEl) stockEl.value = "0";
  const costEl = document.getElementById("qap-prod-cost");
  if (costEl) costEl.value = "0";

  openModal("modal-quick-add-product");

  // Focus vào ô tên sau khi modal hiển thị
  setTimeout(() => {
    const nameEl = document.getElementById("qap-prod-name");
    if (nameEl) nameEl.focus();
  }, 120);
}

/**
 * Xử lý submit form thêm nhanh mặt hàng:
 * 1. Xác thực và tạo object sản phẩm
 * 2. Lưu vào state và push lên cloud ngay
 * 3. Điền mã sản phẩm vào ô cuối cùng của bảng bán hàng
 * 4. Cập nhật datalist để autocomplete biết mặt hàng mới
 */
function handleQuickAddProductSubmit(e) {
  try {
    e.preventDefault();

    const modal = document.getElementById("modal-quick-add-product");
    if (modal && (modal.style.display === "none" || window.getComputedStyle(modal).display === "none")) {
      return;
    }

    const idEl = document.getElementById("qap-prod-id");
    let rawId = idEl ? idEl.value.trim().toUpperCase() : "";
    const name = document.getElementById("qap-prod-name").value.trim();
    const unit = document.getElementById("qap-prod-unit").value.trim();
    const initStock = safeParseFloat(document.getElementById("qap-prod-stock").value) || 0;
    const initCost = parseInt(document.getElementById("qap-prod-cost").value.replace(/\D/g, "")) || 0;

    if (!name) {
      showToast("Vui lòng nhập tên mặt hàng!", "danger");
      return;
    }
    if (!unit) {
      showToast("Vui lòng nhập đơn vị tính!", "danger");
      return;
    }

    // Sinh mã tự động nếu để trống
    if (!rawId) {
      rawId = `SP${(state.products.length + 1).toString().padStart(3, '0')}`;
      if (idEl) idEl.value = rawId;
    }
    const newId = rawId;

    // Kiểm tra trùng mã
    if (state.products.some(p => String(p.id) === String(newId))) {
      showToast(`Mã mặt hàng “${newId}” đã tồn tại! Vui lòng dùng mã khác.`, "danger");
      document.getElementById("qap-prod-id").focus();
      return;
    }

    const newProduct = {
      id: newId,
      name,
      unit,
      stock: initStock,
      avgCost: initCost,
      totalValue: initStock * initCost,
      initialStock: initStock,
      actualStock: initStock,
      initialCost: initCost,
      minStock: 5,
      _updatedAt: Date.now()
    };

    // Lưu vào state
    state.products.push(newProduct);

    // Cập nhật số dư đầu kỳ TK 156
    let newInvOpBal = 0;
    state.products.forEach(p => {
      const orig = (typeof DEFAULT_DATA !== 'undefined' && DEFAULT_DATA.products)
        ? DEFAULT_DATA.products.find(o => o.id === p.id)
        : null;
      newInvOpBal += orig ? orig.totalValue : (p.initialStock * p.initialCost);
    });
    if (state.initialBalances && state.initialBalances["156"]) {
      state.initialBalances["156"].balance = newInvOpBal;
    }

    if (typeof rebalanceEquity === "function") rebalanceEquity();
    state._lastModified = Date.now();
    saveState(); // Lưu local + push cloud
    recalculateAccounting();
    if (typeof populateDatalistProducts === "function") populateDatalistProducts();

    // Điền mã sản phẩm vào ô cuối cùng của bảng bán hàng
    const salesRows = document.querySelectorAll("#sales-form-items-body tr");
    if (salesRows.length === 0) {
      // Chưa có dòng nào → thêm mới
      addSalesFormRow(newId);
    } else {
      // Điền vào dòng cuối cùng
      const lastRow = salesRows[salesRows.length - 1];
      const productInput = lastRow.querySelector(".item-productId");
      if (productInput) {
        // Nếu dòng cuối chưa có sản phẩm → điền vào đó
        if (!productInput.value || productInput.value.trim() === "") {
          productInput.value = newId;
          autoFillProductPrice(productInput);
        } else {
          // Dòng cuối đã có sản phẩm → thêm dòng mới
          addSalesFormRow(newId);
        }
      }
    }

    closeModal("modal-quick-add-product");
    showToast(`Đã thêm mặt hàng “${name}” (${newId}) và điền vào hóa đơn!`, "success");
  } catch (err) {
    if (typeof addErrorLog === "function") addErrorLog("handleQuickAddProductSubmit", err.message, err);
    showToast("Lỗi khi thêm mặt hàng: " + err.message, "danger");
  }
}

window.openQuickAddProductModal = openQuickAddProductModal;
window.handleQuickAddProductSubmit = handleQuickAddProductSubmit;
window.filterLedgerProducts = filterLedgerProducts;
window.exportStockLedgerToExcel = exportStockLedgerToExcel;
window.toggleSelectAllProducts = toggleSelectAllProducts;
window.updateBatchProductsUI = updateBatchProductsUI;
window.batchDeleteProducts = batchDeleteProducts;
window.deleteProduct = deleteProduct;



// Inventory Page Controls
window.changeInventoryPage = changeInventoryPage;





// --- PHÂN HỆ KIỂM TRA & TỰ ĐỘNG CẬP NHẬT PHẦN MỀM ---
let appLocalVersion = "1.0.0";
let remoteVersionGlobal = "";

// Hiển thị hộp thoại cập nhật: mời tải bộ cài mới
function showAutoUpdateOverlay(version, downloadUrl) {
  let overlay = document.getElementById("auto-update-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "auto-update-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: rgba(11, 15, 25, 0.96);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div style="background:#0f172a; border:1px solid #334155; border-radius:16px; padding:40px 48px; max-width:480px; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.6);">
      <div style="width:64px;height:64px;background:linear-gradient(135deg,#10b981,#0ea5e9);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;">
        🚀
      </div>
      <h2 style="font-size:22px;font-weight:800;color:#10b981;margin-bottom:10px;">
        Phát hiện phiên bản mới <span style="color:#fff">v${version}</span>
      </h2>
      <p style="font-size:14px;color:#94a3b8;line-height:1.7;margin-bottom:28px;">
        Bản cài đặt v${version} đã sẵn sàng trên máy chủ phát hành. Nhấp nút bên dưới để tự động tải về và cài đặt nâng cấp ngay lập tức!
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button
          onclick="document.getElementById('auto-update-overlay').style.display='none'; triggerUpdateFlow();"
          style="padding:12px 28px;background:linear-gradient(135deg,#10b981,#0ea5e9);border:none;color:#fff;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">
          ⚡ Cập nhật Tự động Ngay
        </button>
        <button
          onclick="document.getElementById('auto-update-overlay').style.display='none'"
          style="padding:12px 24px;background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          Bỏ qua
        </button>
      </div>
    </div>
  `;
  overlay.style.display = "flex";
}

// Tự động kiểm tra phiên bản cục bộ khi khởi động (nếu chạy Electron)
async function initLocalVersionDisplay() {
  const displayEl = document.getElementById("display-local-version");
  const cardEl = document.getElementById("card-auto-update");
  const brandDisplayEl = document.getElementById("brand-version-display");

  if (window.electronAPI && typeof window.electronAPI.getLocalVersion === "function") {
    try {
      appLocalVersion = await window.electronAPI.getLocalVersion();
      if (displayEl) displayEl.innerText = `v${appLocalVersion}`;
      if (brandDisplayEl) brandDisplayEl.innerText = `RD Accounting v${appLocalVersion}`;
      if (cardEl) cardEl.style.display = "flex"; // Hiện card cập nhật trên Desktop App
    } catch (e) {
      console.error("Lỗi lấy phiên bản từ Electron:", e);
    }
  } else {
    // Nếu chạy trên trình duyệt web thông thường, ẩn thẻ kiểm tra cập nhật
    if (cardEl) cardEl.style.display = "none";
    if (brandDisplayEl) brandDisplayEl.innerText = `RD Accounting v${appLocalVersion}`;
  }
}

// Hàm kiểm tra cập nhật từ GitHub
async function checkForUpdates(manual = false) {
  const statusContainer = document.getElementById("update-status-container");
  if (!statusContainer) return;

  statusContainer.style.display = "block";
  statusContainer.style.background = "rgba(245, 158, 11, 0.1)";
  statusContainer.style.color = "var(--color-warning)";
  statusContainer.innerText = "Đang kiểm tra máy chủ cập nhật...";

  if (!window.electronAPI) {
    statusContainer.style.background = "rgba(239, 68, 68, 0.1)";
    statusContainer.style.color = "var(--color-danger)";
    statusContainer.innerText = "Chỉ hỗ trợ cập nhật tự động khi chạy Desktop App.";
    return;
  }

  try {
    // 1. Tải file package.json bằng cơ chế Fallback Cascade (tránh bị chặn DNS/ISP tại Việt Nam)
    const urls = [
      { type: "api", url: `https://api.github.com/repos/btduy13/RD/contents/package.json?t=${Date.now()}` },
      { type: "raw", url: `https://raw.githubusercontent.com/btduy13/RD/main/package.json?t=${Date.now()}` },
      { type: "cdn", url: `https://cdn.jsdelivr.net/gh/btduy13/RD@main/package.json?t=${Date.now()}` }
    ];

    let response = null;
    let isPrivateRepo = false;
    let lastError = null;
    let fetchedUrlObj = null;

    for (const urlObj of urls) {
      try {
        // Sử dụng timeout 15 giây để đảm bảo kết nối thành công ngay cả khi mạng chậm/bị bóp băng thông
        response = await fetch(urlObj.url, { signal: AbortSignal.timeout(15000) });
        if (response) {
          if (response.ok) {
            fetchedUrlObj = urlObj;
            break;
          } else if (response.status === 404) {
            isPrivateRepo = true; // Phát hiện kho lưu trữ riêng tư/bảo mật
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`Thất bại khi lấy dữ liệu cập nhật từ ${urlObj.url}:`, err.message);
      }
    }

    // 1. Xử lý trường hợp Kho lưu trữ Riêng tư / Bảo mật (Trả về 404)
    if (isPrivateRepo && (!response || !response.ok)) {
      statusContainer.style.background = "rgba(16, 185, 129, 0.1)";
      statusContainer.style.color = "var(--color-success)";
      statusContainer.innerText = `Hệ thống bảo mật (Private Repo). Phiên bản hiện tại v${appLocalVersion} là mới nhất.`;
      if (manual) {
        showToast(`Bản cài đặt bảo mật v${appLocalVersion} đã tối ưu!`, "success");
      }
      return;
    }

    // 2. Xử lý lỗi kết nối thực tế
    if (!response || !response.ok) {
      throw new Error("Không thể kết nối máy chủ cập nhật (Mạng chập chờn hoặc bị chặn bởi ISP).");
    }

    let remoteVersion = null;
    if (fetchedUrlObj && fetchedUrlObj.type === "api") {
      const apiData = await response.json();
      if (apiData && apiData.content) {
        // Giải mã base64 từ API Contents
        const decodedContent = atob(apiData.content.replace(/\s/g, ''));
        const remotePkg = JSON.parse(decodedContent);
        remoteVersion = remotePkg.version;
      }
    } else {
      const remotePkg = await response.json();
      remoteVersion = remotePkg.version;
    }

    if (!remoteVersion) throw new Error("File cấu hình cập nhật không hợp lệ.");
    remoteVersionGlobal = remoteVersion;

    // Hàm so sánh phiên bản (semver đơn giản)
    const isNewer = compareVersions(remoteVersion, appLocalVersion) > 0;

    if (isNewer) {
      statusContainer.style.background = "rgba(16, 185, 129, 0.1)";
      statusContainer.style.color = "var(--color-success)";
      statusContainer.innerHTML = `Phát hiện phiên bản mới: <span style="font-weight:800; text-decoration:underline;">v${remoteVersion}</span>!<br><button class="btn btn-success btn-sm" onclick="triggerUpdateFlow()" style="margin-top: 8px; width: 100%; font-size:11px; padding: 4px 8px;">Cập nhật Tự động Ngay</button>`;

      // Nếu là tự động kiểm tra khi mở app và phát hiện bản mới, tự động chạy luồng cập nhật
      if (!manual) {
        showToast(`Tự động cập nhật lên bản mới v${remoteVersion}...`, "success");
        setTimeout(() => {
          triggerUpdateFlow(true);
        }, 1000);
      } else {
        showToast(`Phát hiện bản cập nhật mới v${remoteVersion}!`, "success");
      }
    } else {
      statusContainer.style.background = "rgba(255, 255, 255, 0.05)";
      statusContainer.style.color = "var(--text-secondary)";
      statusContainer.innerText = `Ứng dụng đang ở phiên bản mới nhất (v${appLocalVersion})`;
    }
  } catch (err) {
    statusContainer.style.background = "rgba(239, 68, 68, 0.1)";
    statusContainer.style.color = "var(--color-danger)";
    statusContainer.innerText = "Lỗi kiểm tra cập nhật: " + err.message;
    console.error("Check update error:", err);
  }
}

// So sánh 2 phiên bản dạng x.y.z
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// Kích hoạt tiến trình cập nhật: mở trang tải bộ cài mới
// Helper lấy URL tải file .exe từ danh sách Release assets
async function getReleaseAssetUrl(version) {
  try {
    // Sử dụng timeout 10 giây để tránh bị treo vô hạn nếu kết nối đến GitHub API bị chặn/bóp băng thông
    const response = await fetch(`https://api.github.com/repos/btduy13/RD/releases`, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const releases = await response.json();
      // Tìm release có tag_name khớp với v1.4.0 hoặc tương đương
      const release = releases.find(r => r.tag_name === `v${version}` || r.tag_name === version || r.tag_name?.includes(version));
      if (release && release.assets && release.assets.length > 0) {
        const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
        if (exeAsset) {
          return exeAsset.browser_download_url;
        }
      }
    }
  } catch (err) {
    console.error("Lỗi lấy assets qua Releases API:", err);
  }
  // URL mặc định dự phòng nếu API GitHub quá giới hạn
  return `https://github.com/btduy13/RD/releases/download/v${version}/Kế toán Rạng Đông Setup ${version}.exe`;
}

// Giao diện hiển thị Tiến trình tải về (Progress bar) trực quan
function showDownloadProgressOverlay(version, downloadUrl) {
  let overlay = document.getElementById("auto-update-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "auto-update-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: rgba(11, 15, 25, 0.96);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";

  overlay.innerHTML = `
    <div style="background:#0f172a; border:1px solid #334155; border-radius:16px; padding:40px 48px; width:440px; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.6);">
      <div id="progress-spinner" style="width:48px;height:48px;border:4px solid #1e293b;border-top-color:#10b981;border-radius:50%;margin:0 auto 20px;animation:spin 1s linear infinite;"></div>
      <h2 style="font-size:20px;font-weight:800;color:#fff;margin-bottom:12px;" id="progress-title">
        Đang tải bản cập nhật v${version}
      </h2>
      <p style="font-size:13.5px;color:#94a3b8;line-height:1.6;margin-bottom:24px;" id="progress-subtitle">
        Vui lòng giữ ứng dụng mở. Trình cài đặt nâng cấp sẽ tự động khởi động sau khi tải xong.
      </p>
      
      <!-- Progress Bar Container -->
      <div style="width:100%; height:8px; background:#1e293b; border-radius:4px; overflow:hidden; margin-bottom:12px; border:1px solid #334155;">
        <div id="progress-bar-fill" style="width:0%; height:100%; background:linear-gradient(90deg,#10b981,#0ea5e9); transition:width 0.1s ease; border-radius:4px;"></div>
      </div>
      
      <div style="font-size:14px; font-weight:700; color:#10b981; margin-bottom:20px;" id="progress-percent">0%</div>
      
      <button id="progress-cancel-btn"
        onclick="document.getElementById('auto-update-overlay').style.display='none'"
        style="padding:10px 20px;background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
        Hủy
      </button>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;

  // Lắng nghe sự kiện phần trăm tải về từ Electron
  if (window.electronAPI && typeof window.electronAPI.onDownloadProgress === "function") {
    window.electronAPI.onDownloadProgress((percent) => {
      const bar = document.getElementById("progress-bar-fill");
      const percentText = document.getElementById("progress-percent");
      if (bar) bar.style.width = `${percent}%`;
      if (percentText) percentText.innerText = `${percent}%`;

      if (percent >= 100) {
        const spinner = document.getElementById("progress-spinner");
        const title = document.getElementById("progress-title");
        const subtitle = document.getElementById("progress-subtitle");
        const cancelBtn = document.getElementById("progress-cancel-btn");

        if (spinner) spinner.style.borderTopColor = "#0ea5e9";
        if (title) title.innerText = "Đang khởi chạy bộ cài đặt...";
        if (subtitle) subtitle.innerText = "Phần mềm sẽ tự đóng để thực hiện cập nhật ghi đè an toàn.";
        if (cancelBtn) cancelBtn.style.display = "none";
      }
    });
  }

  // Gọi IPC kích hoạt tải về trong tiến trình chính
  window.electronAPI.downloadAndInstallUpdate(downloadUrl).then((result) => {
    if (result && !result.ok) {
      showToast("Lỗi khi tải bản cập nhật: " + result.error, "danger");
      overlay.style.display = "none";
    }
  });
}

// Kích hoạt tiến trình cập nhật: tải trực tiếp hoặc mở trang tải
async function triggerUpdateFlow(auto = false) {
  const statusContainer = document.getElementById("update-status-container");

  if (auto) {
    // Tự động kiểm tra lúc mở app -> chỉ hiện popup mời tải
    showAutoUpdateOverlay(remoteVersionGlobal || "mới");
    return;
  }

  // Nếu chạy trên Electron Desktop App và hỗ trợ tải trực tiếp
  if (window.electronAPI && typeof window.electronAPI.downloadAndInstallUpdate === "function") {
    try {
      if (statusContainer) {
        statusContainer.style.background = "rgba(245, 158, 11, 0.1)";
        statusContainer.style.color = "var(--color-warning)";
        statusContainer.innerText = "Đang liên kết với kho lưu trữ để tải bản cài mới...";
      }

      const assetUrl = await getReleaseAssetUrl(remoteVersionGlobal);
      showDownloadProgressOverlay(remoteVersionGlobal, assetUrl);
    } catch (err) {
      showToast("Lỗi chuẩn bị tiến trình tải: " + err.message, "danger");
    }
    return;
  }

  // Fallback nếu chạy ở trình duyệt: mở trang Releases
  const fallbackUrl = `https://github.com/btduy13/RD/releases/latest`;
  try {
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(fallbackUrl);
    } else {
      window.open(fallbackUrl, '_blank');
    }
    showToast(`Đã mở trang tải bộ cài phiên bản mới v${remoteVersionGlobal}`, "success");
  } catch (err) {
    showToast("Mở trình duyệt thất bại: " + err, "danger");
  }
}
// Đăng ký toàn cục các hàm phục vụ cập nhật
window.renderInventoryTable = renderInventoryTable;
window.initLocalVersionDisplay = initLocalVersionDisplay;
window.checkForUpdates = checkForUpdates;
window.triggerUpdateFlow = triggerUpdateFlow;