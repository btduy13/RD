'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const stationCount = Number(process.env.RD_STRESS_STATIONS || 10);
const basePort = Number(process.env.RD_STRESS_BASE_PORT || 19600);
const runId = process.env.RD_STRESS_RUN_ID || `RD-STRESS-${Date.now()}`;
const appRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const profileRoot = path.join(os.tmpdir(), runId);
const profileSeed = process.env.RD_STRESS_PROFILE_SEED || '';
const crashRecoveryOnly = process.env.RD_STRESS_CRASH_ONLY === '1';
const partnerId = `${runId}-PARTNER`;
const productId = `${runId}-PRODUCT`;
const allCreated = [];
const startupRuns = [];
let fixturesCreated = false;
let testPassed = false;

if (!Number.isInteger(stationCount) || stationCount < 10) {
  throw new Error('RD_STRESS_STATIONS must be an integer >= 10');
}
if (!profileSeed) {
  throw new Error(
    'RD_STRESS_PROFILE_SEED is required. Seed every station from a confirmed app profile; ' +
    'an empty profile can trigger legacy data migration and must never be used against the real cloud.'
  );
}

const stations = Array.from({ length: stationCount }, (_, index) => ({
  index,
  label: `S${String(index + 1).padStart(2, '0')}`,
  port: basePort + index,
  userDataDir: path.join(profileRoot, `station-${String(index + 1).padStart(2, '0')}`),
  process: null,
  logs: [],
  spawnAt: 0
}));

const voucherConfigs = {
  sales: {
    kind: 'item', type: 'sales', formId: 'form-sales', modalId: 'modal-add-sales', resetName: 'resetSalesForm', handlerName: 'handleSalesSubmit',
    tbodyId: 'sales-form-items-body', idField: 'sale-id', partnerField: 'sale-partner', dateField: 'sale-date', paymentField: 'sale-payment',
    descField: 'sale-desc', taxField: 'sale-tax-rate', payment: '131'
  },
  purchase: {
    kind: 'item', type: 'purchase', formId: 'form-purchase', modalId: 'modal-add-purchase', resetName: 'resetPurchaseForm', handlerName: 'handlePurchaseSubmit',
    tbodyId: 'purchase-form-items-body', idField: 'pur-id', partnerField: 'pur-partner', dateField: 'pur-date', paymentField: 'pur-payment',
    descField: 'pur-desc', taxField: 'pur-tax-rate', payment: '331'
  },
  purchase_order: {
    kind: 'item', type: 'purchase_order', formId: 'form-purchase-order', modalId: 'modal-add-purchase-order', resetName: 'resetPurchaseOrderForm', handlerName: 'handlePurchaseOrderSubmit',
    tbodyId: 'purchase-order-form-items-body', idField: 'pur-order-id', partnerField: 'pur-order-partner', dateField: 'pur-order-date', paymentField: 'pur-order-payment',
    descField: 'pur-order-desc', taxField: 'pur-order-tax-rate', payment: '331'
  },
  sales_return: {
    kind: 'item', type: 'sales_return', formId: 'form-sales-return', modalId: 'modal-add-sales-return', resetName: 'resetSalesReturnForm', handlerName: 'handleSalesReturnSubmit',
    tbodyId: 'sales-return-form-items-body', idField: 'sales-ret-id', partnerField: 'sales-ret-partner', dateField: 'sales-ret-date', paymentField: 'sales-ret-payment',
    descField: 'sales-ret-desc', taxField: 'sales-ret-tax-rate', payment: '131'
  },
  purchase_return: {
    kind: 'item', type: 'purchase_return', formId: 'form-purchase-return', modalId: 'modal-add-purchase-return', resetName: 'resetPurchaseReturnForm', handlerName: 'handlePurchaseReturnSubmit',
    tbodyId: 'purchase-return-form-items-body', idField: 'pur-return-id', partnerField: 'ret-partner', dateField: 'ret-date', paymentField: 'ret-payment',
    descField: 'ret-desc', taxField: 'ret-tax-rate', payment: '331'
  },
  sales_quotation: {
    kind: 'item', type: 'sales_quotation', formId: 'form-quotation', modalId: 'modal-add-sales-quotation', resetName: 'resetQuotationForm', handlerName: 'handleQuotationSubmit',
    tbodyId: 'quotation-form-items-body', idField: 'quotation-id', partnerField: 'quotation-partner', dateField: 'quotation-date', paymentField: 'quotation-payment',
    descField: 'quotation-desc', taxField: 'quotation-tax-rate', payment: '131'
  },
  receipt: {
    kind: 'cash', type: 'receipt', formId: 'form-receipt', modalId: 'modal-add-receipt', resetName: 'resetReceiptForm', handlerName: 'handleReceiptSubmit',
    dateField: 'receipt-date', partnerField: 'receipt-partner', debitField: 'receipt-debit', creditField: 'receipt-credit', amountField: 'receipt-amount',
    descField: 'receipt-desc', debit: '111', credit: '131', editName: 'editReceiptVoucher'
  },
  payment: {
    kind: 'cash', type: 'payment', formId: 'form-payment', modalId: 'modal-add-payment', resetName: 'resetPaymentForm', handlerName: 'handlePaymentSubmit',
    dateField: 'payment-date', partnerField: 'payment-partner', debitField: 'payment-debit', creditField: 'payment-credit', amountField: 'payment-amount',
    descField: 'payment-desc', debit: '331', credit: '111', editName: 'editPaymentVoucher'
  }
};

