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

  // Đảm bảo khởi tạo các tài khoản số dư đầu kỳ và số dư đối tác
  if (!state.initialBalances || Object.keys(state.initialBalances).length === 0) {
    state.initialBalances = JSON.parse(JSON.stringify(DEFAULT_DATA.initialBalances));
  }
  if (!state.partnerOpeningBalances || Object.keys(state.partnerOpeningBalances).length === 0) {
    if (typeof PREPOPULATED_DATABASE !== "undefined" && PREPOPULATED_DATABASE.partnerOpeningBalances) {
      state.partnerOpeningBalances = JSON.parse(JSON.stringify(PREPOPULATED_DATABASE.partnerOpeningBalances));
    } else {
      state.partnerOpeningBalances = {};
    }
  }

  // Dọn dẹp dữ liệu rác đối tác đầu kỳ không hợp lệ
  if (state.partnerOpeningBalances) {
    const validPartnerIds = new Set(state.partners.map(p => p.id));
    Object.keys(state.partnerOpeningBalances).forEach(key => {
      if (!validPartnerIds.has(key)) {
        delete state.partnerOpeningBalances[key];
      }
    });
  }



  // Đặt theme mặc định (Tối)
  const isLightTheme = localStorage.getItem("theme") === "light";
  if (isLightTheme) {
    document.body.classList.add("light-theme");
  }

  // Khởi tạo các dòng Excel mặc định nếu bị thiếu
  initializeMissingExcelRows();
  
  // Dọn dẹp và chuẩn hóa dữ liệu Excel cũ tránh giá trị undefined
  if (typeof migrateAndCleanExistingExcelRows === "function") {
    migrateAndCleanExistingExcelRows();
  }

  // Khởi tạo cache sản phẩm & datalist đối tác Excel
  initExcelIntegration();

  // Cập nhật thông tin công ty lên giao diện
  updateCompanyUI();
  
  // Chạy lại thuật toán tính toán kế toán & giá vốn để đồng bộ
  recalculateAccounting();
  
  // Tách số điện thoại từ địa chỉ tự động nếu có
  if (typeof autoExtractPhonesAndCleanAddresses === "function") {
    autoExtractPhonesAndCleanAddresses();
  }
  
  // Nạp cấu hình & khởi tạo đồng bộ trực tuyến
  if (typeof loadCloudSettings === "function") {
    loadCloudSettings();
  }
  if (typeof initCloudSync === "function") {
    initCloudSync();
  }

  // Tự động tích hợp lịch sử bán hàng từ Ban_hang.xlsx nếu chưa tích hợp
  autoIntegrateSalesExcel();

  // Mở tab mặc định
  switchTab("dashboard");
}

async function autoIntegrateSalesExcel() {
  if (state.salesExcelIntegrated) {
    console.log("Sales Excel database is already integrated.");
    return;
  }
  
  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Sales Excel integration...");
    setTimeout(autoIntegrateSalesExcel, 1000);
    return;
  }
  
  console.log("Starting automatic integration of excel/Ban_hang.xlsx...");
  try {
    const response = await fetch('excel/Ban_hang.xlsx');
    if (!response.ok) {
      console.warn("No excel/Ban_hang.xlsx file found or failed to fetch. Skipping auto-integration.");
      return;
    }
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 2) {
      console.warn("excel/Ban_hang.xlsx is empty.");
      return;
    }

    let count = 0;
    const partnerMap = new Map();
    state.partners.forEach(p => partnerMap.set(p.name, p.id));

    const voucherMap = new Map();
    state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const id = (row[2] || "").toString().trim();
      if (!id || id === "Số chứng từ") continue;

      const dateStr = excelDateToISOString(row[0]);
      const partnerName = (row[6] || "Khách hàng vãng lai").toString().trim();
      const description = (row[7] || "Bán hàng").toString().trim();
      
      const H = Number(row[8]) || 0;
      const C = Number(row[9]) || 0;
      const T = Number(row[10]) || 0;
      const totalAmount = Number(row[11]) || 0;

      let paymentMethod = "131";
      const docTypeStr = (row[14] || "").toString().trim().toUpperCase();
      if (docTypeStr.includes("TIỀN MẶT")) {
        paymentMethod = "111";
      }

      let partnerId = partnerMap.get(partnerName);
      if (!partnerId) {
        partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
        state.partners.push({
          id: partnerId,
          name: partnerName,
          type: "customer",
          phone: "",
          email: "",
          address: ""
        });
        partnerMap.set(partnerName, partnerId);
      }

      const originalRow = [];
      for (let col = 0; col < 15; col++) {
        originalRow[col] = row[col] !== undefined ? row[col] : "";
      }

      const vObj = {
        id,
        type: "sales",
        date: dateStr,
        partnerId,
        partnerName,
        paymentMethod,
        description,
        taxRate: 0,
        taxAmount: T,
        totalAmount: totalAmount,
        amount: totalAmount,
        items: [
          {
            productId: "SP_GENERIC",
            qty: 1,
            price: H,
            discount: H > 0 ? Math.round((C / H) * 100 * 100) / 100 : 0,
            amount: H - C
          }
        ],
        excelRow: originalRow
      };

      const existingIdx = voucherMap.get(id);
      if (existingIdx !== undefined) {
        state.vouchers[existingIdx] = vObj;
      } else {
        state.vouchers.push(vObj);
        voucherMap.set(id, state.vouchers.length - 1);
      }
      count++;
    }

    state.salesExcelIntegrated = true;
    saveState();
    recalculateAccounting();
    console.log(`Successfully auto-integrated ${count} sales vouchers from Ban_hang.xlsx!`);
    if (typeof filterSales === "function") filterSales();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    console.error("Error auto-integrating sales Excel:", err);
  }
}

// Lưu trạng thái vào localStorage & Đồng bộ lên Đám mây
function saveState() {
  localStorage.setItem("rd_accounting_db", JSON.stringify(state));
  if (typeof pushToCloud === "function") {
    pushToCloud();
  }
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
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "331") ? totalAmount : 0;
      }

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
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131") ? totalAmount : 0;
      }

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
  } else if (tabId === "partners") {
    filterPartners();
  } else if (tabId === "debts") {
    filterDebts();
  } else if (tabId === "cash") {
    filterCash();
    recalculateCashKpis();
  } else if (tabId === "dashboard") {
    renderDashboard();
  } else if (tabId === "settings") {
    if (typeof updateErrorLogsUI === "function") {
      updateErrorLogsUI();
    }
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

  // RENDER CÔNG NỢ & ĐƠN HÀNG CHƯA TẤT TOÁN
  renderDashboardDebts();
}

function renderDashboardDebts() {
  // 1. Render các đơn hàng chưa tất toán (đang nợ)
  const unsettledTbody = document.getElementById("dashboard-unsettled-orders");
  if (unsettledTbody) {
    unsettledTbody.innerHTML = "";
    
    const unsettled = [];
    
    // A. Thêm các hóa đơn bán hàng chưa tất toán
    const salesVouchers = state.vouchers.filter(v => v.type === "sales");
    salesVouchers.forEach(v => {
      const totalAmt = v.totalAmount || v.amount || 0;
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131") ? totalAmt : 0;
      }
      if (v.remainingDebt > 0) {
        unsettled.push({
          id: v.id,
          partnerId: v.partnerId,
          partnerName: getPartnerNameForVoucher(v),
          totalAmount: totalAmt,
          remainingDebt: v.remainingDebt,
          date: v.date,
          isOpening: false
        });
      }
    });

    // B. Thêm các công nợ đầu kỳ của đối tác
    state.partners.forEach(p => {
      const opening = state.partnerOpeningBalances[p.id];
      if (opening) {
        const val = p.type === "customer" ? (opening.debit || 0) : (opening.credit || 0);
        if (val > 0) {
          unsettled.push({
            id: `OP-${p.id}`,
            partnerId: p.id,
            partnerName: p.name,
            totalAmount: val,
            remainingDebt: val,
            date: "2026-01-01",
            isOpening: true
          });
        }
      }
    });
    
    // Sắp xếp đơn hàng nợ lâu nhất lên đầu
    unsettled.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (unsettled.length === 0) {
      unsettledTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:15px;">Không có đơn hàng nào đang nợ</td></tr>`;
    } else {
      unsettled.forEach(item => {
        const tr = document.createElement("tr");
        const isOp = item.isOpening;
        const escapedId = escapeHtmlAttr(item.id);
        const escapedPartnerId = escapeHtmlAttr(item.partnerId);
        const idCol = isOp 
          ? `<span style="color:var(--text-secondary); font-style:italic;">Dư đầu kỳ</span>`
          : `<a href="#" onclick="viewVoucher('${escapedId}'); return false;" style="color:var(--color-primary);">${escapedId}</a>`;
        
        tr.innerHTML = `
          <td style="font-weight:bold;">${idCol}</td>
          <td><a href="#" onclick="viewPartnerLedger('${escapedPartnerId}'); return false;" style="font-weight:600; color:var(--text-primary); text-decoration:underline;">${item.partnerName}</a></td>
          <td style="text-align:right;" class="font-numeric">${formatVND(item.totalAmount).replace("đ","")}</td>
          <td style="text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${formatVND(item.remainingDebt).replace("đ","")}</td>
          <td style="text-align:center;">
            <button class="btn btn-secondary btn-sm" onclick="promptEditOrderDebt('${escapedId}')" style="padding: 2px 6px; font-size:11px;">Sửa</button>
          </td>
        `;
        unsettledTbody.appendChild(tr);
      });
    }
  }

  // 2. Render nhắc nhở các công nợ chưa thu được lâu ngày
  const agedTbody = document.getElementById("dashboard-aged-debts");
  if (agedTbody) {
    agedTbody.innerHTML = "";
    
    const agedDebts = [];
    const today = new Date("2026-05-25"); // Lấy thời gian hiện tại theo metadata của hệ thống
    
    // A. Thêm hóa đơn bán hàng chưa tất toán
    const salesVouchers = state.vouchers.filter(v => v.type === "sales");
    salesVouchers.forEach(v => {
      const totalAmt = v.totalAmount || v.amount || 0;
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131") ? totalAmt : 0;
      }
      
      if (v.remainingDebt > 0) {
        const docDate = new Date(v.date);
        const diffTime = today - docDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        agedDebts.push({
          partnerId: v.partnerId,
          partnerName: getPartnerNameForVoucher(v),
          remainingDebt: v.remainingDebt,
          date: v.date,
          days: diffDays
        });
      }
    });

    // B. Thêm các công nợ đầu kỳ đối tác (đặc biệt là khách hàng nợ lâu ngày)
    state.partners.forEach(p => {
      if (p.type === "customer") {
        const opening = state.partnerOpeningBalances[p.id];
        const val = opening ? (opening.debit || 0) : 0;
        if (val > 0) {
          const docDate = new Date("2026-01-01");
          const diffTime = today - docDate;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          
          agedDebts.push({
            partnerId: p.id,
            partnerName: p.name,
            remainingDebt: val,
            date: "01/01/2026 (Đầu kỳ)",
            days: diffDays
          });
        }
      }
    });
    
    // Ưu tiên nợ trễ nhiều ngày nhất lên đầu
    agedDebts.sort((a, b) => b.days - a.days);
    
    if (agedDebts.length === 0) {
      agedTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:15px;">Không có công nợ quá hạn</td></tr>`;
    } else {
      agedDebts.forEach(item => {
        const tr = document.createElement("tr");
        
        let dayClass = "badge-info";
        let dayLabel = `${item.days} ngày`;
        if (item.days > 90) {
          dayClass = "badge-danger";
        } else if (item.days > 30) {
          dayClass = "badge-warning";
        }
        
        tr.innerHTML = `
          <td><a href="#" onclick="viewPartnerLedger('${escapeHtmlAttr(item.partnerId)}'); return false;" style="font-weight:600; color:var(--text-primary); text-decoration:underline;">${item.partnerName}</a></td>
          <td style="text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${formatVND(item.remainingDebt).replace("đ","")}</td>
          <td>${item.date}</td>
          <td style="text-align:center;"><span class="badge ${dayClass}">${dayLabel}</span></td>
        `;
        agedTbody.appendChild(tr);
      });
    }
  }

  // 3. Render giá trị KPI công nợ
  const kpiReceivable = document.getElementById("kpi-debt-receivable");
  const kpiPayable = document.getElementById("kpi-debt-payable");
  
  if (kpiReceivable || kpiPayable) {
    const calculatedDebts = calculatePartnerDebts();
    let totalRec = 0;
    let totalPay = 0;
    calculatedDebts.forEach(d => {
      totalRec += d.closingDebit;
      totalPay += d.closingCredit;
    });
    if (kpiReceivable) kpiReceivable.innerText = formatVND(totalRec);
    if (kpiPayable) kpiPayable.innerText = formatVND(totalPay);
  }
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
  // Sắp xếp số chứng từ giảm dần (to nhất lên trước)
  purchases.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' }));

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
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
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
            <button class="print-btn" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" title="Xem và In mẫu chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ">
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

let salesCurrentPage = 1;

