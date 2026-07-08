// Shared UI for voucher creation/editing modals across sales, purchase, and cash tabs.

const VOUCHER_ENTRY_MODAL_IDS = new Set([
  "modal-add-purchase",
  "modal-add-purchase-return",
  "modal-add-purchase-order",
  "modal-add-sales",
  "modal-add-sales-quotation",
  "modal-add-sales-return",
  "modal-add-receipt",
  "modal-add-payment"
]);

const voucherSubmitBusy = new Set();

const VOUCHER_SUBMIT_LABELS = {
  "modal-add-purchase": "Ghi sổ chứng từ",
  "modal-add-purchase-return": "Ghi sổ chứng từ",
  "modal-add-purchase-order": "Lưu đơn đặt hàng",
  "modal-add-sales": "Ghi sổ chứng từ",
  "modal-add-sales-quotation": "Lưu phiếu báo giá",
  "modal-add-sales-return": "Ghi sổ chứng từ",
  "modal-add-receipt": "Ghi sổ",
  "modal-add-payment": "Ghi sổ"
};

function isVoucherEntryModalId(modalId) {
  return VOUCHER_ENTRY_MODAL_IDS.has(modalId);
}

function getVoucherModalElements(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;

  return {
    modal,
    form: modal.querySelector("form"),
    footer: modal.querySelector(".modal-footer"),
    status: modal.querySelector(".voucher-form-status"),
    submitBtn: modal.querySelector(".voucher-submit-btn") || modal.querySelector(".modal-footer [type='submit']"),
    cancelBtn: modal.querySelector(".voucher-cancel-btn") || modal.querySelector(".modal-footer .btn-secondary"),
    closeBtn: modal.querySelector(".modal-close-btn")
  };
}

function ensureVoucherModalChrome(modalId) {
  const els = getVoucherModalElements(modalId);
  if (!els || !els.modal || !els.footer) return;

  els.modal.classList.add("voucher-entry-modal");

  if (!els.footer.querySelector(".voucher-form-status")) {
    const status = document.createElement("div");
    status.className = "voucher-form-status";
    status.setAttribute("aria-live", "polite");
    status.innerHTML = `
      <span class="voucher-form-status-icon" aria-hidden="true"></span>
      <span class="voucher-form-status-text"></span>
    `;
    els.footer.classList.add("voucher-modal-footer");
    els.footer.insertBefore(status, els.footer.firstChild);

    const actions = document.createElement("div");
    actions.className = "voucher-modal-footer-actions";
    while (els.footer.children.length > 1) {
      actions.appendChild(els.footer.children[1]);
    }
    els.footer.appendChild(actions);
  }

  if (els.submitBtn && !els.submitBtn.classList.contains("voucher-submit-btn")) {
    els.submitBtn.classList.add("voucher-submit-btn");
    if (!els.submitBtn.dataset.defaultLabel) {
      els.submitBtn.dataset.defaultLabel = els.submitBtn.textContent.trim()
        || VOUCHER_SUBMIT_LABELS[modalId]
        || "Ghi sổ chứng từ";
    }
  }

  if (els.cancelBtn && !els.cancelBtn.classList.contains("voucher-cancel-btn")) {
    els.cancelBtn.classList.add("voucher-cancel-btn");
  }

  els.modal.querySelectorAll("[id$='-total-display']").forEach(input => {
    input.classList.add("voucher-total-display");
    const panel = input.closest(".form-group");
    if (panel) panel.classList.add("voucher-total-field");
    const wrapper = input.closest(".form-group.col-span-full");
    if (wrapper) wrapper.classList.add("voucher-total-panel");
  });

  const itemsTable = els.modal.querySelector(".dynamic-items-table");
  if (itemsTable && !itemsTable.closest(".voucher-items-card")) {
    const card = document.createElement("div");
    card.className = "voucher-items-card";
    itemsTable.parentNode.insertBefore(card, itemsTable);
    card.appendChild(itemsTable);
  }

  const itemsBody = els.modal.querySelector(".dynamic-items-table tbody[id]");
  if (itemsBody) {
    ensureDynamicItemsRowCountElement(itemsBody);
    updateDynamicItemsRowCount(itemsBody.id);
  }
}

function setVoucherFormStatus(modalId, message, phase = "busy") {
  const els = getVoucherModalElements(modalId);
  if (!els || !els.status) return;

  const textEl = els.status.querySelector(".voucher-form-status-text");
  const iconEl = els.status.querySelector(".voucher-form-status-icon");

  els.status.classList.remove("is-hidden", "is-success", "is-error");
  els.status.dataset.phase = phase;

  if (!message) {
    els.status.classList.add("is-hidden");
    if (textEl) textEl.textContent = "";
    return;
  }

  if (textEl) textEl.textContent = message;
  if (iconEl) {
    iconEl.className = "voucher-form-status-icon";
    if (phase === "success") iconEl.classList.add("is-success");
    else if (phase === "error") iconEl.classList.add("is-error");
    else iconEl.classList.add("is-spinning");
  }
}

