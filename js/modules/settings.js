
// Đảm bảo dữ liệu được lưu ngay lập tức trước khi tắt hoặc tải lại ứng dụng
window.addEventListener("beforeunload", () => {
  executeSaveState(true);
});

// Cập nhật các thông tin công ty lên giao diện
function updateCompanyUI() {
  document.getElementById("header-company-name").innerText = state.companyName || "Công Ty Cổ Phần SX Và ĐT Phát Triển Rạng Đông";
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
  state.companyName = document.getElementById("setting-company-name").value.trim() || "Công Ty Cổ Phần SX Và ĐT Phát Triển Rạng Đông";
  state.taxCode = document.getElementById("setting-tax-code").value.trim();
  state.address = document.getElementById("setting-address").value.trim() || "255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh";
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

// 14. SAO LƯU SAO CHÉP CƠ SỞ DỮ LIỆU (DATABASE BACKUP & RESTORE)

// Xuất file dữ liệu kế toán JSON
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `RD_Accounting_Backup_${getLocalDateString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("Xuất dữ liệu lưu trữ thành công!", "success");
}

// Sao lưu thủ công ngay lập tức vào thư mục backup/ (chỉ hoạt động trong Electron)
async function manualBackupNow() {
  if (window.electronAPI && window.electronAPI.saveBackupOnExit) {
    try {
      const jsonData = JSON.stringify(state);
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
  if (window.electronAPI && typeof window.electronAPI.openBackupFolder === "function") {
    try {
      const result = await window.electronAPI.openBackupFolder();
      if (!result || !result.ok) {
        throw new Error(result && result.error ? result.error : "Không thể mở thư mục backup.");
      }
    } catch (err) {
      showToast("Không thể mở thư mục backup: " + err.message, "danger");
    }
  } else {
    showToast("Tính năng này chỉ khả dụng trong ứng dụng Desktop.", "info");
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


let lastSyncedCloudTs = 0; // Timestamp cloud đã đồng bộ thành công lần cuối (tách biệt khỏi state._lastModified)
let foundOldChunkIds = [];
let migrationPending = false;
const clientSessionId = "client_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
let cloudSyncSettings = {
  enabled: true,
  supabaseUrl: "https://drnrfdbjzyffdxtytbpg.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybnJmZGJqenlmZmR4dHl0YnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTUzNzAsImV4cCI6MjA5NjQzMTM3MH0.IZ1kL0dqL7WuKAIKKnmpcym4YUEnWJvZ9eIiext4Keg"
};

const CLOUD_SYNC_SETTINGS_KEY = "rd_accounting_cloud_settings";
let cloudConfigSaveInProgress = false;

function persistCloudSettings() {
  localStorage.setItem(CLOUD_SYNC_SETTINGS_KEY, JSON.stringify(cloudSyncSettings));
}

function getCloudConfigElements() {
  return {
    form: document.getElementById("form-cloud-sync"),
    enabledInput: document.getElementById("setting-cloud-enabled"),
    inputsGroup: document.getElementById("cloud-sync-inputs-group"),
    urlInput: document.getElementById("setting-cloud-supabase-url"),
    keyInput: document.getElementById("setting-cloud-supabase-key"),
    submitButton: document.getElementById("btn-save-cloud-config")
  };
}

function isCloudConfigSaveInProgress() {
  return cloudConfigSaveInProgress;
}

function setCloudConfigBusy(isBusy) {
  cloudConfigSaveInProgress = !!isBusy;
  const elements = getCloudConfigElements();

  if (elements.form) elements.form.setAttribute("aria-busy", isBusy ? "true" : "false");
  if (elements.submitButton) {
    if (!elements.submitButton.dataset.idleLabel) {
      elements.submitButton.dataset.idleLabel = elements.submitButton.textContent.trim();
    }
    elements.submitButton.disabled = !!isBusy;
    elements.submitButton.textContent = isBusy
      ? "Đang lưu & kết nối..."
      : elements.submitButton.dataset.idleLabel;
  }
  if (elements.enabledInput) elements.enabledInput.disabled = !!isBusy;

  ["btn-manual-cloud-sync", "btn-force-pull", "btn-force-push", "btn-cloud-sync-now"].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = !!isBusy;
  });

  toggleCloudSyncInputs();
  if (!isBusy && typeof window.refreshCloudSyncControls === "function") {
    window.refreshCloudSyncControls();
  }
}

function loadCloudSettings() {
  try {
    const saved = localStorage.getItem(CLOUD_SYNC_SETTINGS_KEY);
    if (saved) {
      let parsed = null;
      try {
        parsed = JSON.parse(saved);
      } catch (parseError) {
        console.warn("Cấu hình cloud đã lưu không hợp lệ; khôi phục cấu hình mặc định.", parseError);
      }

      // A disabled configuration may intentionally have blank credentials. Treat
      // it as valid so turning cloud sync off survives an application restart.
      const isSupportedConfig = parsed && typeof parsed === "object" && (
        parsed.enabled === false || typeof parsed.supabaseUrl === "string"
      );
      if (isSupportedConfig) {
        cloudSyncSettings = {
          ...cloudSyncSettings,
          ...parsed,
          enabled: parsed.enabled !== false
        };
      } else {
        // Cấu hình cũ (Firebase) hoặc không hợp lệ → ghi đè bằng cấu hình Supabase mặc định
        cloudSyncSettings.enabled = true;
        persistCloudSettings();
      }
    } else {
      // Sử dụng cấu hình Supabase mặc định
      cloudSyncSettings.enabled = true;
      persistCloudSettings();
    }

    const elements = getCloudConfigElements();
    if (elements.enabledInput) elements.enabledInput.checked = cloudSyncSettings.enabled !== false;
    if (elements.urlInput) elements.urlInput.value = cloudSyncSettings.supabaseUrl || "";
    if (elements.keyInput) elements.keyInput.value = cloudSyncSettings.supabaseAnonKey || "";

    toggleCloudSyncInputs();
  } catch (e) {
    console.error("Lỗi đọc cấu hình cloud:", e);
  }
}

function toggleCloudSyncInputs() {
  const elements = getCloudConfigElements();
  if (!elements.enabledInput || !elements.inputsGroup) return;

  const enabled = !!elements.enabledInput.checked;
  const actionBusy = typeof window.isCloudSyncActionBusy === "function" && window.isCloudSyncActionBusy();
  const inputsDisabled = !enabled || cloudConfigSaveInProgress || actionBusy;

  elements.inputsGroup.hidden = !enabled;
  elements.inputsGroup.style.display = enabled ? "flex" : "none";
  elements.enabledInput.setAttribute("aria-expanded", enabled ? "true" : "false");
  if (elements.urlInput) elements.urlInput.disabled = inputsDisabled;
  if (elements.keyInput) elements.keyInput.disabled = inputsDisabled;
}

function isSupportedSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (err) {
    return false;
  }
}

async function saveCloudConfig(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  if (cloudConfigSaveInProgress) return false;
  if (typeof window.isCloudSyncActionBusy === "function" && window.isCloudSyncActionBusy()) {
    showToast("Vui lòng chờ thao tác đồng bộ hiện tại hoàn tất.", "warning");
    return false;
  }

  const elements = getCloudConfigElements();
  if (!elements.enabledInput || !elements.urlInput || !elements.keyInput) {
    showToast("Không tìm thấy biểu mẫu cấu hình đám mây.", "danger");
    return false;
  }

  const enabled = elements.enabledInput.checked;
  const supabaseUrl = elements.urlInput.value.trim().replace(/\/+$/, "");
  const supabaseAnonKey = elements.keyInput.value.trim();

  if (enabled && (!supabaseUrl || !supabaseAnonKey)) {
    showToast("Vui lòng điền Supabase URL và Anon Key!", "danger");
    return false;
  }
  if (enabled && !isSupportedSupabaseUrl(supabaseUrl)) {
    showToast("Supabase URL không hợp lệ. URL phải bắt đầu bằng http:// hoặc https://.", "danger");
    elements.urlInput.focus();
    return false;
  }

  setCloudConfigBusy(true);
  try {
    cloudSyncSettings = {
      enabled,
      supabaseUrl,
      supabaseAnonKey
    };
    persistCloudSettings();

    if (!enabled) {
      if (typeof window.disconnectCloudSync === "function") {
        await window.disconnectCloudSync();
      } else {
        cloudSyncActive = false;
        updateCloudSyncBadge(false, "Mây: Tắt", "#64748b");
      }
      showToast("Đã tắt đồng bộ trực tuyến đám mây.", "info");
      return true;
    }

    const connected = typeof window.initCloudSync === "function"
      ? await window.initCloudSync()
      : false;
    if (connected) {
      showToast("Đã lưu cấu hình và kết nối đám mây thành công!", "success");
      return true;
    }

    showToast("Đã lưu cấu hình nhưng chưa thể kết nối. Hãy kiểm tra URL, Anon Key và Internet.", "danger");
    return false;
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("saveCloudConfig", err.message, err);
    }
    showToast("Không thể lưu cấu hình đám mây: " + err.message, "danger");
    return false;
  } finally {
    setCloudConfigBusy(false);
  }
}

function openCloudSyncModal() {
  const modal = document.getElementById("modal-cloud-sync");
  if (!modal) {
    showToast("Không tìm thấy cửa sổ quản lý đồng bộ.", "danger");
    return false;
  }
  if (modal.style.display !== "flex" && modal.style.display !== "block") {
    loadCloudSettings();
  }
  openModal("modal-cloud-sync");
  return true;
}

function closeCloudSyncModal() {
  closeModal("modal-cloud-sync");
}

window.loadCloudSettings = loadCloudSettings;
window.saveCloudConfig = saveCloudConfig;
window.toggleCloudSyncInputs = toggleCloudSyncInputs;
window.openCloudSyncModal = openCloudSyncModal;
window.closeCloudSyncModal = closeCloudSyncModal;
window.isCloudConfigSaveInProgress = isCloudConfigSaveInProgress;
