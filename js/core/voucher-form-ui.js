// Shared UI for voucher creation/editing modals across sales, purchase, and cash tabs.

const VOUCHER_ENTRY_MODAL_IDS = new Set([
  "modal-add-purchase",
  "modal-add-purchase-return",
  "modal-add-purchase-order",
  "modal-add-sales",
  "modal-add-sales-quotation",
  "modal-add-sales-return",
  "modal-add-receipt",
  "modal-add-payment",
  "modal-general-journal"
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
  "modal-add-payment": "Ghi sổ",
  "modal-general-journal": "Ghi sổ"
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
  if (voucherSubmitBusy.has(modalId) || window.assertCanWriteRole?.() === false) return false;

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
      // Tự động kết thúc trạng thái busy thay vì chặn đóng form
      endVoucherSubmit(modalId);
    }
    if (typeof origClose === "function") origClose(modalId);
    if (isVoucherEntryModalId(modalId)) {
      resetVoucherFormStatus(modalId);
    }
  };
}

const dynamicFormTableRegistry = Object.create(null);
let dynamicFormRowSequence = 0;

function createStandardDynamicFormTableConfig(options = {}) {
  const hasDescription = options.hasDescription === true;
  const hasDiscount = options.hasDiscount !== false;
  const widths = options.widths || {};
  const columns = [
    {
      key: "productId",
      type: "product",
      label: options.productLabel || "Tên sản phẩm",
      width: widths.productId || (hasDescription ? "12%" : "35%"),
      placeholder: options.productPlaceholder || "Gõ mã hoặc tên sản phẩm...",
      listId: options.productListId || "",
      required: true
    }
  ];

  if (hasDescription) {
    columns.push({
      key: "desc",
      type: "description",
      label: options.descriptionLabel || "Mô tả",
      width: widths.desc || "23%",
      placeholder: options.descriptionPlaceholder || "Mô tả..."
    });
  }

  columns.push(
    {
      key: "qty",
      type: "quantity",
      label: options.quantityLabel || "Số lượng",
      width: widths.qty || "12%",
      align: "right",
      required: true
    },
    {
      key: "price",
      type: "money",
      label: options.priceLabel || "Đơn giá (đ)",
      width: widths.price || "18%",
      align: "right",
      required: true
    }
  );

  if (hasDiscount) {
    columns.push({
      key: "discount",
      type: "discount",
      label: options.discountLabel || "Chiết khấu (%)",
      width: widths.discount || "15%",
      align: "right",
      required: true
    });
  }

  if (options.hasVat) {
    columns.push({
      key: "vatRate",
      type: "vat",
      label: options.vatLabel || "Thuế GTGT",
      width: widths.vatRate || "9%",
      align: "center"
    });
  }

  columns.push(
    {
      key: "amount",
      type: "amount",
      label: options.amountLabel || "Thành tiền",
      width: widths.amount || "15%",
      align: "right"
    },
    {
      key: "actions",
      type: "actions",
      label: "",
      width: widths.actions || "8%",
      align: "center"
    }
  );

  return {
    ...options,
    columns,
    defaults: {
      productId: "",
      ...(hasDescription ? { desc: "" } : {}),
      qty: 1,
      price: 0,
      ...(hasDiscount ? { discount: 0 } : {}),
      ...(options.defaults || {})
    }
  };
}

function registerDynamicFormTable(tbodyIdOrConfig, maybeConfig) {
  const config = typeof tbodyIdOrConfig === "string"
    ? { ...(maybeConfig || {}), tbodyId: tbodyIdOrConfig }
    : { ...(tbodyIdOrConfig || {}) };
  const tbodyId = config.tbodyId;

  if (!tbodyId || !Array.isArray(config.columns) || config.columns.length === 0) {
    console.warn("[VoucherTable] Cấu hình bảng không hợp lệ:", tbodyId || config);
    return null;
  }

  config.key = config.key || tbodyId;
  dynamicFormTableRegistry[tbodyId] = config;

  const tbody = document.getElementById(tbodyId);
  if (tbody) {
    tbody.dataset.dynamicFormTable = config.key;
    renderDynamicFormTableHeader(tbodyId);
  }
  return config;
}

