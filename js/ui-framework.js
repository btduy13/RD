
// Quản lý trạng thái vẽ lại (Lazy Rendering)
let tabDirtyStates = {
  dashboard: true,
  purchase: true,
  sales: true,
  inventory: true,
  escrow: true,
  reports: true,
  partners: true,
  debts: true,
  cash: true,
  settings: true
};

function markAllTabsDirty() {
  for (const key in tabDirtyStates) {
    tabDirtyStates[key] = true;
  }
}

function renderTabIfNeeded(tabId) {
  if (!tabDirtyStates[tabId]) return;

  try {
    if (tabId === "dashboard") {
      renderDashboard();
    } else if (tabId === "purchase") {
      const btnOrder = document.getElementById("tab-btn-purchase-order");
      const btnReturn = document.getElementById("tab-btn-purchase-return");
      if (btnOrder && btnOrder.classList.contains("active")) {
        if (typeof renderPurchaseOrderTable === "function") renderPurchaseOrderTable();
      } else if (btnReturn && btnReturn.classList.contains("active")) {
        if (typeof renderPurchaseReturnTable === "function") renderPurchaseReturnTable();
      } else {
        if (typeof renderPurchaseTable === "function") renderPurchaseTable();
      }
    } else if (tabId === "sales") {
      const btnReturn = document.getElementById("tab-btn-sales-return");
      const btnQuotation = document.getElementById("tab-btn-sales-quotation");
      if (btnReturn && btnReturn.classList.contains("active")) {
        if (typeof renderSalesReturnTable === "function") renderSalesReturnTable();
      } else if (btnQuotation && btnQuotation.classList.contains("active")) {
        if (typeof renderQuotationTable === "function") renderQuotationTable();
      } else {
        renderSalesTable();
      }
    } else if (tabId === "inventory") {
      populateProductLedgerDropdown();
      renderInventoryTable();
      renderStockLedger();
    } else if (tabId === "escrow") {
      renderEscrowTable();
    } else if (tabId === "reports") {
      populateReportAccountDropdown();
      generateReport();
    } else if (tabId === "partners") {
      filterPartners();
    } else if (tabId === "debts") {
      filterDebts();
    } else if (tabId === "cash") {
      filterCash();
      recalculateCashKpis();
    } else if (tabId === "settings") {
      if (typeof updateErrorLogsUI === "function") {
        updateErrorLogsUI();
      }
    }
    tabDirtyStates[tabId] = false;
  } catch (e) {
    console.error(`Lỗi render tab ${tabId}:`, e);
  }
}

// Cập nhật toàn bộ giao diện dựa trên tab đang hiển thị
function refreshUI() {
  markAllTabsDirty();
  const activeMenuItem = document.querySelector(".sidebar-menu .menu-item.active");
  const tabId = activeMenuItem ? activeMenuItem.getAttribute("data-tab") : "dashboard";
  renderTabIfNeeded(tabId);
}

// Biến toàn cục lưu trữ trạng thái các modal đang mở theo từng tab
let activeModalsByTab = {};

// 4. ĐIỀU HƯỚNG TAB CHỨNG TỪ (UI TABS SWITCHER)
function switchTab(tabId) {
  // Lấy tab cũ trước khi chuyển
  const prevActiveMenu = document.querySelector(".sidebar-menu .menu-item.active");
  const prevTabId = prevActiveMenu ? prevActiveMenu.getAttribute("data-tab") : null;

  // Lưu trạng thái các modal đang mở của tab cũ và ẩn tạm thời
  if (prevTabId) {
    const openModals = [];
    document.querySelectorAll(".modal-overlay").forEach(modal => {
      if (modal.style.display === "flex" || modal.style.display === "block") {
        openModals.push(modal.id);
        modal.style.display = "none";
      }
    });
    activeModalsByTab[prevTabId] = openModals;
  }

  // Bỏ active tất cả menu
  document.querySelectorAll(".sidebar-menu .menu-item").forEach(item => {
    item.classList.remove("active");
  });

  // Set active menu hiện hành
  const activeMenu = document.querySelector(`.sidebar-menu .menu-item[data-tab="${tabId}"]`);
  if (activeMenu) activeMenu.classList.add("active");

  // Ẩn tất cả tab-view
  document.querySelectorAll(".content-body .tab-view").forEach(view => {
    view.classList.remove("active-tab");
  });

  // Hiển thị tab-view được chọn
  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) activeView.classList.add("active-tab");

  // Thay đổi tiêu đề Header
  const titles = {
    dashboard: { title: "Tổng quan", sub: "Tổng quan tình hình tài chính công ty Rạng Đông" },
    purchase: { title: "Quản lý mua hàng", sub: "Hóa đơn mua hàng hóa, nguyên vật liệu nhập kho" },
    sales: { title: "Quản lý bán hàng", sub: "Hóa đơn bán hàng và công nợ khách hàng" },
    inventory: { title: "Quản lý kho hàng", sub: "Theo dõi thẻ kho và giá trị tồn kho theo phương pháp bình quân liên hoàn" },
    escrow: { title: "Ký quỹ & Ký cược", sub: "Theo dõi các khoản đặt cọc mang đi và nhận bảo lãnh từ đại lý" },
    reports: { title: "Hệ thống báo cáo kế toán", sub: "Nhật ký chung, Sổ cái tài khoản và Bảng cân đối phát sinh" },
    "excel-hub": { title: "Tích hợp Excel", sub: "Nạp và kết xuất dữ liệu tự động giữa phần mềm và file Excel" },
    partners: { title: "Danh mục Đối tác", sub: "Quản lý hồ sơ khách hàng, nhà cung cấp và thông tin liên hệ" },
    debts: { title: "Quản lý Công nợ", sub: "Sổ tổng hợp chi tiết công nợ phải thu (TK 131) và phải trả (TK 331)" },
    cash: { title: "Quỹ tiền Thu & Chi", sub: "Sổ quỹ tiền mặt, tiền gửi ngân hàng và hạch toán phiếu thu/chi" },
    settings: { title: "Thiết lập hệ thống", sub: "Cấu hình doanh nghiệp và quản lý cơ sở dữ liệu" }
  };

  if (titles[tabId]) {
    document.getElementById("page-display-title").innerText = titles[tabId].title;
  }

  // Update breadcrumb navigation
  if (typeof updateBreadcrumb === 'function') updateBreadcrumb(tabId);
  // Update sidebar notification badges
  if (typeof updateSidebarBadges === 'function') updateSidebarBadges();

  // Khởi tạo các combo-box hoặc nạp dữ liệu chuyên biệt cho từng màn hình
  renderTabIfNeeded(tabId);

  // Khôi phục các modal đang mở trước đó của tab mới
  const restoreModals = activeModalsByTab[tabId];
  if (restoreModals && restoreModals.length > 0) {
    restoreModals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = "flex";
      }
    });
  }

  // Scroll to top
  document.querySelector(".content-body").scrollTop = 0;
}

// 5. RENDER DỮ LIỆU PHÂN HỆ DASHBOARD (KPIs & OFFLINE CHART)
function getInventoryValueAt(toDate) {
  if (!toDate) {
    let totalInventoryVal = 0;
    state.products.forEach(p => {
      totalInventoryVal += p.totalValue || 0;
    });
    return totalInventoryVal;
  }

  const productStocks = {};
  const productValues = {};
  state.products.forEach(p => {
    productStocks[p.id] = p.initialStock || 0;
    productValues[p.id] = (p.initialStock || 0) * (p.initialCost || 0);
  });

  const chronologicalVouchers = [...state.vouchers];
  chronologicalVouchers.sort((a, b) => a.date.localeCompare(b.date));

  chronologicalVouchers.forEach(v => {
    if (v.date > toDate) return;
    if (!v.items) return;

    const seenInVoucher = new Set();

    v.items.forEach(item => {
      const pId = item.productId;
      if (productStocks[pId] !== undefined) {
        if (seenInVoucher.has(pId)) return;
        seenInVoucher.add(pId);

        if (v.type === "purchase") {
          productStocks[pId] += item.qty;
          productValues[pId] += item.amount;
        } else if (v.type === "sales") {
          productStocks[pId] -= item.qty;
          productValues[pId] -= (item.cogsAmount || 0);
        }
      }
    });
  });

  let totalVal = 0;
  state.products.forEach(p => {
    totalVal += productValues[p.id] || 0;
  });

  return totalVal;
}

