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

let lastSavedState = null;

// 2. KHỞI CHẠY KHI TRANG ĐƯỢC TẢI
document.addEventListener("DOMContentLoaded", async () => {
  await initApp();
  if (typeof initMouseInteractions === "function") {
    initMouseInteractions();
  }
  setupNumberFormattingEventListeners();
});

// Helper chuyển đổi an toàn mọi giá trị (chuỗi định dạng Việt Nam/Quốc tế, số) sang kiểu Float

// Khởi tạo ứng dụng: Ở chế độ Online-Only, CSDL cục bộ sẽ bị loại bỏ hoàn toàn
async function initApp() {
  if (typeof showAppLoading === "function") {
    showAppLoading("Đang tải dữ liệu kế toán...");
  }

  try {
  // M6: Obsolete localStorage migration removed (was running forever)

  // Khởi tạo từ cache cục bộ (nếu có) để giao diện hiển thị ngay lập tức
  // Ưu tiên: Đọc từ file JSON (không giới hạn kích thước) | Fallback: localStorage (bị giới hạn 5MB)
  let hasCache = false;

  // === [ƯU TIÊN 1] ĐỌC TỪ FILE JSON QUA ELECTRON IPC ===
  if (window.electronAPI && typeof window.electronAPI.readStateFile === 'function') {
    try {
      const result = await window.electronAPI.readStateFile();
      if (result && result.ok && result.data) {
        const parsed = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.vouchers)) {
          state = parsed;
          window.originalStateLastModified = Number(parsed._lastModified) || 0;
          // Do not seed lastSyncState from local cache: unpushed vouchers would be
          // treated as already synced and never uploaded after restart.
          window.lastSyncState = null;
          if (typeof lastSyncedCloudTs !== 'undefined') {
            const pulledTs = Number(localStorage.getItem("rd_accounting_last_pulled_cloud_ts") || parsed._lastPulledCloudTs || 0) || 0;
            lastSyncedCloudTs = pulledTs;
            if (pulledTs > 0) localStorage.setItem("rd_accounting_last_pulled_cloud_ts", String(pulledTs));
          }
          console.log(`[StateFile] Nạp từ file thành công! (${parsed.vouchers.length} chứng từ, ${(parsed.partners || []).length} đối tác)`);
          hasCache = true;
        }
      } else if (result && result.ok && result.isEmpty) {
        console.log('[StateFile] SQLite trống — khởi tạo state mặc định.');
        if (result.data && Array.isArray(result.data.vouchers)) {
          state = result.data;
          hasCache = true;
        }
      } else if (result && !result.ok) {
        // File chưa tồn tại — bình thường trong lần chạy đầu tiên
        console.log('[StateFile] File state chưa tồn tại, sẽ tạo mới khi lưu lần đầu.');
      }
    } catch (parseErr) {
      console.error('[StateFile] Lỗi parse JSON từ file:', parseErr);
    }
  }

  // === [ƯU TIÊN 2] FALLBACK: ĐỌC TỪ LOCALSTORAGE (để tương thích ngược) ===
  if (!hasCache) {
    try {
      const cache = localStorage.getItem("rd_accounting_online_cache");
      if (cache) {
        const parsed = JSON.parse(cache);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.vouchers)) {
          state = parsed;
          window.originalStateLastModified = Number(parsed._lastModified) || 0;
          // Snapshot đồng bộ không còn được lưu vào localStorage (ghi đồng bộ
          // nhiều MB gây đứng UI). Không clone cache vào lastSyncState — xem nhánh Electron.
          window.lastSyncState = null;
          hasCache = true;
          const pulledTs = Number(localStorage.getItem("rd_accounting_last_pulled_cloud_ts") || parsed._lastPulledCloudTs || 0) || 0;
          lastSyncedCloudTs = pulledTs;
          if (pulledTs > 0) localStorage.setItem("rd_accounting_last_pulled_cloud_ts", String(pulledTs));
          console.log(`[Cache] Khởi tạo dữ liệu từ cache cục bộ thành công! (${(state.vouchers || []).length} chứng từ, ${(state.partners || []).length} đối tác)`);
          cleanNumericVouchers();
        }
      }
    } catch (err) {
      console.error("[Cache] Lỗi đọc cache khởi động:", err);
    }
  }

  if (!hasCache) {
    window.originalStateLastModified = 0;
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
  if (!state.partnerOpeningBalances) {
    state.partnerOpeningBalances = {};
  }
  if (!state.partnerOpeningBalanceTs) {
    state.partnerOpeningBalanceTs = {};
  }

  let _productCatalogChanged = false;

  if (typeof dedupeProductCatalogCase === "function" && Array.isArray(state.products) && state.products.length > 0) {
    const dedupeResult = dedupeProductCatalogCase({ runId: "init-load", recalculate: false });
    if (dedupeResult && dedupeResult.changed) {
      console.log(`[ProductDedupe] Renderer: ${dedupeResult.beforeCount} → ${dedupeResult.afterCount} mặt hàng (gộp ${dedupeResult.removedCount}).`);
      _productCatalogChanged = true;
    }
  }

  if (typeof ProductCaseDedupe !== "undefined" && ProductCaseDedupe.cleanGarbageProducts && Array.isArray(state.products)) {
    const garbageResult = ProductCaseDedupe.cleanGarbageProducts(state);
    if (garbageResult && garbageResult.removed > 0) {
      console.log(`[ProductClean] Xóa ${garbageResult.removed} mã hàng rác (ngày/chứng từ/số): ${garbageResult.samples.slice(0, 5).join(", ")}`);
      _productCatalogChanged = true;
    }
  }

  if (_productCatalogChanged) {
    if (typeof saveState === "function") saveState();
    if (typeof recalculateAccounting === "function") recalculateAccounting(true);
  }


  // === ƯU TIÊN KHỞI CHẠY ĐẦU TIÊN: Nạp ngay các dropdown list của cửa sổ bán hàng từ cache cục bộ ===
  if (typeof initExcelIntegration === "function") {
    initExcelIntegration();
  }

  // Chạy các di trú dữ liệu lịch sử một lần duy nhất để tối ưu hóa tốc độ khởi động
  if (localStorage.getItem('rd_migrations_279_done') !== 'true') {
    console.log('[Migration] Thực thi di trú dữ liệu cũ...');
    
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
      let hasRepaired = false;
      state.vouchers.forEach(v => {
        if (v.isManual === undefined && v.isImported === undefined) {
          v.isImported = true;
        }
        // Sửa chữa các chứng từ có type bị null/undefined
        if (!v.type) {
          const u = (v.id || "").toUpperCase().trim();
          let detected = null;
          if (u.startsWith('BTL') || u.startsWith('BHTL')) detected = 'sales_return';
          else if (u.startsWith('BH') || u.startsWith('HD')) detected = 'sales';
          else if (u.startsWith('PTL') || u.startsWith('MHTL') || u.startsWith('TRH')) detected = 'purchase_return';
          else if (u.startsWith('PN') || u.startsWith('MH') || u.startsWith('NK')) detected = 'purchase';
          else if (u.startsWith('PT')) detected = 'receipt';
          else if (u.startsWith('PC')) detected = 'payment';
          
          // Nếu excelRow chỉ ra loại chứng từ
          if (!detected && v.excelRow && v.excelRow[8]) {
            const lbl = v.excelRow[8].toLowerCase();
            if (lbl.includes("thu")) detected = "receipt";
            else if (lbl.includes("chi")) detected = "payment";
            else if (lbl.includes("bán")) detected = "sales";
            else if (lbl.includes("mua")) detected = "purchase";
          }
          
          v.type = detected || "purchase";
          hasRepaired = true;
          console.log(`[State] Tự động sửa type cho chứng từ ${v.id} thành: ${v.type}`);
        }
      });

      if (hasRepaired) {
        setTimeout(() => {
          saveState();
        }, 0);
      }
    }

    // Di chuyển loại đối tác từ 'customer' sang 'retail'
    if (state.partners) {
      let hasPartnerMigrated = false;
      state.partners.forEach(p => {
        if (p.type === "customer") {
          p.type = "retail";
          hasPartnerMigrated = true;
        }
      });
      if (hasPartnerMigrated) {
        setTimeout(() => { saveState(); }, 0);
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

    localStorage.setItem('rd_migrations_279_done', 'true');
  }



  // Khởi tạo các dòng Excel mặc định nếu bị thiếu
  if (typeof initializeMissingExcelRows === "function") {
    initializeMissingExcelRows();
  }

  // Dọn dẹp và chuẩn hóa dữ liệu Excel cũ tránh giá trị undefined
  if (typeof migrateAndCleanExistingExcelRows === "function") {
    migrateAndCleanExistingExcelRows();
  }

  // Dọn dẹp hàng trong kho hàng có đơn vị tính là số
  if (typeof cleanNumericUnitProducts === "function") {
    cleanNumericUnitProducts();
  }

  // H4 Fix: initExcelIntegration already called at line 128-130, removed duplicate call
  // initExcelIntegration();

  // Cập nhật thông tin công ty lên giao diện
  updateCompanyUI();

  // Chạy lại thuật toán tính toán kế toán & giá vốn để đồng bộ (chạy bất đồng bộ để tránh chặn UI lúc mở app)
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => recalculateAccounting(false), { timeout: 2000 });
  } else {
    setTimeout(() => recalculateAccounting(false), 50);
  }

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

  // Khôi phục tab & tùy chọn giao diện đã lưu
  if (typeof restoreUserPreferencesUI === "function") {
    restoreUserPreferencesUI();
  }
  if (typeof restoreLastNavigationTab === "function") {
    restoreLastNavigationTab();
  } else {
    switchTab("dashboard");
  }

  // Khởi tạo phím tắt Ctrl+F tìm kiếm trong tab hiện hành
  if (typeof initCtrlFShortcut === "function") {
    initCtrlFShortcut();
  }

  // Khởi tạo điều hướng bàn phím cho bảng nhập dòng đơn hàng (Tab / F1 / F2)
  if (typeof initOrderFormKeyboardNavigation === "function") {
    initOrderFormKeyboardNavigation();
  }

  // Khởi tạo trạng thái Snapshot SQLite của dữ liệu
  if (typeof initializeLastSavedState === "function") {
    initializeLastSavedState(state);
  }

  // Khởi tạo đăng nhập / phân quyền
  if (typeof initAuth === "function") {
    initAuth();
  }
  } finally {
    if (typeof hideAppLoading === "function") {
      hideAppLoading();
    }
    if (typeof updateThemeToggleIcon === "function") {
      updateThemeToggleIcon();
    }
    if (typeof debugProductAudit === "function") {
      debugProductAudit("initApp-loaded");
    }
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
    const trashIds = new Set(trashVouchers.map(v => v.id));
    trackDeletedIds([...trashIds]);
    state.vouchers = state.vouchers.filter(v => v && v.id && !trashIds.has(v.id));
    hasChanges = true;
  }

  // 3. Khắc phục lỗi chiết khấu đang lưu dạng số tiền tuyệt đối (> 100) thay vì phần trăm
  state.vouchers.forEach(v => {
    if (v && Array.isArray(v.items)) {
      v.items.forEach(item => {
        if (item && item.discount > 100) {
          const grossAmount = (item.qty || 0) * (item.price || 0);
          if (grossAmount > 0) {
            const calculatedPercent = Math.round((item.discount / grossAmount) * 100 * 100) / 100;
            if (calculatedPercent <= 100) {
              item.discount = calculatedPercent;
              hasChanges = true;
            }
          }
        }
      });
    }
  });

  if (hasChanges) {
    saveState();
  }
}

