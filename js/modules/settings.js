
// Đảm bảo dữ liệu được lưu ngay lập tức trước khi tắt hoặc tải lại ứng dụng
window.addEventListener("beforeunload", () => {
  executeSaveState(true);
});

// Tên người ký trên báo cáo (khóa trên state, cạnh companyName/taxCode/address).
const COMPANY_SIGNER_FIELDS = [
  ["preparerName", "setting-preparer-name"],
  ["chiefAccountantName", "setting-chief-accountant-name"],
  ["directorName", "setting-director-name"]
];

// Cập nhật các thông tin công ty lên giao diện
function updateCompanyUI() {
  const headerCompany = document.getElementById("header-company-name");
  headerCompany.innerText = state.companyName || "Công Ty Cổ Phần SX Và ĐT Phát Triển Rạng Đông";
  headerCompany.title = headerCompany.innerText; // tên dài bị cắt trên thanh tiêu đề: xem đủ khi rê chuột
  document.getElementById("setting-company-name").value = state.companyName || "";
  document.getElementById("setting-tax-code").value = state.taxCode || "";
  document.getElementById("setting-address").value = state.address || "";
  COMPANY_SIGNER_FIELDS.forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (input) input.value = state[key] || "";
  });
  const allowNegative = document.getElementById("setting-allow-negative-stock");
  if (allowNegative) allowNegative.checked = state.allowNegativeStock === true;
  renderTaxLockSettings();

  const sidebarLabel = document.getElementById("sidebar-standard-label");
  const tt99 = isTT99Family(state.accountingStandard);
  if (sidebarLabel) sidebarLabel.innerText = tt99 ? "TT 99" : "TT 133";

  // Toggle active button Thông tư
  if (tt99) {
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
  COMPANY_SIGNER_FIELDS.forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (input) state[key] = input.value.trim();
  });
  const allowNegative = document.getElementById("setting-allow-negative-stock");
  if (allowNegative) state.allowNegativeStock = allowNegative.checked;
  saveState();
  updateCompanyUI();
  showToast("Lưu thông tin doanh nghiệp thành công!", "success");
}

// Thẻ "Thuế GTGT và khóa sổ" dựng bằng JS ngay sau thẻ Chế độ kế toán. Lưu ở state.taxSettings.{vatMethod, defaultVatRate}
// và state.lockedThrough (+ lockedThroughInfo: ai, lúc nào) — đồng bộ như metadata công ty.
const VAT_METHOD_OPTIONS = [["khau_tru", "Khấu trừ"], ["truc_tiep", "Trực tiếp trên doanh thu"], ["khong_chiu", "Không chịu thuế GTGT"]];
const DEFAULT_VAT_RATE_OPTIONS = [["", "Tự động (8% trong thời gian giảm thuế, sau đó 10%)"], ["10", "10%"], ["8", "8%"], ["5", "5%"], ["0", "0% (hàng xuất khẩu)"], ["KCT", "KCT"], ["KKKNT", "KKKNT"]];