function isVoucherFormBusy(modalId) {
  return voucherSubmitBusy.has(modalId);
}

function beginVoucherSubmit(modalId, message = "Đang xử lý chứng từ...") {
  if (voucherSubmitBusy.has(modalId)) return false;

  ensureVoucherModalChrome(modalId);
  const els = getVoucherModalElements(modalId);
  if (!els) return false;

  voucherSubmitBusy.add(modalId);
  els.modal.classList.add("voucher-form-busy");
  if (els.form) els.form.setAttribute("aria-busy", "true");

  [els.submitBtn, els.cancelBtn, els.closeBtn].forEach(btn => {
    if (btn) btn.disabled = true;
  });

  if (els.submitBtn) {
    els.submitBtn.classList.add("is-loading");
    els.submitBtn.textContent = "Đang lưu...";
  }

  setVoucherFormStatus(modalId, message, "busy");
  return true;
}

function endVoucherSubmit(modalId) {
  voucherSubmitBusy.delete(modalId);
  const els = getVoucherModalElements(modalId);
  if (!els) return;

  els.modal.classList.remove("voucher-form-busy");
  if (els.form) els.form.removeAttribute("aria-busy");

  [els.submitBtn, els.cancelBtn, els.closeBtn].forEach(btn => {
    if (btn) btn.disabled = false;
  });

  if (els.submitBtn) {
    els.submitBtn.classList.remove("is-loading");
    els.submitBtn.textContent = els.submitBtn.dataset.defaultLabel
      || VOUCHER_SUBMIT_LABELS[modalId]
      || "Ghi sổ chứng từ";
  }

  setVoucherFormStatus(modalId, "", "idle");
}

function resetVoucherFormStatus(modalId) {
  endVoucherSubmit(modalId);
}

function setVoucherModalMode(modalId, mode) {
  ensureVoucherModalChrome(modalId);
  const els = getVoucherModalElements(modalId);
  if (!els || !els.modal) return;

  const header = els.modal.querySelector(".modal-header");
  if (!header || header.querySelector(".voucher-mode-badge")) return;

  const badge = document.createElement("span");
  badge.className = `voucher-mode-badge ${mode === "edit" ? "is-edit" : "is-create"}`;
  badge.textContent = mode === "edit" ? "Chỉnh sửa" : "Tạo mới";
  header.appendChild(badge);
}

function updateVoucherModeBadge(modalId, isEdit) {
  const els = getVoucherModalElements(modalId);
  if (!els || !els.modal) return;

  let badge = els.modal.querySelector(".voucher-mode-badge");
  if (!badge) {
    setVoucherModalMode(modalId, isEdit ? "edit" : "create");
    badge = els.modal.querySelector(".voucher-mode-badge");
  }
  if (!badge) return;

  badge.classList.toggle("is-edit", !!isEdit);
  badge.classList.toggle("is-create", !isEdit);
  badge.textContent = isEdit ? "Chỉnh sửa" : "Tạo mới";
}

function patchVoucherModalLifecycle() {
  const origOpen = window.openModal;
  window.openModal = function (modalId) {
    if (typeof origOpen === "function") origOpen(modalId);
    if (isVoucherEntryModalId(modalId)) {
      ensureVoucherModalChrome(modalId);
      resetVoucherFormStatus(modalId);
    }
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.querySelectorAll(".dynamic-items-table tbody[id]").forEach(tbody => {
        ensureDynamicItemsRowCountElement(tbody);
        updateDynamicItemsRowCount(tbody.id);
      });
    }
  };

  const origClose = window.closeModal;
  window.closeModal = function (modalId) {
    if (isVoucherEntryModalId(modalId) && isVoucherFormBusy(modalId)) {
      if (typeof showToast === "function") {
        showToast("Đang lưu chứng từ, vui lòng chờ...", "info");
      }
      return;
    }
    if (typeof origClose === "function") origClose(modalId);
    if (isVoucherEntryModalId(modalId)) {
      resetVoucherFormStatus(modalId);
    }
  };
}

const dynamicFormTableRegistry = Object.create(null);

function registerDynamicFormTable(tbodyId, config) {
  if (!tbodyId || !config || typeof config.addRow !== "function") return;
  dynamicFormTableRegistry[tbodyId] = config;
}

