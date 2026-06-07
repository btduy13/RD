/* ==========================================================================
   BỘ MÁY NGHIỆP VỤ KẾ TOÁN VÀ ĐIỀU KHIỂN GIAO DIỆN (APP.JS)
   Tính toán giá vốn bình quân gia quyền liên hoàn & Quản lý Nhật ký kép
   ========================================================================== */

// 1. STATE TOÀN CỤC CỦA ỨNG DỤNG
let machineSuffix = localStorage.getItem("rd_accounting_machine_suffix");
if (!machineSuffix) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  machineSuffix = chars[Math.floor(Math.random() * chars.length)];
  localStorage.setItem("rd_accounting_machine_suffix", machineSuffix);
}

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
  if (typeof initMouseInteractions === "function") {
    initMouseInteractions();
  }
  setupNumberFormattingEventListeners();
});

// Helper đọc file Excel: ưu tiên dùng IPC (Electron), fallback sang fetch (web)
async function readExcelViaIPC(filename) {
  // Nếu đang chạy trong Electron desktop app, dùng IPC để tránh lỗi fetch với file:// protocol
  if (window.electronAPI && typeof window.electronAPI.readExcelFile === 'function') {
    const result = await window.electronAPI.readExcelFile(filename);
    if (!result.ok) {
      throw new Error(result.error || `Không đọc được file: ${filename}`);
    }
    return new Uint8Array(result.data);
  }
  // Fallback: dùng fetch cho môi trường web thông thường
  const response = await fetch('excel/' + filename);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function setupNumberFormattingEventListeners() {
  document.addEventListener("input", function (e) {
    if (e.target && e.target.classList.contains("number-format")) {
      const rawVal = e.target.value.replace(/\D/g, "");
      if (rawVal) {
        e.target.value = Number(rawVal).toLocaleString("vi-VN");
      } else {
        e.target.value = "";
      }
    }
  });
}

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

  // Khởi tạo các thuộc tính ban đầu cho các mặt hàng cũ nếu bị thiếu
  if (state.products) {
    state.products.forEach(p => {
      if (p.initialStock === undefined) {
        p.initialStock = p.stock !== undefined ? p.stock : 0;
      }
      if (p.initialCost === undefined) {
        p.initialCost = p.avgCost !== undefined ? p.avgCost : 0;
      }
    });
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

  // Dọn dẹp hàng trong kho hàng có đơn vị tính là số
  if (typeof cleanNumericUnitProducts === "function") {
    cleanNumericUnitProducts();
  }

  // Khôi phục các giá trị chiết khấu tuyệt đối về tỷ lệ % (nếu có)
  migrateDiscountValues();

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

  // Tự động tích hợp lịch sử bán hàng chi tiết từ SO_CHI_TIET_BAN_HANG.xlsx nếu chưa tích hợp
  autoIntegrateSoChiTietBanHangExcel();

  // Tự động tích hợp lịch sử mua hàng chi tiết từ SO_CHI_TIET_MUA_HANG_THEO_MA_QUY_CACH.xlsx nếu chưa tích hợp
  autoIntegrateSoChiTietMuaHangExcel();

  // Tự động tích hợp quỹ thu/chi từ Thu__chi_tien.xlsx nếu chưa tích hợp
  autoIntegrateVouchersExcel();

  // Hiển thị phiên bản cục bộ & tự động kiểm tra cập nhật nếu là Desktop App
  if (typeof initLocalVersionDisplay === "function") {
    initLocalVersionDisplay();
    // Tự động kiểm tra cập nhật ngầm khi khởi động ứng dụng
    setTimeout(() => {
      if (typeof checkForUpdates === "function") {
        checkForUpdates(false);
      }
    }, 1500); // Trì hoãn 1.5 giây để tránh chặn tài nguyên lúc khởi động
  }

  // Mở tab mặc định
  switchTab("dashboard");

  // Khởi tạo phím tắt Ctrl+F tìm kiếm trong tab hiện hành
  if (typeof initCtrlFShortcut === "function") {
    initCtrlFShortcut();
  }

  // Khởi tạo điều hướng bàn phím cho bảng nhập dòng đơn hàng (Tab / F1 / F2)
  if (typeof initOrderFormKeyboardNavigation === "function") {
    initOrderFormKeyboardNavigation();
  }
}

function migrateDiscountValues() {
  let migrated = false;
  if (state && Array.isArray(state.vouchers)) {
    state.vouchers.forEach(v => {
      if (v.type === "sales" && Array.isArray(v.items)) {
        v.items.forEach(item => {
          if (item.discount > 100) {
            const gross = (item.qty || 0) * (item.price || 0);
            if (gross > 0) {
              const oldDiscount = item.discount;
              item.discount = Math.round((oldDiscount / gross) * 100 * 100) / 100;
              migrated = true;
            }
          }
        });
      }
    });
  }
  if (migrated) {
    console.log("Migrated legacy absolute discount values to percentages.");
    saveState();
  }
}

async function autoIntegrateVouchersExcel() {
  const hasCash = state.vouchers && state.vouchers.some(v => v.type === "receipt" || v.type === "payment");
  if (hasCash) {
    console.log("Vouchers (cash entries) are already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Vouchers Excel integration...");
    setTimeout(autoIntegrateVouchersExcel, 1000);
    return;
  }

  console.log("Starting automatic integration of excel/Thu__chi_tien.xlsx...");
  try {
    let data;
    try {
      data = await readExcelViaIPC('Thu__chi_tien.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/Thu__chi_tien.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }

    if (!data) return;

    const bytes = new Uint8Array(data);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 3) return;

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
    console.log(`[AutoIntegration] Successfully integrated ${count} cash vouchers.`);
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterCash === "function") filterCash();
  } catch (err) {
    console.warn("Lỗi tự động tích hợp quỹ thu/chi:", err.message);
  }
}

async function autoIntegrateSalesExcel() {
  const hasSales = state.vouchers && state.vouchers.some(v => v.type === "sales");
  if (state.salesExcelIntegrated && hasSales) {
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
    let data;
    try {
      data = await readExcelViaIPC('Ban_hang.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/Ban_hang.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }
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

async function autoIntegrateSoChiTietBanHangExcel() {
  if (state.soChiTietBanHangIntegrated) {
    console.log("Detailed Sales Excel (SO_CHI_TIET_BAN_HANG) is already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Detailed Sales Excel integration...");
    setTimeout(autoIntegrateSoChiTietBanHangExcel, 1000);
    return;
  }

  console.log("Starting automatic integration of excel/SO_CHI_TIET_BAN_HANG.xlsx...");
  try {
    if (typeof showToast === "function") {
      showToast("Đang nạp Sổ chi tiết bán hàng (48.226 dòng)... Vui lòng đợi trong giây lát.", "info");
    }

    // Trì hoãn 100ms để Toast hiển thị trước khi CPU bận
    await new Promise(resolve => setTimeout(resolve, 100));

    let data;
    try {
      data = await readExcelViaIPC('SO_CHI_TIET_BAN_HANG.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/SO_CHI_TIET_BAN_HANG.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 3) {
      console.warn("excel/SO_CHI_TIET_BAN_HANG.xlsx is empty.");
      return;
    }

    // Gom nhóm các dòng theo Số chứng từ (row[2])
    const groupMap = new Map();
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      const voucherId = (row[2] || "").toString().trim();
      if (!voucherId) continue;

      if (!groupMap.has(voucherId)) {
        groupMap.set(voucherId, []);
      }
      groupMap.get(voucherId).push(row);
    }

    let count = 0;
    const partnerMap = new Map();
    state.partners.forEach(p => partnerMap.set(p.id, p));

    const productMap = new Map();
    state.products.forEach(p => productMap.set(p.id, p));

    const voucherMap = new Map();
    state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

    // Duyệt qua từng chứng từ bán hàng
    for (const [voucherId, voucherRows] of groupMap.entries()) {
      const firstRow = voucherRows[0];
      const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);

      const partnerIdRaw = (firstRow[7] || "").toString().trim();
      const partnerId = partnerIdRaw ? partnerIdRaw : `DT_${Math.floor(1000 + Math.random() * 9000)}`;
      const partnerName = (firstRow[8] || "Khách hàng vãng lai").toString().trim();
      const description = (firstRow[5] || "Bán hàng").toString().trim();

      // Đăng ký đối tác nếu chưa tồn tại
      if (!partnerMap.has(partnerId)) {
        const pObj = {
          id: partnerId,
          name: partnerName,
          type: "customer",
          phone: "",
          email: "",
          address: ""
        };
        state.partners.push(pObj);
        partnerMap.set(partnerId, pObj);
      }

      // Xác định phương thức thanh toán
      let paymentMethod = "131"; // Default: Công nợ
      const descUpper = description.toUpperCase();
      const nameUpper = partnerName.toUpperCase();
      if (descUpper.includes("TIỀN MẶT") || descUpper.includes("TM") || nameUpper.includes("BÁN LẺ") || nameUpper.includes("KHÁCH LẺ") || nameUpper.includes("VÃNG LAI")) {
        paymentMethod = "111"; // Tiền mặt
      }

      // Tạo mảng items
      const itemsArray = [];
      let totalVoucherAmount = 0;

      for (const row of voucherRows) {
        const productId = (row[9] || "SP_GENERIC").toString().trim();
        const productName = (row[10] || "Sản phẩm generic").toString().trim();
        const unit = (row[11] || "Cái").toString().trim();
        const qty = Number(row[12]) || 0;
        const price = Number(row[13]) || 0;
        const discountAmount = Number(row[15]) || 0;

        // Doanh số bán (row[14]) là gross, doanh thu thuần là gross - discount
        const grossAmount = qty * price;
        const amount = grossAmount - discountAmount;
        const discountPercent = grossAmount > 0 ? Math.round((discountAmount / grossAmount) * 100 * 100) / 100 : 0;

        itemsArray.push({
          productId: productId,
          qty: qty,
          price: price,
          discount: discountPercent,
          amount: amount
        });

        totalVoucherAmount += amount;

        // Đăng ký sản phẩm nếu chưa tồn tại
        if (!productMap.has(productId)) {
          const prodObj = {
            id: productId,
            name: productName,
            unit: unit,
            stock: 0,
            avgCost: 0,
            totalValue: 0
          };
          state.products.push(prodObj);
          productMap.set(productId, prodObj);
        }
      }

      const vObj = {
        id: voucherId,
        type: "sales",
        date: dateStr,
        partnerId: partnerId,
        partnerName: partnerName,
        paymentMethod: paymentMethod,
        description: description,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: totalVoucherAmount,
        amount: totalVoucherAmount,
        items: itemsArray
      };

      const existingIdx = voucherMap.get(voucherId);
      if (existingIdx !== undefined) {
        // Cập nhật và nâng cấp chứng từ hiện có
        state.vouchers[existingIdx] = vObj;
      } else {
        // Thêm mới chứng từ bán hàng
        state.vouchers.push(vObj);
        voucherMap.set(voucherId, state.vouchers.length - 1);
      }
      count++;
    }

    state.soChiTietBanHangIntegrated = true;
    state.salesExcelIntegrated = true; // Mark sales also integrated to bypass the Ban_hang.xlsx old loader
    saveState();
    recalculateAccounting();

    console.log(`Successfully integrated ${count} detailed sales vouchers from SO_CHI_TIET_BAN_HANG.xlsx!`);

    if (typeof showToast === "function") {
      showToast(`Tích hợp thành công Sổ chi tiết bán hàng! Đã nạp ${count} chứng từ.`, "success");
    }

    if (typeof updateExcelHubUI === "function") updateExcelHubUI();
    if (typeof filterSales === "function") filterSales();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    console.error("Error auto-integrating detailed sales Excel:", err);
    if (typeof showToast === "function") {
      showToast("Lỗi tích hợp Sổ chi tiết bán hàng Excel: " + err.message, "danger");
    }
  }
}

async function autoIntegrateSoChiTietMuaHangExcel(force = false) {
  if (state.soChiTietMuaHangIntegrated && !force) {
    console.log("Detailed Purchase Excel is already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Detailed Purchase Excel integration...");
    setTimeout(() => autoIntegrateSoChiTietMuaHangExcel(force), 1000);
    return;
  }

  console.log("Starting automatic integration of detailed purchase excel...");
  try {
    if (typeof showToast === "function") {
      showToast("Đang nạp Sổ chi tiết mua hàng... Vui lòng đợi trong giây lát.", "info");
    }

    // Trì hoãn 100ms để Toast hiển thị trước khi CPU bận
    await new Promise(resolve => setTimeout(resolve, 100));

    let data;
    let loadedFilename = 'SO_CHI_TIET_MUA_HANG_THEO_MA_QUY_CACH.xlsx';
    try {
      data = await readExcelViaIPC('SO_CHI_TIET_MUA_HANG_THEO_MA_QUY_CACH.xlsx');
    } catch (fetchErr) {
      try {
        data = await readExcelViaIPC('SO_CHI_TIET_MUA_HANG.xlsx');
        loadedFilename = 'SO_CHI_TIET_MUA_HANG.xlsx';
      } catch (err2) {
        console.warn("No detailed purchase excel file found or failed to read. Skipping auto-integration.", err2.message);
        return;
      }
    }
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 3) {
      console.warn(`excel/${loadedFilename} is empty.`);
      return;
    }

    let colQty = 13;
    let colPrice = 14;
    let colAmount = 17;

    let headerIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      if (rows[r] && rows[r].includes("Số chứng từ") && rows[r].includes("Mã hàng")) {
        headerIdx = r;
        break;
      }
    }

    if (headerIdx !== -1) {
      const header = rows[headerIdx];
      const qIdx = header.indexOf("Số lượng mua");
      const pIdx = header.indexOf("Đơn giá");
      const aIdx = header.indexOf("Giá trị mua");
      if (qIdx !== -1) colQty = qIdx;
      if (pIdx !== -1) colPrice = pIdx;
      if (aIdx !== -1) colAmount = aIdx;
    }

    // Gom nhóm các dòng theo Số chứng từ (row[2])
    const groupMap = new Map();
    const startRow = headerIdx !== -1 ? headerIdx + 1 : 3;
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const voucherId = (row[2] || "").toString().trim();
      if (!voucherId || voucherId.startsWith("TỔNG")) continue;

      if (!groupMap.has(voucherId)) {
        groupMap.set(voucherId, []);
      }
      groupMap.get(voucherId).push(row);
    }

    let count = 0;
    const partnerMap = new Map();
    state.partners.forEach(p => partnerMap.set(p.id, p));

    const productMap = new Map();
    state.products.forEach(p => productMap.set(p.id, p));

    const voucherMap = new Map();
    state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

    // Đăng ký đối tác mặc định cho nhập hàng
    const partnerId = "NCC_EXCEL";
    const partnerName = "Nhà cung cấp Sổ chi tiết";
    if (!partnerMap.has(partnerId)) {
      const pObj = {
        id: partnerId,
        name: partnerName,
        type: "supplier",
        phone: "",
        email: "",
        address: ""
      };
      state.partners.push(pObj);
      partnerMap.set(partnerId, pObj);
    }

    // Duyệt qua từng chứng từ mua hàng
    for (const [voucherId, voucherRows] of groupMap.entries()) {
      const firstRow = voucherRows[0];
      const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);
      const invoiceNo = firstRow[4] || "";
      const description = `Nhập kho mua hàng theo số hóa đơn ${invoiceNo || voucherId}`;

      // Tạo mảng items
      const itemsArray = [];
      let totalVoucherAmount = 0;

      for (const row of voucherRows) {
        const productId = (row[5] || "SP_GENERIC").toString().trim();
        const productName = (row[6] || "Sản phẩm generic").toString().trim();
        const unit = (row[7] || "Cái").toString().trim();
        const qty = Number(row[colQty]) || 0;
        const price = Number(row[colPrice]) || 0;

        // Sử dụng giá trị mua ở row[colAmount], nếu không có thì tính bằng qty * price
        const amount = Number(row[colAmount]) || (qty * price);

        itemsArray.push({
          productId: productId,
          qty: qty,
          price: price,
          amount: amount
        });

        totalVoucherAmount += amount;

        // Đăng ký sản phẩm nếu chưa tồn tại
        if (!productMap.has(productId)) {
          const prodObj = {
            id: productId,
            name: productName,
            unit: unit,
            stock: 0,
            avgCost: 0,
            totalValue: 0
          };
          state.products.push(prodObj);
          productMap.set(productId, prodObj);
        }
      }

      const vObj = {
        id: voucherId,
        type: "purchase",
        date: dateStr,
        partnerId: partnerId,
        partnerName: partnerName,
        paymentMethod: "331", // Mặc định là công nợ
        description: description,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: totalVoucherAmount,
        amount: totalVoucherAmount,
        items: itemsArray
      };

      const existingIdx = voucherMap.get(voucherId);
      if (existingIdx !== undefined) {
        // Cập nhật và nâng cấp chứng từ hiện có
        state.vouchers[existingIdx] = vObj;
      } else {
        // Thêm mới chứng từ mua hàng
        state.vouchers.push(vObj);
        voucherMap.set(voucherId, state.vouchers.length - 1);
      }
      count++;
    }

    state.soChiTietMuaHangIntegrated = true;
    saveState();
    recalculateAccounting();

    console.log(`Successfully integrated ${count} detailed purchase vouchers from ${loadedFilename}!`);

    if (typeof showToast === "function") {
      showToast(`Tích hợp thành công Sổ chi tiết mua hàng! Đã nạp ${count} chứng từ.`, "success");
    }

    if (typeof updateExcelHubUI === "function") updateExcelHubUI();
    if (typeof filterPurchaseTable === "function") filterPurchaseTable();
    if (typeof renderPurchaseTable === "function") renderPurchaseTable();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    console.error("Error auto-integrating detailed purchase Excel:", err);
    if (typeof showToast === "function") {
      showToast("Lỗi tích hợp Sổ chi tiết mua hàng Excel: " + err.message, "danger");
    }
  }
}

// Biến phục vụ tối ưu lưu trữ (Debounce saveState để tránh đơ UI khi dữ liệu lớn)
let saveStateTimeout = null;
let saveStateIsDirty = false;
let _cloudPullCompleted = false; // Cờ ngăn push trước khi pull cloud xong

function saveState() {
  saveStateIsDirty = true;
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  // Trì hoãn lưu trữ 200ms để gộp các yêu cầu lưu và chạy bất đồng bộ
  saveStateTimeout = setTimeout(() => {
    executeSaveState();
  }, 200);
}

function executeSaveState() {
  if (!saveStateIsDirty) return;
  try {
    // [FIX 1] Luôn cập nhật timestamp trước khi lưu và push
    // để máy nhận có thể nhận biết đây là bản mới nhất
    state._lastModified = Date.now();
    localStorage.setItem("rd_accounting_db", JSON.stringify(state));
    // [FIX 4] Chỉ push lên cloud khi đã pull xong dữ liệu cloud lúc khởi động
    // Tránh race condition: máy A bật lên → push dữ liệu cũ → ghi đè dữ liệu mới của máy B
    if (_cloudPullCompleted && typeof pushToCloud === "function") {
      pushToCloud();
    }
    saveStateIsDirty = false;
  } catch (err) {
    console.error("Lỗi khi lưu trạng thái dữ liệu:", err);
  } finally {
    if (saveStateTimeout) {
      clearTimeout(saveStateTimeout);
      saveStateTimeout = null;
    }
  }
}

// Đảm bảo dữ liệu được lưu ngay lập tức trước khi tắt hoặc tải lại ứng dụng
window.addEventListener("beforeunload", () => {
  executeSaveState();
});

