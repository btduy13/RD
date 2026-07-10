// Draft persistence for every registry-backed voucher item table.

(function () {
  const draftSaveTimeouts = Object.create(null);
  const suppressNextImmediateSave = new Set();

  function getConfig(formId) {
    return typeof getDynamicFormTableConfigByFormId === "function"
      ? getDynamicFormTableConfigByFormId(formId)
      : null;
  }

  function getDraftStorageKey(formId) {
    return `rd_draft_${formId}`;
  }

  function debounceSaveDraft(formId) {
    if (!getConfig(formId)) return;
    if (draftSaveTimeouts[formId]) clearTimeout(draftSaveTimeouts[formId]);
    draftSaveTimeouts[formId] = setTimeout(() => {
      delete draftSaveTimeouts[formId];
      saveFormDraftDirect(formId);
    }, 1000);
  }

  function collectDraftFields(config) {
    const fields = {};
    Object.entries(config.fieldIds || {}).forEach(([key, elementId]) => {
      const element = document.getElementById(elementId);
      fields[key] = element && "value" in element ? element.value : "";
    });
    return fields;
  }

  function hasMeaningfulDraftContent(config, fields, items, editingId) {
    if (editingId) return true;

    const triggerKeys = config.draftTriggerFields
      || (config.fieldIds?.partner ? ["partner"] : ["filename"]);
    if (triggerKeys.some(key => String(fields[key] || "").trim() !== "")) return true;

    const defaults = config.defaults || {};
    return items.some(item => {
      if (String(item.productId || "").trim()) return true;
      if (String(item.desc || "").trim()) return true;
      if (parseFloat(String(item.qty || "").replace(",", ".")) !== Number(defaults.qty || 1)) return true;
      if (Number(String(item.price || "").replace(/\D/g, "")) > 0) return true;
      return parseFloat(String(item.discount || "0").replace(",", ".")) > 0;
    });
  }

  function saveFormDraftDirect(formId) {
    const config = getConfig(formId);
    if (!config || !document.getElementById(formId)) return;

    const fields = collectDraftFields(config);
    const items = serializeDynamicFormTable(config.tbodyId);
    const editingId = typeof config.getEditingId === "function" ? config.getEditingId() : null;
    const storageKey = getDraftStorageKey(formId);

    if (!hasMeaningfulDraftContent(config, fields, items, editingId)) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify({
      formId,
      timestamp: Date.now(),
      fields,
      items,
      editingId: editingId || null
    }));
  }

  function saveFormDraftImmediately(formId) {
    if (draftSaveTimeouts[formId]) {
      clearTimeout(draftSaveTimeouts[formId]);
      delete draftSaveTimeouts[formId];
    }
    if (suppressNextImmediateSave.has(formId)) {
      suppressNextImmediateSave.delete(formId);
      localStorage.removeItem(getDraftStorageKey(formId));
      return;
    }
    saveFormDraftDirect(formId);
  }

  function restoreFormDraft(formId) {
    const config = getConfig(formId);
    const raw = localStorage.getItem(getDraftStorageKey(formId));
    if (!config || !raw) return false;

    try {
      const draft = JSON.parse(raw);
      Object.entries(config.fieldIds || {}).forEach(([key, elementId]) => {
        const element = document.getElementById(elementId);
        if (!element || !("value" in element)) return;
        const fallback = config.fieldDefaults && Object.prototype.hasOwnProperty.call(config.fieldDefaults, key)
          ? config.fieldDefaults[key]
          : "";
        element.value = draft.fields?.[key] ?? fallback;
      });

      if (typeof config.setEditingId === "function") config.setEditingId(draft.editingId || null);
      replaceDynamicFormTableRows(config.tbodyId, draft.items || []);
      if (typeof updateVoucherModeBadge === "function" && config.modalId) {
        updateVoucherModeBadge(config.modalId, !!draft.editingId);
      }
      if (typeof showToast === "function") {
        showToast("Đã khôi phục thành công phiếu nháp từ phiên làm việc trước!", "success");
      }
      return true;
    } catch (err) {
      console.error("[Autosave] Lỗi khôi phục phiếu nháp:", err);
      return false;
    }
  }

  function checkAndRestoreDraft(modalId) {
    const config = typeof getDynamicFormTableConfigs === "function"
      ? getDynamicFormTableConfigs().find(item => item.modalId === modalId)
      : null;
    if (!config) return;

    const storageKey = getDraftStorageKey(config.formId);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      if (!draft.items?.length && !draft.editingId && !Object.values(draft.fields || {}).some(Boolean)) return;
      setTimeout(() => {
        if (confirm("Phần mềm phát hiện một phiếu nháp chưa lưu từ phiên làm việc trước. Bạn có muốn khôi phục lại không?")) {
          restoreFormDraft(config.formId);
        } else {
          localStorage.removeItem(storageKey);
          // Ngăn saveFormDraftImmediately lưu lại draft khi đóng form
          suppressNextImmediateSave.add(config.formId);
        }
      }, 150);
    } catch (err) {
      console.error("[Autosave] Lỗi đọc phiếu nháp:", err);
      localStorage.removeItem(storageKey);
    }
  }

  function clearActiveFormDraft(formId) {
    let config = formId ? getConfig(formId) : null;
    if (!config && typeof getVisibleDynamicFormTableConfig === "function") {
      config = getVisibleDynamicFormTableConfig();
    }
    if (!config?.formId) return;

    suppressNextImmediateSave.add(config.formId);
    localStorage.removeItem(getDraftStorageKey(config.formId));
  }

  function handleTrackedFormChange(event) {
    const form = event.target?.closest?.("form");
    if (form && getConfig(form.id)) debounceSaveDraft(form.id);
  }

  document.addEventListener("input", handleTrackedFormChange);
  document.addEventListener("change", handleTrackedFormChange);
  document.addEventListener("dynamic-form-table-change", event => {
    if (event.detail?.formId) debounceSaveDraft(event.detail.formId);
  });

  window.checkAndRestoreDraft = checkAndRestoreDraft;
  window.clearActiveFormDraft = clearActiveFormDraft;
  window.restoreFormDraft = restoreFormDraft;
  window.saveFormDraftImmediately = saveFormDraftImmediately;
  window.saveFormDraftDirect = saveFormDraftDirect;
})();
