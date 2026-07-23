'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, session } = require('electron');

const appDir = path.join(__dirname, '..');
const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-app-shell-smoke-'));

app.disableHardwareAcceleration();
app.setPath('userData', tempUserData);

async function main() {
  await app.whenReady();
  console.log('[app-shell-smoke] electron ready');

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: true,
      preload: path.join(__dirname, 'app-shell-smoke-preload.js')
    }
  });
  console.log('[app-shell-smoke] audit hooks installed');

  const consoleErrors = [];
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 3 && !/ERR_FAILED|Failed to load resource/.test(message)) {
      consoleErrors.push(`${message} (${sourceId}:${line})`);
    }
  });

  await win.loadFile(path.join(appDir, 'index.html'));
  console.log('[app-shell-smoke] index loaded');
  await win.webContents.executeJavaScript(`new Promise(resolve => {
    const done = () => setTimeout(resolve, 800);
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done, { once: true });
  })`);
  console.log('[app-shell-smoke] startup settled');

  const result = await win.webContents.executeJavaScript(`(async () => {
    const duplicateIds = Array.from(document.querySelectorAll('[id]'))
      .map(node => node.id)
      .filter((id, index, all) => all.indexOf(id) !== index);

    const missingLabelTargets = Array.from(document.querySelectorAll('label[for]'))
      .map(label => label.getAttribute('for'))
      .filter(id => id && !document.getElementById(id));

    const missingFormTargets = Array.from(document.querySelectorAll('[form]'))
      .map(control => control.getAttribute('form'))
      .filter(id => id && !document.getElementById(id));

    const navigationErrors = [];
    for (const item of document.querySelectorAll('.menu-item[data-tab]')) {
      try {
        item.click();
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        navigationErrors.push((item.dataset.tab || item.textContent.trim()) + ': ' + error.message);
      }
    }

    const missingSwitchTargets = [];
    document.querySelectorAll('[onclick*="switchTab("]').forEach(element => {
      const match = String(element.getAttribute('onclick') || '').match(/switchTab\(['"]([^'"]+)['"]\)/);
      if (!match) return;
      const tabId = match[1];
      if (!document.getElementById('view-' + tabId) || !document.querySelector('.menu-item[data-tab="' + tabId + '"]')) {
        missingSwitchTargets.push(tabId);
      }
    });

    const previousVouchers = state.vouchers;
    state.vouchers = [
      { id: 'NO-ENTRIES', date: '2026-01-01', description: 'Imported row', entries: null },
      {
        id: '<img src=x onerror=alert(1)>',
        date: '2026-01-02',
        entries: [{ debit: '111', credit: '331', amount: 1, desc: '<img src=x onerror=alert(2)>' }]
      }
    ];
    document.getElementById('select-report-type').value = 'journal';
    generateReport();
    const reportHandlesMissingEntries = document.getElementById('printable-report-area').textContent.includes('NO-ENTRIES') === false;
    const reportEscapesHtml = document.querySelector('#printable-report-area img') === null
      && document.getElementById('printable-report-area').textContent.includes('<img src=x');
    const reportUsesDisplayDate = document.getElementById('printable-report-area').textContent.includes('02/01/2026')
      && !document.getElementById('printable-report-area').textContent.includes('2026-01-02');
    state.vouchers = previousVouchers;

    const previousProducts = state.products;
    state.products = [{ id: 'DISCOUNT-PRODUCT', name: 'Sản phẩm kiểm thử', unit: 'Cái' }];
    const discountVisibilityByType = {};
    const discountVoucherTypes = ['purchase_order', 'purchase', 'purchase_return', 'sales_return', 'sales', 'sales_quotation'];
    for (const type of discountVoucherTypes) {
      const id = 'DISCOUNT-VISIBILITY-' + type;
      const baseVoucher = {
        id,
        type,
        date: '2026-07-15',
        partnerId: '',
        partnerName: 'Đối tác kiểm thử',
        description: 'Kiểm tra hiển thị chiết khấu',
        totalAmount: 2000
      };
      state.vouchers = [{
        ...baseVoucher,
        items: [{ productId: 'DISCOUNT-PRODUCT', qty: 2, price: 1000, discount: 0, amount: 2000 }]
      }];
      viewVoucher(id);
      const hiddenWithoutDiscount = !document.getElementById('voucher-print-area').textContent.includes('Số tiền chiết khấu');

      state.vouchers = [{
        ...baseVoucher,
        totalAmount: 1800,
        items: [{ productId: 'DISCOUNT-PRODUCT', qty: 2, price: 1000, discount: 10, amount: 1800 }]
      }];
      viewVoucher(id);
      const shownWithDiscount = document.getElementById('voucher-print-area').textContent.includes('Số tiền chiết khấu');
      const firstProductRow = document.querySelector('#voucher-print-area table tbody tr');
      const grossLineValue = firstProductRow && firstProductRow.cells[5]
        ? firstProductRow.cells[5].textContent.trim()
        : '';
      const fullDateShown = document.getElementById('voucher-print-area').textContent.includes('15/07/2026');
      discountVisibilityByType[type] = { hiddenWithoutDiscount, shownWithDiscount, grossLineValue, fullDateShown };
    }
    closeModal('modal-view-voucher');
    state.vouchers = previousVouchers;
    state.products = previousProducts;

    openCloudSyncModal();
    const cloudModal = document.getElementById('modal-cloud-sync');
    const cloudBounds = cloudModal.getBoundingClientRect();
    const cloudOpenState = {
      display: cloudModal.style.display,
      ariaHidden: cloudModal.getAttribute('aria-hidden'),
      bodyLocked: document.body.classList.contains('cloud-sync-modal-open'),
      left: Math.round(cloudBounds.left),
      rightGap: Math.round(window.innerWidth - cloudBounds.right)
    };

    openModal('modal-change-password');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const escapeStackState = {
      cloudClosed: cloudModal.style.display === 'none',
      underlyingStillOpen: document.getElementById('modal-change-password').style.display === 'flex'
    };
    closeModal('modal-change-password');

    updateCloudSyncBadge(false, 'Mây: Lỗi kiểm tra', '#ef4444');
    const cloudStatusMirror = {
      text: document.getElementById('cloud-sync-modal-status-text').textContent,
      state: document.getElementById('cloud-sync-modal-status').dataset.state
    };

    cloudWriteGate.setStatus('syncing', 'Background sync test');
    const syncingWriteGate = cloudWriteGate.getStatus();
    const backgroundTask = cloudSyncStartTask('push', 'Background push test');
    const taskWhileRunning = {
      count: document.querySelectorAll('#cloud-sync-task-list .cloud-sync-task').length,
      status: document.querySelector('#cloud-sync-task-list .cloud-sync-task').className
    };
    cloudSyncFinishTask(backgroundTask, true);
    const taskAfterFinish = document.querySelector('#cloud-sync-task-list .cloud-sync-task').className;
    cloudWriteGate.setStatus('ready', 'Ready');

    cloudSyncActive = true;
    supabaseClient = {};
    isStartupPullCompleted = true;
    isPulling = false;
    isPushing = false;
    const syncOrder = [];
    pullAndMergeFromCloud = async () => { syncOrder.push('pull'); return true; };
    pushToCloud = async () => { syncOrder.push('push'); return true; };
    const manualSyncResult = await manualIncrementalSync();

    initializeLastSavedState(state);
    saveStateIsDirty = true;
    const originalPersistStateDelta = persistStateDelta;
    persistStateDelta = async () => ({ ok: true });
    const synchronousSaveResult = await executeSaveState(true, { skipCloudPush: true });
    persistStateDelta = originalPersistStateDelta;

    let forcePullCalls = 0;
    pullAndMergeFromCloud = async () => { forcePullCalls += 1; return true; };
    window.confirm = () => false;
    const cancelledForcePull = await forcePullFromCloud();
    const forcePullCancelState = { result: cancelledForcePull, calls: forcePullCalls };

    const toastEvents = [];
    showToast = (message, type) => toastEvents.push({ message, type });
    document.getElementById('setting-cloud-enabled').checked = true;
    document.getElementById('setting-cloud-supabase-url').value = 'https://example.supabase.co/';
    document.getElementById('setting-cloud-supabase-key').value = 'anon-test-key';
    window.initCloudSync = async () => false;
    const failedConfigSaveResult = await saveCloudConfig({ preventDefault() {} });
    const storedAfterFailedConnect = JSON.parse(localStorage.getItem('rd_accounting_cloud_settings'));
    const cloudConfigSaveState = {
      result: failedConfigSaveResult,
      busy: isCloudConfigSaveInProgress(),
      submitDisabled: document.getElementById('btn-save-cloud-config').disabled,
      normalizedUrl: storedAfterFailedConnect.supabaseUrl,
      toastTypes: toastEvents.map(item => item.type)
    };

    document.getElementById('setting-cloud-enabled').checked = false;
    await saveCloudConfig({ preventDefault() {} });

    closeCloudSyncModal();

    const printerCalls = [];
    window.electronAPI = {
      getPrinters: async () => [
        { name: 'System_Default', displayName: 'Máy in mặc định', isDefault: true },
        { name: 'Office_A5', displayName: 'Máy in văn phòng', isDefault: false }
      ],
      printHtml: async (_html, _fontScale, paperSize, options) => {
        printerCalls.push({ paperSize, options: { ...options } });
        if (printerCalls.length === 1) {
          return { ok: false, code: 'INVALID_PRINTER_SETTINGS', error: 'Thiết lập máy in không hợp lệ' };
        }
        return { ok: true };
      }
    };
    await refreshVoucherPrinters(true);
    const printerSelect = document.getElementById('voucher-printer-select');
    printerSelect.value = 'Office_A5';
    applyVoucherPrinterSelection(printerSelect.value);
    applyVoucherDirectPrint(true);
    applyPrintPaperSize('A5');
    document.getElementById('voucher-print-area').innerHTML = '<div class="printable-voucher"><p>Printer test</p></div>';
    await printCurrentVoucher({ preventDefault() {} });
    const printerPrefs = getUserPrefs();
    const printerUiState = {
      options: Array.from(printerSelect.options).map(option => option.value),
      selected: printerSelect.value,
      directEnabled: document.getElementById('voucher-direct-print-enabled').checked,
      savedDeviceName: printerPrefs.printPrinterDeviceName,
      savedDirectEnabled: printerPrefs.printDirectEnabled,
      calls: printerCalls,
      fallbackWarningShown: toastEvents.some(item => item.type === 'warning' && item.message.includes('khổ A5'))
    };

    return {
      duplicateIds: Array.from(new Set(duplicateIds)),
      missingLabelTargets: Array.from(new Set(missingLabelTargets)),
      missingFormTargets: Array.from(new Set(missingFormTargets)),
      navigationErrors,
      missingSwitchTargets: Array.from(new Set(missingSwitchTargets)),
      reportHandlesMissingEntries,
      reportEscapesHtml,
      reportUsesDisplayDate,
      formatDateSamples: [
        formatDateDisplay('2026-07-05'),
        formatDateDisplay('5/7/2026'),
        getVoucherLineGrossAmount({ qty: 2, price: 1000, discount: 10, amount: 1800 }),
        getVoucherLineNetAmount({ qty: 2, price: 1000, discount: 10, amount: 1800 })
      ],
      discountVisibilityByType,
      windowErrors: window.__rdAuditErrors || [],
      hasState: typeof state === 'object' && Array.isArray(state.vouchers),
      hasVisibleContent: !!document.querySelector('.content-body .tab-view.active-tab'),
      cloudEnabled: typeof cloudSyncSettings !== 'undefined' ? cloudSyncSettings.enabled : null,
      cloudOpenState,
      escapeStackState,
      cloudStatusMirror,
      syncingWriteGate,
      taskWhileRunning,
      taskAfterFinish,
      syncOrder,
      manualSyncResult,
      synchronousSaveResult,
      forcePullCancelState,
      cloudConfigSaveState,
      printerUiState,
      cloudClosedState: {
        ariaHidden: cloudModal.getAttribute('aria-hidden'),
        bodyLocked: document.body.classList.contains('cloud-sync-modal-open')
      }
    };
  })()`);
  console.log('[app-shell-smoke] audit collected');

  assert.deepEqual(result.duplicateIds, [], `duplicate DOM ids: ${result.duplicateIds.join(', ')}`);
  assert.deepEqual(result.missingLabelTargets, [], `labels reference missing controls: ${result.missingLabelTargets.join(', ')}`);
  assert.deepEqual(result.missingFormTargets, [], `controls reference missing forms: ${result.missingFormTargets.join(', ')}`);
  assert.deepEqual(result.navigationErrors, [], `sidebar navigation errors: ${result.navigationErrors.join('; ')}`);
  assert.deepEqual(result.missingSwitchTargets, [], `switchTab targets missing views/menu items: ${result.missingSwitchTargets.join(', ')}`);
  assert.equal(result.reportHandlesMissingEntries, true, 'reports must tolerate imported vouchers without journal entries');
  assert.equal(result.reportEscapesHtml, true, 'report fields must render user data as text, not executable markup');
  assert.equal(result.reportUsesDisplayDate, true, 'reports must display dates as dd/mm/yyyy');
  assert.deepEqual(result.formatDateSamples, ['05/07/2026', '05/07/2026', 2000, 1800]);
  const expectedDiscountVisibility = {
    hiddenWithoutDiscount: true,
    shownWithDiscount: true,
    grossLineValue: '2.000',
    fullDateShown: true
  };
  for (const type of ['purchase_order', 'purchase', 'purchase_return', 'sales_return', 'sales', 'sales_quotation']) {
    assert.deepEqual(result.discountVisibilityByType[type], expectedDiscountVisibility,
      `${type} vouchers must hide zero discount totals and show real discounts`);
  }
  assert.deepEqual(result.windowErrors, [], `startup browser errors: ${result.windowErrors.join('; ')}`);
  assert.deepEqual(consoleErrors, [], `startup console errors: ${consoleErrors.join('; ')}`);
  assert.equal(result.hasState, true, 'application state should initialize');
  assert.equal(result.hasVisibleContent, true, 'one feature tab should remain visible');
  assert.equal(result.cloudEnabled, false, 'saved disabled cloud setting must stay disabled');
  assert.deepEqual(result.cloudOpenState, {
    display: 'flex', ariaHidden: 'false', bodyLocked: true, left: 0, rightGap: 0
  }, 'cloud modal should cover the viewport and expose dialog state');
  assert.deepEqual(result.escapeStackState, { cloudClosed: true, underlyingStillOpen: true }, 'Escape should close only the top-most modal');
  assert.deepEqual(result.cloudStatusMirror, { text: 'Mây: Lỗi kiểm tra', state: 'error' });
  assert.deepEqual(result.syncingWriteGate, { status: 'syncing', detail: 'Background sync test', canWrite: true }, 'background syncing must not lock write controls');
  assert.deepEqual(result.taskWhileRunning, { count: 1, status: 'cloud-sync-task cloud-sync-task-running' }, 'cloud modal must show the active background task');
  assert.equal(result.taskAfterFinish, 'cloud-sync-task cloud-sync-task-done', 'cloud modal must retain completed task history');
  assert.deepEqual(result.syncOrder, ['pull', 'push'], 'manual cloud sync must run pull then push');
  assert.equal(result.manualSyncResult, true);
  assert.equal(result.synchronousSaveResult, true, 'synchronous save must return the persistence result to voucher submit handlers');
  assert.deepEqual(result.forcePullCancelState, { result: false, calls: 0 }, 'cancelled force pull must not touch cloud');
  assert.deepEqual(result.cloudConfigSaveState, {
    result: false,
    busy: false,
    submitDisabled: false,
    normalizedUrl: 'https://example.supabase.co',
    toastTypes: ['danger']
  }, 'a saved config must not report success when connection initialization fails');
  assert.deepEqual(result.printerUiState, {
    options: ['System_Default', 'Office_A5'],
    selected: 'Office_A5',
    directEnabled: true,
    savedDeviceName: 'Office_A5',
    savedDirectEnabled: true,
    calls: [
      { paperSize: 'A5', options: { directPrint: true, deviceName: 'Office_A5' } },
      { paperSize: 'A5', options: { directPrint: false, deviceName: '' } }
    ],
    fallbackWarningShown: true
  }, 'printer UI must persist the device, send A5 directly, and fall back to the system dialog');
  assert.deepEqual(result.cloudClosedState, { ariaHidden: 'true', bodyLocked: false });

  const autocompleteResult = await win.webContents.executeJavaScript(`(async () => {
    const waitForUi = () => new Promise(resolve => setTimeout(resolve, 20));
    const failures = [];
    const checked = [];

    state.partners = [
      { id: 'KH-AUTO', name: 'Anh Auto', type: 'customer', phone: '0909000000' },
      { id: 'NCC-AUTO', name: 'Nhà cung cấp Auto', type: 'supplier', phone: '0908000000' }
    ];
    state.products = [
      { id: 'SP-AUTO', name: 'Sản phẩm Auto', stock: 42, salePrice1: 12345, avgCost: 6789 }
    ];

    async function checkInput(input, modalId, expectedList, expectedType, label) {
      if (!input) {
        failures.push(label + ': missing input');
        return;
      }

      openModal(modalId);
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      input.value = 'Auto';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitForUi();

      const dataList = input.getAttribute('data-list');
      const datalist = document.getElementById(expectedList);
      const dropdown = document.querySelector('.custom-autocomplete-dropdown');
      const optionCount = datalist ? datalist.querySelectorAll('option').length : 0;
      const dropdownCount = dropdown ? dropdown.querySelectorAll('.autocomplete-option').length : 0;
      const lookupType = getActiveLookupType(input);

      if (dataList !== expectedList) failures.push(label + ': data-list=' + dataList);
      if (input.hasAttribute('list')) failures.push(label + ': native list was not initialized');
      if (optionCount < 1) failures.push(label + ': lazy datalist is empty');
      if (dropdownCount < 1) failures.push(label + ': suggestion dropdown is empty');
      if (lookupType !== expectedType) failures.push(label + ': F3 type=' + lookupType);
      checked.push({ label, optionCount, dropdownCount, lookupType });

      closeCustomDropdown();
      closeModal(modalId);
    }

    const partnerForms = [
      ['receipt-partner', 'modal-add-receipt'],
      ['payment-partner', 'modal-add-payment'],
      ['pur-partner', 'modal-add-purchase'],
      ['ret-partner', 'modal-add-purchase-return'],
      ['pur-order-partner', 'modal-add-purchase-order'],
      ['sale-partner', 'modal-add-sales'],
      ['quotation-partner', 'modal-add-sales-quotation'],
      ['sales-ret-partner', 'modal-add-sales-return']
    ];
    for (const [inputId, modalId] of partnerForms) {
      await checkInput(
        document.getElementById(inputId),
        modalId,
        'datalist-partners',
        'partner',
        inputId
      );
    }

    const productForms = [
      ['purchase-form-items-body', 'modal-add-purchase', 'datalist-purchase-products'],
      ['purchase-return-form-items-body', 'modal-add-purchase-return', 'datalist-purchase-products'],
      ['purchase-order-form-items-body', 'modal-add-purchase-order', 'datalist-purchase-products'],
      ['sales-form-items-body', 'modal-add-sales', 'datalist-sales-products'],
      ['quotation-form-items-body', 'modal-add-sales-quotation', 'datalist-sales-products'],
      ['sales-return-form-items-body', 'modal-add-sales-return', 'datalist-sales-products'],
      ['template-form-items-body', 'modal-edit-template', 'datalist-sales-products']
    ];
    for (const [tbodyId, modalId, listId] of productForms) {
      replaceDynamicFormTableRows(tbodyId, []);
      const input = document.querySelector('#' + tbodyId + ' .item-productId');
      await checkInput(input, modalId, listId, 'product', tbodyId);
    }

    return { failures, checked };
  })()`, true);
  assert.deepEqual(
    autocompleteResult.failures,
    [],
    `autocomplete failures: ${autocompleteResult.failures.join('; ')}`
  );
  assert.equal(autocompleteResult.checked.length, 15, 'all partner and product entry forms must expose suggestions');
  console.log(`[app-shell-smoke] autocomplete verified on ${autocompleteResult.checked.length} real form inputs`);

  if (process.env.RD_AUDIT_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.RD_AUDIT_SCREENSHOT_DIR, { recursive: true });
    await win.webContents.executeJavaScript(`(() => {
      if (typeof hideAppLoading === 'function') hideAppLoading();
      const loading = document.getElementById('app-loading-overlay');
      if (loading) loading.remove();
      const login = document.getElementById('login-overlay');
      if (login) login.remove();
      openCloudSyncModal();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await win.webContents.executeJavaScript(`(() => {
      if (typeof hideAppLoading === 'function') hideAppLoading();
      const loading = document.getElementById('app-loading-overlay');
      if (loading) loading.remove();
      const login = document.getElementById('login-overlay');
      if (login) login.remove();
      openCloudSyncModal();
    })()`);
    fs.writeFileSync(
      path.join(process.env.RD_AUDIT_SCREENSHOT_DIR, 'cloud-sync-modal-desktop.png'),
      (await win.webContents.capturePage()).toPNG()
    );
    win.setSize(600, 800);
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync(
      path.join(process.env.RD_AUDIT_SCREENSHOT_DIR, 'cloud-sync-modal-mobile.png'),
      (await win.webContents.capturePage()).toPNG()
    );

    win.setSize(1280, 900);
    await win.webContents.executeJavaScript(`(() => {
      closeCloudSyncModal();
      const cloudModal = document.getElementById('modal-cloud-sync');
      if (cloudModal) cloudModal.style.display = 'none';
      document.getElementById('voucher-print-area').innerHTML =
        '<div class="printable-voucher" style="min-height:620px;padding:32px"><h2 style="text-align:center">PHIẾU GIAO HÀNG</h2><p>Bản xem trước khổ A5</p></div>';
      openModal('modal-view-voucher');
      const printModal = document.getElementById('modal-view-voucher');
      syncVoucherPrintControls();
      if (printModal) printModal.style.setProperty('display', 'flex', 'important');
      document.querySelectorAll('.toast').forEach(toast => toast.remove());
      const dialog = printModal && printModal.querySelector('.voucher-print-dialog');
      if (printModal) {
        printModal.style.animation = 'none';
        printModal.style.opacity = '1';
        printModal.style.transform = 'none';
      }
      if (dialog) {
        dialog.style.animation = 'none';
        dialog.style.opacity = '1';
        dialog.style.transform = 'none';
      }
    })()`);
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync(
      path.join(process.env.RD_AUDIT_SCREENSHOT_DIR, 'printer-auto-paper-a5.png'),
      (await win.webContents.capturePage()).toPNG()
    );
  }

  win.destroy();
  app.exit(0);
}

main().catch(error => {
  console.error(error);
  app.exit(1);
});