// 7. RENDER DỮ LIỆU PHÂN HỆ BÁN HÀNG (SALES)
function renderSalesTable() {
  const tbody = document.getElementById("sales-table-body");
  if (!tbody) return;

  let sales = state.vouchers.filter(v => v.type === "sales");

  // Advanced search filters
  const query = document.getElementById("search-sales") ? document.getElementById("search-sales").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-sales-from") ? document.getElementById("search-sales-from").value : "";
  const toDate = document.getElementById("search-sales-to") ? document.getElementById("search-sales-to").value : "";

  if (query) {
    sales = sales.filter(v => 
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
    );
  }

  if (fromDate) {
    sales = sales.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    sales = sales.filter(v => v.date <= toDate);
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
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy hóa đơn bán hàng nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayedSales.map(v => {
    const rawVal = v.totalAmount - (v.taxAmount || 0);
    // Định dạng ngày lập hiển thị dạng Ngày/Tháng/Năm (DD/MM/YYYY)
    const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
    
    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="sale-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchSalesUI()">
        </td>
        <td class="font-numeric" style="color: var(--color-success); font-weight:700;">${v.id}</td>
        <td>${formattedDate}</td>
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
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

  // Reset check-all-products checkbox
  const checkAll = document.getElementById("check-all-products");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchProductsUI === "function") updateBatchProductsUI();

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy sản phẩm phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const isLow = (p.stock || 0) <= (p.minStock || 0);
    const escapedId = escapeHtmlAttr(p.id);
    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="product-checkbox" value="${escapedId}" onchange="updateBatchProductsUI()">
        </td>
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
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center;">
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
          <td class="font-numeric" style="color:var(--color-primary); cursor:pointer; font-weight:700;" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')">${v.id}</td>
          <td class="text-right font-numeric" style="color: var(--color-primary); font-weight:700;">+${item.qty}</td>
          <td class="text-right font-numeric">-</td>
          <td class="text-right font-numeric">${formatVND(item.price)}</td>
        </tr>
      `;
    } else if (v.type === "sales") {
      html += `
        <tr>
          <td>${v.date}</td>
          <td class="font-numeric" style="color:var(--color-success); cursor:pointer; font-weight:700;" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')">${v.id}</td>
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
        <td><span style="font-weight:600;">${getPartnerNameForVoucher(v)}</span></td>
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
            <button class="btn btn-secondary btn-sm" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')">Xem/In</button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ">
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
      <input type="number" class="form-control item-qty text-right" required value="${qtyVal}" min="1" oninput="recalculateSalesTotals()">
    </td>
    <td>
      <input type="number" class="form-control item-price text-right" required value="${priceVal}" min="0" oninput="recalculateSalesTotals()">
    </td>
    <td>
      <input type="number" class="form-control item-discount text-right" required value="${discountVal}" min="0" max="100" oninput="recalculateSalesTotals()" placeholder="0">
    </td>
    <td class="text-right font-numeric item-total-display" style="font-weight:700; padding:10px;">0đ</td>
    <td style="text-align: center;">
      <button type="button" class="trash-btn" onclick="document.getElementById('${rowId}').remove(); recalculateSalesTotals();">×</button>
    </td>
  `;

  tbody.appendChild(tr);
  recalculateSalesTotals();
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

let editingSalesId = null;

// Reset form bán hàng
function resetSalesForm() {
  editingSalesId = null;
  const modalTitle = document.querySelector("#modal-add-sales .card-title");
  if (modalTitle) modalTitle.innerText = "Lập hóa đơn bán hàng xuất kho";

  const tbody = document.getElementById("sales-form-items-body");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("sale-desc").value = "Bán sản phẩm Rạng Đông xuất kho";
  document.getElementById("sale-date").value = new Date().toISOString().split("T")[0];
  addSalesFormRow();
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
    
    // Kiểm tra hàng tồn kho khả dụng (Cộng lại lượng đã bán cũ của chứng từ này nếu đang edit)
    let oldQty = 0;
    if (editingSalesId) {
      const oldVoucher = state.vouchers.find(v => v.id === editingSalesId);
      if (oldVoucher) {
        const oldItem = oldVoucher.items.find(item => item.productId === productId);
        if (oldItem) oldQty = oldItem.qty || 0;
      }
    }
    if ((resolvedProduct.stock + oldQty) < qty) {
      showToast(`Hàng tồn kho sản phẩm "${resolvedProduct.name}" không đủ (Còn tồn ${resolvedProduct.stock + oldQty}, cần bán ${qty})!`, "danger");
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
    id: editingSalesId || generateNextSalesVoucherId(document.getElementById("sale-payment").value),
    type: "sales",
    date: document.getElementById("sale-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("sale-payment").value,
    description: document.getElementById("sale-desc").value,
    items: voucherItems,
    taxRate: parseInt(document.getElementById("sale-tax-rate").value)
  };

  if (editingSalesId) {
    const idx = state.vouchers.findIndex(v => v.id === editingSalesId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
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
    const prod = state.products.find(p => p.id === item.productId);
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    addSalesFormRow(prodVal, item.qty, item.price, item.discount);
  });

  openModal("modal-add-sales");
}

function openQuickAddPartnerModal() {
  const nameEl = document.getElementById("quick-partner-name");
  const phoneEl = document.getElementById("quick-partner-phone");
  const addressEl = document.getElementById("quick-partner-address");
  if (nameEl) nameEl.value = "";
  if (phoneEl) phoneEl.value = "";
  if (addressEl) addressEl.value = "";
  
  openModal("modal-quick-add-partner");
}

function handleQuickAddPartnerSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById("quick-partner-name").value.trim();
  const phone = document.getElementById("quick-partner-phone").value.trim();
  const address = document.getElementById("quick-partner-address").value.trim();
  
  if (!name) {
    showToast("Vui lòng nhập tên khách hàng!", "danger");
    return;
  }
  
  let partner = state.partners.find(p => p.name.toLowerCase() === name.toLowerCase());
  
  if (!partner) {
    const nextNum = (state.partners.filter(p => p.type === "customer").length + 1).toString().padStart(3, '0');
    const id = `KH${nextNum}`;
    
    partner = {
      id,
      name,
      type: "customer",
      phone,
      email: "",
      address,
      taxCode: "",
      inactive: false
    };
    
    state.partners.push(partner);
    saveState();
    
    // Nạp lại datalist đối tác
    const datalist = document.getElementById("datalist-partners");
    if (datalist && state.partners) {
      datalist.innerHTML = state.partners.map(p => 
        `<option value="${p.id}">${p.name} [${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
      ).join("");
    }
    
    showToast(`Đã thêm thành công khách hàng "${name}" với mã ${id}!`, "success");
  } else {
    showToast(`Khách hàng "${name}" đã tồn tại trên hệ thống!`, "info");
  }
  
  const inputEl = document.getElementById("sale-partner");
  if (inputEl) {
    inputEl.value = partner.id;
  }
  
  closeModal("modal-quick-add-partner");
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
    
    // Tự động làm tươi tất cả các bảng và KPIs trên mọi tab
    if (typeof filterSales === "function") filterSales();
    if (typeof filterPurchases === "function") filterPurchases();
    if (typeof filterCash === "function") {
      filterCash();
      if (typeof recalculateCashKpis === "function") recalculateCashKpis();
    }
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof renderInventoryTable === "function") renderInventoryTable();
    
    showToast(`Đã xóa thành công chứng từ ${id}!`, "success");
  }
}

// 12. XEM VÀ IN BIỂU MẪU CHỨNG TỪ THEO CHUẨN BỘ TÀI CHÍNH
function viewVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  const partnerName = getPartnerNameForVoucher(v);
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
            <span class="sig-name">${partnerName.split(" ").slice(-2).join(" ")}</span>
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
      <div class="printable-voucher" style="max-width: 800px; padding: 30px; font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; line-height: 1.4;">
        
        <!-- Header: Logo Rạng Đông bên trái & Thông tin công ty bên phải -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 15px;">
          <!-- Logo Rạng Đông thực tế từ file images (1).png -->
          <div style="display: flex; align-items: center; justify-content: center; width: 140px; margin-right: 10px; height: 60px;">
            <img src="images (1).png" style="max-height: 55px; max-width: 130px; object-fit: contain;" alt="Logo Rạng Đông" />
          </div>

          <!-- Thông tin công ty chính xác theo mẫu giấy -->
          <div style="text-align: center; flex-grow: 1; padding-left: 10px; color: #000;">
            <div style="font-weight: bold; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.2px;">CÔNG TY CP SẢN XUẤT VÀ ĐT PHÁT TRIỂN RẠNG ĐÔNG</div>
            <div style="font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 2px;">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY</div>
            <div style="font-size: 11px; margin-top: 3px;">Địa chỉ: 255 Trương Công Định, P. Vũng Tàu</div>
            <div style="font-size: 11px; margin-top: 1px; font-weight: 500;">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
          </div>
        </div>

        <!-- Tiêu đề Phiếu giao hàng -->
        <div style="text-align: center; margin-bottom: 18px;">
          <div style="font-size: 22px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase;">PHIẾU GIAO HÀNG</div>
        </div>

        <!-- Phần thông tin khách hàng và ngày hóa đơn (chia cột giống giấy) -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; row-gap: 6px; column-gap: 15px; margin-bottom: 15px; font-size: 13px;">
          <div>
            <strong>Tên khách hàng:</strong> <span style="font-size: 13.5px;">${partnerName}</span>
          </div>
          <div style="text-align: right;">
            <strong>Ngày:</strong> ${v.date.substring(8,10)}/${v.date.substring(5,7)}/${v.date.substring(0,4)}
          </div>
          
          <div>
            <strong>Điện thoại:</strong> <span>${(state.partners.find(x => x.id === v.partnerId) || {}).phone || "-"}</span>
          </div>
          <div style="text-align: right;">
            <strong>Số:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 14px;">${v.id}</span>
          </div>

          <div style="grid-column: span 2;">
            <strong>Địa chỉ:</strong> <span>${(state.partners.find(x => x.id === v.partnerId) || {}).address || "-"}</span>
          </div>
          
          <div style="grid-column: span 2;">
            <strong>Diễn giải:</strong> ${v.description || `Bán hàng ${partnerName}`}
          </div>
        </div>

        <!-- Bảng sản phẩm -->
        <table class="voucher-table" style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1.5px solid #000;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #000; padding: 6px 4px; text-align: center; font-weight: bold; width: 5%;">TT</th>
              <th style="border: 1px solid #000; padding: 6px 8px; text-align: left; font-weight: bold; width: 45%;">Diễn giải</th>
              <th style="border: 1px solid #000; padding: 6px 4px; text-align: center; font-weight: bold; width: 8%;">ĐV</th>
              <th style="border: 1px solid #000; padding: 6px 6px; text-align: right; font-weight: bold; width: 10%;">Số lượng</th>
              <th style="border: 1px solid #000; padding: 6px 6px; text-align: right; font-weight: bold; width: 12%;">Đơn giá</th>
              <th style="border: 1px solid #000; padding: 6px 6px; text-align: right; font-weight: bold; width: 15%;">Thành tiền</th>
              <th style="border: 1px solid #000; padding: 6px 4px; text-align: center; font-weight: bold; width: 5%;">G.C</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map((item, idx) => {
              const prod = state.products.find(p => p.id === item.productId) || { name: item.productId };
              const qtyFormatted = Number.isInteger(item.qty) ? `${item.qty},0` : item.qty.toString().replace(".", ",");
              const gcVal = (item.discount !== undefined && item.discount !== null) ? item.discount : "0";
              return `
                <tr>
                  <td style="border: 1px solid #000; padding: 6px 4px; text-align: center;">${idx + 1}</td>
                  <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 500;">${prod.name}</td>
                  <td style="border: 1px solid #000; padding: 6px 4px; text-align: center;">${prod.unit || "Cái"}</td>
                  <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;" class="font-numeric">${qtyFormatted}</td>
                  <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;" class="font-numeric">${formatVND(item.price).replace("đ","").trim()}</td>
                  <td style="border: 1px solid #000; padding: 6px 6px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(item.amount).replace("đ","").trim()}</td>
                  <td style="border: 1px solid #000; padding: 6px 4px; text-align: center;">${gcVal}</td>
                </tr>
              `;
            }).join("")}
            
            <!-- Phần tổng tiền -->
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 5px 10px; text-align: right; font-weight: bold; border-top: 1.5px solid #000;">Cộng tiền hàng :</td>
              <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(grossTotal).replace("đ","").trim()}</td>
              <td style="border: 1px solid #000; border-top: 1.5px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 5px 10px; text-align: right; font-weight: 500;">Số tiền chiết khấu:</td>
              <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: 500;" class="font-numeric">${formatVND(totalDiscount).replace("đ","").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
            <tr style="background-color: #f9fafb;">
              <td colspan="5" style="border: 1px solid #000; padding: 6px 10px; text-align: right; font-weight: bold; text-transform: uppercase;">Tổng tiền thanh toán:</td>
              <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(v.totalAmount).replace("đ","").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
          </tbody>
        </table>

        <!-- Chữ số tiền viết bằng chữ & ghi chú -->
        <div style="margin-bottom: 20px; font-size: 13px; line-height: 1.5;">
          <div style="margin-bottom: 4px;">
            <strong>Số tiền viết bằng chữ:</strong> <span style="font-style: italic;">${numberToVietnameseWords(v.totalAmount)}</span>
          </div>
          <div>
            <strong>Ghi chú:</strong> <span style="font-style: italic; color: #374151;">${v.notes || "hàng thừa trả lại dơ bẩn không thu lại. Không thu lại nút bịt"}</span>
          </div>
        </div>

        <!-- Chữ ký và dấu (Nhiệm vụ người lập, giao, nhận) -->
        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 30px; font-size: 12.5px;">
          <div style="width: 30%;">
            <strong>Người nhận hàng</strong><br>
            <span style="font-style: italic; font-size: 11px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 65px;"></div>
            <div style="border-top: 1px dotted #888; width: 80%; margin: 0 auto; padding-top: 4px; color: #555; font-size: 11px;">Họ tên khách nhận</div>
          </div>
          
          <div style="width: 30%;">
            <strong>Người giao hàng</strong><br>
            <span style="font-style: italic; font-size: 11px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 65px;"></div>
            <div style="border-top: 1px dotted #888; width: 80%; margin: 0 auto; padding-top: 4px; color: #555; font-size: 11px;">Nhân viên giao nhận</div>
          </div>
          
          <div style="width: 30%; position: relative;">
            <strong>Người lập phiếu</strong><br>
            <span style="font-style: italic; font-size: 11px; color: #555;">(Ký, họ tên)</span>
            
            <!-- Giả lập chữ ký nghệ thuật và dấu mộc đỏ siêu đẹp như mẫu -->
            <div style="height: 65px; position: relative; display: flex; align-items: center; justify-content: center; margin-top: 5px;">
              <!-- Nét vẽ chữ ký tay nghệ thuật -->
              <span style="font-family: 'Brush Script MT', 'Courier New', cursive, sans-serif; font-size: 26px; color: #2563eb; transform: rotate(-5deg); position: absolute; top: 12px; font-weight: bold; opacity: 0.85; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.1));">Nhung</span>
              <!-- Dấu mộc chữ tên tròn hoặc đỏ giả lập của Rạng Đông -->
              <div style="border: 2px solid #ef4444; border-radius: 4px; padding: 2px 6px; color: #ef4444; font-weight: bold; font-family: monospace; font-size: 10px; text-transform: uppercase; transform: rotate(5deg) scale(0.9); position: absolute; top: 22px; left: 55px; background-color: rgba(254, 226, 226, 0.4); box-shadow: 0 0 2px rgba(239, 68, 68, 0.2); opacity: 0.85;">NGUYỄN THỊ HỒNG NHUNG</div>
            </div>
            
            <div style="font-weight: bold; color: #000; font-size: 13px; margin-top: 8px;">Nguyễn Thị Hồng Nhung</div>
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
            <span class="sig-name">${partnerName.split(" ").slice(-2).join(" ")}</span>
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

