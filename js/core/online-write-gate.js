(function initOnlineWriteGate(root) {
  "use strict";

  const VALID_STATES = new Set(["connecting", "ready", "read-only", "syncing", "error"]);
  let status = "connecting";
  let detail = "Đang kết nối dữ liệu đám mây...";

  function canWrite() {
    // Cloud connectivity never freezes business entry. SQLite is the durable
    // local queue; only a broken local database makes writing unsafe.
    return root.localPersistenceHealthy !== false;
  }

  function ensureBanner() {
    let banner = document.getElementById("online-write-gate-banner");
    if (banner) return banner;
    banner = document.createElement("div");
    banner.id = "online-write-gate-banner";
    banner.className = "online-write-gate-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    document.body.appendChild(banner);
    return banner;
  }

  function refreshUi() {
    if (!document.body) return;
    const banner = ensureBanner();
    banner.dataset.state = status;
    banner.textContent = canWrite() ? "" : `Chế độ chỉ đọc: ${detail}`;
    banner.hidden = canWrite();
    document.documentElement.dataset.cloudWriteState = status;

    document.querySelectorAll('[data-role-required="write"]').forEach(el => {
      if (el.id === "btn-save-cloud-config" || el.closest("#form-cloud-sync")) return;
      if (!(el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      if (!canWrite()) {
        if (!el.dataset.onlineGateDisabled) {
          el.dataset.onlineGateDisabled = el.disabled ? "already" : "gate";
        }
        el.disabled = true;
        el.title = detail;
      } else if (el.dataset.onlineGateDisabled === "gate") {
        el.disabled = false;
        delete el.dataset.onlineGateDisabled;
        if (el.title === detail) el.removeAttribute("title");
      }
    });
  }

  function setStatus(nextStatus, nextDetail) {
    status = VALID_STATES.has(nextStatus) ? nextStatus : "error";
    detail = String(nextDetail || (canWrite() ? "Đã kết nối" : "Không thể ghi dữ liệu lúc này."));
    refreshUi();
    window.dispatchEvent(new CustomEvent("cloud-write-status-changed", { detail: getStatus() }));
  }

  function getStatus() {
    return { status, detail, canWrite: canWrite() };
  }

  function assertCanWrite(action) {
    if (canWrite()) return true;
    const message = `${action || "Thao tác"} bị khóa vì ứng dụng đang ở chế độ chỉ đọc. ${detail}`;
    if (typeof root.showToast === "function") root.showToast(message, "warning");
    else console.warn("[OnlineWriteGate]", message);
    return false;
  }

  function findProtectedClickTarget(rawTarget) {
    if (!rawTarget || !rawTarget.closest) return null;
    const explicit = rawTarget.closest('[data-role-required="write"]');
    if (explicit) return explicit;
    const control = rawTarget.closest('button, a[onclick], input[type="button"], input[type="submit"]');
    if (!control) return null;
    const handler = String(control.getAttribute("onclick") || "");
    return /(^|\W)(delete|batchDelete|submit|save|create|merge|adjust|quickAdd)[A-Za-z0-9_]*/i.test(handler)
      ? control
      : null;
  }

  document.addEventListener("click", event => {
    const target = findProtectedClickTarget(event.target);
    if (target && (target.id === "btn-save-cloud-config" || target.closest("#form-cloud-sync"))) return;
    if (!target || canWrite()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    assertCanWrite("Thao tác ghi");
  }, true);

  document.addEventListener("submit", event => {
    const submitter = event.submitter;
    const protectedForm = (submitter && submitter.matches('[data-role-required="write"]')) ||
      event.target.querySelector('[data-role-required="write"]');
    if (!protectedForm || canWrite()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    assertCanWrite("Lưu dữ liệu");
  }, true);

  const observer = new MutationObserver(refreshUi);
  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-role-required"] });
    refreshUi();
  });

  root.cloudWriteGate = { setStatus, getStatus, canWrite, assertCanWrite, refreshUi };
})(window);