// Cập nhật các thông tin công ty lên giao diện
function updateCompanyUI() {
  document.getElementById("header-company-name").innerText = state.companyName || "Công Ty Cổ Phần Rạng Đông";
  document.getElementById("setting-company-name").value = state.companyName || "";
  document.getElementById("setting-tax-code").value = state.taxCode || "";
  document.getElementById("setting-address").value = state.address || "";

  const machineSuffixEl = document.getElementById("setting-machine-suffix");
  if (machineSuffixEl) {
    machineSuffixEl.value = machineSuffix || "";
  }

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
  state.companyName = document.getElementById("setting-company-name").value.trim() || "Công Ty Cổ Phần Rạng Đông";
  state.taxCode = document.getElementById("setting-tax-code").value.trim();
  state.address = document.getElementById("setting-address").value.trim() || "255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh";

  const machineSuffixEl = document.getElementById("setting-machine-suffix");
  if (machineSuffixEl) {
    const val = machineSuffixEl.value.trim().toUpperCase();
    if (val) {
      localStorage.setItem("rd_accounting_machine_suffix", val);
      machineSuffix = val;
    }
  }

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

  // Tối ưu hóa: Tạo map tra cứu O(1) thay vì dùng .find() trong vòng lặp O(N)
  const originalProductsMap = {};
  if (Array.isArray(originalProducts)) {
    originalProducts.forEach(o => {
      originalProductsMap[o.id] = o;
    });
  }

  // Đọc số lượng đầu kỳ của sản phẩm (nếu sản phẩm mới khai báo thì xem như tồn 0, đơn giá 0)
  state.products.forEach(p => {
    // Tìm thông số khởi tạo của sản phẩm này từ map tra cứu O(1)
    const orig = originalProductsMap[p.id];
    const initStock = orig ? orig.stock : (p.initialStock !== undefined ? p.initialStock : (p.stock || 0));
    const initCost = orig ? orig.avgCost : (p.initialCost !== undefined ? p.initialCost : (p.avgCost || 0));
    productBalanceMap[p.id] = {
      stock: initStock,
      avgCost: initCost,
      totalValue: initStock * initCost,
      lastPurchasePrice: p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : (p.excelRow && p.excelRow[20] !== undefined ? Number(p.excelRow[20]) : initCost)
    };
  });

  // BƯỚC B: Sắp xếp các chứng từ kế toán theo ngày hạch toán (Tối ưu hóa: So sánh chuỗi trực tiếp thay vì new Date())
  state.vouchers.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });

  // BƯỚC C: Duyệt qua từng chứng từ để tính giá vốn và tự động cập nhật Định khoản kép
  state.vouchers.forEach(v => {
    if (v.type === "purchase_order") {
      v.taxAmount = 0;
      v.totalAmount = v.items ? v.items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
      v.entries = [];
    } else if (v.type === "purchase") {
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
            p.avgCost = item.price;
            p.totalValue = p.stock * p.avgCost;
          }
          // Lưu đơn giá mua này làm đơn giá mua gần nhất
          p.lastPurchasePrice = item.price;
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
      p.lastPurchasePrice = finalVal.lastPurchasePrice;
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
    // Không reset form khi chuyển tab để bảo toàn dữ liệu nhập dở
  } else if (tabId === "sales") {
    // Không reset form khi chuyển tab để bảo toàn dữ liệu nhập dở
  } else if (tabId === "escrow") {
    // Không reset form khi chuyển tab để bảo toàn dữ liệu nhập dở
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

function renderDashboard() {
  const fromDate = document.getElementById("search-dashboard-from") ? document.getElementById("search-dashboard-from").value : "";
  const toDate = document.getElementById("search-dashboard-to") ? document.getElementById("search-dashboard-to").value : "";

  // Cập nhật nhãn kỳ báo cáo hiển thị
  const rangeDisplay = document.getElementById("dashboard-date-range-display");
  if (rangeDisplay) {
    if (fromDate && toDate) {
      rangeDisplay.innerText = `Kỳ báo cáo: ${fromDate.split("-").reverse().join("/")} - ${toDate.split("-").reverse().join("/")}`;
    } else if (fromDate) {
      rangeDisplay.innerText = `Kỳ báo cáo: Từ ngày ${fromDate.split("-").reverse().join("/")}`;
    } else if (toDate) {
      rangeDisplay.innerText = `Kỳ báo cáo: Đến ngày ${toDate.split("-").reverse().join("/")}`;
    } else {
      rangeDisplay.innerText = "Toàn bộ thời gian";
    }
  }

  // A. Tổng quỹ tiền: Dư nợ TK 111 + TK 112 (tính lũy kế đến toDate)
  const bal111 = getAccountBalance("111", toDate);
  const bal112 = getAccountBalance("112", toDate);
  document.getElementById("kpi-cash-value").innerText = formatVND(bal111 + bal112);

  // B. Tổng doanh thu kỳ này: Tổng Có phát sinh TK 511 (trong khoảng từ/đến ngày)
  let totalRevenue = 0;
  state.vouchers.forEach(v => {
    if (v.type === "sales") {
      if (fromDate && v.date < fromDate) return;
      if (toDate && v.date > toDate) return;
      v.items.forEach(item => {
        totalRevenue += item.amount;
      });
    }
  });
  document.getElementById("kpi-revenue-value").innerText = formatVND(totalRevenue);

  // C. Giá trị tồn kho: Tổng giá trị hàng hóa (lũy kế đến toDate)
  const totalInventoryVal = getInventoryValueAt(toDate);
  document.getElementById("kpi-inventory-value").innerText = formatVND(totalInventoryVal);

  const acctEscrowPay = state.accountingStandard === "TT200" ? "244" : "1386";
  const acctEscrowReceive = state.accountingStandard === "TT200" ? "344" : "3386";
  const bal244 = getAccountBalance(acctEscrowPay, toDate);
  const bal344 = getAccountBalance(acctEscrowReceive, toDate);

  const escrowValueEl = document.getElementById("kpi-escrow-value");
  if (escrowValueEl) {
    escrowValueEl.innerText = formatVND(bal244 + bal344);
  }

  // RENDER CẢNH BÁO TỒN KHO (TỒN ÂM & TỒN THẤP)
  renderDashboardStockAlerts();

  // RENDER HOẠT ĐỘNG GẦN ĐÂY
  renderRecentActivities();

  // RENDER CÔNG NỢ & ĐƠN HÀNG CHƯA TẤT TOÁN
  renderDashboardDebts();
}

function filterDashboard() {
  renderDashboard();
}

function clearDashboardDateFilter() {
  const fromEl = document.getElementById("search-dashboard-from");
  const toEl = document.getElementById("search-dashboard-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  renderDashboard();
}

function renderDashboardDebts() {
  const fromDate = document.getElementById("search-dashboard-from") ? document.getElementById("search-dashboard-from").value : "";
  const toDate = document.getElementById("search-dashboard-to") ? document.getElementById("search-dashboard-to").value : "";

  // 1. Render các đơn hàng chưa tất toán (đang nợ)
  const unsettledTbody = document.getElementById("dashboard-unsettled-orders");
  if (unsettledTbody) {
    unsettledTbody.innerHTML = "";

    const unsettled = [];

    // A. Thêm các hóa đơn bán hàng chưa tất toán
    let salesVouchers = state.vouchers.filter(v => v.type === "sales");
    if (fromDate) salesVouchers = salesVouchers.filter(v => v.date >= fromDate);
    if (toDate) salesVouchers = salesVouchers.filter(v => v.date <= toDate);

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
      if (fromDate && "2026-01-01" < fromDate) return;
      if (toDate && "2026-01-01" > toDate) return;
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
          <td style="text-align:right;" class="font-numeric">${formatVND(item.totalAmount).replace("đ", "")}</td>
          <td style="text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${formatVND(item.remainingDebt).replace("đ", "")}</td>
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
    const today = new Date("2026-05-25");

    // A. Thêm hóa đơn bán hàng chưa tất toán
    let salesVouchers = state.vouchers.filter(v => v.type === "sales");
    if (fromDate) salesVouchers = salesVouchers.filter(v => v.date >= fromDate);
    if (toDate) salesVouchers = salesVouchers.filter(v => v.date <= toDate);

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
      if (fromDate && "2026-01-01" < fromDate) return;
      if (toDate && "2026-01-01" > toDate) return;
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
          <td style="text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${formatVND(item.remainingDebt).replace("đ", "")}</td>
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
    const calculatedDebts = calculatePartnerDebts(toDate);
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

function renderDashboardStockAlerts() {
  const tbody = document.getElementById("dashboard-stock-alerts");
  if (!tbody) return;

  const alerts = state.products.filter(p => p.stock < 0 || p.stock < (p.minStock || 0));

  alerts.sort((a, b) => {
    const aIsNegative = a.stock < 0;
    const bIsNegative = b.stock < 0;
    if (aIsNegative && !bIsNegative) return -1;
    if (!aIsNegative && bIsNegative) return 1;
    return a.stock - b.stock;
  });

  if (alerts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-success); padding: 30px; font-weight: 600;">✅ Tất cả hàng hóa đều trong giới hạn tồn an toàn.</td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(p => {
    const isNegative = p.stock < 0;
    const minStock = p.minStock || 0;
    const badgeClass = isNegative ? "badge-danger" : "badge-warning";
    const badgeText = isNegative ? "Tồn âm" : "Tồn thấp";
    const stockStyle = isNegative ? "color: var(--color-danger); font-weight: 800;" : "color: var(--color-warning); font-weight: 700;";
    
    return `
      <tr>
        <td class="font-numeric" style="color: var(--color-primary); font-weight:700;">${p.id}</td>
        <td style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${escapeHtmlAttr(p.name)}">${p.name}</td>
        <td class="text-right font-numeric" style="${stockStyle}">${p.stock}</td>
        <td class="text-right font-numeric" style="color: var(--text-secondary);">${minStock}</td>
        <td style="text-align: center;">
          <span class="badge ${badgeClass}">${badgeText}</span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderRecentActivities() {
  const container = document.getElementById("dashboard-recent-activities");
  if (!container) return;

  const fromDate = document.getElementById("search-dashboard-from") ? document.getElementById("search-dashboard-from").value : "";
  const toDate = document.getElementById("search-dashboard-to") ? document.getElementById("search-dashboard-to").value : "";

  // Lấy tối đa 6 giao dịch gần nhất
  let recents = [...state.vouchers];
  if (fromDate) recents = recents.filter(v => v.date >= fromDate);
  if (toDate) recents = recents.filter(v => v.date <= toDate);
  recents = recents.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  if (recents.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">Không có giao dịch gần đây trong khoảng thời gian này.</div>`;
    return;
  }

  const badgeLabels = {
    purchase: "Mua hàng",
    purchase_order: "Đơn đặt hàng",
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
          <span class="badge ${v.type === 'sales' ? 'badge-success' : v.type === 'purchase' ? 'badge-info' : v.type === 'purchase_order' ? 'badge-warning' : 'badge-secondary'}" style="font-size:9px; padding:2px 6px;">
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

  let purchases = state.vouchers.filter(v => v.type === "purchase");

  // Advanced search filters
  const query = document.getElementById("search-purchase") ? document.getElementById("search-purchase").value : "";
  const fromDate = document.getElementById("search-purchase-from") ? document.getElementById("search-purchase-from").value : "";
  const toDate = document.getElementById("search-purchase-to") ? document.getElementById("search-purchase-to").value : "";

  if (query) {
    purchases = purchases.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    purchases = purchases.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    purchases = purchases.filter(v => v.date <= toDate);
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

  // Render các nút chuyển trang động
  const paginationControls = document.getElementById("purchase-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePurchasePage(1)" ${purchaseCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changePurchasePage(${purchaseCurrentPage - 1})" ${purchaseCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, purchaseCurrentPage - 2);
      let endPage = Math.min(totalPages, purchaseCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === purchaseCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changePurchasePage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === purchaseCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePurchasePage(${purchaseCurrentPage + 1})" ${purchaseCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changePurchasePage(${totalPages})" ${purchaseCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} đơn mua hàng
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedPurchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy hóa đơn mua hàng nào phù hợp.</td></tr>`;
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
  const fromEl = document.getElementById("search-purchase-from");
  const toEl = document.getElementById("search-purchase-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  filterPurchaseTable();
}

function changePurchasePage(p) {
  purchaseCurrentPage = p;
  renderPurchaseTable();
}

let salesCurrentPage = 1;
let purchaseCurrentPage = 1;
let purchaseOrderCurrentPage = 1;
let inventoryCurrentPage = 1;
let escrowCurrentPage = 1;

// 7. RENDER DỮ LIỆU PHÂN HỆ BÁN HÀNG (SALES)
function renderSalesTable() {
  const tbody = document.getElementById("sales-table-body");
  if (!tbody) return;

  let sales = state.vouchers.filter(v => v.type === "sales");

  // Advanced search filters
  const query = document.getElementById("search-sales") ? document.getElementById("search-sales").value : "";
  const fromDate = document.getElementById("search-sales-from") ? document.getElementById("search-sales-from").value : "";
  const toDate = document.getElementById("search-sales-to") ? document.getElementById("search-sales-to").value : "";

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
      (p.id || "").toLowerCase().includes(query) ||
      (p.name || "").toLowerCase().includes(query)
    );
  }

  if (products.length === 0) {
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">Không tìm thấy sản phẩm</div>`;
    return;
  }

  // Đảm bảo selectedLedgerProductId luôn hợp lệ
  if (!selectedLedgerProductId || !state.products.some(p => p.id === selectedLedgerProductId)) {
    selectedLedgerProductId = products[0].id;
  }

  const html = products.map(p => {
    const isActive = p.id === selectedLedgerProductId;
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

  const prod = state.products.find(p => p.id === prodId);
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
    if (v.type !== "purchase" && v.type !== "sales") return false;
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
    const prod = state.products.find(p => p.id === prodId);
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
      if (v.type !== "purchase" && v.type !== "sales") return false;
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
      sc(rowIdx, 2, v.description || (v.type === 'purchase' ? 'Nhập kho mua hàng' : 'Xuất kho bán hàng'), 's', bs(cL, bg));

      if (v.type === "purchase") {
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

// 9. RENDER DỮ LIỆU PHÂN HỆ KÝ QUỸ (ESCROW)
function renderEscrowTable() {
  const tbody = document.getElementById("escrow-table-body");
  if (!tbody) return;

  let escrows = state.vouchers.filter(v => v.type.startsWith("escrow_"));

  // Advanced search filters
  const query = document.getElementById("search-escrow") ? document.getElementById("search-escrow").value : "";
  const fromDate = document.getElementById("search-escrow-from") ? document.getElementById("search-escrow-from").value : "";
  const toDate = document.getElementById("search-escrow-to") ? document.getElementById("search-escrow-to").value : "";

  if (query) {
    escrows = escrows.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.amount);
    });
  }

  if (fromDate) {
    escrows = escrows.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    escrows = escrows.filter(v => v.date <= toDate);
  }

  // Sắp xếp số chứng từ giảm dần (to nhất lên trước)
  escrows.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCount = escrows.length;
  const totalPages = Math.ceil(totalCount / 30) || 1;

  if (escrowCurrentPage > totalPages) escrowCurrentPage = totalPages;
  if (escrowCurrentPage < 1) escrowCurrentPage = 1;

  const startIdx = (escrowCurrentPage - 1) * 30;
  const displayedEscrows = escrows.slice(startIdx, startIdx + 30);

  // Update pagination info header
  const countEl = document.getElementById("escrow-pagination-info");
  if (countEl) {
    countEl.innerText = `Hiển thị chứng từ từ ${totalCount > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + 30, totalCount)} trong số ${totalCount} chứng từ (Trang ${escrowCurrentPage}/${totalPages})`;
  }

  // Reset check-all-escrow checkbox
  const checkAll = document.getElementById("check-all-escrow");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchEscrowsUI === "function") updateBatchEscrowsUI();

  // Render pagination controls
  const paginationControls = document.getElementById("escrow-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(1)" ${escrowCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(${escrowCurrentPage - 1})" ${escrowCurrentPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, escrowCurrentPage - 2);
      let endPage = Math.min(totalPages, escrowCurrentPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === escrowCurrentPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeEscrowPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === escrowCurrentPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(${escrowCurrentPage + 1})" ${escrowCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeEscrowPage(${totalPages})" ${escrowCurrentPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(startIdx + 30, totalCount)} của ${totalCount} chứng từ
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }

  if (displayedEscrows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy chứng từ ký quỹ nào phù hợp.</td></tr>`;
    return;
  }

  const typeLabels = {
    escrow_pay: { name: "Chi ký quỹ đi (Tài sản)", class: "badge-info", acct: state.accountingStandard === "TT200" ? "244" : "1386" },
    escrow_receive: { name: "Nhận ký quỹ về (Nợ phải trả)", class: "badge-success", acct: state.accountingStandard === "TT200" ? "344" : "3386" },
    escrow_refund_pay: { name: "Tất toán ký quỹ đi", class: "badge-warning", acct: state.accountingStandard === "TT200" ? "244" : "1386" },
    escrow_refund_receive: { name: "Tất toán nhận ký quỹ", class: "badge-warning", acct: state.accountingStandard === "TT200" ? "344" : "3386" }
  };

  tbody.innerHTML = displayedEscrows.map(v => {
    const lbl = typeLabels[v.type] || { name: "Ký quỹ", class: "badge-info", acct: "" };
    const isRefund = v.type.includes("refund");
    return `
      <tr class="clickable-row" data-type="voucher" data-subtype="${v.type}" data-id="${escapeHtmlAttr(v.id)}">
        <td style="text-align: center;">
          <input type="checkbox" class="escrow-checkbox" value="${escapeHtmlAttr(v.id)}" onchange="updateBatchEscrowsUI()">
        </td>
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
            <button class="btn btn-secondary btn-sm" onclick="viewVoucher('${escapeHtmlAttr(v.id)}')" style="height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0 8px;">Xem/In</button>
            <button class="trash-btn" onclick="deleteVoucher('${escapeHtmlAttr(v.id)}')" title="Xóa chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
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
  escrowCurrentPage = 1;
  renderEscrowTable();
}

function clearEscrowDateFilter() {
  const fromEl = document.getElementById("search-escrow-from");
  const toEl = document.getElementById("search-escrow-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  filterEscrowTable();
}

function changeEscrowPage(p) {
  escrowCurrentPage = p;
  renderEscrowTable();
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
      <input type="text" class="form-control item-qty text-right number-format" required value="${qtyVal}" oninput="recalculatePurchaseTotals()">
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
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
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

  const paymentMethod = document.getElementById("pur-payment").value;
  const newVoucher = {
    id: editingPurchaseId || generateNextPurchaseVoucherId(paymentMethod),
    type: "purchase",
    date: document.getElementById("pur-date").value,
    partnerId,
    partnerName,
    paymentMethod,
    description: document.getElementById("pur-desc").value,
    items: voucherItems,
    taxRate: 0,
    taxAmount: 0
  };

  if (editingPurchaseId) {
    const idx = state.vouchers.findIndex(v => v.id === editingPurchaseId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    }
    editingPurchaseId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  saveState();
  recalculateAccounting();

  closeModal("modal-add-purchase");
  showToast(editingPurchaseId ? "Cập nhật chứng từ mua hàng thành công!" : "Lập chứng từ mua hàng thành công!", "success");
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

let editingPurchaseId = null;
let editingPurchaseOrderId = null;
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
  // Auto-focus vào ô “Khách hàng mua” — trường quan trọng nhất khi mở form
  setTimeout(() => {
    const el = document.getElementById("sale-partner");
    if (el) { el.focus(); el.select && el.select(); }
  }, 60);
}

function generateNextPurchaseVoucherId(paymentMethod) {
  const currentYear = new Date().getFullYear().toString().substring(2);
  const prefix = `MH-${currentYear}-`;
  // Cho phép ký hiệu máy trạm tùy chọn ở cuối, ví dụ: MH-26-0001-A
  const regex = new RegExp(`^MH-${currentYear}-(\\d+)(?:-[A-Z0-9]+)?$`);
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

  return `${prefix}${(maxNum + 1).toString().padStart(4, '0')}-${machineSuffix}`;
}

function generateNextSalesVoucherId(paymentMethod) {
  const isCredit = (paymentMethod === "131");
  const prefix = isCredit ? "BH" : "PT";

  // Tìm tất cả các chứng từ có ID khớp với tiền tố + số + ký hiệu máy tùy chọn
  const regex = new RegExp(`^${prefix}(\\d+)(?:-[A-Z0-9]+)?$`);
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

  return `${prefix}${maxNum + 1}-${machineSuffix}`;
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
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
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
      showToast(`Cảnh báo: Hàng tồn kho sản phẩm "${resolvedProduct.name}" bị âm (Còn tồn ${resolvedProduct.stock + oldQty}, bán ${qty})!`, "warning");
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

function editPurchaseVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseId = id;

  const modalTitle = document.querySelector("#modal-add-purchase .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa chứng từ mua hàng: ${id}`;

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
    const prod = state.products.find(p => p.id === item.productId);
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    addPurchaseFormRow(prodVal, item.qty, item.price, item.discount || 0);
  });

  openModal("modal-add-purchase");
}

let quickAddPartnerType = "customer";

function openQuickAddPartnerModal(type = "customer") {
  quickAddPartnerType = type;
  const modalTitle = document.querySelector("#modal-quick-add-partner .card-title");
  if (modalTitle) {
    modalTitle.innerHTML = type === "customer"
      ? `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Thêm nhanh Khách hàng mới`
      : `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Thêm nhanh Nhà cung cấp mới`;
  }
  const labelName = document.getElementById("quick-partner-label-name");
  if (labelName) {
    labelName.innerHTML = type === "customer"
      ? `Tên khách hàng <span style="color:var(--color-danger)">*</span>`
      : `Tên nhà cung cấp <span style="color:var(--color-danger)">*</span>`;
  }

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

  const isSupplier = (quickAddPartnerType === "supplier");
  const typeLabel = isSupplier ? "nhà cung cấp" : "khách hàng";
  const typeNameCap = isSupplier ? "Nhà cung cấp" : "Khách hàng";

  if (!name) {
    showToast(`Vui lòng nhập tên ${typeLabel}!`, "danger");
    return;
  }

  let partner = state.partners.find(p => p.name.toLowerCase() === name.toLowerCase());

  if (!partner) {
    const nextNum = (state.partners.filter(p => p.type === (isSupplier ? "supplier" : "customer")).length + 1).toString().padStart(3, '0');
    const id = isSupplier ? `NCC${nextNum}` : `KH${nextNum}`;

    partner = {
      id,
      name,
      type: isSupplier ? "supplier" : "customer",
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

    showToast(`Đã thêm thành công ${typeLabel} "${name}" với mã ${id}!`, "success");
  } else {
    showToast(`${typeNameCap} "${name}" đã tồn tại trên hệ thống!`, "info");
  }

  const inputEl = document.getElementById(isSupplier ? "pur-partner" : "sale-partner");
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
  const initialStock = parseInt(document.getElementById("prod-stock").value.replace(/\D/g, "")) || 0;
  const initialCost = parseInt(document.getElementById("prod-cost").value.replace(/\D/g, "")) || 0;
  const salePrice1 = parseInt(document.getElementById("prod-sale-price").value.replace(/\D/g, "")) || 0;
  const minStock = parseInt(document.getElementById("prod-min-stock").value.replace(/\D/g, "")) || 0;

  const nature = document.getElementById("prod-nature").value;
  const group = document.getElementById("prod-group").value.trim();
  const inactive = document.getElementById("prod-inactive").checked;

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
    document.getElementById("esc-amount").value = Number(10000000).toLocaleString("vi-VN");
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
    document.getElementById("esc-amount").value = Number(originVoucher.amount || 0).toLocaleString("vi-VN");
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
    id: `KQ-${new Date().getFullYear().toString().substring(2)}-${(state.vouchers.filter(v => v.type.startsWith('escrow_')).length + 1).toString().padStart(4, '0')}-${machineSuffix}`,
    type,
    date: document.getElementById("esc-date").value,
    partnerId,
    partnerName,
    paymentMethod: document.getElementById("esc-payment-method").value,
    amount: parseInt(document.getElementById("esc-amount").value.replace(/\D/g, "")) || 0,
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
    const targetVoucher = state.vouchers.find(v => v.id === id);
    const isPO = targetVoucher && targetVoucher.type === "purchase_order";

    trackDeletedIds([id]);
    state.vouchers = state.vouchers.filter(v => v.id !== id);

    // Nếu có các khoản tất toán gắn liền với nó, xóa liên kết hoặc cảnh báo
    // Để an toàn, xóa các khoản tham chiếu
    state.vouchers.forEach(v => {
      if (v.escrowRefId === id) {
        v.escrowRefId = null;
      }
    });

    saveState();
    if (isPO) {
      if (typeof executeSaveState === "function") {
        executeSaveState();
      }
      if (cloudSyncActive && firebaseDb) {
        showToast("⚡ Đã tự động sao lưu và đồng bộ lên đám mây!", "success");
      }
    }
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

// Tìm hóa đơn bán hàng liên quan cho chứng từ phiếu thu/chi
function findRelatedSalesVoucher(voucherId, description, partnerId, amount) {
  const v = state.vouchers.find(x => x.id === voucherId);
  if (!v) return null;

  // 1. Tìm theo số chứng từ bán hàng trong diễn giải (ví dụ: BH39244, BH-25-0001, v.v.)
  const descStr = (description || v.description || "").toString();
  const bhMatch = descStr.match(/BH-?\d+/i);
  if (bhMatch) {
    const matchedId = bhMatch[0].toUpperCase().replace("-", ""); // Chuẩn hóa mã
    const relatedSales = state.vouchers.find(x => x.type === "sales" && x.id.toUpperCase().replace("-", "") === matchedId);
    if (relatedSales) return relatedSales;
  }

  // 2. Thử tìm bằng các số dài >= 3 trong diễn giải khớp với mã hóa đơn bán hàng
  const numMatches = descStr.match(/\d+/g);
  if (numMatches) {
    for (const num of numMatches) {
      if (num.length >= 3) {
        const relatedSales = state.vouchers.find(x => x.type === "sales" && x.id.includes(num));
        if (relatedSales) return relatedSales;
      }
    }
  }

  // 3. Tìm hóa đơn bán hàng gần nhất của đối tác này có cùng số tiền
  const amt = amount || v.amount || 0;
  if (amt > 0) {
    const relatedSales = state.vouchers.find(x => x.type === "sales" && x.partnerId === partnerId && Math.abs(x.totalAmount - amt) < 100);
    if (relatedSales) return relatedSales;
  }

  return null;
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
              const prod = state.products.find(p => p.id === item.productId) || { name: "Sản phẩm" };
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
        
        <div class="voucher-signatures">
          <div class="sig-block">
            <span class="sig-title">Người lập đơn</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Kế toán viên</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Đại diện bộ phận nhận</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">Người duyệt đơn</span>
          </div>
          <div class="sig-block">
            <span class="sig-title">Đại diện NCC</span><br>
            <span class="sig-subtext">(Ký, họ tên)</span>
            <div class="sig-space"></div>
            <span class="sig-name">${partnerName.split(" ").slice(-2).join(" ")}</span>
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
      const prod = state.products.find(p => p.id === item.productId) || { name: "Sản phẩm" };
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
        
        <!-- Header: Logo Rạng Đông bên trái & Thông tin công ty ở giữa (Cân đối hoàn hảo) -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 15px;">
          <!-- Logo Rạng Đông thực tế từ file logo.jpg -->
          <div style="display: flex; align-items: center; justify-content: center; width: 140px; flex-shrink: 0;">
            <img src="logo.jpg" style="max-height: 55px; max-width: 130px; object-fit: contain;" alt="Logo Rạng Đông" />
          </div>

          <!-- Thông tin công ty chính xác theo mẫu giấy -->
          <div style="text-align: center; flex-grow: 1; color: #000; padding: 0 10px;">
            <div style="font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 0.2px;">CÔNG TY CỔ PHẦN RẠNG ĐÔNG</div>
            <div style="font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 2px;">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY</div>
            <div style="font-size: 11px; margin-top: 3px;">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
            <div style="font-size: 11px; margin-top: 1px; font-weight: 500;">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
          </div>

          <!-- Khoảng trống đối trọng bên phải để căn giữa tuyệt đối -->
          <div style="width: 140px; flex-shrink: 0;"></div>
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
            <strong>Ngày:</strong> ${v.date.substring(8, 10)}/${v.date.substring(5, 7)}/${v.date.substring(0, 4)}
          </div>
          
          <div>
            <strong>Điện thoại:</strong> <span>${(getPartnerForVoucher(v) || {}).phone || "-"}</span>
          </div>
          <div style="text-align: right;">
            <strong>Số:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 14px;">${v.id}</span>
          </div>

          <div style="grid-column: span 2;">
            <strong>Địa chỉ:</strong> <span>${(getPartnerForVoucher(v) || {}).address || "-"}</span>
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
                  <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;" class="font-numeric">${formatVND(item.price).replace("đ", "").trim()}</td>
                  <td style="border: 1px solid #000; padding: 6px 6px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(item.amount).replace("đ", "").trim()}</td>
                  <td style="border: 1px solid #000; padding: 6px 4px; text-align: center;">${gcVal}</td>
                </tr>
              `;
    }).join("")}
            
            <!-- Phần tổng tiền -->
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 5px 10px; text-align: right; font-weight: bold; border-top: 1.5px solid #000;">Cộng tiền hàng :</td>
              <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(grossTotal).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000; border-top: 1.5px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border: 1px solid #000; padding: 5px 10px; text-align: right; font-weight: 500;">Số tiền chiết khấu:</td>
              <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: 500;" class="font-numeric">${formatVND(totalDiscount).replace("đ", "").trim()}</td>
              <td style="border: 1px solid #000;"></td>
            </tr>
            <tr style="background-color: #f9fafb;">
              <td colspan="5" style="border: 1px solid #000; padding: 6px 10px; text-align: right; font-weight: bold; text-transform: uppercase;">Tổng tiền thanh toán:</td>
              <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: bold;" class="font-numeric">${formatVND(v.totalAmount).replace("đ", "").trim()}</td>
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
          
          <div style="width: 30%;">
            <strong>Người lập phiếu</strong><br>
            <span style="font-style: italic; font-size: 11px; color: #555;">(Ký, họ tên)</span>
            <div style="height: 65px;"></div>
            <div style="border-top: 1px dotted #888; width: 80%; margin: 0 auto; padding-top: 4px; color: #555; font-size: 11px;">Nhân viên lập phiếu</div>
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
function getAccountBalance(acctCode, toDate = "") {
  const initBalObj = (state.initialBalances && state.initialBalances[acctCode]) || { type: "debit", balance: 0 };
  let bal = initBalObj.balance;
  const isDebit = initBalObj.type === "debit";

  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (toDate && v.date > toDate) return;
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

// Tìm đối tác an toàn từ chứng từ để lấy thông tin liên hệ sđt, địa chỉ
function getPartnerForVoucher(v) {
  if (!v) return null;
  let p = null;

  // 1. Tìm theo ID trước
  if (v.partnerId) {
    p = state.partners.find(x => x.id === v.partnerId);
  }

  // 2. Tìm theo tên nếu tìm theo ID thất bại hoặc nếu partnerId chính là tên đối tác
  if (!p && v.partnerName) {
    const nameLower = v.partnerName.trim().toLowerCase();
    p = state.partners.find(x => x.name.trim().toLowerCase() === nameLower);
  }

  if (!p && v.partnerId) {
    const idLower = v.partnerId.trim().toLowerCase();
    p = state.partners.find(x => x.name.trim().toLowerCase() === idLower);
  }

  return p;
}

// Lấy tên đối tác mới nhất một cách động dựa trên partnerId để liên kết CSDL
function getPartnerNameForVoucher(v) {
  const p = getPartnerForVoucher(v);
  if (p) return p.name;
  return (v && v.partnerName) ? v.partnerName : "Khách hàng vãng lai";
}
// Phân tích chuỗi số định dạng tiền tệ Việt Nam thành Number
function parseFormattedNumber(str) {
  if (!str) return 0;
  // Loại bỏ tất cả dấu chấm (.) dùng để phân tách hàng nghìn
  // Thay thế dấu phẩy (,) thành dấu chấm (.) để chuyển sang dấu thập phân chuẩn JS
  let cleaned = str.replace(/\./g, '').replace(/,/g, '.');
  // Giữ lại các ký tự số, dấu trừ và dấu chấm thập phân
  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// Loại bỏ dấu tiếng Việt và chuẩn hóa ký tự để tìm kiếm không dấu
function removeAccents(str) {
  if (!str) return "";
  return str.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Bộ lọc nâng cao (Advanced Filter) cho ô tìm kiếm
// Hỗ trợ: Không dấu, tìm kiếm AND đa từ khóa, tìm kiếm phủ định, tìm kiếm OR và lọc khoảng số
function matchAdvancedQuery(targetText, queryText, numericValue = null) {
  if (!queryText) return true;
  if (!targetText) targetText = "";

  const cleanTarget = removeAccents(targetText.toLowerCase());
  const cleanQuery = removeAccents(queryText.toLowerCase().trim());

  // 1. Lọc khoảng số (Ví dụ: >100k, <5M, 100k-500k)
  if (numericValue !== null && typeof numericValue === "number") {
    // Kiểu so sánh: >100k, <5M, =500
    const numberMatch = cleanQuery.match(/^([><=]=?)\s*([0-9.]+)([kmM]?)$/);
    if (numberMatch) {
      const op = numberMatch[1];
      let val = parseFloat(numberMatch[2]);
      const unit = numberMatch[3].toLowerCase();
      if (unit === 'k') val *= 1000;
      else if (unit === 'm') val *= 1000000;

      if (op === '>') return numericValue > val;
      if (op === '>=') return numericValue >= val;
      if (op === '<') return numericValue < val;
      if (op === '<=') return numericValue <= val;
      if (op === '=' || op === '==') return numericValue === val;
    }

    // Kiểu khoảng: 100k-500k
    const rangeMatch = cleanQuery.match(/^([0-9.]+)([kmM]?)-([0-9.]+)([kmM]?)$/);
    if (rangeMatch) {
      let minVal = parseFloat(rangeMatch[1]);
      const minUnit = rangeMatch[2].toLowerCase();
      if (minUnit === 'k') minVal *= 1000;
      else if (minUnit === 'm') minVal *= 1000000;

      let maxVal = parseFloat(rangeMatch[3]);
      const maxUnit = rangeMatch[4].toLowerCase();
      if (maxUnit === 'k') maxVal *= 1000;
      else if (maxUnit === 'm') maxVal *= 1000000;

      return numericValue >= minVal && numericValue <= maxVal;
    }
  }

  // 2. Tìm kiếm OR (Sử dụng dấu phẩy hoặc dấu gạch đứng '|')
  if (cleanQuery.includes("|") || cleanQuery.includes(",")) {
    const parts = cleanQuery.split(/[|,]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts.some(part => cleanTarget.includes(part));
    }
  }

  // 3. Tìm kiếm phủ định (Không chứa từ khóa bằng dấu '-') & Tìm kiếm AND đa từ khóa
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  let match = true;
  for (const token of tokens) {
    if (token.startsWith("-") && token.length > 1) {
      const excludeToken = token.substring(1);
      if (cleanTarget.includes(excludeToken)) {
        return false;
      }
    } else {
      if (!cleanTarget.includes(token)) {
        match = false;
      }
    }
  }
  return match;
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

// Sao lưu thủ công ngay lập tức vào thư mục backup/ (chỉ hoạt động trong Electron)
async function manualBackupNow() {
  if (window.electronAPI && window.electronAPI.saveBackupOnExit) {
    try {
      const jsonData = localStorage.getItem("rd_accounting_db") || JSON.stringify(state);
      const result = await window.electronAPI.saveBackupOnExit(jsonData);
      if (result && result.ok) {
        const fileName = result.path ? result.path.split(/[/\\]/).pop() : "";
        showToast(`Đã sao lưu thành công${fileName ? ": " + fileName : ""}`, "success");
      } else {
        showToast("Sao lưu thất bại: " + (result && result.error ? result.error : "Lỗi không rõ"), "danger");
      }
    } catch (err) {
      showToast("Lỗi khi sao lưu: " + err.message, "danger");
    }
  } else {
    // Fallback: tải file qua trình duyệt nếu không chạy trong Electron
    exportData();
  }
}

// Mở thư mục backup trong File Explorer (chỉ hoạt động trong Electron)
async function openBackupFolder() {
  if (window.electronAPI && window.electronAPI.getBackupDir) {
    try {
      const dir = await window.electronAPI.getBackupDir();
      if (window.electronAPI.openExternalUrl) {
        await window.electronAPI.openExternalUrl("file://" + dir.replace(/\\/g, '/'));
      }
    } catch (err) {
      showToast("Không thể mở thư mục backup: " + err.message, "danger");
    }
  } else {
    showToast("Tính năng này chỉ khả dụng trong ứng dụng Desktop.", "info");
  }
}

/**
 * Gọi từ main.js khi cửa sổ sắp đóng.
 * Đảm bảo dữ liệu được lưu localStorage VÀ đẩy lên Cloud (nếu kết nối).
 * Trả về Promise — main.js sẽ chờ resolve rồi mới destroy cửa sổ.
 */
async function autoSaveBeforeClose() {
  try {
    // 1. Lưu state mới nhất xuống localStorage
    saveState();

    // 2. Nếu Cloud đang kết nối → đẩy ngay lên Cloud và chờ
    if (cloudSyncActive && firebaseDb) {
      // Cập nhật timestamp để cloud nhận biết đây là bản mới nhất
      state._lastModified = Date.now();
      saveState();
      await pushToCloud();
      console.log("[AutoSave] Đã đẩy dữ liệu lên Cloud trước khi đóng.");
    } else {
      console.log("[AutoSave] Cloud không kết nối, chỉ lưu cục bộ.");
    }
  } catch (err) {
    console.error("[AutoSave] Lỗi khi lưu trước khi đóng:", err);
  }
}

// Nhập dữ liệu kế toán từ file JSON ngoài
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
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

  const total = filteredPartnersList.length;
  const totalPages = Math.ceil(total / itemsPerPage) || 1;

  if (partnersPage > totalPages) partnersPage = totalPages;
  if (partnersPage < 1) partnersPage = 1;

  const startIdx = (partnersPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredPartnersList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy đối tác nào</td></tr>`;
  } else {
    pageItems.forEach(p => {
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(p.id);
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "partner");
      tr.setAttribute("data-id", escapedId);
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="partner-checkbox" value="${escapedId}" onchange="updateBatchPartnersUI()">
        </td>
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

  const paginationInfo = document.getElementById("partners-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} đối tác (Trang ${partnersPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  // Reset check-all-partners checkbox
  const checkAll = document.getElementById("check-all-partners");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchPartnersUI === "function") updateBatchPartnersUI();

  // Render pagination controls
  const paginationControls = document.getElementById("partners-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(1)" ${partnersPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(${partnersPage - 1})" ${partnersPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, partnersPage - 2);
      let endPage = Math.min(totalPages, partnersPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === partnersPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changePartnersPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === partnersPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(${partnersPage + 1})" ${partnersPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changePartnersPage(${totalPages})" ${partnersPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} của ${total} đối tác
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }
}

function changePartnersPage(p) {
  partnersPage = p;
  renderPartnersTable();
}

function filterPartners() {
  const query = document.getElementById("partner-search-input") ? document.getElementById("partner-search-input").value : "";
  const filterType = document.getElementById("partner-type-filter") ? document.getElementById("partner-type-filter").value : "all";

  filteredPartnersList = state.partners.filter(p => {
    const combined = `${p.id || ""} ${p.name || ""} ${p.phone || ""} ${p.address || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query);
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
  document.getElementById("partner-id").disabled = false; // Mở khóa mã đối tác cho phép chỉnh sửa
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
      const newId = idVal.toUpperCase();
      if (newId !== editIndex && state.partners.some(p => p.id === newId)) {
        showToast(`Mã đối tác "${newId}" đã tồn tại!`, "danger");
        return;
      }

      // Cập nhật tất cả các tham chiếu liên quan nếu Mã đối tác bị thay đổi
      if (newId !== editIndex) {
        state.vouchers.forEach(v => {
          if (v.partnerId === editIndex) {
            v.partnerId = newId;
            v.partnerName = name;
          }
        });
        if (state.partnerOpeningBalances && state.partnerOpeningBalances[editIndex]) {
          state.partnerOpeningBalances[newId] = state.partnerOpeningBalances[editIndex];
          delete state.partnerOpeningBalances[editIndex];
        }
      }

      state.partners[idx] = { id: newId, name, type, phone, email: "", address, taxCode, inactive };
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
    trackDeletedIds([id]);
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

async function exportExcelWithTemplate(templatePath, outputName, list, mapper, fallbackHeaders, fallbackMapper, headerRowCount = 2) {
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
      workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellStyles: true });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A2');
      const maxCol = range.e.c;

      const colStyles = {};
      const sampleRow = headerRowCount;
      for (let c = range.s.c; c <= maxCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: sampleRow, c: c });
        const cell = sheet[cellRef];
        if (cell && cell.s) colStyles[c] = convertStyle(cell.s);
        if (cell && cell.z) colStyles[c + '_z'] = cell.z;
      }

      for (const key in sheet) {
        if (key[0] === '!') continue;
        const cellCoord = XLSX.utils.decode_cell(key);
        if (cellCoord.r < headerRowCount) {
          if (sheet[key] && sheet[key].s) sheet[key].s = convertStyle(sheet[key].s);
        } else {
          delete sheet[key];
        }
      }

      list.forEach((item, idx) => {
        const r = idx + headerRowCount;
        const newRow = new Array(maxCol + 1).fill("");
        mapper(item, newRow, idx);

        for (let c = 0; c <= maxCol; c++) {
          const val = newRow[c];
          if (val !== undefined && val !== null && val !== "") {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
            const cell = { v: val };
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) && colStyles[c + '_z'] && colStyles[c + '_z'].toLowerCase().includes('d')) {
              const d = new Date(val);
              if (!isNaN(d.getTime())) {
                cell.v = dateToExcelSerial(d);
                cell.t = 'n';
              } else {
                cell.t = 's';
              }
            } else if (typeof val === 'number') {
              cell.t = 'n';
            } else if (typeof val === 'boolean') {
              cell.t = 'b';
            } else {
              cell.t = 's';
            }
            if (colStyles[c]) cell.s = colStyles[c];
            if (colStyles[c + '_z']) cell.z = colStyles[c + '_z'];
            sheet[cellRef] = cell;
          }
        }
      });

      range.e.r = Math.max(headerRowCount - 1, list.length + headerRowCount - 1);
      sheet['!ref'] = XLSX.utils.encode_range(range);
      newSheet = sheet;
    } catch (fetchErr) {
      console.warn("Fallback excel generation", fetchErr);
      workbook = XLSX.utils.book_new();
      sheetName = "Sheet1";
      const rows = JSON.parse(JSON.stringify(fallbackHeaders));
      list.forEach((item, idx) => {
        const newRow = new Array(fallbackHeaders[0].length).fill("");
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
    showToast(`Lỗi xuất Excel: ${err.message}`, "danger");
  }
}

function dateToExcelSerial(date) {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
}

function dateStrToSerial(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return "";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : dateToExcelSerial(d);
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

function cleanNumericUnitProducts() {
  if (!state || !state.products) return;
  const originalLength = state.products.length;

  // Lọc bỏ các sản phẩm có đơn vị tính là số (ví dụ "16500", "6600")
  state.products = state.products.filter(p => {
    if (!p.unit) return true;
    const unitStr = String(p.unit).trim();
    if (unitStr === "") return true;

    // Nếu đơn vị tính chỉ toàn chữ số (hoặc số thập phân), ta coi là số và xóa bỏ
    const isNumeric = !isNaN(Number(unitStr));
    return !isNumeric;
  });

  if (state.products.length !== originalLength) {
    console.log(`[Database Cleanup] Đã xóa ${originalLength - state.products.length} sản phẩm lỗi có đơn vị tính là số.`);
    saveState();
  }
}



function getVNAccountingAccounts(nature) {
  const nat = (nature || "").trim();
  let defaultWarehouse = "";
  let warehouseAccount = "";
  let cogsAccount = "";
  let revenueAccount = "";
  let discountAccount = "5211";
  let rebateAccount = "5212";
  let returnAccount = "5213";

  if (nat === "Vật tư hàng hóa" || nat === "Hàng hóa") {
    defaultWarehouse = "1561";
    warehouseAccount = "1561";
    cogsAccount = "632";
    revenueAccount = "51111";
  } else if (nat === "Nguyên vật liệu") {
    defaultWarehouse = "152";
    warehouseAccount = "152";
    cogsAccount = "632";
    revenueAccount = "51111";
  } else if (nat === "Công cụ dụng cụ") {
    defaultWarehouse = "153";
    warehouseAccount = "153";
    cogsAccount = "632";
    revenueAccount = "51111";
  } else if (nat === "Thành phẩm" || nat === "Bán thành phẩm") {
    defaultWarehouse = "155";
    warehouseAccount = "155";
    cogsAccount = "632";
    revenueAccount = "5112";
  } else if (nat === "Dịch vụ") {
    defaultWarehouse = "";
    warehouseAccount = "";
    cogsAccount = "632";
    revenueAccount = "5113";
  } else {
    // Chỉ là diễn giải hoặc mặc định
    defaultWarehouse = "";
    warehouseAccount = "";
    cogsAccount = "";
    revenueAccount = "";
    discountAccount = "";
    rebateAccount = "";
    returnAccount = "";
  }

  return {
    defaultWarehouse,
    warehouseAccount,
    cogsAccount,
    revenueAccount,
    discountAccount,
    rebateAccount,
    returnAccount
  };
}

function ensureProductExcelRow(p) {
  const accounts = getVNAccountingAccounts(p.nature || "Vật tư hàng hóa");

  if (!p.excelRow || p.excelRow.length < 57) {
    const er = new Array(57).fill("");
    er[0] = p.id || "";
    er[1] = p.name || "";
    er[2] = p.nature || "Vật tư hàng hóa";
    er[3] = p.group || "";
    er[7] = p.unit || "Cái";
    er[9] = p.minStock || 0;
    er[11] = accounts.defaultWarehouse;
    er[12] = accounts.warehouseAccount;
    er[13] = accounts.cogsAccount;
    er[14] = accounts.revenueAccount;
    er[15] = accounts.discountAccount;
    er[16] = accounts.rebateAccount;
    er[17] = accounts.returnAccount;
    er[18] = 0;
    er[19] = p.initialCost || 0;
    er[20] = p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : (p.avgCost || 0);
    er[21] = p.salePrice1 || 0;
    er[22] = 0;
    er[23] = 0;
    er[24] = 0;
    er[25] = 0;
    er[26] = 0;
    er[27] = 0;
    er[29] = "False";
    er[30] = p.inactive ? 1 : 0;
    er[31] = p.stock || 0;
    er[33] = p.totalValue || 0;
    er[35] = "Chưa xác định";
    er[36] = 0;
    er[37] = 0;
    er[41] = 0;
    p.excelRow = er;
  }
  // Đồng bộ các thuộc tính hiện tại của sản phẩm vào excelRow
  p.excelRow[0] = p.id || "";
  p.excelRow[1] = p.name || "";
  p.excelRow[2] = p.nature || "Vật tư hàng hóa";
  p.excelRow[3] = p.group || "";
  p.excelRow[7] = p.unit || "Cái";
  p.excelRow[9] = p.minStock || 0;
  p.excelRow[11] = accounts.defaultWarehouse;
  p.excelRow[12] = accounts.warehouseAccount;
  p.excelRow[13] = accounts.cogsAccount;
  p.excelRow[14] = accounts.revenueAccount;
  p.excelRow[15] = accounts.discountAccount;
  p.excelRow[16] = accounts.rebateAccount;
  p.excelRow[17] = accounts.returnAccount;
  p.excelRow[19] = p.initialCost || 0;
  p.excelRow[20] = p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : (p.avgCost || 0);
  p.excelRow[21] = p.salePrice1 || 0;
  p.excelRow[30] = p.inactive ? 1 : 0;
  p.excelRow[31] = p.stock || 0;
  p.excelRow[33] = p.totalValue || 0;
  return p.excelRow;
}


function exportProductsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "CCCCFF" } }; // Nền tím nhạt (FFCCCCFF)
    const fntT = { name: "Times New Roman", sz: 14, bold: true };
    const fntH = { name: "Microsoft Sans Serif", sz: 8, bold: false };
    const fntN = { name: "Microsoft Sans Serif", sz: 8 };
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

    // 57 Cột theo đúng template gốc của MISA
    const headers = [
      "Mã", "Tên", "Tính chất", "Nhóm VTHH", "Mô tả", "Diễn giải khi mua", "Diễn giải khi bán",
      "ĐVT chính", "Thời hạn BH", "Số lượng tồn tối thiểu", "Nguồn gốc", "Kho ngầm định",
      "Tài khoản kho", "TK chi phí", "TK doanh thu", "TK chiết khấu", "TK giảm giá", "TK trả lại",
      "Tỷ lệ CKMH", "Đơn giá mua cố định", "Đơn giá mua gần nhất", "Đơn giá bán 1", "Đơn giá bán 2",
      "Đơn giá bán 3", "Đơn giá cố định", "Là đơn giá sau thuế", "Thuế suất thuế NK", "Thuế suất thuế XK",
      "Nhóm HHDV chịu thuế TTĐB", "Là hàng khuyến mại", "Ngừng theo dõi", "Số lượng tồn", "Đặc tính",
      "Giá trị tồn", "Thuế suất GTGT", "Giảm thuế theo NQ43/2022/QH15", "Theo dõi vật tư, hàng hóa theo mã quy cách",
      "Chiết khấu", "Số lượng từ", "Số lượng đến", "% chiết khấu", "Số tiền chiết khấu", "Đơn vị chuyển đổi",
      "Tỷ lệ chuyển đổi về đơn vị chính", "Phép tính", "Mô tả", "Đơn giá bán 1", "Đơn giá bán 2", "Đơn giá bán 3",
      "Đơn giá cố định", "Mã nguyên vật liệu", "Tên nguyên vật liệu", "ĐVT", "Số lượng", "Mã quy cách",
      "Tên hiển thị", "Cho phép trùng"
    ];
    const ncols = headers.length;

    // ROW 0: Tiêu đề khớp 100% tệp mẫu MISA
    sc(0, 0, "DANH SÁCH VẬT TƯ, HÀNG HÓA, DỊCH VỤ", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Headers
    headers.forEach((h, c) => sc(1, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    let rowIdx = 2;
    (state.products || []).forEach((p) => {
      const bs = (al) => ({ font: fntN, alignment: al, border: border4 });
      const er = ensureProductExcelRow(p);
      const rowData = [...er];

      // Đảm bảo đồng bộ thông tin mới nhất từ CSDL app
      rowData[0] = p.id || "";
      rowData[1] = p.name || "";
      rowData[2] = p.nature || "Vật tư hàng hóa";
      rowData[3] = p.group || "";
      rowData[7] = p.unit || "Cái";
      rowData[9] = p.minStock !== undefined ? p.minStock : (er[9] !== undefined ? Number(er[9]) : 0);
      rowData[11] = p.defaultWarehouse || "";
      rowData[12] = p.warehouseAccount || "1561";
      rowData[13] = p.cogsAccount || "632";
      rowData[14] = p.revenueAccount || "51111";
      rowData[19] = p.initialCost !== undefined ? p.initialCost : (er[19] !== undefined ? Number(er[19]) : 0);
      rowData[20] = p.avgCost !== undefined ? p.avgCost : (er[20] !== undefined ? Number(er[20]) : 0);
      rowData[30] = p.inactive ? 1 : (er[30] !== undefined ? Number(er[30]) : 0);
      rowData[31] = p.stock !== undefined ? p.stock : (er[31] !== undefined ? Number(er[31]) : 0);
      rowData[33] = p.totalValue !== undefined ? p.totalValue : (er[33] !== undefined ? Number(er[33]) : 0);

      for (let c = 34; c < 57; c++) {
        rowData[c] = er[c] !== undefined ? er[c] : "";
      }

      rowData.forEach((val, c) => {
        let align = cL;
        if ([0, 2, 7, 10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 30, 32].includes(c)) {
          align = cC;
        } else if ([5, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 31, 33, 37, 38, 39, 40, 41, 43, 46, 47, 48, 49, 53].includes(c)) {
          align = cR;
        }

        let type = 's';
        let z = null;
        if (typeof val === 'number') {
          type = 'n';
          z = numFmt;
          if (c === 31) z = "#,##0.##";
        } else if (typeof val === 'boolean') {
          type = 'b';
        }

        sc(rowIdx, c, val, type, bs(align), z);
      });
      rowIdx++;
    });

    // DÒNG TỔNG SỐ DÒNG (Dưới cùng của file MISA mẫu)
    sc(rowIdx, 0, "Số dòng = " + state.products.length, 's', { font: fntN });
    for (let c = 1; c < ncols; c++) {
      sc(rowIdx, c, "", 's');
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;

    // Thiết lập độ rộng cột
    const colWidths = [];
    for (let c = 0; c < ncols; c++) {
      if (c === 0) colWidths.push({ wch: 16 }); // Mã
      else if (c === 1) colWidths.push({ wch: 32 }); // Tên
      else if (c === 3) colWidths.push({ wch: 18 }); // Nhóm VTHH
      else colWidths.push({ wch: 12 });
    }
    ws['!cols'] = colWidths;
    ws['!rows'] = [{ hpt: 22 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Vat_tu__hang_hoa__dich_vu");
    const outName = `Vat_tu_hang_hoa_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel hàng hóa: ${err.message}`, "danger");
  }
}

function exportPartnersToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
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
    const fntH = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const fntB = { name: "Times New Roman", sz: 11, bold: true };
    const fntN = { name: "Times New Roman", sz: 11 };
    const cC = { horizontal: "center", vertical: "center" };
    const cL = { horizontal: "left", vertical: "center", wrapText: true };
    const cR = { horizontal: "right", vertical: "center" };

    const sc = (r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    // Columns
    const headers = ["Mã khách hàng", "Tên khách hàng", "Địa chỉ", "Nhóm KH, NCC", "Mã số thuế", "Điện thoại", "Ngưng theo dõi"];
    const ncols = headers.length;

    // ROW 0: Tiêu đề
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — DANH SÁCH KHÁCH HÀNG / NHÀ CUNG CẤP", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Headers
    headers.forEach((h, c) => sc(1, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    let rowIdx = 2;
    let totalKH = 0, totalNCC = 0;
    (state.partners || []).forEach((p, idx) => {
      const bg = idx % 2 === 0 ? null : altBg;
      const bs = (al) => ({ font: fntN, fill: bg, alignment: al, border: border4 });
      sc(rowIdx, 0, p.id || "", 's', bs(cC));
      sc(rowIdx, 1, p.name || "", 's', bs(cL));
      sc(rowIdx, 2, p.address || "", 's', bs(cL));
      sc(rowIdx, 3, p.group || (p.type === "supplier" ? "NCC" : "KH"), 's', bs(cC));
      sc(rowIdx, 4, p.taxCode || "", 's', bs(cC));
      sc(rowIdx, 5, p.phone || "", 's', bs(cC));
      sc(rowIdx, 6, p.inactive ? "Có" : "", 's', bs(cC));
      if (p.type === "supplier") totalNCC++; else totalKH++;
      rowIdx++;
    });

    // DÒNG TỔNG
    const ts = (al) => ({ font: fntB, fill: totBg, alignment: al, border: border4 });
    sc(rowIdx, 0, `TỔNG: ${totalKH} KH + ${totalNCC} NCC = ${totalKH + totalNCC} đối tượng`, 's', ts(cL));
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 40 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 14 }];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Doi tuong");
    const outName = `Khach_hang_NCC_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel khách hàng: ${err.message}`, "danger");
  }
}

// --- Phân hệ Công nợ ---
function calculatePartnerDebts(toDate = "") {
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
    if (toDate && v.date > toDate) return;
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

  const debtsItemsPerPage = 30;
  const total = filteredDebtsList.length;
  const totalPages = Math.ceil(total / debtsItemsPerPage) || 1;

  if (debtsPage > totalPages) debtsPage = totalPages;
  if (debtsPage < 1) debtsPage = 1;

  const startIdx = (debtsPage - 1) * debtsItemsPerPage;
  const endIdx = startIdx + debtsItemsPerPage;
  const pageItems = filteredDebtsList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy công nợ đối tác nào</td></tr>`;
  } else {
    pageItems.forEach(d => {
      const tr = document.createElement("tr");
      const escapedId = escapeHtmlAttr(d.id);
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "partner");
      tr.setAttribute("data-id", escapedId);
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="debt-checkbox" value="${escapedId}" onchange="updateBatchDebtsUI()">
        </td>
        <td style="font-weight:bold; color:var(--color-primary);">${d.id}</td>
        <td style="font-weight:600;"><a href="#" onclick="viewPartnerLedger('${escapedId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${d.name}</a></td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${d.openingDebit > 0 ? formatVND(d.openingDebit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:500;" class="font-numeric">${d.openingCredit > 0 ? formatVND(d.openingCredit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; color:var(--color-primary); font-weight:500;" class="font-numeric">${d.debitTrans > 0 ? formatVND(d.debitTrans).replace("đ", "") : "-"}</td>
        <td style="text-align:right; color:var(--color-warning); font-weight:500;" class="font-numeric">${d.creditTrans > 0 ? formatVND(d.creditTrans).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${d.closingDebit > 0 ? 'text-success' : ''}">${d.closingDebit > 0 ? formatVND(d.closingDebit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric ${d.closingCredit > 0 ? 'text-warning' : ''}">${d.closingCredit > 0 ? formatVND(d.closingCredit).replace("đ", "") : "-"}</td>
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

  const paginationInfo = document.getElementById("debts-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = total > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} trong số ${total} đối tác (Trang ${debtsPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 đối tác`;
  }

  // Reset check-all-debts checkbox
  const checkAll = document.getElementById("check-all-debts");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchDebtsUI === "function") updateBatchDebtsUI();

  // Render pagination controls
  const paginationControls = document.getElementById("debts-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(1)" ${debtsPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(${debtsPage - 1})" ${debtsPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, debtsPage - 2);
      let endPage = Math.min(totalPages, debtsPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === debtsPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeDebtsPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === debtsPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(${debtsPage + 1})" ${debtsPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeDebtsPage(${totalPages})" ${debtsPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(endIdx, total)} của ${total} đối tác
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }
}

function changeDebtsPage(p) {
  debtsPage = p;
  renderDebtsTable();
}

function filterDebts() {
  const query = document.getElementById("debt-search-input") ? document.getElementById("debt-search-input").value : "";
  const filterType = document.getElementById("debt-type-filter") ? document.getElementById("debt-type-filter").value : "all";
  const activeOnly = document.getElementById("debt-active-only-filter") ? document.getElementById("debt-active-only-filter").checked : false;

  const allDebts = calculatePartnerDebts();

  filteredDebtsList = allDebts.filter(d => {
    const combined = `${d.id || ""} ${d.name || ""}`;
    const debtVal = Math.max(d.closingDebit || 0, d.closingCredit || 0);
    const matchesQuery = matchAdvancedQuery(combined, query, debtVal);

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

    let debitAmount = 0;
    let creditAmount = 0;
    let offsetAccountSet = new Set();

    v.entries.forEach(e => {
      const is131 = e.debit.startsWith("131") || e.credit.startsWith("131");
      const is331 = e.debit.startsWith("331") || e.credit.startsWith("331");
      if (!is131 && !is331) return;

      if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
        debitAmount += e.amount;
        offsetAccountSet.add(e.credit);
      } else {
        creditAmount += e.amount;
        offsetAccountSet.add(e.debit);
      }
    });

    if (debitAmount > 0 || creditAmount > 0) {
      ledgerEntries.push({
        date: v.date,
        id: v.id,
        desc: v.description,
        offsetAccount: Array.from(offsetAccountSet).join(", "),
        debit: debitAmount,
        credit: creditAmount
      });

      debitSum += debitAmount;
      creditSum += creditAmount;
    }
  });

  ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (ledgerEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Không có giao dịch phát sinh công nợ trong kỳ</td></tr>`;
  } else {
    ledgerEntries.forEach(le => {
      const tr = document.createElement("tr");

      // Tìm chứng từ bán hàng liên quan nếu đây là một phiếu thu công nợ
      let viewId = le.id;
      let displayId = le.id;

      if (le.id.startsWith("PT") || le.id.startsWith("PC") || le.credit > 0) {
        const relatedSales = findRelatedSalesVoucher(le.id, le.desc, p.id, le.credit || le.debit);
        if (relatedSales) {
          viewId = relatedSales.id;
          displayId = `${le.id} (${relatedSales.id})`;
        }
      }

      const escapedViewId = escapeHtmlAttr(viewId);
      tr.innerHTML = `
        <td>${le.date}</td>
        <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedViewId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${displayId}</a></td>
        <td>${le.desc}</td>
        <td style="text-align:center; font-weight:700;">${le.offsetAccount}</td>
        <td style="text-align:right; font-weight:500;">${le.debit > 0 ? formatVND(le.debit).replace("đ", "") : "-"}</td>
        <td style="text-align:right; font-weight:500;">${le.credit > 0 ? formatVND(le.credit).replace("đ", "") : "-"}</td>
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

      let debitAmount = 0;
      let creditAmount = 0;
      let offsetAccountSet = new Set();

      v.entries.forEach(e => {
        const is131 = e.debit.startsWith("131") || e.credit.startsWith("131");
        const is331 = e.debit.startsWith("331") || e.credit.startsWith("331");
        if (!is131 && !is331) return;

        if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
          debitAmount += e.amount;
          offsetAccountSet.add(e.credit);
        } else {
          creditAmount += e.amount;
          offsetAccountSet.add(e.debit);
        }
      });

      if (debitAmount > 0 || creditAmount > 0) {
        ledgerEntries.push({
          date: v.date,
          id: v.id,
          desc: v.description,
          offsetAccount: Array.from(offsetAccountSet).join(", "),
          debit: debitAmount,
          credit: creditAmount
        });

        debitSum += debitAmount;
        creditSum += creditAmount;
      }
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
    const pad = (n) => n.toString().padStart(2, '0');
    let fromDateStr = "01/01/2026";
    let toDateStr = new Date().toLocaleDateString('vi-VN');
    if (ledgerEntries.length > 0) {
      const dates = ledgerEntries.map(e => new Date(e.date));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      fromDateStr = `${pad(minDate.getDate())}/${pad(minDate.getMonth() + 1)}/${minDate.getFullYear()}`;
      toDateStr = `${pad(maxDate.getDate())}/${pad(maxDate.getMonth() + 1)}/${maxDate.getFullYear()}`;
    }

    // =========================================================
    // 2. BUILD WORKBOOK FROM SCRATCH (clean 5-column layout)
    // Columns: A=Ngày, B=Số CT, C=Diễn giải, D=Số tiền, E=Số dư
    // =========================================================
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    // --- Style presets ---
    const fontTitle = { name: "Times New Roman", sz: 14, bold: true };
    const fontSubtitle = { name: "Times New Roman", sz: 11, italic: true };
    const fontCompany = { name: "Times New Roman", sz: 12, bold: true };
    const fontAddr = { name: "Times New Roman", sz: 10 };
    const fontNormal = { name: "Times New Roman", sz: 11 };
    const fontBold = { name: "Times New Roman", sz: 11, bold: true };
    const fontItalic = { name: "Times New Roman", sz: 11, italic: true };
    const fontHeader = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const alignCenter = { horizontal: "center", vertical: "center" };
    const alignLeft = { horizontal: "left", vertical: "center" };
    const alignRight = { horizontal: "right", vertical: "center" };
    const alignCenterWrap = { horizontal: "center", vertical: "center", wrapText: true };
    const thinBorder = { style: "thin", color: { rgb: "999999" } };
    const border4 = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    const headerBg = { patternType: "solid", fgColor: { rgb: "2F5496" } };
    const headerBorder = {
      top: { style: "thin", color: { rgb: "1F3864" } },
      bottom: { style: "thin", color: { rgb: "1F3864" } },
      left: { style: "thin", color: { rgb: "1F3864" } },
      right: { style: "thin", color: { rgb: "1F3864" } }
    };
    const altRowBg = { patternType: "solid", fgColor: { rgb: "F2F7FB" } };

    // Helper to set cell
    const setCell = (ref, v, t, style, z) => {
      ws[ref] = { v, t, s: style };
      if (z) ws[ref].z = z;
    };

    let row = 0; // 0-indexed

    // --- ROW 0: Company Name ---
    setCell("A1", "CÔNG TY CỔ PHẦN RẠNG ĐÔNG", "s",
      { font: fontCompany, alignment: alignCenter });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });

    // --- ROW 1: Sub Title / Trung tâm ---
    setCell("A2", "TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY", "s",
      { font: fontCompany, alignment: alignCenter });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });

    // --- ROW 2: Address ---
    setCell("A3", "Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh", "s",
      { font: fontAddr, alignment: alignCenter });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 4 } });

    // --- ROW 3: Tel/Hotline ---
    setCell("A4", "Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074", "s",
      { font: fontAddr, alignment: alignCenter });
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 4 } });

    // --- ROW 4: blank ---

    // --- ROW 5: Title ---
    setCell("A6", "THÔNG BÁO CÔNG NỢ", "s",
      { font: fontTitle, alignment: alignCenter });
    merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 4 } });

    // --- ROW 6: Print date ---
    setCell("A7", `Ngày in: ${new Date().toLocaleDateString('vi-VN')}`, "s",
      { font: fontSubtitle, alignment: alignCenter });
    merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: 4 } });

    // --- ROW 7: blank ---

    // --- ROW 8: Kính gửi + Kỳ ---
    setCell("A9", "Kính gửi:", "s", { font: fontBold, alignment: alignLeft });
    setCell("D9", `Kỳ: Từ ngày ${fromDateStr} đến ngày ${toDateStr}`, "s",
      { font: fontNormal, alignment: alignRight });
    merges.push({ s: { r: 8, c: 3 }, e: { r: 8, c: 4 } });

    // --- ROW 9: Đơn vị ---
    setCell("A10", `Đơn vị: ${p.name} (${p.id})`, "s",
      { font: fontNormal, alignment: alignLeft });
    merges.push({ s: { r: 9, c: 0 }, e: { r: 9, c: 2 } });

    // --- ROW 10: Địa chỉ + Số dư cuối kỳ ---
    setCell("A11", `Địa chỉ: ${p.address || ""}`, "s",
      { font: fontNormal, alignment: alignLeft });
    merges.push({ s: { r: 10, c: 0 }, e: { r: 10, c: 2 } });
    setCell("D11", "Số dư cuối kỳ:", "s",
      { font: fontBold, alignment: alignRight });
    setCell("E11", closingVal, "n",
      { font: { name: "Times New Roman", sz: 12, bold: true, color: { rgb: "C00000" } }, alignment: alignRight }, '#,##0');

    // --- ROW 11: MST + Số dư đầu kỳ ---
    setCell("A12", `Mã số thuế: ${p.taxCode || ""}`, "s",
      { font: fontNormal, alignment: alignLeft });
    merges.push({ s: { r: 11, c: 0 }, e: { r: 11, c: 2 } });
    setCell("D12", "Số dư đầu kỳ:", "s",
      { font: fontNormal, alignment: alignRight });
    setCell("E12", openingVal, "n",
      { font: fontBold, alignment: alignRight }, '#,##0');

    // --- ROW 12: blank ---

    // --- ROW 13: Table header (row index 13, Excel row 14) ---
    const hdrRow = 13;
    const hdrCols = [
      { col: "A", label: "Ngày", align: alignCenterWrap },
      { col: "B", label: "Số chứng từ", align: alignCenterWrap },
      { col: "C", label: "Diễn giải", align: alignCenterWrap },
      { col: "D", label: "Số tiền", align: alignCenterWrap },
      { col: "E", label: "Số dư", align: alignCenterWrap }
    ];
    hdrCols.forEach(h => {
      const ref = h.col + (hdrRow + 1);
      setCell(ref, h.label, "s", {
        font: fontHeader,
        alignment: h.align,
        fill: headerBg,
        border: headerBorder
      });
    });

    // --- DATA ROWS ---
    let currentBalance = openingVal;
    const dataStartRow = hdrRow + 1; // row index 12

    ledgerEntries.forEach((le, idx) => {
      const r = dataStartRow + idx;
      const excelRow = r + 1;

      let amount = 0;
      if (p.type === "customer") {
        amount = le.debit - le.credit;
      } else {
        amount = le.credit - le.debit;
      }
      currentBalance += amount;

      const dVal = new Date(le.date);
      const dateFormatted = `${pad(dVal.getDate())}/${pad(dVal.getMonth() + 1)}/${dVal.getFullYear()}`;

      const isAlt = idx % 2 === 1;
      const rowFill = isAlt ? altRowBg : undefined;

      const makeStyle = (align) => {
        const s = { font: fontNormal, alignment: align, border: border4 };
        if (rowFill) s.fill = rowFill;
        return s;
      };
      const makeStyleBold = (align) => {
        const s = { font: fontBold, alignment: align, border: border4 };
        if (rowFill) s.fill = rowFill;
        return s;
      };

      setCell("A" + excelRow, dateFormatted, "s", makeStyle(alignCenter));
      setCell("B" + excelRow, le.id, "s", makeStyle(alignCenter));
      setCell("C" + excelRow, le.desc, "s", makeStyle(alignLeft));
      setCell("D" + excelRow, amount, "n", makeStyle(alignRight), '#,##0;(#,##0);"-"');
      setCell("E" + excelRow, currentBalance, "n", makeStyleBold(alignRight), '#,##0;(#,##0);"-"');
    });

    // --- TOTALS ROW ---
    const totalsRowIdx = dataStartRow + ledgerEntries.length;
    const totalsExcelRow = totalsRowIdx + 1;
    const totalBg = { patternType: "solid", fgColor: { rgb: "D6E4F0" } };
    const totalBorder = {
      top: { style: "medium", color: { rgb: "2F5496" } },
      bottom: { style: "medium", color: { rgb: "2F5496" } },
      left: thinBorder,
      right: thinBorder
    };

    setCell("A" + totalsExcelRow, "", "s", { font: fontBold, fill: totalBg, border: totalBorder });
    setCell("B" + totalsExcelRow, "", "s", { font: fontBold, fill: totalBg, border: totalBorder });
    setCell("C" + totalsExcelRow, "TỔNG CỘNG", "s",
      { font: fontBold, alignment: alignRight, fill: totalBg, border: totalBorder });

    const totalAmount = ledgerEntries.reduce((sum, le) => {
      if (p.type === "customer") return sum + le.debit - le.credit;
      return sum + le.credit - le.debit;
    }, 0);
    setCell("D" + totalsExcelRow, totalAmount, "n",
      { font: fontBold, alignment: alignRight, fill: totalBg, border: totalBorder }, '#,##0;(#,##0);"-"');
    setCell("E" + totalsExcelRow, closingVal, "n",
      { font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "C00000" } }, alignment: alignRight, fill: totalBg, border: totalBorder }, '#,##0;(#,##0);"-"');

    // --- SIGNATURE SECTION ---
    const sigRow = totalsRowIdx + 3;
    const sigExcelRow = sigRow + 1;
    setCell("D" + sigExcelRow, "Người lập phiếu", "s",
      { font: fontBold, alignment: alignCenter });
    merges.push({ s: { r: sigRow, c: 3 }, e: { r: sigRow, c: 4 } });

    const sigSubRow = sigRow + 1;
    setCell("D" + (sigSubRow + 1), "(Ký, họ tên)", "s",
      { font: fontItalic, alignment: alignCenter });
    merges.push({ s: { r: sigSubRow, c: 3 }, e: { r: sigSubRow, c: 4 } });

    // --- COLUMN WIDTHS ---
    ws['!cols'] = [
      { wch: 14 },  // A: Ngày
      { wch: 16 },  // B: Số chứng từ
      { wch: 50 },  // C: Diễn giải
      { wch: 20 },  // D: Số tiền
      { wch: 22 }   // E: Số dư
    ];

    // --- ROW HEIGHTS ---
    ws['!rows'] = [];
    ws['!rows'][0] = { hpt: 20 }; // Company Name
    ws['!rows'][1] = { hpt: 18 }; // Subtitle / Trung tâm
    ws['!rows'][2] = { hpt: 16 }; // Address
    ws['!rows'][3] = { hpt: 16 }; // Tel/Hotline
    // Title row
    ws['!rows'][5] = { hpt: 26 };
    // Header row
    ws['!rows'][hdrRow] = { hpt: 22 };

    // --- MERGES ---
    ws['!merges'] = merges;

    // --- SHEET RANGE ---
    const lastRow = sigSubRow + 4;
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 4 } });

    XLSX.utils.book_append_sheet(wb, ws, "Thông báo công nợ");

    // --- SAVE ---
    XLSX.writeFile(wb, `Thong_bao_cong_no_${p.id}.xlsx`);
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

function previewPartnerDebtNotice(partnerId) {
  const p = state.partners.find(item => item.id === partnerId);
  if (!p) {
    showToast("Không tìm thấy đối tác này!", "danger");
    return;
  }

  // Get ledger data
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

    let debitAmount = 0;
    let creditAmount = 0;
    let offsetAccountSet = new Set();

    v.entries.forEach(e => {
      const is131 = e.debit.startsWith("131") || e.credit.startsWith("131");
      const is331 = e.debit.startsWith("331") || e.credit.startsWith("331");
      if (!is131 && !is331) return;

      if (e.debit.startsWith("131") || e.debit.startsWith("331")) {
        debitAmount += e.amount;
        offsetAccountSet.add(e.credit);
      } else {
        creditAmount += e.amount;
        offsetAccountSet.add(e.debit);
      }
    });

    if (debitAmount > 0 || creditAmount > 0) {
      ledgerEntries.push({
        date: v.date,
        id: v.id,
        desc: v.description,
        offsetAccount: Array.from(offsetAccountSet).join(", "),
        debit: debitAmount,
        credit: creditAmount
      });

      debitSum += debitAmount;
      creditSum += creditAmount;
    }
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
    fromDateStr = `${pad(minDate.getDate())}/${pad(minDate.getMonth() + 1)}/${minDate.getFullYear()}`;
    toDateStr = `${pad(maxDate.getDate())}/${pad(maxDate.getMonth() + 1)}/${maxDate.getFullYear()}`;
  }

  const formatDebtAmount = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    const formatted = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
    const clean = formatted.replace(/[₫đ\sVND]/g, '').trim();
    if (val < 0) {
      const absClean = clean.replace('-', '').replace('(', '').replace(')', '');
      return `-${absClean}`;
    }
    return clean;
  };

  let tableRowsHtml = "";
  let currentBalance = openingVal;
  ledgerEntries.forEach((le) => {
    let amount = 0;
    if (p.type === "customer") {
      amount = le.debit - le.credit;
    } else {
      amount = le.credit - le.debit;
    }
    currentBalance += amount;

    const dVal = new Date(le.date);
    const pad = (n) => n.toString().padStart(2, '0');
    const dateFormatted = `${pad(dVal.getDate())}/${pad(dVal.getMonth() + 1)}/${dVal.getFullYear()}`;

    tableRowsHtml += `
      <tr>
        <td style="text-align: center; border: 1px solid #000; padding: 6px;">${dateFormatted}</td>
        <td style="text-align: center; font-family: monospace; font-weight: 500; border: 1px solid #000; padding: 6px;">${le.id}</td>
        <td style="border: 1px solid #000; padding: 6px;">${le.desc}</td>
        <td style="text-align: right; font-family: 'Times New Roman', serif; border: 1px solid #000; padding: 6px;" class="font-numeric">${formatDebtAmount(amount)}</td>
        <td style="text-align: right; font-family: 'Times New Roman', serif; font-weight: bold; border: 1px solid #000; padding: 6px;" class="font-numeric">${formatDebtAmount(currentBalance)}</td>
      </tr>
    `;
  });

  if (ledgerEntries.length === 0) {
    tableRowsHtml = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 20px; color: #666; font-style: italic; border: 1px solid #000;">
          Không có phát sinh nghiệp vụ công nợ trong kỳ.
        </td>
      </tr>
    `;
  }

  const printArea = document.getElementById("voucher-print-area");
  if (!printArea) return;

  const content = `
    <div class="printable-voucher" style="max-width: 800px; padding: 40px; font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; line-height: 1.4; background-color: #fff; margin: 0 auto; box-sizing: border-box;">
      <style>
        .debt-notice-table th {
          border: 1px solid #000 !important;
          padding: 6px;
          text-align: center;
          font-weight: bold;
        }
        .debt-notice-table td {
          border: 1px solid #000 !important;
          padding: 6px;
          vertical-align: middle;
        }
        @media print {
          .printable-voucher {
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            font-size: 12pt !important;
          }
        }
      </style>

      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px;">
        <!-- Logo Rạng Đông thực tế từ file logo.jpg -->
        <div style="display: flex; align-items: center; justify-content: center; width: 140px; flex-shrink: 0;">
          <img src="logo.jpg" style="max-height: 55px; max-width: 130px; object-fit: contain;" alt="Logo" onerror="this.style.display='none'" />
        </div>

        <!-- Thông tin công ty chính xác theo mẫu giấy -->
        <div style="text-align: center; flex-grow: 1; color: #000; padding: 0 10px;">
          <div style="font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 0.2px;">CÔNG TY CỔ PHẦN RẠNG ĐÔNG</div>
          <div style="font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 2px;">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKY</div>
          <div style="font-size: 11px; margin-top: 3px;">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
          <div style="font-size: 11px; margin-top: 1px; font-weight: 500;">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
        </div>

        <!-- Khoảng trống đối trọng bên phải để căn giữa tuyệt đối -->
        <div style="width: 140px; flex-shrink: 0;"></div>
      </div>

      <!-- Title -->
      <div style="text-align: center; margin-bottom: 25px;">
        <div style="font-size: 20px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">THÔNG BÁO CÔNG NỢ</div>
        <div style="font-size: 11px; font-style: italic; margin-top: 3px;">Ngày in: ${new Date().toLocaleDateString('vi-VN')}</div>
      </div>

      <!-- Info -->
      <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px 15px; margin-bottom: 20px; font-size: 13px;">
        <div><strong>Kính gửi:</strong></div>
        <div><strong>Kỳ:</strong> Từ ngày ${fromDateStr} đến ngày ${toDateStr}</div>
        
        <div><strong>Đơn vị:</strong> ${p.name} (${p.id})</div>
        <div><strong>Số dư đầu kỳ:</strong> <span style="font-weight: bold;">${formatDebtAmount(openingVal)} đ</span></div>
        
        <div><strong>Địa chỉ:</strong> ${p.address || ""}</div>
        <div><strong>Số dư cuối kỳ:</strong> <span style="font-weight: bold; color: var(--color-primary);">${formatDebtAmount(closingVal)} đ</span></div>
        
        <div><strong>Mã số thuế:</strong> ${p.taxCode || ""}</div>
        <div></div>
      </div>

      <!-- Table -->
      <table class="debt-notice-table" style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="width: 13%; text-align: center;">Ngày</th>
            <th style="width: 15%; text-align: center;">Số chứng từ</th>
            <th style="width: 42%; text-align: left;">Diễn giải</th>
            <th style="width: 15%; text-align: right;">Số tiền</th>
            <th style="width: 15%; text-align: right;">Số dư</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Footer -->
      <div style="display: flex; justify-content: flex-end; margin-top: 30px;">
        <div style="width: 250px; text-align: center; font-size: 13px;">
          <strong>Người lập phiếu</strong><br>
          <span style="font-style: italic; font-size: 11px;">(Ký, họ tên)</span>
          <div style="height: 80px;"></div>
        </div>
      </div>
    </div>
  `;

  printArea.innerHTML = content;
  // Change title of modal temporarily
  const modalTitle = document.querySelector("#modal-view-voucher .card-title");
  if (modalTitle) {
    modalTitle.innerText = "Xem trước Thông báo Công nợ";
  }
  openModal("modal-view-voucher");
}

function previewCurrentPartnerDebtNotice() {
  if (!activePartnerIdForLedger) {
    showToast("Không tìm thấy đối tác hiện tại!", "danger");
    return;
  }
  previewPartnerDebtNotice(activePartnerIdForLedger);
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
    tr.className = "clickable-row";
    tr.setAttribute("data-type", "voucher");
    tr.setAttribute("data-subtype", o.type);
    tr.setAttribute("data-id", escapedOrderId);
    tr.innerHTML = `
      <td><a href="#" onclick="closeModal('modal-view-partner-ledger'); viewVoucher('${escapedOrderId}'); return false;" style="font-weight:bold; color:var(--color-primary);">${o.id}</a></td>
      <td>${o.date}</td>
      <td>${o.description}</td>
      <td style="text-align:right; font-weight:500;">${formatVND(totalAmt).replace("đ", "")}</td>
      <td style="text-align:right; font-weight:700; color:${o.remainingDebt > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">${formatVND(o.remainingDebt).replace("đ", "")}</td>
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

    document.getElementById("edit-debt-voucher-value").value = Number(v.remainingDebt || 0).toLocaleString("vi-VN");

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

    document.getElementById("edit-debt-partner-debit").value = Number(currentDebit).toLocaleString("vi-VN");
    document.getElementById("edit-debt-partner-credit").value = Number(currentCredit).toLocaleString("vi-VN");

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
      const newDebt = parseInt(document.getElementById("edit-debt-voucher-value").value.replace(/\D/g, "")) || 0;

      if (newDebt < 0 || newDebt > totalAmt) {
        showToast(`Số tiền nợ hợp lệ phải từ 0đ đến ${formatVND(totalAmt)}!`, "danger");
        return;
      }

      v.remainingDebt = newDebt;
      saveState();
      showToast(`Cập nhật nợ đơn hàng ${v.id} thành ${formatVND(newDebt)} thành công!`, "success");
    }

    else if (editType === "partner") {
      const newDebit = parseInt(document.getElementById("edit-debt-partner-debit").value.replace(/\D/g, "")) || 0;
      const newCredit = parseInt(document.getElementById("edit-debt-partner-credit").value.replace(/\D/g, "")) || 0;

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
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const khBg = { patternType: "solid", fgColor: { rgb: "EBF3FF" } };
    const nccBg = { patternType: "solid", fgColor: { rgb: "FFF3EB" } };
    const fntT = { name: "Times New Roman", sz: 13, bold: true };
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

    // Columns: Mã(0) Tên(1) Loại(2) Đầu kỳ Dư(3) Trong kỳ Debit(4) Trong kỳ Credit(5) Cuối kỳ Dư(6) Địa chỉ(7) MST(8) ĐT(9)
    const headers = ["Mã", "Tên khách hàng / NCC", "Loại", "Dư đầu kỳ", "PS Nợ trong kỳ", "PS Có trong kỳ", "Dư cuối kỳ", "Địa chỉ", "Mã số thuế", "Điện thoại"];
    const ncols = headers.length;

    // ROW 0: Tiêu đề
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — SỔ DƯ CÔNG NỢ", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Headers
    headers.forEach((h, c) => sc(1, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    const calculatedDebts = calculatePartnerDebts();
    let rowIdx = 2;
    let totalOpeningKH = 0, totalOpeningNCC = 0;
    let totalDebitKH = 0, totalCreditKH = 0;
    let totalDebitNCC = 0, totalCreditNCC = 0;
    let totalClosingKH = 0, totalClosingNCC = 0;

    calculatedDebts.forEach((d, idx) => {
      const isKH = d.type === "customer";
      const openingBal = state.partnerOpeningBalances[d.id] || { debit: 0, credit: 0 };
      const openingNet = isKH ? (openingBal.debit - openingBal.credit) : (openingBal.credit - openingBal.debit);
      const closingNet = isKH ? (d.closingDebit - d.closingCredit) : (d.closingCredit - d.closingDebit);
      const psTrans = isKH ? d.debitTrans : d.creditTrans;   // PS bên tăng
      const psCred = isKH ? d.creditTrans : d.debitTrans;   // PS bên giảm

      const bg = idx % 2 === 0 ? (isKH ? null : { patternType: "solid", fgColor: { rgb: "FFFAF5" } }) : (isKH ? altBg : { patternType: "solid", fgColor: { rgb: "FFF0E0" } });
      const bs = (al) => ({ font: fntN, fill: bg, alignment: al, border: border4 });
      const ns = (al) => ({ font: fntN, fill: bg, alignment: al || cR, border: border4 });

      sc(rowIdx, 0, d.id || "", 's', bs(cC));
      sc(rowIdx, 1, d.name || "", 's', bs(cL));
      sc(rowIdx, 2, isKH ? "KH" : "NCC", 's', bs(cC));
      sc(rowIdx, 3, openingNet, 'n', ns(cR), numFmt);
      sc(rowIdx, 4, psTrans, 'n', ns(cR), numFmt);
      sc(rowIdx, 5, psCred, 'n', ns(cR), numFmt);
      sc(rowIdx, 6, closingNet, 'n', ns(cR), numFmt);
      sc(rowIdx, 7, d.address || "", 's', bs(cL));
      sc(rowIdx, 8, d.taxCode || "", 's', bs(cC));
      sc(rowIdx, 9, d.phone || "", 's', bs(cC));

      if (isKH) {
        totalOpeningKH += openingNet;
        totalDebitKH += psTrans;
        totalCreditKH += psCred;
        totalClosingKH += closingNet;
      } else {
        totalOpeningNCC += openingNet;
        totalDebitNCC += psTrans;
        totalCreditNCC += psCred;
        totalClosingNCC += closingNet;
      }
      rowIdx++;
    });

    // DÒNG TỔNG KHÁCH HÀNG
    const ts = (al) => ({ font: fntB, fill: totBg, alignment: al, border: border4 });
    sc(rowIdx, 0, "TỔNG KHÁCH HÀNG", 's', ts(cL)); merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    sc(rowIdx, 3, totalOpeningKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 4, totalDebitKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 5, totalCreditKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 6, totalClosingKH, 'n', ts(cR), numFmt);
    sc(rowIdx, 7, "", 's', ts(cL)); sc(rowIdx, 8, "", 's', ts(cC)); sc(rowIdx, 9, "", 's', ts(cC));
    rowIdx++;

    // DÒNG TỔNG NCC
    sc(rowIdx, 0, "TỔNG NHÀ CUNG CẤP", 's', ts(cL)); merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    sc(rowIdx, 3, totalOpeningNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 4, totalDebitNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 5, totalCreditNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 6, totalClosingNCC, 'n', ts(cR), numFmt);
    sc(rowIdx, 7, "", 's', ts(cL)); sc(rowIdx, 8, "", 's', ts(cC)); sc(rowIdx, 9, "", 's', ts(cC));

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 38 }, { wch: 14 }, { wch: 14 }];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Cong no");
    const outName = `Cong_no_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel công nợ: ${err.message}`, "danger");
  }
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

  const totalCount = filteredCashList.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  if (cashPage > totalPages) cashPage = totalPages;
  if (cashPage < 1) cashPage = 1;

  const startIdx = (cashPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredCashList.slice(startIdx, endIdx);

  tbody.innerHTML = "";
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy chứng từ nào</td></tr>`;
  } else {
    pageItems.forEach(v => {
      const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu Thu" : "Phiếu Chi";
      const isReceipt = v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
      const methodLabel = v.paymentMethod === "111" ? "Tiền mặt (111)" : "Ngân hàng (112)";

      const tr = document.createElement("tr");
      const escapedPartnerId = escapeHtmlAttr(v.partnerId);
      const escapedVoucherId = escapeHtmlAttr(v.id);
      const formattedDate = v.date ? v.date.split("-").reverse().join("/") : "";
      tr.className = "clickable-row";
      tr.setAttribute("data-type", "voucher");
      tr.setAttribute("data-subtype", v.type);
      tr.setAttribute("data-id", escapedVoucherId);
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="cash-checkbox" value="${escapedVoucherId}" onchange="updateBatchCashUI()">
        </td>
        <td>${formattedDate}</td>
        <td>${formattedDate}</td>
        <td style="font-weight:bold; color:var(--color-primary);">${v.id}</td>
        <td><a href="#" onclick="viewPartnerLedger('${escapedPartnerId}'); return false;" style="color:inherit; text-decoration:underline; cursor:pointer;">${getPartnerNameForVoucher(v)}</a></td>
        <td>${v.description}</td>
        <td style="text-align:right; font-weight:700;" class="font-numeric">${formatVND(v.amount).replace("đ", "")}</td>
        <td>
          <span class="badge ${isReceipt ? 'badge-success' : 'badge-danger'}">
            ${typeLabel}
          </span>
        </td>
        <td>${methodLabel}</td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="print-btn" onclick="viewVoucher('${escapedVoucherId}')" title="Xem và In mẫu chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
            <button class="trash-btn" onclick="deleteVoucher('${escapedVoucherId}')" title="Xóa và Hủy ghi sổ chứng từ" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-danger); cursor: pointer; transition: all 0.2s;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const paginationInfo = document.getElementById("cash-pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = totalCount > 0
      ? `Hiển thị ${startIdx + 1} - ${Math.min(endIdx, totalCount)} trong số ${totalCount} chứng từ (Trang ${cashPage}/${totalPages})`
      : `Hiển thị 0 - 0 trong số 0 chứng từ`;
  }

  // Reset check-all-cash checkbox
  const checkAll = document.getElementById("check-all-cash");
  if (checkAll) checkAll.checked = false;
  if (typeof updateBatchCashUI === "function") updateBatchCashUI();

  // Render pagination controls
  const paginationControls = document.getElementById("cash-pagination-controls");
  if (paginationControls) {
    if (totalPages <= 1) {
      paginationControls.style.display = "none";
    } else {
      paginationControls.style.display = "flex";

      let buttonsHTML = "";
      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(1)" ${cashPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">« Đầu</button>
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(${cashPage - 1})" ${cashPage === 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">‹ Trước</button>
      `;

      let startPage = Math.max(1, cashPage - 2);
      let endPage = Math.min(totalPages, cashPage + 2);

      if (startPage > 1) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        buttonsHTML += `
          <button class="btn ${p === cashPage ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="changeCashPage(${p})" style="padding: 4px 10px; font-size: 12px; font-weight: ${p === cashPage ? '800' : 'normal'};">${p}</button>
        `;
      }

      if (endPage < totalPages) {
        buttonsHTML += `<span style="color: var(--text-secondary); padding: 0 4px; font-size: 12px;">...</span>`;
      }

      buttonsHTML += `
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(${cashPage + 1})" ${cashPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Sau ›</button>
        <button class="btn btn-secondary btn-sm" onclick="changeCashPage(${totalPages})" ${cashPage === totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px; font-weight: 500;">Cuối »</button>
      `;

      paginationControls.innerHTML = `
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">
          Hiển thị ${startIdx + 1} - ${Math.min(endIdx, totalCount)} của ${totalCount} chứng từ
        </span>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${buttonsHTML}
        </div>
      `;
    }
  }
}