function ensureDynamicItemsRowCountElement(tbody) {
  if (!tbody || !tbody.id) return null;

  const table = tbody.closest(".dynamic-items-table");
  if (!table) return null;

  const scrollWrapper = table.closest(".dynamic-items-table-wrapper");
  const tableAnchor = scrollWrapper || table;
  const host = tableAnchor.parentElement;
  if (!host) return null;

  const counters = document.querySelectorAll(`.dynamic-items-row-count[data-tbody-id="${tbody.id}"]`);
  let counter = counters.length > 0 ? counters[counters.length - 1] : null;
  counters.forEach((el) => {
    if (el !== counter) el.remove();
  });

  const footers = host.querySelectorAll(`.dynamic-items-table-footer[data-tbody-id="${tbody.id}"]`);
  let footer = footers.length > 0 ? footers[footers.length - 1] : null;
  footers.forEach((el) => {
    if (el !== footer) el.remove();
  });

  if (!footer) {
    footer = document.createElement("div");
    footer.className = "dynamic-items-table-footer";
    footer.dataset.tbodyId = tbody.id;
    tableAnchor.insertAdjacentElement("afterend", footer);
  }

  if (!counter || !footer.contains(counter)) {
    counter = document.createElement("div");
    counter.className = "dynamic-items-row-count";
    counter.dataset.tbodyId = tbody.id;
    footer.insertBefore(counter, footer.firstChild);
  }

  return counter;
}

function updateDynamicItemsRowCount(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const counter = ensureDynamicItemsRowCountElement(tbody);
  if (!counter) return;

  const count = tbody.querySelectorAll("tr").length;
  counter.textContent = `Số dòng: ${count}`;
}

function refreshDynamicFormTable(tbodyId) {
  const config = dynamicFormTableRegistry[tbodyId];
  if (config && typeof config.recalc === "function") {
    config.recalc();
  }
  updateDynamicItemsRowCount(tbodyId);
}

function mountDynamicFormRow(tbody, tr, insertAfterRow = null) {
  if (!tbody || !tr) return tr;

  if (insertAfterRow) {
    const anchor = typeof insertAfterRow === "string"
      ? document.getElementById(insertAfterRow)
      : insertAfterRow;
    if (anchor && anchor.parentNode === tbody) {
      anchor.insertAdjacentElement("afterend", tr);
      return tr;
    }
  }

  tbody.appendChild(tr);
  return tr;
}

function buildDynamicRowActionsCell(rowId, tbodyId) {
  return `
    <td class="dynamic-row-actions-cell">
      <div class="dynamic-row-actions">
        <button type="button" class="trash-btn dynamic-row-delete-btn" onclick="removeDynamicFormRow('${rowId}', '${tbodyId}')" title="Xóa dòng">×</button>
        <button type="button" class="insert-row-btn dynamic-row-insert-btn" onclick="insertDynamicFormRowAfter('${tbodyId}', '${rowId}')" title="Chèn dòng phía dưới">+</button>
      </div>
    </td>
  `;
}

function removeDynamicFormRow(rowId, tbodyId) {
  const row = document.getElementById(rowId);
  const tbody = document.getElementById(tbodyId);
  if (!row || !tbody) return;

  const rows = tbody.querySelectorAll("tr");
  if (rows.length <= 1) {
    if (typeof showToast === "function") {
      showToast("Phải có ít nhất 1 dòng.", "info");
    }
    return;
  }

  row.remove();
  refreshDynamicFormTable(tbodyId);
}

function insertDynamicFormRowAfter(tbodyId, afterRowId) {
  const config = dynamicFormTableRegistry[tbodyId];
  const afterRow = document.getElementById(afterRowId);
  if (!config || !afterRow) return;
  config.addRow(afterRow);
}

function initDynamicItemsTables() {
  document.querySelectorAll(".dynamic-items-table tbody[id]").forEach(tbody => {
    ensureDynamicItemsRowCountElement(tbody);
    updateDynamicItemsRowCount(tbody.id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  VOUCHER_ENTRY_MODAL_IDS.forEach(ensureVoucherModalChrome);
  patchVoucherModalLifecycle();
  initDynamicItemsTables();
});

window.isVoucherEntryModalId = isVoucherEntryModalId;
window.registerDynamicFormTable = registerDynamicFormTable;
window.buildDynamicRowActionsCell = buildDynamicRowActionsCell;
window.mountDynamicFormRow = mountDynamicFormRow;
window.removeDynamicFormRow = removeDynamicFormRow;
window.insertDynamicFormRowAfter = insertDynamicFormRowAfter;
window.updateDynamicItemsRowCount = updateDynamicItemsRowCount;
window.refreshDynamicFormTable = refreshDynamicFormTable;
window.isVoucherFormBusy = isVoucherFormBusy;
window.beginVoucherSubmit = beginVoucherSubmit;
window.endVoucherSubmit = endVoucherSubmit;
window.setVoucherFormStatus = setVoucherFormStatus;
window.resetVoucherFormStatus = resetVoucherFormStatus;
window.updateVoucherModeBadge = updateVoucherModeBadge;
window.ensureVoucherModalChrome = ensureVoucherModalChrome;
