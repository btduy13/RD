
// Đảm bảo dữ liệu được lưu ngay lập tức trước khi tắt hoặc tải lại ứng dụng
window.addEventListener("beforeunload", () => {
  executeSaveState(true);
});

// Cập nhật các thông tin công ty lên giao diện
function updateCompanyUI() {
  document.getElementById("header-company-name").innerText = state.companyName || "Công Ty Cổ Phần Rạng Đông";
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
  state.companyName = document.getElementById("setting-company-name").value.trim() || "Công Ty Cổ Phần Rạng Đông";
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

function loadCloudSettings() {
  try {
    const saved = localStorage.getItem("rd_accounting_cloud_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Chấp nhận cấu hình Supabase mới (có supabaseUrl)
      if (parsed && parsed.supabaseUrl) {
        cloudSyncSettings = parsed;
        cloudSyncSettings.enabled = true;
      } else {
        // Cấu hình cũ (Firebase) hoặc không hợp lệ → ghi đè bằng cấu hình Supabase mặc định
        cloudSyncSettings.enabled = true;
        localStorage.setItem("rd_accounting_cloud_settings", JSON.stringify(cloudSyncSettings));
      }
    } else {
      // Sử dụng cấu hình Supabase mặc định
      cloudSyncSettings.enabled = true;
      localStorage.setItem("rd_accounting_cloud_settings", JSON.stringify(cloudSyncSettings));
    }

    const chk = document.getElementById("setting-cloud-enabled");
    if (chk) chk.checked = true;

    const urlInput = document.getElementById("setting-cloud-supabase-url");
    if (urlInput) urlInput.value = cloudSyncSettings.supabaseUrl || "";

    const keyInput = document.getElementById("setting-cloud-supabase-key");
    if (keyInput) keyInput.value = cloudSyncSettings.supabaseAnonKey || "";

    toggleCloudSyncInputs();
  } catch (e) {
    console.error("Lỗi đọc cấu hình cloud:", e);
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
    const supabaseUrl = document.getElementById("setting-cloud-supabase-url").value.trim();
    const supabaseAnonKey = document.getElementById("setting-cloud-supabase-key").value.trim();

    if (enabled && (!supabaseUrl || !supabaseAnonKey)) {
      showToast("Vui lòng điền Supabase URL và Anon Key!", "danger");
      return;
    }

    cloudSyncSettings = {
      enabled,
      supabaseUrl,
      supabaseAnonKey
    };

    localStorage.setItem("rd_accounting_cloud_settings", JSON.stringify(cloudSyncSettings));
    showToast("Cấu hình đám mây đã được lưu thành công!", "success");

    if (enabled) {
      initCloudSync();
    } else {
      if (realtimeChannel && supabaseClient) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
      cloudSyncActive = false;
      const forcePullBtn = document.getElementById("btn-force-pull");
      if (forcePullBtn) forcePullBtn.style.display = "none";
      const forcePushBtn = document.getElementById("btn-force-push");
      if (forcePushBtn) forcePushBtn.style.display = "none";
      updateCloudSyncBadge(false, "Mây: Tắt", "#64748b");
      showToast("Đã tắt đồng bộ trực tuyến đám mây.", "info");
    }
  } catch (err) {
    if (typeof addErrorLog === "function") {
      addErrorLog("saveCloudConfig", err.message, err);
    }
  }
}
window.loadCloudSettings = loadCloudSettings;
window.saveCloudConfig = saveCloudConfig;
window.toggleCloudSyncInputs = toggleCloudSyncInputs;