function changeCashPage(p) {
  cashPage = p;
  renderCashTable();
}

function filterCash() {
  const query = document.getElementById("cash-search-input") ? document.getElementById("cash-search-input").value : "";
  const filterType = document.getElementById("cash-type-filter") ? document.getElementById("cash-type-filter").value : "all";
  const filterMethod = document.getElementById("cash-method-filter") ? document.getElementById("cash-method-filter").value : "all";
  const fromDate = document.getElementById("search-cash-from") ? document.getElementById("search-cash-from").value : "";
  const toDate = document.getElementById("search-cash-to") ? document.getElementById("search-cash-to").value : "";

  filteredCashList = state.vouchers.filter(v => {
    const isCash = v.type === "receipt" || v.type === "payment" || v.type.startsWith("escrow_");
    if (!isCash) return false;

    const partnerName = getPartnerNameForVoucher(v);
    const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query, v.amount);

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

    let matchesDate = true;
    if (fromDate && v.date < fromDate) matchesDate = false;
    if (toDate && v.date > toDate) matchesDate = false;

    return matchesQuery && matchesType && matchesMethod && matchesDate;
  });

  filteredCashList.sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  cashPage = 1;
  renderCashTable();
}

function clearCashDateFilter() {
  const fromEl = document.getElementById("search-cash-from");
  const toEl = document.getElementById("search-cash-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  filterCash();
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
  const amount = parseInt(document.getElementById("receipt-amount").value.replace(/\D/g, "")) || 0;
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
  const amount = parseInt(document.getElementById("payment-amount").value.replace(/\D/g, "")) || 0;
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

  const query = document.getElementById("cash-search-input") ? document.getElementById("cash-search-input").value.toLowerCase() : "";
  const filterType = document.getElementById("cash-type-filter") ? document.getElementById("cash-type-filter").value : "all";
  const filterMethod = document.getElementById("cash-method-filter") ? document.getElementById("cash-method-filter").value : "all";
  const fromDate = document.getElementById("search-cash-from") ? document.getElementById("search-cash-from").value : "";
  const toDate = document.getElementById("search-cash-to") ? document.getElementById("search-cash-to").value : "";

  let filteredCash = state.vouchers.filter(v => {
    const isCash = v.type === "receipt" || v.type === "payment" || v.type.startsWith("escrow_");
    if (!isCash) return false;

    const partnerName = getPartnerNameForVoucher(v);
    const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
    const matchesQuery = matchAdvancedQuery(combined, query, v.amount);

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

    let matchesDate = true;
    if (fromDate && v.date < fromDate) matchesDate = false;
    if (toDate && v.date > toDate) matchesDate = false;

    return matchesQuery && matchesType && matchesMethod && matchesDate;
  });

  filteredCash.sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const cashMapper = (v, r) => {
    if (!v.excelRow) {
      v.excelRow = createDefaultVoucherExcelRow(v);
    }
    for (let i = 0; i < 10; i++) {
      r[i] = v.excelRow[i] !== undefined ? v.excelRow[i] : "";
    }
    const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu thu" : "Phiếu chi";
    r[0] = v.date;   // Ngày hạch toán (sẽ được convert sang serial bởi exportExcelWithTemplate)
    r[1] = v.date;   // Ngày chứng từ
    r[2] = v.id;     // Số chứng từ
    r[3] = v.description;  // Diễn giải
    r[4] = v.amount || v.totalAmount || 0;  // Số tiền
    r[5] = v.partnerName || getPartnerNameForVoucher(v);  // Đối tượng
    r[6] = v.description;  // Lý do thu/chi
    r[7] = v.date;   // Ngày ghi sổ quỹ
    r[8] = typeLabel;  // Loại chứng từ
    r[9] = v.id;     // Số chứng từ gốc
  };

  let dateRangeSuffix = "";
  if (fromDate || toDate) {
    dateRangeSuffix = `_tu_${fromDate || "truoc"}_den_${toDate || "sau"}`;
  }

  exportExcelWithTemplate(
    'excel/Thu__chi_tien.xlsx',
    `Thu__chi_tien_${new Date().toISOString().split("T")[0]}${dateRangeSuffix}.xlsx`,
    filteredCash,
    cashMapper,
    fallbackHeaders,
    cashMapper
  );
}

function exportSalesToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  let filteredSales = state.vouchers.filter(v => v.type === "sales");

  const query = document.getElementById("search-sales") ? document.getElementById("search-sales").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-sales-from") ? document.getElementById("search-sales-from").value : "";
  const toDate = document.getElementById("search-sales-to") ? document.getElementById("search-sales-to").value : "";

  if (query) filteredSales = filteredSales.filter(v =>
    (v.id || "").toLowerCase().includes(query) ||
    (v.partnerName || "").toLowerCase().includes(query) ||
    (v.description || "").toLowerCase().includes(query)
  );
  if (fromDate) filteredSales = filteredSales.filter(v => v.date >= fromDate);
  if (toDate) filteredSales = filteredSales.filter(v => v.date <= toDate);
  filteredSales.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

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
    const dateFmt = "dd/mm/yyyy";

    const sc = (r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    // ROW 0: Tiêu đề
    const today = new Date().toLocaleDateString('vi-VN');
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — DANH SÁCH BÁN HÀNG", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } });

    // ROW 1: Phạm vi
    sc(1, 0, `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`, 's', { font: fntSub, alignment: cC });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 14 } });

    // ROW 2: Headers
    //  0=Ngày HT  1=Ngày CT  2=Số CT  3=Số HĐ  4=Mẫu số  5=Ký hiệu  6=Khách hàng  7=Diễn giải  8=Tổng tiền hàng  9=Chiết khấu  10=Thuế  11=Thanh toán  12=Đã lập  13=Đã xuất  14=Loại CT
    const headers = ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Số hóa đơn", "Mẫu số HĐ", "Ký hiệu HĐ", "Khách hàng", "Diễn giải", "Tổng tiền hàng", "Tiền chiết khấu", "Tiền thuế GTGT", "Tổng tiền thanh toán", "Đã lập hóa đơn", "Đã xuất hàng", "Loại chứng từ"];
    headers.forEach((h, c) => sc(2, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    let rowIdx = 3;
    let totalGross = 0, totalDiscount = 0, totalTax = 0, totalAmt = 0;

    filteredSales.forEach((v, idx) => {
      const bg = idx % 2 === 0 ? null : altBg;
      const bs = (al) => ({ font: fntN, fill: bg, alignment: al, border: border4 });
      const ns = (al) => ({ font: fntN, fill: bg, alignment: al || cR, border: border4 });

      let grossTotal = 0, discountTotal = 0;
      if (v.items && v.items.length > 0) {
        v.items.forEach(item => {
          const itemGross = (item.qty || 0) * (item.price || 0);
          const discVal = itemGross * ((item.discount || 0) / 100);
          grossTotal += itemGross;
          discountTotal += discVal;
        });
      } else {
        grossTotal = (v.totalAmount || 0) - (v.taxAmount || 0);
      }

      const er = v.excelRow || [];
      sc(rowIdx, 0, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
      sc(rowIdx, 1, dateStrToSerial(v.date), 'n', bs(cC), dateFmt);
      sc(rowIdx, 2, v.id, 's', bs(cC));
      sc(rowIdx, 3, er[3] || v.invoiceNo || "", 's', bs(cC));
      sc(rowIdx, 4, er[4] || "", 's', bs(cC));
      sc(rowIdx, 5, er[5] || "", 's', bs(cC));
      sc(rowIdx, 6, v.partnerName || "", 's', bs(cL));
      sc(rowIdx, 7, v.description || "", 's', bs(cL));
      sc(rowIdx, 8, grossTotal, 'n', ns(cR), numFmt);
      sc(rowIdx, 9, discountTotal, 'n', ns(cR), numFmt);
      sc(rowIdx, 10, v.taxAmount || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 11, v.totalAmount || 0, 'n', ns(cR), numFmt);
      sc(rowIdx, 12, er[12] || "Đã lập", 's', bs(cC));
      sc(rowIdx, 13, er[13] || "Đã xuất", 's', bs(cC));
      sc(rowIdx, 14, v.paymentMethod === "111" ? "Bán hàng - Tiền mặt" : "Bán hàng - Chưa thu", 's', bs(cL));

      totalGross += grossTotal;
      totalDiscount += discountTotal;
      totalTax += v.taxAmount || 0;
      totalAmt += v.totalAmount || 0;
      rowIdx++;
    });

    // DÒNG TỔNG
    const ts = (al) => ({ font: fntB, fill: totBg, alignment: al, border: border4 });
    sc(rowIdx, 0, "TỔNG CỘNG", 's', ts(cL)); merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 7 } });
    sc(rowIdx, 8, totalGross, 'n', ts(cR), numFmt);
    sc(rowIdx, 9, totalDiscount, 'n', ts(cR), numFmt);
    sc(rowIdx, 10, totalTax, 'n', ts(cR), numFmt);
    sc(rowIdx, 11, totalAmt, 'n', ts(cR), numFmt);
    sc(rowIdx, 12, "", 's', ts(cC)); sc(rowIdx, 13, "", 's', ts(cC)); sc(rowIdx, 14, "", 's', ts(cC));

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: 14 } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 28 }];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Ban hang");
    let dateRangeSuffix = fromDate || toDate ? `_${fromDate || ""}_${toDate || ""}` : "";
    const outName = `Ban_hang_${new Date().toISOString().split('T')[0]}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel bán hàng: ${err.message}`, "danger");
  }
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

  // Nạp datalist sản phẩm phục vụ autocomplete trong hóa đơn bán hàng & mua hàng
  const productDatalist = document.getElementById("datalist-sales-products");
  const purchaseProductDatalist = document.getElementById("datalist-purchase-products");
  if (state.products) {
    const optionsHTML = state.products.map(p =>
      `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`
    ).join("");
    if (productDatalist) productDatalist.innerHTML = optionsHTML;
    if (purchaseProductDatalist) purchaseProductDatalist.innerHTML = optionsHTML;
  }

  // Khởi tạo các sự kiện kéo thả (Drag & Drop) cho Excel Drop Zones
  initExcelDragAndDrop();

  // Cập nhật thống kê
  updateExcelHubUI();
}