// Quản lý Modal
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "none";
  }
}

// 12. XEM VÀ IN BIỂU MẪU CHỨNG TỪ THEO CHUẨN BỘ TÀI CHÍNH
function viewVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  const modalTitle = document.querySelector("#modal-view-voucher .card-title");
  if (modalTitle) {
    modalTitle.innerText = "Xem Chứng từ Kế toán";
  }

  const partnerName = getPartnerNameForVoucher(v);
  const std = state.accountingStandard;
  const printArea = document.getElementById("voucher-print-area");
  if (!printArea) return;

  const relatedSales = findRelatedSalesVoucher(v.id, v.description, v.partnerId, v.amount);
  let relatedSalesVoucherHtml = "";
  if (relatedSales) {
    relatedSalesVoucherHtml = `
      <div class="voucher-info-row" style="margin-top: 6px; padding: 6px 10px; background: rgba(14, 165, 233, 0.05); border: 1px dashed var(--color-primary); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span class="info-label" style="color: var(--color-primary); font-weight: 600; font-family: 'Times New Roman', serif; font-size: 13px;">- Hóa đơn bán hàng liên quan:</span>
        <span style="font-weight: bold; color: var(--color-primary); text-decoration: underline; cursor: pointer; font-family: 'Times New Roman', serif; font-size: 13px;" onclick="closeModal('modal-view-voucher'); setTimeout(() => { viewVoucher('${escapeHtmlAttr(relatedSales.id)}'); }, 200);">${relatedSales.id} (${formatVND(relatedSales.totalAmount)})</span>
      </div>
    `;
  }

  let content = "";
  const companyName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
  const companyAddr = state.address || "255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh";
  const companyTax = state.taxCode || "0100101438";

  // TIÊU ĐỀ CHỨNG TỪ THEO CHUẨN IN ẤN
  if (v.type === "purchase_order") {
    // Đơn đặt hàng (Mẫu đơn đặt hàng)
    content = `
      <div class="printable-voucher">
        <div class="voucher-header-top">
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 120px; height: 50px; flex-shrink: 0;">
              <img src="logo.jpg" style="max-height: 48px; max-width: 120px; object-fit: contain;" alt="Logo Rạng Đông" />
            </div>
            <div class="voucher-co-info" style="width: auto;">
              <span class="voucher-co-name">${companyName}</span><br>
              <span class="voucher-co-addr">Địa chỉ: ${companyAddr}</span><br>
              <span class="voucher-co-addr">MST: ${companyTax}</span>
            </div>
          </div>
          <div class="voucher-template-code">
            <span class="template-bold">Mẫu Đơn Đặt Hàng</span><br>
            <span>RD-PO</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">ĐƠN ĐẶT HÀNG</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8, 10)} tháng ${v.date.substring(5, 7)} năm ${v.date.substring(0, 4)}</span>
        </div>
        
        <div class="voucher-entries-note">
          <span>Số: <span class="template-bold">${v.id}</span></span><br>
          <span style="font-size: 11px; color: #666; font-style: italic;">(Không hạch toán kho & kế toán)</span>
        </div>
        
        <div style="margin-top:20px;">
          <div class="voucher-info-row">
            <span class="info-label">- Nhà cung cấp:</span>
            <span class="info-dotted">${partnerName}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Diễn giải:</span>
            <span class="info-dotted">${v.description}</span>
          </div>
        </div>
        
        <table class="voucher-table">
          <thead>
            <tr>
              <th style="width:5%;">STT</th>
              <th style="width:50%;">Tên, nhãn hiệu quy cách sản phẩm vật tư</th>
              <th style="width:10%;">ĐVT</th>
              <th style="width:10%;">Số lượng</th>
              <th style="width:10%;">Đơn giá (đ)</th>
              <th style="width:15%;">Thành tiền (đ)</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map((item, idx) => {
              const prod = state.products.find(p => String(p.id) === String(item.productId)) || { name: "Sản phẩm" };
              return `
                <tr>
                  <td style="text-align:center;">${idx + 1}</td>
                  <td>${prod.name}</td>
                  <td style="text-align:center;">${prod.unit || "Cái"}</td>
                  <td style="text-align:right;">${item.qty}</td>
                  <td style="text-align:right;">${formatVND(item.price).replace("đ", "")}</td>
                  <td style="text-align:right; font-weight:bold;">${formatVND(item.amount).replace("đ", "")}</td>
                </tr>
              `;
            }).join("")}
            
            <tr style="background-color:#e5e7eb;">
              <td colspan="5" style="text-align:right; font-weight:bold; text-transform:uppercase;">Tổng cộng tiền đặt hàng:</td>
              <td style="text-align:right; font-weight:bold; color:var(--color-primary);">${formatVND(v.totalAmount).replace("đ", "")}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="voucher-amount-word">
          Tổng số tiền (viết bằng chữ): <span style="font-weight:bold; font-style:italic;">${numberToVietnameseWords(v.totalAmount)}</span>
        </div>
        
        <!-- Chữ ký và dấu (Đơn đặt hàng) -->
        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 30px; font-size: 11px; page-break-inside: avoid; break-inside: avoid;">
          <div style="width: 23%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người lập phiếu</strong><br>
            <span style="font-style: italic; font-size: 10px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 60px;"></div>
          </div>
          
          <div style="width: 23%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Kế toán trưởng</strong><br>
            <span style="font-style: italic; font-size: 10px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 60px;"></div>
          </div>
          
          <div style="width: 23%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Đại diện nhà cung cấp</strong><br>
            <span style="font-style: italic; font-size: 10px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 60px;"></div>
          </div>
          
          <div style="width: 23%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Giám đốc</strong><br>
            <span style="font-style: italic; font-size: 10px; color: #555;">(Ký, họ tên, đóng dấu)</span>
            <div style="height: 60px;"></div>
          </div>
        </div>
        
      </div>
    `;
  } else if (v.type === "purchase") {
    // Mua hàng → Phiếu Nhập Kho theo style của Bán Hàng
    let grossTotal = 0;
    (v.items || []).forEach(item => { grossTotal += item.amount || ((item.qty||0)*(item.price||0)); });
    const partner_p = getPartnerForVoucher(v) || {};
    content = `
      <div class="printable-voucher" style="max-width:800px; padding:8px; font-family:'Times New Roman',Times,serif; font-size:11px; color:#000; line-height:1.25;">
        <!-- Header -->
        <div style="position:relative; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; text-align:center; min-height:50px;">
          <div style="position:absolute; left:0; top:50%; transform:translateY(-50%); width:80px; display:flex; align-items:center; justify-content:center;">
            <img src="logo.jpg" style="max-height:45px; max-width:75px; object-fit:contain;" alt="Logo" />
          </div>
          <div style="padding:0 10px 0 90px; color:#000;">
            <div style="font-weight:bold; font-size:12px; text-transform:uppercase; white-space:nowrap;">${companyName}</div>
            <div style="font-size:9.5px; margin-top:2px; white-space:nowrap;">Mật số: ${state.accountingStandard === 'TT133' ? 'Mẫu số C21-DN (TT133)' : 'Mẫu số 01-VT (TT200)'}</div>
            <div style="font-size:9.5px; margin-top:2px; white-space:nowrap;">Địa chỉ: ${companyAddr}</div>
            <div style="font-size:9.5px; margin-top:1px; white-space:nowrap;">MST: ${companyTax}</div>
          </div>
        </div>
        <!-- Tiêu đề -->
        <div style="text-align:center; margin-bottom:10px;">
          <div style="font-size:18px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase;">PHIẾU NHẬP KHO</div>
          <div style="font-size:10.5px; font-style:italic;">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</div>
        </div>
        <!-- Thông tin -->
        <div style="display:grid; grid-template-columns:2fr 1fr; row-gap:3px; column-gap:12px; margin-bottom:8px; font-size:10.5px;">
          <div><strong>Nhà cung cấp:</strong> <span style="font-size:12px; font-weight:bold;">${partnerName}</span></div>
          <div style="text-align:right;"><strong>Ngày:</strong> ${v.date.substring(8,10)}/${v.date.substring(5,7)}/${v.date.substring(0,4)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner_p.phone || '-'}</span></div>
          <div style="text-align:right;"><strong>Số:</strong> <span style="font-family:monospace; font-weight:bold; font-size:13px;">${v.id}</span></div>
          <div style="grid-column:span 2;"><strong>Địa chỉ NCC:</strong> <span>${partner_p.address || '-'}</span></div>
          <div style="grid-column:span 2;"><strong>Diễn giải:</strong> ${v.description || `Nhập kho hàng mua`}</div>
          <div style="grid-column:span 2; font-size:10px; color:#555;">
            Nợ TK: <strong>156</strong>${v.taxAmount > 0 && state.accountingStandard !== 'TT133' ? ' / Nợ TK: <strong>1331</strong>' : ''} &nbsp;|&nbsp; Có TK: <strong>${v.paymentMethod || '331'}</strong>
          </div>
        </div>
        <!-- Bảng sản phẩm -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1.5px solid #000;">
          <thead>
            <tr style="background-color:#f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">TT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left; width:40%;">Tên, nhãn hiệu, quy cách</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:7%;">ĐV</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:9%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:14%;">Thành tiền</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:13%;">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${(v.items || []).map((item, idx) => {
              const prod = (state.products||[]).find(p=>String(p.id)===String(item.productId))||{name:item.productId||'SP'};
              const amt = item.amount||((item.qty||0)*(item.price||0));
              return `<tr>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${idx+1}</td>
                <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${prod.name}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit||'Cái'}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${item.qty||0}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${formatVND(item.price||0).replace('đ','')}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${formatVND(amt).replace('đ','')}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;"></td>
              </tr>`;
            }).join('')}
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; border-top:1.5px solid #000;">Cộng tiền hàng:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${formatVND(grossTotal).replace('đ','')}</td>
              <td style="border:1px solid #000; border-top:1.5px solid #000;"></td>
            </tr>
            ${v.taxAmount > 0 ? `<tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right;">Thuế GTGT (${v.taxRate||0}%):</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right;">${formatVND(v.taxAmount||0).replace('đ','')}</td>
              <td style="border:1px solid #000;"></td>
            </tr>` : ''}
            <tr style="background-color:#f9fafb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase;">Tổng tiền thanh toán:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${formatVND(v.totalAmount||grossTotal).replace('đ','')}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
          </tbody>
        </table>
        <!-- Chữ số tiền -->
        <div style="margin-bottom:12px; font-size:11px;">
          <strong>Số tiền viết bằng chữ:</strong> <span style="font-style:italic;">${numberToVietnameseWords(v.totalAmount||grossTotal)}</span>
        </div>
        <!-- Chữ ký -->
        <div style="display:flex; justify-content:space-between; text-align:center; margin-top:12px; font-size:10.5px;">
          ${['Người lập phiếu','Người giao hàng','Thủ kho','Kế toán trưởng','Giám đốc'].map((s,i)=>`
          <div style="width:18%;">
            <strong>${s}</strong><br>
            <span style="font-style:italic; font-size:9.5px; color:#555;">(Ký, họ tên${i===4?', đóng dấu':''})</span>
            <div style="height:55px;"></div>
          </div>`).join('')}
        </div>
      </div>
    `;



  } else if (v.type === "purchase_return") {
    // Mua trả lại → PHIẾU XUẤT KHO TRẢ NCC (hàng ĐI RA khỏi kho)
    let grossTotal = 0;
    (v.items || []).forEach(item => { grossTotal += item.amount || ((item.qty||0)*(item.price||0)); });
    const partner_pr = getPartnerForVoucher(v) || {};
    const isTT133pr = std === 'TT133';
    content = `
      <div class="printable-voucher" style="max-width:800px; padding:8px; font-family:'Times New Roman',Times,serif; font-size:11px; color:#000; line-height:1.25;">
        <!-- Header -->
        <div style="position:relative; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; text-align:center; min-height:50px;">
          <div style="position:absolute; left:0; top:50%; transform:translateY(-50%); width:80px; display:flex; align-items:center; justify-content:center;">
            <img src="logo.jpg" style="max-height:45px; max-width:75px; object-fit:contain;" alt="Logo" />
          </div>
          <div style="padding:0 10px 0 90px; color:#000;">
            <div style="font-weight:bold; font-size:12px; text-transform:uppercase; white-space:nowrap;">${companyName}</div>
            <div style="font-size:9.5px; margin-top:2px; white-space:nowrap;">${isTT133pr ? 'Mẫu số C21-DN (TT133)' : 'Mẫu số 02-VT (TT200)'}</div>
            <div style="font-size:9.5px; margin-top:2px; white-space:nowrap;">Địa chỉ: ${companyAddr}</div>
            <div style="font-size:9.5px; margin-top:1px; white-space:nowrap;">MST: ${companyTax}</div>
          </div>
        </div>
        <!-- Tiêu đề -->
        <div style="text-align:center; margin-bottom:10px;">
          <div style="font-size:18px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase;">PHIẾU XUẤT KHO TRẢ NHÀ CUNG CẤP</div>
          <div style="font-size:10.5px; font-style:italic;">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</div>
        </div>
        <!-- Thông tin -->
        <div style="display:grid; grid-template-columns:2fr 1fr; row-gap:3px; column-gap:12px; margin-bottom:8px; font-size:10.5px;">
          <div><strong>Nhà cung cấp:</strong> <span style="font-size:12px; font-weight:bold;">${partnerName}</span></div>
          <div style="text-align:right;"><strong>Ngày:</strong> ${v.date.substring(8,10)}/${v.date.substring(5,7)}/${v.date.substring(0,4)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner_pr.phone || '-'}</span></div>
          <div style="text-align:right;"><strong>Số:</strong> <span style="font-family:monospace; font-weight:bold; font-size:13px;">${v.id}</span></div>
          <div style="grid-column:span 2;"><strong>Địa chỉ NCC:</strong> <span>${partner_pr.address || '-'}</span></div>
          <div style="grid-column:span 2;"><strong>Lý do trả:</strong> ${v.description}</div>
          <div style="grid-column:span 2; font-size:10px; color:#555;">
            Nợ TK: <strong>331</strong>${!isTT133pr && v.taxAmount > 0 ? ' / Nợ TK: <strong>1331</strong>' : ''} &nbsp;|&nbsp; Có TK: <strong>156</strong>
          </div>
        </div>
        <!-- Bảng sản phẩm -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1.5px solid #000;">
          <thead>
            <tr style="background-color:#f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">TT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left; width:40%;">Tên, nhãn hiệu, quy cách</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:7%;">ĐV</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:9%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:14%;">Thành tiền</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:13%;">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${(v.items || []).map((item, idx) => {
              const prod = (state.products||[]).find(p=>String(p.id)===String(item.productId))||{name:item.productId||'SP'};
              const amt = item.amount||((item.qty||0)*(item.price||0));
              return `<tr>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${idx+1}</td>
                <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${prod.name}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit||'Cái'}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${item.qty||0}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${formatVND(item.price||0).replace('đ','')}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${formatVND(amt).replace('đ','')}</td>
                <td style="border:1px solid #000; padding:4px;"></td>
              </tr>`;
            }).join('')}
            <tr style="background-color:#f9fafb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase; border-top:1.5px solid #000;">Tổng cộng tiền trả NCC:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; border-top:1.5px solid #000;">${formatVND(grossTotal).replace('đ','')}</td>
              <td style="border:1px solid #000; border-top:1.5px solid #000;"></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:12px; font-size:11px;">
          <strong>Số tiền viết bằng chữ:</strong> <span style="font-style:italic;">${numberToVietnameseWords(v.totalAmount||grossTotal)}</span>
        </div>
        <!-- Chữ ký -->
        <div style="display:flex; justify-content:space-between; text-align:center; margin-top:12px; font-size:10.5px;">
          ${['Người lập phiếu','Người giao hàng','Thủ kho','Kế toán trưởng','Giám đốc'].map((s,i)=>`
          <div style="width:18%;">
            <strong>${s}</strong><br>
            <span style="font-style:italic; font-size:9.5px; color:#555;">(Ký, họ tên${i===4?', đóng dấu':''})</span>
            <div style="height:55px;"></div>
          </div>`).join('')}
        </div>
      </div>
    `;

  } else if (v.type === "sales_return") {
    // Hàng bán trả lại → PHIẾU NHẬP KHO HÀNG BÁN TRẢ LẠI (hàng ĐI VÀO kho)
    let grossTotal = 0;
    (v.items || []).forEach(item => { grossTotal += item.amount || ((item.qty||0)*(item.price||0)); });
    const partner_sr = getPartnerForVoucher(v) || {};
    const creditAccSR = (v.paymentMethod && v.paymentMethod !== '131') ? v.paymentMethod : '131';
    content = `
      <div class="printable-voucher" style="max-width:800px; padding:8px; font-family:'Times New Roman',Times,serif; font-size:11px; color:#000; line-height:1.25;">
        <!-- Header -->
        <div style="position:relative; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; text-align:center; min-height:50px;">
          <div style="position:absolute; left:0; top:50%; transform:translateY(-50%); width:80px; display:flex; align-items:center; justify-content:center;">
            <img src="logo.jpg" style="max-height:45px; max-width:75px; object-fit:contain;" alt="Logo" />
          </div>
          <div style="padding:0 10px 0 90px; color:#000;">
            <div style="font-weight:bold; font-size:12px; text-transform:uppercase; white-space:nowrap;">${companyName}</div>
            <div style="font-size:9.5px; margin-top:2px; white-space:nowrap;">Mẫu số 01-VT (TT200) — Phục hồi hàng bán trả lại</div>
            <div style="font-size:9.5px; margin-top:2px; white-space:nowrap;">Địa chỉ: ${companyAddr}</div>
            <div style="font-size:9.5px; margin-top:1px; white-space:nowrap;">MST: ${companyTax}</div>
          </div>
        </div>
        <!-- Tiêu đề -->
        <div style="text-align:center; margin-bottom:10px;">
          <div style="font-size:18px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase;">PHIẾU NHẬP KHO HÀNG BÁN TRẢ LẠI</div>
          <div style="font-size:10.5px; font-style:italic;">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</div>
        </div>
        <!-- Thông tin -->
        <div style="display:grid; grid-template-columns:2fr 1fr; row-gap:3px; column-gap:12px; margin-bottom:8px; font-size:10.5px;">
          <div><strong>Khách hàng trả lại:</strong> <span style="font-size:12px; font-weight:bold;">${partnerName}</span></div>
          <div style="text-align:right;"><strong>Ngày:</strong> ${v.date.substring(8,10)}/${v.date.substring(5,7)}/${v.date.substring(0,4)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner_sr.phone || '-'}</span></div>
          <div style="text-align:right;"><strong>Số:</strong> <span style="font-family:monospace; font-weight:bold; font-size:13px;">${v.id}</span></div>
          <div style="grid-column:span 2;"><strong>Địa chỉ:</strong> <span>${partner_sr.address || '-'}</span></div>
          <div style="grid-column:span 2;"><strong>Lý do trả:</strong> ${v.description}</div>
          <div style="grid-column:span 2; font-size:10px; color:#555;">
            Nợ TK: <strong>511</strong>${v.taxAmount > 0 ? ', <strong>3331</strong>' : ''} &nbsp;|&nbsp; Có TK: <strong>${creditAccSR}</strong>
            &nbsp;&nbsp; Nợ TK: <strong>156</strong> / Có TK: <strong>632</strong> (nhập lại kho)
          </div>
        </div>
        <!-- Bảng sản phẩm -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1.5px solid #000;">
          <thead>
            <tr style="background-color:#f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">TT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left; width:40%;">Tên, nhãn hiệu, quy cách</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:7%;">ĐV</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:9%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:14%;">Thành tiền</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:13%;">G.C</th>
            </tr>
          </thead>
          <tbody>
            ${(v.items || []).map((item, idx) => {
              const prod = (state.products||[]).find(p=>String(p.id)===String(item.productId))||{name:item.productId||'SP'};
              const amt = item.amount||((item.qty||0)*(item.price||0));
              const disc = item.discount > 0 ? (item.discount > 100 ? Math.round((item.discount/amt)*100)+'%' : item.discount+'%') : '0';
              return `<tr>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${idx+1}</td>
                <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${prod.name}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit||'Cái'}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${item.qty||0}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${formatVND(item.price||0).replace('đ','')}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${formatVND(amt).replace('đ','')}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${disc}</td>
              </tr>`;
            }).join('')}
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; border-top:1.5px solid #000;">Cộng tiền hàng trả:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${formatVND(grossTotal).replace('đ','')}</td>
              <td style="border:1px solid #000; border-top:1.5px solid #000;"></td>
            </tr>
            <tr style="background-color:#f9fafb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase;">Tổng tiền trả lại khách:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; color:#dc2626;">${formatVND(v.totalAmount||grossTotal).replace('đ','')}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:12px; font-size:11px;">
          <strong>Số tiền viết bằng chữ:</strong> <span style="font-style:italic;">${numberToVietnameseWords(v.totalAmount||grossTotal)}</span>
        </div>
        <!-- Chữ ký -->
        <div style="display:flex; justify-content:space-between; text-align:center; margin-top:12px; font-size:10.5px;">
          ${['Người lập phiếu','Khách hàng trả','Thủ kho','Kế toán trưởng','Giám đốc'].map((s,i)=>`
          <div style="width:18%;">
            <strong>${s}</strong><br>
            <span style="font-style:italic; font-size:9.5px; color:#555;">(Ký, họ tên${i===4?', đóng dấu':''})</span>
            <div style="height:55px;"></div>
          </div>`).join('')}
        </div>
      </div>
    `;

  } else if (v.type === "sales") {
    // Bán hàng -> Phiếu giao hàng / hóa đơn bán hàng theo chuẩn mẫu thực tế của Rạng Đông
    let grossTotal = 0;
    let totalDiscount = 0;

    v.items.forEach(item => {
      const itemGross = (item.qty || 0) * (item.price || 0);
      let discountPercent = item.discount || 0;
      if (discountPercent > 100) {
        discountPercent = itemGross > 0 ? (discountPercent / itemGross) * 100 : 0;
      }
      const itemDiscountVal = itemGross * (discountPercent / 100);
      grossTotal += itemGross;
      totalDiscount += itemDiscountVal;
    });

    content = `
      <div class="printable-voucher" style="max-width: 800px; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; line-height: 1.25;">
        
        <!-- Header: Logo Rạng Đông bên trái & Thông tin công ty ở giữa (Cân đối hoàn hảo) -->
        <div style="position: relative; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; text-align: center; min-height: 50px;">
          <!-- Logo Rạng Đông thực tế từ file logo.jpg -->
          <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 80px;">
            <img src="logo.jpg" style="max-height: 45px; max-width: 75px; object-fit: contain;" alt="Logo Rạng Đông" />
          </div>

          <!-- Thông tin công ty chính xác theo mẫu giấy (Tránh wrap lỗi căn lề và không bị tràn) -->
          <div style="color: #000; padding: 0 10px 0 90px;">
            <div style="font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap;">CÔNG TY CỔ PHẦN RẠNG ĐÔNG</div>
            <div style="font-weight: bold; font-size: 9.5px; text-transform: uppercase; margin-top: 2px; white-space: nowrap;">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY</div>
            <div style="font-size: 9.5px; margin-top: 2px; white-space: nowrap;">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
            <div style="font-size: 9.5px; margin-top: 1px; font-weight: 500; white-space: nowrap;">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
          </div>
        </div>

        <!-- Tiêu đề Phiếu giao hàng -->
        <div style="text-align: center; margin-bottom: 10px;">
          <div style="font-size: 18px; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase;">PHIẾU GIAO HÀNG</div>
        </div>

        <!-- Phần thông tin khách hàng và ngày hóa đơn (chia cột giống giấy) -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; row-gap: 3px; column-gap: 12px; margin-bottom: 8px; font-size: 10.5px;">
          <div>
            <strong>Tên khách hàng:</strong> <span style="font-size: 12.5px; font-weight: bold;">${partnerName}</span>
          </div>
          <div style="text-align: right;">
            <strong>Ngày:</strong> ${v.date.substring(8, 10)}/${v.date.substring(5, 7)}/${v.date.substring(0, 4)}
          </div>
          
          <div>
            <strong>Điện thoại:</strong> <span>${(getPartnerForVoucher(v) || {}).phone || "-"}</span>
          </div>
          <div style="text-align: right;">
            <strong>Số:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 13px;">${v.id}</span>
          </div>

          <div style="grid-column: span 2;">
            <strong>Địa chỉ:</strong> <span>${(getPartnerForVoucher(v) || {}).address || "-"}</span>
          </div>
          
          <div style="grid-column: span 2;">
            <strong>Diễn giải:</strong> ${v.description || `Bán hàng ${partnerName}`}
          </div>
        </div>

        <!-- Bảng sản phẩm -->
        <table class="voucher-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1.5px solid #000;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: center; font-weight: bold; width: 5%;">TT</th>
              <th style="border: 1px solid #000; padding: 4px 6px; text-align: left; font-weight: bold; width: 45%;">Diễn giải</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: center; font-weight: bold; width: 8%;">ĐV</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold; width: 10%;">Số lượng</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold; width: 12%;">Đơn giá</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold; width: 15%;">Thành tiền</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: center; font-weight: bold; width: 5%;">G.C</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map((item, idx) => {
      const prod = state.products.find(p => String(p.id) === String(item.productId)) || { name: item.productId };
      const qtyFormatted = Number.isInteger(item.qty) ? `${item.qty},0` : item.qty.toString().replace(".", ",");
      
      const itemGross = (item.qty || 0) * (item.price || 0);
      let discountPercent = item.discount || 0;
      if (discountPercent > 100) {
        discountPercent = itemGross > 0 ? Math.round((discountPercent / itemGross) * 100 * 100) / 100 : 0;
      }
      const gcVal = discountPercent > 0 ? `${discountPercent}%` : "0";
      return `
                <tr>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: center;">${idx + 1}</td>
                  <td style="border: 1px solid #000; padding: 4px 6px; font-weight: 500;">${prod.name}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: center;">${prod.unit || "Cái"}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: right;" class="font-numeric">${qtyFormatted}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: right;" class="font-numeric">${formatVND(item.price).replace("đ", "").trim()}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(item.amount).replace("đ", "").trim()}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: center;">${gcVal}</td>
                </tr>
              `;
    }).join("")}
            
            <!-- Phần tổng tiền -->
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold; border-top: 1.5px solid #000;">Cộng tiền hàng :</td>
              <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(grossTotal).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000; border-top: 1.5px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: 500;">Số tiền chiết khấu:</td>
              <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: 500;" class="font-numeric">${formatVND(totalDiscount).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
            <tr style="background-color: #f9fafb;">
              <td colspan="5" style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold; text-transform: uppercase;">Tổng tiền thanh toán:</td>
              <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(v.totalAmount).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
          </tbody>
        </table>

        <!-- Chữ số tiền viết bằng chữ, ghi chú & Mã QR thanh toán -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; font-size: 11px; line-height: 1.3; page-break-inside: avoid; break-inside: avoid;">
          <div style="flex: 1; padding-right: 15px;">
            <div style="margin-bottom: 3px;">
              <strong>Số tiền viết bằng chữ:</strong> <span style="font-style: italic;">${numberToVietnameseWords(v.totalAmount)}</span>
            </div>
            <div>
              <strong>Ghi chú:</strong> <span style="font-style: italic; color: #374151;">${v.notes || "hàng thừa trả lại dơ bẩn không thu lại. Không thu lại nút bịt"}</span>
            </div>
          </div>
          <div style="width: 125px; text-align: center; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #000; padding: 4px; border-radius: 4px; background: #fff; page-break-inside: avoid; break-inside: avoid;">
            <span style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #000; margin-bottom: 3px; letter-spacing: 0.2px;">Quét Mã QR Thanh Toán</span>
            <img src="https://img.vietqr.io/image/sacombank-050033493999-qr_only.png?amount=${v.totalAmount}&addInfo=${encodeURIComponent('Thanh toan ' + v.id)}&accountName=${encodeURIComponent('CTY CP SX DT PHAT TRIEN RANG DONG')}" style="width: 90px; height: 90px; display: block;" alt="VietQR" />
            <span style="font-size: 8px; color: #000; margin-top: 3px; font-family: monospace; font-weight: bold;">STK: 050033493999</span>
          </div>
        </div>

        <!-- Chữ ký và dấu (Nhiệm vụ người lập, giao, nhận) -->
        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 12px; font-size: 10.5px; page-break-inside: avoid; break-inside: avoid;">
          <div style="width: 30%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người nhận hàng</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 50px;"></div>
          </div>
          
          <div style="width: 30%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người giao hàng</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 50px;"></div>
          </div>
          
          <div style="width: 30%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người lập phiếu</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 50px;"></div>
          </div>
        </div>

      </div>
    `;
  } else if (v.type === "sales_quotation") {
    // Báo giá -> Phiếu báo giá chi tiết
    let grossTotal = 0;
    let totalDiscount = 0;

    v.items.forEach(item => {
      const itemGross = (item.qty || 0) * (item.price || 0);
      let discountPercent = item.discount || 0;
      if (discountPercent > 100) {
        discountPercent = itemGross > 0 ? (discountPercent / itemGross) * 100 : 0;
      }
      const itemDiscountVal = itemGross * (discountPercent / 100);
      grossTotal += itemGross;
      totalDiscount += itemDiscountVal;
    });

    content = `
      <div class="printable-voucher" style="max-width: 800px; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; line-height: 1.25;">
        
        <!-- Header: Logo Rạng Đông bên trái & Thông tin công ty ở giữa -->
        <div style="position: relative; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; text-align: center; min-height: 50px;">
          <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 80px;">
            <img src="logo.jpg" style="max-height: 45px; max-width: 75px; object-fit: contain;" alt="Logo Rạng Đông" />
          </div>

          <div style="color: #000; padding: 0 10px 0 90px;">
            <div style="font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap;">CÔNG TY CỔ PHẦN RẠNG ĐÔNG</div>
            <div style="font-weight: bold; font-size: 9.5px; text-transform: uppercase; margin-top: 2px; white-space: nowrap;">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY</div>
            <div style="font-size: 9.5px; margin-top: 2px; white-space: nowrap;">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
            <div style="font-size: 9.5px; margin-top: 1px; font-weight: 500; white-space: nowrap;">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
          </div>
        </div>

        <!-- Tiêu đề Phiếu báo giá -->
        <div style="text-align: center; margin-bottom: 10px;">
          <div style="font-size: 18px; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase;">BẢNG BÁO GIÁ</div>
          <span style="font-size: 10px; color: #666; font-style: italic;">(Số: ${v.id} - Không hạch toán kho & kế toán)</span>
        </div>

        <!-- Phần thông tin khách hàng và ngày hóa đơn -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; row-gap: 3px; column-gap: 12px; margin-bottom: 8px; font-size: 10.5px;">
          <div>
            <strong>Kính gửi khách hàng:</strong> <span style="font-size: 12.5px; font-weight: bold;">${partnerName}</span>
          </div>
          <div style="text-align: right;">
            <strong>Ngày lập:</strong> ${v.date.substring(8, 10)}/${v.date.substring(5, 7)}/${v.date.substring(0, 4)}
          </div>
          
          <div>
            <strong>Điện thoại:</strong> <span>${(getPartnerForVoucher(v) || {}).phone || "-"}</span>
          </div>
          <div style="text-align: right;">
            <strong>Số báo giá:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 13px;">${v.id}</span>
          </div>

          <div style="grid-column: span 2;">
            <strong>Địa chỉ:</strong> <span>${(getPartnerForVoucher(v) || {}).address || "-"}</span>
          </div>
          
          <div style="grid-column: span 2;">
            <strong>Nội dung báo giá:</strong> ${v.description || `Báo giá hàng hóa cho ${partnerName}`}
          </div>
        </div>

        <!-- Bảng sản phẩm -->
        <table class="voucher-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1.5px solid #000;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: center; font-weight: bold; width: 5%;">TT</th>
              <th style="border: 1px solid #000; padding: 4px 6px; text-align: left; font-weight: bold; width: 45%;">Tên sản phẩm / quy cách</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: center; font-weight: bold; width: 8%;">ĐV</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold; width: 10%;">Số lượng</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold; width: 12%;">Đơn giá</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold; width: 15%;">Thành tiền</th>
              <th style="border: 1px solid #000; padding: 4px 4px; text-align: center; font-weight: bold; width: 5%;">C.K</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map((item, idx) => {
              const prod = state.products.find(p => String(p.id) === String(item.productId)) || { name: item.productId };
              const qtyFormatted = Number.isInteger(item.qty) ? `${item.qty},0` : item.qty.toString().replace(".", ",");
              
              const itemGross = (item.qty || 0) * (item.price || 0);
              let discountPercent = item.discount || 0;
              if (discountPercent > 100) {
                discountPercent = itemGross > 0 ? Math.round((discountPercent / itemGross) * 100 * 100) / 100 : 0;
              }
              const gcVal = discountPercent > 0 ? `${discountPercent}%` : "0";
              return `
                <tr>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: center;">${idx + 1}</td>
                  <td style="border: 1px solid #000; padding: 4px 6px; font-weight: 500;">${prod.name}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: center;">${prod.unit || "Cái"}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: right;" class="font-numeric">${qtyFormatted}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: right;" class="font-numeric">${formatVND(item.price).replace("đ", "").trim()}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(item.amount).replace("đ", "").trim()}</td>
                  <td style="border: 1px solid #000; padding: 4px 4px; text-align: center;">${gcVal}</td>
                </tr>
              `;
            }).join("")}
            
            <!-- Phần tổng tiền -->
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold; border-top: 1.5px solid #000;">Cộng tiền hàng :</td>
              <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(grossTotal).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000; border-top: 1.5px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: 500;">Số tiền chiết khấu:</td>
              <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: 500;" class="font-numeric">${formatVND(totalDiscount).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
            <tr style="background-color: #f9fafb;">
              <td colspan="5" style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold; text-transform: uppercase;">Tổng cộng giá trị báo giá:</td>
              <td style="border: 1px solid #000; padding: 4px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(v.totalAmount).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
          </tbody>
        </table>

        <!-- Chữ số tiền viết bằng chữ, ghi chú & Mã QR thanh toán -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; font-size: 11px; line-height: 1.3; page-break-inside: avoid; break-inside: avoid;">
          <div style="flex: 1; padding-right: 15px;">
            <div style="margin-bottom: 3px;">
              <strong>Số tiền viết bằng chữ:</strong> <span style="font-style: italic;">${numberToVietnameseWords(v.totalAmount)}</span>
            </div>
            <div>
              <strong>Ghi chú:</strong> <span style="font-style: italic; color: #374151;">Báo giá có giá trị trong vòng 30 ngày kể từ ngày lập. Giá trên đã bao gồm VAT.</span>
            </div>
          </div>
          <div style="width: 125px; text-align: center; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #000; padding: 4px; border-radius: 4px; background: #fff; page-break-inside: avoid; break-inside: avoid;">
            <span style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #000; margin-bottom: 3px; letter-spacing: 0.2px;">Quét QR Để Thanh Toán</span>
            <img src="https://img.vietqr.io/image/sacombank-050033493999-qr_only.png?amount=${v.totalAmount}&addInfo=${encodeURIComponent('Thanh toan BG ' + v.id)}&accountName=${encodeURIComponent('CTY CP SX DT PHAT TRIEN RANG DONG')}" style="width: 90px; height: 90px; display: block;" alt="VietQR" />
            <span style="font-size: 8px; color: #000; margin-top: 3px; font-family: monospace; font-weight: bold;">STK: 050033493999</span>
          </div>
        </div>

        <!-- Chữ ký và dấu (Báo giá) -->
        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 12px; font-size: 10.5px; page-break-inside: avoid; break-inside: avoid;">
          <div style="width: 45%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Đại diện khách hàng</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 50px;"></div>
          </div>
          
          <div style="width: 45%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người báo giá</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 50px;"></div>
          </div>
        </div>

      </div>
    `;
  } else if (v.type.startsWith("escrow_") || v.type === "receipt" || v.type === "payment") {
    // Nghiệp vụ ký quỹ hoặc Thu/Chi → PHIẾU THU hoặc PHIẾU CHI (chuẩn MISA)
    const isReceipt = v.type === "escrow_receive" || v.type === "escrow_refund_pay" || v.type === "receipt";
    const title = isReceipt ? "PHIẾU THU" : "PHIẾU CHI";
    const templateCode = isReceipt ? "Mẫu số 01 - TT" : "Mẫu số 02 - TT";

    // Tài khoản định khoản
    const e = (v.entries && v.entries[0]) || { debit: isReceipt ? "111" : "331", credit: isReceipt ? "131" : "111" };
    const partner = getPartnerForVoucher ? getPartnerForVoucher(v) : null;
    const partnerAddr = partner ? (partner.address || "") : "";
    const partnerPhone = partner ? (partner.phone || "") : "";
    const partnerAddrLine = [partnerAddr, partnerPhone].filter(Boolean).join(" - ");
    const amount = v.amount || v.totalAmount || 0;

    // Chữ ký theo từng loại phiếu (đúng thứ tự MISA)
    // PHIẾU THU: Giám đốc | Kế toán trưởng | Người nộp tiền | Người lập phiếu | Thủ quỹ
    // PHIẾU CHI: Giám đốc | Kế toán trưởng | Thủ quỹ | Người lập phiếu | Người nhận tiền
    const sigRow = isReceipt
      ? ["Giám đốc", "Kế toán trưởng", "Người nộp tiền", "Người lập phiếu", "Thủ quỹ"]
      : ["Giám đốc", "Kế toán trưởng", "Thủ quỹ", "Người lập phiếu", "Người nhận tiền"];
    const sigSub = isReceipt
      ? ["Ký, họ tên, đóng dấu", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên"]
      : ["Ký, họ tên, đóng dấu", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên"];

    content = `
      <div class="printable-voucher" style="max-width:780px; padding:10px; font-family:'Times New Roman',Times,serif; font-size:11px; color:#000; line-height:1.4;">

        <!-- HEADER: Logo trái + Tên công ty | Quyển số / Số / Nợ / Có bên phải -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:10px; flex:1;">
            <img src="logo.jpg" style="max-height:44px; max-width:100px; object-fit:contain;" alt="Logo" />
            <div>
              <div style="font-weight:bold; font-size:11.5px; text-transform:uppercase;">${companyName}</div>
              <div style="font-size:9.5px;">Địa chỉ: ${companyAddr}</div>
              <div style="font-size:9.5px;">MST: ${companyTax}</div>
            </div>
          </div>
          <div style="text-align:right; font-size:10px; min-width:160px; flex-shrink:0;">
            <div style="font-size:8.5px; color:#555;">${templateCode} &nbsp;(TT 200/2014/TT-BTC)</div>
            <div style="margin-top:3px;">Quyển số: <span style="border-bottom:1px dotted #000; display:inline-block; min-width:50px;">&nbsp;</span></div>
            <div>Số: <strong>${v.id}</strong></div>
            <div>Nợ: <strong>${e.debit}</strong></div>
            <div>Có: <strong>${e.credit}</strong></div>
          </div>
        </div>

        <!-- TIÊU ĐỀ -->
        <div style="text-align:center; margin-bottom:12px;">
          <div style="font-size:22px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">${title}</div>
          <div style="font-size:11px; font-style:italic;">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</div>
        </div>

        <!-- THÔNG TIN PHIẾU -->
        <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:6px;">
          <tr>
            <td style="padding:3px 0; white-space:nowrap; width:220px;"><strong>Họ và tên người ${isReceipt ? "nộp" : "nhận"} tiền:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">${partnerName}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Địa chỉ:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">${partnerAddrLine || "&nbsp;"}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Lý do ${isReceipt ? "nộp" : "chi"}:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">${v.description}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Số tiền:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;"><strong>${amount.toLocaleString('vi-VN')} VND</strong></td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Viết bằng chữ:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999; font-style:italic; font-weight:bold;">${numberToVietnameseWords(amount)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Kèm theo:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">............... chứng từ gốc</td>
          </tr>
        </table>

        ${relatedSalesVoucherHtml}

        <!-- DÒNG NGÀY KÝ -->
        <div style="text-align:right; font-style:italic; font-size:10.5px; margin:10px 20px 6px 0;">
          ngày...... tháng ...... năm..............
        </div>

        <!-- CHỮ KÝ -->
        <table style="width:100%; border-collapse:collapse; text-align:center; font-size:10.5px; margin-top:4px;">
          <tr>
            ${sigRow.map(s => `<td style="width:20%; padding:4px 2px; font-weight:bold;">${s}</td>`).join("")}
          </tr>
          <tr>
            ${sigSub.map(s => `<td style="font-style:italic; font-size:9.5px; color:#555;">(${s})</td>`).join("")}
          </tr>
          <tr>
            ${sigRow.map(() => `<td style="height:70px; border-bottom:1px dotted #bbb;"></td>`).join("")}
          </tr>
          <tr>
            ${sigRow.map(() => `<td style="padding:2px; font-size:10px; color:#333;"></td>`).join("")}
          </tr>
        </table>

        <!-- FOOTER -->
        <div style="margin-top:16px; padding-top:8px; border-top:1px solid #ddd; font-size:10.5px;">
          <strong>Đã nhận đủ số tiền (Viết bằng chữ):</strong>
          <span style="font-style:italic;"> ${numberToVietnameseWords(amount)}</span>
        </div>

      </div>
    `;

  }

  printArea.innerHTML = content;
  openModal("modal-view-voucher");
}
window.viewVoucher = viewVoucher;
window.closeModal = closeModal;
window.openModal = openModal;
window.switchTab = switchTab;

// ==========================================================================
// SHARED UI COMPONENTS (Pagination, Empty State, Counter Animation)
// ==========================================================================

// Shared pagination renderer using CSS component classes
function renderPagination(containerId, currentPage, totalPages, totalItems, goToPageFnName) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1 && totalItems <= 0) { container.innerHTML = ''; return; }
  var html = '<div class="pagination-bar">';
  html += '<span class="pagination-info">Trang ' + currentPage + ' / ' + totalPages + ' (' + totalItems + ' bản ghi)</span>';
  html += '<div class="pagination-controls">';
  html += '<button class="page-btn page-btn-nav" ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="' + goToPageFnName + '(' + (currentPage - 1) + ')">◀ Trước</button>';
  var startP = Math.max(1, currentPage - 2);
  var endP = Math.min(totalPages, currentPage + 2);
  if (startP > 1) html += '<button class="page-btn" onclick="' + goToPageFnName + '(1)">1</button>';
  if (startP > 2) html += '<span class="pagination-info">…</span>';
  for (var p = startP; p <= endP; p++) {
    html += '<button class="page-btn' + (p === currentPage ? ' active' : '') + '" onclick="' + goToPageFnName + '(' + p + ')">' + p + '</button>';
  }
  if (endP < totalPages - 1) html += '<span class="pagination-info">…</span>';
  if (endP < totalPages) html += '<button class="page-btn" onclick="' + goToPageFnName + '(' + totalPages + ')">' + totalPages + '</button>';
  html += '<button class="page-btn page-btn-nav" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="' + goToPageFnName + '(' + (currentPage + 1) + ')">Sau ▶</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