// Biến phục vụ tối ưu lưu trữ (Debounce saveState để tránh đơ UI khi dữ liệu lớn)
let saveStateTimeout = null;
let saveStateIsDirty = false;

function saveState() {
  saveStateIsDirty = true;
  if (typeof window.clearActiveFormDraft === "function") {
    window.clearActiveFormDraft();
  }
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  // Trì hoãn lưu trữ 2000ms để gộp các yêu cầu lưu và chạy bất đồng bộ (tránh lag UI khi dữ liệu lớn)
  saveStateTimeout = setTimeout(() => {
    executeSaveState(false);
  }, 2000);
}

// Khởi tạo snapshot để so sánh chênh lệch (delta) khi lưu
function initializeLastSavedState(loadedState) {
  if (!loadedState) return;
  lastSavedState = {
    companyName: loadedState.companyName || "",
    address: loadedState.address || "",
    taxCode: loadedState.taxCode || "",
    accountingStandard: loadedState.accountingStandard || "TT200",
    initialBalances: JSON.parse(JSON.stringify(loadedState.initialBalances || {})),
    partnerOpeningBalances: JSON.parse(JSON.stringify(loadedState.partnerOpeningBalances || {})),
    partnerOpeningBalanceTs: JSON.parse(JSON.stringify(loadedState.partnerOpeningBalanceTs || {})),
    deletedIds: [...(loadedState.deletedIds || [])],
    deletedCloudKeys: [...(loadedState.deletedCloudKeys || [])],
    cashEntries: JSON.parse(JSON.stringify(loadedState.cashEntries || [])),
    escrowItems: JSON.parse(JSON.stringify(loadedState.escrowItems || [])),
    salesTemplatesData: JSON.parse(JSON.stringify(loadedState.salesTemplatesData || [])),
    users: JSON.parse(JSON.stringify(loadedState.users || [])),
    schemaVersion: loadedState.schemaVersion || 1,
    _accountingValid: loadedState._accountingValid,
    _accountingValidTs: loadedState._accountingValidTs,
    _recalcWatermark: loadedState._recalcWatermark
      ? JSON.parse(JSON.stringify(loadedState._recalcWatermark))
      : null,
    vouchers: new Map((loadedState.vouchers || []).map(v => [v.id, JSON.parse(JSON.stringify(v))])),
    products: new Map((loadedState.products || []).map(p => [p.id, JSON.parse(JSON.stringify(p))])),
    partners: new Map((loadedState.partners || []).map(p => [p.id, JSON.parse(JSON.stringify(p))])),
  };
}