// Caching dropdown sản phẩm
function cacheProductOptions() {
  if (!state.products) return;
  productOptionsHTML = state.products.map(p => `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`).join("");
  productOptionsSalesHTML = state.products.map(p => `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`).join("");

  const productDatalist = document.getElementById("datalist-sales-products");
  const purchaseProductDatalist = document.getElementById("datalist-purchase-products");
  if (state.products) {
    const optionsHTML = state.products.map(p =>
      `<option value="${p.id}">${p.name} (Tồn: ${p.stock})</option>`
    ).join("");
    if (productDatalist) productDatalist.innerHTML = optionsHTML;
    if (purchaseProductDatalist) purchaseProductDatalist.innerHTML = optionsHTML;
  }
}

// Hàm cập nhật datalist sản phẩm (Backward-compatibility)
function populateDatalistProducts() {
  cacheProductOptions();
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

  // Hỗ trợ định dạng "Tên sản phẩm (Mã sản phẩm)" khi nạp từ form sửa hoặc khi blur
  const match = val.match(/\(([^)]+)\)$/);
  if (match) {
    const idInParens = match[1].trim();
    let p = state.products.find(item => item.id.toLowerCase() === idInParens.toLowerCase());
    if (p) return p;
  }

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
  reader.onload = function (e) {
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
        // Phát hiện định dạng: file mới xuất (13 cột) hoặc template gốc (57 cột)
        // Kiểm tra header row (row[1]) để xác định số cột thực
        const headerRow = rows[1] || [];
        const maxColCount = headerRow.filter(h => (h || "").toString().trim() !== "").length;
        const isNewFormat = maxColCount <= 15; // file mới có 13 cột, cũ có 57 cột

        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          const name = (row[1] || "").toString().trim();
          if (!id || !name || id === "Mã" || id === "TỔNG CỘNG") continue;

          let unit, minStock, stock, totalVal, avgCost;
          let initialStock, initialCost, salePrice1;
          let nature = "Vật tư hàng hóa";
          let defaultWarehouse = "";
          let warehouseAccount = "1561";
          let cogsAccount = "632";
          let revenueAccount = "51111";
          let inactive = false;

          if (isNewFormat) {
            // File mới: Mã(0) Tên(1) Tính chất(2) Nhóm(3) ĐVT(4) Tồn tối thiểu(5) Kho(6) TK kho(7) TK CP(8) TK DT(9) Ngừng TD(10) Tồn hiện tại(11) Giá trị tồn(12)
            unit = (row[4] || "Cái").toString().trim();
            minStock = Number(row[5]) || 0;
            stock = Number(row[11]) || 0;
            totalVal = Number(row[12]) || 0;
            avgCost = stock > 0 ? Math.round(totalVal / stock) : 0;
            initialStock = stock;
            initialCost = avgCost;
            salePrice1 = avgCost;

            nature = String(row[2] || "Vật tư hàng hóa").trim();
            defaultWarehouse = String(row[6] || "").trim();
            warehouseAccount = String(row[7] || "1561").trim();
            cogsAccount = String(row[8] || "632").trim();
            revenueAccount = String(row[9] || "51111").trim();

            const inactiveVal = String(row[10] || "").trim();
            inactive = inactiveVal === "1" || inactiveVal === "Có" || inactiveVal === "True" || inactiveVal === "true";
          } else {
            // File cũ (57 cột): ĐVT ở col 7, Tồn tối thiểu col 9, Tồn kho col 31, Giá trị col 33
            unit = (row[7] || "Cái").toString().trim();
            minStock = Number(row[9]) || 0;
            stock = Number(row[31]) || 0;
            totalVal = Number(row[33]) || 0;
            avgCost = stock > 0 ? Math.round(totalVal / stock) : (Number(row[20]) || Number(row[19]) || 0);

            initialStock = stock;
            initialCost = Number(row[19]) || avgCost || 0;
            salePrice1 = Number(row[21]) || 0;

            nature = String(row[2] || "Vật tư hàng hóa").trim();
            defaultWarehouse = String(row[11] || "").trim();
            warehouseAccount = String(row[12] || "1561").trim();
            cogsAccount = String(row[13] || "632").trim();
            revenueAccount = String(row[14] || "51111").trim();

            const inactiveVal = String(row[30] || "").trim();
            inactive = inactiveVal === "1" || inactiveVal === "Có" || inactiveVal === "True" || inactiveVal === "true";
          }

          const idx = state.products.findIndex(p => p.id === id);
          const pObj = {
            id,
            name,
            unit,
            stock,
            avgCost,
            totalValue: stock * avgCost,
            minStock,
            group: (row[isNewFormat ? 3 : 3] || "").toString().trim(),
            initialStock,
            initialCost,
            salePrice1,
            lastPurchasePrice: Number(row[20]) || avgCost,
            nature,
            defaultWarehouse,
            warehouseAccount,
            cogsAccount,
            revenueAccount,
            inactive,
            excelRow: row
          };
          if (idx !== -1) {
            state.products[idx] = { ...state.products[idx], ...pObj };
          } else {
            state.products.push(pObj);
          }
          count++;
        }
        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} sản phẩm từ file Excel (${isNewFormat ? 'định dạng mới' : 'định dạng cũ'})!`, "success");
      }

      else if (type === 'partners') {
        let count = 0;
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          const name = (row[1] || "").toString().trim();
          if (!id || !name || id === "Mã khách hàng" || id.startsWith("TỔNG")) continue;

          const address = (row[2] || "").toString().trim();
          const group = (row[3] || "").toString().trim().toUpperCase();
          const taxCode = (row[4] || "").toString().trim();
          const phone = (row[5] || "").toString().trim();
          const type = (group.includes("NCC") || id.startsWith("NCC")) ? "supplier" : "customer";
          const inactiveVal = row[6];
          // Hỗ trợ cả "TRUE"/"FALSE" (file cũ) và "Có"/"" (file mới)
          const inactive = inactiveVal === true || (inactiveVal || "").toString().toLowerCase() === "true"
            || (inactiveVal || "").toString().trim() === "Có";

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

        // Phát hiện định dạng: file mới xuất (10 cột: Mã, Tên, Loại, Dư đầu kỳ, PS Nợ, PS Có, Dư cuối kỳ, Địa chỉ, MST, ĐT)
        // hay file cũ 18 cột (Mã, Tên, Phải thu HĐ, Thu trước, Còn phải thu, ...)
        const hdr = rows[1] || [];
        const colCount = hdr.filter(h => (h || "").toString().trim() !== "").length;
        const isNewDebtFormat = colCount <= 12; // file mới có 10 cột

        // Xác định dòng bắt đầu dữ liệu: bỏ qua dòng tiêu đề, phạm vi (nếu có)
        let startRow = 2;
        // Nếu row[1] có giá trị ở col 0 trông như tiêu đề cột → startRow=2
        // Nếu row[2] lại là tiêu đề cột (file xuất mới có 3 header rows) → startRow=3
        const row1col0 = (rows[1] ? rows[1][0] : "").toString().trim();
        if (row1col0 === "Từ ngày:" || row1col0.startsWith("Từ")) startRow = 3;

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          if (!id || id === "Mã" || id === "Mã khách hàng") continue;
          // Bỏ qua dòng tổng cộng
          if (id.startsWith("TỔNG") || id === "TỔNG KHÁCH HÀNG" || id === "TỔNG NHÀ CUNG CẤP") continue;

          const name = (row[1] || "").toString().trim();
          let debit = 0, credit = 0;

          if (isNewDebtFormat) {
            // File mới: Mã(0) Tên(1) Loại(2) Dư đầu kỳ(3) PS Nợ(4) PS Có(5) Dư cuối kỳ(6) Địa chỉ(7) MST(8) ĐT(9)
            const loai = (row[2] || "").toString().trim().toUpperCase();
            const duDauKy = Number(row[3]) || 0;
            // KH: Dư đầu kỳ > 0 → debit; NCC: Dư đầu kỳ > 0 → credit
            if (loai === "NCC" || id.startsWith("NCC")) {
              debit = 0; credit = duDauKy;
            } else {
              debit = duDauKy; credit = 0;
            }
          } else {
            // File cũ 18 cột: row[2] = phải thu, row[3] = thu trước/giảm trừ
            debit = Number(row[2]) || 0;
            credit = Number(row[3]) || 0;
          }

          state.partnerOpeningBalances[id] = { debit, credit };

          const idx = state.partners.findIndex(p => p.id === id);
          if (idx === -1) {
            const addrCol = isNewDebtFormat ? 7 : 5;
            const taxCol = isNewDebtFormat ? 8 : 6;
            const phoneCol = isNewDebtFormat ? 9 : 7;
            const loaiVal = isNewDebtFormat ? (row[2] || "").toString().trim().toUpperCase() : "";
            const pType = (loaiVal === "NCC" || id.startsWith("NCC")) ? "supplier" : "customer";
            state.partners.push({
              id, name,
              type: pType,
              phone: (row[phoneCol] || "").toString().trim(),
              email: "",
              address: (row[addrCol] || "").toString().trim(),
              taxCode: (row[taxCol] || "").toString().trim(),
              group: pType === "supplier" ? "NCC" : "KH",
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
        showToast(`Đã nạp số dư đầu kỳ cho ${count} đối tác (${isNewDebtFormat ? 'định dạng mới' : 'định dạng cũ'})!`, "success");
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
        let isDetailed = false;
        let headerIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          if (rows[r] && rows[r].includes("Số chứng từ") && rows[r].includes("Mã hàng")) {
            headerIdx = r;
            isDetailed = true;
            break;
          }
        }

        if (isDetailed) {
          let count = 0;
          const groupMap = new Map();
          const startRow = headerIdx + 1;
          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            const voucherId = (row[2] || "").toString().trim();
            if (!voucherId || voucherId.startsWith("TỔNG")) continue;

            if (!groupMap.has(voucherId)) {
              groupMap.set(voucherId, []);
            }
            groupMap.get(voucherId).push(row);
          }

          const partnerMap = new Map();
          state.partners.forEach(p => partnerMap.set(p.id, p));

          const productMap = new Map();
          state.products.forEach(p => productMap.set(p.id, p));

          const voucherMap = new Map();
          state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

          for (const [voucherId, voucherRows] of groupMap.entries()) {
            const firstRow = voucherRows[0];
            const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);

            const partnerIdRaw = (firstRow[7] || "").toString().trim();
            const partnerId = partnerIdRaw ? partnerIdRaw : `DT_${Math.floor(1000 + Math.random() * 9000)}`;
            const partnerName = (firstRow[8] || "Khách hàng vãng lai").toString().trim();
            const description = (firstRow[5] || "Bán hàng").toString().trim();

            if (!partnerMap.has(partnerId)) {
              const pObj = {
                id: partnerId,
                name: partnerName,
                type: "customer",
                phone: "",
                email: "",
                address: ""
              };
              state.partners.push(pObj);
              partnerMap.set(partnerId, pObj);
            }

            let paymentMethod = "131";
            const descUpper = description.toUpperCase();
            const nameUpper = partnerName.toUpperCase();
            if (descUpper.includes("TIỀN MẶT") || descUpper.includes("TM") || nameUpper.includes("BÁN LẺ") || nameUpper.includes("KHÁCH LẺ") || nameUpper.includes("VÃNG LAI")) {
              paymentMethod = "111";
            }

            const itemsArray = [];
            let totalVoucherAmount = 0;

            for (const row of voucherRows) {
              const productId = (row[9] || "SP_GENERIC").toString().trim();
              const productName = (row[10] || "Sản phẩm generic").toString().trim();
              const unit = (row[11] || "Cái").toString().trim();
              const qty = Number(row[12]) || 0;
              const price = Number(row[13]) || 0;
              const discountAmount = Number(row[15]) || 0;

              const grossAmount = qty * price;
              const amount = grossAmount - discountAmount;
              const discountPercent = grossAmount > 0 ? Math.round((discountAmount / grossAmount) * 100 * 100) / 100 : 0;

              itemsArray.push({
                productId: productId,
                qty: qty,
                price: price,
                discount: discountPercent,
                amount: amount
              });

              totalVoucherAmount += amount;

              if (!productMap.has(productId)) {
                const prodObj = {
                  id: productId,
                  name: productName,
                  unit: unit,
                  stock: 0,
                  avgCost: 0,
                  totalValue: 0
                };
                state.products.push(prodObj);
                productMap.set(productId, prodObj);
              }
            }

            const vObj = {
              id: voucherId,
              type: "sales",
              date: dateStr,
              partnerId: partnerId,
              partnerName: partnerName,
              paymentMethod: paymentMethod,
              description: description,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: totalVoucherAmount,
              amount: totalVoucherAmount,
              items: itemsArray
            };

            const existingIdx = voucherMap.get(voucherId);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(voucherId, state.vouchers.length - 1);
            }
            count++;
          }

          saveState();
          recalculateAccounting();
          showToast(`Đã nạp thành công ${count} chứng từ chi tiết bán hàng từ file Excel!`, "success");
          if (typeof filterSales === "function") filterSales();
          if (typeof renderDashboard === "function") renderDashboard();
        } else {
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
      }
      
      else if (type === 'purchase') {
        let count = 0;
        const groupMap = new Map();
        
        let startRow = 2;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const firstVal = (rows[i] ? rows[i][2] : "").toString().trim();
          if (firstVal === "Số chứng từ") {
            startRow = i + 1;
            break;
          }
        }

        let colQty = 13;
        let colPrice = 14;
        let colAmount = 17;

        let headerIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          if (rows[r] && rows[r].includes("Số chứng từ") && rows[r].includes("Mã hàng")) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx !== -1) {
          const header = rows[headerIdx];
          const qIdx = header.indexOf("Số lượng mua");
          const pIdx = header.indexOf("Đơn giá");
          const aIdx = header.indexOf("Giá trị mua");
          if (qIdx !== -1) colQty = qIdx;
          if (pIdx !== -1) colPrice = pIdx;
          if (aIdx !== -1) colAmount = aIdx;
        }

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          const voucherId = (row[2] || "").toString().trim();
          if (!voucherId || voucherId.startsWith("TỔNG")) continue;

          if (!groupMap.has(voucherId)) {
            groupMap.set(voucherId, []);
          }
          groupMap.get(voucherId).push(row);
        }

        const partnerMap = new Map();
        state.partners.forEach(p => partnerMap.set(p.id, p));

        const productMap = new Map();
        state.products.forEach(p => productMap.set(p.id, p));

        const voucherMap = new Map();
        state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

        const partnerId = "NCC_EXCEL";
        const partnerName = "Nhà cung cấp Sổ chi tiết";
        if (!partnerMap.has(partnerId)) {
          const pObj = {
            id: partnerId,
            name: partnerName,
            type: "supplier",
            phone: "",
            email: "",
            address: ""
          };
          state.partners.push(pObj);
          partnerMap.set(partnerId, pObj);
        }

        for (const [voucherId, voucherRows] of groupMap.entries()) {
          const firstRow = voucherRows[0];
          const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);
          const invoiceNo = firstRow[4] || "";
          const description = `Nhập kho mua hàng theo số hóa đơn ${invoiceNo || voucherId}`;

          const itemsArray = [];
          let totalVoucherAmount = 0;

          for (const row of voucherRows) {
            const productId = (row[5] || "SP_GENERIC").toString().trim();
            const productName = (row[6] || "Sản phẩm generic").toString().trim();
            const unit = (row[7] || "Cái").toString().trim();
            const qty = Number(row[colQty]) || 0;
            const price = Number(row[colPrice]) || 0;
            const amount = Number(row[colAmount]) || (qty * price);

            itemsArray.push({
              productId: productId,
              qty: qty,
              price: price,
              amount: amount
            });

            totalVoucherAmount += amount;

            if (!productMap.has(productId)) {
              const prodObj = {
                id: productId,
                name: productName,
                unit: unit,
                stock: 0,
                avgCost: 0,
                totalValue: 0
              };
              state.products.push(prodObj);
              productMap.set(productId, prodObj);
            }
          }

          const vObj = {
            id: voucherId,
            type: "purchase",
            date: dateStr,
            partnerId: partnerId,
            partnerName: partnerName,
            paymentMethod: "331",
            description: description,
            taxRate: 0,
            taxAmount: 0,
            totalAmount: totalVoucherAmount,
            amount: totalVoucherAmount,
            items: itemsArray
          };

          const existingIdx = voucherMap.get(voucherId);
          if (existingIdx !== undefined) {
            state.vouchers[existingIdx] = vObj;
          } else {
            state.vouchers.push(vObj);
            voucherMap.set(voucherId, state.vouchers.length - 1);
          }
          count++;
        }

        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} chứng từ mua hàng từ file Excel!`, "success");
        if (typeof filterPurchaseTable === "function") filterPurchaseTable();
        if (typeof renderPurchaseTable === "function") renderPurchaseTable();
      } else if (type === 'purchase_order') {
        let count = 0;
        
        // 1. Phân biệt định dạng
        let headerIdx = -1;
        let isDetailedFormat = false;

        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          const row = rows[r];
          if (row && (row.includes("Số chứng từ") || row.includes("Số đơn hàng"))) {
            headerIdx = r;
            if (row.includes("Mã hàng") || row.includes("Mã SP")) {
              isDetailedFormat = true;
            }
            break;
          }
        }

        const partnerMap = new Map();
        state.partners.forEach(p => partnerMap.set(p.id, p));

        const productMap = new Map();
        state.products.forEach(p => productMap.set(p.id, p));

        const voucherMap = new Map();
        state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

        if (isDetailedFormat) {
          // --- THẾ HỆ CŨ: SỔ CHI TIẾT ---
          const groupMap = new Map();
          let startRow = headerIdx !== -1 ? headerIdx + 1 : 2;

          let colQty = 13;
          let colPrice = 14;
          let colAmount = 17;

          if (headerIdx !== -1) {
            const header = rows[headerIdx];
            const qIdx = header.indexOf("Số lượng mua") !== -1 ? header.indexOf("Số lượng mua") : header.indexOf("Số lượng");
            const pIdx = header.indexOf("Đơn giá");
            const aIdx = header.indexOf("Giá trị mua") !== -1 ? header.indexOf("Giá trị mua") : header.indexOf("Thành tiền");
            if (qIdx !== -1) colQty = qIdx;
            if (pIdx !== -1) colPrice = pIdx;
            if (aIdx !== -1) colAmount = aIdx;
          }

          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            const voucherId = (row[2] || "").toString().trim();
            if (!voucherId || voucherId.startsWith("TỔNG")) continue;

            if (!groupMap.has(voucherId)) {
              groupMap.set(voucherId, []);
            }
            groupMap.get(voucherId).push(row);
          }

          const partnerId = "NCC_ORDER_EXCEL";
          const partnerName = "Nhà cung cấp Đơn đặt hàng Sổ chi tiết";
          if (!partnerMap.has(partnerId)) {
            const pObj = {
              id: partnerId,
              name: partnerName,
              type: "supplier",
              phone: "",
              email: "",
              address: ""
            };
            state.partners.push(pObj);
            partnerMap.set(partnerId, pObj);
          }

          for (const [voucherId, voucherRows] of groupMap.entries()) {
            const firstRow = voucherRows[0];
            const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);
            const invoiceNo = firstRow[4] || "";
            const description = `Đơn đặt hàng mua hàng theo số ${invoiceNo || voucherId}`;

            const itemsArray = [];
            let totalVoucherAmount = 0;

            for (const row of voucherRows) {
              const productId = (row[5] || "SP_GENERIC").toString().trim();
              const productName = (row[6] || "Sản phẩm generic").toString().trim();
              const unit = (row[7] || "Cái").toString().trim();
              const qty = Number(row[colQty]) || 0;
              const price = Number(row[colPrice]) || 0;
              const amount = Number(row[colAmount]) || (qty * price);

              itemsArray.push({
                productId: productId,
                qty: qty,
                price: price,
                amount: amount
              });

              totalVoucherAmount += amount;

              if (!productMap.has(productId)) {
                const prodObj = {
                  id: productId,
                  name: productName,
                  unit: unit,
                  stock: 0,
                  avgCost: 0,
                  totalValue: 0
                };
                state.products.push(prodObj);
                productMap.set(productId, prodObj);
              }
            }

            const vObj = {
              id: voucherId,
              type: "purchase_order",
              date: dateStr,
              partnerId: partnerId,
              partnerName: partnerName,
              paymentMethod: "331",
              description: description,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: totalVoucherAmount,
              amount: totalVoucherAmount,
              items: itemsArray
            };

            const existingIdx = voucherMap.get(voucherId);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(voucherId, state.vouchers.length - 1);
            }
            count++;
          }
        } else {
          // --- THẾ HỆ MỚI: DANH SÁCH ĐƠN MUA HÀNG (MẪU DON_MUA_HANG.XLSX) ---
          let startRow = headerIdx !== -1 ? headerIdx + 1 : 2;
          const header = headerIdx !== -1 ? rows[headerIdx] : [];

          const colDate = header.indexOf("Ngày đơn hàng") !== -1 ? header.indexOf("Ngày đơn hàng") : 1;
          const colId = header.indexOf("Số đơn hàng") !== -1 ? header.indexOf("Số đơn hàng") : 2;
          const colPartner = header.indexOf("Nhà cung cấp") !== -1 ? header.indexOf("Nhà cung cấp") : 4;
          const colDesc = header.indexOf("Diễn giải") !== -1 ? header.indexOf("Diễn giải") : 5;
          const colTotal = header.indexOf("Giá trị đơn hàng") !== -1 ? header.indexOf("Giá trị đơn hàng") : 6;

          // Đảm bảo có sản phẩm generic
          const genericProductId = "SP_GENERIC";
          const genericProductName = "Sản phẩm tổng hợp (Theo đơn hàng)";
          if (!productMap.has(genericProductId)) {
            const prodObj = {
              id: genericProductId,
              name: genericProductName,
              unit: "Cái",
              stock: 0,
              avgCost: 0,
              totalValue: 0
            };
            state.products.push(prodObj);
            productMap.set(genericProductId, prodObj);
          }

          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const voucherId = (row[colId] || "").toString().trim();
            if (!voucherId || voucherId === "" || voucherId.startsWith("TỔNG")) continue;

            const rawDate = row[colDate];
            const dateStr = excelDateToISOString(rawDate);
            const partnerInputVal = (row[colPartner] || "").toString().trim();
            const description = (row[colDesc] || "").toString().trim() || "Đơn đặt hàng nhập khẩu lịch sử";
            const totalAmount = Number(row[colTotal]) || 0;

            // Resolve/Create Partner
            const resolvedPartner = resolvePartner(partnerInputVal);
            const pId = resolvedPartner.id;
            const pName = resolvedPartner.name;

            if (!partnerMap.has(pId)) {
              const pObj = {
                id: pId,
                name: pName,
                type: "supplier",
                phone: "",
                email: "",
                address: ""
              };
              state.partners.push(pObj);
              partnerMap.set(pId, pObj);
            }

            // Create generic item list for the PO
            const itemsArray = [
              {
                productId: genericProductId,
                qty: 1,
                price: totalAmount,
                amount: totalAmount
              }
            ];

            const vObj = {
              id: voucherId,
              type: "purchase_order",
              date: dateStr,
              partnerId: pId,
              partnerName: pName,
              paymentMethod: "331",
              description: description,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: totalAmount,
              amount: totalAmount,
              items: itemsArray
            };

            const existingIdx = voucherMap.get(voucherId);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(voucherId, state.vouchers.length - 1);
            }
            count++;
          }
        }

        saveState();
        if (typeof executeSaveState === "function") {
          executeSaveState();
        }
        if (cloudSyncActive && firebaseDb) {
          showToast("⚡ Đã tự động sao lưu và đồng bộ lên đám mây!", "success");
        }
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} đơn đặt hàng từ file Excel!`, "success");
        if (typeof filterPurchaseOrderTable === "function") filterPurchaseOrderTable();
        if (typeof renderPurchaseOrderTable === "function") renderPurchaseOrderTable();
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
} catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  a.download = `RD_Accounting_Error_Logs_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
    const qty = parseInt(document.getElementById("quick-import-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(document.getElementById("quick-import-price").value.replace(/\D/g, "")) || 0;

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
  } catch (err) {
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
    const initialStock = parseInt(document.getElementById("edit-prod-initial-stock").value.replace(/\D/g, "")) || 0;
    const avgCost = parseInt(document.getElementById("edit-prod-avg-cost").value.replace(/\D/g, "")) || 0;
    const minStock = parseInt(document.getElementById("edit-prod-min-stock").value.replace(/\D/g, "")) || 0;
    const salePrice1 = parseInt(document.getElementById("edit-prod-sale-price").value.replace(/\D/g, "")) || 0;

    const nature = document.getElementById("edit-prod-nature").value;
    const group = document.getElementById("edit-prod-group").value.trim();
    const inactive = document.getElementById("edit-prod-inactive").checked;

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

// Khởi chạy đồng bộ logs UI ngay khi script load
setTimeout(() => {
  try {
    updateErrorLogsUI();
  } catch (e) {
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

function firebaseCollectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) {
    return collection.filter(Boolean);
  }
  if (typeof collection === 'object') {
    return Object.keys(collection).map(key => {
      const item = collection[key];
      if (item && typeof item === 'object') {
        // Nếu key là chỉ số mảng cũ (0, 1, 2...) thì giữ nguyên item.id gốc
        // Nếu key là ID thực (cấu trúc object mới) thì gán item.id từ key
        const isNumericKey = /^\d+$/.test(key);
        if (!isNumericKey) {
          item.id = unescapeFirebaseKey(key);
        }
        // Nếu key là số nhưng item không có id, dùng key làm id dự phòng
        if (!item.id) {
          item.id = unescapeFirebaseKey(key);
        }
        return item;
      }
      return null;
    }).filter(Boolean);
  }
  return [];
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

  // Chuyển đổi các collection dạng Object/Array của Firebase về Array chuẩn của local
  const collections = ['vouchers', 'partners', 'products', 'cashEntries', 'escrowItems'];
  collections.forEach(col => {
    if (copy[col]) {
      copy[col] = firebaseCollectionToArray(copy[col]);
    } else {
      copy[col] = [];
    }
  });

  // Chuyển đổi deletedIds dạng Object/Array về Array chuẩn
  if (copy.deletedIds) {
    if (Array.isArray(copy.deletedIds)) {
      copy.deletedIds = copy.deletedIds.filter(Boolean);
    } else if (typeof copy.deletedIds === 'object') {
      copy.deletedIds = Object.keys(copy.deletedIds).map(unescapeFirebaseKey);
    } else {
      copy.deletedIds = [];
    }
  } else {
    copy.deletedIds = [];
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
  } catch (e) {
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
  } catch (err) {
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
    _incrementalListenersActive = false;

    let hasPulledOnStartup = false;
    let hasRegisteredListener = false;

    // Lắng nghe kết nối mạng từ Firebase
    const connectedRef = firebaseDb.ref(".info/connected");
    connectedRef.on("value", (snap) => {
      if (snap.val() === true) {
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");

        if (!hasPulledOnStartup) {
          hasPulledOnStartup = true;
          showToast("Đã kết nối đám mây thời gian thực thành công!", "success");
          pullFromCloudOnStartup();
        }

        if (!hasRegisteredListener) {
          hasRegisteredListener = true;
          listenToCloudChanges();
        }
      } else {
        updateCloudSyncBadge(false, "Mây: Ngoại tuyến", "#ef4444");
      }
    });

    const forcePullBtn = document.getElementById("btn-force-pull");
    if (forcePullBtn) forcePullBtn.style.display = "inline-block";
    const forcePushBtn = document.getElementById("btn-force-push");
    if (forcePushBtn) forcePushBtn.style.display = "inline-block";
  } catch (err) {
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
        const cloudData = unescapeFirebaseObject(rawData);

        // Online-First: Ghi đè hoàn toàn dữ liệu cục bộ bằng dữ liệu chuẩn từ Cloud
        state = cloudData;
        localStorage.setItem("rd_accounting_db", JSON.stringify(state));
        console.log("[CloudSync] Đã tải và ghi đè dữ liệu chuẩn từ Cloud lúc khởi động!");

        // Khởi tạo trạng thái đồng bộ tăng trưởng từ dữ liệu cloud tải về
        _lastSyncedState = JSON.parse(JSON.stringify(cloudData));
        _syncStartupTime = Date.now();
        initIncrementalListeners();

        // [FIX 5] Mở cờ cho phép push SAU KHI đã pull xong
        _cloudPullCompleted = true;

        // Cập nhật giao diện
        recalculateAccounting();
        renderDashboard();
        filterDebts();
        filterPartners();
        filterCash();
      } else {
        // Cơ sở dữ liệu đám mây trống (Lần kết nối đầu tiên) -> Tự động đẩy dữ liệu cục bộ (đã nạp từ Excel) lên đám mây
        console.log("Cơ sở dữ liệu đám mây trống. Tự động đồng bộ ngược dữ liệu cục bộ lên đám mây...");
        
        _lastSyncedState = {
          vouchers: [],
          partners: [],
          products: [],
          cashEntries: [],
          escrowItems: [],
          deletedIds: [],
          _lastModified: 0
        };
        _syncStartupTime = Date.now();
        initIncrementalListeners();

        _cloudPullCompleted = true;
        pushToCloud();
      }
    })
    .catch((err) => {
      // [FIX 7] Nếu pull thất bại (mất mạng), vẫn cho phép push sau 10 giây
      // để không bị kẹt vĩnh viễn nếu mạng đứt lúc khởi động
      console.warn("[CloudSync] Pull thất bại, sẽ cho phép push sau 10 giây.");
      setTimeout(() => { 
        _syncStartupTime = Date.now();
        initIncrementalListeners();
        _cloudPullCompleted = true; 
      }, 10000);
      if (typeof addErrorLog === "function") {
        addErrorLog("pullFromCloudOnStartup", err.message, err);
      }
    });
}

function forcePushToCloud() {
  if (!cloudSyncActive || !firebaseDb) {
    showToast("Ứng dụng chưa kết nối đám mây!", "danger");
    return;
  }

  if (confirm("Bạn có chắc chắn muốn ĐẨY toàn bộ dữ liệu cục bộ hiện tại (bao gồm lịch sử bán hàng) và GHI ĐÈ dữ liệu trên đám mây?")) {
    updateCloudSyncBadge(false, "Mây: Đang đẩy...", "#f59e0b");
    
    // Đảm bảo cập nhật timestamp sửa đổi cục bộ trước khi đẩy
    state._lastModified = Date.now();
    saveState();

    pushToCloud(true)
      .then(() => {
        showToast("Đã đồng bộ hóa ngược lên đám mây thành công!", "success");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      })
      .catch((err) => {
        if (typeof addErrorLog === "function") {
          addErrorLog("forcePushToCloud", err.message, err);
        }
        showToast("Lỗi đồng bộ đám mây: " + err.message, "danger");
        updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
      });
  }
}

function forcePullFromCloud() {
  if (!cloudSyncActive || !firebaseDb) {
    showToast("Ứng dụng chưa kết nối Đám mây!", "danger");
    return;
  }

  if (confirm("Bạn có chắc chắn muốn TẢI VỀ và GHI ĐÈ toàn bộ dữ liệu hiện tại bằng dữ liệu trên đám mây?")) {
    updateCloudSyncBadge(false, "Mây: Đang tải...", "#f59e0b");
    firebaseDb.ref("rd_accounting_db").once("value")
      .then((snapshot) => {
        const rawData = snapshot.val();
        if (rawData) {
          const data = unescapeFirebaseObject(rawData);
          state = data;
          localStorage.setItem("rd_accounting_db", JSON.stringify(state));

          // Reset baseline đồng bộ tăng trưởng
          _lastSyncedState = JSON.parse(JSON.stringify(data));
          _syncStartupTime = Date.now();
          initIncrementalListeners();

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
}

// ==========================================================================
// SMART MERGE — Gộp dữ liệu từ 2 máy, tránh mất dữ liệu khi ghi đồng thời
// ==========================================================================

/**
 * Ghi nhận các ID vừa bị xóa vào state.deletedIds
 * để cơ chế Smart Merge không kéo lại dữ liệu đã xóa từ máy khác.
 */
function trackDeletedIds(ids) {
  if (!ids || ids.length === 0) return;
  if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
  ids.forEach(id => {
    if (!state.deletedIds.includes(id)) {
      state.deletedIds.push(id);
    }
  });
  // Giới hạn deletedIds tối đa 2000 phần tử (FIFO) để tránh đầy localStorage
  if (state.deletedIds.length > 2000) {
    state.deletedIds = state.deletedIds.slice(-2000);
  }
  state._lastModified = Date.now();
}

/**
 * Gộp 2 mảng theo trường `id`, ưu tiên giữ lại TẤT CẢ phần tử từ cả 2 nguồn.
 * Nếu cùng id: giữ phiên bản có _updatedAt mới hơn (hoặc cloud nếu không có).
 * Các id nằm trong deletedIds sẽ bị loại bỏ.
 */
function mergeArrayById(localArr, cloudArr, deletedIds) {
  const deleted = new Set(deletedIds || []);
  const map = new Map();

  // Nạp local trước
  (localArr || []).forEach(item => {
    if (item && item.id && !deleted.has(item.id)) {
      map.set(item.id, item);
    }
  });

  // Merge cloud: nếu id chưa có → thêm vào; nếu đã có → so timestamp giữ cái mới hơn
  (cloudArr || []).forEach(item => {
    if (!item || !item.id || deleted.has(item.id)) return;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    } else {
      const localItem = map.get(item.id);
      const localTs = localItem._updatedAt || 0;
      const cloudTs = item._updatedAt || 0;
      if (cloudTs >= localTs) {
        map.set(item.id, item); // cloud mới hơn → thay thế
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Merge thông minh: gộp localState và cloudState, giữ lại tất cả dữ liệu.
 * Trả về state đã merge sẵn sàng để lưu và push lên cloud.
 */
function mergeStates(localState, cloudState) {
  if (!localState) return cloudState;
  if (!cloudState) return localState;

  const cloudTs = cloudState._lastModified || 0;
  const localTs = localState._lastModified || 0;

  // [FIX 8] XÓA BỎ logic "local wins hoàn toàn" khi local mới hơn 5 phút
  // Logic cũ gây mất dữ liệu: Máy A tắt lâu → bật lên → recalculate cập nhật
  // timestamp local thành "mới nhất" → lần merge tiếp theo bỏ qua hết cloud data.
  // Thay vào đó, LUÔN merge đầy đủ cả 2 nguồn dữ liệu.

  // Gộp deletedIds từ cả 2 nguồn để không tái xuất hiện dữ liệu đã xóa
  const mergedDeletedIds = Array.from(
    new Set([
      ...(localState.deletedIds || []),
      ...(cloudState.deletedIds || [])
    ])
  );

  const merged = {
    // Cloud wins cho scalar fields (tên công ty, năm tài chính...)
    ...cloudState,

    // Merge arrays theo ID — giữ tất cả, loại bỏ deletedIds
    vouchers: mergeArrayById(localState.vouchers, cloudState.vouchers, mergedDeletedIds),
    cashEntries: mergeArrayById(localState.cashEntries, cloudState.cashEntries, mergedDeletedIds),
    partners: mergeArrayById(localState.partners, cloudState.partners, mergedDeletedIds),
    escrowItems: mergeArrayById(localState.escrowItems, cloudState.escrowItems, mergedDeletedIds),
    products: mergeArrayById(localState.products, cloudState.products, mergedDeletedIds),

    // Giữ danh sách đã xóa hợp nhất
    deletedIds: mergedDeletedIds,

    // Timestamp của bản merge = max của 2 máy
    _lastModified: Math.max(cloudTs, localTs)
  };

  console.log(`[SmartMerge] Kết quả: ${merged.vouchers.length} vouchers, ${merged.cashEntries ? merged.cashEntries.length : 0} cashEntries, ${merged.partners.length} partners.`);
  return merged;
}

let _lastSyncedState = null;
let _syncStartupTime = 0;
let _incrementalListenersActive = false;

let isPushing = false;
let pushPending = false;
let _isMergePushing = false;
let _pendingCloudEvents = []; // Hàng đợi sự kiện từ Cloud trong khi đang push

async function pushToCloud(forceFullPush = false) {
  if (!cloudSyncActive || !firebaseDb) return;
  if (isPushing) {
    pushPending = true;
    return;
  }
  isPushing = true;
  pushPending = false;
  _isMergePushing = true;
  _pendingCloudEvents = []; // Xóa hàng đợi cũ khi bắt đầu push mới
  const _lastPushedIds = new Set(); // Theo dõi các ID do chính lần push này tạo ra

  if (typeof updateCloudSyncBadge === "function") {
    updateCloudSyncBadge(false, "Mây: Đang đẩy...", "#f59e0b");
  }

  try {
    if (!state._lastModified) {
      state._lastModified = Date.now();
    }

    const escapedState = escapeFirebaseObject(state);
    const collections = ['vouchers', 'partners', 'products', 'cashEntries', 'escrowItems'];

    const isFullPush = forceFullPush || !_lastSyncedState;

    if (isFullPush) {
      console.log("[CloudSync] Thực hiện đẩy toàn bộ dữ liệu lên cloud...");
      
      // 1. Ghi nhận cờ _isSyncing = true lên Cloud đầu tiên
      await firebaseDb.ref("rd_accounting_db/_isSyncing").set(true);

      // 2. Đẩy metadata và cấu hình nhỏ
      const { vouchers, partners, products, cashEntries, escrowItems, deletedIds, ...metadata } = escapedState;
      const metaWithoutTs = { ...metadata };
      delete metaWithoutTs._lastModified;
      await firebaseDb.ref("rd_accounting_db").update(metaWithoutTs);

      // 3. Đẩy các collections dạng Object (được khóa bởi ID đã escaped)
      for (const col of collections) {
        const colObj = {};
        const items = escapedState[col] || [];
        items.forEach(item => {
          if (item && item.id) {
            const escapedId = escapeFirebaseKey(item.id);
            colObj[escapedId] = item;
          }
        });
        // Sử dụng .set() để ghi đè cấu trúc mảng cũ thành cấu trúc đối tượng mới
        await firebaseDb.ref(`rd_accounting_db/${col}`).set(colObj);
      }

      // 4. Đẩy deletedIds dưới dạng Object
      const deletedObj = {};
      const delIds = escapedState.deletedIds || [];
      delIds.forEach(id => {
        if (id) {
          deletedObj[escapeFirebaseKey(id)] = Date.now();
        }
      });
      await firebaseDb.ref("rd_accounting_db/deletedIds").set(deletedObj);

      // 5. Cập nhật timestamp sửa đổi cuối
      await firebaseDb.ref("rd_accounting_db/_lastModified").set(escapedState._lastModified);

      // 6. Gỡ cờ _isSyncing = false
      await firebaseDb.ref("rd_accounting_db/_isSyncing").set(false);

    } else {
      // ĐỒNG BỘ TĂNG TRƯỞNG (INCREMENTAL SYNC)
      console.log("[CloudSync] Thực hiện đồng bộ tăng trưởng...");

      // Tách cấu hình chung và so sánh
      const { vouchers, partners, products, cashEntries, escrowItems, deletedIds, ...metadata } = escapedState;
      const { vouchers: sV, partners: sPa, products: sPr, cashEntries: sC, escrowItems: sE, deletedIds: sDel, ...sMeta } = _lastSyncedState;

      // So sánh cấu hình chung, nếu khác thì cập nhật
      const metaUpdates = {};
      let hasMetaChanges = false;
      for (const key in metadata) {
        if (JSON.stringify(metadata[key]) !== JSON.stringify(sMeta[key])) {
          metaUpdates[key] = metadata[key];
          hasMetaChanges = true;
        }
      }
      if (hasMetaChanges) {
        console.log("[IncrementalSync] Đẩy thay đổi cho cấu hình chung:", Object.keys(metaUpdates));
        await firebaseDb.ref("rd_accounting_db").update(metaUpdates);
      }

      const syncTime = Date.now();

      // So sánh từng collection
      for (const col of collections) {
        const localItems = escapedState[col] || [];
        const syncedItems = _lastSyncedState[col] || [];

        const localMap = new Map();
        localItems.forEach(item => { if (item && item.id) localMap.set(item.id, item); });

        const syncedMap = new Map();
        syncedItems.forEach(item => { if (item && item.id) syncedMap.set(item.id, item); });

        // Tìm phần tử thêm hoặc sửa
        const updates = {};
        let hasUpdates = false;

        localMap.forEach((item, id) => {
          const syncedItem = syncedMap.get(id);
          if (!syncedItem || JSON.stringify(item) !== JSON.stringify(syncedItem)) {
            // Đánh dấu mốc thời gian sửa đổi cho phần tử này
            item._updatedAt = syncTime;
            
            const escapedId = escapeFirebaseKey(id);
            updates[escapedId] = item;
            hasUpdates = true;
          }
        });

        if (hasUpdates) {
          console.log(`[IncrementalSync] Đẩy cập nhật cho ${col}:`, Object.keys(updates));
          // Ghi nhận các ID vừa push để lọc self-echo trong hàng đợi
          Object.keys(updates).forEach(eid => _lastPushedIds.add(eid));
          await firebaseDb.ref(`rd_accounting_db/${col}`).update(updates);
        }

        // Tìm phần tử bị xóa
        const deletes = [];
        syncedMap.forEach((item, id) => {
          if (!localMap.has(id)) {
            deletes.push(id);
          }
        });

        if (deletes.length > 0) {
          console.log(`[IncrementalSync] Đẩy yêu cầu xóa cho ${col}:`, deletes);
          const deletePayload = {};
          const deletedIdsPayload = {};
          
          deletes.forEach(id => {
            const escapedId = escapeFirebaseKey(id);
            deletePayload[escapedId] = null;
            deletedIdsPayload[escapedId] = syncTime;
          });

          // Xóa trên nhánh của collection
          await firebaseDb.ref(`rd_accounting_db/${col}`).update(deletePayload);
          // Ghi vào nhánh deletedIds
          await firebaseDb.ref("rd_accounting_db/deletedIds").update(deletedIdsPayload);
        }
      }

      // Xử lý deletedIds mới được thêm mà không thông qua việc so sánh mảng (đã có sẵn trong localData.deletedIds)
      const localDelIds = escapedState.deletedIds || [];
      const syncedDelIds = _lastSyncedState.deletedIds || [];
      const newDelIds = localDelIds.filter(id => id && !syncedDelIds.includes(id));
      if (newDelIds.length > 0) {
        console.log("[IncrementalSync] Đẩy thêm deletedIds:", newDelIds);
        const delPayload = {};
        newDelIds.forEach(id => {
          delPayload[escapeFirebaseKey(id)] = syncTime;
        });
        await firebaseDb.ref("rd_accounting_db/deletedIds").update(delPayload);
      }

      // Cập nhật timestamp chung
      await firebaseDb.ref("rd_accounting_db/_lastModified").set(escapedState._lastModified);
    }

    // Cập nhật lại _lastSyncedState thành bản sao của state hiện tại
    _lastSyncedState = JSON.parse(JSON.stringify(state));

    console.log("Đã đồng bộ hóa dữ liệu thành công!");
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(true, "Mây: Đã kết nối", "#10b981");
    }
  } catch (err) {
    console.error("Lỗi khi đồng bộ dữ liệu lên đám mây:", err);
    if (typeof addErrorLog === "function") {
      addErrorLog("pushToCloud", err.message, err);
    }
    if (typeof updateCloudSyncBadge === "function") {
      updateCloudSyncBadge(false, "Mây: Lỗi đẩy", "#ef4444");
    }
    // Khi push thất bại → retry sau 5 giây để không mất dữ liệu
    setTimeout(() => {
      if (cloudSyncActive && firebaseDb && !isPushing) {
        console.log("[CloudSync] Thử lại push sau lỗi...");
        pushPending = false;
        pushToCloud(forceFullPush);
      }
    }, 5000);
  } finally {
    // [FIX] Lưu lại _updatedAt vào localStorage sau khi push hoàn tất
    try {
      localStorage.setItem("rd_accounting_db", JSON.stringify(state));
    } catch(e) { /* ignore */ }

    isPushing = false;
    _isMergePushing = false;

    // [FIX] Xử lý hàng đợi sự kiện từ Cloud nhận trong lúc đang push
    // (trước đây bị bỏ qua vĩnh viễn → mất dữ liệu từ máy khác)
    if (_pendingCloudEvents.length > 0) {
      // Lọc bỏ self-echo: sự kiện do chính lần push này tạo ra
      const externalEvents = _pendingCloudEvents.filter(evt => {
        if (evt.snapshot && evt.snapshot.key) {
          return !_lastPushedIds.has(evt.snapshot.key);
        }
        return true;
      });
      const selfEchoCount = _pendingCloudEvents.length - externalEvents.length;
      _pendingCloudEvents = [];
      if (externalEvents.length > 0) {
        console.log(`[CloudSync] Xử lý ${externalEvents.length} sự kiện từ máy khác đã xếp hàng đợi (lọc ${selfEchoCount} self-echo)...`);
        externalEvents.forEach(evt => {
          if (evt.type === 'update') {
            handleIncrementalUpdate(evt.collectionName, evt.snapshot);
          } else if (evt.type === 'delete') {
            handleIncrementalDelete(evt.snapshot);
          }
        });
      }
    }

    if (pushPending) {
      pushPending = false;
      setTimeout(() => pushToCloud(forceFullPush), 100);
    }
  }
}

async function getCloudArrayLength(path) {
  try {
    const snap = await firebaseDb.ref(path).orderByKey().limitToLast(1).once("value");
    if (!snap.exists()) return 0;
    let lastKey = 0;
    snap.forEach(child => {
      lastKey = parseInt(child.key) || 0;
    });
    return lastKey + 1;
  } catch (e) {
    console.warn(`Error getting length for ${path}:`, e);
    return 0;
  }
}

function listenToCloudChanges() {
  // Không dùng listener root .on("value") nữa để tối ưu hiệu năng.
  // Các bộ lắng nghe tăng trưởng sẽ tự động kích hoạt sau khi pull xong ở startup.
}

function initIncrementalListeners() {
  if (!cloudSyncActive || !firebaseDb) return;
  if (_incrementalListenersActive) return;
  _incrementalListenersActive = true;

  console.log(`[CloudSync] Bắt đầu lắng nghe toàn bộ các sự kiện thay đổi thời gian thực...`);

  const collections = ['vouchers', 'partners', 'products', 'cashEntries', 'escrowItems'];

  collections.forEach(col => {
    const colRef = firebaseDb.ref(`rd_accounting_db/${col}`);
    
    // Tắt các lắng nghe cũ nếu có
    colRef.off();

    // Lắng nghe phần tử được thêm mới hoặc cập nhật thời gian thực
    colRef.on("child_added", (snapshot) => {
      handleIncrementalUpdate(col, snapshot);
    });

    colRef.on("child_changed", (snapshot) => {
      handleIncrementalUpdate(col, snapshot);
    });
  });

  // Lắng nghe các ID bị xóa
  const deletedRef = firebaseDb.ref("rd_accounting_db/deletedIds");
  deletedRef.off();
  deletedRef.on("child_added", (snapshot) => {
    handleIncrementalDelete(snapshot);
  });
}

let renderTimeout = null;
function triggerUIRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    console.log("[CloudSync] Thực hiện gom nhóm render lại giao diện...");
    recalculateAccounting();
    renderDashboard();
    filterDebts();
    filterPartners();
    filterCash();
  }, 50); // Hoãn 50ms để gộp nhiều sự kiện
}

function handleIncrementalUpdate(collectionName, snapshot) {
  const rawItem = snapshot.val();
  if (!rawItem) return;

  const unescapedKey = unescapeFirebaseKey(snapshot.key);
  
  // Clone đối tượng để tránh sửa trực tiếp
  const item = { ...rawItem };
  item.id = unescapedKey;

  // Sử dụng state trong bộ nhớ trực tiếp thay vì parse localStorage (tránh đơ UI khi dữ liệu lớn)
  let localData = state;
  if (!localData) return;
  if (!localData[collectionName]) localData[collectionName] = [];

  // Tìm xem item đã tồn tại trong local chưa
  const index = localData[collectionName].findIndex(x => x && x.id === item.id);
  const localItem = index !== -1 ? localData[collectionName][index] : null;

  // Online-First: Nếu dữ liệu cục bộ và dữ liệu nhận về giống hệt nhau, bỏ qua không xử lý
  if (localItem && JSON.stringify(localItem) === JSON.stringify(item)) {
    return;
  }

  console.log(`[IncrementalSync] Nhận cập nhật từ cloud cho ${collectionName}/${item.id}`);

  // Cập nhật vào mảng cục bộ
  if (index !== -1) {
    localData[collectionName][index] = item;
  } else {
    localData[collectionName].push(item);
  }

  // Cập nhật timestamp của database cục bộ
  localData._lastModified = Date.now();

  // Lưu lại và đồng bộ biến toàn cục
  state = localData;
  localStorage.setItem("rd_accounting_db", JSON.stringify(state));

  // Cập nhật bản sao đã đồng bộ để tránh push lại chính nó
  if (_lastSyncedState) {
    if (!_lastSyncedState[collectionName]) _lastSyncedState[collectionName] = [];
    const syncIndex = _lastSyncedState[collectionName].findIndex(x => x && x.id === item.id);
    if (syncIndex !== -1) {
      _lastSyncedState[collectionName][syncIndex] = item;
    } else {
      _lastSyncedState[collectionName].push(item);
    }
    _lastSyncedState._lastModified = localData._lastModified;
  }

  // Kích hoạt render lại giao diện (được debounce)
  triggerUIRender();
}

function handleIncrementalDelete(snapshot) {
  const deletedId = unescapeFirebaseKey(snapshot.key);
  const timestamp = snapshot.val();

  console.log(`[IncrementalSync] Nhận yêu cầu xóa ID: ${deletedId} từ cloud (TS: ${timestamp})`);

  let localData = state;
  if (!localData) return;

  let changed = false;
  
  // Xóa khỏi các collection
  const collections = ['vouchers', 'partners', 'products', 'cashEntries', 'escrowItems'];
  collections.forEach(col => {
    if (localData[col]) {
      const originalLength = localData[col].length;
      localData[col] = localData[col].filter(x => x && x.id !== deletedId);
      if (localData[col].length !== originalLength) {
        changed = true;
      }
    }
  });

  // Đưa vào danh sách deletedIds cục bộ nếu chưa có
  if (!localData.deletedIds) localData.deletedIds = [];
  if (!localData.deletedIds.includes(deletedId)) {
    localData.deletedIds.push(deletedId);
    changed = true;
  }

  if (changed) {
    localData._lastModified = Date.now();
    state = localData;
    localStorage.setItem("rd_accounting_db", JSON.stringify(state));

    // Cập nhật bản sao đã đồng bộ
    if (_lastSyncedState) {
      collections.forEach(col => {
        if (_lastSyncedState[col]) {
          _lastSyncedState[col] = _lastSyncedState[col].filter(x => x && x.id !== deletedId);
        }
      });
      if (!_lastSyncedState.deletedIds) _lastSyncedState.deletedIds = [];
      if (!_lastSyncedState.deletedIds.includes(deletedId)) {
        _lastSyncedState.deletedIds.push(deletedId);
      }
      _lastSyncedState._lastModified = localData._lastModified;
    }

    triggerUIRender();
  }
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
  } catch (err) {
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

    saveState();
    recalculateAccounting();

    const master = document.getElementById("check-all-purchase");
    if (master) master.checked = false;

    updateBatchPurchasesUI();

    renderPurchaseTable();
    if (typeof filterSales === "function") filterSales();
    if (typeof filterCash === "function") {
      filterCash();
      if (typeof recalculateCashKpis === "function") recalculateCashKpis();
    }
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof renderInventoryTable === "function") renderInventoryTable();

    showToast(`Đã xóa thành công ${checked.length} chứng từ mua hàng!`, "success");
  }
}

function exportPurchasesToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredPurchases = state.vouchers.filter(v => v.type === "purchase");

  const query = document.getElementById("search-purchase") ? document.getElementById("search-purchase").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-purchase-from") ? document.getElementById("search-purchase-from").value : "";
  const toDate = document.getElementById("search-purchase-to") ? document.getElementById("search-purchase-to").value : "";

  if (query) {
    filteredPurchases = filteredPurchases.filter(v =>
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
    );
  }
  if (fromDate) filteredPurchases = filteredPurchases.filter(v => v.date >= fromDate);
  if (toDate) filteredPurchases = filteredPurchases.filter(v => v.date <= toDate);
  filteredPurchases.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    // --- Style presets ---
    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const headerBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const subHeaderBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
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

    // Xác định phạm vi ngày
    const today = new Date().toLocaleDateString('vi-VN');
    let dateRangeText = `Từ ngày: ${fromDate || 'đầu kỳ'}   Đến ngày: ${toDate || today}`;

    // --- ROW 0: Tiêu đề chính ---
    const compName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
    setCell(ws, 0, 0, compName, 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 21 } });

    // --- ROW 1: Tên báo cáo ---
    setCell(ws, 1, 0, "SỔ CHI TIẾT MUA HÀNG THEO MÃ QUY CÁCH", 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 21 } });

    // --- ROW 2: Phạm vi ngày ---
    setCell(ws, 2, 0, dateRangeText, 's', { font: fntSub, alignment: cCenter }, null);
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 21 } });

    // --- ROW 3: Header cột ---
    const headers = ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Ngày hóa đơn", "Số hóa đơn", "Mã hàng", "Tên hàng", "ĐVT", "Mã quy cách 1", "Mã quy cách 2", "Mã quy cách 3", "Mã quy cách 4", "Mã quy cách 5", "Số lượng mua", "Đơn giá", "Phí trước hải quan", "Phí hàng về kho", "Giá trị mua", "Chiết khấu", "Số lượng trả lại", "Giá trị trả lại", "Giá trị giảm giá"];
    headers.forEach((h, c) => {
      setCell(ws, 3, c, h, 's', { font: fntHdr, fill: headerBg, alignment: cCenter, border: border4 }, null);
    });

    // --- ROWS DATA: 1 dòng/sản phẩm ---
    let rowIdx = 4;
    let totalGross = 0;
    let totalTax = 0;
    let totalAmt = 0;

    filteredPurchases.forEach((v, vIdx) => {
      const partnerName = v.partnerName || getPartnerNameForVoucher(v);
      const rowBg = vIdx % 2 === 0 ? null : altBg;
      const baseStyle = (align) => ({ font: fntNorm, fill: rowBg, alignment: align, border: border4 });
      const numStyle = (align) => ({ font: fntNorm, fill: rowBg, alignment: align || cRight, border: border4 });

      if (v.items && v.items.length > 0) {
        v.items.forEach(item => {
          const prod = state.products ? state.products.find(p => p.id === item.productId) : null;
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
          setCell(ws, rowIdx, 8, "", 's', baseStyle(cLeft), null);  // Mã quy cách 1
          setCell(ws, rowIdx, 9, "", 's', baseStyle(cLeft), null);  // Mã quy cách 2
          setCell(ws, rowIdx, 10, "", 's', baseStyle(cLeft), null);  // Mã quy cách 3
          setCell(ws, rowIdx, 11, "", 's', baseStyle(cLeft), null);  // Mã quy cách 4
          setCell(ws, rowIdx, 12, "", 's', baseStyle(cLeft), null);  // Mã quy cách 5
          setCell(ws, rowIdx, 13, item.qty || 0, 'n', numStyle(cRight), "#,##0.##");
          setCell(ws, rowIdx, 14, item.price || 0, 'n', numStyle(cRight), numFmt);
          setCell(ws, rowIdx, 15, 0, 'n', numStyle(cRight), numFmt);  // Phí trước HQ
          setCell(ws, rowIdx, 16, 0, 'n', numStyle(cRight), numFmt);  // Phí hàng về kho
          setCell(ws, rowIdx, 17, itemGross - discVal, 'n', numStyle(cRight), numFmt);  // Giá trị mua
          setCell(ws, rowIdx, 18, discVal, 'n', numStyle(cRight), numFmt);  // Chiết khấu
          setCell(ws, rowIdx, 19, 0, 'n', numStyle(cRight), "#,##0.##");  // Số lượng trả lại
          setCell(ws, rowIdx, 20, 0, 'n', numStyle(cRight), numFmt);  // Giá trị trả lại
          setCell(ws, rowIdx, 21, 0, 'n', numStyle(cRight), numFmt);  // Giá trị giảm giá

          totalGross += itemGross - discVal;
          rowIdx++;
        });
      } else {
        // Phiếu không có chi tiết sản phẩm → xuất 1 dòng tổng
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

      totalTax += v.taxAmount || 0;
      totalAmt += v.totalAmount || 0;
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

    // Thiết lập metadata sheet
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

    XLSX.utils.book_append_sheet(wb, ws, "Mua hang");

    let dateRangeSuffix = "";
    if (fromDate || toDate) dateRangeSuffix = `_${fromDate || ""}_${toDate || ""}`;
    const outName = `Mua_hang_chi_tiet_${new Date().toISOString().split('T')[0]}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel mua hàng: ${err.message}`, "danger");
  }
}

