'use strict';

const assert = require('assert');

const stationA = Number(process.argv[2] || 9331);
const stationB = Number(process.argv[3] || 9332);
const runId = `CODEX-E2E-${Date.now()}`;
const partnerId = `${runId}-PART`;
const productId = `${runId}-PROD`;
const salesId = `${runId}-SALE`;
const voucherTypes = ['purchase', 'purchase_order', 'sales_return', 'purchase_return', 'sales_quotation', 'receipt', 'payment'];
const extraVoucherIds = voucherTypes.map(type => `${runId}-${type.toUpperCase()}`);

async function debuggerUrl(port) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = pages.find(item => item.type === 'page');
  if (!page) throw new Error(`No Electron page on port ${port}`);
  return page.webSocketDebuggerUrl;
}

async function evaluate(port, expression, timeoutMs = 60000) {
  const ws = new WebSocket(await debuggerUrl(port));
  const id = 1;
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true }
  }));
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP evaluation timeout on ${port}`)), timeoutMs);
    ws.onmessage = event => {
      const parsed = JSON.parse(event.data);
      if (parsed.id !== id) return;
      clearTimeout(timer);
      resolve(parsed);
    };
  });
  ws.close();
  if (message.result.exceptionDetails) {
    throw new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text);
  }
  return message.result.result.value;
}

async function waitFor(port, expression, label, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(port, `Boolean(${expression})`)) {
      const elapsed = Date.now() - started;
      console.log(`[real-e2e] ${label}: ${elapsed}ms`);
      return elapsed;
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForBothQuiescent(timeoutMs = 180000) {
  const started = Date.now();
  const expression = `
    isStartupPullCompleted &&
    !isPulling && !isPushing && !pushPending && !pullPending &&
    !localStorage.getItem('rd_accounting_cloud_push_pending') &&
    cloudWriteGate.getStatus().status === 'ready'
  `;
  while (Date.now() - started < timeoutMs) {
    const first = await Promise.all([stationA, stationB].map(port => evaluate(port, `Boolean(${expression})`)));
    if (first.every(Boolean)) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const stable = await Promise.all([stationA, stationB].map(port => evaluate(port, `Boolean(${expression})`)));
      if (stable.every(Boolean)) {
        console.log(`[real-e2e] both stations quiescent: ${Date.now() - started}ms`);
        return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error('Timed out waiting for both stations to become quiescent');
}

async function waitForPush(port, label) {
  return waitFor(
    port,
    `!localStorage.getItem('rd_accounting_cloud_push_pending') && !isPushing`,
    label,
    90000
  );
}

async function saveDirect(port, body) {
  return evaluate(port, `(async () => { ${body}; await saveStateAndSyncVoucher(); return true; })()`, 60000);
}

async function createItemVoucherThroughForm(config, voucherId) {
  const payload = JSON.stringify(config);
  await evaluate(stationA, `(() => {
    const config = ${payload};
    const originalSafeId = ensureCloudSafeVoucherIdForSave;
    ensureCloudSafeVoucherIdForSave = async options => options.currentId;
    clearActiveFormDraft(config.formId);
    window[config.resetName]();
    openModal(config.modalId);
    document.getElementById(config.idField).value = ${JSON.stringify(voucherId)};
    document.getElementById(config.partnerField).value = 'Codex E2E Partner Updated (${partnerId})';
    document.getElementById(config.dateField).value = '2026-07-13';
    document.getElementById(config.paymentField).value = config.payment;
    document.getElementById(config.descField).value = 'Codex E2E ' + config.type;
    if (config.taxField) document.getElementById(config.taxField).value = '0';
    replaceDynamicFormTableRows(config.tbodyId, [{
      productId: ${JSON.stringify(productId)}, desc: 'Codex E2E line', qty: 1, price: 1, discount: 0
    }]);
    window.__realE2eFormError = null;
    window.__realE2eFormPromise = Promise.resolve(window[config.handlerName]({ preventDefault() {} }))
      .catch(error => { window.__realE2eFormError = String(error && (error.stack || error.message) || error); })
      .finally(() => { ensureCloudSafeVoucherIdForSave = originalSafeId; });
    return true;
  })()`);
  await waitFor(stationA, `!isVoucherFormBusy(${JSON.stringify(config.modalId)})`, `${config.type} form create completed`, 90000);
  const result = await evaluate(stationA, `({
    exists: state.vouchers.some(item => item && item.id === ${JSON.stringify(voucherId)} && item.type === ${JSON.stringify(config.type)}),
    modal: document.getElementById(${JSON.stringify(config.modalId)}).style.display,
    error: window.__realE2eFormError
  })`);
  assert.equal(result.error, null, `${config.type} form promise must not reject`);
  assert.equal(result.exists, true, `${config.type} form must create its voucher on Station A`);
  assert.equal(result.modal, 'none', `${config.type} form must close after persistence succeeds`);
  await waitForPush(stationA, `${config.type} form create pushed`);
  await waitFor(stationB, `state.vouchers.some(item => item && item.id === ${JSON.stringify(voucherId)} && item.type === ${JSON.stringify(config.type)})`, `Station B received ${config.type}`);
}

async function createCashVoucherThroughForm(config) {
  const payload = JSON.stringify(config);
  await evaluate(stationA, `(() => {
    const config = ${payload};
    window[config.resetName]();
    document.getElementById(config.formId).reset();
    openModal(config.modalId);
    document.getElementById(config.dateField).value = '2026-07-13';
    document.getElementById(config.partnerField).value = 'Codex E2E Partner Updated (${partnerId})';
    document.getElementById(config.debitField).value = config.debit;
    document.getElementById(config.creditField).value = config.credit;
    document.getElementById(config.amountField).value = '1';
    document.getElementById(config.descField).value = config.description;
    window.__realE2eFormError = null;
    window.__realE2eFormPromise = Promise.resolve(window[config.handlerName]({ preventDefault() {} }))
      .catch(error => { window.__realE2eFormError = String(error && (error.stack || error.message) || error); });
    return true;
  })()`);
  await waitFor(stationA, `!isVoucherFormBusy(${JSON.stringify(config.modalId)})`, `${config.type} form create completed`, 90000);
  const result = await evaluate(stationA, `(() => {
    const voucher = state.vouchers.find(item => item && item.type === ${JSON.stringify(config.type)} && item.description === ${JSON.stringify(config.description)});
    return { id: voucher && voucher.id, modal: document.getElementById(${JSON.stringify(config.modalId)}).style.display, error: window.__realE2eFormError };
  })()`);
  assert.equal(result.error, null, `${config.type} form promise must not reject`);
  assert.ok(result.id, `${config.type} form must create its voucher on Station A`);
  assert.equal(result.modal, 'none', `${config.type} form must close after persistence succeeds`);
  const cleanupSlot = config.type === 'receipt' ? 5 : (config.type === 'payment' ? 6 : -1);
  if (cleanupSlot >= 0) extraVoucherIds[cleanupSlot] = result.id;
  await waitForPush(stationA, `${config.type} form create pushed`);
  await waitFor(stationB, `state.vouchers.some(item => item && item.id === ${JSON.stringify(result.id)} && item.type === ${JSON.stringify(config.type)})`, `Station B received ${config.type}`);
  return result.id;
}

async function cleanup() {
  const idsJson = JSON.stringify([salesId, ...extraVoucherIds]);
  await evaluate(stationA, `(async () => {
    const voucherIds = ${idsJson};
    voucherIds.forEach(id => {
      if (state.vouchers.some(item => item && item.id === id)) trackDeletedIds([id], 'voucher');
    });
    if (state.products.some(item => item && item.id === ${JSON.stringify(productId)})) trackDeletedIds([${JSON.stringify(productId)}], 'product');
    if (state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)})) trackDeletedIds([${JSON.stringify(partnerId)}], 'partner');
    state.vouchers = state.vouchers.filter(item => !voucherIds.includes(item && item.id));
    state.products = state.products.filter(item => item && item.id !== ${JSON.stringify(productId)});
    state.partners = state.partners.filter(item => item && item.id !== ${JSON.stringify(partnerId)});
    await saveStateAndSyncVoucher();
    return true;
  })()`, 60000);
  await waitForPush(stationA, 'cleanup push confirmed');
  await waitFor(stationB, `
    !state.vouchers.some(item => ${idsJson}.includes(item && item.id)) &&
    !state.products.some(item => item && item.id === ${JSON.stringify(productId)}) &&
    !state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)})
  `, 'Station B received cleanup', 90000);
}

async function run() {
  console.log(`[real-e2e] runId=${runId}`);
  await Promise.all([stationA, stationB].map((port, index) => waitFor(
    port,
    `isStartupPullCompleted`,
    `Station ${index === 0 ? 'A' : 'B'} startup sync ready`,
    180000
  )));
  await waitForBothQuiescent();
  const ready = await Promise.all([stationA, stationB].map(port => evaluate(port,
    `({ startup: isStartupPullCompleted, gate: cloudWriteGate.getStatus().status, vouchers: state.vouchers.length })`
  )));
  console.log(`[real-e2e] startup state: ${JSON.stringify(ready)}`);
  assert.ok(ready.every(item => item.startup), 'both real stations must complete startup reconciliation');
  await Promise.all([stationA, stationB].map(port => evaluate(port, `(() => {
    __cloudSyncInternals__.setCloudSyncEgressMetricsEnabled(true);
    __cloudSyncInternals__.resetCloudSyncEgressMetrics();
    return __cloudSyncInternals__.getCloudSyncEgressMetrics();
  })()`)));

  const lockAcquired = await evaluate(stationA, `(() => {
    const key = 'rd_real_multistation_e2e_lock';
    const previous = JSON.parse(localStorage.getItem(key) || 'null');
    if (previous && Date.now() - Number(previous.startedAt || 0) < 10 * 60 * 1000) return false;
    localStorage.setItem(key, JSON.stringify({ runId: ${JSON.stringify(runId)}, startedAt: Date.now() }));
    return true;
  })()`);
  assert.equal(lockAcquired, true, 'another real multi-station harness is already running');

  try {
    await saveDirect(stationA, `
      state.partners.push({ id: ${JSON.stringify(partnerId)}, name: 'Codex E2E Partner', address: 'Station A', _updatedAt: Date.now(), _sessionId: clientSessionId })
    `);
    await waitForPush(stationA, 'partner create pushed');
    await waitFor(stationB, `state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)})`, 'Station B received partner create');
    const firstTransferState = await evaluate(stationB, `({
      versioned: cloudUsesVersionedRpc,
      metrics: __cloudSyncInternals__.getCloudSyncEgressMetrics()
    })`);
    const firstTransferMetrics = firstTransferState.metrics;
    console.log(`[real-e2e] compact transfer metrics (${firstTransferState.versioned ? 'v3' : 'legacy'}): ${JSON.stringify(firstTransferMetrics)}`);
    assert.ok(firstTransferMetrics.realtimeEvents >= 1, 'Station B must receive a real Realtime event, not only polling');
    assert.equal(firstTransferMetrics.realtimeEventsWithData, 0, 'Realtime must omit the accounting data JSON payload');
    assert.ok(firstTransferMetrics.realtimeBytes < firstTransferMetrics.realtimeEvents * 2048, 'compact Realtime events should stay below 2KB each');
    assert.equal(firstTransferMetrics.snapshotRows, 0, 'a normal cross-station change must not trigger a full snapshot');
    assert.ok(firstTransferMetrics.deltaRows >= 1, 'Station B must fetch only the changed delta rows');
    assert.ok(
      firstTransferMetrics.deltaBytes < 64 * 1024,
      `an entity-only delta must stay below 64KB instead of carrying metadata (${firstTransferMetrics.deltaBytes} bytes)`
    );
    assert.equal(
      firstTransferMetrics.activePollIntervalMs,
      30000,
      'confirmed Realtime must retain only the low-frequency 30s safety watchdog'
    );

    await saveDirect(stationA, `
      { const item = state.partners.find(x => x.id === ${JSON.stringify(partnerId)}); item.name = 'Codex E2E Partner Updated'; item._updatedAt = Date.now(); item._sessionId = clientSessionId; }
    `);
    await waitForPush(stationA, 'partner update pushed');
    await waitFor(stationB, `state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)} && item.name === 'Codex E2E Partner Updated')`, 'Station B received partner update');

    await saveDirect(stationA, `
      state.products.push({ id: ${JSON.stringify(productId)}, name: 'Codex E2E Product', unit: 'cái', stock: 100, avgCost: 1, totalValue: 100, salePrice1: 1, _updatedAt: Date.now(), _sessionId: clientSessionId })
    `);
    await waitForPush(stationA, 'product create pushed');
    await waitFor(stationB, `state.products.some(item => item && item.id === ${JSON.stringify(productId)})`, 'Station B received product create');

    await saveDirect(stationA, `
      { const item = state.products.find(x => x.id === ${JSON.stringify(productId)}); item.name = 'Codex E2E Product Updated'; item.salePrice1 = 2; item._updatedAt = Date.now(); item._sessionId = clientSessionId; }
    `);
    await waitForPush(stationA, 'product update pushed');
    await waitFor(stationB, `state.products.some(item => item && item.id === ${JSON.stringify(productId)} && item.salePrice1 === 2)`, 'Station B received product update');

    await evaluate(stationA, `(() => {
      const originalSafeId = getCloudSafeVoucherId;
      getCloudSafeVoucherId = async options => options.currentId;
      clearActiveFormDraft('form-sales');
      resetSalesForm();
      openModal('modal-add-sales');
      document.getElementById('sale-id').value = ${JSON.stringify(salesId)};
      document.getElementById('sale-partner').value = 'Codex E2E Partner Updated (${partnerId})';
      document.getElementById('sale-date').value = '2026-07-13';
      document.getElementById('sale-payment').value = '131';
      document.getElementById('sale-desc').value = 'Codex E2E sales create';
      replaceDynamicFormTableRows('sales-form-items-body', [{
        productId: ${JSON.stringify(productId)},
        desc: 'Codex E2E line',
        qty: 1,
        price: 1,
        discount: 0
      }]);
      window.__realE2eSalesError = null;
      window.__realE2eSalesPromise = Promise.resolve(handleSalesSubmit({ preventDefault() {} }))
        .catch(error => { window.__realE2eSalesError = String(error && (error.stack || error.message) || error); })
        .finally(() => { getCloudSafeVoucherId = originalSafeId; });
      return true;
    })()`);
    await waitFor(stationA, `!salesSubmitInProgress`, 'sales form create completed', 90000);
    const salesResult = await evaluate(stationA, `({
      exists: state.vouchers.some(item => item.id === ${JSON.stringify(salesId)}),
      modal: document.getElementById('modal-add-sales').style.display,
      error: window.__realE2eSalesError
    })`);
    assert.equal(salesResult.error, null, 'sales form create promise must not reject');
    assert.equal(salesResult.exists, true, 'sales form handler must create voucher on Station A');
    assert.equal(salesResult.modal, 'none', 'sales form must close after local persistence succeeds');
    await waitForPush(stationA, 'sales form create pushed');
    await waitFor(stationB, `state.vouchers.some(item => item && item.id === ${JSON.stringify(salesId)} && item.description === 'Codex E2E sales create')`, 'Station B received sales create');

    await evaluate(stationA, `(() => {
      editSalesVoucher(${JSON.stringify(salesId)});
      document.getElementById('sale-desc').value = 'Codex E2E sales updated';
      window.__realE2eSalesError = null;
      window.__realE2eSalesPromise = Promise.resolve(handleSalesSubmit({ preventDefault() {} }))
        .catch(error => { window.__realE2eSalesError = String(error && (error.stack || error.message) || error); });
      return true;
    })()`);
    await waitFor(stationA, `!salesSubmitInProgress`, 'sales form update completed', 90000);
    const salesUpdateResult = await evaluate(stationA, `({
      updated: state.vouchers.some(item => item.id === ${JSON.stringify(salesId)} && item.description === 'Codex E2E sales updated'),
      modal: document.getElementById('modal-add-sales').style.display,
      error: window.__realE2eSalesError
    })`);
    assert.equal(salesUpdateResult.error, null, 'sales form update promise must not reject');
    assert.equal(salesUpdateResult.updated, true, 'sales form handler must update voucher on Station A');
    assert.equal(salesUpdateResult.modal, 'none', 'sales form must close after update persistence succeeds');
    await waitForPush(stationA, 'sales form update pushed');
    await waitFor(stationB, `state.vouchers.some(item => item && item.id === ${JSON.stringify(salesId)} && item.description === 'Codex E2E sales updated')`, 'Station B received sales update');

    const itemFormCases = [
      { type: 'purchase', formId: 'form-purchase', modalId: 'modal-add-purchase', resetName: 'resetPurchaseForm', handlerName: 'handlePurchaseSubmit', tbodyId: 'purchase-form-items-body', idField: 'pur-id', partnerField: 'pur-partner', dateField: 'pur-date', paymentField: 'pur-payment', descField: 'pur-desc', taxField: 'pur-tax-rate', payment: '331' },
      { type: 'purchase_order', formId: 'form-purchase-order', modalId: 'modal-add-purchase-order', resetName: 'resetPurchaseOrderForm', handlerName: 'handlePurchaseOrderSubmit', tbodyId: 'purchase-order-form-items-body', idField: 'pur-order-id', partnerField: 'pur-order-partner', dateField: 'pur-order-date', paymentField: 'pur-order-payment', descField: 'pur-order-desc', taxField: 'pur-order-tax-rate', payment: '331' },
      { type: 'sales_return', formId: 'form-sales-return', modalId: 'modal-add-sales-return', resetName: 'resetSalesReturnForm', handlerName: 'handleSalesReturnSubmit', tbodyId: 'sales-return-form-items-body', idField: 'sales-ret-id', partnerField: 'sales-ret-partner', dateField: 'sales-ret-date', paymentField: 'sales-ret-payment', descField: 'sales-ret-desc', taxField: 'sales-ret-tax-rate', payment: '131' },
      { type: 'purchase_return', formId: 'form-purchase-return', modalId: 'modal-add-purchase-return', resetName: 'resetPurchaseReturnForm', handlerName: 'handlePurchaseReturnSubmit', tbodyId: 'purchase-return-form-items-body', idField: 'pur-return-id', partnerField: 'ret-partner', dateField: 'ret-date', paymentField: 'ret-payment', descField: 'ret-desc', taxField: 'ret-tax-rate', payment: '331' },
      { type: 'sales_quotation', formId: 'form-quotation', modalId: 'modal-add-sales-quotation', resetName: 'resetQuotationForm', handlerName: 'handleQuotationSubmit', tbodyId: 'quotation-form-items-body', idField: 'quotation-id', partnerField: 'quotation-partner', dateField: 'quotation-date', paymentField: 'quotation-payment', descField: 'quotation-desc', taxField: 'quotation-tax-rate', payment: '131' }
    ];
    for (let index = 0; index < itemFormCases.length; index++) {
      await createItemVoucherThroughForm(itemFormCases[index], extraVoucherIds[index]);
    }

    extraVoucherIds[5] = await createCashVoucherThroughForm({
      type: 'receipt', formId: 'form-receipt', modalId: 'modal-add-receipt', resetName: 'resetReceiptForm', handlerName: 'handleReceiptSubmit',
      dateField: 'receipt-date', partnerField: 'receipt-partner', debitField: 'receipt-debit', creditField: 'receipt-credit', amountField: 'receipt-amount', descField: 'receipt-desc',
      debit: '111', credit: '131', description: `Codex E2E receipt ${runId}`
    });
    extraVoucherIds[6] = await createCashVoucherThroughForm({
      type: 'payment', formId: 'form-payment', modalId: 'modal-add-payment', resetName: 'resetPaymentForm', handlerName: 'handlePaymentSubmit',
      dateField: 'payment-date', partnerField: 'payment-partner', debitField: 'payment-debit', creditField: 'payment-credit', amountField: 'payment-amount', descField: 'payment-desc',
      debit: '331', credit: '111', description: `Codex E2E payment ${runId}`
    });

    const extrasJson = JSON.stringify(extraVoucherIds);

    await saveDirect(stationB, `
      { const ids = ${extrasJson}; ids.forEach((id, index) => { const item = state.vouchers.find(x => x.id === id); item.description = 'Station B updated ' + index; item._updatedAt = Date.now() + index; item._sessionId = clientSessionId; }); }
    `);
    await waitForPush(stationB, 'Station B cross-update pushed');
    await waitFor(stationA, `${extrasJson}.every((id, index) => state.vouchers.some(item => item && item.id === id && item.description === 'Station B updated ' + index))`, 'Station A received cross-updates');

    await evaluate(stationA, `(async () => { const previous = window.confirm; window.confirm = () => true; try { await deleteVoucher(${JSON.stringify(salesId)}); } finally { window.confirm = previous; } return true; })()`, 90000);
    await waitForPush(stationA, 'sales delete pushed');
    await waitFor(stationB, `!state.vouchers.some(item => item && item.id === ${JSON.stringify(salesId)})`, 'Station B received sales delete');

    await cleanup();
    const noOpMetrics = await evaluate(stationA, `(async () => {
      __cloudSyncInternals__.resetCloudSyncEgressMetrics();
      const ok = await manualIncrementalSync();
      return { ok, metrics: __cloudSyncInternals__.getCloudSyncEgressMetrics() };
    })()`, 90000);
    assert.equal(noOpMetrics.ok, true, 'manual no-op sync must complete successfully');
    assert.equal(noOpMetrics.metrics.snapshotRows, 0, 'manual no-op sync must not download a full snapshot');
    assert.equal(noOpMetrics.metrics.pushTransactions, 0, 'manual no-op sync must not create a cloud transaction');
    assert.equal(noOpMetrics.metrics.skippedNoopPushes, 1, 'manual no-op sync must be stopped by the local delta gate');
    console.log(`[real-e2e] no-op metrics: ${JSON.stringify(noOpMetrics.metrics)}`);
    await evaluate(stationA, `localStorage.removeItem('rd_real_multistation_e2e_lock')`);
    console.log('[real-e2e] PASS: two real Electron stations completed create/update/delete and cross-station flows');
  } catch (error) {
    console.error('[real-e2e] failure:', error);
    try { await cleanup(); } catch (cleanupError) { console.error('[real-e2e] cleanup failure:', cleanupError); }
    try { await evaluate(stationA, `localStorage.removeItem('rd_real_multistation_e2e_lock')`); } catch {}
    throw error;
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