function getDynamicFormTableConfig(tbodyId) {
  return dynamicFormTableRegistry[tbodyId] || null;
}

function getDynamicFormTableConfigs() {
  return Object.values(dynamicFormTableRegistry);
}

function getDynamicFormTableConfigByFormId(formId) {
  return getDynamicFormTableConfigs().find(config => config.formId === formId) || null;
}

function getVisibleDynamicFormTableConfig() {
  return getDynamicFormTableConfigs().find(config => {
    const modal = config.modalId ? document.getElementById(config.modalId) : null;
    return modal && (modal.style.display === "flex" || window.getComputedStyle(modal).display === "flex");
  }) || null;
}

function validateDynamicFormTableConfig(config) {
  const errors = [];
  if (!config) return ["missing config"];
  const tbody = document.getElementById(config.tbodyId);
  const form = config.formId ? document.getElementById(config.formId) : null;
  if (!tbody) errors.push(`Không tìm thấy tbody #${config.tbodyId}`);
  if (config.formId && !form) errors.push(`Không tìm thấy form #${config.formId}`);
  if (tbody && form && !form.contains(tbody)) errors.push(`#${config.tbodyId} không thuộc #${config.formId}`);

  const columnKeys = config.columns.map(column => column.key);
  if (new Set(columnKeys).size !== columnKeys.length) errors.push("Schema có key cột trùng nhau");
  Object.entries(config.fieldIds || {}).forEach(([key, elementId]) => {
    if (!document.getElementById(elementId)) errors.push(`Field ${key} trỏ tới ID không tồn tại: #${elementId}`);
  });
  return errors;
}

function renderDynamicFormTableHeader(tbodyId) {
  const config = getDynamicFormTableConfig(tbodyId);
  const tbody = document.getElementById(tbodyId);
  const table = tbody ? tbody.closest(".dynamic-items-table") : null;
  const thead = table ? table.querySelector("thead") : null;
  if (!config || !thead) return;

  const tr = document.createElement("tr");
  config.columns.forEach(column => {
    const th = document.createElement("th");
    th.dataset.columnKey = column.key;
    th.textContent = column.label || "";
    if (column.width) th.style.width = column.width;
    if (column.align) th.style.textAlign = column.align;
    tr.appendChild(th);
  });
  thead.replaceChildren(tr);
}

function formatDynamicQuantity(value) {
  const raw = value === undefined || value === null || value === "" ? 1 : value;
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? String(raw) : String(raw).replace(".", ",");
  }
  return String(raw);
}

// Ô số lượng hiển thị kiểu VN ("1,125" = 1.125, "1.234,5"): phẩy luôn là thập phân, chấm chỉ là phân nhóm nghìn
// khi đúng nhóm 3 số ("1.234"); safeParseFloat coi "1,125" là 1125 nên không dùng cho số lượng.
function parseDynamicQuantity(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = String(value ?? "").replace(/\s/g, "");
  if (s.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(s) || 0;
}

function parseDynamicMoney(value) {
  return Number.parseInt(String(value || "").replace(/[^\d-]/g, ""), 10) || 0;
}

function parseDynamicDiscount(value) {
  return Number.parseFloat(String(value || "").replace(/,/g, ".").replace(/[^\d.-]/g, "")) || 0;
}

function validateDynamicVoucherLine(qty, price, discount) {
  const numericQty = Number(qty);
  const numericPrice = Number(price);
  const numericDiscount = Number(discount);

  if (!Number.isFinite(numericQty) || numericQty <= 0) {
    return "Số lượng phải lớn hơn 0.";
  }
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return "Đơn giá không được âm.";
  }
  if (!Number.isFinite(numericDiscount) || numericDiscount < 0 || numericDiscount > 100) {
    return "Chiết khấu phải từ 0% đến 100%.";
  }
  return "";
}

function normalizeDynamicDiscountValue(discount, qty, price) {
  const numericDiscount = Number(discount) || 0;
  if (numericDiscount <= 100) return numericDiscount;
  const gross = (Number(qty) || 0) * (Number(price) || 0);
  return gross > 0 ? (numericDiscount / gross) * 100 : 0;
}