function toggleSelectAllEscrows(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".escrow-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchEscrowsUI();
}

function updateBatchEscrowsUI() {
  const checkboxes = document.querySelectorAll(".escrow-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-escrow");
  const count = document.getElementById("selected-escrows-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-escrow");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteEscrows() {
  const checked = Array.from(document.querySelectorAll(".escrow-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} chứng từ ký quỹ đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    saveState();
    recalculateAccounting();

    const master = document.getElementById("check-all-escrow");
    if (master) master.checked = false;

    updateBatchEscrowsUI();

    renderEscrowTable();
    if (typeof filterSales === "function") filterSales();
    if (typeof filterCash === "function") {
      filterCash();
      if (typeof recalculateCashKpis === "function") recalculateCashKpis();
    }
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof renderInventoryTable === "function") renderInventoryTable();

    showToast(`Đã xóa thành công ${checked.length} chứng từ ký quỹ!`, "success");
  }
}

function exportEscrowsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  let filteredEscrows = state.vouchers.filter(v => v.type.startsWith("escrow_"));

  const query = document.getElementById("search-escrow") ? document.getElementById("search-escrow").value.toLowerCase() : "";
  const fromDate = document.getElementById("search-escrow-from") ? document.getElementById("search-escrow-from").value : "";
  const toDate = document.getElementById("search-escrow-to") ? document.getElementById("search-escrow-to").value : "";

  if (query) {
    filteredEscrows = filteredEscrows.filter(v =>
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
    );
  }
  if (fromDate) filteredEscrows = filteredEscrows.filter(v => v.date >= fromDate);
  if (toDate) filteredEscrows = filteredEscrows.filter(v => v.date <= toDate);
  filteredEscrows.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true }));

  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const headerBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totalBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const fntTitle = { name: "Times New Roman", sz: 13, bold: true };
    const fntHdr = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const fntBold = { name: "Times New Roman", sz: 11, bold: true };
    const fntNorm = { name: "Times New Roman", sz: 11 };
    const cCenter = { horizontal: "center", vertical: "center" };
    const cLeft = { horizontal: "left", vertical: "center", wrapText: true };
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

    const typeNames = {
      escrow_pay: "Chi ký quỹ đi (Tài sản)",
      escrow_receive: "Nhận ký quỹ về (Nợ phải trả)",
      escrow_refund_pay: "Tất toán ký quỹ đi",
      escrow_refund_receive: "Tất toán nhận ký quỹ"
    };

    // ROW 0: Tiêu đề
    const compName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
    setCell(ws, 0, 0, compName, 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

    // ROW 1: Tên báo cáo
    setCell(ws, 1, 0, "DANH SÁCH CHỨNG TỪ KÝ QUỸ", 's', { font: fntTitle, alignment: cCenter }, null);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

    // ROW 2: Headers cột
    const headers = ["Ngày chứng từ", "Số chứng từ", "Đối tác liên quan", "Loại nghiệp vụ", "Diễn giải", "Tài khoản", "Số tiền ký quỹ", "Trạng thái"];
    headers.forEach((h, c) => {
      setCell(ws, 2, c, h, 's', { font: fntHdr, fill: headerBg, alignment: cCenter, border: border4 }, null);
    });

    // DATA ROWS
    let rowIdx = 3;
    let totalAmt = 0;
    filteredEscrows.forEach((v, idx) => {
      const bg = idx % 2 === 0 ? null : altBg;
      const bs = (al) => ({ font: fntNorm, fill: bg, alignment: al, border: border4 });
      const acct = v.type.includes("receive") || v.type.includes("refund_receive")
        ? (state.accountingStandard === "TT200" ? "344" : "3386")
        : (state.accountingStandard === "TT200" ? "244" : "1386");
      const status = v.type.includes("refund") ? "Đã tất toán" : "Đang hiệu lực";

      setCell(ws, rowIdx, 0, dateStrToSerial(v.date), 'n', bs(cCenter), dateFmt);
      setCell(ws, rowIdx, 1, v.id, 's', bs(cCenter), null);
      setCell(ws, rowIdx, 2, v.partnerName || getPartnerNameForVoucher(v), 's', bs(cLeft), null);
      setCell(ws, rowIdx, 3, typeNames[v.type] || "Ký quỹ", 's', bs(cLeft), null);
      setCell(ws, rowIdx, 4, v.description, 's', bs(cLeft), null);
      setCell(ws, rowIdx, 5, acct, 's', bs(cCenter), null);
      setCell(ws, rowIdx, 6, v.amount || 0, 'n', bs(cRight), numFmt);
      setCell(ws, rowIdx, 7, status, 's', bs(cCenter), null);

      totalAmt += v.amount || 0;
      rowIdx++;
    });

    // DÒNG TỔNG
    const ts = (al) => ({ font: fntBold, fill: totalBg, alignment: al, border: border4 });
    setCell(ws, rowIdx, 0, "TỔNG CỘNG", 's', ts(cLeft), null);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 5 } });
    setCell(ws, rowIdx, 6, totalAmt, 'n', ts(cRight), numFmt);
    setCell(ws, rowIdx, 7, "", 's', ts(cCenter), null);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: 7 } });
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 28 },
      { wch: 35 }, { wch: 12 }, { wch: 18 }, { wch: 16 }
    ];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 20 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Ky quy");

    let dateRangeSuffix = "";
    if (fromDate || toDate) dateRangeSuffix = `_${fromDate || ""}_${toDate || ""}`;
    const outName = `Ky_quy_${new Date().toISOString().split('T')[0]}${dateRangeSuffix}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel ký quỹ: ${err.message}`, "danger");
  }
}