function renderTaxLockSettings() {
  const anchor = document.getElementById("btn-standard-200")?.closest?.(".chart-card");
  if (!anchor) return;
  let card = document.getElementById("settings-tax-lock-card");
  if (!card) {
    card = document.createElement("div");
    card.id = "settings-tax-lock-card";
    card.className = "chart-card";
    card.style.minHeight = "auto";
    anchor.insertAdjacentElement("afterend", card);
  }
  const s = state.taxSettings || {};
  const esc = escapeHtmlText;
  const options = (list, selected) => list.map(([value, label]) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
  const info = state.lockedThroughInfo || {};
  const who = info.by ? ` — ${esc(info.by)}${info.at ? `, ${esc(new Date(info.at).toLocaleString("vi-VN"))}` : ""}` : "";
  card.innerHTML = `
    <span class="card-title">Thuế GTGT và khóa sổ</span>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label" for="setting-vat-method">Phương pháp tính thuế GTGT</label>
        <select id="setting-vat-method" class="form-control">${options(s.vatMethod ? VAT_METHOD_OPTIONS : [["", "— Chưa chọn —"], ...VAT_METHOD_OPTIONS], s.vatMethod || "")}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="setting-default-vat-rate">Thuế suất mặc định cho dòng hàng mới</label>
        <select id="setting-default-vat-rate" class="form-control">${options(DEFAULT_VAT_RATE_OPTIONS, String(s.defaultVatRate ?? ""))}</select>
      </div>
    </div>
    ${s.vatMethod ? "" : `<p class="header-subtitle" style="color: var(--color-warning); margin: 4px 0;">Doanh nghiệp cần chọn phương pháp tính thuế GTGT. Khi chưa chọn, dòng hàng mới mặc định 0% như dữ liệu cũ.</p>`}
    <button class="btn btn-secondary" onclick="saveVatSettings()" style="margin-top: 8px; align-self: flex-start;">Lưu thiết lập thuế</button>
    <hr style="border: none; border-top: 1px solid var(--border-color); margin: 16px 0 12px;">
    <p class="header-subtitle" style="margin-bottom: 8px;">Khóa sổ (Luật Kế toán Điều 26, TT99 Điều 13): chứng từ đến hết ngày khóa không được thêm, sửa, xóa. Chỉ quản trị viên được đổi.</p>
    <div class="form-group">
      <label class="form-label" for="setting-locked-through">Khóa sổ đến hết ngày</label>
      <input type="date" id="setting-locked-through" class="form-control" value="${esc(state.lockedThrough || "")}">
    </div>
    <p id="setting-lock-status" style="font-size: 13px; margin: 8px 0;">${state.lockedThrough ? `Đã khóa sổ đến ngày <strong>${esc(formatDateDisplay(state.lockedThrough))}</strong>${who}` : `Chưa khóa sổ${who}`}</p>
    <div style="display: flex; gap: 10px;">
      <button class="btn btn-primary" onclick="savePeriodLock(false)">Khóa sổ</button>
      <button class="btn btn-secondary" onclick="savePeriodLock(true)"${state.lockedThrough ? "" : " disabled"}>Mở khóa</button>
    </div>`;
}

function saveVatSettings() {
  if (!window.currentUser || window.currentUser.role !== "admin") {
    showToast("Chỉ quản trị viên được đổi thiết lập thuế GTGT.", "danger");
    return;
  }
  const vatMethod = document.getElementById("setting-vat-method").value;
  const defaultVatRate = document.getElementById("setting-default-vat-rate").value;
  state.taxSettings = { ...(state.taxSettings || {}), vatMethod, defaultVatRate };
  saveState();
  renderTaxLockSettings();
  showToast("Đã lưu thiết lập thuế GTGT. Áp dụng cho chứng từ lập mới; chứng từ đã lưu giữ nguyên.", "success");
}

async function savePeriodLock(unlock) {
  const user = window.currentUser;
  if (!user || user.role !== "admin") {
    showToast("Chỉ quản trị viên được khóa hoặc mở khóa sổ.", "danger");
    return;
  }
  const date = unlock ? "" : document.getElementById("setting-locked-through").value;
  if (!unlock && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast("Vui lòng chọn ngày khóa sổ.", "danger");
    return;
  }
  if (!unlock && date > getLocalDateString()) {
    showToast("Không khóa sổ đến ngày trong tương lai.", "danger");
    return;
  }
  const ok = await showConfirmModal({
    title: unlock ? "Mở khóa sổ" : "Khóa sổ kế toán",
    message: unlock
      ? `Mở khóa sổ (đang khóa đến ngày ${formatDateDisplay(state.lockedThrough)})? Chứng từ các kỳ đã khóa sẽ sửa được.`
      : `Khóa sổ đến hết ngày ${formatDateDisplay(date)}? Mọi máy trạm sẽ không thêm, sửa, xóa được chứng từ đến ngày này.`,
    confirmText: unlock ? "Mở khóa" : "Khóa sổ",
    cancelText: "Hủy bỏ",
    type: "warning"
  });
  if (!ok) return;
  state.lockedThrough = date;
  state.lockedThroughInfo = { by: user.name || user.username || "", at: new Date().toISOString() };
  if (typeof logUserAction === "function") logUserAction(unlock ? "Mở khóa sổ" : "Khóa sổ", unlock ? "Mở khóa sổ kế toán" : `Khóa sổ đến ngày ${formatDateDisplay(date)}`);
  saveState();
  renderTaxLockSettings();
  showToast(unlock ? "Đã mở khóa sổ." : `Đã khóa sổ đến ngày ${formatDateDisplay(date)}.`, "success");
}

// Thay đổi chế độ kế toán (TT99 — thay TT200 — / TT133)
async function setAccountingStandard(standard) {
  if (isTT99Family(standard) === isTT99Family(state.accountingStandard)) return;
  if (!window.currentUser || window.currentUser.role !== "admin") {
    showToast("Chỉ quản trị viên được đổi chế độ kế toán.", "danger");
    return;
  }
  const label = isTT99Family(standard) ? "Thông tư 99/2025/TT-BTC" : "Thông tư 133/2016/TT-BTC";
  // Phiếu kế toán nhập tay không tự đổi TK (trừ phiếu tạm tính TNDN) — báo trước số phiếu sẽ có TK ngoài danh mục mới.
  const invalidJournals = state.vouchers.filter(v => v && v.type === "general_journal" && !v.citProvision && (v.entries || [])
    .some(e => e && [e.debit, e.credit].some(code => !isValidAccount(code, standard)))).length;
  if (invalidJournals && !confirm(`Có ${invalidJournals} phiếu kế toán dùng tài khoản không có trong danh mục ${label}. Các phiếu này vẫn ghi sổ nhưng cần sửa tay. Tiếp tục?`)) return;
  const ok = await showConfirmModal({
    title: "Xác nhận đổi chế độ kế toán",
    message: `Chuyển sang chế độ kế toán theo ${label}? Thay đổi này áp dụng cho mọi trạm làm việc và hệ thống sẽ tính toán lại (ghi sổ lại) toàn bộ sổ sách kế toán.`,
    confirmText: "Đổi chế độ",
    cancelText: "Hủy bỏ",
    type: "warning"
  });
  if (!ok) return;
  // Lưu "TT200" cho nhóm TT99: trạm chạy bản cũ (so sánh === "TT200") và dữ liệu cloud vẫn hiểu đúng.
  state.accountingStandard = isTT99Family(standard) ? "TT200" : "TT133";
  saveState();
  updateCompanyUI();
  recalculateAccounting();
  showToast(`Đã chuyển sang chế độ kế toán theo ${label}`, "info");
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
        if (typeof migrateAuthUsers === "function") migrateAuthUsers(); // tài khoản cũ đăng nhập được ngay, không cần khởi động lại
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
    secretInput: document.getElementById("setting-cloud-workspace-secret"),
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
    if (elements.secretInput) elements.secretInput.value = cloudSyncSettings.workspaceSecret || "";

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
  if (elements.secretInput) elements.secretInput.disabled = inputsDisabled;
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
      supabaseAnonKey,
      workspaceSecret: elements.secretInput ? elements.secretInput.value.trim() : (cloudSyncSettings.workspaceSecret || "")
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