function formatDynamicMoney(value) {
  if (typeof formatVND === "function") return formatVND(value || 0);
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

function setDynamicMoneyDisplay(elementId, value) {
  if (!elementId) return;
  const element = document.getElementById(elementId);
  if (!element) return;
  const formatted = formatDynamicMoney(value);
  if ("value" in element) element.value = formatted;
  else element.textContent = formatted;
}

// Thuế suất GTGT theo dòng (C1). Dòng chưa có thuế suất lấy thuế suất chung của chứng từ (ô ẩn, chứng từ cũ).
const VAT_RATE_OPTIONS = ["10", "8", "5", "0", "KCT", "KKKNT"];

function createDynamicVatSelect(column, value, config) {
  const select = document.createElement("select");
  select.className = "form-control item-vatrate";
  select.dataset.fieldKey = column.key;
  select.setAttribute("aria-label", column.label || column.key);
  VAT_RATE_OPTIONS.forEach(rate => select.add(new Option(/^\d+$/.test(rate) ? `${rate}%` : rate, rate)));
  const own = value === undefined || value === null || value === "" ? "" : String(value).trim().toUpperCase();
  const headerRate = config.totals && config.totals.taxRateId ? document.getElementById(config.totals.taxRateId)?.value : "";
  select.value = own || String(headerRate || "0");
  if (!select.value) select.value = "0";
  select.addEventListener("change", () => refreshDynamicFormTable(config.tbodyId));
  return select;
}

// Giá trị lưu vào item.vatRate: số (0|5|8|10) hoặc "KCT"/"KKKNT"; undefined khi form không có cột thuế.
function readDynamicVatRate(row) {
  const value = row && row.querySelector(".item-vatrate")?.value;
  if (value === undefined || value === "") return undefined;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function createDynamicFormInput(column, value, config) {
  if (column.type === "vat") return createDynamicVatSelect(column, value, config);
  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control";
  input.dataset.fieldKey = column.key;
  input.setAttribute("aria-label", column.label || column.key);
  if (column.placeholder) input.placeholder = column.placeholder;
  if (column.required) input.required = true;

  if (column.type === "product") {
    input.classList.add("item-productId");
    if (column.listId) input.setAttribute("list", column.listId);
    input.value = value === undefined || value === null ? "" : String(value);
    if (typeof config.onProductInput === "function") {
      input.addEventListener("input", () => config.onProductInput(input));
      input.addEventListener("blur", () => config.onProductInput(input));
    }
  } else if (column.type === "description") {
    input.classList.add("item-desc");
    input.value = value === undefined || value === null ? "" : String(value);
    if (input.value) input.dataset.userEdited = "1";
    input.addEventListener("input", () => { input.dataset.userEdited = "1"; });
  } else if (column.type === "quantity") {
    input.classList.add("item-qty", "text-right", "qty-format");
    input.value = formatDynamicQuantity(value);
    input.addEventListener("input", () => refreshDynamicFormTable(config.tbodyId));
  } else if (column.type === "money") {
    input.classList.add("item-price", "text-right", "number-format");
    input.value = Number(parseDynamicMoney(value)).toLocaleString("vi-VN");
    input.addEventListener("input", () => refreshDynamicFormTable(config.tbodyId));
  } else if (column.type === "discount") {
    // qty-format (không phải number-format) để gõ được "2,5" %.
    input.classList.add("item-discount", "text-right", "qty-format");
    input.placeholder = "0";
    input.value = value === undefined || value === null || value === "" ? "0" : String(value);
    input.addEventListener("input", () => refreshDynamicFormTable(config.tbodyId));
  }

  return input;
}

function createDynamicRowActionsElement(rowId, tbodyId) {
  const wrapper = document.createElement("div");
  wrapper.className = "dynamic-row-actions";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "trash-btn dynamic-row-delete-btn";
  deleteButton.title = "Xóa dòng";
  deleteButton.setAttribute("aria-label", "Xóa dòng");
  deleteButton.textContent = "×";
  deleteButton.addEventListener("click", () => removeDynamicFormRow(rowId, tbodyId));

  const insertButton = document.createElement("button");
  insertButton.type = "button";
  insertButton.className = "insert-row-btn dynamic-row-insert-btn";
  insertButton.title = "Chèn dòng phía dưới";
  insertButton.setAttribute("aria-label", "Chèn dòng phía dưới");
  insertButton.textContent = "+";
  insertButton.addEventListener("click", () => insertDynamicFormRowAfter(tbodyId, rowId));

  wrapper.append(deleteButton, insertButton);
  return wrapper;
}

function addDynamicFormTableRow(tbodyId, rowValues = {}, insertAfterRow = null, options = {}) {
  const config = getDynamicFormTableConfig(tbodyId);
  const tbody = document.getElementById(tbodyId);
  if (!config || !tbody) return null;

  const values = { ...(config.defaults || {}), ...(rowValues || {}) };
  const rowId = `${config.rowIdPrefix || "voucher-row"}-${++dynamicFormRowSequence}`;
  const tr = document.createElement("tr");
  tr.id = rowId;
  tr.dataset.dynamicFormRow = config.key;

  config.columns.forEach(column => {
    const td = document.createElement("td");
    td.dataset.columnKey = column.key;
    if (column.align) td.style.textAlign = column.align;

    if (column.type === "amount") {
      td.className = "text-right font-numeric item-total-display";
      td.textContent = formatDynamicMoney(0);
    } else if (column.type === "actions") {
      td.className = "dynamic-row-actions-cell";
      td.appendChild(createDynamicRowActionsElement(rowId, tbodyId));
    } else {
      td.appendChild(createDynamicFormInput(column, values[column.key], config));
    }
    tr.appendChild(td);
  });

  mountDynamicFormRow(tbody, tr, insertAfterRow);
  // Keep the product that the row was created with. Product lookup also runs
  // on blur; without this marker it could replace a negotiated price while
  // an existing voucher was being edited.
  const productInput = tr.querySelector(".item-productId");
  if (productInput) {
    productInput.dataset.lastResolvedProductId = String(values.productId || "");
    productInput.dataset.priceInitialized = Number(String(values.price ?? "").replace(/[^\d.-]/g, "")) > 0
      ? "1"
      : "0";
  }
  if (options.refresh !== false) refreshDynamicFormTable(tbodyId);

  if (options.focus !== false && productInput && !values.productId) {
    setTimeout(() => productInput.focus(), 30);
  }
  return tr;
}

// Only fill a catalogue price when the product really changed or the row has
// no price yet. This preserves manually negotiated prices and discounts.
function shouldAutoFillDynamicProductPrice(selectEl, product, options = {}) {
  if (!selectEl || !product) return false;
  const productId = String(product.id || "");

  if (options.forcePrice === true) {
    selectEl.dataset.lastResolvedProductId = productId;
    selectEl.dataset.priceInitialized = "1";
    return true;
  }

  const previousProductId = String(selectEl.dataset.lastResolvedProductId || "");
  const priceInput = selectEl.closest("tr")?.querySelector(".item-price");
  const hasPrice = !!priceInput && String(priceInput.value || "").trim() !== "";
  const sameProduct = previousProductId === productId;

  if (sameProduct && (hasPrice || selectEl.dataset.priceInitialized === "1")) {
    return false;
  }

  selectEl.dataset.lastResolvedProductId = productId;
  selectEl.dataset.priceInitialized = "1";
  return true;
}

function serializeDynamicFormTable(tbodyId) {
  const config = getDynamicFormTableConfig(tbodyId);
  const tbody = document.getElementById(tbodyId);
  if (!config || !tbody) return [];

  return Array.from(tbody.querySelectorAll("tr")).map(row => {
    const item = {};
    config.columns.forEach(column => {
      if (["amount", "actions"].includes(column.type)) return;
      const input = row.querySelector(`[data-field-key="${column.key}"]`);
      item[column.key] = input ? input.value : "";
    });
    return item;
  });
}

function replaceDynamicFormTableRows(tbodyId, items, options = {}) {
  const config = getDynamicFormTableConfig(tbodyId);
  const tbody = document.getElementById(tbodyId);
  if (!config || !tbody) return;

  tbody.replaceChildren();
  const rows = Array.isArray(items) && items.length > 0 ? items : [config.defaults || {}];
  rows.forEach(item => addDynamicFormTableRow(tbodyId, item, null, { focus: false, refresh: false }));
  refreshDynamicFormTable(tbodyId);

  if (options.focus === true) {
    const firstInput = tbody.querySelector(".item-productId");
    if (firstInput) setTimeout(() => firstInput.focus(), 30);
  }
}

function resetDynamicVoucherForm(formId, fieldOverrides = {}) {
  const config = getDynamicFormTableConfigByFormId(formId);
  if (!config) return false;

  if (typeof config.setEditingId === "function") config.setEditingId(null);
  Object.entries(config.fieldIds || {}).forEach(([key, elementId]) => {
    const element = document.getElementById(elementId);
    if (!element || !("value" in element)) return;
    delete element.dataset.loaded;
    if (Object.prototype.hasOwnProperty.call(fieldOverrides, key)) {
      element.value = fieldOverrides[key];
    } else if (config.fieldDefaults && Object.prototype.hasOwnProperty.call(config.fieldDefaults, key)) {
      element.value = config.fieldDefaults[key];
    } else {
      element.value = "";
    }
  });
  replaceDynamicFormTableRows(config.tbodyId, []);
  if (typeof updateVoucherModeBadge === "function" && config.modalId) {
    updateVoucherModeBadge(config.modalId, false);
  }
  return true;
}

function recalculateDynamicFormTable(tbodyId) {
  const config = getDynamicFormTableConfig(tbodyId);
  const tbody = document.getElementById(tbodyId);
  if (!config || !tbody) return { subtotal: 0, taxAmount: 0, total: 0 };

  let subtotal = 0;
  const vatLines = [];
  tbody.querySelectorAll("tr").forEach(row => {
    const qty = parseDynamicQuantity(row.querySelector(".item-qty")?.value);
    const price = parseDynamicMoney(row.querySelector(".item-price")?.value);
    const discount = row.querySelector(".item-discount")
      ? parseDynamicDiscount(row.querySelector(".item-discount").value)
      : 0;
    const netAmount = typeof config.calculateAmount === "function"
      ? config.calculateAmount({ qty, price, discount, row })
      : Math.round(qty * price * (1 - discount / 100));
    const grossAmount = Math.round(qty * price);
    subtotal += netAmount;
    vatLines.push({ amount: netAmount, vatRate: readDynamicVatRate(row) });
    const amountDisplay = row.querySelector(".item-total-display");
    if (amountDisplay) amountDisplay.textContent = formatDynamicMoney(grossAmount);
  });

  const totals = config.totals || {};
  let taxRate = 0;
  if (Object.prototype.hasOwnProperty.call(totals, "fixedTaxRate")) {
    taxRate = Number(totals.fixedTaxRate) || 0;
  } else if (totals.taxRateId) {
    taxRate = Number.parseInt(document.getElementById(totals.taxRateId)?.value, 10) || 0;
  }
  // Cùng công thức với sổ cái (computeVatBreakdown): thuế làm tròn theo từng nhóm thuế suất.
  const vat = typeof computeVatBreakdown === "function" ? computeVatBreakdown(vatLines, taxRate) : null;
  const taxAmount = vat ? vat.tax : Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  setDynamicMoneyDisplay(totals.subtotalId, subtotal);
  setDynamicMoneyDisplay(totals.taxId, taxAmount);
  setDynamicMoneyDisplay(totals.totalId, total);
  renderDynamicVoucherTaxNote(config, vat, total);
  return { subtotal, taxAmount, total };
}

// ---------------------------------------------------------------------------
// Thông tin hóa đơn (C9, TT 91/2026 Đ4): mẫu số 1 chữ số, ký hiệu 6 ký tự, số ≤ 8 chữ số.
// Ô nhập theo tiền tố form: `${prefix}-inv-no`... Chỉ lưu khi có số HĐ hoặc HĐ gốc — chứng từ cũ giữ nguyên.
// ---------------------------------------------------------------------------
const VOUCHER_INVOICE_FIELDS = {
  invoiceForm: "inv-form", invoiceSymbol: "inv-symbol", invoiceNo: "inv-no",
  invoiceDate: "inv-date", partnerTaxCode: "inv-taxcode", originalInvoiceNo: "inv-orig"
};

function voucherInvoiceFieldIds(prefix, withOriginal = false) {
  const ids = {};
  Object.entries(VOUCHER_INVOICE_FIELDS).forEach(([key, suffix]) => {
    if (key !== "originalInvoiceNo" || withOriginal) ids[key] = `${prefix}-${suffix}`;
  });
  return ids;
}

function isValidInvoiceSymbol(symbol) {
  return /^[CK]\d{2}[TDLMNBGHXF][A-Z]{2}$/.test(String(symbol ?? "").trim());
}

function defaultSalesInvoiceSymbol(date) {
  return `C${String(date || "").slice(2, 4) || "00"}TAA`;
}

// Lỗi đầu tiên hoặc "". Giá trị không đổi so với lúc mở chứng từ (loaded) không bị chặn — dữ liệu nhập Excel cũ vẫn lưu được.
function validateVoucherInvoice(fields, loaded = {}) {
  const bad = (key, ok) => fields[key] && fields[key] !== loaded[key] && !ok(fields[key]);
  if (bad("invoiceForm", value => /^\d$/.test(value))) return "Mẫu số hóa đơn là 1 chữ số (1 = hóa đơn GTGT, 2 = hóa đơn bán hàng).";
  if (bad("invoiceSymbol", isValidInvoiceSymbol)) return "Ký hiệu hóa đơn gồm 6 ký tự, vd. C26TAA (C/K + 2 số năm + loại T/D/L/M/N/B/G/H/X/F + 2 chữ in hoa) — TT 91/2026 Đ4.";
  if (bad("invoiceNo", value => /^\d{1,8}$/.test(value))) return "Số hóa đơn tối đa 8 chữ số.";
  return "";
}

// Dòng ghi chú hóa đơn điều chỉnh giảm khi hàng bán bị trả lại (TT 91/2026 Đ10).
function buildInvoiceAdjustmentNote(originalNo, originalType) {
  const vouchers = typeof state !== "undefined" && Array.isArray(state.vouchers) ? state.vouchers : [];
  const orig = vouchers.find(v => v && v.type === originalType && String(v.invoiceNo ?? "") === originalNo);
  const parts = orig
    ? [`Mẫu số ${orig.invoiceForm || "1"}`, orig.invoiceSymbol ? `ký hiệu ${orig.invoiceSymbol}` : "", `số ${originalNo}`, `ngày ${formatDateDisplay(orig.invoiceDate || orig.date)}`]
    : [`số ${originalNo}`];
  return `Điều chỉnh giảm cho hóa đơn ${parts.filter(Boolean).join(" ")}`;
}

// context: { date, partner, originalType }. Trả về { fields, error }; fields rỗng khi không nhập số HĐ / HĐ gốc.
function readVoucherInvoiceFields(prefix, context = {}) {
  const fields = {};
  const loaded = {};
  Object.entries(VOUCHER_INVOICE_FIELDS).forEach(([key, suffix]) => {
    const el = document.getElementById(`${prefix}-${suffix}`);
    if (!el) return;
    const value = el.value.trim();
    if (value) fields[key] = key === "invoiceSymbol" ? value.toUpperCase() : value;
    loaded[key] = el.dataset.loaded || "";
  });
  if (!fields.invoiceNo && !fields.originalInvoiceNo) return { fields: {}, error: "" };
  const error = validateVoucherInvoice(fields, loaded);
  if (fields.invoiceNo) {
    fields.invoiceForm = fields.invoiceForm || "1";
    fields.invoiceDate = fields.invoiceDate || context.date || "";
  }
  if (!fields.partnerTaxCode && context.partner && context.partner.taxCode) fields.partnerTaxCode = context.partner.taxCode;
  if (fields.originalInvoiceNo) fields.invoiceNote = buildInvoiceAdjustmentNote(fields.originalInvoiceNo, context.originalType);
  return { fields, error };
}

function fillVoucherInvoiceFields(prefix, v, defaults = {}) {
  Object.entries(VOUCHER_INVOICE_FIELDS).forEach(([key, suffix]) => {
    const el = document.getElementById(`${prefix}-${suffix}`);
    if (!el) return;
    const stored = v && v[key] !== undefined && v[key] !== null ? String(v[key]) : "";
    el.dataset.loaded = stored;
    el.value = stored || defaults[key] || "";
  });
}

// MST người mua/bán lấy từ danh mục đối tác khi ô còn trống.
function initVoucherInvoicePartnerTaxCode() {
  ["sale", "sales-ret", "pur", "ret"].forEach(prefix => {
    const partnerEl = document.getElementById(`${prefix}-partner`);
    const taxEl = document.getElementById(`${prefix}-inv-taxcode`);
    if (!partnerEl || !taxEl) return;
    partnerEl.addEventListener("change", () => {
      const partner = typeof findExistingPartner === "function" ? findExistingPartner(partnerEl.value) : null;
      if (partner && partner.taxCode && !taxEl.value.trim()) taxEl.value = partner.taxCode;
    });
  });
}

// Cảnh báo C4: mua hàng trả tiền mặt (111) từ ngưỡng → thuế GTGT không được khấu trừ, chi phí không được trừ.
function getCashPaymentVatWarning(paymentMethod, total, date) {
  if (typeof isCashOverVatThreshold !== "function" || !isCashOverVatThreshold({ paymentMethod, date }, total)) return "";
  return `Thanh toán tiền mặt từ ${formatDynamicMoney(getTaxRule("vat.cashThreshold", date).value)}: thuế GTGT không được khấu trừ và chi phí không được trừ khi tính thuế TNDN (NĐ 181/2025 Đ26, NĐ 320/2025 Đ9)`;
}

// Tổng tiền theo từng thuế suất + cảnh báo (không chặn lưu) ngay dưới ô tổng cộng.
function renderDynamicVoucherTaxNote(config, vat, total) {
  const totalEl = config.totals && config.totals.totalId ? document.getElementById(config.totals.totalId) : null;
  if (!totalEl || !config.columns.some(column => column.type === "vat")) return;
  let note = document.getElementById(`${config.tbodyId}-tax-note`);
  if (!note) {
    note = document.createElement("div");
    note.id = `${config.tbodyId}-tax-note`;
    note.className = "voucher-tax-note";
    note.style.cssText = "font-size: 12px; margin-top: 6px; color: var(--text-secondary);";
    totalEl.insertAdjacentElement("afterend", note);
  }
  const fields = config.fieldIds || {};
  const date = document.getElementById(fields.date)?.value || "";
  const lines = Object.entries(vat ? vat.breakdown : {}).map(([rate, group]) => [
    `Thuế suất ${/^\d+$/.test(rate) ? `${rate}%` : rate}: tiền hàng ${formatDynamicMoney(group.base)} — thuế ${formatDynamicMoney(group.tax)}`, ""
  ]);
  const reduced = date && typeof getTaxRule === "function" ? getTaxRule("vat.reduced8.window", date) : null;
  if (reduced && vat && vat.breakdown["10"]) {
    lines.push([`Đang trong thời gian giảm thuế GTGT 10% → 8% đến ${formatDateDisplay(reduced.value.to)} (NĐ 174/2025): kiểm tra các dòng 10%`, "warning"]);
  }
  if (config.cashThresholdWarning) {
    const warning = getCashPaymentVatWarning(document.getElementById(fields.payment)?.value, total, date);
    if (warning) lines.push([warning, "danger"]);
  }
  note.replaceChildren(...lines.map(([text, tone]) => {
    const line = document.createElement("div");
    line.textContent = text;
    if (tone) line.style.color = `var(--color-${tone})`;
    return line;
  }));
}

function refreshDynamicProductPrices(tbodyId, options = {}) {
  const config = getDynamicFormTableConfig(tbodyId);
  const tbody = document.getElementById(tbodyId);
  if (!config || !tbody || typeof config.onProductInput !== "function") return 0;
  let count = 0;
  tbody.querySelectorAll(".item-productId").forEach(input => {
    if (!input.value.trim()) return;
    config.onProductInput(input, options);
    count++;
  });
  refreshDynamicFormTable(tbodyId);
  return count;
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
  if (config) {
    if (typeof config.recalculate === "function") config.recalculate(tbodyId);
    else recalculateDynamicFormTable(tbodyId);
  }
  updateDynamicItemsRowCount(tbodyId);
  if (config && config.formId) {
    document.dispatchEvent(new CustomEvent("dynamic-form-table-change", {
      detail: { formId: config.formId, tbodyId }
    }));
  }
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
  addDynamicFormTableRow(tbodyId, config.defaults || {}, afterRow);
}

function initDynamicItemsTables() {
  getDynamicFormTableConfigs().forEach(config => {
    const errors = validateDynamicFormTableConfig(config);
    if (errors.length > 0) console.error(`[VoucherTable:${config.key}]`, errors.join("; "));
    renderDynamicFormTableHeader(config.tbodyId);
  });
  document.querySelectorAll(".dynamic-items-table tbody[id]").forEach(tbody => {
    ensureDynamicItemsRowCountElement(tbody);
    updateDynamicItemsRowCount(tbody.id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  VOUCHER_ENTRY_MODAL_IDS.forEach(ensureVoucherModalChrome);
  patchVoucherModalLifecycle();
  initDynamicItemsTables();
  initVoucherInvoicePartnerTaxCode();
  // Đổi ngày / hình thức thanh toán thì cập nhật lại tổng thuế và cảnh báo.
  document.addEventListener("change", event => {
    const config = getDynamicFormTableConfigs().find(c => c.fieldIds && [c.fieldIds.date, c.fieldIds.payment].includes(event.target.id));
    if (config) refreshDynamicFormTable(config.tbodyId);
  });
});

window.isVoucherEntryModalId = isVoucherEntryModalId;
window.registerDynamicFormTable = registerDynamicFormTable;
window.shouldAutoFillDynamicProductPrice = shouldAutoFillDynamicProductPrice;
window.createStandardDynamicFormTableConfig = createStandardDynamicFormTableConfig;
window.getDynamicFormTableConfig = getDynamicFormTableConfig;
window.getDynamicFormTableConfigs = getDynamicFormTableConfigs;
window.getDynamicFormTableConfigByFormId = getDynamicFormTableConfigByFormId;
window.getVisibleDynamicFormTableConfig = getVisibleDynamicFormTableConfig;
window.validateDynamicFormTableConfig = validateDynamicFormTableConfig;
window.renderDynamicFormTableHeader = renderDynamicFormTableHeader;
window.addDynamicFormTableRow = addDynamicFormTableRow;
window.replaceDynamicFormTableRows = replaceDynamicFormTableRows;
window.resetDynamicVoucherForm = resetDynamicVoucherForm;
window.serializeDynamicFormTable = serializeDynamicFormTable;
window.recalculateDynamicFormTable = recalculateDynamicFormTable;
window.refreshDynamicProductPrices = refreshDynamicProductPrices;
window.normalizeDynamicDiscountValue = normalizeDynamicDiscountValue;
window.parseDynamicQuantity = parseDynamicQuantity;
window.parseDynamicMoney = parseDynamicMoney;
window.parseDynamicDiscount = parseDynamicDiscount;
window.validateDynamicVoucherLine = validateDynamicVoucherLine;
window.readDynamicVatRate = readDynamicVatRate;
window.getCashPaymentVatWarning = getCashPaymentVatWarning;
window.voucherInvoiceFieldIds = voucherInvoiceFieldIds;
window.isValidInvoiceSymbol = isValidInvoiceSymbol;
window.defaultSalesInvoiceSymbol = defaultSalesInvoiceSymbol;
window.validateVoucherInvoice = validateVoucherInvoice;
window.buildInvoiceAdjustmentNote = buildInvoiceAdjustmentNote;
window.readVoucherInvoiceFields = readVoucherInvoiceFields;
window.fillVoucherInvoiceFields = fillVoucherInvoiceFields;
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