function toggleSelectAllPartners(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".partner-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchPartnersUI();
}

function updateBatchPartnersUI() {
  const checkboxes = document.querySelectorAll(".partner-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-partners");
  const count = document.getElementById("selected-partners-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-partners");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeletePartners() {
  const checked = Array.from(document.querySelectorAll(".partner-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} đối tác đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    state.partners = state.partners.filter(p => !idsToDelete.includes(p.id));

    saveState();

    const master = document.getElementById("check-all-partners");
    if (master) master.checked = false;

    updateBatchPartnersUI();

    filterPartners();
    if (typeof filterDebts === "function") filterDebts();

    showToast(`Đã xóa thành công ${checked.length} đối tác!`, "success");
  }
}

function toggleSelectAllDebts(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".debt-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchDebtsUI();
}

function updateBatchDebtsUI() {
  const checkboxes = document.querySelectorAll(".debt-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-debts");
  const count = document.getElementById("selected-debts-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-debts");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteDebts() {
  const checked = Array.from(document.querySelectorAll(".debt-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa (đặt số dư đầu kỳ về 0) cho ${checked.length} công nợ đã chọn?`)) {
    const idsToReset = checked.map(cb => cb.value);
    idsToReset.forEach(id => {
      state.partnerOpeningBalances[id] = { debit: 0, credit: 0 };
    });

    saveState();
    recalculateAccounting();

    const master = document.getElementById("check-all-debts");
    if (master) master.checked = false;

    updateBatchDebtsUI();

    filterDebts();

    showToast(`Đã reset số dư đầu kỳ cho ${checked.length} đối tác!`, "success");
  }
}

function toggleSelectAllCash(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".cash-checkbox");
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
  updateBatchCashUI();
}

function updateBatchCashUI() {
  const checkboxes = document.querySelectorAll(".cash-checkbox");
  const checked = Array.from(checkboxes).filter(cb => cb.checked);
  const btn = document.getElementById("btn-batch-delete-cash");
  const count = document.getElementById("selected-cash-count");

  if (btn && count) {
    if (checked.length > 0) {
      btn.style.display = "inline-flex";
      count.innerText = checked.length;
    } else {
      btn.style.display = "none";
      count.innerText = "0";
    }
  }

  const master = document.getElementById("check-all-cash");
  if (master) {
    master.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  }
}

function batchDeleteCash() {
  const checked = Array.from(document.querySelectorAll(".cash-checkbox")).filter(cb => cb.checked);
  if (checked.length === 0) return;

  if (confirm(`Bạn có chắc chắn muốn xóa ${checked.length} chứng từ thu chi đã chọn?`)) {
    const idsToDelete = checked.map(cb => cb.value);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => !idsToDelete.includes(v.id));

    saveState();
    recalculateAccounting();

    const master = document.getElementById("check-all-cash");
    if (master) master.checked = false;

    updateBatchCashUI();

    filterCash();
    if (typeof recalculateCashKpis === "function") recalculateCashKpis();
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterSales === "function") filterSales();
    if (typeof filterPurchases === "function") filterPurchases();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof renderInventoryTable === "function") renderInventoryTable();

    showToast(`Đã xóa thành công ${checked.length} chứng từ thu chi!`, "success");
  }
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
    cacheProductOptions();

    showToast(`Đã xóa thành công ${checked.length} sản phẩm!`, "success");
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
      saveState();
      recalculateAccounting();

      renderInventoryTable();
      populateProductLedgerDropdown();
      if (typeof renderStockLedger === "function") renderStockLedger();
      cacheProductOptions();

      showToast("Đã xóa sạch toàn bộ sản phẩm trong kho hàng!", "warning");
    }
  }
}
window.clearAllProducts = clearAllProducts;

