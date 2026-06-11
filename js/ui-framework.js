
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
      renderSalesTable();
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
    document.getElementById("page-display-subtitle").innerText = titles[tabId].sub;
  }

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

  let totalVal = 0;
  state.products.forEach(p => {
    let stock = p.initialStock || 0;
    let value = (p.initialStock || 0) * (p.initialCost || 0);

    const chronologicalVouchers = [...state.vouchers];
    chronologicalVouchers.sort((a, b) => a.date.localeCompare(b.date));

    chronologicalVouchers.forEach(v => {
      if (v.date > toDate) return;
      if (v.type === "purchase") {
        const item = v.items.find(i => i.productId === p.id);
        if (item) {
          stock += item.qty;
          value += item.amount;
        }
      } else if (v.type === "sales") {
        const item = v.items.find(i => i.productId === p.id);
        if (item) {
          stock -= item.qty;
          value -= (item.cogsAmount || 0);
        }
      }
    });
    totalVal += value;
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
        
        
      </div>
    `;
  } else if (v.type === "purchase") {
    // Mua hàng -> Phiếu Nhập Kho (Mẫu số 01 - VT)
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
            <span class="template-bold">Mẫu số 01 - VT</span><br>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">PHIẾU NHẬP KHO</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8, 10)} tháng ${v.date.substring(5, 7)} năm ${v.date.substring(0, 4)}</span>
        </div>
        
        <div class="voucher-entries-note">
          <span>Số: <span class="template-bold">${v.id}</span></span><br>
          <span>Nợ TK: <span class="template-bold">156</span></span><br>
          ${v.taxAmount > 0 ? `<span>Nợ TK: <span class="template-bold">1331</span></span><br>` : ""}
          <span>Có TK: <span class="template-bold">${v.paymentMethod}</span></span>
        </div>
        
        <div style="margin-top:20px;">
          <div class="voucher-info-row">
            <span class="info-label">- Họ và tên người giao:</span>
            <span class="info-dotted">${partnerName}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Lý do nhập kho:</span>
            <span class="info-dotted">${v.description}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Nhập tại kho:</span>
            <span class="info-dotted">Kho thành phẩm Rạng Đông</span>
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
              <td colspan="5" style="text-align:right; font-weight:bold; text-transform:uppercase;">Tổng cộng tiền thanh toán:</td>
              <td style="text-align:right; font-weight:bold; color:var(--color-primary);">${formatVND(v.totalAmount).replace("đ", "")}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="voucher-amount-word">
          Tổng số tiền (viết bằng chữ): <span style="font-weight:bold; font-style:italic;">${numberToVietnameseWords(v.totalAmount)}</span>
        </div>
        
        
      </div>
    `;
  } else if (v.type === "purchase_return") {
    // Trả lại hàng -> Phiếu Nhập Kho (Mẫu số 01 - VT)
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
            <span class="template-bold">Mẫu số 01 - VT</span><br>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">PHIẾU NHẬP KHO HÀNG TRẢ LẠI</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8, 10)} tháng ${v.date.substring(5, 7)} năm ${v.date.substring(0, 4)}</span>
        </div>
        
        <div class="voucher-entries-note">
          <span>Số: <span class="template-bold">${v.id}</span></span><br>
          <span>Nợ TK: <span class="template-bold">511, 156</span></span><br>
          ${v.taxAmount > 0 ? `<span>Nợ TK: <span class="template-bold">3331</span></span><br>` : ""}
          <span>Có TK: <span class="template-bold">${v.paymentMethod}, 632</span></span><br>
        </div>
        
        <div style="margin-top:20px;">
          <div class="voucher-info-row">
            <span class="info-label">- Họ và tên người giao hàng:</span>
            <span class="info-dotted">${partnerName}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Lý do nhập trả:</span>
            <span class="info-dotted">${v.description}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Nhập tại kho:</span>
            <span class="info-dotted">Kho thành phẩm Rạng Đông</span>
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
              <td colspan="5" style="text-align:right; font-weight:bold; text-transform:uppercase;">Tổng cộng tiền nhận trả lại:</td>
              <td style="text-align:right; font-weight:bold; color:var(--color-primary);">${formatVND(v.totalAmount).replace("đ", "")}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="voucher-amount-word">
          Tổng số tiền (viết bằng chữ): <span style="font-weight:bold; font-style:italic;">${numberToVietnameseWords(v.totalAmount)}</span>
        </div>
        
        
      </div>
    `;
  } else if (v.type === "sales") {
    // Bán hàng -> Phiếu giao hàng / hóa đơn bán hàng theo chuẩn mẫu thực tế của Rạng Đông
    let grossTotal = 0;
    let totalDiscount = 0;

    v.items.forEach(item => {
      const itemGross = (item.qty || 0) * (item.price || 0);
      const discountPercent = item.discount || 0;
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
      const gcVal = (item.discount !== undefined && item.discount !== null) ? item.discount : "0";
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

        <!-- Chữ số tiền viết bằng chữ & ghi chú -->
        <div style="margin-bottom: 12px; font-size: 11px; line-height: 1.3;">
          <div style="margin-bottom: 3px;">
            <strong>Số tiền viết bằng chữ:</strong> <span style="font-style: italic;">${numberToVietnameseWords(v.totalAmount)}</span>
          </div>
          <div>
            <strong>Ghi chú:</strong> <span style="font-style: italic; color: #374151;">${v.notes || "hàng thừa trả lại dơ bẩn không thu lại. Không thu lại nút bịt"}</span>
          </div>
        </div>

        <!-- Chữ ký và dấu (Nhiệm vụ người lập, giao, nhận) -->
        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 12px; font-size: 10.5px; page-break-inside: avoid; break-inside: avoid;">
          <div style="width: 30%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người nhận hàng</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 38px;"></div>
            <div style="border-top: 1px dotted #888; width: 80%; margin: 0 auto; padding-top: 4px; color: #555; font-size: 9.5px;">Họ tên khách nhận</div>
          </div>
          
          <div style="width: 30%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người giao hàng</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 38px;"></div>
            <div style="border-top: 1px dotted #888; width: 80%; margin: 0 auto; padding-top: 4px; color: #555; font-size: 9.5px;">Nhân viên giao nhận</div>
          </div>
          
          <div style="width: 30%; page-break-inside: avoid; break-inside: avoid;">
            <strong>Người lập phiếu</strong><br>
            <span style="font-style: italic; font-size: 9.5px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 38px;"></div>
            <div style="border-top: 1px dotted #888; width: 80%; margin: 0 auto; padding-top: 4px; color: #555; font-size: 9.5px;">Nhân viên lập phiếu</div>
          </div>
        </div>

      </div>
    `;
  } else if (v.type.startsWith("escrow_") || v.type === "receipt" || v.type === "payment") {
    // Nghiệp vụ ký quỹ hoặc Thu/Chi -> PHIẾU THU hoặc PHIẾU CHI
    const isReceipt = v.type === "escrow_receive" || v.type === "escrow_refund_pay" || v.type === "receipt";
    const title = isReceipt ? "PHIẾU THU" : "PHIẾU CHI";
    const templateCode = isReceipt ? "Mẫu số 01 - TT" : "Mẫu số 02 - TT";

    // Tìm tài khoản định khoản tương ứng để hiện lên phiếu thu/chi
    const e = v.entries[0] || { debit: "111", credit: "244" };

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
            <span class="template-bold">${templateCode}</span><br>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">${title}</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8, 10)} tháng ${v.date.substring(5, 7)} năm ${v.date.substring(0, 4)}</span>
        </div>
        
        <div class="voucher-entries-note">
          <span>Số: <span class="template-bold">${v.id}</span></span><br>
          <span>Nợ TK: <span class="template-bold">${e.debit}</span></span><br>
          <span>Có TK: <span class="template-bold">${e.credit}</span></span>
        </div>
        
        <div style="margin-top:20px;">
          <div class="voucher-info-row">
            <span class="info-label">${isReceipt ? "- Người nộp tiền:" : "- Người nhận tiền:"}</span>
            <span class="info-dotted" style="font-weight:bold;">${partnerName}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Nội dung giao dịch:</span>
            <span class="info-dotted">${v.description}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Số tiền giao dịch:</span>
            <span class="info-dotted" style="font-weight:bold;">${formatVND(v.amount)}</span>
          </div>
          ${relatedSalesVoucherHtml}
          <div class="voucher-info-row">
            <span class="info-label">- Bằng chữ:</span>
            <span class="info-dotted" style="font-style:italic;">${numberToVietnameseWords(v.amount)}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Kèm theo chứng từ:</span>
            <span class="info-dotted">Hợp đồng bảo lãnh đại lý & Cam kết thực hiện nghĩa vụ</span>
          </div>
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