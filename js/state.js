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
  if (typeof initMouseInteractions === "function") {
    initMouseInteractions();
  }
  setupNumberFormattingEventListeners();
});

// Helper chuyển đổi an toàn mọi giá trị (chuỗi định dạng Việt Nam/Quốc tế, số) sang kiểu Float

// Khởi tạo ứng dụng: Ở chế độ Online-Only, CSDL cục bộ sẽ bị loại bỏ hoàn toàn
function initApp() {
  localStorage.removeItem("rd_accounting_db");

  // Khởi tạo từ cache cục bộ (nếu có) để giao diện hiển thị ngay lập tức
  let hasCache = false;
  try {
    const cache = localStorage.getItem("rd_accounting_online_cache");
    if (cache) {
      const parsed = JSON.parse(cache);
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.vouchers)) {
        state = parsed;
        let loadedLastSyncState = null;
        try {
          const syncCache = localStorage.getItem("rd_accounting_last_sync_cache");
          if (syncCache) {
            loadedLastSyncState = JSON.parse(syncCache);
          }
        } catch (e) {
          console.error("[Cache] Lỗi đọc cache đồng bộ cũ:", e);
        }
        lastSyncState = loadedLastSyncState || JSON.parse(JSON.stringify(parsed));
        hasCache = true;
        lastSyncedCloudTs = state._lastModified || 0;
        console.log(`[Cache] Khởi tạo dữ liệu từ cache cục bộ thành công! (${(state.vouchers || []).length} chứng từ, ${(state.partners || []).length} đối tác)`);
        cleanNumericVouchers();
      }
    }
  } catch (err) {
    console.error("[Cache] Lỗi đọc cache khởi động:", err);
  }

  if (!hasCache) {
    // Khởi tạo state trống ban đầu (sẽ được tải từ Cloud khi Supabase Client kết nối thành công)
    state = {
      companyName: "",
      address: "",
      taxCode: "",
      accountingStandard: "TT200",
      products: [],
      partners: [],
      initialBalances: {},
      vouchers: []
    };
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

  // === ƯU TIÊN KHỞI CHẠY ĐẦU TIÊN: Nạp ngay các dropdown list của cửa sổ bán hàng từ cache cục bộ ===
  if (typeof initExcelIntegration === "function") {
    initExcelIntegration();
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
      if (p.actualStock === undefined && p.initialStock !== undefined) {
        p.actualStock = p.initialStock;
      }
    });
  }

  // Đánh dấu các chứng từ cũ từ database là imported (trừ khi đã có isManual)
  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (v.isManual === undefined && v.isImported === undefined) {
        v.isImported = true;
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

  // Các tích hợp tự động Excel sẽ được chạy tuần tự sau khi kéo dữ liệu đám mây hoàn tất

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

// Hàm dọn dẹp các đơn hàng tự sinh (ID là số thứ tự) và chứng từ rác/test cũ
function cleanNumericVouchers() {
  if (!state || !Array.isArray(state.vouchers)) return;
  
  // 1. Dọn dẹp đơn hàng tự sinh có ID là số thứ tự
  const numericVouchers = state.vouchers.filter(v => v && v.id && /^\d+$/.test(String(v.id).trim()));
  let hasChanges = false;
  if (numericVouchers.length > 0) {
    console.log(`[Cleanup] Phát hiện và xóa ${numericVouchers.length} đơn hàng tự sinh có ID là số thứ tự.`);
    const idsToDelete = numericVouchers.map(v => v.id);
    trackDeletedIds(idsToDelete);
    state.vouchers = state.vouchers.filter(v => v && v.id && !/^\d+$/.test(String(v.id).trim()));
    hasChanges = true;
  }

  // 2. Dọn dẹp dòng summary lỗi từ Excel (Tổng thu/Tổng chi) và các voucher test cũ
  const trashVouchers = state.vouchers.filter(v => {
    if (!v || !v.id) return false;
    const idStr = String(v.id).trim().toLowerCase();
    const descStr = (v.description || "").trim().toLowerCase();
    
    // Check dòng tổng kết lỗi của Excel
    if (idStr.includes("tổng thu") || idStr.includes("tổng chi") || descStr.includes("tổng thu") || descStr.includes("tổng chi")) {
      return true;
    }
    // Check các dòng test nháp dữ liệu cũ
    if (idStr.includes("test") || descStr === "test" || descStr === "testtt" || descStr === "tesett" || descStr === "testt" || descStr.startsWith("test ")) {
      return true;
    }
    return false;
  });

  if (trashVouchers.length > 0) {
    console.log(`[Cleanup] Phát hiện và xóa ${trashVouchers.length} chứng từ rác/test dữ liệu cũ.`);
    const trashIds = trashVouchers.map(v => v.id);
    trackDeletedIds(trashIds);
    state.vouchers = state.vouchers.filter(v => v && v.id && !trashIds.includes(v.id));
    hasChanges = true;
  }

  if (hasChanges) {
    saveState();
  }
}

// Biến phục vụ tối ưu lưu trữ (Debounce saveState để tránh đơ UI khi dữ liệu lớn)
let saveStateTimeout = null;
let saveStateIsDirty = false;

function saveState() {
  saveStateIsDirty = true;
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  // Trì hoãn lưu trữ 2000ms để gộp các yêu cầu lưu và chạy bất đồng bộ (tránh lag UI khi dữ liệu lớn)
  saveStateTimeout = setTimeout(() => {
    executeSaveState(false);
  }, 2000);
}

function executeSaveState(sync = false) {
  if (!saveStateIsDirty) return;

  const doSave = () => {
    try {
      // Luôn cập nhật timestamp trước khi lưu và push
      state._lastModified = Date.now();

      // Dọn dẹp deletedIds: Loại bỏ bất kỳ ID nào hiện đang hoạt động trong hệ thống (vouchers, products, partners, cashEntries, escrowItems)
      if (Array.isArray(state.deletedIds)) {
        const activeIds = new Set();
        if (Array.isArray(state.vouchers)) state.vouchers.forEach(v => v && v.id && activeIds.add(v.id));
        if (Array.isArray(state.products)) state.products.forEach(p => p && p.id && activeIds.add(p.id));
        if (Array.isArray(state.partners)) state.partners.forEach(pt => pt && pt.id && activeIds.add(pt.id));
        if (Array.isArray(state.cashEntries)) state.cashEntries.forEach(c => c && c.id && activeIds.add(c.id));
        if (Array.isArray(state.escrowItems)) state.escrowItems.forEach(e => e && e.id && activeIds.add(e.id));

        state.deletedIds = state.deletedIds.filter(id => !activeIds.has(id));
      }
      
      // Ghi cache cục bộ tức thời
      try {
        localStorage.setItem("rd_accounting_online_cache", JSON.stringify(state));
      } catch (cacheErr) {
        console.error("[Cache] Lỗi ghi cache cục bộ:", cacheErr);
      }

      if (typeof pushToCloud === "function") {
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
  };

  if (sync) {
    doSave();
  } else {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => doSave(), { timeout: 1000 });
    } else {
      setTimeout(doSave, 50);
    }
  }
}

/**
 * Gọi từ main.js khi cửa sổ sắp đóng.
 * Đảm bảo dữ liệu được lưu localStorage VÀ đẩy lên Cloud (nếu kết nối).
 * Trả về Promise — main.js sẽ chờ resolve rồi mới destroy cửa sổ.
 */
async function autoSaveBeforeClose() {
  try {
    // 1. Hủy bỏ bộ đếm debounce để tránh push trùng lặp
    if (saveStateTimeout) {
      clearTimeout(saveStateTimeout);
      saveStateTimeout = null;
    }

    // 2. Chạy đồng bộ ghi cache cục bộ lập tức
    executeSaveState(true);

    // 3. Nếu Cloud đang kết nối → đẩy trạng thái cuối cùng lên Cloud
    if (cloudSyncActive && supabaseClient) {
      // LƯU Ý: KHÔNG reset isPushing ở đây!
      // Việc reset isPushing khi đang có push chạy sẽ gây ra CONCURRENT PUSH,
      // dẫn đến race condition và dữ liệu bị trùng lặp trên cloud!
      // pushToCloud() tự quản lý với isPushing/pushPending.
      state._lastModified = Date.now();
      await pushToCloud();
      console.log("[AutoSave] Đã đẩy dữ liệu lên Cloud trước khi đóng.");
    } else {
      console.log("[AutoSave] Cloud không kết nối, chỉ lưu cục bộ.");
    }
  } catch (err) {
    console.error("[AutoSave] Lỗi khi lưu trước khi đóng:", err);
  }
}