function deleteProduct(prodId) {
  if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${prodId}"? Dữ liệu tồn kho liên quan có thể bị ảnh hưởng.`)) {
    trackDeletedIds([prodId]);
    state.products = state.products.filter(p => p.id !== prodId);
    saveState();
    recalculateAccounting();
    renderInventoryTable();
    populateProductLedgerDropdown();
    cacheProductOptions();
    showToast(`Đã xóa sản phẩm ${prodId}!`, "success");
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
  // Bước 1: Chuyển sang tab Thẻ kho chi tiết trước
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

    const rawId = document.getElementById("qap-prod-id").value.trim().toUpperCase();
    const name = document.getElementById("qap-prod-name").value.trim();
    const unit = document.getElementById("qap-prod-unit").value.trim();
    const initStock = parseInt(document.getElementById("qap-prod-stock").value.replace(/\D/g, "")) || 0;
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
    const newId = rawId || `SP${(state.products.length + 1).toString().padStart(3, '0')}`;

    // Kiểm tra trùng mã
    if (state.products.some(p => p.id === newId)) {
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
window.autoIntegrateSoChiTietMuaHangExcel = autoIntegrateSoChiTietMuaHangExcel;
window.toggleSelectAllSales = toggleSelectAllSales;
window.updateBatchSalesUI = updateBatchSalesUI;
window.batchDeleteSales = batchDeleteSales;
window.toggleSelectAllProducts = toggleSelectAllProducts;
window.updateBatchProductsUI = updateBatchProductsUI;
window.batchDeleteProducts = batchDeleteProducts;
window.deleteProduct = deleteProduct;
window.editSalesVoucher = editSalesVoucher;
window.resetSalesForm = resetSalesForm;
window.editPurchaseVoucher = editPurchaseVoucher;
window.resetPurchaseForm = resetPurchaseForm;
window.autoFillPurchasePrice = autoFillPurchasePrice;
window.changeSalesPage = changeSalesPage;
window.clearSalesDateFilter = clearSalesDateFilter;
window.openQuickAddPartnerModal = openQuickAddPartnerModal;
window.handleQuickAddPartnerSubmit = handleQuickAddPartnerSubmit;
window.exportCurrentPartnerDebtExcel = exportCurrentPartnerDebtExcel;
window.previewCurrentPartnerDebtNotice = previewCurrentPartnerDebtNotice;
// Dashboard
window.filterDashboard = filterDashboard;
window.clearDashboardDateFilter = clearDashboardDateFilter;

// Purchases
window.changePurchasePage = changePurchasePage;
window.clearPurchaseDateFilter = clearPurchaseDateFilter;
window.toggleSelectAllPurchases = toggleSelectAllPurchases;
window.updateBatchPurchasesUI = updateBatchPurchasesUI;
window.batchDeletePurchases = batchDeletePurchases;
window.exportPurchasesToExcel = exportPurchasesToExcel;

// Escrows
window.changeEscrowPage = changeEscrowPage;
window.clearEscrowDateFilter = clearEscrowDateFilter;
window.toggleSelectAllEscrows = toggleSelectAllEscrows;
window.updateBatchEscrowsUI = updateBatchEscrowsUI;
window.batchDeleteEscrows = batchDeleteEscrows;
window.exportEscrowsToExcel = exportEscrowsToExcel;

// Inventory Page Controls
window.changeInventoryPage = changeInventoryPage;

// Partners
window.changePartnersPage = changePartnersPage;
window.toggleSelectAllPartners = toggleSelectAllPartners;
window.updateBatchPartnersUI = updateBatchPartnersUI;
window.batchDeletePartners = batchDeletePartners;

// Debts
window.changeDebtsPage = changeDebtsPage;
window.toggleSelectAllDebts = toggleSelectAllDebts;
window.updateBatchDebtsUI = updateBatchDebtsUI;
window.batchDeleteDebts = batchDeleteDebts;
window.exportDebtsToExcel = exportDebtsToExcel;

// Cash
window.changeCashPage = changeCashPage;
window.clearCashDateFilter = clearCashDateFilter;
window.toggleSelectAllCash = toggleSelectAllCash;
window.updateBatchCashUI = updateBatchCashUI;
window.batchDeleteCash = batchDeleteCash;
window.exportCashToExcel = exportCashToExcel;


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
window.initLocalVersionDisplay = initLocalVersionDisplay;
window.checkForUpdates = checkForUpdates;
window.triggerUpdateFlow = triggerUpdateFlow;

// ==========================================================================
// BỘ ĐIỀU KHIỂN CHUỘT VÀ CONTEXT MENU TÙY BIẾN TOÀN CỤC
// ==========================================================================
function initMouseInteractions() {
  const contextMenu = document.getElementById("custom-context-menu");
  if (!contextMenu) {
    console.warn("custom-context-menu element not found!");
  }

  // 1. Nhấp đơn -> Highlight dòng được chọn
  document.addEventListener("click", function (e) {
    const row = e.target.closest("tr");
    if (row && row.hasAttribute("data-type")) {
      document.querySelectorAll("tr.active-row").forEach(r => r.classList.remove("active-row"));
      row.classList.add("active-row");
    }
    // Ẩn context menu khi nhấp bất kỳ đâu ngoài context menu
    if (contextMenu && !e.target.closest("#custom-context-menu")) {
      contextMenu.style.display = "none";
    }
  });

  // 2. Nhấp đúp -> Kích hoạt hành động chính
  document.addEventListener("dblclick", function (e) {
    const row = e.target.closest("tr");
    if (!row) return;

    const type = row.getAttribute("data-type");
    const id = row.getAttribute("data-id");
    if (!type || !id) return;

    if (type === "voucher") {
      if (typeof viewVoucher === "function") {
        viewVoucher(id);
      }
    } else if (type === "product") {
      if (typeof promptEditProductPrice === "function") {
        promptEditProductPrice(id);
      }
    } else if (type === "partner") {
      if (typeof viewPartnerLedger === "function") {
        viewPartnerLedger(id);
      }
    }
  });

  // 3. Nhấp chuột phải -> Context Menu tùy biến
  document.addEventListener("contextmenu", function (e) {
    const row = e.target.closest("tr");
    if (!row || !row.hasAttribute("data-type")) {
      if (contextMenu) contextMenu.style.display = "none";
      return;
    }

    // Ngăn chặn menu chuột phải mặc định của trình duyệt
    e.preventDefault();

    const type = row.getAttribute("data-type");
    const subtype = row.getAttribute("data-subtype") || "";
    const id = row.getAttribute("data-id");

    if (!contextMenu) return;

    // Thiết lập nội dung menu động dựa trên đối tượng
    let menuHTML = "";
    const escapedId = escapeHtmlAttr(id);

    if (type === "voucher") {
      menuHTML = `
        <button class="context-menu-item" onclick="viewVoucher('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
          Xem và In chứng từ (${escapedId})
        </button>
      `;

      if (subtype === "sales") {
        menuHTML += `
          <button class="context-menu-item" onclick="editSalesVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa hóa đơn bán hàng
          </button>
        `;
      } else if (subtype === "purchase") {
        menuHTML += `
          <button class="context-menu-item" onclick="editPurchaseVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa hóa đơn mua hàng
          </button>
        `;
      } else if (subtype === "purchase_order") {
        menuHTML += `
          <button class="context-menu-item" onclick="editPurchaseOrderVoucher('${escapedId}')">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Chỉnh sửa đơn đặt hàng
          </button>
        `;
      }
      menuHTML += `
        <div class="context-menu-divider"></div>
        <button class="context-menu-item item-danger" onclick="deleteVoucher('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Xóa chứng từ này
        </button>
      `;
    } else if (type === "product") {
      menuHTML = `
        <button class="context-menu-item" onclick="viewStockLedgerForProduct('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          Xem sổ thẻ kho (${escapedId})
        </button>
        <button class="context-menu-item" onclick="promptQuickImport('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          Nhập kho nhanh (${escapedId})
        </button>
        <button class="context-menu-item" onclick="promptEditProductPrice('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          Chỉnh sửa mặt hàng
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item item-danger" onclick="deleteProduct('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Xóa mặt hàng này
        </button>
      `;
    } else if (type === "partner") {
      menuHTML = `
        <button class="context-menu-item" onclick="viewPartnerLedger('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Xem sổ chi tiết (${escapedId})
        </button>
        <button class="context-menu-item" onclick="openEditPartnerModal('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          Chỉnh sửa đối tác
         </button>
        <button class="context-menu-item" onclick="promptEditPartnerOpeningDebt('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Chỉnh sửa công nợ đầu kỳ
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item item-danger" onclick="deletePartner('${escapedId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Xóa đối tác này
        </button>
      `;
    }

    contextMenu.innerHTML = menuHTML;

    // Xác định vị trí hiển thị Menu để không bị tràn màn hình
    contextMenu.style.display = "block";

    const menuWidth = contextMenu.offsetWidth || 190;
    const menuHeight = contextMenu.offsetHeight || 150;

    let x = e.pageX;
    let y = e.pageY;

    if (x + menuWidth > window.innerWidth + window.scrollX) {
      x = window.innerWidth + window.scrollX - menuWidth - 10;
    }

    if (y + menuHeight > window.innerHeight + window.scrollY) {
      y = window.innerHeight + window.scrollY - menuHeight - 10;
    }

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
  });

  // 4. Nhấn nút ESC để đóng cửa sổ/modal đang mở (Ưu tiên đóng modal trên cùng)
  //    Nhấn nút F4 để thêm dòng mới, F8 để xóa dòng trong form Mua hàng/Bán hàng đang mở
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const visibleOverlays = Array.from(document.querySelectorAll(".modal-overlay")).filter(
        el => el.style.display === "flex" || window.getComputedStyle(el).display === "flex"
      );

      if (visibleOverlays.length > 0) {
        // Sắp xếp theo z-index giảm dần để ưu tiên đóng modal phụ mở sau (như quick-add-partner)
        visibleOverlays.sort((a, b) => {
          const zA = parseInt(window.getComputedStyle(a).zIndex) || 1000;
          const zB = parseInt(window.getComputedStyle(b).zIndex) || 1000;
          return zB - zA;
        });

        if (typeof closeModal === "function") {
          closeModal(visibleOverlays[0].id);
        }
        e.preventDefault();
      }
    } else if (e.key === "F4") {
      const salesModal = document.getElementById("modal-add-sales");
      const isSalesVisible = salesModal && (salesModal.style.display === "flex" || window.getComputedStyle(salesModal).display === "flex");
      const purchaseModal = document.getElementById("modal-add-purchase");
      const isPurchaseVisible = purchaseModal && (purchaseModal.style.display === "flex" || window.getComputedStyle(purchaseModal).display === "flex");
      const purchaseOrderModal = document.getElementById("modal-add-purchase-order");
      const isPurchaseOrderVisible = purchaseOrderModal && (purchaseOrderModal.style.display === "flex" || window.getComputedStyle(purchaseOrderModal).display === "flex");

      if (isSalesVisible) {
        if (typeof addSalesFormRow === "function") {
          addSalesFormRow();
        }
        e.preventDefault();
      } else if (isPurchaseVisible) {
        if (typeof addPurchaseFormRow === "function") {
          addPurchaseFormRow();
        }
        e.preventDefault();
      } else if (isPurchaseOrderVisible) {
        if (typeof addPurchaseOrderFormRow === "function") {
          addPurchaseOrderFormRow();
        }
        e.preventDefault();
      }
    } else if (e.key === "F8") {
      const salesModal = document.getElementById("modal-add-sales");
      const isSalesVisible = salesModal && (salesModal.style.display === "flex" || window.getComputedStyle(salesModal).display === "flex");
      const purchaseModal = document.getElementById("modal-add-purchase");
      const isPurchaseVisible = purchaseModal && (purchaseModal.style.display === "flex" || window.getComputedStyle(purchaseModal).display === "flex");
      const purchaseOrderModal = document.getElementById("modal-add-purchase-order");
      const isPurchaseOrderVisible = purchaseOrderModal && (purchaseOrderModal.style.display === "flex" || window.getComputedStyle(purchaseOrderModal).display === "flex");

      if (isSalesVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("sales-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculateSalesTotals === "function") {
              recalculateSalesTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isPurchaseVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("purchase-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculatePurchaseTotals === "function") {
              recalculatePurchaseTotals();
            }
          }
        }
        e.preventDefault();
      } else if (isPurchaseOrderVisible) {
        const activeEl = document.activeElement;
        const itemsBody = document.getElementById("purchase-order-form-items-body");
        if (itemsBody) {
          let trToDelete = null;
          if (activeEl && itemsBody.contains(activeEl)) {
            trToDelete = activeEl.closest("tr");
          } else {
            trToDelete = itemsBody.querySelector("tr:last-child");
          }
          if (trToDelete) {
            trToDelete.remove();
            if (typeof recalculatePurchaseOrderTotals === "function") {
              recalculatePurchaseOrderTotals();
            }
          }
        }
        e.preventDefault();
      }
    }
  });

  // 5. Nhấp chuột vào phần nền đen (backdrop) của modal để tự động đóng cửa sổ
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal-overlay")) {
      if (typeof closeModal === "function") {
        closeModal(e.target.id);
      }
    }
  });
}