function logDeltaActivity(diffResult, currentVouchers, currentProducts, currentPartners) {
  const {
    addedVouchers, updatedVouchers,
    addedProducts, updatedProducts,
    addedPartners, updatedPartners
  } = diffResult;

  if (addedVouchers.length > 0) {
    if (addedVouchers.length <= 5) {
      addedVouchers.forEach(id => {
        const v = currentVouchers.find(x => x.id === id);
        const typeLabel = v && v.type === 'sales' ? 'Hóa đơn bán hàng' : (v && v.type === 'purchase' ? 'Hóa đơn mua hàng' : 'Chứng từ');
        pushActivityLogDirectly("Thêm chứng từ", `Đã lập ${typeLabel} mới: ${id}`);
      });
    } else {
      pushActivityLogDirectly("Thêm chứng từ", `Đã lập/nhập khẩu hàng loạt ${addedVouchers.length} chứng từ mới.`);
    }
  }
  if (updatedVouchers.length > 0) {
    if (updatedVouchers.length <= 5) {
      updatedVouchers.forEach(id => {
        const v = currentVouchers.find(x => x.id === id);
        const typeLabel = v && v.type === 'sales' ? 'Hóa đơn bán hàng' : (v && v.type === 'purchase' ? 'Hóa đơn mua hàng' : 'Chứng từ');
        pushActivityLogDirectly("Sửa chứng từ", `Đã cập nhật ${typeLabel}: ${id}`);
      });
    } else {
      pushActivityLogDirectly("Sửa chứng từ", `Đã cập nhật hàng loạt ${updatedVouchers.length} chứng từ.`);
    }
  }
  if (addedProducts.length > 0) {
    if (addedProducts.length <= 5) {
      addedProducts.forEach(id => {
        const p = currentProducts.find(x => x.id === id);
        pushActivityLogDirectly("Thêm hàng hóa", `Đã thêm vật tư hàng hóa mới: ${id} - ${p ? p.name : ''}`);
      });
    } else {
      pushActivityLogDirectly("Thêm hàng hóa", `Đã thêm hàng loạt ${addedProducts.length} vật tư hàng hóa.`);
    }
  }
  if (updatedProducts.length > 0) {
    if (updatedProducts.length <= 5) {
      updatedProducts.forEach(id => {
        const p = currentProducts.find(x => x.id === id);
        pushActivityLogDirectly("Sửa hàng hóa", `Đã cập nhật vật tư hàng hóa: ${id} - ${p ? p.name : ''}`);
      });
    } else {
      pushActivityLogDirectly("Sửa hàng hóa", `Đã cập nhật hàng loạt ${updatedProducts.length} vật tư hàng hóa.`);
    }
  }
  if (addedPartners.length > 0) {
    if (addedPartners.length <= 5) {
      addedPartners.forEach(id => {
        const p = currentPartners.find(x => x.id === id);
        pushActivityLogDirectly("Thêm đối tác", `Đã thêm đối tác mới: ${id} - ${p ? p.name : ''}`);
      });
    } else {
      pushActivityLogDirectly("Thêm đối tác", `Đã thêm hàng loạt ${addedPartners.length} đối tác.`);
    }
  }
  if (updatedPartners.length > 0) {
    if (updatedPartners.length <= 5) {
      updatedPartners.forEach(id => {
        const p = currentPartners.find(x => x.id === id);
        pushActivityLogDirectly("Sửa đối tác", `Đã cập nhật đối tác: ${id} - ${p ? p.name : ''}`);
      });
    } else {
      pushActivityLogDirectly("Sửa đối tác", `Đã cập nhật hàng loạt ${updatedPartners.length} đối tác.`);
    }
  }
}