// Shared empty state renderer with SVG icon
function renderEmptyState(container, colSpan, message, description) {
  var msg = message || 'Chưa có dữ liệu';
  var desc = description || 'Dữ liệu sẽ xuất hiện ở đây khi bạn tạo mới';
  var html = '<tr><td colspan="' + colSpan + '">';
  html += '<div class="empty-state">';
  html += '<svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>';
  html += '<div class="empty-state-title">' + msg + '</div>';
  html += '<div class="empty-state-desc">' + desc + '</div>';
  html += '</div></td></tr>';
  var el = typeof container === 'string' ? document.getElementById(container) : container;
  if (el) el.innerHTML = html;
}

// KPI counter animation with easeOutCubic
function animateCountUp(element, targetValue, duration) {
  if (!element || typeof targetValue !== 'number') return;
  var startValue = 0;
  var startTime = null;
  var dur = duration || 800;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / dur, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(startValue + (targetValue - startValue) * eased);
    element.textContent = formatVND(current);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Enhanced openModal with animation
var _origOpenModal = openModal;
openModal = function(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('modal-animated');
    modal.style.display = 'flex';
  }
};

var _origCloseModal = closeModal;
closeModal = function(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('modal-animated');
    modal.style.display = 'none';
  }
};

window.renderPagination = renderPagination;
window.renderEmptyState = renderEmptyState;
window.animateCountUp = animateCountUp;
window.openModal = openModal;
window.closeModal = closeModal;