// Hàm escape thuộc tính HTML và JavaScript để tránh lỗi vỡ chuỗi khi ID hoặc Tên chứa dấu nháy kép / nháy đơn / dấu gạch chéo ngược
function escapeHtmlAttr(str) {
  if (str === undefined || str === null) return "";
  // 1. Escape cho JS (gạch chéo ngược \ và nháy đơn ')
  const jsEscaped = str.toString()
                       .replace(/\\/g, "\\\\")
                       .replace(/'/g, "\\'");
  // 2. Escape cho HTML Attribute (các ký tự đặc biệt khác bao gồm dấu ngoặc nhọn, nháy kép, và &)
  return jsEscaped.replace(/&/g, "&amp;")
                  .replace(/"/g, "&quot;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
}

// Lấy tên đối tác mới nhất một cách động dựa trên partnerId để liên kết CSDL
function getPartnerNameForVoucher(v) {
  if (v && v.partnerId) {
    const p = state.partners.find(x => x.id === v.partnerId);
    if (p) return p.name;
  }
  return (v && v.partnerName) ? v.partnerName : "Khách hàng vãng lai";
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
// CÁC PHÂN HỆ NÂNG CẤP: KHÁCH HÀNG, CÔNG NỢ & QUỸ TIỀN
// ==========================================================

let partnersPage = 1;
let debtsPage = 1;
let cashPage = 1;
const itemsPerPage = 50;

let filteredPartnersList = [];
let filteredDebtsList = [];
let filteredCashList = [];

// --- Phân hệ Khách hàng ---
function renderPartnersTable() {
  const tbody = document.getElementById("partners-table-body");
  if (!tbody) return;

  const startIdx = (partnersPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredPartnersList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy đối tác nào</td></tr>`;
  } else {
    pageItems.forEach(p => {
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(p.id);
      tr.innerHTML = `
        <td style="font-weight:bold; color:var(--color-primary);">${p.id}</td>
        <td style="font-weight:600;"><a href="#" onclick="viewPartnerLedger('${escapedId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${p.name}</a></td>
        <td>
          <span class="badge ${p.type === 'supplier' ? 'badge-warning' : 'badge-info'}">
            ${p.type === 'supplier' ? 'Nhà cung cấp' : 'Khách hàng'}
          </span>
        </td>
        <td class="font-numeric">${p.phone || "-"}</td>
        <td>${p.address || "-"}</td>
        <td>
          <span class="badge ${p.inactive ? 'badge-danger' : 'badge-success'}">
            ${p.inactive ? 'Ngừng theo dõi' : 'Đang theo dõi'}
          </span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="openEditPartnerModal('${escapedId}')" style="padding: 2px 6px; margin-right: 4px;">Sửa</button>
          <button class="btn btn-secondary btn-sm" onclick="deletePartner('${escapedId}')" style="padding: 2px 6px; color:var(--color-danger); border-color:rgba(239, 68, 68, 0.2);">Xóa</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const total = filteredPartnersList.length;
  const paginationInfo = document.getElementById("partners-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} đối tác`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  const btnPrev = document.getElementById("btn-partners-prev");
  const btnNext = document.getElementById("btn-partners-next");
  if (btnPrev) btnPrev.disabled = partnersPage === 1;
  if (btnNext) btnNext.disabled = endIdx >= total;
}

function changePartnersPage(dir) {
  partnersPage += dir;
  renderPartnersTable();
}

function filterPartners() {
  const query = document.getElementById("partner-search-input") ? document.getElementById("partner-search-input").value.toLowerCase().trim() : "";
  const filterType = document.getElementById("partner-type-filter") ? document.getElementById("partner-type-filter").value : "all";

  filteredPartnersList = state.partners.filter(p => {
    const matchesQuery = p.id.toLowerCase().includes(query) || p.name.toLowerCase().includes(query) || (p.phone && p.phone.includes(query));
    const matchesType = filterType === "all" || p.type === filterType;
    return matchesQuery && matchesType;
  });

  partnersPage = 1;
  renderPartnersTable();
}

function openAddPartnerModal() {
  document.getElementById("edit-partner-index").value = "-1";
  document.getElementById("form-partner").reset();
  document.getElementById("partner-id").disabled = false;
  document.getElementById("modal-partner-title").innerText = "Khai báo Đối tác mới";
  openModal("modal-add-partner");
}

function openEditPartnerModal(id) {
  const p = state.partners.find(item => item.id === id);
  if (!p) return;

  document.getElementById("edit-partner-index").value = p.id;
  document.getElementById("partner-id").value = p.id;
  document.getElementById("partner-id").disabled = true;
  document.getElementById("partner-name").value = p.name;
  document.getElementById("partner-type").value = p.type;
  document.getElementById("partner-phone").value = p.phone || "";
  document.getElementById("partner-address").value = p.address || "";
  document.getElementById("partner-taxcode").value = p.taxCode || "";
  document.getElementById("partner-inactive").checked = !!p.inactive;

  document.getElementById("modal-partner-title").innerText = "Chỉnh sửa Đối tác";
  openModal("modal-add-partner");
}

function handlePartnerSubmit(e) {
  e.preventDefault();
  
  const editIndex = document.getElementById("edit-partner-index").value;
  const idVal = document.getElementById("partner-id").value.trim();
  const name = document.getElementById("partner-name").value.trim();
  const type = document.getElementById("partner-type").value;
  const phone = document.getElementById("partner-phone").value.trim();
  const address = document.getElementById("partner-address").value.trim();
  const taxCode = document.getElementById("partner-taxcode").value.trim();
  const inactive = document.getElementById("partner-inactive").checked;

  if (editIndex !== "-1") {
    const idx = state.partners.findIndex(p => p.id === editIndex);
    if (idx !== -1) {
      state.partners[idx] = { id: editIndex, name, type, phone, email: "", address, taxCode, inactive };
      showToast("Cập nhật đối tác thành công!", "success");
    }
  } else {
    let id = idVal.toUpperCase();
    if (!id) {
      const prefix = type === "supplier" ? "NCC" : "KH";
      const nextNum = (state.partners.filter(p => p.type === type).length + 1).toString().padStart(3, '0');
      id = `${prefix}${nextNum}`;
    }
    
    if (state.partners.some(p => p.id === id)) {
      showToast(`Mã đối tác "${id}" đã tồn tại!`, "danger");
      return;
    }

    state.partners.push({ id, name, type, phone, email: "", address, taxCode, inactive });
    showToast("Thêm đối tác mới thành công!", "success");
  }

  saveState();
  initExcelIntegration();
  closeModal("modal-add-partner");
  document.getElementById("form-partner").reset();
  filterPartners();
}

function deletePartner(id) {
  if (confirm(`Bạn có chắc chắn muốn xóa đối tác "${id}" không?`)) {
    state.partners = state.partners.filter(p => p.id !== id);
    if (state.partnerOpeningBalances && state.partnerOpeningBalances[id]) {
      delete state.partnerOpeningBalances[id];
    }
    saveState();
    initExcelIntegration();
    filterPartners();
    showToast(`Đã xóa đối tác "${id}"!`, "success");
  }
}

function autoExtractPhonesAndCleanAddresses() {
  let count = 0;
  if (!state.partners) return 0;
  
  state.partners.forEach(p => {
    const addr = p.address || "";
    const currentPhone = (p.phone || "").trim();
    
    // Thực hiện nếu chưa có số điện thoại (hoặc số điện thoại trống, null, hoặc chỉ là dấu gạch ngang)
    if (!currentPhone || currentPhone === "-" || currentPhone === "null" || currentPhone === "") {
      // Tìm số điện thoại (9-11 số, bắt đầu bằng 0, có thể chứa cách, chấm, gạch ngang)
      const phoneRegex = /(0[1-9][\s.-]?\d(?:[\s.-]?\d){7,9})/g;
      const matches = addr.match(phoneRegex);
      
      if (matches && matches.length > 0) {
        // Gán số điện thoại tìm được
        p.phone = matches.join(" / ");
        
        // Làm sạch địa chỉ: Loại bỏ số điện thoại và các ký tự phân tách thừa
        let cleanAddr = addr;
        matches.forEach(m => {
          cleanAddr = cleanAddr.replace(m, "");
        });
        
        // Dọn dẹp khoảng trắng, dấu gạch ngang thừa ở đầu, cuối hoặc giữa địa chỉ
        cleanAddr = cleanAddr
          .replace(/\s*-\s*-\s*/g, " - ") // Tránh double dash
          .replace(/\s*-\s*$/g, "")        // Bỏ gạch ngang ở cuối
          .replace(/^\s*-\s*/g, "")        // Bỏ gạch ngang ở đầu
          .replace(/\s+/g, " ")            // Thu gọn khoảng trắng
          .trim();
          
        p.address = cleanAddr;
        count++;
      }
    }
  });
  
  if (count > 0) {
    saveState();
    if (typeof filterPartners === "function") filterPartners();
  }
  return count;
}

function triggerAutoExtractPhones() {
  const count = autoExtractPhonesAndCleanAddresses();
  if (count > 0) {
    showToast(`Đã tự động tách thành công số điện thoại cho ${count} đối tác!`, "success");
  } else {
    showToast("Không tìm thấy đối tác nào cần tách số điện thoại từ địa chỉ.", "info");
  }
}

function convertStyle(s) {
  if (!s) return undefined;
  const out = {};
  
  // Fill style
  if (s.patternType || s.fgColor || s.bgColor) {
    out.fill = {
      patternType: s.patternType || 'solid',
      fgColor: s.fgColor,
      bgColor: s.bgColor
    };
  } else if (s.fill) {
    out.fill = s.fill;
  }
  
  // Font style
  if (s.font) {
    out.font = s.font;
  } else if (s.name || s.sz || s.bold || s.italic || s.underline || s.color) {
    out.font = {
      name: s.name,
      sz: s.sz,
      bold: s.bold,
      italic: s.italic,
      underline: s.underline,
      color: s.color
    };
  }
  
  // Alignment style
  if (s.alignment) {
    out.alignment = s.alignment;
  } else if (s.horizontal || s.vertical || s.wrapText) {
    out.alignment = {
      horizontal: s.horizontal,
      vertical: s.vertical,
      wrapText: s.wrapText
    };
  }
  
  // Border style
  if (s.border) {
    out.border = s.border;
  } else if (s.top || s.bottom || s.left || s.right) {
    out.border = {
      top: s.top,
      bottom: s.bottom,
      left: s.left,
      right: s.right
    };
  }
  
  if (s.numFmt) {
    out.numFmt = s.numFmt;
  }
  
  return Object.keys(out).length > 0 ? out : undefined;
}

function createDefaultProductExcelRow(p) {
  const r = new Array(57).fill("");
  r[0] = p.id;
  r[1] = p.name;
  r[2] = "Vật tư hàng hóa";
  r[3] = p.group || "";
  r[7] = p.unit || "Cái";
  r[9] = p.minStock || 0;
  r[11] = "1561";
  r[12] = "156";
  r[13] = "632";
  r[14] = "51111";
  r[30] = p.inactive ? "TRUE" : "FALSE";
  r[31] = p.stock || 0;
  r[33] = p.totalValue || 0;
  return r;
}

function createDefaultPartnerExcelRow(p) {
  const r = new Array(7).fill("");
  r[0] = p.id;
  r[1] = p.name;
  r[2] = p.address || "";
  r[3] = p.group || (p.type === "supplier" ? "NCC" : "KH");
  r[4] = p.taxCode || "";
  r[5] = p.phone || "";
  r[6] = p.inactive ? "TRUE" : "FALSE";
  return r;
}

function createDefaultDebtExcelRow(id, d) {
  const r = new Array(18).fill("");
  const p = state.partners.find(x => x.id === id) || {};
  r[0] = id;
  r[1] = p.name || d.name || "";
  r[2] = d.debit || 0;
  r[3] = d.credit || 0;
  r[4] = (d.debit || 0) - (d.credit || 0);
  r[5] = p.address || "";
  r[6] = p.taxCode || "";
  r[7] = p.phone || "";
  r[8] = p.phone || "";
  r[17] = p.type === "supplier" ? "NCC" : "KH";
  return r;
}

function createDefaultVoucherExcelRow(v) {
  const r = new Array(10).fill("");
  const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu thu" : 
                    ((v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive") ? "Phiếu chi" : 
                     (v.type === "sales" ? "Hóa đơn bán hàng" : "Hóa đơn mua hàng"));
  r[0] = v.date || "";
  r[1] = v.date || "";
  r[2] = v.id || "";
  r[3] = v.description || "";
  r[4] = v.amount !== undefined ? v.amount : (v.totalAmount !== undefined ? v.totalAmount : 0);
  r[5] = v.partnerName || "";
  r[6] = v.description || "";
  r[7] = "";
  r[8] = typeLabel || "";
  r[9] = "";
  return r;
}

function initializeMissingExcelRows() {
  if (state.products) {
    state.products.forEach(p => {
      if (!p.excelRow) {
        p.excelRow = createDefaultProductExcelRow(p);
      }
    });
  }
  if (state.partners) {
    state.partners.forEach(p => {
      if (!p.excelRow) {
        p.excelRow = createDefaultPartnerExcelRow(p);
      }
    });
  }
  if (state.partnerOpeningBalances) {
    Object.keys(state.partnerOpeningBalances).forEach(id => {
      const d = state.partnerOpeningBalances[id];
      if (!d.excelRow) {
        d.excelRow = createDefaultDebtExcelRow(id, d);
      }
    });
  }
  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (!v.excelRow) {
        v.excelRow = createDefaultVoucherExcelRow(v);
      }
    });
  }
}

function migrateAndCleanExistingExcelRows() {
  let migrated = false;
  
  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (v.excelRow && Array.isArray(v.excelRow)) {
        for (let i = 0; i < v.excelRow.length; i++) {
          if (v.excelRow[i] === undefined || v.excelRow[i] === null) {
            v.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }
  
  if (state.products) {
    state.products.forEach(p => {
      if (p.excelRow && Array.isArray(p.excelRow)) {
        for (let i = 0; i < p.excelRow.length; i++) {
          if (p.excelRow[i] === undefined || p.excelRow[i] === null) {
            p.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }
  
  if (state.partners) {
    state.partners.forEach(p => {
      if (p.excelRow && Array.isArray(p.excelRow)) {
        for (let i = 0; i < p.excelRow.length; i++) {
          if (p.excelRow[i] === undefined || p.excelRow[i] === null) {
            p.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }
  
  if (state.partnerOpeningBalances) {
    Object.keys(state.partnerOpeningBalances).forEach(key => {
      const d = state.partnerOpeningBalances[key];
      if (d && d.excelRow && Array.isArray(d.excelRow)) {
        for (let i = 0; i < d.excelRow.length; i++) {
          if (d.excelRow[i] === undefined || d.excelRow[i] === null) {
            d.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }
  
  if (migrated) {
    saveState();
  }
}

async function exportExcelWithTemplate(templatePath, outputName, list, mapper, fallbackHeaders, fallbackMapper) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    let workbook;
    let sheetName;
    let newSheet;
    try {
      const response = await fetch(templatePath);
      if (!response.ok) throw new Error("Fetch template failed: " + response.statusText);
      const arrayBuffer = await response.arrayBuffer();
      // Nạp với cellStyles: true để lấy định dạng của template
      workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellStyles: true });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A2');
      const maxCol = range.e.c;
      
      // Lấy style và format mẫu từ dòng dữ liệu đầu tiên (dòng index 2)
      const colStyles = {};
      for (let c = range.s.c; c <= maxCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 2, c: c });
        const cell = sheet[cellRef];
        if (cell && cell.s) {
          colStyles[c] = convertStyle(cell.s);
        }
        if (cell && cell.z) {
          colStyles[c + '_z'] = cell.z;
        }
      }
      
      // Chuẩn hóa styles của tiêu đề/đầu mục dòng 0, 1 và xóa sạch các dòng dữ liệu cũ từ dòng index 2 trở đi
      for (const key in sheet) {
        if (key[0] === '!') continue;
        const cellCoord = XLSX.utils.decode_cell(key);
        if (cellCoord.r < 2) {
          const cell = sheet[key];
          if (cell && cell.s) {
            cell.s = convertStyle(cell.s);
          }
        } else {
          delete sheet[key];
        }
      }
      
      // Ghi danh sách mới kèm format giống mẫu
      list.forEach((item, idx) => {
        const r = idx + 2;
        const newRow = new Array(maxCol + 1).fill("");
        mapper(item, newRow, idx);
        
        for (let c = 0; c <= maxCol; c++) {
          const val = newRow[c];
          if (val !== undefined && val !== null && val !== "") {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
            const cell = { v: val };
            if (typeof val === 'number') {
              cell.t = 'n';
            } else if (typeof val === 'boolean') {
              cell.t = 'b';
            } else {
              cell.t = 's';
            }
            
            if (colStyles[c]) {
              cell.s = colStyles[c];
            }
            if (colStyles[c + '_z']) {
              cell.z = colStyles[c + '_z'];
            }
            sheet[cellRef] = cell;
          }
        }
      });
      
      range.e.r = Math.max(1, list.length + 1);
      sheet['!ref'] = XLSX.utils.encode_range(range);
      newSheet = sheet;
    } catch (fetchErr) {
      console.warn("Không thể nạp tệp Excel mẫu, sử dụng cơ chế tạo bảng thô:", fetchErr);
      workbook = XLSX.utils.book_new();
      sheetName = "Sheet1";
      const rows = JSON.parse(JSON.stringify(fallbackHeaders));
      list.forEach((item, idx) => {
        const newRow = new Array(fallbackHeaders[1].length).fill("");
        fallbackMapper(item, newRow, idx);
        rows.push(newRow);
      });
      newSheet = XLSX.utils.aoa_to_sheet(rows);
    }
    
    workbook.Sheets[sheetName] = newSheet;
    if (workbook.SheetNames.indexOf(sheetName) === -1) {
      XLSX.utils.book_append_sheet(workbook, newSheet, sheetName);
    }
    XLSX.writeFile(workbook, outputName);
    showToast(`Đã xuất Excel thành công: ${outputName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel: ${err.message}`, "danger");
  }
}

function exportProductsToExcel() {
  const fallbackHeaders = [
    ["DANH SÁCH VẬT TƯ, HÀNG HÓA, DỊCH VỤ"],
    ["Mã", "Tên", "Tính chất", "Nhóm VTHH", "Mô tả", "Diễn giải khi mua", "Diễn giải khi bán", "ĐVT chính", "Thời hạn BH", "Số lượng tồn tối thiểu", "Nguồn gốc", "Kho ngầm định", "Tài khoản kho", "TK chi phí", "TK doanh thu"]
  ];
  const prodMapper = (p, r) => {
    if (!p.excelRow) {
      p.excelRow = createDefaultProductExcelRow(p);
    }
    for (let i = 0; i < 57; i++) {
      r[i] = p.excelRow[i] !== undefined ? p.excelRow[i] : "";
    }
    r[0] = p.id;
    r[1] = p.name;
    r[7] = p.unit || "Cái";
    r[9] = p.minStock || 0;
    r[30] = p.inactive ? "TRUE" : "FALSE";
    r[31] = p.stock || 0;
    r[33] = p.totalValue || 0;
  };
  exportExcelWithTemplate(
    'excel/Vat_tu__hang_hoa__dich_vu.xlsx',
    `Vat_tu__hang_hoa__dich_vu_${new Date().toISOString().split("T")[0]}.xlsx`,
    state.products,
    prodMapper,
    fallbackHeaders,
    prodMapper
  );
}

function exportPartnersToExcel() {
  const fallbackHeaders = [
    ["DANH SÁCH KHÁCH HÀNG"],
    ["Mã khách hàng", "Tên khách hàng", "Địa chỉ", "Nhóm KH, NCC", "Mã số thuế", "Điện thoại", "Ngừng theo dõi"]
  ];
  const partnerMapper = (p, r) => {
    if (!p.excelRow) {
      p.excelRow = createDefaultPartnerExcelRow(p);
    }
    for (let i = 0; i < 7; i++) {
      r[i] = p.excelRow[i] !== undefined ? p.excelRow[i] : "";
    }
    r[0] = p.id;
    r[1] = p.name;
    r[2] = p.address || "";
    r[3] = p.group || (p.type === "supplier" ? "NCC" : "KH");
    r[4] = p.taxCode || "";
    r[5] = p.phone || "";
    r[6] = p.inactive ? "TRUE" : "FALSE";
  };
  exportExcelWithTemplate(
    'excel/Khach_hang - RANGDONG.xlsx',
    `Khach_hang - RANGDONG_${new Date().toISOString().split("T")[0]}.xlsx`,
    state.partners,
    partnerMapper,
    fallbackHeaders,
    partnerMapper
  );
}

// --- Phân hệ Công nợ ---
function calculatePartnerDebts() {
  const debts = {};
  
  state.partners.forEach(p => {
    const opening = state.partnerOpeningBalances[p.id] || { debit: 0, credit: 0 };
    debts[p.id] = {
      id: p.id,
      name: p.name,
      type: p.type,
      address: p.address || "",
      taxCode: p.taxCode || "",
      phone: p.phone || "",
      openingDebit: opening.debit || 0,
      openingCredit: opening.credit || 0,
      debitTrans: 0,
      creditTrans: 0,
      closingDebit: 0,
      closingCredit: 0
    };
  });

  state.vouchers.forEach(v => {
    if (!v.entries) return;
    
    v.entries.forEach(e => {
      if (e.debit.startsWith("131")) {
        const pId = v.partnerId;
        if (debts[pId]) debts[pId].debitTrans += e.amount;
      }
      if (e.credit.startsWith("131")) {
        const pId = v.partnerId;
        if (debts[pId]) debts[pId].creditTrans += e.amount;
      }
      
      if (e.debit.startsWith("331")) {
        const pId = v.partnerId;
        if (debts[pId]) debts[pId].debitTrans += e.amount;
      }
      if (e.credit.startsWith("331")) {
        const pId = v.partnerId;
        if (debts[pId]) debts[pId].creditTrans += e.amount;
      }
    });
  });

  Object.keys(debts).forEach(id => {
    const d = debts[id];
    if (d.type === "customer") {
      const balance = d.openingDebit - d.openingCredit + d.debitTrans - d.creditTrans;
      if (balance >= 0) {
        d.closingDebit = balance;
        d.closingCredit = 0;
      } else {
        d.closingDebit = 0;
        d.closingCredit = -balance;
      }
    } else {
      const balance = d.openingCredit - d.openingDebit + d.creditTrans - d.debitTrans;
      if (balance >= 0) {
        d.closingCredit = balance;
        d.closingDebit = 0;
      } else {
        d.closingCredit = 0;
        d.closingDebit = -balance;
      }
    }
  });

  return Object.values(debts);
}

function renderDebtsTable() {
  const tbody = document.getElementById("debts-table-body");
  if (!tbody) return;

  const startIdx = (debtsPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredDebtsList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy công nợ đối tác nào</td></tr>`;
  } else {
    pageItems.forEach(d => {
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(d.id);
      tr.innerHTML = `
        <td style="font-weight:bold;">${d.id}</td>
        <td style="font-weight:600;"><a href="#" onclick="viewPartnerLedger('${escapedId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${d.name}</a></td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${d.openingDebit > 0 ? formatVND(d.openingDebit).replace("đ","") : "-"}</td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${d.openingCredit > 0 ? formatVND(d.openingCredit).replace("đ","") : "-"}</td>
        <td style="text-align:right; color:var(--color-primary); font-weight:500;" class="font-numeric">${d.debitTrans > 0 ? formatVND(d.debitTrans).replace("đ","") : "-"}</td>
        <td style="text-align:right; color:var(--color-warning); font-weight:500;" class="font-numeric">${d.creditTrans > 0 ? formatVND(d.creditTrans).replace("đ","") : "-"}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${d.closingDebit > 0 ? 'text-success' : ''}">${d.closingDebit > 0 ? formatVND(d.closingDebit).replace("đ","") : "-"}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${d.closingCredit > 0 ? 'text-warning' : ''}">${d.closingCredit > 0 ? formatVND(d.closingCredit).replace("đ","") : "-"}</td>
        <td style="text-align:center;">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="btn btn-secondary btn-sm" onclick="viewPartnerLedger('${escapedId}')" style="padding: 2px 8px;">Xem Sổ</button>
            <button class="btn btn-primary btn-sm" onclick="promptEditPartnerOpeningDebt('${escapedId}')" style="padding: 2px 8px; background-color: var(--color-primary); border-color: var(--color-primary);">Sửa</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const total = filteredDebtsList.length;
  const paginationInfo = document.getElementById("debts-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} đối tác`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  const btnPrev = document.getElementById("btn-debts-prev");
  const btnNext = document.getElementById("btn-debts-next");
  if (btnPrev) btnPrev.disabled = debtsPage === 1;
  if (btnNext) btnNext.disabled = endIdx >= total;
}

function changeDebtsPage(dir) {
  debtsPage += dir;
  renderDebtsTable();
}

function filterDebts() {
  const query = document.getElementById("debt-search-input") ? document.getElementById("debt-search-input").value.toLowerCase().trim() : "";
  const filterType = document.getElementById("debt-type-filter") ? document.getElementById("debt-type-filter").value : "all";
  const activeOnly = document.getElementById("debt-active-only-filter") ? document.getElementById("debt-active-only-filter").checked : false;

  const allDebts = calculatePartnerDebts();

  filteredDebtsList = allDebts.filter(d => {
    const matchesQuery = d.id.toLowerCase().includes(query) || d.name.toLowerCase().includes(query);
    
    let matchesType = true;
    if (filterType === "131") {
      matchesType = d.type === "customer";
    } else if (filterType === "331") {
      matchesType = d.type === "supplier";
    }
    
    let matchesActive = true;
    if (activeOnly) {
      matchesActive = (d.closingDebit > 0 || d.closingCredit > 0);
    }
    
    return matchesQuery && matchesType && matchesActive;
  });

  debtsPage = 1;
  renderDebtsTable();
}

let currentPartnerLedgerTab = "entries";
let activePartnerIdForLedger = "";

function viewPartnerLedger(partnerId) {
  const p = state.partners.find(item => item.id === partnerId);
  if (!p) return;

  activePartnerIdForLedger = partnerId;

  const opening = state.partnerOpeningBalances[p.id] || { debit: 0, credit: 0 };
  const openingText = p.type === "customer" 
    ? (opening.debit >= opening.credit ? `${formatVND(opening.debit - opening.credit)} (Nợ)` : `${formatVND(opening.credit - opening.debit)} (Có)`)
    : (opening.credit >= opening.debit ? `${formatVND(opening.credit - opening.debit)} (Có)` : `${formatVND(opening.debit - opening.credit)} (Nợ)`);

  document.getElementById("partner-ledger-subtitle").innerText = `Đối tác: ${p.id} - ${p.name} | Loại: ${p.type === 'customer' ? 'Khách hàng' : 'Nhà cung cấp'}`;
  document.getElementById("partner-ledger-opening").innerText = openingText;

  const tbody = document.getElementById("partner-ledger-table-body");
  tbody.innerHTML = "";

  let debitSum = 0;
  let creditSum = 0;

  const ledgerEntries = [];
  state.vouchers.forEach(v => {
    if (v.partnerId !== p.id) return;
    if (!v.entries) return;

    v.entries.forEach(e => {
      const is131 = e.debit.startsWith("131") || e.credit.startsWith("131");
      const is331 = e.debit.startsWith("331") || e.credit.startsWith("331");
      if (!is131 && !is331) return;

      let debitAmount = 0;
      let creditAmount = 0;
      let offsetAccount = "";

      if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
        debitAmount = e.amount;
        offsetAccount = e.credit;
      } else {
        creditAmount = e.amount;
        offsetAccount = e.debit;
      }

      ledgerEntries.push({
        date: v.date,
        id: v.id,
        desc: e.desc || v.description,
        offsetAccount,
        debit: debitAmount,
        credit: creditAmount
      });

      debitSum += debitAmount;
      creditSum += creditAmount;
    });
  });

  ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (ledgerEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Không có giao dịch phát sinh công nợ trong kỳ</td></tr>`;
  } else {
    ledgerEntries.forEach(le => {
      const tr = document.createElement("tr");
      const escapedLeId = escapeHtmlAttr(le.id);
      tr.innerHTML = `
        <td>${le.date}</td>
        <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedLeId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${le.id}</a></td>
        <td>${le.desc}</td>
        <td style="text-align:center; font-weight:700;">${le.offsetAccount}</td>
        <td style="text-align:right; font-weight:500;">${le.debit > 0 ? formatVND(le.debit).replace("đ","") : "-"}</td>
        <td style="text-align:right; font-weight:500;">${le.credit > 0 ? formatVND(le.credit).replace("đ","") : "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  let closingVal = 0;
  let closingText = "";
  if (p.type === "customer") {
    closingVal = (opening.debit - opening.credit) + debitSum - creditSum;
    closingText = closingVal >= 0 ? `${formatVND(closingVal)} (Nợ)` : `${formatVND(-closingVal)} (Có)`;
  } else {
    closingVal = (opening.credit - opening.debit) + creditSum - debitSum;
    closingText = closingVal >= 0 ? `${formatVND(closingVal)} (Có)` : `${formatVND(-closingVal)} (Nợ)`;
  }

  document.getElementById("partner-ledger-closing").innerText = closingText;

  // Reset về tab Lịch sử công nợ mặc định
  switchPartnerLedgerTab("entries");

  openModal("modal-view-partner-ledger");
}

async function exportPartnerDebtExcel(partnerId) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  
  const p = state.partners.find(item => item.id === partnerId);
  if (!p) {
    showToast("Không tìm thấy đối tác này!", "danger");
    return;
  }

  try {
    const response = await fetch('excel/Thong_bao_cong_no.xlsx');
    if (!response.ok) throw new Error("Fetch template failed: " + response.statusText);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellStyles: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // 1. Get ledger data
    const opening = state.partnerOpeningBalances[p.id] || { debit: 0, credit: 0 };
    let openingVal = 0;
    if (p.type === "customer") {
      openingVal = opening.debit - opening.credit;
    } else {
      openingVal = opening.credit - opening.debit;
    }
    
    let debitSum = 0;
    let creditSum = 0;
    const ledgerEntries = [];
    state.vouchers.forEach(v => {
      if (v.partnerId !== p.id) return;
      if (!v.entries) return;

      v.entries.forEach(e => {
        const is131 = e.debit.startsWith("131") || e.credit.startsWith("131");
        const is331 = e.debit.startsWith("331") || e.credit.startsWith("331");
        if (!is131 && !is331) return;

        let debitAmount = 0;
        let creditAmount = 0;
        let offsetAccount = "";

        if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
          debitAmount = e.amount;
          offsetAccount = e.credit;
        } else {
          creditAmount = e.amount;
          offsetAccount = e.debit;
        }

        ledgerEntries.push({
          date: v.date,
          id: v.id,
          desc: e.desc || v.description,
          offsetAccount,
          debit: debitAmount,
          credit: creditAmount
        });

        debitSum += debitAmount;
        creditSum += creditAmount;
      });
    });

    ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate closing balance
    let closingVal = 0;
    if (p.type === "customer") {
      closingVal = openingVal + debitSum - creditSum;
    } else {
      closingVal = openingVal + creditSum - debitSum;
    }

    // Determine min/max dates
    let fromDateStr = "01/01/2026";
    let toDateStr = new Date().toLocaleDateString('vi-VN');
    if (ledgerEntries.length > 0) {
      const dates = ledgerEntries.map(e => new Date(e.date));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      
      const pad = (n) => n.toString().padStart(2, '0');
      fromDateStr = `${pad(minDate.getDate())}/${pad(minDate.getMonth()+1)}/${minDate.getFullYear()}`;
      toDateStr = `${pad(maxDate.getDate())}/${pad(maxDate.getMonth()+1)}/${maxDate.getFullYear()}`;
    }

    // 2. Format template values
    // Cell B10: Đơn vị
    sheet['B10'] = { v: `Đơn vị:    ${p.name} (${p.id})`, t: 's' };
    
    // Cell B11: Địa chỉ
    sheet['B11'] = { v: `Địa chỉ:    ${p.address || ""}`, t: 's' };
    
    // Cell B12: Mã số thuế
    sheet['B12'] = { v: `Mã số thuế: ${p.taxCode || ""}`, t: 's' };

    // Cell G10: Kỳ
    sheet['G10'] = { v: `Từ ngày ${fromDateStr} đến ngày ${toDateStr}`, t: 's' };

    // Cell K12: Số dư cuối kỳ
    sheet['K12'] = { v: closingVal, t: 'n', z: '#,##0' };

    // Cell K13: Số dư đầu kỳ
    sheet['K13'] = { v: openingVal, t: 'n', z: '#,##0' };

    // Cell B7: Ngày in
    sheet['B7'] = { v: `Ngày in: ${new Date().toLocaleDateString('vi-VN')}`, t: 's' };

    // Save existing style templates from row index 15 (sample data row 16)
    // We will extract column styles for columns B (1), C (2), D (3), J (9), K (10)
    const colStyles = {};
    const colsToFormat = [1, 2, 3, 9, 10];
    colsToFormat.forEach(c => {
      const cellRef = XLSX.utils.encode_cell({ r: 15, c: c });
      const cell = sheet[cellRef];
      if (cell && cell.s) {
        colStyles[c] = convertStyle(cell.s);
      }
    });

    // Clean sheet cells starting from index 15 (row 16) onwards to write fresh data
    for (const key in sheet) {
      if (key[0] === '!') continue;
      const cellCoord = XLSX.utils.decode_cell(key);
      if (cellCoord.r < 15) {
        // Convert styles of header rows to keep them
        const cell = sheet[key];
        if (cell && cell.s) {
          cell.s = convertStyle(cell.s);
        }
      } else {
        delete sheet[key];
      }
    }

    // Write new data rows
    let currentBalance = openingVal;
    ledgerEntries.forEach((le, idx) => {
      const r = 15 + idx; // Data starts at JS row 15
      
      // Calculate running balance
      let amount = 0;
      if (p.type === "customer") {
        amount = le.debit - le.credit;
      } else {
        amount = le.credit - le.debit;
      }
      currentBalance += amount;
      
      const rowData = {
        1: le.date, // B: Ngày
        2: le.id,   // C: Số chứng từ
        3: le.desc, // D: Diễn giải
        9: amount,  // J: Số tiền
        10: currentBalance // K: Số dư
      };
      
      for (const colIdx in rowData) {
        const val = rowData[colIdx];
        const cellRef = XLSX.utils.encode_cell({ r: r, c: parseInt(colIdx) });
        const cell = { v: val };
        if (typeof val === 'number') {
          cell.t = 'n';
          cell.z = '#,##0;(#,##0);"-"';
        } else {
          cell.t = 's';
        }
        if (colStyles[colIdx]) {
          cell.s = colStyles[colIdx];
        }
        sheet[cellRef] = cell;
      }
    });

    // Write signature section at the bottom (after list rows)
    const startSigRow = 15 + ledgerEntries.length + 2;
    
    // Add "Người lập phiếu" and "(Ký, họ tên)"
    const rSig = startSigRow;
    const cellSigRef = XLSX.utils.encode_cell({ r: rSig, c: 7 }); // H
    sheet[cellSigRef] = {
      v: "Người lập phiếu",
      t: 's',
      s: { font: { bold: true }, alignment: { horizontal: 'center' } }
    };
    
    const cellSignRef = XLSX.utils.encode_cell({ r: rSig + 2, c: 7 });
    sheet[cellSignRef] = {
      v: "(Ký, họ tên)",
      t: 's',
      s: { font: { italic: true }, alignment: { horizontal: 'center' } }
    };

    // Update sheet range !ref
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:M30');
    range.e.r = rSig + 4;
    sheet['!ref'] = XLSX.utils.encode_range(range);

    // Save workbook
    XLSX.writeFile(workbook, `Thong_bao_cong_no_${p.id}.xlsx`);
    showToast(`Đã xuất thông báo công nợ thành công cho đối tác ${p.name}!`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất thông báo công nợ: ${err.message}`, "danger");
  }
}

function exportCurrentPartnerDebtExcel() {
  if (!activePartnerIdForLedger) {
    showToast("Không tìm thấy đối tác hiện tại!", "danger");
    return;
  }
  exportPartnerDebtExcel(activePartnerIdForLedger);
}

function switchPartnerLedgerTab(tabName) {
  currentPartnerLedgerTab = tabName;
  const btnEntries = document.getElementById("partner-ledger-tab-btn-entries");
  const btnOrders = document.getElementById("partner-ledger-tab-btn-orders");
  const conEntries = document.getElementById("partner-ledger-container-entries");
  const conOrders = document.getElementById("partner-ledger-container-orders");
  
  if (tabName === "entries") {
    if (btnEntries) {
      btnEntries.classList.add("active");
      btnEntries.style.color = "var(--color-primary)";
      btnEntries.style.fontWeight = "700";
    }
    if (btnOrders) {
      btnOrders.classList.remove("active");
      btnOrders.style.color = "var(--text-secondary)";
      btnOrders.style.fontWeight = "600";
    }
    if (conEntries) conEntries.style.display = "block";
    if (conOrders) conOrders.style.display = "none";
  } else {
    if (btnOrders) {
      btnOrders.classList.add("active");
      btnOrders.style.color = "var(--color-primary)";
      btnOrders.style.fontWeight = "700";
    }
    if (btnEntries) {
      btnEntries.classList.remove("active");
      btnEntries.style.color = "var(--text-secondary)";
      btnEntries.style.fontWeight = "600";
    }
    if (conEntries) conEntries.style.display = "none";
    if (conOrders) conOrders.style.display = "block";
    renderPartnerLedgerOrders();
  }
}

function renderPartnerLedgerOrders() {
  const tbody = document.getElementById("partner-ledger-orders-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const pId = activePartnerIdForLedger;
  const orders = state.vouchers.filter(v => v.partnerId === pId && (v.type === "sales" || v.type === "purchase"));
  
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy hóa đơn mua/bán nào của đối tác này</td></tr>`;
    return;
  }
  
  orders.forEach(o => {
    const totalAmt = o.totalAmount || o.amount || 0;
    if (o.remainingDebt === undefined) {
      o.remainingDebt = (o.paymentMethod === "131" || o.paymentMethod === "331") ? totalAmt : 0;
    }
    
    const tr = document.createElement("tr");
    const escapedOrderId = escapeHtmlAttr(o.id);
    tr.innerHTML = `
      <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedOrderId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${o.id}</a></td>
      <td>${o.date}</td>
      <td>${o.description}</td>
      <td style="text-align:right; font-weight:500;">${formatVND(totalAmt).replace("đ","")}</td>
      <td style="text-align:right; font-weight:700; color:${o.remainingDebt > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">${formatVND(o.remainingDebt).replace("đ","")}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary btn-sm" onclick="promptEditOrderDebt('${escapedOrderId}')" style="padding: 2px 8px;">Sửa nợ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function promptEditOrderDebt(voucherId) {
  try {
    console.log("promptEditOrderDebt custom modal called with:", voucherId);
    if (voucherId && voucherId.startsWith("OP-")) {
      const partnerId = voucherId.substring(3);
      promptEditPartnerOpeningDebt(partnerId);
      return;
    }

    const v = state.vouchers.find(x => x.id === voucherId);
    if (!v) {
      console.error("Voucher not found in state.vouchers for ID:", voucherId);
      if (typeof addErrorLog === "function") {
        addErrorLog("promptEditOrderDebt", `Không tìm thấy chứng từ với ID: ${voucherId}`);
      }
      return;
    }
    
    const totalAmt = v.totalAmount || v.amount || 0;
    if (v.remainingDebt === undefined) {
      v.remainingDebt = (v.paymentMethod === "131" || v.paymentMethod === "331") ? totalAmt : 0;
    }

    // Mở modal sửa công nợ đơn hàng
    document.getElementById("modal-edit-debt-title").innerText = "Chỉnh sửa Công nợ Đơn hàng";
    document.getElementById("edit-debt-target-id").value = voucherId;
    document.getElementById("edit-debt-type").value = "voucher";
    
    const partnerName = getPartnerNameForVoucher(v);
    document.getElementById("edit-debt-info-text").innerHTML = `
      <strong>Mã hóa đơn:</strong> ${v.id}<br>
      <strong>Đối tác:</strong> ${partnerName}<br>
      <strong>Tổng tiền hóa đơn:</strong> ${formatVND(totalAmt)}
    `;

    document.getElementById("group-edit-debt-voucher").style.display = "block";
    document.getElementById("group-edit-debt-partner").style.display = "none";
    
    document.getElementById("edit-debt-voucher-value").value = v.remainingDebt;

    openModal("modal-edit-debt");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptEditOrderDebt", err.message, err);
    }
  }
}

function promptEditPartnerOpeningDebt(partnerId) {
  try {
    console.log("promptEditPartnerOpeningDebt custom modal called with:", partnerId);
    const p = state.partners.find(x => x.id === partnerId);
    if (!p) {
      console.error("Partner not found for ID:", partnerId);
      if (typeof addErrorLog === "function") {
        addErrorLog("promptEditPartnerOpeningDebt", `Không tìm thấy đối tác với mã: ${partnerId}`);
      }
      showToast(`Không tìm thấy đối tác với mã: ${partnerId}`, "danger");
      return;
    }

    const currentBal = state.partnerOpeningBalances[partnerId] || { debit: 0, credit: 0 };
    const currentDebit = currentBal.debit || 0;
    const currentCredit = currentBal.credit || 0;

    // Mở modal sửa công nợ đầu kỳ
    document.getElementById("modal-edit-debt-title").innerText = "Chỉnh sửa Số dư Công nợ đầu kỳ";
    document.getElementById("edit-debt-target-id").value = partnerId;
    document.getElementById("edit-debt-type").value = "partner";
    
    const typeLabel = p.type === "customer" ? "Khách hàng" : "Nhà cung cấp";
    document.getElementById("edit-debt-info-text").innerHTML = `
      <strong>Mã đối tác:</strong> ${p.id}<br>
      <strong>Tên đối tác:</strong> ${p.name}<br>
      <strong>Phân loại:</strong> ${typeLabel}
    `;

    document.getElementById("group-edit-debt-voucher").style.display = "none";
    document.getElementById("group-edit-debt-partner").style.display = "block";
    
    document.getElementById("edit-debt-partner-debit").value = currentDebit;
    document.getElementById("edit-debt-partner-credit").value = currentCredit;

    openModal("modal-edit-debt");
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptEditPartnerOpeningDebt", err.message, err);
    }
  }
}

function handleEditDebtSubmit(e) {
  try {
    e.preventDefault();
    
    const targetId = document.getElementById("edit-debt-target-id").value;
    const editType = document.getElementById("edit-debt-type").value;

    console.log("handleEditDebtSubmit targetId:", targetId, "type:", editType);

    if (editType === "voucher") {
      const v = state.vouchers.find(x => x.id === targetId);
      if (!v) {
        if (typeof addErrorLog === "function") {
          addErrorLog("handleEditDebtSubmit", `Không tìm thấy chứng từ với ID: ${targetId}`);
        }
        return;
      }
      const totalAmt = v.totalAmount || v.amount || 0;
      const newDebt = parseInt(document.getElementById("edit-debt-voucher-value").value) || 0;
      
      if (newDebt < 0 || newDebt > totalAmt) {
        showToast(`Số tiền nợ hợp lệ phải từ 0đ đến ${formatVND(totalAmt)}!`, "danger");
        return;
      }
      
      v.remainingDebt = newDebt;
      saveState();
      showToast(`Cập nhật nợ đơn hàng ${v.id} thành ${formatVND(newDebt)} thành công!`, "success");
    } 
    
    else if (editType === "partner") {
      const newDebit = parseInt(document.getElementById("edit-debt-partner-debit").value) || 0;
      const newCredit = parseInt(document.getElementById("edit-debt-partner-credit").value) || 0;
      
      if (newDebit < 0 || newCredit < 0) {
        showToast("Số dư đầu kỳ phải lớn hơn hoặc bằng 0đ!", "danger");
        return;
      }
      
      state.partnerOpeningBalances = state.partnerOpeningBalances || {};
      state.partnerOpeningBalances[targetId] = { debit: newDebit, credit: newCredit };
      
      saveState();
      recalculateAccounting();
      showToast(`Cập nhật số dư công nợ đầu kỳ đối tác ${targetId} thành công!`, "success");
    }

    closeModal("modal-edit-debt");
    
    // Vẽ lại toàn bộ giao diện liên quan
    renderDashboardDebts();
    filterDebts();
    if (activePartnerIdForLedger) {
      renderPartnerLedgerOrders();
    }
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("handleEditDebtSubmit", err.message, err);
    }
  }
}

function exportDebtsToExcel() {
  const fallbackHeaders = [
    ["DANH SÁCH CÔNG NỢ KHÁCH HÀNG"],
    ["Mã khách hàng", "Tên khách hàng", "Số còn phải thu theo HĐ", "Số thu trước/Giảm trừ khác", "Số còn phải thu", "Địa chỉ", "Mã số thuế", "Điện thoại", "ĐT di động", "Fax", "Email", "Người liên hệ", "ĐTDĐ người liên hệ", "Email người liên hệ", "Tỉnh/Thành phố", "Quận/Huyện", "Xã/Phường", "Nhóm khách hàng"]
  ];
  const calculatedDebts = calculatePartnerDebts();
  const debtMapper = (d, r) => {
    const openingBal = state.partnerOpeningBalances[d.id] || {};
    if (!openingBal.excelRow) {
      openingBal.excelRow = createDefaultDebtExcelRow(d.id, d);
    }
    for (let i = 0; i < 18; i++) {
      r[i] = openingBal.excelRow[i] !== undefined ? openingBal.excelRow[i] : "";
    }
    r[0] = d.id;
    r[1] = d.name;
    r[2] = d.type === "customer" ? d.closingDebit : 0;
    r[3] = d.type === "customer" ? d.closingCredit : 0;
    r[4] = d.type === "customer" ? (d.closingDebit - d.closingCredit) : (d.closingCredit - d.closingDebit);
    r[5] = d.address || "";
    r[6] = d.taxCode || "";
    r[7] = d.phone || "";
    r[17] = d.type === "customer" ? "KH" : "NCC";
  };
  exportExcelWithTemplate(
    'excel/Cong_no_khach_hang.xlsx',
    `Cong_no_khach_hang_${new Date().toISOString().split("T")[0]}.xlsx`,
    calculatedDebts,
    debtMapper,
    fallbackHeaders,
    debtMapper
  );
}

// --- Phân hệ Thu/Chi ---
function recalculateCashKpis() {
  const balance111 = getAccountBalance("111");
  const balance112 = getAccountBalance("112");
  
  let totalReceipts = 0;
  let totalPayments = 0;

  state.vouchers.forEach(v => {
    const isCashVoucher = v.type === "receipt" || v.type === "payment" || v.type.startsWith("escrow_");
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

function renderCashTable() {
  const tbody = document.getElementById("cash-table-body");
  if (!tbody) return;

  const startIdx = (cashPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredCashList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy chứng từ nào</td></tr>`;
  } else {
    pageItems.forEach(v => {
      const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu Thu" : "Phiếu Chi";
      const isReceipt = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
      const methodLabel = v.paymentMethod === "111" ? "Tiền mặt (111)" : "Ngân hàng (112)";

      const tr = document.createElement("tr");
      const escapedPartnerId = escapeHtmlAttr(v.partnerId);
      const escapedVoucherId = escapeHtmlAttr(v.id);
      tr.innerHTML = `
        <td>${v.date}</td>
        <td>${v.date}</td>
        <td style="font-weight:bold;">${v.id}</td>
        <td><a href="#" onclick="viewPartnerLedger('${escapedPartnerId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${getPartnerNameForVoucher(v)}</a></td>
        <td>${v.description}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric">${formatVND(v.amount).replace("đ","")}</td>
        <td>
          <span class="badge ${isReceipt ? 'badge-success' : 'badge-danger'}">
            ${typeLabel}
          </span>
        </td>
        <td>${methodLabel}</td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapedVoucherId}')" title="Xem và In mẫu chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapedVoucherId}')" title="Xóa và Hủy ghi sổ chứng từ">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const total = filteredCashList.length;
  const paginationInfo = document.getElementById("cash-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} chứng từ`
      : `Hiển thị 0 - 0 trong số 0 chứng từ`;
  }

  const btnPrev = document.getElementById("btn-cash-prev");
  const btnNext = document.getElementById("btn-cash-next");
  if (btnPrev) btnPrev.disabled = cashPage === 1;
  if (btnNext) btnNext.disabled = endIdx >= total;
}

function changeCashPage(dir) {
  cashPage += dir;
  renderCashTable();
}

function filterCash() {
  const query = document.getElementById("cash-search-input") ? document.getElementById("cash-search-input").value.toLowerCase().trim() : "";
  const filterType = document.getElementById("cash-type-filter") ? document.getElementById("cash-type-filter").value : "all";
  const filterMethod = document.getElementById("cash-method-filter") ? document.getElementById("cash-method-filter").value : "all";

  filteredCashList = state.vouchers.filter(v => {
    const isCash = v.type === "receipt" || v.type === "payment" || v.type.startsWith("escrow_");
    if (!isCash) return false;

    const matchesQuery = v.id.toLowerCase().includes(query) || v.partnerName.toLowerCase().includes(query) || v.description.toLowerCase().includes(query);
    
    let matchesType = true;
    if (filterType === "receipt") {
      matchesType = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
    } else if (filterType === "payment") {
      matchesType = v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive";
    }

    let matchesMethod = true;
    if (filterMethod !== "all") {
      matchesMethod = v.paymentMethod === filterMethod;
    }

    return matchesQuery && matchesType && matchesMethod;
  });

  filteredCashList.sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  cashPage = 1;
  renderCashTable();
}

function openAddReceiptModal() {
  document.getElementById("form-receipt").reset();
  document.getElementById("receipt-date").value = new Date().toISOString().split("T")[0];
  openModal("modal-add-receipt");
}

function openAddPaymentModal() {
  document.getElementById("form-payment").reset();
  document.getElementById("payment-date").value = new Date().toISOString().split("T")[0];
  openModal("modal-add-payment");
}

function handleReceiptSubmit(e) {
  e.preventDefault();
  
  const date = document.getElementById("receipt-date").value;
  const partnerVal = document.getElementById("receipt-partner").value;
  const debit = document.getElementById("receipt-debit").value;
  const credit = document.getElementById("receipt-credit").value;
  const amount = parseInt(document.getElementById("receipt-amount").value) || 0;
  const desc = document.getElementById("receipt-desc").value.trim();

  const partnerObj = resolvePartner(partnerVal);
  
  const nextNum = (state.vouchers.filter(v => v.type === 'receipt').length + 1).toString().padStart(4, '0');
  const id = `PT-${new Date().getFullYear().toString().substring(2)}-${nextNum}`;

  const newVoucher = {
    id,
    type: "receipt",
    date,
    partnerId: partnerObj.id,
    partnerName: partnerObj.name,
    paymentMethod: debit,
    description: desc,
    amount,
    entries: [
      { debit, credit, amount, desc }
    ]
  };

  state.vouchers.push(newVoucher);
  saveState();
  recalculateAccounting();
  
  closeModal("modal-add-receipt");
  document.getElementById("form-receipt").reset();
  showToast("Lập phiếu thu thành công!", "success");
  
  filterCash();
  recalculateCashKpis();
}

function handlePaymentSubmit(e) {
  e.preventDefault();
  
  const date = document.getElementById("payment-date").value;
  const partnerVal = document.getElementById("payment-partner").value;
  const debit = document.getElementById("payment-debit").value;
  const credit = document.getElementById("payment-credit").value;
  const amount = parseInt(document.getElementById("payment-amount").value) || 0;
  const desc = document.getElementById("payment-desc").value.trim();

  const partnerObj = resolvePartner(partnerVal);
  
  const nextNum = (state.vouchers.filter(v => v.type === 'payment').length + 1).toString().padStart(4, '0');
  const id = `PC-${new Date().getFullYear().toString().substring(2)}-${nextNum}`;

  const newVoucher = {
    id,
    type: "payment",
    date,
    partnerId: partnerObj.id,
    partnerName: partnerObj.name,
    paymentMethod: credit,
    description: desc,
    amount,
    entries: [
      { debit, credit, amount, desc }
    ]
  };

  state.vouchers.push(newVoucher);
  saveState();
  recalculateAccounting();
  
  closeModal("modal-add-payment");
  document.getElementById("form-payment").reset();
  showToast("Lập phiếu chi thành công!", "success");
  
  filterCash();
  recalculateCashKpis();
}

function exportCashToExcel() {
  const fallbackHeaders = [
    ["DANH SÁCH THU, CHI TIỀN"],
    ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Diễn giải", "Số tiền", "Đối tượng", "Lý do thu/chi", "Ngày ghi sổ quỹ", "Loại chứng từ", "Số chứng từ CUKCUK"]
  ];
  const filteredCash = state.vouchers.filter(v => v.type === "receipt" || v.type === "payment" || v.type.startsWith("escrow_"));
  const cashMapper = (v, r) => {
    if (!v.excelRow) {
      v.excelRow = createDefaultVoucherExcelRow(v);
    }
    for (let i = 0; i < 10; i++) {
      r[i] = v.excelRow[i] !== undefined ? v.excelRow[i] : "";
    }
    const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu thu" : "Phiếu chi";
    r[0] = v.date;
    r[1] = v.date;
    r[2] = v.id;
    r[3] = v.description;
    r[4] = v.amount;
    r[5] = v.partnerName;
    r[6] = v.description;
    r[8] = typeLabel;
  };
  exportExcelWithTemplate(
    'excel/Thu__chi_tien.xlsx',
    `Thu__chi_tien_${new Date().toISOString().split("T")[0]}.xlsx`,
    filteredCash,
    cashMapper,
    fallbackHeaders,
    cashMapper
  );
}

function exportSalesToExcel() {
  const fallbackHeaders = [
    ["DANH SÁCH BÁN HÀNG"],
    ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Số hóa đơn", "Mẫu số HĐ", "Ký hiệu HĐ", "Khách hàng", "Diễn giải", "Tổng tiền hàng", "Tiền chiết khấu", "Tiền thuế GTGT", "Tổng tiền thanh toán", "Đã lập hóa đơn", "Đã xuất hàng", "Loại chứng từ"]
  ];
  let filteredSales = state.vouchers.filter(v => v.type === "sales");
  
  // Filter by advanced search date range & query
  const query = document.getElementById("search-sales") ? document.getElementById("search-sales").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-sales-from") ? document.getElementById("search-sales-from").value : "";
  const toDate = document.getElementById("search-sales-to") ? document.getElementById("search-sales-to").value : "";

  if (query) {
    filteredSales = filteredSales.filter(v => 
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
    );
  }
  if (fromDate) {
    filteredSales = filteredSales.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    filteredSales = filteredSales.filter(v => v.date <= toDate);
  }

  // Sắp xếp số chứng từ giảm dần
  filteredSales.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' }));

  const salesMapper = (v, r) => {
    if (!v.excelRow) {
      v.excelRow = createDefaultSalesExcelRow(v);
    }
    for (let i = 0; i < 15; i++) {
      r[i] = v.excelRow[i] !== undefined ? v.excelRow[i] : "";
    }
    
    r[0] = v.date;
    r[1] = v.date;
    r[2] = v.id;
    r[6] = v.partnerName;
    r[7] = v.description;
    
    let grossTotal = 0;
    let totalDiscount = 0;
    v.items.forEach(item => {
      const itemGross = (item.qty || 0) * (item.price || 0);
      const discountVal = itemGross * ((item.discount || 0) / 100);
      grossTotal += itemGross;
      totalDiscount += discountVal;
    });
    
    r[8] = grossTotal;
    r[9] = totalDiscount;
    r[10] = v.taxAmount || 0;
    r[11] = v.totalAmount;
    r[14] = v.paymentMethod === "111" ? "Bán hàng hóa, dịch vụ trong nước - Tiền mặt" : "Bán hàng hóa, dịch vụ trong nước chưa thu tiền";
  };

  let dateRangeSuffix = "";
  if (fromDate || toDate) {
    dateRangeSuffix = `_tu_${fromDate || "truoc"}_den_${toDate || "sau"}`;
  }

  exportExcelWithTemplate(
    'excel/Ban_hang.xlsx',
    `Ban_hang_${new Date().toISOString().split("T")[0]}${dateRangeSuffix}.xlsx`,
    filteredSales,
    salesMapper,
    fallbackHeaders,
    salesMapper
  );
}

function createDefaultSalesExcelRow(v) {
  const r = [];
  r[0] = v.date;
  r[1] = v.date;
  r[2] = v.id;
  r[3] = "";
  r[4] = "";
  r[5] = "";
  r[6] = v.partnerName;
  r[7] = v.description;
  
  let grossTotal = 0;
  let totalDiscount = 0;
  v.items.forEach(item => {
    const itemGross = (item.qty || 0) * (item.price || 0);
    const discountVal = itemGross * ((item.discount || 0) / 100);
    grossTotal += itemGross;
    totalDiscount += discountVal;
  });
  
  r[8] = grossTotal;
  r[9] = totalDiscount;
  r[10] = v.taxAmount || 0;
  r[11] = v.totalAmount;
  r[12] = "Đã lập";
  r[13] = "Đã xuất";
  r[14] = v.paymentMethod === "111" ? "Bán hàng hóa, dịch vụ trong nước - Tiền mặt" : "Bán hàng hóa, dịch vụ trong nước chưa thu tiền";
  return r;
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
          const inactiveVal = row[6];
          const inactive = inactiveVal === true || (inactiveVal || "").toString().toLowerCase().includes("true");

          const idx = state.partners.findIndex(p => p.id === id);
          const pObj = { id, name, type, phone, email: "", address, taxCode, group, inactive };
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
        filterPartners();
      } 
      
      else if (type === 'debts_opening') {
        let count = 0;
        state.partnerOpeningBalances = state.partnerOpeningBalances || {};
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          if (!id || id === "Mã khách hàng") continue;

          const name = (row[1] || "").toString().trim();
          const debit = Number(row[2]) || 0;
          const credit = Number(row[3]) || 0;
          
          state.partnerOpeningBalances[id] = { debit, credit };
          
          const idx = state.partners.findIndex(p => p.id === id);
          if (idx === -1) {
            const address = (row[5] || "").toString().trim();
            const taxCode = (row[6] || "").toString().trim();
            const phone = (row[7] || "").toString().trim();
            state.partners.push({
              id,
              name,
              type: id.startsWith("NCC") ? "supplier" : "customer",
              phone,
              email: "",
              address,
              taxCode,
              group: id.startsWith("NCC") ? "NCC" : "KH",
              inactive: false
            });
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
        recalculateAccounting();
        showToast(`Đã nạp số dư đầu kỳ cho ${count} đối tác từ file Excel!`, "success");
        filterDebts();
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
      } else if (type === 'sales') {
        let count = 0;
        const partnerMap = new Map();
        state.partners.forEach(p => partnerMap.set(p.name, p.id));
        const voucherMap = new Map();
        state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[2] || "").toString().trim();
          if (!id || id === "Số chứng từ") continue;

          const dateStr = excelDateToISOString(row[0]);
          const partnerName = (row[6] || "Khách hàng vãng lai").toString().trim();
          const description = (row[7] || "Bán hàng").toString().trim();
          
          const H = Number(row[8]) || 0;
          const C = Number(row[9]) || 0;
          const T = Number(row[10]) || 0;
          const totalAmount = Number(row[11]) || 0;

          let paymentMethod = "131";
          const docTypeStr = (row[14] || "").toString().trim().toUpperCase();
          if (docTypeStr.includes("TIỀN MẶT")) {
            paymentMethod = "111";
          }

          let partnerId = partnerMap.get(partnerName);
          if (!partnerId) {
            partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
            state.partners.push({
              id: partnerId,
              name: partnerName,
              type: "customer",
              phone: "",
              email: "",
              address: ""
            });
            partnerMap.set(partnerName, partnerId);
          }

          const originalRow = [];
          for (let col = 0; col < 15; col++) {
            originalRow[col] = row[col] !== undefined ? row[col] : "";
          }

          const vObj = {
            id,
            type: "sales",
            date: dateStr,
            partnerId,
            partnerName,
            paymentMethod,
            description,
            taxRate: 0,
            taxAmount: T,
            totalAmount: totalAmount,
            amount: totalAmount,
            items: [
              {
                productId: "SP_GENERIC",
                qty: 1,
                price: H,
                discount: H > 0 ? Math.round((C / H) * 100 * 100) / 100 : 0,
                amount: H - C
              }
            ],
            excelRow: originalRow
          };

          const existingIdx = voucherMap.get(id);
          if (existingIdx !== undefined) {
            state.vouchers[existingIdx] = vObj;
          } else {
            state.vouchers.push(vObj);
            voucherMap.set(id, state.vouchers.length - 1);
          }
          count++;
        }
        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} hóa đơn bán hàng vào lịch sử!`, "success");
        if (typeof filterSales === "function") filterSales();
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
    initializeMissingExcelRows();
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
  exportProductsToExcel();
  setTimeout(() => {
    exportPartnersToExcel();
  }, 300);
  setTimeout(() => {
    exportCashToExcel();
  }, 600);
}

// ==========================================================================
// HỆ THỐNG GIÁM SÁT VÀ GHI NHẬT KÝ LỖI TOÀN CỤC (GLOBAL MONITOR & LOGGER)
// ==========================================================================
let errorLogs = [];
try {
  const savedLogs = localStorage.getItem("rd_accounting_error_logs");
  if (savedLogs) {
    errorLogs = JSON.parse(savedLogs);
  }
} catch(e) {
  console.error("Error reading logs:", e);
}

function addErrorLog(context, message, err = null) {
  const timestamp = new Date().toLocaleString();
  const errorDetails = err ? {
    message: err.message,
    stack: err.stack
  } : null;
  
  const logEntry = {
    timestamp,
    context,
    message,
    error: errorDetails
  };
  
  errorLogs.unshift(logEntry);
  if (errorLogs.length > 100) errorLogs.pop(); // Giữ tối đa 100 log
  
  try {
    localStorage.setItem("rd_accounting_error_logs", JSON.stringify(errorLogs));
  } catch(e) {
    console.error("Error saving logs:", e);
  }
  
  // Cập nhật giao diện log
  updateErrorLogsUI();
  
  // Hiển thị toast cảnh báo nếu có lỗi mới
  if (typeof showToast === "function") {
    showToast(`Lỗi [${context}]: ${message}`, "danger");
  }
}

function updateErrorLogsUI() {
  const container = document.getElementById("error-logs-container");
  if (!container) return;
  
  if (errorLogs.length === 0) {
    container.innerHTML = "Không có lỗi nào được ghi nhận.";
    container.style.color = "var(--text-secondary)";
    return;
  }
  
  container.innerHTML = errorLogs.map(log => {
    let errStr = "";
    if (log.error) {
      errStr = `\nStack: ${log.error.stack || log.error.message}`;
    }
    return `[${log.timestamp}] [${log.context}] ${log.message}${errStr}`;
  }).join("\n\n");
  container.style.color = "#ef4444"; // Slate red for premium error contrast
}

function clearErrorLogs() {
  errorLogs = [];
  try {
    localStorage.removeItem("rd_accounting_error_logs");
  } catch(e) {
    console.error(e);
  }
  updateErrorLogsUI();
  if (typeof showToast === "function") {
    showToast("Đã xóa sạch nhật ký lỗi!", "success");
  }
}

function exportErrorLogs() {
  if (errorLogs.length === 0) {
    if (typeof showToast === "function") {
      showToast("Nhật ký trống, không có gì để xuất!", "warning");
    }
    return;
  }
  
  const logStr = errorLogs.map(log => {
    let errStr = "";
    if (log.error) {
      errStr = `\nStack: ${log.error.stack || log.error.message}`;
    }
    return `[${log.timestamp}] [${log.context}] ${log.message}${errStr}`;
  }).join("\n" + "=".repeat(80) + "\n");
  
  const blob = new Blob([logStr], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RD_Accounting_Error_Logs_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Bắt lỗi runtime không được xử lý
window.onerror = function(message, source, lineno, colno, error) {
  const errMsg = `${message} tại ${source}:${lineno}:${colno}`;
  addErrorLog("Global Runtime Error", errMsg, error);
  return false;
};

// Bắt lỗi Promise bị Reject mà không được catch
window.onunhandledrejection = function(event) {
  const reason = event.reason;
  const errMsg = reason ? (reason.message || String(reason)) : "Unhandled Promise Rejection";
  addErrorLog("Unhandled Promise", errMsg, reason instanceof Error ? reason : null);
};

// Đăng ký toàn cục các hàm tương tác để chống lỗi Context / Scoping trong Electron
window.promptEditOrderDebt = promptEditOrderDebt;
window.promptEditPartnerOpeningDebt = promptEditPartnerOpeningDebt;
window.handleEditDebtSubmit = handleEditDebtSubmit;
window.viewVoucher = viewVoucher;
window.viewPartnerLedger = viewPartnerLedger;
window.deleteVoucher = deleteVoucher;
window.openEditPartnerModal = openEditPartnerModal;
window.closeModal = closeModal;
window.openModal = openModal;
window.switchTab = switchTab;
window.escapeHtmlAttr = escapeHtmlAttr;
window.clearErrorLogs = clearErrorLogs;
window.exportErrorLogs = exportErrorLogs;
window.addErrorLog = addErrorLog;
window.updateErrorLogsUI = updateErrorLogsUI;
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
    const p = state.products.find(x => x.id === productId);
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
    document.getElementById("quick-import-price").value = p.avgCost || p.initialCost || "";

    openModal("modal-quick-import");
  } catch(err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("promptQuickImport", err.message, err);
    }
  }
}

function handleQuickImportSubmit(e) {
  try {
    e.preventDefault();
    
    const prodId = document.getElementById("quick-import-prod-id").value;
    const qty = parseInt(document.getElementById("quick-import-qty").value) || 0;
    const price = parseInt(document.getElementById("quick-import-price").value) || 0;

    if (qty <= 0 || price < 0) {
      showToast("Số lượng nhập phải lớn hơn 0 và Đơn giá phải lớn hơn hoặc bằng 0đ!", "danger");
      return;
    }

    const p = state.products.find(x => x.id === prodId);
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
  } catch(err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("handleQuickImportSubmit", err.message, err);
    }
  }
}

function promptEditProductPrice(productId) {
  try {
    console.log("promptEditProductPrice called with:", productId);
    const p = state.products.find(x => x.id === productId);
    if (!p) {
      if (typeof addErrorLog === "function") {
        addErrorLog("promptEditProductPrice", `Không tìm thấy sản phẩm với mã: ${productId}`);
      }
      showToast(`Không tìm thấy sản phẩm với mã: ${productId}`, "danger");
      return;
    }

    document.getElementById("edit-prod-id").value = p.id;
    document.getElementById("edit-prod-id-display").value = p.id;
    document.getElementById("edit-prod-name").value = p.name;
    document.getElementById("edit-prod-unit").value = p.unit || "Cái";
    document.getElementById("edit-prod-initial-cost").value = p.initialCost || 0;
    document.getElementById("edit-prod-initial-stock").value = p.initialStock || 0;
    document.getElementById("edit-prod-avg-cost").value = p.avgCost || 0;
    document.getElementById("edit-prod-min-stock").value = p.minStock || 5;

    openModal("modal-edit-product-price");
  } catch(err) {
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
    const initialCost = parseInt(document.getElementById("edit-prod-initial-cost").value) || 0;
    const initialStock = parseInt(document.getElementById("edit-prod-initial-stock").value) || 0;
    const avgCost = parseInt(document.getElementById("edit-prod-avg-cost").value) || 0;
    const minStock = parseInt(document.getElementById("edit-prod-min-stock").value) || 0;

    if (!name || !unit) {
      showToast("Vui lòng điền đầy đủ Tên sản phẩm và Đơn vị tính!", "danger");
      return;
    }

    const p = state.products.find(x => x.id === prodId);
    if (!p) return;

    p.name = name;
    p.unit = unit;
    p.initialCost = initialCost;
    p.initialStock = initialStock;
    p.avgCost = avgCost;
    p.minStock = minStock;

    // Cập nhật giá trị tồn ban đầu
    p.stock = initialStock;
    p.totalValue = initialStock * initialCost;

    saveState();
    recalculateAccounting();
    closeModal("modal-edit-product-price");
    showToast(`Đã cập nhật thông tin và đơn giá sản phẩm ${p.id} thành công!`, "success");
    
    // Vẽ lại bảng tồn kho và thẻ kho
    renderInventoryTable();
    populateProductLedgerDropdown();
    renderStockLedger();
  } catch(err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("handleEditProductPriceSubmit", err.message, err);
    }
  }
}

// Khởi chạy đồng bộ logs UI ngay khi script load
setTimeout(() => {
  try {
    updateErrorLogsUI();
  } catch(e) {
    console.error(e);
  }
}, 50);

// ==========================================================================
// HỆ THỐNG ĐỒNG BỘ CƠ SỞ DỮ LIỆU ĐÁM MÂY (FIREBASE REALTIME DATABASE CLOUD SYNC)
// ==========================================================================
function escapeFirebaseKey(key) {
  if (typeof key !== 'string') return key;
  return key
    .replace(/%/g, '_esc_percent_')
    .replace(/\./g, '_esc_dot_')
    .replace(/#/g, '_esc_hash_')
    .replace(/\$/g, '_esc_dollar_')
    .replace(/\//g, '_esc_slash_')
    .replace(/\[/g, '_esc_obrack_')
    .replace(/\]/g, '_esc_cbrack_');
}

function unescapeFirebaseKey(key) {
  if (typeof key !== 'string') return key;
  return key
    .replace(/_esc_dot_/g, '.')
    .replace(/_esc_hash_/g, '#')
    .replace(/_esc_dollar_/g, '$')
    .replace(/_esc_slash_/g, '/')
    .replace(/_esc_obrack_/g, '[')
    .replace(/_esc_cbrack_/g, ']')
    .replace(/_esc_percent_/g, '%');
}

function escapeFirebaseObject(obj) {
  if (!obj) return obj;
  
  // Tạo bản sao cạn (shallow clone) của state để không làm thay đổi trực tiếp bộ nhớ cục bộ
  const copy = { ...obj };
  
  // Chỉ thực hiện escape cho partnerOpeningBalances
  if (copy.partnerOpeningBalances) {
    const escapedBalances = {};
    for (const key in copy.partnerOpeningBalances) {
      if (Object.prototype.hasOwnProperty.call(copy.partnerOpeningBalances, key)) {
        const escapedKey = escapeFirebaseKey(key);
        escapedBalances[escapedKey] = copy.partnerOpeningBalances[key];
      }
    }
    copy.partnerOpeningBalances = escapedBalances;
  }
  
  return copy;
}

function unescapeFirebaseObject(obj) {
  if (!obj) return obj;
  
  const copy = { ...obj };
  
  if (copy.partnerOpeningBalances) {
    const unescapedBalances = {};
    for (const key in copy.partnerOpeningBalances) {
      if (Object.prototype.hasOwnProperty.call(copy.partnerOpeningBalances, key)) {
        const unescapedKey = unescapeFirebaseKey(key);
        unescapedBalances[unescapedKey] = copy.partnerOpeningBalances[key];
      }
    }
    copy.partnerOpeningBalances = unescapedBalances;
  }
  
  return copy;
}

let firebaseApp = null;
let firebaseDb = null;
let cloudSyncActive = false;
let cloudSyncSettings = {
  enabled: true,
  apiKey: "AIzaSyAe2A71K8H9YuFPzm62dI-cTq9ImREARG0",
  databaseURL: "https://rangdong-accounting-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rangdong-accounting",
  appId: "1:317276892113:web:434f1da4d0c1db12184ef0"
};

function loadCloudSettings() {
  try {
    const saved = localStorage.getItem("rd_accounting_cloud_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey) {
        cloudSyncSettings = parsed;
      } else {
        localStorage.setItem("rd_accounting_cloud_settings", JSON.stringify(cloudSyncSettings));
      }
    } else {
      // Sử dụng cấu hình Firebase mặc định của người dùng
      localStorage.setItem("rd_accounting_cloud_settings", JSON.stringify(cloudSyncSettings));
    }
    
    const chk = document.getElementById("setting-cloud-enabled");
    if (chk) chk.checked = cloudSyncSettings.enabled;
    
    const apiKey = document.getElementById("setting-cloud-apikey");
    if (apiKey) apiKey.value = cloudSyncSettings.apiKey || "";
    
    const dburl = document.getElementById("setting-cloud-dburl");
    if (dburl) dburl.value = cloudSyncSettings.databaseURL || "";
    
    const pid = document.getElementById("setting-cloud-projectid");
    if (pid) pid.value = cloudSyncSettings.projectId || "";
    
    const appid = document.getElementById("setting-cloud-appid");
    if (appid) appid.value = cloudSyncSettings.appId || "";
    
    toggleCloudSyncInputs();
  } catch(e) {
    console.error("Lỗi đọc cấu hình cloud:", e);
  }
}

function initCloudSync() {
  if (!cloudSyncSettings.enabled) {
    updateCloudSyncBadge(false, "Mây: Tắt", "#64748b");
    return;
  }

  if (!cloudSyncSettings.apiKey || !cloudSyncSettings.databaseURL || !cloudSyncSettings.projectId) {
    updateCloudSyncBadge(false, "Mây: Chưa cấu hình", "#ef4444");
    return;
  }

  try {
    updateCloudSyncBadge(false, "Mây: Đang kết nối...", "#f59e0b");
    
    if (typeof firebase === "undefined") {
      if (typeof addErrorLog === "function") {
        addErrorLog("initCloudSync", "Thư viện Firebase chưa được tải. Vui lòng kiểm tra Internet.");
      }
      updateCloudSyncBadge(false, "Mây: Không có mạng", "#ef4444");
      return;
    }

    if (firebase.apps.length > 0) {
      firebase.app().delete().then(startFirebaseApp).catch(err => {
        if (typeof addErrorLog === "function") {
          addErrorLog("initCloudSync App Delete", err.message, err);
        }
      });
    } else {
      startFirebaseApp();
    }
  } catch(err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("initCloudSync", err.message, err);
    }
    updateCloudSyncBadge(false, "Mây: Lỗi kết nối", "#ef4444");
  }
}

function startFirebaseApp() {
  try {
    const config = {
      apiKey: cloudSyncSettings.apiKey,
      databaseURL: cloudSyncSettings.databaseURL,
      projectId: cloudSyncSettings.projectId,
      appId: cloudSyncSettings.appId
    };
    
    firebaseApp = firebase.initializeApp(config);
    firebaseDb = firebase.database();
    cloudSyncActive = true;

    // Lắng nghe kết nối mạng từ Firebase
    const connectedRef = firebaseDb.ref(".info/connected");
    connectedRef.on("value", (snap) => {
      if (snap.val() === true) {
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        showToast("Đã kết nối đám mây thời gian thực thành công!", "success");
        
        // Tải dữ liệu từ đám mây khi khởi động
        pullFromCloudOnStartup();
        // Lắng nghe thay đổi trực tuyến để đồng bộ đa máy
        listenToCloudChanges();
      } else {
        updateCloudSyncBadge(false, "Mây: Ngoại tuyến", "#ef4444");
      }
    });

    const forcePullBtn = document.getElementById("btn-force-pull");
    if (forcePullBtn) forcePullBtn.style.display = "inline-block";
  } catch(err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("startFirebaseApp", err.message, err);
    }
    updateCloudSyncBadge(false, "Mây: Lỗi khởi tạo", "#ef4444");
  }
}

function pullFromCloudOnStartup() {
  if (!cloudSyncActive || !firebaseDb) return;
  
  firebaseDb.ref("rd_accounting_db").once("value")
    .then((snapshot) => {
      const rawData = snapshot.val();
      if (rawData) {
        const data = unescapeFirebaseObject(rawData);
        state = data;
        localStorage.setItem("rd_accounting_db", JSON.stringify(state));
        console.log("Dữ liệu đám mây đã được nạp thành công khi khởi động!");
        
        // Cập nhật giao diện
        recalculateAccounting();
        renderDashboard();
        filterDebts();
        filterPartners();
        filterCash();
      }
    })
    .catch((err) => {
      if (typeof addErrorLog === "function") {
        addErrorLog("pullFromCloudOnStartup", err.message, err);
      }
    });
}

function forcePullFromCloud() {
  if (!cloudSyncActive || !firebaseDb) {
    showToast("Ứng dụng chưa kết nối Đám mây!", "danger");
    return;
  }

  updateCloudSyncBadge(false, "Mây: Đang tải...", "#f59e0b");
  firebaseDb.ref("rd_accounting_db").once("value")
    .then((snapshot) => {
      const rawData = snapshot.val();
      if (rawData) {
        const data = unescapeFirebaseObject(rawData);
        state = data;
        localStorage.setItem("rd_accounting_db", JSON.stringify(state));
        recalculateAccounting();
        renderDashboard();
        filterDebts();
        filterPartners();
        filterCash();
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
        showToast("Tải dữ liệu từ Đám mây về máy này thành công!", "success");
      } else {
        showToast("Không tìm thấy dữ liệu trên Đám mây để tải về!", "warning");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      }
    })
    .catch((err) => {
      if (typeof addErrorLog === "function") {
        addErrorLog("forcePullFromCloud", err.message, err);
      }
      showToast("Lỗi khi tải dữ liệu đám mây: " + err.message, "danger");
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    });
}

function pushToCloud() {
  if (!cloudSyncActive || !firebaseDb) return;
  
  const escapedState = escapeFirebaseObject(state);
  firebaseDb.ref("rd_accounting_db").set(escapedState)
    .then(() => {
      console.log("Đã đồng bộ hóa state lên đám mây thành công!");
    })
    .catch((err) => {
      if (typeof addErrorLog === "function") {
        addErrorLog("pushToCloud", err.message, err);
      }
    });
}

function listenToCloudChanges() {
  if (!cloudSyncActive || !firebaseDb) return;
  
  firebaseDb.ref("rd_accounting_db").off("value");
  firebaseDb.ref("rd_accounting_db").on("value", (snapshot) => {
    const rawData = snapshot.val();
    if (rawData) {
      const data = unescapeFirebaseObject(rawData);
      const localStr = localStorage.getItem("rd_accounting_db") || "";
      const cloudStr = JSON.stringify(data);
      
      if (localStr !== cloudStr) {
        console.log("Nhận thấy dữ liệu đám mây thay đổi từ máy khác, đang đồng bộ...");
        state = data;
        localStorage.setItem("rd_accounting_db", cloudStr);
        
        recalculateAccounting();
        renderDashboard();
        filterDebts();
        filterPartners();
        filterCash();
      }
    }
  });
}

function toggleCloudSyncInputs() {
  const chk = document.getElementById("setting-cloud-enabled");
  const group = document.getElementById("cloud-sync-inputs-group");
  if (chk && group) {
    group.style.display = chk.checked ? "flex" : "none";
  }
}

function saveCloudConfig(e) {
  try {
    e.preventDefault();
    
    const enabled = document.getElementById("setting-cloud-enabled").checked;
    const apiKey = document.getElementById("setting-cloud-apikey").value.trim();
    const databaseURL = document.getElementById("setting-cloud-dburl").value.trim();
    const projectId = document.getElementById("setting-cloud-projectid").value.trim();
    const appId = document.getElementById("setting-cloud-appid").value.trim();

    if (enabled && (!apiKey || !databaseURL || !projectId)) {
      showToast("Vui lòng điền các trường bắt buộc (API Key, Database URL, Project ID)!", "danger");
      return;
    }

    cloudSyncSettings = {
      enabled,
      apiKey,
      databaseURL,
      projectId,
      appId
    };

    localStorage.setItem("rd_accounting_cloud_settings", JSON.stringify(cloudSyncSettings));
    showToast("Cấu hình đám mây đã được lưu thành công!", "success");

    if (enabled) {
      initCloudSync();
    } else {
      if (firebaseDb) firebaseDb.ref("rd_accounting_db").off("value");
      cloudSyncActive = false;
      const forcePullBtn = document.getElementById("btn-force-pull");
      if (forcePullBtn) forcePullBtn.style.display = "none";
      updateCloudSyncBadge(false, "Mây: Tắt", "#64748b");
      showToast("Đã tắt đồng bộ trực tuyến đám mây.", "info");
    }
  } catch(err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("saveCloudConfig", err.message, err);
    }
  }
}

function updateCloudSyncBadge(connected, text, color = "#64748b") {
  const badge = document.getElementById("cloud-sync-badge");
  const indicator = document.getElementById("cloud-sync-indicator");
  const textEl = document.getElementById("cloud-sync-status-text");
  
  if (badge && indicator && textEl) {
    textEl.innerText = text;
    textEl.style.color = color;
    indicator.style.backgroundColor = color;
    
    if (connected) {
      indicator.classList.add("pulse-indicator");
    } else {
      indicator.classList.remove("pulse-indicator");
    }
  }
}

// Đăng ký toàn cục các hàm cho thiết bị Electron
window.loadCloudSettings = loadCloudSettings;
window.initCloudSync = initCloudSync;
window.saveCloudConfig = saveCloudConfig;
window.toggleCloudSyncInputs = toggleCloudSyncInputs;
window.forcePullFromCloud = forcePullFromCloud;
window.updateCloudSyncBadge = updateCloudSyncBadge;
window.triggerAutoExtractPhones = triggerAutoExtractPhones;
window.autoExtractPhonesAndCleanAddresses = autoExtractPhonesAndCleanAddresses;

// ==========================================================
// CÁC HÀM XỬ LÝ BATCH SELECTION & BATCH DELETE (VOUCHERS & PRODUCTS)
// ==========================================================

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
    
    if (typeof filterSales === "function") filterSales();
    if (typeof filterPurchases === "function") filterPurchases();
    if (typeof filterCash === "function") {
      filterCash();
      if (typeof recalculateCashKpis === "function") recalculateCashKpis();
    }
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof renderInventoryTable === "function") renderInventoryTable();
    
    showToast(`Đã xóa thành công ${checked.length} chứng từ bán hàng!`, "success");
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
    
    saveState();
    recalculateAccounting();
    
    const master = document.getElementById("check-all-products");
    if (master) master.checked = false;
    
    updateBatchProductsUI();
    
    renderInventoryTable();
    populateProductLedgerDropdown();
    
    showToast(`Đã xóa thành công ${checked.length} sản phẩm!`, "success");
  }
}

function deleteProduct(prodId) {
  if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${prodId}"? Dữ liệu tồn kho liên quan có thể bị ảnh hưởng.`)) {
    state.products = state.products.filter(p => p.id !== prodId);
    saveState();
    recalculateAccounting();
    renderInventoryTable();
    populateProductLedgerDropdown();
    showToast(`Đã xóa sản phẩm ${prodId}!`, "success");
  }
}

// Đăng ký toàn cục các hàm
window.toggleSelectAllSales = toggleSelectAllSales;
window.updateBatchSalesUI = updateBatchSalesUI;
window.batchDeleteSales = batchDeleteSales;
window.toggleSelectAllProducts = toggleSelectAllProducts;
window.updateBatchProductsUI = updateBatchProductsUI;
window.batchDeleteProducts = batchDeleteProducts;
window.deleteProduct = deleteProduct;
window.editSalesVoucher = editSalesVoucher;
window.resetSalesForm = resetSalesForm;
window.changeSalesPage = changeSalesPage;
window.clearSalesDateFilter = clearSalesDateFilter;
window.openQuickAddPartnerModal = openQuickAddPartnerModal;
window.handleQuickAddPartnerSubmit = handleQuickAddPartnerSubmit;
window.exportCurrentPartnerDebtExcel = exportCurrentPartnerDebtExcel;

