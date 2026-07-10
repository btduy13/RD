// Print-template customization and per-preview content editing.

(function (root) {
  let voucherContentEditing = false;
  let editorOriginalSettings = null;

  function normalizeSettings(value) {
    if (root.PrintSettings?.normalizePrintTemplateSettings) {
      return root.PrintSettings.normalizePrintTemplateSettings(value);
    }
    return { ...(root.DEFAULT_USER_PREFS?.printTemplate || {}), ...(value || {}) };
  }

  function getDefaultSettings() {
    return normalizeSettings(root.PrintSettings?.DEFAULT_PRINT_TEMPLATE_SETTINGS || root.DEFAULT_USER_PREFS?.printTemplate || {});
  }

  function getPrintTemplateSettings() {
    const prefs = typeof root.getUserPrefs === "function" ? root.getUserPrefs() : {};
    return normalizeSettings(prefs.printTemplate);
  }

  function getVoucherPreviewRoot() {
    return document.querySelector("#voucher-print-area .printable-voucher");
  }

  function applyVoucherTemplateSettingsToRoot(voucherRoot, settingsValue) {
    if (!voucherRoot) return null;
    const settings = normalizeSettings(settingsValue || getPrintTemplateSettings());
    voucherRoot._voucherTemplateSettings = settings;
    const fontStack = settings.fontFamily === "Times New Roman"
      ? '"Times New Roman", Times, serif'
      : `"${settings.fontFamily}", Arial, sans-serif`;
    const contentElements = Array.from(voucherRoot.querySelectorAll("*")).filter(element => {
      if (element.closest("table, .voucher-rd-header, .voucher-header-top, .voucher-title, .voucher-document-title, .voucher-template-editor-only")) return false;
      return Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    });
    contentElements.forEach(element => {
      if (element.dataset.voucherTemplateBaseFontPx) return;
      const computedSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
      if (Number.isFinite(computedSize) && computedSize > 0) {
        element.dataset.voucherTemplateBaseFontPx = String(computedSize);
      }
    });

    voucherRoot.classList.add("voucher-template-customized");
    voucherRoot.classList.toggle("voucher-template-hide-logo", !settings.showLogo);
    voucherRoot.classList.toggle("voucher-template-hide-qr", !settings.showQr);
    voucherRoot.classList.toggle("voucher-template-hide-signatures", !settings.showSignatures);
    voucherRoot.style.setProperty("--voucher-template-font-family", fontStack);
    voucherRoot.style.setProperty("--voucher-template-content-font-size", `${settings.contentFontSize}px`);
    voucherRoot.style.setProperty("--voucher-template-table-font-size", `${settings.tableFontSize}px`);
    voucherRoot.style.setProperty("--voucher-template-title-font-size", `${settings.titleFontSize}px`);
    voucherRoot.style.setProperty("--voucher-template-line-height", String(settings.lineHeight));
    voucherRoot.style.setProperty("--voucher-template-text-align", settings.textAlign);
    voucherRoot.style.setProperty("--voucher-template-margin-top", `${settings.marginTopMm}mm`);
    voucherRoot.style.setProperty("--voucher-template-margin-right", `${settings.marginRightMm}mm`);
    voucherRoot.style.setProperty("--voucher-template-margin-bottom", `${settings.marginBottomMm}mm`);
    voucherRoot.style.setProperty("--voucher-template-margin-left", `${settings.marginLeftMm}mm`);
    voucherRoot.style.fontFamily = fontStack;
    voucherRoot.style.fontSize = `${settings.contentFontSize}px`;
    voucherRoot.style.lineHeight = String(settings.lineHeight);
    voucherRoot.style.textAlign = settings.textAlign;
    // Per-page margins are applied via @page (print) and preview zoom-wrap padding — not root padding.
    voucherRoot.style.padding = "0";
    voucherRoot.style.boxSizing = "border-box";

    const contentScale = settings.contentFontSize / 13;
    contentElements.forEach(element => {
      const baseSize = Number.parseFloat(element.dataset.voucherTemplateBaseFontPx);
      if (Number.isFinite(baseSize) && baseSize > 0) {
        element.style.setProperty("font-size", `${baseSize * contentScale}px`, "important");
        element.style.setProperty("line-height", String(settings.lineHeight), "important");
      }
    });
    return settings;
  }

  function setControlValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = String(value);
  }

  function populateVoucherTemplateEditor(settingsValue) {
    const settings = normalizeSettings(settingsValue);
    setControlValue("voucher-template-font-family", settings.fontFamily);
    setControlValue("voucher-template-content-font-size", settings.contentFontSize);
    setControlValue("voucher-template-table-font-size", settings.tableFontSize);
    setControlValue("voucher-template-title-font-size", settings.titleFontSize);
    setControlValue("voucher-template-line-height", settings.lineHeight);
    setControlValue("voucher-template-margin-top", settings.marginTopMm);
    setControlValue("voucher-template-margin-right", settings.marginRightMm);
    setControlValue("voucher-template-margin-bottom", settings.marginBottomMm);
    setControlValue("voucher-template-margin-left", settings.marginLeftMm);
    document.querySelectorAll('input[name="voucher-template-align"]').forEach(input => {
      input.checked = input.value === settings.textAlign;
    });
    const logo = document.getElementById("voucher-template-show-logo");
    const qr = document.getElementById("voucher-template-show-qr");
    const signatures = document.getElementById("voucher-template-show-signatures");
    if (logo) logo.checked = settings.showLogo;
    if (qr) qr.checked = settings.showQr;
    if (signatures) signatures.checked = settings.showSignatures;
  }

  function readVoucherTemplateEditor() {
    const checkedAlign = document.querySelector('input[name="voucher-template-align"]:checked');
    return normalizeSettings({
      fontFamily: document.getElementById("voucher-template-font-family")?.value,
      contentFontSize: document.getElementById("voucher-template-content-font-size")?.value,
      tableFontSize: document.getElementById("voucher-template-table-font-size")?.value,
      titleFontSize: document.getElementById("voucher-template-title-font-size")?.value,
      lineHeight: document.getElementById("voucher-template-line-height")?.value,
      textAlign: checkedAlign?.value,
      marginTopMm: document.getElementById("voucher-template-margin-top")?.value,
      marginRightMm: document.getElementById("voucher-template-margin-right")?.value,
      marginBottomMm: document.getElementById("voucher-template-margin-bottom")?.value,
      marginLeftMm: document.getElementById("voucher-template-margin-left")?.value,
      showLogo: !!document.getElementById("voucher-template-show-logo")?.checked,
      showQr: !!document.getElementById("voucher-template-show-qr")?.checked,
      showSignatures: !!document.getElementById("voucher-template-show-signatures")?.checked
    });
  }

  function refreshVoucherPreviewLayout() {
    requestAnimationFrame(() => {
      if (typeof root.resetVoucherPreviewPage === "function") root.resetVoucherPreviewPage();
      if (typeof root.fitVoucherPreviewModal === "function") root.fitVoucherPreviewModal();
      if (typeof root.updateVoucherPreviewPagination === "function") root.updateVoucherPreviewPagination();
      if (typeof root.applyVoucherPreviewZoom === "function") root.applyVoucherPreviewZoom();
    });
  }

  function openVoucherTemplateEditor(focusSection) {
    editorOriginalSettings = getPrintTemplateSettings();
    populateVoucherTemplateEditor(editorOriginalSettings);
    if (typeof root.openModal === "function") root.openModal("modal-voucher-template-editor");
    if (focusSection === "extra") {
      setTimeout(() => document.getElementById("voucher-template-extra-text")?.focus(), 50);
    }
  }

  function saveVoucherTemplateEditor() {
    const settings = readVoucherTemplateEditor();
    if (typeof root.saveUserPrefs === "function") root.saveUserPrefs({ printTemplate: settings });
    applyVoucherTemplateSettingsToRoot(getVoucherPreviewRoot(), settings);
    editorOriginalSettings = settings;
    if (typeof root.closeModal === "function") root.closeModal("modal-voucher-template-editor");
    refreshVoucherPreviewLayout();
  }

  function cancelVoucherTemplateEditor() {
    if (editorOriginalSettings) applyVoucherTemplateSettingsToRoot(getVoucherPreviewRoot(), editorOriginalSettings);
    if (typeof root.closeModal === "function") root.closeModal("modal-voucher-template-editor");
    refreshVoucherPreviewLayout();
  }

  function resetVoucherTemplateEditor() {
    populateVoucherTemplateEditor(getDefaultSettings());
  }

  function updateContentEditingButton() {
    const button = document.getElementById("voucher-preview-edit-content");
    if (!button) return;
    button.classList.toggle("is-active", voucherContentEditing);
    button.textContent = voucherContentEditing ? "✏ Đang sửa..." : "✏ Sửa trực tiếp";
    button.setAttribute("aria-pressed", voucherContentEditing ? "true" : "false");
  }

  function setVoucherContentEditing(enabled) {
    const voucherRoot = getVoucherPreviewRoot();
    voucherContentEditing = !!enabled && !!voucherRoot;
    if (voucherRoot) {
      voucherRoot.classList.toggle("is-content-editing", voucherContentEditing);
      if (voucherContentEditing) {
        voucherRoot.setAttribute("contenteditable", "true");
        voucherRoot.setAttribute("spellcheck", "false");
        voucherRoot.querySelectorAll("img, .voucher-template-editor-only").forEach(element => {
          element.setAttribute("contenteditable", "false");
        });
        voucherRoot.focus({ preventScroll: true });
      } else {
        voucherRoot.removeAttribute("contenteditable");
        voucherRoot.removeAttribute("spellcheck");
      }
    }
    updateContentEditingButton();
    return voucherContentEditing;
  }

  function toggleVoucherContentEditing(force) {
    return setVoucherContentEditing(typeof force === "boolean" ? force : !voucherContentEditing);
  }

  function resetVoucherContentEditingState() {
    voucherContentEditing = false;
    const voucherRoot = getVoucherPreviewRoot();
    if (voucherRoot) {
      voucherRoot.classList.remove("is-content-editing");
      voucherRoot.removeAttribute("contenteditable");
      voucherRoot.removeAttribute("spellcheck");
    }
    updateContentEditingButton();
  }

  function removeVoucherPreviewExtraContent(button) {
    button?.closest?.("[data-voucher-extra-content]")?.remove();
    refreshVoucherPreviewLayout();
  }

  function addVoucherPreviewExtraContent() {
    const voucherRoot = getVoucherPreviewRoot();
    const textInput = document.getElementById("voucher-template-extra-text");
    const placementInput = document.getElementById("voucher-template-extra-placement");
    const text = textInput?.value?.trim();
    if (!voucherRoot || !text) return;

    const block = document.createElement("div");
    block.className = "voucher-extra-content";
    block.dataset.voucherExtraContent = "true";

    const content = document.createElement("div");
    content.className = "voucher-extra-content-text";
    content.textContent = text;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "voucher-template-editor-only voucher-extra-content-remove";
    removeButton.textContent = "×";
    removeButton.title = "Xóa nội dung";
    removeButton.setAttribute("aria-label", "Xóa nội dung");
    removeButton.setAttribute("contenteditable", "false");
    removeButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      removeVoucherPreviewExtraContent(removeButton);
    });
    block.append(content, removeButton);

    const firstTable = voucherRoot.querySelector("table");
    const header = voucherRoot.querySelector(".voucher-rd-header, .voucher-header-top");
    const placement = placementInput?.value || "end";
    if (placement === "afterHeader" && header) header.insertAdjacentElement("afterend", block);
    else if (placement === "beforeTable" && firstTable) firstTable.insertAdjacentElement("beforebegin", block);
    else if (placement === "afterTable" && firstTable) firstTable.insertAdjacentElement("afterend", block);
    else voucherRoot.appendChild(block);

    if (textInput) textInput.value = "";
    setVoucherContentEditing(true);
    refreshVoucherPreviewLayout();
  }

  function prepareVoucherRootForPrint(voucherRoot) {
    if (!voucherRoot) return;
    voucherRoot.classList.remove("is-content-editing");
    voucherRoot.removeAttribute("contenteditable");
    voucherRoot.removeAttribute("spellcheck");
    voucherRoot.querySelectorAll("[contenteditable]").forEach(element => element.removeAttribute("contenteditable"));
    voucherRoot.querySelectorAll(".voucher-template-editor-only").forEach(element => element.remove());
  }

  // ---- INLINE EDITOR (VIE) ----

  let vieOpen = false;

  function getVieValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : undefined;
  }

  function setVieValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
  }

  function populateVoucherInlineEditor(settingsValue) {
    const settings = normalizeSettings(settingsValue);
    setVieValue("vie-font-family", settings.fontFamily);
    setVieValue("vie-content-font-size", settings.contentFontSize);
    setVieValue("vie-table-font-size", settings.tableFontSize);
    setVieValue("vie-title-font-size", settings.titleFontSize);
    setVieValue("vie-line-height", settings.lineHeight);
    setVieValue("vie-margin-top", settings.marginTopMm);
    setVieValue("vie-margin-right", settings.marginRightMm);
    setVieValue("vie-margin-bottom", settings.marginBottomMm);
    setVieValue("vie-margin-left", settings.marginLeftMm);
    document.querySelectorAll('input[name="vie-align"]').forEach(input => {
      input.checked = input.value === settings.textAlign;
    });
    const logo = document.getElementById("vie-show-logo");
    const qr = document.getElementById("vie-show-qr");
    const sigs = document.getElementById("vie-show-sigs");
    if (logo) logo.checked = settings.showLogo;
    if (qr) qr.checked = settings.showQr;
    if (sigs) sigs.checked = settings.showSignatures;
  }

  function readVoucherInlineEditor() {
    const checkedAlign = document.querySelector('input[name="vie-align"]:checked');
    return normalizeSettings({
      fontFamily: getVieValue("vie-font-family"),
      contentFontSize: getVieValue("vie-content-font-size"),
      tableFontSize: getVieValue("vie-table-font-size"),
      titleFontSize: getVieValue("vie-title-font-size"),
      lineHeight: getVieValue("vie-line-height"),
      textAlign: checkedAlign?.value,
      marginTopMm: getVieValue("vie-margin-top"),
      marginRightMm: getVieValue("vie-margin-right"),
      marginBottomMm: getVieValue("vie-margin-bottom"),
      marginLeftMm: getVieValue("vie-margin-left"),
      showLogo: !!document.getElementById("vie-show-logo")?.checked,
      showQr: !!document.getElementById("vie-show-qr")?.checked,
      showSignatures: !!document.getElementById("vie-show-sigs")?.checked
    });
  }

  function applyVoucherInlineEditorLive() {
    const settings = readVoucherInlineEditor();
    applyVoucherTemplateSettingsToRoot(getVoucherPreviewRoot(), settings);
    refreshVoucherPreviewLayout();
  }

  function saveVoucherInlineEditor() {
    const settings = readVoucherInlineEditor();
    if (typeof root.saveUserPrefs === "function") root.saveUserPrefs({ printTemplate: settings });
    applyVoucherTemplateSettingsToRoot(getVoucherPreviewRoot(), settings);
    refreshVoucherPreviewLayout();
    // Brief visual feedback on the Save button
    const btn = document.querySelector(".vie-btn-save");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✓ Đã lưu";
      setTimeout(() => { btn.textContent = orig; }, 1200);
    }
  }

  function resetVoucherInlineEditor() {
    const defaults = getDefaultSettings();
    populateVoucherInlineEditor(defaults);
    applyVoucherTemplateSettingsToRoot(getVoucherPreviewRoot(), defaults);
    refreshVoucherPreviewLayout();
  }

  function toggleVoucherInlineEditor(force) {
    const panel = document.getElementById("voucher-inline-editor");
    const toggleBtn = document.getElementById("voucher-preview-edit-toggle");
    if (!panel) return;

    vieOpen = typeof force === "boolean" ? force : !vieOpen;

    if (vieOpen) {
      populateVoucherInlineEditor(getPrintTemplateSettings());
      panel.style.display = "";
      setVoucherContentEditing(true);
    } else {
      panel.style.display = "none";
      setVoucherContentEditing(false);
    }

    if (toggleBtn) {
      toggleBtn.classList.toggle("is-active", vieOpen);
    }

    refreshVoucherPreviewLayout();
  }

  // Close inline panel when voucher preview modal is closed
  function resetVoucherInlineEditorState() {
    vieOpen = false;
    const panel = document.getElementById("voucher-inline-editor");
    if (panel) panel.style.display = "none";
    const toggleBtn = document.getElementById("voucher-preview-edit-toggle");
    if (toggleBtn) toggleBtn.classList.remove("is-active");
    setVoucherContentEditing(false);
  }

  root.getPrintTemplateSettings = getPrintTemplateSettings;
  root.applyVoucherTemplateSettingsToRoot = applyVoucherTemplateSettingsToRoot;
  root.populateVoucherTemplateEditor = populateVoucherTemplateEditor;
  root.readVoucherTemplateEditor = readVoucherTemplateEditor;
  root.openVoucherTemplateEditor = openVoucherTemplateEditor;
  root.saveVoucherTemplateEditor = saveVoucherTemplateEditor;
  root.cancelVoucherTemplateEditor = cancelVoucherTemplateEditor;
  root.resetVoucherTemplateEditor = resetVoucherTemplateEditor;
  root.toggleVoucherContentEditing = toggleVoucherContentEditing;
  root.resetVoucherContentEditingState = resetVoucherContentEditingState;
  root.addVoucherPreviewExtraContent = addVoucherPreviewExtraContent;
  root.removeVoucherPreviewExtraContent = removeVoucherPreviewExtraContent;
  root.prepareVoucherRootForPrint = prepareVoucherRootForPrint;
  root.toggleVoucherInlineEditor = toggleVoucherInlineEditor;
  root.applyVoucherInlineEditorLive = applyVoucherInlineEditorLive;
  root.saveVoucherInlineEditor = saveVoucherInlineEditor;
  root.resetVoucherInlineEditor = resetVoucherInlineEditor;
  root.resetVoucherInlineEditorState = resetVoucherInlineEditorState;
})(typeof window !== "undefined" ? window : globalThis);