window.initMouseInteractions = initMouseInteractions;

// ==========================================================================
// PHÍM TẮT CTRL+F — TÌM KIẾM NHANH TRONG TAB ĐANG HIỂN THỊ
// ==========================================================================
/**
 * Ánh xạ tab/subtab → ID của ô tìm kiếm văn bản chính của trang đó.
 * Với tab "inventory", cần kiểm tra thêm subtab đang active.
 */
function getActiveSearchInputId() {
  const activeMenuItem = document.querySelector(".sidebar-menu .menu-item.active");
  if (!activeMenuItem) return null;
  const tabId = activeMenuItem.getAttribute("data-tab");

  const tabSearchMap = {
    purchase: "search-purchase",
    sales: "search-sales",
    partners: "partner-search-input",
    debts: "debt-search-input",
    cash: "cash-search-input"
  };

  if (tabId === "inventory") {
    // Kiểm tra subtab kho hàng đang hiển thị
    const panelLedger = document.getElementById("inventory-subtab-ledger");
    if (panelLedger && panelLedger.style.display !== "none") {
      return "search-ledger-products"; // Subtab: Sổ thẻ kho chi tiết
    }
    return "search-inventory"; // Subtab: Tồn kho tổng hợp (mặc định)
  }

  return tabSearchMap[tabId] || null;
}

function initCtrlFShortcut() {
  document.addEventListener("keydown", function (e) {
    // Ctrl+F hoặc Cmd+F (macOS)
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      // Bỏ qua nếu đang focus vào input/textarea/select để không gây xung đột
      const tag = document.activeElement ? document.activeElement.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Bỏ qua nếu có modal đang mở
      const anyModalOpen = Array.from(document.querySelectorAll(".modal-overlay")).some(
        m => m.style.display === "flex" || m.style.display === "block"
      );
      if (anyModalOpen) return;

      const inputId = getActiveSearchInputId();
      if (!inputId) return;

      const input = document.getElementById(inputId);
      if (!input) return;

      e.preventDefault(); // Chặn hộp tìm kiếm trình duyệt mặc định
      input.focus();
      input.select(); // Chọn toàn bộ nội dung cũ để gõ đè ngay
    }
  });
}

window.initCtrlFShortcut = initCtrlFShortcut;
window.getActiveSearchInputId = getActiveSearchInputId;

// ==========================================================================
// ĐIỀU HƯỚNG BẢNG ĐƠN HÀNG BẰNG BÀN PHÍM (TAB / F1 / F2)
// ==========================================================================

/**
 * Lấy tất cả phần tử có thể focus trong một modal đang hiển thị,
 * theo đúng thứ tự xuất hiện trên giao diện (DOM order).
 * Bỏ qua: disabled, hidden, nút xóa dòng, các ô chỉ hiển thị (item-total-display).
 */
function getFocusableFieldsInModal(modalEl) {
  return Array.from(
    modalEl.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
    )
  ).filter(el => {
    // Bỏ qua ô thành tiền chỉ hiển thị
    if (el.classList.contains('item-total-display')) return false;
    // Bỏ qua các ô ẩn (bởi style hoặc parent ẩn)
    if (el.offsetParent === null) return false;
    return true;
  });
}

/**
 * Helper: Lấy tất cả input/select có thể focus trong một dòng <tr> của bảng đơn hàng.
 */
function getEditableCellsInRow(tr) {
  return Array.from(tr.querySelectorAll(
    'input:not([disabled]):not([type="hidden"]), select:not([disabled])'
  )).filter(el => !el.classList.contains('item-total-display') && el.offsetParent !== null);
}

/**
 * Lấy tbody của bảng đơn hàng nếu el đang nằm bên trong.
 */
function getOrderTableRows(currentEl) {
  const tbodyId = currentEl.closest('#purchase-form-items-body')
    ? 'purchase-form-items-body'
    : currentEl.closest('#sales-form-items-body')
      ? 'sales-form-items-body'
      : currentEl.closest('#purchase-order-form-items-body')
        ? 'purchase-order-form-items-body'
        : null;
  if (!tbodyId) return null;
  const tbody = document.getElementById(tbodyId);
  return { tbody, rows: Array.from(tbody.querySelectorAll('tr')), tbodyId };
}

/**
 * Focus vào ô đầu tiên (item-productId) của một dòng.
 */
function focusRowFirstCell(tr) {
  const cell = tr.querySelector('.item-productId');
  if (cell) { cell.focus(); cell.select && cell.select(); }
}

/**
 * Khởi tạo điều hướng bàn phím cho form đơn hàng (Mua + Bán).
 *
 * F1 = di chuyển tới ô TIẾP THEO trong toàn bộ modal đang mở
 * F2 = di chuyển tới ô TRƯỚC ĐÓ trong toàn bộ modal đang mở
 * Tab ở ô cuối dòng bảng → nhảy sang dòng tiếp hoặc thêm dòng mới
 * Shift+Tab ở ô đầu dòng → lên dòng trước
 */
function initOrderFormKeyboardNavigation() {
  document.addEventListener('keydown', function (e) {
    // ── F5: Reset đơn giá bán hàng theo giá kho (chặn load lại trang) ─────
    if (e.key === 'F5') {
      const salesModal = document.getElementById('modal-add-sales');
      const isSalesOpen = salesModal && (salesModal.style.display === 'flex' || window.getComputedStyle(salesModal).display === 'flex');
      
      if (isSalesOpen) {
        e.preventDefault();
        const salesRows = salesModal.querySelectorAll("#sales-form-items-body tr");
        if (salesRows.length > 0) {
          let count = 0;
          salesRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const salePriceVal = prod.salePrice1 !== undefined && prod.salePrice1 > 0
                ? prod.salePrice1
                : (prod.excelRow && prod.excelRow[21] !== undefined && Number(prod.excelRow[21]) > 0
                  ? Number(prod.excelRow[21])
                  : (Math.round(prod.avgCost * 1.35 / 1000) * 1000 || 50000));
              
              row.querySelector(".item-price").value = Number(salePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculateSalesTotals();
          if (typeof showToast === "function") {
            showToast(`Đã khôi phục đơn giá gốc của ${count} mặt hàng từ kho!`, "success");
          }
        }
        return;
      }

      const purchaseModal = document.getElementById('modal-add-purchase');
      const isPurchaseOpen = purchaseModal && (purchaseModal.style.display === 'flex' || window.getComputedStyle(purchaseModal).display === 'flex');
      if (isPurchaseOpen) {
        e.preventDefault();
        const purchaseRows = purchaseModal.querySelectorAll("#purchase-form-items-body tr");
        if (purchaseRows.length > 0) {
          let count = 0;
          purchaseRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
                ? prod.lastPurchasePrice
                : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
                  ? Number(prod.excelRow[20])
                  : (prod.avgCost || prod.initialCost || 10000));
              
              row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculatePurchaseTotals();
          if (typeof showToast === "function") {
            showToast(`Đã khôi phục đơn giá gốc của ${count} mặt hàng từ kho!`, "success");
          }
        }
        return;
      }

      const purchaseOrderModal = document.getElementById('modal-add-purchase-order');
      const isPurchaseOrderOpen = purchaseOrderModal && (purchaseOrderModal.style.display === 'flex' || window.getComputedStyle(purchaseOrderModal).display === 'flex');
      if (isPurchaseOrderOpen) {
        e.preventDefault();
        const purchaseOrderRows = purchaseOrderModal.querySelectorAll("#purchase-order-form-items-body tr");
        if (purchaseOrderRows.length > 0) {
          let count = 0;
          purchaseOrderRows.forEach(row => {
            const selectEl = row.querySelector(".item-productId");
            if (!selectEl) return;
            const prodVal = selectEl.value;
            const prod = resolveProduct(prodVal);
            if (prod) {
              ensureProductExcelRow(prod);
              const purchasePriceVal = prod.lastPurchasePrice !== undefined && prod.lastPurchasePrice > 0
                ? prod.lastPurchasePrice
                : (prod.excelRow && prod.excelRow[20] !== undefined && Number(prod.excelRow[20]) > 0
                  ? Number(prod.excelRow[20])
                  : (prod.avgCost || prod.initialCost || 10000));
              
              row.querySelector(".item-price").value = Number(purchasePriceVal).toLocaleString("vi-VN");
              count++;
            }
          });
          recalculatePurchaseOrderTotals();
          if (typeof showToast === "function") {
            showToast(`Đã khôi phục đơn giá gốc của ${count} mặt hàng từ kho!`, "success");
          }
        }
        return;
      }
    }

    const el = document.activeElement;
    if (!el) return;

    // Xác định modal đang mở chứa el hiện tại
    const activeModal = el.closest('#modal-add-purchase, #modal-add-sales, #modal-add-purchase-order');
    if (!activeModal) return;

    // ── F1: chuyển sang ô tiếp theo trong toàn bộ modal ──────────────────
    if (e.key === 'F1') {
      e.preventDefault();
      const fields = getFocusableFieldsInModal(activeModal);
      const idx = fields.indexOf(el);
      if (idx === -1) return;
      if (idx < fields.length - 1) {
        fields[idx + 1].focus();
        fields[idx + 1].select && fields[idx + 1].select();
      } else {
        // Đang ở ô cuối cùng của modal → thêm dòng mới nếu đang trong bảng
        const info = getOrderTableRows(el);
        if (info) {
          if (info.tbodyId === 'purchase-form-items-body') addPurchaseFormRow();
          else if (info.tbodyId === 'purchase-order-form-items-body') addPurchaseOrderFormRow();
          else addSalesFormRow();
        }
      }
      return;
    }

    // ── F2: quay lại ô trước đó trong toàn bộ modal ────────────────────
    if (e.key === 'F2') {
      e.preventDefault();
      const fields = getFocusableFieldsInModal(activeModal);
      const idx = fields.indexOf(el);
      if (idx > 0) {
        fields[idx - 1].focus();
        fields[idx - 1].select && fields[idx - 1].select();
      }
      return;
    }

    // ── Tab: chuyển dòng trong bảng đơn hàng ─────────────────────────────
    const info = getOrderTableRows(el);
    if (!info) return;
    const { rows, tbodyId } = info;
    if (rows.length === 0) return;
    const isPurchase = tbodyId === 'purchase-form-items-body';
    const isPurchaseOrder = tbodyId === 'purchase-order-form-items-body';
    const currentRow = el.closest('tr');
    if (!currentRow) return;
    const rowIdx = rows.indexOf(currentRow);

    if (e.key === 'Tab' && !e.shiftKey) {
      const cells = getEditableCellsInRow(currentRow);
      const cellIdx = cells.indexOf(el);
      if (cellIdx === -1 || cellIdx < cells.length - 1) return; // Chưa ở ô cuối

      e.preventDefault();
      if (rowIdx < rows.length - 1) {
        focusRowFirstCell(rows[rowIdx + 1]);
      } else {
        if (isPurchase) addPurchaseFormRow();
        else if (isPurchaseOrder) addPurchaseOrderFormRow();
        else addSalesFormRow();
      }
      return;
    }

    if (e.key === 'Tab' && e.shiftKey) {
      const cells = getEditableCellsInRow(currentRow);
      const cellIdx = cells.indexOf(el);
      if (cellIdx !== 0 || rowIdx === 0) return;

      e.preventDefault();
      const prevRow = rows[rowIdx - 1];
      const prevCells = getEditableCellsInRow(prevRow);
      if (prevCells.length > 0) {
        const lastCell = prevCells[prevCells.length - 1];
        lastCell.focus();
        lastCell.select && lastCell.select();
      }
      return;
    }
  });
}

window.getFocusableFieldsInModal = getFocusableFieldsInModal;
window.getEditableCellsInRow = getEditableCellsInRow;
window.getOrderTableRows = getOrderTableRows;
window.focusRowFirstCell = focusRowFirstCell;
window.initOrderFormKeyboardNavigation = initOrderFormKeyboardNavigation;


// ==========================================================================
// PHÂN HỆ ĐƠN ĐẶT HÀNG (PURCHASE ORDERS)
// ==========================================================================

function switchPurchaseSubTab(subTabId) {
  const btnInvoice = document.getElementById("tab-btn-purchase-invoice");
  const btnOrder = document.getElementById("tab-btn-purchase-order");
  if (btnInvoice && btnOrder) {
    if (subTabId === "invoice") {
      btnInvoice.classList.add("active");
      btnOrder.classList.remove("active");
    } else {
      btnInvoice.classList.remove("active");
      btnOrder.classList.add("active");
    }
  }

  const panelInvoice = document.getElementById("purchase-subtab-invoice");
  const panelOrder = document.getElementById("purchase-subtab-order");
  if (panelInvoice && panelOrder) {
    if (subTabId === "invoice") {
      panelInvoice.style.display = "block";
      panelOrder.style.display = "none";
    } else {
      panelInvoice.style.display = "none";
      panelOrder.style.display = "block";
      renderPurchaseOrderTable();
    }
  }
}

function generateNextPurchaseOrderVoucherId() {
  const prefix = `ĐMH`;
  const regex = /^ĐMH(\d+)(?:-[A-Z0-9]+)?$/;
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

  return `${prefix}${(maxNum + 1).toString().padStart(5, '0')}-${machineSuffix}`;
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
      <input type="text" class="form-control item-qty text-right number-format" required value="${qtyVal}" oninput="recalculatePurchaseOrderTotals()">
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
    const qty = parseInt(row.querySelector(".item-qty").value.replace(/\D/g, "")) || 0;
    const price = parseInt(row.querySelector(".item-price").value.replace(/\D/g, "")) || 0;
    const discount = parseFloat(row.querySelector(".item-discount").value.replace(/\D/g, "")) || 0;
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

  const paymentMethod = document.getElementById("pur-order-payment").value;
  const newVoucher = {
    id: editingPurchaseOrderId || generateNextPurchaseOrderVoucherId(),
    type: "purchase_order",
    date: document.getElementById("pur-order-date").value,
    partnerId,
    partnerName,
    paymentMethod,
    description: document.getElementById("pur-order-desc").value,
    items: voucherItems,
    taxRate: 0,
    taxAmount: 0
  };

  const isEditing = !!editingPurchaseOrderId;
  if (editingPurchaseOrderId) {
    const idx = state.vouchers.findIndex(v => v.id === editingPurchaseOrderId);
    if (idx !== -1) {
      if (state.vouchers[idx].excelRow) {
        newVoucher.excelRow = state.vouchers[idx].excelRow;
      }
      state.vouchers[idx] = newVoucher;
    }
    editingPurchaseOrderId = null;
  } else {
    state.vouchers.push(newVoucher);
  }

  saveState();
  if (typeof executeSaveState === "function") {
    executeSaveState();
  }
  if (cloudSyncActive && firebaseDb) {
    showToast("⚡ Đã tự động sao lưu và đồng bộ lên đám mây!", "success");
  }
  recalculateAccounting();

  closeModal("modal-add-purchase-order");
  showToast(isEditing ? "Cập nhật đơn đặt hàng thành công!" : "Lập đơn đặt hàng thành công!", "success");
}

function editPurchaseOrderVoucher(id) {
  const v = state.vouchers.find(v => v.id === id);
  if (!v) return;

  editingPurchaseOrderId = id;

  const modalTitle = document.querySelector("#modal-add-purchase-order .card-title");
  if (modalTitle) modalTitle.innerText = `Chỉnh sửa đơn đặt hàng: ${id}`;

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
    const prod = state.products.find(p => p.id === item.productId);
    const prodVal = prod ? `${prod.name} (${prod.id})` : item.productId;
    addPurchaseOrderFormRow(prodVal, item.qty, item.price, item.discount || 0);
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

  if (query) {
    orders = orders.filter(v => {
      const partnerName = getPartnerNameForVoucher(v);
      const combined = `${v.id || ""} ${partnerName} ${v.description || ""}`;
      return matchAdvancedQuery(combined, query, v.totalAmount);
    });
  }

  if (fromDate) {
    orders = orders.filter(v => v.date >= fromDate);
  }
  if (toDate) {
    orders = orders.filter(v => v.date <= toDate);
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
  const fromEl = document.getElementById("search-purchase-order-from");
  const toEl = document.getElementById("search-purchase-order-to");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
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

    saveState();
    if (typeof executeSaveState === "function") {
      executeSaveState();
    }
    if (cloudSyncActive && firebaseDb) {
      showToast("⚡ Đã tự động sao lưu và đồng bộ lên đám mây!", "success");
    }
    recalculateAccounting();

    const master = document.getElementById("check-all-purchase-order");
    if (master) master.checked = false;

    updateBatchPurchaseOrdersUI();
    renderPurchaseOrderTable();

    showToast(`Đã xóa thành công ${checked.length} đơn đặt hàng!`, "success");
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
      (v.id || "").toLowerCase().includes(query) ||
      (v.partnerName || "").toLowerCase().includes(query) ||
      (v.description || "").toLowerCase().includes(query)
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
          const prod = state.products ? state.products.find(p => p.id === item.productId) : null;
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

// REGISTER GLOBALS TO WINDOW
window.switchPurchaseSubTab = switchPurchaseSubTab;
window.addPurchaseOrderFormRow = addPurchaseOrderFormRow;
window.autoFillPurchaseOrderPrice = autoFillPurchaseOrderPrice;
window.recalculatePurchaseOrderTotals = recalculatePurchaseOrderTotals;
window.resetPurchaseOrderForm = resetPurchaseOrderForm;
window.handlePurchaseOrderSubmit = handlePurchaseOrderSubmit;
window.editPurchaseOrderVoucher = editPurchaseOrderVoucher;
window.renderPurchaseOrderTable = renderPurchaseOrderTable;
window.filterPurchaseOrderTable = filterPurchaseOrderTable;
window.clearPurchaseOrderDateFilter = clearPurchaseOrderDateFilter;
window.changePurchaseOrderPage = changePurchaseOrderPage;
window.toggleSelectAllPurchaseOrders = toggleSelectAllPurchaseOrders;
window.updateBatchPurchaseOrdersUI = updateBatchPurchaseOrdersUI;
window.batchDeletePurchaseOrders = batchDeletePurchaseOrders;
window.exportPurchaseOrdersToExcel = exportPurchaseOrdersToExcel;

