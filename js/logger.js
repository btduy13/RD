
// ==========================================================================
// HỆ THỐNG GIÁM SÁT VÀ GHI NHẬT KÝ LỖI TOÀN CỤC (GLOBAL MONITOR & LOGGER)
// ==========================================================================
let errorLogs = [];
try {
  const savedLogs = localStorage.getItem("rd_accounting_error_logs");
  if (savedLogs) {
    const parsed = JSON.parse(savedLogs);
    if (Array.isArray(parsed)) {
      // Tự động loại bỏ các log cũ liên quan đến Firebase và MongoDB (hệ thống đã chuyển sang dùng Supabase)
      errorLogs = parsed.filter(log => {
        const msg = (log.message || "").toLowerCase();
        const ctx = (log.context || "").toLowerCase();
        const stack = (log.error && (log.error.stack || log.error.message) || "").toLowerCase();
        const isTransientMigrationError = 
          msg.includes("firebase") || msg.includes("mongodb") ||
          ctx.includes("firebase") || ctx.includes("mongodb") ||
          stack.includes("firebase") || stack.includes("mongodb") ||
          msg.includes("append .json") || msg.includes("google") ||
          msg.includes("forbidden") || msg.includes("403") ||
          msg.includes("statement timeout") || msg.includes("unique constraint") ||
          msg.includes("duplicate key");
        return !isTransientMigrationError;
      });
      localStorage.setItem("rd_accounting_error_logs", JSON.stringify(errorLogs));
    }
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
// Đăng ký toàn cục các hàm tương tác để chống lỗi Context / Scoping trong Electron
window.clearErrorLogs = clearErrorLogs;
window.exportErrorLogs = exportErrorLogs;
window.addErrorLog = addErrorLog;
window.updateErrorLogsUI = updateErrorLogsUI;

// Khởi chạy đồng bộ logs UI ngay khi script load
setTimeout(() => {
  try {
    updateErrorLogsUI();
  } catch (e) {
    console.error(e);
  }
}, 50);