function appendLog(station, chunk) {
  station.logs.push(...String(chunk || '').split(/\r?\n/).filter(Boolean));
  if (station.logs.length > 600) station.logs.splice(0, station.logs.length - 600);
}

function seedStationProfile(station) {
  if (!profileSeed || fs.existsSync(station.userDataDir)) return;
  const resolvedSeed = path.resolve(profileSeed);
  if (!fs.existsSync(resolvedSeed)) throw new Error(`Profile seed does not exist: ${resolvedSeed}`);
  fs.mkdirSync(station.userDataDir, { recursive: true });
  for (const name of ['data', 'Local Storage', 'Preferences', 'Local State']) {
    const source = path.join(resolvedSeed, name);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(station.userDataDir, name), { recursive: true });
  }
}

async function debuggerUrl(station) {
  const response = await fetch(`http://127.0.0.1:${station.port}/json`);
  const pages = await response.json();
  const page = pages.find(item => item.type === 'page' && !String(item.url || '').startsWith('devtools://'));
  if (!page) throw new Error(`No Electron page on port ${station.port}`);
  return page.webSocketDebuggerUrl;
}

async function evaluate(station, expression, timeoutMs = 120000) {
  const ws = new WebSocket(await debuggerUrl(station));
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
    const timer = setTimeout(() => reject(new Error(`CDP evaluation timeout on ${station.label}`)), timeoutMs);
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

function isTransientError(error) {
  const message = `${String(error && error.message || error)} ${String(error && error.cause || '')}`;
  return ['ReferenceError', 'Cannot access', 'fetch failed', 'ECONNREFUSED', 'No Electron page', 'WebSocket'].some(token => message.includes(token));
}

async function waitFor(station, expression, label, timeoutMs = 240000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(station, `Boolean(${expression})`, Math.min(timeoutMs, 120000))) {
        return Date.now() - started;
      }
      lastError = null;
    } catch (error) {
      if (!isTransientError(error)) throw error;
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error(`${station.label} timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

async function startStation(station, phase) {
  seedStationProfile(station);
  fs.mkdirSync(station.userDataDir, { recursive: true });
  station.spawnAt = Date.now();
  station.process = spawn(electronPath, [
    '.',
    `--remote-debugging-port=${station.port}`,
    `--user-data-dir=${station.userDataDir}`,
    '--disable-gpu'
  ], {
    cwd: appRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  station.process.stdout.on('data', chunk => appendLog(station, chunk));
  station.process.stderr.on('data', chunk => appendLog(station, chunk));

  await waitFor(
    station,
    `document.readyState === 'complete' && typeof state !== 'undefined' && typeof cloudWriteGate !== 'undefined'`,
    `${phase} application shell`,
    240000
  );
  const shellMs = Date.now() - station.spawnAt;
  await waitFor(
    station,
    `typeof isStartupPullCompleted !== 'undefined' && isStartupPullCompleted &&
      cloudWriteGate.getStatus().status === 'ready'`,
    `${phase} cloud ready`,
    480000
  );
  await waitFor(
    station,
    `!isPulling && !isPushing && !pushPending && !pullPending &&
      !localStorage.getItem('rd_accounting_cloud_push_pending') &&
      !(state._pendingCloudWrite && state._pendingCloudWrite.token)`,
    `${phase} quiescent`,
    300000
  );
  const readyMs = Date.now() - station.spawnAt;
  const details = await evaluate(station, `({
    protocol: cloudUsesVersionedRpc ? 'v3-transactional' : 'legacy',
    voucherCount: state.vouchers.length,
    metrics: { ...window.cloudSyncStartupMetrics }
  })`);
  const measurement = {
    phase,
    station: station.label,
    shellMs,
    readyMs,
    protocol: details.protocol,
    voucherCount: details.voucherCount,
    ...details.metrics
  };
  startupRuns.push(measurement);
  console.log(`[stress] ${phase} ${station.label}: shell=${shellMs}ms ready=${readyMs}ms mode=${measurement.mode} snapshotRows=${measurement.snapshotRows} deltaRows=${measurement.deltaRows}`);
  return measurement;
}

async function stopStation(station, graceful = true) {
  const child = station.process;
  if (!child || child.exitCode !== null) {
    station.process = null;
    return;
  }
  if (graceful) {
    try {
      await evaluate(station, 'window.close(); true', 15000);
    } catch (error) {
      if (!isTransientError(error)) console.warn(`[stress] ${station.label} close warning: ${error.message}`);
    }
  } else {
    child.kill();
  }
  const exited = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), graceful ? 25000 : 10000))
  ]);
  if (!exited && child.exitCode === null) child.kill();
  station.process = null;
}

async function waitAllQuiescent(label, timeoutMs = 300000) {
  await Promise.all(stations.map(station => waitFor(
    station,
    `!isPulling && !isPushing && !pushPending && !pullPending &&
      !localStorage.getItem('rd_accounting_cloud_push_pending') &&
      !(state && state._pendingCloudWrite && state._pendingCloudWrite.token)`,
    label,
    timeoutMs
  )));
}

async function pullAllIncremental(reason) {
  await Promise.all(stations.map(station => evaluate(
    station,
    `pullAndMergeFromCloud({ reason: ${JSON.stringify(reason)}, force: true })`,
    180000
  )));
  await waitAllQuiescent(reason, 300000);
}

async function createFixtures() {
  const station = stations[0];
  await evaluate(station, `(async () => {
    if (!state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)})) {
      state.partners.push({
        id: ${JSON.stringify(partnerId)},
        name: ${JSON.stringify(`${runId} Partner`)},
        address: 'ten-station stress',
        _updatedAt: Date.now(),
        _sessionId: clientSessionId
      });
    }
    if (!state.products.some(item => item && item.id === ${JSON.stringify(productId)})) {
      state.products.push({
        id: ${JSON.stringify(productId)},
        name: ${JSON.stringify(`${runId} Product`)},
        unit: 'piece',
        stock: 100000,
        avgCost: 1,
        totalValue: 100000,
        salePrice1: 10,
        _updatedAt: Date.now(),
        _sessionId: clientSessionId
      });
    }
    await saveStateAndSyncVoucher();
    return true;
  })()`);
  fixturesCreated = true;
  await Promise.all(stations.map(item => waitFor(
    item,
    `state.partners.some(row => row && row.id === ${JSON.stringify(partnerId)}) &&
      state.products.some(row => row && row.id === ${JSON.stringify(productId)})`,
    'shared stress fixtures',
    300000
  )));
  await waitAllQuiescent('shared stress fixtures committed', 300000);
}

async function beginCreate(station, config, description) {
  await evaluate(station, `(() => {
    const config = ${JSON.stringify(config)};
    window[config.resetName]();
    if (config.kind === 'cash') {
      document.getElementById(config.formId).reset();
    } else {
      clearActiveFormDraft(config.formId);
    }
    openModal(config.modalId);
    if (config.idField) document.getElementById(config.idField).value = '';
    document.getElementById(config.partnerField).value = ${JSON.stringify(`${runId} Partner (${partnerId})`)};
    document.getElementById(config.dateField).value = '2026-07-23';
    document.getElementById(config.descField).value = ${JSON.stringify(description)};
    if (config.kind === 'cash') {
      document.getElementById(config.debitField).value = config.debit;
      document.getElementById(config.creditField).value = config.credit;
      document.getElementById(config.amountField).value = String(1000 + ${station.index});
    } else {
      document.getElementById(config.paymentField).value = config.payment;
      if (config.taxField) document.getElementById(config.taxField).value = '0';
      replaceDynamicFormTableRows(config.tbodyId, [{
        productId: ${JSON.stringify(productId)},
        desc: 'stress line',
        qty: 1,
        price: 10,
        discount: 0
      }]);
    }
    window.__stressFormError = null;
    window.__stressFormPromise = Promise.resolve(window[config.handlerName]({ preventDefault() {} }))
      .catch(error => { window.__stressFormError = String(error && (error.stack || error.message) || error); });
    return true;
  })()`);
}

async function finishCreate(station, config, description) {
  await waitFor(station, `!isVoucherFormBusy(${JSON.stringify(config.modalId)})`, `${config.type} form completion`, 300000);
  const result = await evaluate(station, `(() => {
    const voucher = state.vouchers.find(item => item && item.type === ${JSON.stringify(config.type)} && item.description === ${JSON.stringify(description)});
    return {
      id: voucher && voucher.id,
      error: window.__stressFormError,
      modal: document.getElementById(${JSON.stringify(config.modalId)}).style.display
    };
  })()`);
  assert.equal(result.error, null, `${station.label} ${config.type} form rejected`);
  assert.ok(result.id, `${station.label} ${config.type} voucher was not persisted`);
  assert.equal(result.modal, 'none', `${station.label} ${config.type} modal did not close`);
  return { station: station.label, type: config.type, description, id: result.id };
}

async function waitForDescriptionsEverywhere(descriptions, label, timeoutMs = 360000) {
  const payload = JSON.stringify(descriptions);
  await Promise.all(stations.map(station => waitFor(
    station,
    `${payload}.every(description => state.vouchers.some(item => item && item.description === description))`,
    label,
    timeoutMs
  )));
}

async function waitForIdsEverywhere(ids, label, timeoutMs = 360000) {
  const payload = JSON.stringify(ids);
  await Promise.all(stations.map(station => waitFor(
    station,
    `${payload}.every(id => state.vouchers.some(item => item && item.id === id))`,
    label,
    timeoutMs
  )));
}

async function runCreateWave(type) {
  const config = voucherConfigs[type];
  const descriptions = stations.map(station => `${runId} create ${type} ${station.label}`);
  const startedAt = Date.now();
  await Promise.all(stations.map((station, index) => beginCreate(station, config, descriptions[index])));
  const results = await Promise.all(stations.map((station, index) => finishCreate(station, config, descriptions[index])));
  await waitAllQuiescent(`${type} commit`, 360000);
  await waitForDescriptionsEverywhere(descriptions, `${type} convergence`, 360000);
  assert.equal(new Set(results.map(result => result.id)).size, stationCount, `${type} IDs must be unique across all stations`);
  allCreated.push(...results);
  console.log(`[stress] create ${type}: ${stationCount}/${stationCount} converged in ${Date.now() - startedAt}ms`);
  return results;
}

async function beginCashEdit(station, config, id, description, amount) {
  await evaluate(station, `(() => {
    const config = ${JSON.stringify(config)};
    window[config.editName](${JSON.stringify(id)});
    document.getElementById(config.descField).value = ${JSON.stringify(description)};
    document.getElementById(config.amountField).value = String(${amount});
    window.__stressFormError = null;
    window.__stressFormPromise = Promise.resolve(window[config.handlerName]({ preventDefault() {} }))
      .catch(error => { window.__stressFormError = String(error && (error.stack || error.message) || error); });
    return true;
  })()`);
}

async function finishCashEdit(station, config, id, description, options = {}) {
  await waitFor(station, `!isVoucherFormBusy(${JSON.stringify(config.modalId)})`, `${config.type} edit completion`, 300000);
  const result = await evaluate(station, `({
    updated: state.vouchers.some(item => item && item.id === ${JSON.stringify(id)} && item.description === ${JSON.stringify(description)}),
    rows: state.vouchers.filter(item => item && item.id === ${JSON.stringify(id)}).length,
    currentDescription: (state.vouchers.find(item => item && item.id === ${JSON.stringify(id)}) || {}).description,
    error: window.__stressFormError
  })`);
  assert.equal(result.error, null, `${station.label} ${config.type} edit rejected`);
  if (options.allowConcurrentWinner) {
    assert.equal(result.rows, 1, `${station.label} ${config.type} conflict must retain exactly one local row`);
    assert.ok(
      options.allowedDescriptions.includes(result.currentDescription),
      `${station.label} ${config.type} conflict resolved to an unexpected value`
    );
  } else {
    assert.equal(result.updated, true, `${station.label} ${config.type} edit was not persisted locally`);
  }
}

async function runDistinctCashEditWave(type, createResults) {
  const config = voucherConfigs[type];
  const descriptions = stations.map(station => `${runId} edit ${type} ${station.label}`);
  await Promise.all(stations.map((station, index) => beginCashEdit(
    station,
    config,
    createResults[index].id,
    descriptions[index],
    2000 + index
  )));
  await Promise.all(stations.map((station, index) => finishCashEdit(
    station,
    config,
    createResults[index].id,
    descriptions[index]
  )));
  await waitAllQuiescent(`${type} distinct edit commit`, 360000);
  await waitForDescriptionsEverywhere(descriptions, `${type} distinct edit convergence`, 360000);
  console.log(`[stress] edit ${type}: ${stationCount}/${stationCount} distinct vouchers converged`);
}

async function waitForOneValueEverywhere(id, allowedDescriptions, label, timeoutMs = 360000) {
  const startedAt = Date.now();
  let previous = '';
  let stableSamples = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const values = await Promise.all(stations.map(station => evaluate(station, `(() => {
      const rows = state.vouchers.filter(item => item && item.id === ${JSON.stringify(id)});
      return { count: rows.length, description: rows[0] && rows[0].description };
    })()`)));
    const descriptions = values.map(value => value.description);
    const candidate = descriptions[0];
    const stable = values.every(value => value.count === 1 && value.description === candidate) &&
      allowedDescriptions.includes(candidate);
    if (stable && candidate === previous) {
      stableSamples += 1;
      if (stableSamples >= 2) return candidate;
    } else {
      previous = candidate || '';
      stableSamples = 0;
    }
    await pullAllIncremental(`${label}-reconcile`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function runSameCashRecordConflict(type, targetId) {
  const config = voucherConfigs[type];
  const descriptions = stations.map(station => `${runId} conflict ${type} ${station.label}`);
  await Promise.all(stations.map((station, index) => beginCashEdit(
    station,
    config,
    targetId,
    descriptions[index],
    3000 + index
  )));
  await Promise.all(stations.map((station, index) => finishCashEdit(
    station,
    config,
    targetId,
    descriptions[index],
    { allowConcurrentWinner: true, allowedDescriptions: descriptions }
  )));
  await waitAllQuiescent(`${type} same-record commit`, 360000);
  const winner = await waitForOneValueEverywhere(targetId, descriptions, `${type} same-record`, 360000);
  console.log(`[stress] conflict ${type}: one row retained; winner=${winner}`);
}

async function createPendingReceiptBeforeCrash() {
  const station = stations[0];
  const config = voucherConfigs.receipt;
  const description = `${runId} pending receipt crash recovery`;
  await evaluate(station, `(() => {
    cloudSyncActive = false;
    supabaseClient = null;
    return true;
  })()`);
  await beginCreate(station, config, description);
  const result = await finishCreate(station, config, description);
  allCreated.push(result);
  const pending = await evaluate(station, `({
    token: localStorage.getItem('rd_accounting_cloud_push_pending'),
    manifest: JSON.parse(localStorage.getItem('rd_accounting_cloud_push_pending_manifest') || 'null'),
    durable: state._pendingCloudWrite,
    checkpoint: state._lastPulledCloudTs,
    datasetIdentity: state._cloudDatasetIdentity
  })`);
  assert.ok(pending.token, 'crash-recovery receipt must leave a durable pending marker');
  assert.ok(pending.manifest && pending.manifest.rowIds.includes(`v_${result.id}`), 'pending manifest must name the unsynced receipt');
  assert.equal(pending.manifest.metadataDirty, false, 'a receipt-only crash manifest must not include unrelated metadata');
  assert.equal(pending.durable && pending.durable.token, pending.token, 'SQLite state must carry the same pending token');
  console.log(`[stress] pending crash state: ${JSON.stringify(pending)}`);

  await stopStation(station, false);
  const measurement = await startStation(station, 'pending-restart');
  assert.equal(measurement.mode, 'incremental', 'pending voucher restart must use incremental startup');
  assert.equal(measurement.snapshotRows, 0, 'pending voucher restart must not download a full snapshot');
  await Promise.all(stations.slice(1).map(item => waitFor(
    item,
    `state.vouchers.some(row => row && row.id === ${JSON.stringify(result.id)} && row.description === ${JSON.stringify(description)})`,
    'pending receipt recovery',
    360000
  )));
  console.log(`[stress] pending receipt recovered after hard crash via ${measurement.mode} startup`);
}

async function cleanupCloudRows() {
  if (!fixturesCreated) return;
  const station = stations.find(item => item.process && item.process.exitCode === null);
  if (!station) return;
  try {
    await evaluate(station, `(async () => {
      const voucherIds = state.vouchers
        .filter(item => item && String(item.description || '').startsWith(${JSON.stringify(runId)}))
        .map(item => item.id);
      voucherIds.forEach(id => trackDeletedIds([id], 'voucher'));
      if (state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)})) {
        trackDeletedIds([${JSON.stringify(partnerId)}], 'partner');
      }
      if (state.products.some(item => item && item.id === ${JSON.stringify(productId)})) {
        trackDeletedIds([${JSON.stringify(productId)}], 'product');
      }
      state.vouchers = state.vouchers.filter(item => !voucherIds.includes(item && item.id));
      state.partners = state.partners.filter(item => item && item.id !== ${JSON.stringify(partnerId)});
      state.products = state.products.filter(item => item && item.id !== ${JSON.stringify(productId)});
      await saveStateAndSyncVoucher();
      return voucherIds.length;
    })()`, 240000);
    await waitFor(
      station,
      `!localStorage.getItem('rd_accounting_cloud_push_pending') &&
        !(state._pendingCloudWrite && state._pendingCloudWrite.token) &&
        !isPushing`,
      'cleanup commit',
      300000
    );
    console.log('[stress] cloud test rows cleaned to tombstones');
  } catch (error) {
    console.warn(`[stress] cleanup warning: ${error.message}`);
  }
}

function summarizeStartup(phase) {
  const rows = startupRuns.filter(item => item.phase === phase);
  const values = key => rows.map(item => Number(item[key]) || 0).sort((a, b) => a - b);
  const percentile = (items, p) => items.length ? items[Math.min(items.length - 1, Math.ceil(items.length * p) - 1)] : 0;
  const shell = values('shellMs');
  const ready = values('readyMs');
  return {
    count: rows.length,
    shell: { min: shell[0] || 0, p50: percentile(shell, 0.5), p95: percentile(shell, 0.95), max: shell[shell.length - 1] || 0 },
    ready: { min: ready[0] || 0, p50: percentile(ready, 0.5), p95: percentile(ready, 0.95), max: ready[ready.length - 1] || 0 },
    modes: rows.reduce((result, item) => {
      result[item.mode || 'unknown'] = (result[item.mode || 'unknown'] || 0) + 1;
      return result;
    }, {}),
    snapshotRows: rows.reduce((sum, item) => sum + (Number(item.snapshotRows) || 0), 0),
    deltaRows: rows.reduce((sum, item) => sum + (Number(item.deltaRows) || 0), 0)
  };
}

async function run() {
  console.log(`[stress] runId=${runId}; stations=${stationCount}; profileRoot=${profileRoot}; profileSeed=${profileSeed || 'none'}`);
  fs.mkdirSync(profileRoot, { recursive: true });
  try {
    const baselineMeasurements = await Promise.all(stations.map(station => startStation(station, 'baseline-start')));
    if (profileSeed) {
      baselineMeasurements.forEach(measurement => {
        if (measurement.mode !== 'incremental' || measurement.snapshotRows !== 0) {
          console.warn(`[stress] ${measurement.station} seed required one safety full reconcile; warm restart remains strict incremental.`);
        }
      });
    }
    const protocols = Array.from(new Set(baselineMeasurements.map(item => item.protocol)));
    console.log(`[stress] real cloud protocol(s): ${protocols.join(', ')}`);
    await createFixtures();

    if (crashRecoveryOnly) {
      await createPendingReceiptBeforeCrash();
      testPassed = true;
      console.log(`[stress-summary] ${JSON.stringify({
        runId,
        stations: stationCount,
        protocols,
        crashRecoveryOnly: true,
        created: allCreated.length,
        baselineStart: summarizeStartup('baseline-start'),
        pendingRestart: summarizeStartup('pending-restart')
      })}`);
      return;
    }

    const waveResults = {};
    for (const type of Object.keys(voucherConfigs)) {
      waveResults[type] = await runCreateWave(type);
    }
    assert.equal(allCreated.length, stationCount * Object.keys(voucherConfigs).length, 'every create wave must retain every voucher');

    await runDistinctCashEditWave('receipt', waveResults.receipt);
    await runDistinctCashEditWave('payment', waveResults.payment);
    await runSameCashRecordConflict('receipt', waveResults.receipt[0].id);
    await runSameCashRecordConflict('payment', waveResults.payment[0].id);

    await Promise.all(stations.map(station => stopStation(station, true)));
    const warmMeasurements = await Promise.all(stations.map(station => startStation(station, 'warm-restart')));
    warmMeasurements.forEach(measurement => {
      assert.equal(measurement.mode, 'incremental', `${measurement.station} warm restart must be incremental`);
      assert.equal(measurement.snapshotRows, 0, `${measurement.station} warm restart must not full-pull rows`);
    });
    await waitForIdsEverywhere(allCreated.map(item => item.id), 'post-restart voucher retention', 360000);

    await createPendingReceiptBeforeCrash();
    testPassed = true;
    const summary = {
      runId,
      stations: stationCount,
      protocols,
      created: allCreated.length,
      expectedBeforeCrashRecovery: stationCount * Object.keys(voucherConfigs).length,
      baselineStart: summarizeStartup('baseline-start'),
      warmRestart: summarizeStartup('warm-restart'),
      pendingRestart: summarizeStartup('pending-restart')
    };
    console.log(`[stress-summary] ${JSON.stringify(summary)}`);
  } catch (error) {
    console.error('[stress] FAIL:', error);
    for (const station of stations) {
      console.error(`[stress] ${station.label} recent app log:\n${station.logs.slice(-80).join('\n')}`);
    }
    throw error;
  } finally {
    await cleanupCloudRows();
    await Promise.all(stations.map(station => stopStation(station, true)));
    if (testPassed) {
      const resolvedProfileRoot = path.resolve(profileRoot);
      const resolvedTemp = path.resolve(os.tmpdir());
      if (resolvedProfileRoot.startsWith(`${resolvedTemp}${path.sep}`) && path.basename(resolvedProfileRoot).startsWith('RD-STRESS-')) {
        fs.rmSync(resolvedProfileRoot, { recursive: true, force: true });
      }
    } else {
      console.error(`[stress] retained failed-run profiles at ${profileRoot}`);
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
