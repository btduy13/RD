'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const appDir = path.join(__dirname, '..');
const printSettingsSource = fs.readFileSync(path.join(appDir, 'js', 'core', 'print-settings.js'), 'utf8');
const userPrefsSource = fs.readFileSync(path.join(appDir, 'js', 'core', 'user-preferences.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(appDir, 'js', 'core', 'voucher-template-editor.js'), 'utf8');
const productionHtml = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('href="styles.css"', 'href="../styles.css"');

app.disableHardwareAcceleration();

async function main() {
  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: false, sandbox: false }
  });
  await win.loadFile(path.join(__dirname, 'voucher-template-editor-fixture.html'));

  const result = await win.webContents.executeJavaScript(`(async () => {
    window.getWebStorage = () => localStorage;
    window.openModal = id => { const modal = document.getElementById(id); if (modal) modal.style.display = 'flex'; };
    window.closeModal = id => { const modal = document.getElementById(id); if (modal) modal.style.display = 'none'; };
    window.resetVoucherPreviewPage = () => {};
    window.fitVoucherPreviewModal = () => {};
    window.updateVoucherPreviewPagination = () => {};
    window.applyVoucherPreviewZoom = () => {};
    ${printSettingsSource}
    ${userPrefsSource}
    ${editorSource}

    populateVoucherTemplateEditor({
      fontFamily: 'Arial', contentFontSize: 15, tableFontSize: 12, titleFontSize: 20,
      lineHeight: 1.2, textAlign: 'left', marginTopMm: 3, marginRightMm: 4,
      marginBottomMm: 3, marginLeftMm: 6, showLogo: true, showQr: false, showSignatures: false
    });
    saveVoucherTemplateEditor();

    const voucher = document.querySelector('.printable-voucher');
    const title = document.querySelector('.voucher-document-title');
    const cell = document.querySelector('td');
    const qr = document.querySelector('.voucher-rd-header-qr');
    const signatures = document.querySelector('.voucher-signatures');
    const bodyCopy = document.querySelector('.voucher-body-copy');
    const voucherStyle = getComputedStyle(voucher);

    toggleVoucherContentEditing(true);
    title.textContent = 'TIÊU ĐỀ ĐÃ SỬA';
    document.getElementById('voucher-template-extra-text').value = 'Thông tin bổ sung';
    document.getElementById('voucher-template-extra-placement').value = 'beforeTable';
    addVoucherPreviewExtraContent();

    const clone = voucher.cloneNode(true);
    prepareVoucherRootForPrint(clone);
    const saved = JSON.parse(localStorage.getItem('rd_user_prefs')).printTemplate;
    return {
      fontFamily: voucherStyle.fontFamily,
      fontSize: voucherStyle.fontSize,
      lineHeight: voucherStyle.lineHeight,
      paddingTop: parseFloat(voucherStyle.paddingTop),
      paddingRight: parseFloat(voucherStyle.paddingRight),
      paddingLeft: parseFloat(voucherStyle.paddingLeft),
      titleFontSize: getComputedStyle(title).fontSize,
      tableFontSize: getComputedStyle(cell).fontSize,
      bodyCopyFontSize: getComputedStyle(bodyCopy).fontSize,
      qrDisplay: getComputedStyle(qr).display,
      signaturesDisplay: getComputedStyle(signatures).display,
      editable: voucher.getAttribute('contenteditable'),
      extraBeforeTable: voucher.querySelector('[data-voucher-extra-content]')?.nextElementSibling?.tagName,
      printHasEditedTitle: clone.textContent.includes('TIÊU ĐỀ ĐÃ SỬA'),
      printHasExtraText: clone.textContent.includes('Thông tin bổ sung'),
      printHasEditorControl: !!clone.querySelector('.voucher-template-editor-only'),
      printIsEditable: clone.hasAttribute('contenteditable'),
      saved
    };
  })()`);

  assert(result.fontFamily.includes('Arial'));
  assert.equal(result.fontSize, '15px');
  assert.equal(result.titleFontSize, '20px');
  assert.equal(result.tableFontSize, '12px');
  assert(Math.abs(parseFloat(result.bodyCopyFontSize) - (10 * 15 / 13)) < 0.1);
  assert(Math.abs(result.paddingTop - 11.34) < 0.5, `unexpected 3mm top padding: ${result.paddingTop}`);
  assert(Math.abs(result.paddingRight - 15.12) < 0.5, `unexpected 4mm right padding: ${result.paddingRight}`);
  assert(Math.abs(result.paddingLeft - 22.68) < 0.5, `unexpected 6mm left padding: ${result.paddingLeft}`);
  assert.equal(result.qrDisplay, 'none');
  assert.equal(result.signaturesDisplay, 'none');
  assert.equal(result.editable, 'true');
  assert.equal(result.extraBeforeTable, 'TABLE');
  assert.equal(result.printHasEditedTitle, true);
  assert.equal(result.printHasExtraText, true);
  assert.equal(result.printHasEditorControl, false);
  assert.equal(result.printIsEditable, false);
  assert.equal(result.saved.fontFamily, 'Arial');
  assert.equal(result.saved.marginLeftMm, 6);

  await win.loadFile(path.join(__dirname, 'voucher-template-editor-fixture.html'));
  await win.webContents.executeJavaScript(`document.open(); document.write(${JSON.stringify(productionHtml)}); document.close();`);
  const productionMetrics = await win.webContents.executeJavaScript(`(async () => {
    window.getWebStorage = () => localStorage;
    window.openModal = id => { const modal = document.getElementById(id); if (modal) modal.style.display = 'flex'; };
    window.closeModal = id => { const modal = document.getElementById(id); if (modal) modal.style.display = 'none'; };
    window.resetVoucherPreviewPage = () => {};
    window.fitVoucherPreviewModal = () => {};
    window.updateVoucherPreviewPagination = () => {};
    window.applyVoucherPreviewZoom = () => {};
    ${printSettingsSource}
    ${userPrefsSource}
    ${editorSource}
    document.getElementById('voucher-print-area').innerHTML = '<div class="printable-voucher"><div class="voucher-document-title">PHIẾU KIỂM THỬ</div><table><tr><td>Nội dung</td></tr></table></div>';
    document.getElementById('modal-view-voucher').style.display = 'flex';
    openVoucherTemplateEditor();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dialog = document.querySelector('.voucher-template-editor-dialog');
    const body = document.querySelector('.voucher-template-editor-body');
    const footer = document.querySelector('.voucher-template-editor-footer');
    const dialogRect = dialog.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const controls = Array.from(dialog.querySelectorAll('input, select, textarea, button'));
    return {
      sections: dialog.querySelectorAll('.voucher-template-section').length,
      dialogLeft: dialogRect.left,
      dialogRight: dialogRect.right,
      dialogTop: dialogRect.top,
      dialogBottom: dialogRect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      bodyBottom: bodyRect.bottom,
      footerTop: footerRect.top,
      controlsOutside: controls.filter(control => {
        const rect = control.getBoundingClientRect();
        return rect.left < dialogRect.left - 1 || rect.right > dialogRect.right + 1;
      }).length
    };
  })()`);
  assert.equal(productionMetrics.sections, 4);
  assert(productionMetrics.dialogLeft >= 0 && productionMetrics.dialogRight <= productionMetrics.viewportWidth + 1);
  assert(productionMetrics.dialogTop >= 0 && productionMetrics.dialogBottom <= productionMetrics.viewportHeight + 1);
  assert(productionMetrics.footerTop >= productionMetrics.bodyBottom - 1);
  assert.equal(productionMetrics.controlsOutside, 0);

  await win.close();
  app.quit();
}

main().catch(err => {
  console.error(err);
  app.exit(1);
});
