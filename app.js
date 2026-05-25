/* ==========================================================================
   BỘ MÁY NGHIỆP VỤ KẾ TOÁN VÀ ĐIỀU KHIỂN GIAO DIỆN (APP.JS)
   Tính toán giá vốn bình quân gia quyền liên hoàn & Quản lý Nhật ký kép
   ========================================================================== */

// 1. STATE TOÀN CỤC CỦA ỨNG DỤNG
let state = {
  companyName: "",
  address: "",
  taxCode: "",
  accountingStandard: "TT200",
  products: [],
  partners: [],
  initialBalances: {},
  vouchers: []
};

// 2. KHỞI CHẠY KHI TRANG ĐƯỢC TẢI
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

// Khởi tạo ứng dụng: Load dữ liệu từ localStorage hoặc dùng mặc định
function initApp() {
  const localData = localStorage.getItem("rd_accounting_db");
  if (localData) {
    try {
      state = JSON.parse(localData);
      // Tự động nâng cấp lên CSDL Excel nếu đang sử dụng CSDL Demo hoặc CSDL trống
      if (!state.products || state.products.length < 10) {
        if (typeof PREPOPULATED_DATABASE !== "undefined") {
          console.log("Auto-upgrading to integrated Excel database...");
          state = JSON.parse(JSON.stringify(PREPOPULATED_DATABASE));
          saveState();
        }
      }
    } catch (e) {
      console.error("Lỗi đọc dữ liệu localStorage, nạp lại mặc định:", e);
      state = typeof PREPOPULATED_DATABASE !== "undefined" ? JSON.parse(JSON.stringify(PREPOPULATED_DATABASE)) : JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  } else {
    // Nạp dữ liệu mẫu ban đầu từ Excel nạp sẵn hoặc data.js
    state = typeof PREPOPULATED_DATABASE !== "undefined" ? JSON.parse(JSON.stringify(PREPOPULATED_DATABASE)) : JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveState();
  }

  // Đặt theme mặc định (Tối)
  const isLightTheme = localStorage.getItem("theme") === "light";
  if (isLightTheme) {
    document.body.classList.add("light-theme");
  }

  // Khởi tạo cache sản phẩm & datalist đối tác Excel
  initExcelIntegration();

  // Cập nhật thông tin công ty lên giao diện
  updateCompanyUI();
  
  // Chạy lại thuật toán tính toán kế toán & giá vốn để đồng bộ
  recalculateAccounting();
  
  // Mở tab mặc định
  switchTab("dashboard");
}

// Lưu trạng thái vào localStorage
function saveState() {
  localStorage.setItem("rd_accounting_db", JSON.stringify(state));
}

// Cập nhật các thông tin công ty lên giao diện
function updateCompanyUI() {
  document.getElementById("header-company-name").innerText = state.companyName || "CÔNG TY CP RẠNG ĐÔNG";
  document.getElementById("setting-company-name").value = state.companyName || "";
  document.getElementById("setting-tax-code").value = state.taxCode || "";
  document.getElementById("setting-address").value = state.address || "";
  
  // Toggle active button Thông tư
  if (state.accountingStandard === "TT200") {
    document.getElementById("btn-standard-200").classList.add("active");
    document.getElementById("btn-standard-133").classList.remove("active");
  } else {
    document.getElementById("btn-standard-200").classList.remove("active");
    document.getElementById("btn-standard-133").classList.add("active");
  }
}

// Lưu thiết lập doanh nghiệp
function saveCompanySettings() {
  state.companyName = document.getElementById("setting-company-name").value.trim() || "CÔNG TY CP RẠNG ĐÔNG";
  state.taxCode = document.getElementById("setting-tax-code").value.trim();
  state.address = document.getElementById("setting-address").value.trim();
  saveState();
  updateCompanyUI();
  showToast("Lưu thông tin doanh nghiệp thành công!", "success");
}

// Thay đổi chế độ kế toán (TT200 / TT133)
function setAccountingStandard(standard) {
  state.accountingStandard = standard;
  saveState();
  updateCompanyUI();
  recalculateAccounting();
  showToast(`Đã chuyển sang chế độ kế toán theo ${standard === "TT200" ? "Thông tư 200/2014/TT-BTC" : "Thông tư 133/2016/TT-BTC"}`, "info");
}

// 3. THUẬT TOÁN KẾ TOÁN CỐT LÕI (ENGINE)
// - Tính giá vốn bình quân gia quyền liên hoàn sau mỗi lần nhập hàng
// - Tự động tạo bút toán Nhật ký kép đồng bộ
function recalculateAccounting() {
  // BƯỚC A: Reset lại danh mục sản phẩm về trạng thái số dư đầu kỳ
  // Ta lấy số lượng tồn đầu kỳ và giá vốn đầu kỳ từ danh mục gốc trong data.js hoặc từ state
  // Ở đây, để đơn giản, ta xem dữ liệu ban đầu trong state.products là số dư đầu kỳ (trước khi phát sinh các voucher)
  // Nhưng để tính toán chuẩn xác, ta phải tính lại tồn kho bằng cách:
  // Lấy danh mục sản phẩm rỗng (hoặc chỉ giữ thông số khởi tạo đầu kỳ), sau đó chạy lần lượt các hóa đơn theo thời gian.
  
  // Lấy số dư đầu kỳ của hàng hóa từ sản phẩm gốc ban đầu
  const productBalanceMap = {};
  const originalProducts = DEFAULT_DATA.products;
  
  // Đọc số lượng đầu kỳ của sản phẩm (nếu sản phẩm mới khai báo thì xem như tồn 0, đơn giá 0)
  state.products.forEach(p => {
    // Tìm thông số khởi tạo của sản phẩm này trong dữ liệu mặc định ban đầu
    const orig = originalProducts.find(o => o.id === p.id);
    const initStock = orig ? orig.stock : (p.initialStock !== undefined ? p.initialStock : (p.stock || 0));
    const initCost = orig ? orig.avgCost : (p.initialCost !== undefined ? p.initialCost : (p.avgCost || 0));
    productBalanceMap[p.id] = {
      stock: initStock,
      avgCost: initCost,
      totalValue: initStock * initCost
    };
  });

  // BƯỚC B: Sắp xếp các chứng từ kế toán theo ngày hạch toán (Chronological Order)
  state.vouchers.sort((a, b) => new Date(a.date) - new Date(b.date));

  // BƯỚC C: Duyệt qua từng chứng từ để tính giá vốn và tự động cập nhật Định khoản kép
  state.vouchers.forEach(v => {
    if (v.type === "purchase") {
      // Mua hàng: Tăng số lượng và tăng giá trị tồn
      let itemSubtotal = 0;
      v.items.forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          const oldStock = p.stock;
          const oldVal = p.totalValue;
          
          p.stock += item.qty;
          p.totalValue += item.amount; // Thành tiền mua chưa thuế
          
          if (p.stock > 0) {
            p.avgCost = Math.round(p.totalValue / p.stock);
          } else {
            p.avgCost = 0;
          }
        }
        itemSubtotal += item.amount;
      });

      // Tự động hạch toán mua hàng nhập kho:
      // Nợ TK 156: Giá mua hàng
      // Nợ TK 1331: Thuế GTGT đầu vào
      // Có TK 331 (Chưa thanh toán), TK 111 (Tiền mặt), TK 112 (Chuyển khoản)
      const taxRate = v.taxRate || 0;
      const taxAmount = Math.round(itemSubtotal * (taxRate / 100));
      const totalAmount = itemSubtotal + taxAmount;

      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;

      v.entries = [
        { debit: "156", credit: v.paymentMethod, amount: itemSubtotal, desc: `Nhập kho ${v.description}` },
      ];
      if (taxAmount > 0) {
        v.entries.push({ debit: "1331", credit: v.paymentMethod, amount: taxAmount, desc: "Thuế GTGT đầu vào được khấu trừ" });
      }

    } else if (v.type === "sales") {
      // Bán hàng: Tính giá vốn xuất kho và giảm tồn kho
      let totalCogs = 0;
      let itemSubtotal = 0;

      v.items.forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          // Lưu giá vốn bình quân tại thời điểm xuất kho vào chi tiết hóa đơn
          item.cogsUnit = p.avgCost;
          item.cogsAmount = Math.round(item.qty * p.avgCost);
          
          // Trừ tồn kho
          p.stock -= item.qty;
          p.totalValue -= item.cogsAmount;
          
          totalCogs += item.cogsAmount;
        }
        itemSubtotal += item.amount; // Doanh số bán chưa thuế
      });

      v.cogsAmount = totalCogs;
      const taxRate = v.taxRate || 0;
      const taxAmount = Math.round(itemSubtotal * (taxRate / 100));
      const totalAmount = itemSubtotal + taxAmount;

      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;

      // Định khoản kép cho bán hàng (2 cặp bút toán song song):
      // Bút toán 1: Ghi nhận doanh thu
      // Nợ TK 111, 112, 131 / Có TK 511 (Doanh thu), Có TK 3331 (Thuế GTGT đầu ra)
      v.entries = [
        { debit: v.paymentMethod, credit: "511", amount: itemSubtotal, desc: `Doanh thu ${v.description}` }
      ];
      if (taxAmount > 0) {
        v.entries.push({ debit: v.paymentMethod, credit: "3331", amount: taxAmount, desc: "Thuế GTGT đầu ra phải nộp" });
      }

      // Bút toán 2: Ghi nhận giá vốn
      // Nợ TK 632 / Có TK 156
      if (totalCogs > 0) {
        v.entries.push({ debit: "632", credit: "156", amount: totalCogs, desc: `Giá vốn ${v.description}` });
      }

    } else if (v.type === "escrow_pay") {
      // Ký quỹ mang đi: Nợ TK 244 (hoặc 1386) / Có TK 111 hoặc 112
      const targetAcct = state.accountingStandard === "TT200" ? "244" : "1386";
      v.entries = [
        { debit: targetAcct, credit: v.paymentMethod, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_receive") {
      // Nhận ký quỹ đối tác: Nợ TK 111 hoặc 112 / Có TK 344 (hoặc 3386)
      const targetAcct = state.accountingStandard === "TT200" ? "344" : "3386";
      v.entries = [
        { debit: v.paymentMethod, credit: targetAcct, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_refund_pay") {
      // Thu hồi ký quỹ mang đi: Nợ TK 111 hoặc 112 / Có TK 244 (hoặc 1386)
      const targetAcct = state.accountingStandard === "TT200" ? "244" : "1386";
      v.entries = [
        { debit: v.paymentMethod, credit: targetAcct, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_refund_receive") {
      // Hoàn trả ký quỹ nhận về: Nợ TK 344 (hoặc 3386) / Có TK 111 hoặc 112
      const targetAcct = state.accountingStandard === "TT200" ? "344" : "3386";
      v.entries = [
        { debit: targetAcct, credit: v.paymentMethod, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "receipt") {
      // Phiếu Thu: Nợ TK 111 hoặc 112 / Có TK 131 (hoặc định khoản sẵn từ Excel)
      if (!v.entries || v.entries.length === 0) {
        v.entries = [
          { debit: v.paymentMethod || "111", credit: "131", amount: v.amount, desc: v.description }
        ];
      }
    } else if (v.type === "payment") {
      // Phiếu Chi: Nợ TK 331 (hoặc định khoản sẵn từ Excel) / Có TK 111 hoặc 112
      if (!v.entries || v.entries.length === 0) {
        v.entries = [
          { debit: "331", credit: v.paymentMethod || "111", amount: v.amount, desc: v.description }
        ];
      }
    }
  });

  // BƯỚC D: Cập nhật lại số liệu tồn kho cuối cùng vào State để hiển thị danh mục
  state.products.forEach(p => {
    const finalVal = productBalanceMap[p.id];
    if (finalVal) {
      p.stock = finalVal.stock;
      p.avgCost = finalVal.avgCost;
      p.totalValue = finalVal.totalValue;
    }
  });

  // Cập nhật lại cache sản phẩm & đối tác
  if (typeof cacheProductOptions === "function") {
    cacheProductOptions();
  }
  if (typeof updateExcelHubUI === "function") {
    updateExcelHubUI();
  }

  // Lưu lại và vẽ giao diện
  saveState();
  refreshUI();
}

// Cập nhật toàn bộ giao diện dựa trên tab đang hiển thị
function refreshUI() {
  // Render lại các bảng dữ liệu bằng các khối try/catch cô lập để tránh lỗi dây chuyền
  try {
    renderDashboard();
  } catch (e) {
    console.error("Lỗi vẽ bảng Dashboard:", e);
  }
  
  try {
    renderPurchaseTable();
  } catch (e) {
    console.error("Lỗi vẽ bảng mua hàng:", e);
  }
  
  try {
    renderSalesTable();
  } catch (e) {
    console.error("Lỗi vẽ bảng bán hàng:", e);
  }
  
  try {
    renderInventoryTable();
  } catch (e) {
    console.error("Lỗi vẽ bảng tồn kho:", e);
  }
  
  try {
    renderEscrowTable();
  } catch (e) {
    console.error("Lỗi vẽ bảng ký quỹ:", e);
  }
  
  try {
    generateReport(); // Tự động làm mới báo cáo hiện hành
  } catch (e) {
    console.error("Lỗi tạo báo cáo kế toán:", e);
  }
}

// 4. ĐIỀU HƯỚNG TAB CHỨNG TỪ (UI TABS SWITCHER)
function switchTab(tabId) {
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
    dashboard: { title: "Bàn làm việc", sub: "Tổng quan tình hình tài chính công ty Rạng Đông" },
    purchase: { title: "Quản lý mua hàng", sub: "Hóa đơn mua hàng hóa, nguyên vật liệu nhập kho" },
    sales: { title: "Quản lý bán hàng", sub: "Hóa đơn bán sản phẩm bóng đèn, phích nước và công nợ khách hàng" },
    inventory: { title: "Quản lý kho hàng", sub: "Theo dõi thẻ kho và giá trị tồn kho theo phương pháp bình quân liên hoàn" },
    escrow: { title: "Ký quỹ & Ký cược", sub: "Theo dõi các khoản đặt cọc mang đi và nhận bảo lãnh từ đại lý" },
    reports: { title: "Hệ thống báo cáo kế toán", sub: "Nhật ký chung, Sổ cái tài khoản và Bảng cân đối phát sinh" },
    settings: { title: "Thiết lập hệ thống", sub: "Cấu hình doanh nghiệp và quản lý cơ sở dữ liệu" }
  };

  if (titles[tabId]) {
    document.getElementById("page-display-title").innerText = titles[tabId].title;
    document.getElementById("page-display-subtitle").innerText = titles[tabId].sub;
  }

  // Khởi tạo các combo-box hoặc nạp dữ liệu chuyên biệt cho từng màn hình
  if (tabId === "purchase") {
    populatePartnerDropdown("pur-partner", "supplier");
    resetPurchaseForm();
  } else if (tabId === "sales") {
    populatePartnerDropdown("sale-partner", "customer");
    resetSalesForm();
  } else if (tabId === "escrow") {
    populatePartnerDropdown("esc-partner", null);
    handleEscrowTypeChange();
  } else if (tabId === "inventory") {
    populateProductLedgerDropdown();
    renderInventoryTable(); // Đảm bảo bảng tồn kho luôn được vẽ lại khi vào tab
    renderStockLedger();
  } else if (tabId === "reports") {
    populateReportAccountDropdown();
  }

  // Scroll to top
  document.querySelector(".content-body").scrollTop = 0;
}

// 5. RENDER DỮ LIỆU PHÂN HỆ DASHBOARD (KPIs & OFFLINE CHART)
function renderDashboard() {
  // Tính toán các chỉ số KPI
  // A. Tổng quỹ tiền: Dư nợ TK 111 + TK 112
  const bal111 = getAccountBalance("111");
  const bal112 = getAccountBalance("112");
  document.getElementById("kpi-cash-value").innerText = formatVND(bal111 + bal112);

  // B. Tổng doanh thu kỳ này: Tổng Có phát sinh TK 511
  let totalRevenue = 0;
  state.vouchers.forEach(v => {
    if (v.type === "sales") {
      v.items.forEach(item => {
        totalRevenue += item.amount;
      });
    }
  });
  document.getElementById("kpi-revenue-value").innerText = formatVND(totalRevenue);

  // C. Giá trị tồn kho: Tổng giá trị hàng hóa
  let totalInventoryVal = 0;
  state.products.forEach(p => {
    totalInventoryVal += p.totalValue;
  });
  document.getElementById("kpi-inventory-value").innerText = formatVND(totalInventoryVal);

  // D. Ký quỹ ký cược: Dư nợ TK 244 (Ký quỹ đi) - Dư Có TK 344 (Ký quỹ nhận)
  const acct244 = state.accountingStandard === "TT200" ? "244" : "1386";
  const acct344 = state.accountingStandard === "TT200" ? "344" : "3386";
  const bal244 = getAccountBalance(acct244);
  const bal344 = getAccountBalance(acct344);
  document.getElementById("kpi-escrow-value").innerText = formatVND(bal244 + bal344);

  // RENDER BIỂU ĐỒ OFFLINE BẰNG SVG TRỰC QUAN
  renderDashboardSVGChart();

  // RENDER HOẠT ĐỘNG GẦN ĐÂY
  renderRecentActivities();
}

// Hàm vẽ biểu đồ cột SVG cực kỳ đẹp mắt và 100% offline
function renderDashboardSVGChart() {
  const container = document.getElementById("dashboard-chart-container");
  if (!container) return;

  // Lấy dữ liệu bán hàng 4 tháng hoặc 5 giao dịch gần đây để vẽ
  const salesVouchers = state.vouchers.filter(v => v.type === "sales").slice(-5);

  if (salesVouchers.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">Chưa có giao dịch bán hàng nào để vẽ biểu đồ phân tích.</div>`;
    return;
  }

  // Xác định cực đại tiền để định thang tỉ lệ
  let maxMoney = 1000000; // Giá trị tối thiểu để tránh lỗi chia cho 0
  salesVouchers.forEach(v => {
    const totalAmount = v.totalAmount - (v.taxAmount || 0); // Doanh thu chưa thuế
    const cogs = v.cogsAmount || 0;
    if (totalAmount > maxMoney) maxMoney = totalAmount;
    if (cogs > maxMoney) maxMoney = cogs;
  });
  maxMoney = maxMoney * 1.15; // Tạo khoảng đệm trên đỉnh biểu đồ

  let barsHTML = "";
  const chartHeight = 200;
  const chartWidth = 400;
  const barWidth = 24;
  const groupSpacing = 50;

  salesVouchers.forEach((v, index) => {
    const revVal = v.totalAmount - (v.taxAmount || 0);
    const cogsVal = v.cogsAmount || 0;

    const revHeight = (revVal / maxMoney) * chartHeight;
    const cogsHeight = (cogsVal / maxMoney) * chartHeight;

    const xPos = 40 + index * (barWidth * 2 + groupSpacing);
    const revY = 220 - revHeight;
    const cogsY = 220 - cogsHeight;

    // Cột Doanh thu (Màu xanh teal mượt mà)
    barsHTML += `
      <g>
        <rect x="${xPos}" y="${revY}" width="${barWidth}" height="${revHeight}" fill="#0ea5e9" rx="4"/>
        <text x="${xPos + barWidth/2}" y="${revY - 6}" font-size="9" fill="var(--text-primary)" text-anchor="middle" font-weight="700">${Math.round(revVal/1000)}k</text>
      </g>
    `;

    // Cột Giá vốn (Màu cam sáng ấm áp)
    barsHTML += `
      <g>
        <rect x="${xPos + barWidth + 6}" y="${cogsY}" width="${barWidth}" height="${cogsHeight}" fill="#f59e0b" rx="4"/>
        <text x="${xPos + barWidth + 6 + barWidth/2}" y="${cogsY - 6}" font-size="9" fill="var(--text-primary)" text-anchor="middle" font-weight="700">${Math.round(cogsVal/1000)}k</text>
      </g>
    `;

    // Nhãn trục X (Mã chứng từ)
    barsHTML += `
      <text x="${xPos + barWidth + 3}" y="240" font-size="10" fill="var(--text-secondary)" text-anchor="middle" font-weight="600">${v.id.substring(8)}</text>
    `;
  });

  container.innerHTML = `
    <svg class="svg-chart" viewBox="0 0 450 260" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
      <!-- Trực tọa độ ngang ngăn cách -->
      <line x1="20" y1="220" x2="430" y2="220" stroke="var(--border-color)" stroke-width="2"/>
      
      <!-- Nạp dữ liệu các cột đã dựng -->
      ${barsHTML}
      
      <!-- Chú thích ký hiệu biểu đồ -->
      <g transform="translate(20, 10)">
        <rect x="0" y="0" width="12" height="12" fill="#0ea5e9" rx="2"/>
        <text x="18" y="10" font-size="11" fill="var(--text-secondary)" font-weight="600">Doanh thu bán</text>
        
        <rect x="120" y="0" width="12" height="12" fill="#f59e0b" rx="2"/>
        <text x="138" y="10" font-size="11" fill="var(--text-secondary)" font-weight="600">Giá vốn hàng bán</text>
      </g>
    </svg>
  `;
}

// Kết xuất danh sách hoạt động gần đây
function renderRecentActivities() {
  const container = document.getElementById("dashboard-recent-activities");
  if (!container) return;

  // Lấy tối đa 6 giao dịch gần nhất
  const recents = [...state.vouchers].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  if (recents.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">Không có giao dịch gần đây.</div>`;
    return;
  }

  const badgeLabels = {
    purchase: "Mua hàng",
    sales: "Bán hàng",
    escrow_pay: "Ký quỹ đi",
    escrow_receive: "Nhận ký quỹ",
    escrow_refund_pay: "Thu ký quỹ",
    escrow_refund_receive: "Trả ký quỹ"
  };

  container.innerHTML = recents.map(v => {
    const amount = v.totalAmount || v.amount || 0;
    return `
      <div class="activity-item type-${v.type}">
        <div class="activity-desc">
          <span class="activity-title">${v.description}</span>
          <span class="activity-date">${v.date} &bull; ${v.id}</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
          <span class="activity-price font-numeric">${formatVND(amount)}</span>
          <span class="badge ${v.type === 'sales' ? 'badge-success' : v.type === 'purchase' ? 'badge-info' : 'badge-warning'}" style="font-size:9px; padding:2px 6px;">
            ${badgeLabels[v.type] || "Chứng từ"}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

// 6. RENDER DỮ LIỆU PHÂN HỆ MUA HÀNG (PURCHASING)
function renderPurchaseTable() {
  const tbody = document.getElementById("purchase-table-body");
  if (!tbody) return;

  const purchases = state.vouchers.filter(v => v.type === "purchase");

  if (purchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa lập hóa đơn mua hàng nào. Vui lòng nhấn nút "Lập hóa đơn mua hàng".</td></tr>`;
    return;
  }

  tbody.innerHTML = purchases.map(v => {
    const rawVal = v.totalAmount - (v.taxAmount || 0);
    return `
      <tr>
        <td class="font-numeric" style="color: var(--color-primary); font-weight:700;">${v.id}</td>
        <td>${v.date}</td>
        <td><span style="font-weight:600;">${v.partnerName}</span></td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '331' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '331' ? 'Công nợ (331)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric">${formatVND(rawVal)}</td>
        <td class="text-right font-numeric">${formatVND(v.taxAmount)}</td>
        <td class="text-right font-numeric" style="font-weight:700;">${formatVND(v.totalAmount)}</td>
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
            <button class="btn btn-secondary btn-sm" onclick="viewVoucher('${v.id}')">Xem/In</button>
            <button class="trash-btn" onclick="deleteVoucher('${v.id}')" title="Xóa chứng từ">
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
  const query = document.getElementById("search-purchase").value.toLowerCase();
  const rows = document.querySelectorAll("#purchase-table-body tr");
  
  rows.forEach(row => {
    if (row.cells.length < 3) return;
    const ref = row.cells[0].innerText.toLowerCase();
    const partner = row.cells[2].innerText.toLowerCase();
    const desc = row.cells[3].innerText.toLowerCase();
    
    if (ref.includes(query) || partner.includes(query) || desc.includes(query)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

// 7. RENDER DỮ LIỆU PHÂN HỆ BÁN HÀNG (SALES)
function renderSalesTable() {
  const tbody = document.getElementById("sales-table-body");
  if (!tbody) return;

  const sales = state.vouchers.filter(v => v.type === "sales");

  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa lập hóa đơn bán hàng nào. Vui lòng nhấn nút "Lập hóa đơn bán hàng".</td></tr>`;
    return;
  }

  tbody.innerHTML = sales.map(v => {
    const rawVal = v.totalAmount - (v.taxAmount || 0);
    return `
      <tr>
        <td class="font-numeric" style="color: var(--color-success); font-weight:700;">${v.id}</td>
        <td>${v.date}</td>
        <td><span style="font-weight:600;">${v.partnerName}</span></td>
        <td>${v.description}</td>
        <td><span class="badge ${v.paymentMethod === '131' ? 'badge-danger' : 'badge-success'}">${v.paymentMethod === '131' ? 'Công nợ (131)' : v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'}</span></td>
        <td class="text-right font-numeric">${formatVND(rawVal)}</td>
        <td class="text-right font-numeric" style="color:var(--text-secondary);">${formatVND(v.cogsAmount)}</td>
        <td class="text-right font-numeric">${formatVND(v.taxAmount)}</td>
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
            <button class="btn btn-secondary btn-sm" onclick="viewVoucher('${v.id}')">Xem/In</button>
            <button class="trash-btn" onclick="deleteVoucher('${v.id}')" title="Xóa chứng từ">
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
  const query = document.getElementById("search-sales").value.toLowerCase();
  const rows = document.querySelectorAll("#sales-table-body tr");
  
  rows.forEach(row => {
    if (row.cells.length < 3) return;
    const ref = row.cells[0].innerText.toLowerCase();
    const partner = row.cells[2].innerText.toLowerCase();
    const desc = row.cells[3].innerText.toLowerCase();
    
    if (ref.includes(query) || partner.includes(query) || desc.includes(query)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

// 8. RENDER DỮ LIỆU PHÂN HỆ KHO HÀNG (INVENTORY)
function renderInventoryTable(filterQuery = "") {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;

  let products = state.products || [];

  const query = (filterQuery || "").trim().toLowerCase();
  if (query) {
    products = products.filter(p => 
      (p.id || "").toLowerCase().includes(query) || 
      (p.name || "").toLowerCase().includes(query)
    );
  }

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy sản phẩm phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const isLow = (p.stock || 0) <= (p.minStock || 0);
    return `
      <tr>
        <td class="font-numeric" style="font-weight:700;">${p.id}</td>
        <td><span style="font-weight:600; color:var(--text-primary);">${p.name}</span></td>
        <td>${p.unit || "Cái"}</td>
        <td class="text-right font-numeric" style="font-weight:700; ${isLow ? 'color: var(--color-danger);' : ''}">${p.stock || 0}</td>
        <td class="text-right font-numeric">${formatVND(p.avgCost || 0)}</td>
        <td class="text-right font-numeric" style="font-weight:700;">${formatVND(p.totalValue || 0)}</td>
        <td>
          <span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">
            ${isLow ? 'Cảnh báo tồn thấp' : 'Đầy đủ'}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

// Lọc sản phẩm tồn kho hiệu năng cực cao (0ms jank-free) dùng bộ lọc trong bộ nhớ
function filterInventoryTable() {
  const query = document.getElementById("search-inventory").value;
  renderInventoryTable(query);
}

// Nạp danh sách thẻ kho chi tiết theo từng sản phẩm
function populateProductLedgerDropdown() {
  const select = document.getElementById("select-product-ledger");
  if (!select) return;

  select.innerHTML = state.products.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join("");
}

// Render lịch sử nhập xuất của 1 mặt hàng (Thẻ kho chi tiết)
function renderStockLedger() {
  const tbody = document.getElementById("stock-ledger-body");
  const select = document.getElementById("select-product-ledger");
  if (!tbody || !select || !select.value) return;

  const prodId = select.value;
  const prod = state.products.find(p => p.id === prodId);
  const origProd = DEFAULT_DATA.products.find(o => o.id === prodId);

  let html = "";
  
  // 1. Số dư dòng đầu tiên: Tồn đầu kỳ
  const initStock = origProd ? origProd.stock : (prod.initialStock || 0);
  const initCost = origProd ? origProd.avgCost : (prod.initialCost || 0);
  html += `
    <tr style="background-color: rgba(255, 255, 255, 0.02); font-style: italic;">
      <td>01/01/2026</td>
      <td style="font-weight:600; color:var(--text-muted);">TỒN ĐẦU KỲ</td>
      <td class="text-right font-numeric">-</td>
      <td class="text-right font-numeric">-</td>
      <td class="text-right font-numeric" style="font-weight:700;">${formatVND(initCost)} (Tồn: ${initStock})</td>
    </tr>
  `;

  // 2. Chạy qua các chứng từ có chứa mặt hàng này
  state.vouchers.forEach(v => {
    if (v.type !== "purchase" && v.type !== "sales") return;
    
    const item = v.items.find(i => i.productId === prodId);
    if (!item) return;

    if (v.type === "purchase") {
      html += `
        <tr>
          <td>${v.date}</td>
          <td class="font-numeric" style="color:var(--color-primary); cursor:pointer; font-weight:700;" onclick="viewVoucher('${v.id}')">${v.id}</td>
          <td class="text-right font-numeric" style="color: var(--color-primary); font-weight:700;">+${item.qty}</td>
          <td class="text-right font-numeric">-</td>
          <td class="text-right font-numeric">${formatVND(item.price)}</td>
        </tr>
      `;
    } else if (v.type === "sales") {
      html += `
        <tr>
          <td>${v.date}</td>
          <td class="font-numeric" style="color:var(--color-success); cursor:pointer; font-weight:700;" onclick="viewVoucher('${v.id}')">${v.id}</td>
          <td class="text-right font-numeric">-</td>
          <td class="text-right font-numeric" style="color: var(--color-warning); font-weight:700;">-${item.qty}</td>
          <td class="text-right font-numeric" style="color: var(--text-secondary);">${formatVND(item.cogsUnit || 0)} (giá vốn)</td>
        </tr>
      `;
    }
  });

  tbody.innerHTML = html;
}

// 9. RENDER DỮ LIỆU PHÂN HỆ KÝ QUỸ (ESCROW)
function renderEscrowTable() {
  const tbody = document.getElementById("escrow-table-body");
  if (!tbody) return;

  const escrows = state.vouchers.filter(v => v.type.startsWith("escrow_"));

  if (escrows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa phát sinh chứng từ ký quỹ nào.</td></tr>`;
    return;
  }

  const typeLabels = {
    escrow_pay: { name: "Chi ký quỹ đi (Tài sản)", class: "badge-info", acct: state.accountingStandard === "TT200" ? "244" : "1386" },
    escrow_receive: { name: "Nhận ký quỹ về (Nợ phải trả)", class: "badge-success", acct: state.accountingStandard === "TT200" ? "344" : "3386" },
    escrow_refund_pay: { name: "Tất toán ký quỹ đi", class: "badge-warning", acct: state.accountingStandard === "TT200" ? "244" : "1386" },
    escrow_refund_receive: { name: "Tất toán nhận ký quỹ", class: "badge-warning", acct: state.accountingStandard === "TT200" ? "344" : "3386" }
  };

  tbody.innerHTML = escrows.map(v => {
    const lbl = typeLabels[v.type] || { name: "Ký quỹ", class: "badge-info", acct: "" };
    const isRefund = v.type.includes("refund");
    return `
      <tr>
        <td class="font-numeric" style="font-weight:700;">${v.id}</td>
        <td>${v.date}</td>
        <td><span style="font-weight:600;">${v.partnerName}</span></td>
        <td><span class="badge ${lbl.class}">${lbl.name}</span></td>
        <td>${v.description}</td>
        <td class="font-numeric" style="font-weight:700; color:var(--color-primary);">${lbl.acct}</td>
        <td class="text-right font-numeric" style="font-weight:700; ${isRefund ? 'color: var(--text-muted);' : ''}">${formatVND(v.amount)}</td>
        <td>
          <span class="badge ${isRefund ? 'badge-danger' : 'badge-success'}">
            ${isRefund ? 'Đã tất toán' : 'Đang hiệu lực'}
          </span>
        </td>
        <td style="text-align: center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="viewVoucher('${v.id}')">Xem/In</button>
            <button class="trash-btn" onclick="deleteVoucher('${v.id}')" title="Xóa chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Lọc ký quỹ
function filterEscrowTable() {
  const query = document.getElementById("search-escrow").value.toLowerCase();
  const rows = document.querySelectorAll("#escrow-table-body tr");
  
  rows.forEach(row => {
    if (row.cells.length < 3) return;
    const ref = row.cells[0].innerText.toLowerCase();
    const partner = row.cells[2].innerText.toLowerCase();
    const desc = row.cells[4].innerText.toLowerCase();
    
    if (ref.includes(query) || partner.includes(query) || desc.includes(query)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

// 10. PHÂN HỆ LẬP BÁO CÁO KẾ TOÁN (REPORTS ENGINE)
function populateReportAccountDropdown() {
  const select = document.getElementById("select-report-account");
  if (!select) return;

  const std = state.accountingStandard;
  const accounts = [
    { code: "111", name: "Tiền mặt" },
    { code: "112", name: "Tiền gửi ngân hàng" },
    { code: "131", name: "Phải thu khách hàng" },
    { code: "156", name: "Hàng hóa tồn kho" },
    { code: std === "TT200" ? "244" : "1386", name: "Phải thu ký quỹ, ký cược" },
    { code: "1331", name: "Thuế GTGT đầu vào được khấu trừ" },
    { code: "331", name: "Phải trả người bán" },
    { code: "3331", name: "Thuế GTGT đầu ra phải nộp" },
    { code: std === "TT200" ? "344" : "3386", name: "Phải trả nhận ký quỹ, ký cược" },
    { code: "511", name: "Doanh thu bán hàng" },
    { code: "632", name: "Giá vốn hàng bán" }
  ];

  select.innerHTML = accounts.map(a => `<option value="${a.code}">${a.code} - ${a.name}</option>`).join("");
}

// Xử lý khi đổi loại báo cáo
function handleReportTypeChange() {
  const type = document.getElementById("select-report-type").value;
  const acctSelect = document.getElementById("report-account-selector-wrapper");
  
  if (type === "ledger") {
    acctSelect.style.display = "";
  } else {
    acctSelect.style.display = "none";
  }
  
  generateReport();
}

// Tạo lập Báo cáo Động
function generateReport() {
  const container = document.getElementById("printable-report-area");
  if (!container) return;

  const type = document.getElementById("select-report-type").value;
  const std = state.accountingStandard;

  let html = "";
  
  // A. BÁO CÁO 1: SỔ NHẬT KÝ CHUNG
  if (type === "journal") {
    html += `
      <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin-bottom:20px;">
        <h2 style="font-size: 20px; font-weight: bold; text-transform: uppercase;">SỔ NHẬT KÝ CHUNG</h2>
        <p style="font-style: italic; font-size:13px;">Niên độ kế toán năm 2026</p>
        <p style="font-size:12px;">Áp dụng theo ${std === 'TT200' ? 'Thông tư 200/2014/TT-BTC' : 'Thông tư 133/2016/TT-BTC'}</p>
      </div>
      
      <table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background-color:#f3f4f6;">
            <th style="border:1px solid #000; padding:6px; color:#000;">Ngày hạch toán</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Số chứng từ</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Diễn giải giao dịch</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:center;">TK Nợ</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:center;">TK Có</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Số tiền phát sinh</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalVal = 0;
    if (state.vouchers.length === 0) {
      html += `<tr><td colspan="6" style="text-align:center; padding:10px; border:1px solid #000;">Chưa có dữ liệu chứng từ.</td></tr>`;
    } else {
      state.vouchers.forEach(v => {
        v.entries.forEach((e, idx) => {
          totalVal += e.amount;
          html += `
            <tr>
              <td style="border:1px solid #000; padding:6px; color:#000;">${idx === 0 ? v.date : ""}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; font-weight:700;">${idx === 0 ? v.id : ""}</td>
              <td style="border:1px solid #000; padding:6px; color:#000;">${e.desc}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; text-align:center; font-weight:700;">${e.debit}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; text-align:center; font-weight:700;">${e.credit}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; text-align:right; font-weight:700;" class="font-numeric">${formatVND(e.amount)}</td>
            </tr>
          `;
        });
      });
    }

    html += `
          <tr style="background-color:#e5e7eb; font-weight:bold;">
            <td colspan="5" style="border:1px solid #000; padding:8px; text-align:center;">TỔNG PHÁT SINH NHẬT KÝ CHUNG</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(totalVal)}</td>
          </tr>
        </tbody>
      </table>
      
      <!-- Chữ ký báo cáo -->
      ${getReportSignaturesHTML()}
    `;
  }
  
  // B. BÁO CÁO 2: SỔ CÁI CHI TIẾT TÀI KHOẢN
  else if (type === "ledger") {
    const acctCode = document.getElementById("select-report-account").value;
    const acctName = state.initialBalances[acctCode] ? state.initialBalances[acctCode].name : "Tài khoản";
    
    html += `
      <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin-bottom:20px;">
        <h2 style="font-size: 20px; font-weight: bold; text-transform: uppercase;">SỔ CÁI TÀI KHOẢN</h2>
        <h3 style="font-size: 16px; font-weight: bold;">Tài khoản: ${acctCode} - ${acctName}</h3>
        <p style="font-style: italic; font-size:12px;">Niên độ kế toán năm 2026</p>
      </div>
      
      <table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background-color:#f3f4f6;">
            <th style="border:1px solid #000; padding:6px; color:#000;">Ngày</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Số chứng từ</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Diễn giải giao dịch đối ứng</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:center;">TK đối ứng</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Phát sinh Nợ (đ)</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Phát sinh Có (đ)</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Số dư lũy kế (đ)</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Lấy số dư đầu kỳ
    const initBalObj = state.initialBalances[acctCode] || { type: "debit", balance: 0 };
    let currentBalance = initBalObj.balance;
    const isDebitAccount = initBalObj.type === "debit";

    html += `
      <tr style="background-color: rgba(0,0,0,0.02); font-style: italic;">
        <td>01/01/2026</td>
        <td>-</td>
        <td style="font-weight:700;">SỐ DƯ ĐẦU KỲ</td>
        <td style="text-align:center;">-</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right font-numeric" style="font-weight:700;">${formatVND(currentBalance)}</td>
      </tr>
    `;

    let totalDebit = 0;
    let totalCredit = 0;

    // Quét qua các nghiệp vụ trong nhật ký
    state.vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (e.debit !== acctCode && e.credit !== acctCode) return;

        let dbAmt = 0;
        let crAmt = 0;
        let oppositeAcct = "";

        if (e.debit === acctCode) {
          dbAmt = e.amount;
          totalDebit += dbAmt;
          oppositeAcct = e.credit;
          currentBalance += isDebitAccount ? dbAmt : -dbAmt;
        } else {
          crAmt = e.amount;
          totalCredit += crAmt;
          oppositeAcct = e.debit;
          currentBalance += isDebitAccount ? -crAmt : crAmt;
        }

        html += `
          <tr>
            <td style="border:1px solid #000; padding:6px; color:#000;">${v.date}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; font-weight:700;">${v.id}</td>
            <td style="border:1px solid #000; padding:6px; color:#000;">${e.desc}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:center; font-weight:700;">${oppositeAcct}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:right;" class="font-numeric">${dbAmt > 0 ? formatVND(dbAmt) : "-"}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:right;" class="font-numeric">${crAmt > 0 ? formatVND(crAmt) : "-"}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:right;" class="font-numeric">${formatVND(currentBalance)}</td>
          </tr>
        `;
      });
    });

    html += `
          <tr style="background-color:#f3f4f6; font-weight:bold;">
            <td colspan="4" style="border:1px solid #000; padding:8px; text-align:center;">CỘNG PHÁT SINH TRONG KỲ</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(totalDebit)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(totalCredit)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">-</td>
          </tr>
          <tr style="background-color:#e5e7eb; font-weight:bold;">
            <td colspan="6" style="border:1px solid #000; padding:8px; text-align:center;">SỐ DƯ CUỐI KỲ</td>
            <td style="border:1px solid #000; padding:8px; text-align:right; color:var(--color-primary);" class="font-numeric">${formatVND(currentBalance)}</td>
          </tr>
        </tbody>
      </table>
      
      <!-- Chữ ký báo cáo -->
      ${getReportSignaturesHTML()}
    `;
  }
  
  // C. BÁO CÁO 3: BẢNG CÂN ĐỐI PHÁT SINH TÀI KHOẢN (TRÌNH TRẠNG THÁI CAO CẤP NHẤT)
  else if (type === "balance") {
    html += `
      <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin-bottom:20px;">
        <h2 style="font-size: 20px; font-weight: bold; text-transform: uppercase;">BẢNG CÂN ĐỐI PHÁT SINH TÀI KHOẢN</h2>
        <p style="font-style: italic; font-size:12px;">Niên độ kế toán năm 2026</p>
        <p style="font-size:11px;">(Đảm bảo tính chính xác và cân đối kép của toàn bộ hệ thống)</p>
      </div>
      
      <table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="background-color:#e5e7eb;">
            <th rowspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center; width:80px;">Mã TK</th>
            <th rowspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:left;">Tên tài khoản kế toán</th>
            <th colspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center;">Số dư đầu kỳ (đ)</th>
            <th colspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center;">Số phát sinh trong kỳ (đ)</th>
            <th colspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center;">Số dư cuối kỳ (đ)</th>
          </tr>
          <tr style="background-color:#f3f4f6;">
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Nợ</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Có</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Nợ</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Có</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Nợ</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Có</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Tính toán cân đối cho toàn bộ tài khoản
    const balanceData = calculateTrialBalance();

    let sumOpDeb = 0, sumOpCre = 0;
    let sumMovDeb = 0, sumMovCre = 0;
    let sumClDeb = 0, sumClCre = 0;

    balanceData.forEach(row => {
      sumOpDeb += row.openDebit;
      sumOpCre += row.openCredit;
      sumMovDeb += row.moveDebit;
      sumMovCre += row.moveCredit;
      sumClDeb += row.closeDebit;
      sumClCre += row.closeCredit;

      html += `
        <tr>
          <td style="border:1px solid #000; padding:6px; text-align:center; font-weight:700; color:#000;">${row.code}</td>
          <td style="border:1px solid #000; padding:6px; font-weight:600; color:#000;">${row.name}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.openDebit > 0 ? formatVND(row.openDebit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.openCredit > 0 ? formatVND(row.openCredit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.moveDebit > 0 ? formatVND(row.moveDebit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.moveCredit > 0 ? formatVND(row.moveCredit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:700; color:var(--color-primary);" class="font-numeric">${row.closeDebit > 0 ? formatVND(row.closeDebit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${row.closeCredit > 0 ? formatVND(row.closeCredit) : "-"}</td>
        </tr>
      `;
    });

    html += `
          <tr style="background-color:#e5e7eb; font-weight:bold; color:#000;">
            <td colspan="2" style="border:1px solid #000; padding:8px; text-align:center;">CỘNG CÂN ĐỐI</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumOpDeb)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumOpCre)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumMovDeb)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumMovCre)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right; color:var(--color-primary);" class="font-numeric">${formatVND(sumClDeb)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right; color:var(--color-warning);" class="font-numeric">${formatVND(sumClCre)}</td>
          </tr>
        </tbody>
      </table>
      
      <p style="font-size: 11px; margin-top:8px; font-style:italic; color:#444;">
        * Nhận xét: Tổng phát sinh Nợ luôn luôn bằng Tổng phát sinh Có trên từng phân khúc dữ liệu giúp bảo toàn tuyệt đối nguyên lý định khoản kép.
      </p>

      <!-- Chữ ký báo cáo -->
      ${getReportSignaturesHTML()}
    `;
  }

  container.innerHTML = html;
}

// Bảng chữ ký kế toán Việt Nam mẫu
function getReportSignaturesHTML() {
  return `
    <div style="display:flex; justify-content:space-between; margin-top:30px; font-family:'Times New Roman', serif; color:#000; text-align:center; font-size:12px;">
      <div style="width:30%;">
        <span style="font-weight:bold;">Người lập biểu</span><br>
        <span style="font-style:italic; font-size:11px;">(Ký, ghi rõ họ tên)</span>
        <div style="height:60px;"></div>
        <span style="font-weight:bold;">Kế toán viên</span>
      </div>
      <div style="width:30%;">
        <span style="font-weight:bold;">Kế toán trưởng</span><br>
        <span style="font-style:italic; font-size:11px;">(Ký, ghi rõ họ tên)</span>
        <div style="height:60px;"></div>
        <span style="font-weight:bold;">Nguyễn Văn Minh</span>
      </div>
      <div style="width:30%;">
        <span style="font-weight:bold;">Giám đốc</span><br>
        <span style="font-style:italic; font-size:11px;">(Ký, đóng dấu, ghi rõ họ tên)</span>
        <div style="height:60px;"></div>
        <span style="font-weight:bold;">Lê Hoàng Đông</span>
      </div>
    </div>
  `;
}

// Hàm in báo cáo
function printReport() {
  document.body.classList.add("printing-report");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-report");
  }, 500);
}

// Tính bảng cân đối phát sinh tài khoản
function calculateTrialBalance() {
  const std = state.accountingStandard;
  
  // Danh sách các tài khoản sử dụng
  const accounts = [
    { code: "111", name: "Tiền mặt tại quỹ" },
    { code: "112", name: "Tiền gửi ngân hàng" },
    { code: "131", name: "Phải thu của khách hàng" },
    { code: "1331", name: "Thuế GTGT đầu vào được khấu trừ" },
    { code: "156", name: "Hàng hóa nhập kho" },
    { code: std === "TT200" ? "244" : "1386", name: "Phải thu ký quỹ, ký cược" },
    { code: "331", name: "Phải trả cho người bán" },
    { code: "3331", name: "Thuế GTGT phải nộp" },
    { code: std === "TT200" ? "344" : "3386", name: "Phải trả nhận ký quỹ, ký cược" },
    { code: "411", name: "Vốn góp của chủ sở hữu" },
    { code: "511", name: "Doanh thu bán hàng" },
    { code: "632", name: "Giá vốn hàng bán" }
  ];

  const trialRows = [];

  accounts.forEach(acct => {
    // 1. Số dư đầu kỳ
    const initBalObj = state.initialBalances[acct.code] || { type: "debit", balance: 0 };
    let openDeb = 0;
    let openCre = 0;

    if (initBalObj.type === "debit") {
      openDeb = initBalObj.balance;
    } else {
      openCre = initBalObj.balance;
    }

    // 2. Cộng phát sinh trong kỳ
    let moveDeb = 0;
    let moveCre = 0;

    state.vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (e.debit === acct.code) {
          moveDeb += e.amount;
        }
        if (e.credit === acct.code) {
          moveCre += e.amount;
        }
      });
    });

    // 3. Số dư cuối kỳ
    let closeDeb = 0;
    let closeCre = 0;

    if (initBalObj.type === "debit") {
      const net = openDeb + moveDeb - moveCre;
      if (net >= 0) {
        closeDeb = net;
      } else {
        closeCre = -net;
      }
    } else {
      const net = openCre + moveCre - moveDeb;
      if (net >= 0) {
        closeCre = net;
      } else {
        closeDeb = -net;
      }
    }

    trialRows.push({
      code: acct.code,
      name: acct.name,
      openDebit: openDeb,
      openCredit: openCre,
      moveDebit: moveDeb,
      moveCredit: moveCre,
      closeDebit: closeDeb,
      closeCredit: closeCre
    });
  });

  return trialRows;
}

// 11. CÁC HÀM XỬ LÝ FORM & THÊM CHỨNG TỪ

// Đổ dữ liệu Đối tác vào dropdown trong form nhập liệu
function populatePartnerDropdown(elementId, filterType) {
  const input = document.getElementById(elementId);
  if (input) {
    input.value = ""; // Xóa giá trị cũ để người dùng nhập mới
  }
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

// Bổ sung các hàng sản phẩm động vào form Mua hàng
function addPurchaseFormRow() {
  const tbody = document.getElementById("purchase-form-items-body");
  if (!tbody) return;

  const rowId = `pur-row-${Date.now()}`;
  
  const options = productOptionsHTML || state.products.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join("");

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <select class="form-control item-productId" required style="width:100%;">
        ${options}
      </select>
    </td>
    <td>
      <input type="number" class="form-control item-qty text-right" required value="1" min="1" oninput="recalculatePurchaseTotals()">
    </td>
    <td>
      <input type="number" class="form-control item-price text-right" required value="10000" min="0" oninput="recalculatePurchaseTotals()">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">10.000đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculatePurchaseTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);
  recalculatePurchaseTotals();
}

// Tính toán lại tổng tiền trong form Mua
function recalculatePurchaseTotals() {
  const rows = document.querySelectorAll("#purchase-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = parseInt(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value) || 0;
    const amount = qty * price;
    subtotal += amount;

    row.querySelector(".item-total-display").innerText = formatVND(amount);
  });

  const taxRate = parseInt(document.getElementById("pur-tax-rate").value) || 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  document.getElementById("pur-subtotal-display").value = formatVND(subtotal);
  document.getElementById("pur-tax-display").value = formatVND(taxAmount);
  document.getElementById("pur-total-display").value = formatVND(total);
}

// Reset form mua hàng
function resetPurchaseForm() {
  const tbody = document.getElementById("purchase-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("pur-desc").value = "Mua vật tư hàng hóa nhập kho";
  document.getElementById("pur-date").value = new Date().toISOString().split("T")[0];
  addPurchaseFormRow(); // Tạo 1 dòng trống mặc định
}

// Xử lý nộp form Mua hàng
function handlePurchaseSubmit(e) {
  e.preventDefault();

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
  rows.forEach(row => {
    const productId = row.querySelector(".item-productId").value;
    const qty = parseInt(row.querySelector(".item-qty").value);
    const price = parseInt(row.querySelector(".item-price").value);
    voucherItems.push({
      productId,
      qty,
      price,
      amount: qty * price
    });
  });

  const newVoucher = {
    id: `MH-${new Date().getFullYear().toString().substring(2)}-${(state.vouchers.filter(v => v.type === 'purchase').length + 1).toString().padStart(4, '0')}`,
    type: "purchase",
    date: document.getElementById("pur-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("pur-payment").value,
    description: document.getElementById("pur-desc").value,
    items: voucherItems,
    taxRate: parseInt(document.getElementById("pur-tax-rate").value)
  };

  state.vouchers.push(newVoucher);
  saveState();
  
  // Chạy lại hạch toán đồng bộ
  recalculateAccounting();
  
  closeModal("modal-add-purchase");
  showToast("Lập chứng từ mua hàng thành công!", "success");
}

// Bổ sung các hàng sản phẩm động vào form Bán hàng
function addSalesFormRow() {
  const tbody = document.getElementById("sales-form-items-body");
  if (!tbody) return;

  const rowId = `sale-row-${Date.now()}`;

  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <input type="text" class="form-control item-productId" placeholder="Gõ mã hoặc tên sản phẩm..." required list="datalist-sales-products" oninput="autoFillProductPrice(this)" onblur="autoFillProductPrice(this)">
    </td>
    <td>
      <input type="number" class="form-control item-qty text-right" required value="1" min="1" oninput="recalculateSalesTotals()">
    </td>
    <td>
      <input type="number" class="form-control item-price text-right" required value="0" min="0" oninput="recalculateSalesTotals()">
    </td>
    <td>
      <input type="number" class="form-control item-discount text-right" required value="0" min="0" max="100" oninput="recalculateSalesTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculateSalesTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);
}

// Gợi ý giá bán = Giá vốn bình quan + 35% lợi nhuận biên
function autoFillProductPrice(selectEl) {
  const prodVal = selectEl.value;
  const prod = resolveProduct(prodVal);
  const row = selectEl.closest("tr");
  
  if (prod && row) {
    const suggestedPrice = Math.round(prod.avgCost * 1.35 / 1000) * 1000 || 50000;
    row.querySelector(".item-price").value = suggestedPrice;
    recalculateSalesTotals();
  }
}

// Tính toán lại tổng tiền trong form Bán
function recalculateSalesTotals() {
  const rows = document.querySelectorAll("#sales-form-items-body tr");
  let subtotal = 0;

  rows.forEach(row => {
    const qty = parseInt(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value) || 0;
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

// Reset form bán hàng
function resetSalesForm() {
  const tbody = document.getElementById("sales-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("sale-desc").value = "Bán sản phẩm Rạng Đông xuất kho";
  document.getElementById("sale-date").value = new Date().toISOString().split("T")[0];
  addSalesFormRow();
}

// Xử lý nộp form Bán hàng (Có xác thực kiểm kho hàng tồn)
function handleSalesSubmit(e) {
  e.preventDefault();

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
    const qty = parseInt(row.querySelector(".item-qty").value) || 0;
    const price = parseInt(row.querySelector(".item-price").value) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value) || 0;
    const amount = Math.round(qty * price * (1 - discount / 100));
    
    // Kiểm tra hàng tồn kho khả dụng
    if (resolvedProduct.stock < qty) {
      showToast(`Hàng tồn kho sản phẩm "${resolvedProduct.name}" không đủ (Còn tồn ${resolvedProduct.stock}, cần bán ${qty})!`, "danger");
      isStockInsufficient = true;
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
    id: `BH-${new Date().getFullYear().toString().substring(2)}-${(state.vouchers.filter(v => v.type === 'sales').length + 1).toString().padStart(4, '0')}`,
    type: "sales",
    date: document.getElementById("sale-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("sale-payment").value,
    description: document.getElementById("sale-desc").value,
    items: voucherItems,
    taxRate: parseInt(document.getElementById("sale-tax-rate").value)
  };

  state.vouchers.push(newVoucher);
  saveState();
  
  // Chạy lại hạch toán đồng bộ
  recalculateAccounting();
  
  closeModal("modal-add-sales");
  showToast("Lập hóa đơn bán hàng thành công!", "success");
}

// Xử lý nộp form Thêm mặt hàng mới
function handleProductSubmit(e) {
  e.preventDefault();

  const id = document.getElementById("prod-id").value.trim().toUpperCase() || `SP${(state.products.length + 1).toString().padStart(3, '0')}`;
  const name = document.getElementById("prod-name").value.trim();
  const unit = document.getElementById("prod-unit").value.trim();
  const initialStock = parseInt(document.getElementById("prod-stock").value) || 0;
  const initialCost = parseInt(document.getElementById("prod-cost").value) || 0;
  const minStock = parseInt(document.getElementById("prod-min-stock").value) || 0;

  // Kiểm tra trùng mã
  if (state.products.some(p => p.id === id)) {
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
    initialCost,
    minStock
  };

  // Cập nhật cả số dư đầu kỳ trong tài khoản 156 của Bảng Cân đối
  state.products.push(newProduct);
  
  // Cộng dồn giá trị sản phẩm vào Số dư đầu kỳ tài khoản 156
  let newInvOpBal = 0;
  state.products.forEach(p => {
    // Nếu sản phẩm có trong mặc định, nó đã được cộng, ta lấy thực tế
    const orig = DEFAULT_DATA.products.find(o => o.id === p.id);
    newInvOpBal += orig ? orig.totalValue : (p.initialStock * p.initialCost);
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
}

// Tự động cân đối tài sản và nguồn vốn bằng cách điều chỉnh TK 411 (Vốn chủ sở hữu)
function rebalanceEquity() {
  let debitSum = 0;
  let creditSum = 0;
  
  Object.keys(state.initialBalances).forEach(code => {
    if (code === "411") return; // Bỏ qua vốn chủ để tính chênh lệch
    const b = state.initialBalances[code];
    if (b.type === "debit") {
      debitSum += b.balance;
    } else {
      creditSum += b.balance;
    }
  });

  state.initialBalances["411"].balance = debitSum - creditSum;
}

// Thay đổi loại ký quỹ trong Form
function handleEscrowTypeChange() {
  const type = document.getElementById("esc-type").value;
  const activeWrap = document.getElementById("esc-active-selection-wrapper");
  const returnGroup = document.getElementById("escrow-expected-date-group");
  
  // Ẩn/Hiện combo tất toán nếu là nghiệp vụ hoàn trả
  if (type.includes("refund")) {
    activeWrap.style.display = "";
    returnGroup.style.display = "none";
    populateActiveEscrowsDropdown();
    autoFillEscrowRefundData();
  } else {
    activeWrap.style.display = "none";
    returnGroup.style.display = "";
    populatePartnerDropdown("esc-partner", null);
    
    // Thiết lập giá trị mặc định cho form tạo mới
    document.getElementById("esc-amount").value = 10000000;
    document.getElementById("esc-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("esc-return-date").value = "";
    document.getElementById("esc-desc").value = type === "escrow_pay" ? "Chi tiền gửi ký quỹ bảo lãnh" : "Nhận tiền đặt cọc ký quỹ của đối tác";
  }
}

// Nạp các khoản ký quỹ đang còn hiệu lực vào combo
function populateActiveEscrowsDropdown() {
  const select = document.getElementById("esc-active-selection");
  const type = document.getElementById("esc-type").value;
  
  if (!select) return;

  // Lọc các ký quỹ gốc mang đi hoặc nhận về chưa từng được tất toán
  const allVouchers = state.vouchers;
  const refundedIds = allVouchers
    .filter(v => v.type.includes("refund"))
    .map(v => v.escrowRefId);

  // Lọc loại ký quỹ tương ứng
  const targetType = type === "escrow_refund_pay" ? "escrow_pay" : "escrow_receive";
  const actives = allVouchers.filter(v => v.type === targetType && !refundedIds.includes(v.id));

  if (actives.length === 0) {
    select.innerHTML = `<option value="">-- Không có khoản ký quỹ khả dụng --</option>`;
  } else {
    select.innerHTML = actives.map(a => `<option value="${a.id}">${a.id} - ${a.partnerName} (${formatVND(a.amount)})</option>`).join("");
  }
}

// Tự điền thông tin khi chọn tất toán khoản ký quỹ
function autoFillEscrowRefundData() {
  const refId = document.getElementById("esc-active-selection").value;
  if (!refId) return;

  const originVoucher = state.vouchers.find(v => v.id === refId);
  if (originVoucher) {
    document.getElementById("esc-partner").innerHTML = `<option value="${originVoucher.partnerId}">${originVoucher.partnerName}</option>`;
    document.getElementById("esc-amount").value = originVoucher.amount;
    document.getElementById("esc-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("esc-desc").value = `Tất toán hoàn trả theo chứng từ gốc ${originVoucher.id}`;
  }
}

// Ghi sổ chứng từ Ký quỹ
function handleEscrowSubmit(e) {
  e.preventDefault();

  const type = document.getElementById("esc-type").value;
  const partnerInputVal = document.getElementById("esc-partner").value;
  const resolvedPartner = resolvePartner(partnerInputVal);
  const partnerId = resolvedPartner.id;
  const partnerName = resolvedPartner.name;
  
  const refId = document.getElementById("esc-active-selection").value;

  if (type.includes("refund") && !refId) {
    showToast("Không có khoản ký quỹ gốc nào để thực hiện tất toán!", "danger");
    return;
  }

  const newVoucher = {
    id: `KQ-${new Date().getFullYear().toString().substring(2)}-${(state.vouchers.filter(v => v.type.startsWith('escrow_')).length + 1).toString().padStart(4, '0')}`,
    type,
    date: document.getElementById("esc-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("esc-payment-method").value,
    amount: parseInt(document.getElementById("esc-amount").value),
    description: document.getElementById("esc-desc").value,
    expectedReturnDate: document.getElementById("esc-return-date") ? document.getElementById("esc-return-date").value : "",
    escrowRefId: type.includes("refund") ? refId : null // Liên kết đến chứng từ ký quỹ gốc
  };

  state.vouchers.push(newVoucher);
  saveState();
  recalculateAccounting();
  
  closeModal("modal-add-escrow");
  showToast("Ghi nhận nghiệp vụ ký quỹ thành công!", "success");
}

// Xóa chứng từ khỏi sổ cái
function deleteVoucher(id) {
  if (confirm(`Bạn có chắc chắn muốn xóa và hủy ghi sổ chứng từ "${id}"? Việc này sẽ tính toán lại toàn bộ giá trị tồn kho và công nợ.`)) {
    state.vouchers = state.vouchers.filter(v => v.id !== id);
    
    // Nếu có các khoản tất toán gắn liền với nó, xóa liên kết hoặc cảnh báo
    // Để an toàn, xóa các khoản tham chiếu
    state.vouchers.forEach(v => {
      if (v.escrowRefId === id) {
        v.escrowRefId = null;
      }
    });

    saveState();
    recalculateAccounting();
    showToast(`Đã xóa thành công chứng từ ${id}!`, "success");
  }
}

// 12. XEM VÀ IN BIỂU MẪU CHỨNG TỪ THEO CHUẨN BỘ TÀI CHÍNH
function viewVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  const std = state.accountingStandard;
  const printArea = document.getElementById("voucher-print-area");
  if (!printArea) return;

  let content = "";
  const companyName = state.companyName || "CÔNG TY CP RẠNG ĐÔNG";
  const companyAddr = state.address || "Số 87-89 Hạ Đình, Thanh Xuân, Hà Nội";
  const companyTax = state.taxCode || "0100101438";

  // TIÊU ĐỀ CHỨNG TỪ THEO CHUẨN IN ẤN
  if (v.type === "purchase") {
    // Mua hàng -> Phiếu Nhập Kho (Mẫu số 01 - VT)
    content = `
      <div class="printable-voucher">
        <div class="voucher-header-top">
          <div class="voucher-co-info">
            <span class="voucher-co-name">${companyName}</span><br>
            <span class="voucher-co-addr">Địa chỉ: ${companyAddr}</span><br>
            <span class="voucher-co-addr">MST: ${companyTax}</span>
          </div>
          <div class="voucher-template-code">
            <span class="template-bold">Mẫu số 01 - VT</span><br>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">PHIẾU NHẬP KHO</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</span>
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
            <span class="info-dotted">${v.partnerName}</span>
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
              <th style="width:15%;">Mã SP</th>
              <th style="width:40%;">Tên, nhãn hiệu quy cách sản phẩm vật tư</th>
              <th style="width:10%;">ĐVT</th>
              <th style="width:10%;">Số lượng</th>
              <th style="width:10%;">Đơn giá (đ)</th>
              <th style="width:15%;">Thành tiền (đ)</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map((item, idx) => {
              const prod = state.products.find(p => p.id === item.productId) || { name: "Sản phẩm" };
              return `
                <tr>
                  <td style="text-align:center;">${idx + 1}</td>
                  <td style="text-align:center; font-weight:bold;">${item.productId}</td>
                  <td>${prod.name}</td>
                  <td style="text-align:center;">${prod.unit || "Cái"}</td>
                  <td style="text-align:right;">${item.qty}</td>
                  <td style="text-align:right;">${formatVND(item.price).replace("đ","")}</td>
                  <td style="text-align:right; font-weight:bold;">${formatVND(item.amount).replace("đ","")}</td>
                </tr>
              `;
            }).join("")}
            
            <tr>
              <td colspan="6" style="text-align:right; font-weight:bold;">Cộng tiền hàng chưa thuế:</td>
              <td style="text-align:right; font-weight:bold;">${formatVND(v.totalAmount - v.taxAmount).replace("đ","")}</td>
            </tr>
            <tr>
              <td colspan="6" style="text-align:right;">Thuế GTGT (${v.taxRate}%):</td>
              <td style="text-align:right;">${formatVND(v.taxAmount).replace("đ","")}</td>
            </tr>
            <tr style="background-color:#e5e7eb;">
              <td colspan="6" style="text-align:right; font-weight:bold; text-transform:uppercase;">Tổng cộng tiền thanh toán:</td>
              <td style="text-align:right; font-weight:bold; color:var(--color-primary);">${formatVND(v.totalAmount).replace("đ","")}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="voucher-amount-word">
          Tổng số tiền (viết bằng chữ): <span style="font-weight:bold; font-style:italic;">${numberToVietnameseWords(v.totalAmount)}</span>
        </div>
        
        <div class="voucher-signatures">
          <div class="sig-block">
            <span class="sig-title">Người lập phiếu</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Kế toán viên</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Người giao hàng</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">${v.partnerName.split(" ").slice(-2).join(" ")}</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Thủ kho</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Trần Văn Kho</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Giám đốc</span><br>
            <span class="sig-subtext">(Ký, đóng dấu)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Lê Hoàng Đông</span>
          </div>
        </div>
      </div>
    `;
  } else if (v.type === "sales") {
    // Bán hàng -> Hóa Đơn Giá Trị Gia Tăng kiêm Phiếu Xuất Kho (Mẫu số 02 - VT)
    content = `
      <div class="printable-voucher">
        <div class="voucher-header-top">
          <div class="voucher-co-info">
            <span class="voucher-co-name">${companyName}</span><br>
            <span class="voucher-co-addr">Địa chỉ: ${companyAddr}</span><br>
            <span class="voucher-co-addr">MST: ${companyTax}</span>
          </div>
          <div class="voucher-template-code">
            <span class="template-bold">Mẫu số 02 - VT</span><br>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">PHIẾU XUẤT KHO KIÊM HÓA ĐƠN</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</span>
        </div>
        
        <div class="voucher-entries-note">
          <span>Số: <span class="template-bold">${v.id}</span></span><br>
          <span>Nợ TK: <span class="template-bold">${v.paymentMethod}</span></span><br>
          <span>Có TK: <span class="template-bold">511</span></span><br>
          ${v.taxAmount > 0 ? `<span>Có TK: <span class="template-bold">3331</span></span>` : ""}
        </div>
        
        <div style="margin-top:20px;">
          <div class="voucher-info-row">
            <span class="info-label">- Họ tên khách hàng:</span>
            <span class="info-dotted">${v.partnerName}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Lý do xuất kho:</span>
            <span class="info-dotted">${v.description}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Xuất tại kho:</span>
            <span class="info-dotted">Kho thành phẩm Rạng Đông</span>
          </div>
        </div>
        
        <table class="voucher-table">
          <thead>
            <tr>
              <th style="width:5%;">STT</th>
              <th style="width:12%;">Mã SP</th>
              <th style="width:38%;">Tên sản phẩm thiết bị chiếu sáng Rạng Đông</th>
              <th style="width:10%;">ĐVT</th>
              <th style="width:10%;">Số lượng</th>
              <th style="width:10%;">Đơn giá</th>
              <th style="width:10%;">C.Khấu</th>
              <th style="width:15%;">Thành tiền (đ)</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map((item, idx) => {
              const prod = state.products.find(p => p.id === item.productId) || { name: "Sản phẩm" };
              const discountStr = item.discount ? `${item.discount}%` : "-";
              return `
                <tr>
                  <td style="text-align:center;">${idx + 1}</td>
                  <td style="text-align:center; font-weight:bold;">${item.productId}</td>
                  <td>${prod.name}</td>
                  <td style="text-align:center;">${prod.unit || "Cái"}</td>
                  <td style="text-align:right;">${item.qty}</td>
                  <td style="text-align:right;">${formatVND(item.price).replace("đ","")}</td>
                  <td style="text-align:center;">${discountStr}</td>
                  <td style="text-align:right; font-weight:bold;">${formatVND(item.amount).replace("đ","")}</td>
                </tr>
              `;
            }).join("")}
            
            <tr>
              <td colspan="7" style="text-align:right; font-weight:bold;">Cộng tiền doanh thu bán hàng:</td>
              <td style="text-align:right; font-weight:bold;">${formatVND(v.totalAmount - v.taxAmount).replace("đ","")}</td>
            </tr>
            <tr>
              <td colspan="7" style="text-align:right;">Thuế GTGT đầu ra (${v.taxRate}%):</td>
              <td style="text-align:right;">${formatVND(v.taxAmount).replace("đ","")}</td>
            </tr>
            <tr style="background-color:#e5e7eb;">
              <td colspan="7" style="text-align:right; font-weight:bold; text-transform:uppercase;">Tổng cộng thanh toán phải thu:</td>
              <td style="text-align:right; font-weight:bold; color:var(--color-success);">${formatVND(v.totalAmount).replace("đ","")}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="voucher-amount-word">
          Tổng số tiền bán hàng (viết bằng chữ): <span style="font-weight:bold; font-style:italic;">${numberToVietnameseWords(v.totalAmount)}</span>
        </div>
        
        <div class="voucher-signatures">
          <div class="sig-block">
            <span class="sig-title">Người lập phiếu</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Kế toán bán hàng</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Người nhận hàng</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">${v.partnerName.split(" ").slice(-2).join(" ")}</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Thủ kho xuất</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Trần Văn Kho</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Giám đốc</span><br>
            <span class="sig-subtext">(Ký, đóng dấu)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Lê Hoàng Đông</span>
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
          <div class="voucher-co-info">
            <span class="voucher-co-name">${companyName}</span><br>
            <span class="voucher-co-addr">Địa chỉ: ${companyAddr}</span><br>
            <span class="voucher-co-addr">MST: ${companyTax}</span>
          </div>
          <div class="voucher-template-code">
            <span class="template-bold">${templateCode}</span><br>
            <span>(Ban hành theo Thông tư số 200/2014/TT-BTC)</span>
          </div>
        </div>
        
        <div class="voucher-title-area">
          <span class="voucher-title">${title}</span><br>
          <span class="voucher-subtitle">Ngày ${v.date.substring(8,10)} tháng ${v.date.substring(5,7)} năm ${v.date.substring(0,4)}</span>
        </div>
        
        <div class="voucher-entries-note">
          <span>Số: <span class="template-bold">${v.id}</span></span><br>
          <span>Nợ TK: <span class="template-bold">${e.debit}</span></span><br>
          <span>Có TK: <span class="template-bold">${e.credit}</span></span>
        </div>
        
        <div style="margin-top:20px;">
          <div class="voucher-info-row">
            <span class="info-label">${isReceipt ? "- Người nộp tiền:" : "- Người nhận tiền:"}</span>
            <span class="info-dotted" style="font-weight:bold;">${v.partnerName}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Nội dung giao dịch:</span>
            <span class="info-dotted">${v.description}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Số tiền giao dịch:</span>
            <span class="info-dotted" style="font-weight:bold;">${formatVND(v.amount)}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Bằng chữ:</span>
            <span class="info-dotted" style="font-style:italic;">${numberToVietnameseWords(v.amount)}</span>
          </div>
          <div class="voucher-info-row">
            <span class="info-label">- Kèm theo chứng từ:</span>
            <span class="info-dotted">Hợp đồng bảo lãnh đại lý & Cam kết thực hiện nghĩa vụ</span>
          </div>
        </div>
        
        <div class="voucher-signatures" style="margin-top:40px;">
          <div class="sig-block">
            <span class="sig-title">Giám đốc</span><br>
            <span class="sig-subtext">(Ký, đóng dấu)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Lê Hoàng Đông</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Kế toán trưởng</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Nguyễn Văn Minh</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Thủ quỹ</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Phạm Thị Quỹ</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">${isReceipt ? "Người nộp tiền" : "Người nhận tiền"}</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">${v.partnerName.split(" ").slice(-2).join(" ")}</span>
          </div>
        </div>
      </div>
    `;
  }

  printArea.innerHTML = content;
  openModal("modal-view-voucher");
}

// 13. CÁC HÀM TIỆN ÍCH DỮ LIỆU & QUỸ (UTILITIES)

// Tìm số dư của tài khoản (111, 112, 156, etc.) phục vụ Dashboard và báo cáo
function getAccountBalance(acctCode) {
  const initBalObj = (state.initialBalances && state.initialBalances[acctCode]) || { type: "debit", balance: 0 };
  let bal = initBalObj.balance;
  const isDebit = initBalObj.type === "debit";

  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (v.entries && Array.isArray(v.entries)) {
        v.entries.forEach(e => {
          if (e.debit === acctCode) {
            bal += isDebit ? e.amount : -e.amount;
          }
          if (e.credit === acctCode) {
            bal += isDebit ? -e.amount : e.amount;
          }
        });
      }
    });
  }

  return bal;
}

// Định dạng tiền tệ Việt Nam Đồng VNĐ
function formatVND(value) {
  if (value === undefined || value === null || isNaN(value)) value = 0;
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

// Thuật toán chuyển đổi Số thành Chữ tiếng Việt cực chuẩn và chuyên nghiệp
function numberToVietnameseWords(number) {
  if (number === 0) return "Không đồng.";

  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

  function readGroupThree(n, showZeroHundreds) {
    let hundred = Math.floor(n / 100);
    let ten = Math.floor((n % 100) / 10);
    let unit = n % 10;
    let res = "";

    if (hundred > 0 || showZeroHundreds) {
      res += digits[hundred] + " trăm ";
    }

    if (ten > 0) {
      if (ten === 1) res += "mười ";
      else res += digits[ten] + " mươi ";
    } else if (hundred > 0 && unit > 0) {
      res += "linh ";
    }

    if (unit > 0) {
      if (unit === 1 && ten > 1) res += "mốt";
      else if (unit === 5 && ten > 0) res += "lăm";
      else res += digits[unit];
    }

    return res.trim();
  }

  let str = "";
  let groups = [];
  let temp = number;

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  for (let i = groups.length - 1; i >= 0; i--) {
    let g = groups[i];
    if (g > 0) {
      // Chỉ hiện "không trăm" ở các nhóm sau nhóm cao nhất nếu nhóm đó có hàng chục/đơn vị
      let showZero = i < groups.length - 1;
      let gRead = readGroupThree(g, showZero);
      if (gRead !== "") {
        str += gRead + " " + units[i] + " ";
      }
    }
  }

  str = str.trim();
  // Viết hoa chữ cái đầu tiên và thêm đuôi "đồng chẵn."
  return str.charAt(0).toUpperCase() + str.slice(1) + " đồng chẵn.";
}

// Giao diện đổi Theme Tối/Sáng
function toggleTheme() {
  const body = document.body;
  body.classList.toggle("light-theme");
  const isLight = body.classList.contains("light-theme");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  showToast(`Đã chuyển sang giao diện ${isLight ? 'Sáng' : 'Tối'}`, "info");
}

// Báo thông báo nổi (Toast Notifications)
function showToast(message, type = "primary") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const colors = {
    primary: "var(--color-primary)",
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    info: "var(--color-info)"
  };

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--toast-color", colors[type] || colors.primary);
  
  toast.innerHTML = `
    <div style="color: ${colors[type] || colors.primary}; display:flex; align-items:center;">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px; height:20px;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </div>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Tự hủy sau 4s
  setTimeout(() => {
    toast.style.animation = "slideInLeft 0.3s ease reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// 14. SAO LƯU SAO CHÉP CƠ SỞ DỮ LIỆU (DATABASE BACKUP & RESTORE)

// Xuất file dữ liệu kế toán JSON
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `RD_Accounting_Backup_${new Date().toISOString().split("T")[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("Xuất dữ liệu lưu trữ thành công!", "success");
}

// Nhập dữ liệu kế toán từ file JSON ngoài
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      // Kiểm tra sơ bộ tính toàn vẹn
      if (imported.companyName && imported.products && imported.vouchers) {
        state = imported;
        saveState();
        updateCompanyUI();
        recalculateAccounting();
        showToast("Khôi phục cơ sở dữ liệu kế toán thành công!", "success");
      } else {
        showToast("Cấu trúc file JSON không tương thích!", "danger");
      }
    } catch (err) {
      showToast("Lỗi đọc file JSON. Hãy thử lại!", "danger");
    }
  };
  reader.readAsText(file);
}

// Khôi phục dữ liệu mẫu
function resetDatabase() {
  if (confirm("Bạn có chắc muốn khôi phục dữ liệu mẫu ban đầu? Toàn bộ giao dịch hiện tại của bạn sẽ bị thay thế bằng dữ liệu demo của Rạng Đông.")) {
    state = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveState();
    updateCompanyUI();
    recalculateAccounting();
    showToast("Đã khôi phục cơ sở dữ liệu mẫu Rạng Đông!", "success");
  }
}

// Xóa trắng dữ liệu
function clearAllData() {
  if (confirm("CẢNH BÁO: Bạn đang xóa toàn bộ cơ sở dữ liệu về trắng! Tất cả giao dịch, sản phẩm, và số dư đầu kỳ sẽ biến mất.")) {
    state = {
      companyName: "CÔNG TY TNHH KẾ TOÁN RẠNG ĐÔNG",
      address: "Hà Nội, Việt Nam",
      taxCode: "0100000000",
      accountingStandard: "TT200",
      products: [],
      partners: [],
      initialBalances: JSON.parse(JSON.stringify(DEFAULT_DATA.initialBalances)),
      vouchers: []
    };
    
    // Clear balances
    Object.keys(state.initialBalances).forEach(k => {
      state.initialBalances[k].balance = 0;
    });

    saveState();
    updateCompanyUI();
    recalculateAccounting();
    showToast("Đã xóa sạch cơ sở dữ liệu về trắng!", "warning");
  }
}

// ==========================================================
// CÁC HÀM TÍCH HỢP EXCEL HUB & AUTOCOMPLETE (EXCEL HUB UTILITIES)
// ==========================================================

let productOptionsHTML = "";
let productOptionsSalesHTML = "";

// Khởi tạo cache sản phẩm và datalist đối tác
function initExcelIntegration() {
  cacheProductOptions();
  
  // Nạp datalist partners
  const datalist = document.getElementById("datalist-partners");
  if (datalist && state.partners) {
    datalist.innerHTML = state.partners.map(p => 
      `<option value="${p.id}">${p.name} [${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
    ).join("");
  }

  // Nạp datalist sản phẩm phục vụ autocomplete trong hóa đơn bán hàng
  const productDatalist = document.getElementById("datalist-sales-products");
  if (productDatalist && state.products) {
    productDatalist.innerHTML = state.products.map(p => 
      `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`
    ).join("");
  }

  // Khởi tạo các sự kiện kéo thả (Drag & Drop) cho Excel Drop Zones
  initExcelDragAndDrop();
  
  // Cập nhật thống kê
  updateExcelHubUI();
}

// Caching dropdown sản phẩm
function cacheProductOptions() {
  if (!state.products) return;
  productOptionsHTML = state.products.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join("");
  productOptionsSalesHTML = state.products.map(p => `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`).join("");

  const productDatalist = document.getElementById("datalist-sales-products");
  if (productDatalist) {
    productDatalist.innerHTML = state.products.map(p => 
      `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`
    ).join("");
  }
}

// Cập nhật thống kê trên Excel Hub
function updateExcelHubUI() {
  const statProds = document.getElementById("excel-stat-products");
  const statParts = document.getElementById("excel-stat-partners");
  const statVouch = document.getElementById("excel-stat-vouchers");
  const statStatus = document.getElementById("excel-stat-status");
  
  if (statProds && state.products) statProds.innerText = state.products.length.toLocaleString();
  if (statParts && state.partners) statParts.innerText = state.partners.length.toLocaleString();
  if (statVouch && state.vouchers) statVouch.innerText = state.vouchers.length.toLocaleString();
  if (statStatus) {
    if (state.vouchers && state.vouchers.length > 5) {
      statStatus.innerText = "Excel Database Active";
      statStatus.style.color = "var(--color-success)";
    } else {
      statStatus.innerText = "Demo Database Active";
      statStatus.style.color = "var(--color-warning)";
    }
  }
}

// Tìm đối tác thông minh
function resolvePartner(value) {
  const val = (value || "").toString().trim();
  if (!val) return { id: "DT_VANGLAI", name: "Khách hàng vãng lai" };
  
  // 1. Tìm chính xác theo ID
  let p = state.partners.find(item => item.id.toLowerCase() === val.toLowerCase());
  if (p) return p;
  
  // 2. Tìm chính xác theo Tên
  p = state.partners.find(item => item.name.toLowerCase() === val.toLowerCase());
  if (p) return p;
  
  // 3. Tìm tương đối theo Tên hoặc ID
  p = state.partners.find(item => item.name.toLowerCase().includes(val.toLowerCase()) || item.id.toLowerCase().includes(val.toLowerCase()));
  if (p) return p;
  
  // 4. Tạo đối tác mới tự động nếu không tồn tại
  return { id: val, name: val };
}

// Tìm sản phẩm thông minh từ từ khóa nhập (ID hoặc Tên) phục vụ autocomplete
function resolveProduct(value) {
  const val = (value || "").toString().trim();
  if (!val) return null;

  // 1. Tìm chính xác theo ID
  let p = state.products.find(item => item.id.toLowerCase() === val.toLowerCase());
  if (p) return p;

  // 2. Tìm chính xác theo Tên
  p = state.products.find(item => item.name.toLowerCase() === val.toLowerCase());
  if (p) return p;

  // 3. Tìm tương đối theo Tên hoặc ID
  p = state.products.find(item => item.name.toLowerCase().includes(val.toLowerCase()) || item.id.toLowerCase().includes(val.toLowerCase()));
  return p || null;
}

// Thiết lập kéo thả File Excel
function initExcelDragAndDrop() {
  const zones = [
    { id: 'excel-drop-zone-products', fileId: 'excel-file-products' },
    { id: 'excel-drop-zone-partners', fileId: 'excel-file-partners' },
    { id: 'excel-drop-zone-vouchers', fileId: 'excel-file-vouchers' }
  ];

  zones.forEach(zone => {
    const el = document.getElementById(zone.id);
    if (!el) return;

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('dragover');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('dragover');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dragover');
      
      const file = e.dataTransfer.files[0];
      if (file) {
        const type = zone.id.replace('excel-drop-zone-', '');
        parseExcelFile(file, type);
      }
    });
  });
}

function triggerFileInput(id) {
  const input = document.getElementById(id);
  if (input) input.click();
}

// Xử lý nộp file excel
function handleExcelImport(event, type) {
  const file = event.target.files[0];
  if (!file) return;
  parseExcelFile(file, type);
  // Clear input
  event.target.value = "";
}

// Bộ máy phân tích Excel động Client-side
function parseExcelFile(file, type) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (rows.length < 2) {
        showToast("File Excel trống hoặc không có dữ liệu!", "danger");
        return;
      }

      if (type === 'products') {
        let count = 0;
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          const name = (row[1] || "").toString().trim();
          if (!id || !name || id === "Mã") continue;
          
          const unit = (row[7] || "Cái").toString().trim();
          const minStock = Number(row[9]) || 0;
          const stock = Number(row[31]) || 0;
          const totalVal = Number(row[33]) || 0;
          const avgCost = stock > 0 ? Math.round(totalVal / stock) : (Number(row[19]) || 0);

          const idx = state.products.findIndex(p => p.id === id);
          const pObj = { id, name, unit, stock, avgCost, totalValue: stock * avgCost, minStock };
          if (idx !== -1) {
            state.products[idx] = pObj;
          } else {
            state.products.push(pObj);
          }
          count++;
        }
        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} sản phẩm từ file Excel!`, "success");
      } 
      
      else if (type === 'partners') {
        let count = 0;
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          const name = (row[1] || "").toString().trim();
          if (!id || !name || id === "Mã khách hàng") continue;

          const address = (row[2] || "").toString().trim();
          const group = (row[3] || "").toString().trim().toUpperCase();
          const taxCode = (row[4] || "").toString().trim();
          const phone = (row[5] || "").toString().trim();
          const type = (group.includes("NCC") || id.startsWith("NCC")) ? "supplier" : "customer";

          const idx = state.partners.findIndex(p => p.id === id);
          const pObj = { id, name, type, phone, email: "", address };
          if (idx !== -1) {
            state.partners[idx] = pObj;
          } else {
            state.partners.push(pObj);
          }
          count++;
        }
        
        // Cập nhật datalist
        const datalist = document.getElementById("datalist-partners");
        if (datalist) {
          datalist.innerHTML = state.partners.map(p => 
            `<option value="${p.id}">${p.name} [${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
          ).join("");
        }

        saveState();
        showToast(`Đã nạp thành công ${count} đối tác từ file Excel!`, "success");
      } 
      
      else if (type === 'vouchers') {
        let count = 0;
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[2] || "").toString().trim();
          if (!id || id === "Số chứng từ") continue;

          const dateStr = excelDateToISOString(row[0]);
          const description = (row[3] || "Giao dịch phát sinh").toString().trim();
          const amount = Number(row[4]) || 0;
          const partnerName = (row[5] || "Khách hàng vãng lai").toString().trim();
          const voucherTypeStr = (row[8] || "").toString().trim().toUpperCase();

          const descLower = description.toLowerCase();
          let paymentMethod = "111";
          if (descLower.includes("ck") || descLower.includes("chuyển khoản") || descLower.includes("ủy nhiệm chi") || descLower.includes("ngân hàng")) {
            paymentMethod = "112";
          }

          let type = "receipt";
          let debitAccount = "111";
          let creditAccount = "131";

          if (voucherTypeStr.includes("CHI") || voucherTypeStr.includes("MUA HÀNG") || voucherTypeStr.includes("TRẢ LẠI")) {
            type = "payment";
            debitAccount = "331";
            creditAccount = paymentMethod;
            
            if (descLower.includes("mua hàng") || descLower.includes("nhập kho")) {
              debitAccount = "156";
            } else if (descLower.includes("chi phí") || descLower.includes("thuê xưởng")) {
              debitAccount = "642";
            }
          } else {
            type = "receipt";
            debitAccount = paymentMethod;
            creditAccount = "131";
            if (descLower.includes("doanh thu") || descLower.includes("bán hàng")) {
              creditAccount = "511";
            }
          }

          let partnerId = "";
          const matched = state.partners.find(p => p.name === partnerName);
          if (matched) {
            partnerId = matched.id;
          } else {
            partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
            state.partners.push({ id: partnerId, name: partnerName, type: type === "receipt" ? "customer" : "supplier", phone: "", email: "", address: "" });
          }

          const idx = state.vouchers.findIndex(v => v.id === id);
          const vObj = {
            id,
            type,
            date: dateStr,
            partnerId,
            partnerName,
            paymentMethod,
            description,
            amount,
            entries: [{ debit: debitAccount, credit: creditAccount, amount, desc: description }]
          };
          if (idx !== -1) {
            state.vouchers[idx] = vObj;
          } else {
            state.vouchers.push(vObj);
          }
          count++;
        }
        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} chứng từ vào sổ cái!`, "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi phân tích file Excel. Định dạng không tương thích!", "danger");
    }
  };
  reader.readAsArrayBuffer(file);
}

// Convert Excel Serial Date in Client
function excelDateToISOString(serial) {
  if (!serial) return new Date().toISOString().split('T')[0];
  if (typeof serial === "string") return serial.split('T')[0];
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return date.toISOString().split('T')[0];
}

// Ghi đè cơ sở dữ liệu mặc định từ Excel
function syncDefaultExcelDatabase() {
  if (typeof PREPOPULATED_DATABASE === "undefined") {
    showToast("Cơ sở dữ liệu tích hợp Excel chưa được nạp sẵn!", "danger");
    return;
  }
  if (confirm("XÁC NHẬN: Bạn có chắc chắn muốn đồng bộ toàn bộ dữ liệu Excel gốc? Toàn bộ giao dịch và thiết lập hiện tại sẽ được ghi đè hoàn toàn bằng 9.297 đối tác, 1.588 sản phẩm và 2.153 chứng từ từ folder Excel.")) {
    state = JSON.parse(JSON.stringify(PREPOPULATED_DATABASE));
    saveState();
    initExcelIntegration();
    recalculateAccounting();
    showToast("Đồng bộ Cơ sở dữ liệu tích hợp Excel thành công!", "success");
    switchTab("dashboard");
  }
}

// Xem biểu mẫu in ấn chứng từ excel mẫu chuẩn MISA
function viewExcelFormSample(type) {
  const id = type === 'PT' ? 'PT13134' : 'PC7194';
  const v = state.vouchers.find(x => x.id === id);
  if (v) {
    viewVoucher(id);
  } else {
    let sampleV = {};
    if (type === 'PT') {
      sampleV = {
        id: "PT13134",
        type: "receipt",
        date: "2026-05-18",
        partnerName: "Anh Cường (KH7970T02/2026)",
        paymentMethod: "111",
        description: "PT4054/q82 Anh Cường (KH7970T02/2026) nộp tiền mua hàng",
        amount: 17944820,
        entries: [{ debit: "1111", credit: "131", amount: 17944820, desc: "PT4054/q82 Anh Cường thu nợ" }]
      };
    } else {
      sampleV = {
        id: "PC7194",
        type: "payment",
        date: "2026-05-19",
        partnerName: "Công ty TNHH Sản Xuất Thương Mại Dịch Vụ Lan Thanh",
        paymentMethod: "111",
        description: "Chi khác ck thanh toán lan thanh",
        amount: 120000000,
        entries: [{ debit: "331", credit: "1111", amount: 120000000, desc: "Chi trả nợ cho Lan Thanh" }]
      };
    }
    state.vouchers.push(sampleV);
    viewVoucher(sampleV.id);
    state.vouchers = state.vouchers.filter(x => x.id !== id);
  }
}

// Xuất dữ liệu hệ thống ra file Excel
function exportDataToExcelSample() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  try {
    const wb = XLSX.utils.book_new();

    const prodRows = state.products.map(p => ({
      "Mã hàng": p.id,
      "Tên sản phẩm": p.name,
      "Đơn vị tính": p.unit,
      "Số lượng tồn": p.stock,
      "Giá vốn bình quân": p.avgCost,
      "Tổng giá trị tồn": p.totalValue,
      "Tồn tối thiểu": p.minStock
    }));
    const wsProd = XLSX.utils.json_to_sheet(prodRows);
    XLSX.utils.book_append_sheet(wb, wsProd, "Sản Phẩm");

    const partRows = state.partners.map(p => ({
      "Mã đối tác": p.id,
      "Tên đối tác": p.name,
      "Phân loại": p.type === 'supplier' ? 'Nhà cung cấp' : 'Khách hàng',
      "Số điện thoại": p.phone,
      "Địa chỉ": p.address
    }));
    const wsPart = XLSX.utils.json_to_sheet(partRows);
    XLSX.utils.book_append_sheet(wb, wsPart, "Đối Tác");

    const vouchRows = state.vouchers.map(v => ({
      "Mã chứng từ": v.id,
      "Ngày lập": v.date,
      "Loại": v.type,
      "Tên đối tác": v.partnerName,
      "Diễn giải": v.description,
      "Số tiền": v.amount,
      "Phương thức": v.paymentMethod === '111' ? 'Tiền mặt (111)' : 'Ngân hàng (112)'
    }));
    const wsVouch = XLSX.utils.json_to_sheet(vouchRows);
    XLSX.utils.book_append_sheet(wb, wsVouch, "Chứng Từ");

    XLSX.writeFile(wb, `RD_Accounting_System_Excel_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast("Xuất báo cáo hệ thống ra tệp Excel thành công!", "success");
  } catch (err) {
    showToast("Lỗi xuất dữ liệu Excel!", "danger");
  }
}