function saveStateSync() {
  saveStateIsDirty = true;
  return executeSaveState(true);
}

// Helper to push logs directly to state.actionLogs without triggering saveState loop
function pushActivityLogDirectly(actionType, description) {
  if (typeof window.currentUser === 'undefined' || !window.currentUser) return;
  const newLog = {
    timestamp: Date.now(),
    username: window.currentUser.username,
    name: window.currentUser.name,
    action: actionType,
    description: description
  };
  state.actionLogs = state.actionLogs || [];
  state.actionLogs.unshift(newLog);
  if (state.actionLogs.length > 1000) {
    state.actionLogs = state.actionLogs.slice(0, 1000);
  }
}

async function executeSaveState(sync = false) {
  if (!saveStateIsDirty) return;

  const doSave = async () => {
    try {
      // Luôn cập nhật timestamp trước khi lưu và push
      state._lastModified = Date.now();
      if (state.schemaVersion === undefined) {
        state.schemaVersion = 4;
      }

      // Dọn dẹp deletedIds: Loại bỏ bất kỳ ID nào hiện đang hoạt động trong hệ thống
      if (Array.isArray(state.deletedIds)) {
        const activeIds = new Set();
        if (Array.isArray(state.vouchers)) state.vouchers.forEach(v => v && v.id && activeIds.add(v.id));
        if (Array.isArray(state.products)) state.products.forEach(p => p && p.id && activeIds.add(p.id));
        if (Array.isArray(state.partners)) state.partners.forEach(pt => pt && pt.id && activeIds.add(pt.id));
        if (Array.isArray(state.cashEntries)) state.cashEntries.forEach(c => c && c.id && activeIds.add(c.id));
        if (Array.isArray(state.escrowItems)) state.escrowItems.forEach(e => e && e.id && activeIds.add(e.id));

        state.deletedIds = state.deletedIds.filter(id => !activeIds.has(id));

        if (Array.isArray(state.deletedCloudKeys)) {
          state.deletedCloudKeys = state.deletedCloudKeys.filter(cloudKey => {
            if (!cloudKey) return false;
            const rawId = cloudKey.replace(/^(v_|p_|part_|cash_|escrow_)/, '');
            return !activeIds.has(rawId);
          });
        }
      }

      let persisted = false;

      if (!lastSavedState) {
        const jsonString = JSON.stringify(state);
        const result = await persistFullState(jsonString);
        if (result && result.ok) {
          initializeLastSavedState(state);
          persisted = true;
        } else {
          console.error('[StateFile] Ghi file full thất bại:', result && result.error);
        }
      } else {
        if (state.companyName !== lastSavedState.companyName || state.taxCode !== lastSavedState.taxCode || state.address !== lastSavedState.address) {
          pushActivityLogDirectly("Thay đổi cấu hình", `Đã cập nhật thông tin doanh nghiệp (Tên: ${state.companyName})`);
        }
        if (state.accountingStandard !== lastSavedState.accountingStandard) {
          pushActivityLogDirectly("Thay đổi cấu hình", `Đã chuyển chế độ kế toán sang ${state.accountingStandard}`);
        }

        const diffResult = buildStateDelta(state, lastSavedState);
        if (diffResult.hasChanges) {
          logDeltaActivity(
            diffResult,
            state.vouchers || [],
            state.products || [],
            state.partners || []
          );

          const refreshedDiff = buildStateDelta(state, lastSavedState);
          const result = await persistStateDelta(refreshedDiff.delta);
          if (result && result.ok) {
            applyDeltaToSnapshot(lastSavedState, refreshedDiff.delta);
            persisted = true;
          } else {
            console.error('[StateFile] Ghi delta thất bại:', result && result.error);
            const fallback = await persistFullState(JSON.stringify(state));
            if (fallback && fallback.ok) {
              initializeLastSavedState(state);
              persisted = true;
            }
          }
        } else {
          persisted = true;
        }
      }

      if (!persisted) {
        return;
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
    await doSave();
  } else if (window.requestIdleCallback) {
    window.requestIdleCallback(() => { void doSave(); }, { timeout: 1000 });
  } else {
    setTimeout(() => { void doSave(); }, 50);
  }
}

window.initializeLastSavedState = initializeLastSavedState;
window.saveStateSync = saveStateSync;

async function waitForPushToComplete(maxWaitMs = 3000) {
  const startTime = Date.now();
  while (typeof isPushing !== 'undefined' && isPushing) {
    if (Date.now() - startTime > maxWaitMs) {
      console.warn('[AutoSave] Hết thời gian chờ đồng bộ đám mây.');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
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

    const wasDirty = saveStateIsDirty;

    // 2. Chạy đồng bộ ghi cache cục bộ lập tức (await IPC SQLite)
    await executeSaveState(true);

    // 3. Nếu Cloud đang kết nối VÀ có thay đổi cần đẩy -> đồng bộ lên Cloud
    // H6 Fix: Guard against sync.js variables being undefined if sync.js failed to load
    if (typeof cloudSyncActive !== 'undefined' && cloudSyncActive && typeof supabaseClient !== 'undefined' && supabaseClient) {
      const alreadyPushing = typeof isPushing !== 'undefined' && isPushing;
      
      if (wasDirty) {
        state._lastModified = Date.now();
        if (alreadyPushing) {
          pushPending = true;
        } else {
          await pushToCloud();
        }
      }
      
      // Chờ cho tất cả tiến trình đẩy đang chạy hoàn tất (tối đa 3 giây)
      await waitForPushToComplete(3000);
      console.log("[AutoSave] Đã đảm bảo tất cả dữ liệu được đẩy lên Cloud trước khi đóng.");
    } else {
      console.log("[AutoSave] Cloud không kết nối hoặc không có thay đổi mới, chỉ lưu cục bộ.");
    }
    return wasDirty;
  } catch (err) {
    console.error("[AutoSave] Lỗi khi lưu trước khi đóng:", err);
    return false;
  }
}