// ==========================================================================
// RDP — Custom Date Picker (cuốn lịch tùy chỉnh)
// Tự động wrap tất cả input[type=date].form-control-date
// ==========================================================================
(function() {
  'use strict';

  const MONTHS_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                     'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const DAYS_VI   = ['CN','T2','T3','T4','T5','T6','T7'];

  let popup = null;       // DOM element popup
  let activeInput = null; // Input đang được chọn
  let viewYear = 0;
  let viewMonth = 0;      // 0-indexed

  // ---- Tạo popup DOM (dùng chung 1 popup cho toàn app) ----
  function createPopup() {
    popup = document.createElement('div');
    popup.id = 'rdp-popup';
    popup.innerHTML = `
      <div class="rdp-header">
        <button class="rdp-nav-btn" id="rdp-prev-year" title="Năm trước">«</button>
        <button class="rdp-nav-btn" id="rdp-prev-month" title="Tháng trước">‹</button>
        <span class="rdp-month-year" id="rdp-month-year-label"></span>
        <button class="rdp-nav-btn" id="rdp-next-month" title="Tháng sau">›</button>
        <button class="rdp-nav-btn" id="rdp-next-year" title="Năm sau">»</button>
      </div>
      <div class="rdp-presets">
        <button class="rdp-preset-btn" data-preset="today">Hôm nay</button>
        <button class="rdp-preset-btn" data-preset="week">Tuần này</button>
        <button class="rdp-preset-btn" data-preset="month">Tháng này</button>
        <button class="rdp-preset-btn" data-preset="quarter">Quý này</button>
        <button class="rdp-preset-btn" data-preset="year">Năm nay</button>
      </div>
      <div class="rdp-weekdays"></div>
      <div class="rdp-days" id="rdp-days-grid"></div>
      <div class="rdp-footer">
        <button class="rdp-clear-btn" id="rdp-clear-btn">Xóa ngày</button>
        <button class="rdp-close-btn" id="rdp-done-btn">Xong</button>
      </div>
    `;

    // Render weekday headers (Tuần bắt đầu từ T2)
    const wdEl = popup.querySelector('.rdp-weekdays');
    // Order: T2 T3 T4 T5 T6 T7 CN
    const wdOrder = [1,2,3,4,5,6,0];
    wdOrder.forEach(i => {
      const d = document.createElement('div');
      d.className = 'rdp-weekday';
      d.textContent = DAYS_VI[i];
      wdEl.appendChild(d);
    });

    document.body.appendChild(popup);

    // Events
    popup.querySelector('#rdp-prev-year').addEventListener('click', e => { e.stopPropagation(); viewYear--; renderCalendar(); });
    popup.querySelector('#rdp-next-year').addEventListener('click', e => { e.stopPropagation(); viewYear++; renderCalendar(); });
    popup.querySelector('#rdp-prev-month').addEventListener('click', e => {
      e.stopPropagation();
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });
    popup.querySelector('#rdp-next-month').addEventListener('click', e => {
      e.stopPropagation();
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });

    popup.querySelector('#rdp-clear-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (activeInput) {
        activeInput.value = '';
        updateDisplay(activeInput);
        fireChange(activeInput);
      }
      closePopup();
    });

    popup.querySelector('#rdp-done-btn').addEventListener('click', e => {
      e.stopPropagation();
      closePopup();
    });

    // Preset buttons
    popup.querySelectorAll('.rdp-preset-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        applyPreset(btn.dataset.preset);
      });
    });
  }

  function applyPreset(preset) {
    if (!activeInput) return;
    const now = new Date();
    let date = null;

    if (preset === 'today') {
      date = toDateString(now);
    } else if (preset === 'week') {
      // Đầu tuần (thứ Hai)
      const d = new Date(now);
      const day = d.getDay(); // 0=CN
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      // Check nếu đây là from hay to
      if (activeInput.id && activeInput.id.includes('-to')) {
        // Cuối tuần (CN)
        d.setDate(d.getDate() + 6);
      }
      date = toDateString(d);
    } else if (preset === 'month') {
      if (activeInput.id && activeInput.id.includes('-to')) {
        // Ngày cuối tháng
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        date = toDateString(last);
      } else {
        date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      }
    } else if (preset === 'quarter') {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      if (activeInput.id && activeInput.id.includes('-to')) {
        const last = new Date(now.getFullYear(), qm + 3, 0);
        date = toDateString(last);
      } else {
        date = `${now.getFullYear()}-${String(qm+1).padStart(2,'0')}-01`;
      }
    } else if (preset === 'year') {
      if (activeInput.id && activeInput.id.includes('-to')) {
        date = `${now.getFullYear()}-12-31`;
      } else {
        date = `${now.getFullYear()}-01-01`;
      }
    }

    if (date) {
      activeInput.value = date;
      updateDisplay(activeInput);
      fireChange(activeInput);
      // Chuyển lịch về tháng vừa chọn
      const [y, m] = date.split('-').map(Number);
      viewYear = y; viewMonth = m - 1;
      renderCalendar();
    }
  }

  function toDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatDisplayDate(isoStr) {
    if (!isoStr) return null;
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // ---- Render lưới lịch ----
  function renderCalendar() {
    if (!popup) return;
    popup.querySelector('#rdp-month-year-label').textContent = `${MONTHS_VI[viewMonth]} ${viewYear}`;

    const grid = popup.querySelector('#rdp-days-grid');
    grid.innerHTML = '';

    const today = toDateString(new Date());
    const selectedVal = activeInput ? activeInput.value : '';

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay  = new Date(viewYear, viewMonth + 1, 0);

    // Day-of-week offset (tuần bắt đầu Thứ Hai: 0=T2, 6=CN)
    let startDow = firstDay.getDay(); // 0=CN, 1=T2, ...
    startDow = (startDow === 0) ? 6 : startDow - 1; // Convert: T2=0 ... CN=6

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) {
      const empty = document.createElement('div');
      empty.className = 'rdp-day empty';
      grid.appendChild(empty);
    }

    // Day cells
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const cell = document.createElement('div');
      const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      cell.className = 'rdp-day';
      if (iso === today) cell.classList.add('today');
      if (iso === selectedVal) cell.classList.add('selected');
      cell.textContent = day;
      cell.addEventListener('click', e => {
        e.stopPropagation();
        if (activeInput) {
          activeInput.value = iso;
          updateDisplay(activeInput);
          fireChange(activeInput);
        }
        closePopup();
      });
      grid.appendChild(cell);
    }
  }

  // ---- Vị trí popup ----
  function positionPopup(trigger) {
    const rect = trigger.getBoundingClientRect();
    const popW = 280;
    const popH = 380;

    let left = rect.left;
    let top  = rect.bottom + 4;

    // Tránh ra khỏi cửa sổ
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.innerHeight - 8) top = rect.top - popH - 4;

    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  }

  // ---- Mở popup ----
  function openPopup(input, triggerEl) {
    if (!popup) createPopup();
    activeInput = input;

    // Set view tới tháng hiện tại của input (hoặc hôm nay)
    const val = input.value;
    if (val) {
      const [y, m] = val.split('-').map(Number);
      viewYear = y; viewMonth = m - 1;
    } else {
      const now = new Date();
      viewYear = now.getFullYear(); viewMonth = now.getMonth();
    }

    renderCalendar();
    positionPopup(triggerEl);
    popup.style.display = 'block';

    // Close on outside click (next tick)
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick, { once: true });
    }, 0);
  }

  function closePopup() {
    if (popup) popup.style.display = 'none';
    activeInput = null;
  }

  function onOutsideClick(e) {
    if (popup && !popup.contains(e.target)) {
      closePopup();
    } else if (popup && popup.style.display !== 'none') {
      // Still open — reattach listener
      document.addEventListener('click', onOutsideClick, { once: true });
    }
  }

  // ---- Fire change event ----
  function fireChange(input) {
    const event = new Event('change', { bubbles: true });
    input.dispatchEvent(event);
    // Also call onchange attribute if set
    if (typeof input.onchange === 'function') {
      try { input.onchange.call(input, event); } catch(e) {}
    }
    // Support oninput attribute (some filters use oninput)
    const onchangeAttr = input.getAttribute('onchange');
    if (onchangeAttr) {
      try { new Function(onchangeAttr).call(input); } catch(e) {}
    }
  }

  // ---- Cập nhật display text sau khi chọn ----
  function updateDisplay(input) {
    const wrapper = input.parentElement;
    if (!wrapper || !wrapper.classList.contains('rdp-wrapper')) return;
    const display = wrapper.querySelector('.rdp-display');
    if (!display) return;
    const formatted = formatDisplayDate(input.value);
    if (formatted) {
      display.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${formatted}`;
      display.classList.remove('empty');
    } else {
      display.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> <span style="opacity:0.5">Chọn ngày</span>`;
      display.classList.add('empty');
    }
  }

  // ---- Wrap một input ----
  function wrapDateInput(input) {
    // Tránh wrap lại nếu đã wrap
    if (input.parentElement && input.parentElement.classList.contains('rdp-wrapper')) return;
    // Bỏ qua các input trong form nhập liệu (chỉ wrap những input search filter)
    if (!input.classList.contains('form-control-date')) return;

    // Tạo wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'rdp-wrapper';

    // Clone style từ parent div nếu có
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Ẩn native input (giữ nguyên để value vẫn đọc được)
    input.style.position = 'absolute';
    input.style.opacity = '0';
    input.style.width = '0';
    input.style.height = '0';
    input.style.pointerEvents = 'none';

    // Tạo display element
    const display = document.createElement('div');
    display.className = 'rdp-display empty';
    display.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> <span style="opacity:0.5">Chọn ngày</span>`;
    wrapper.appendChild(display);

    // Khởi tạo display với giá trị hiện có nếu có
    updateDisplay(input);

    // Click vào display → mở popup
    display.addEventListener('click', e => {
      e.stopPropagation();
      if (popup && popup.style.display !== 'none' && activeInput === input) {
        closePopup();
      } else {
        openPopup(input, wrapper);
      }
    });
  }

  // ---- Init: wrap tất cả inputs khi DOM sẵn sàng ----
  function init() {
    document.querySelectorAll('input[type="date"].form-control-date').forEach(wrapDateInput);
  }

  // Chạy sau DOMContentLoaded hoặc ngay nếu đã loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Delay nhỏ để đảm bảo tất cả elements đã mount
    setTimeout(init, 100);
  }

  // Expose để có thể gọi lại nếu cần re-init
  window.rdpInit = init;
  window.rdpWrapInput = wrapDateInput;
})();

// rdpClearInput: Xóa giá trị ngày và cập nhật display (dùng trong clearXxxDateFilter)
window.rdpClearInput = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = '';
  const wrapper = input.parentElement;
  if (wrapper && wrapper.classList.contains('rdp-wrapper')) {
    const display = wrapper.querySelector('.rdp-display');
    if (display) {
      display.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> <span style="opacity:0.5">Chọn ngày</span>';
      display.classList.add('empty');
    }
  }
};

// rdpSetInput: Đặt giá trị ngày (ISO yyyy-mm-dd) và cập nhật display
window.rdpSetInput = function(inputId, isoValue) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = isoValue || '';
  const wrapper = input.parentElement;
  if (wrapper && wrapper.classList.contains('rdp-wrapper')) {
    const display = wrapper.querySelector('.rdp-display');
    if (display) {
      if (isoValue) {
        const [y, m, d] = isoValue.split('-');
        display.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ' + d + '/' + m + '/' + y;
        display.classList.remove('empty');
      } else {
        display.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> <span style="opacity:0.5">Chọn ngày</span>';
        display.classList.add('empty');
      }
    }
  }
};
