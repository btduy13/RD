'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const station = String(process.env.RD_STATION || process.argv[2] || '').toUpperCase();
const runId = String(process.env.RD_DISTRIBUTED_RUN_ID || process.argv[3] || `RD-DIST-${Date.now()}`);
const peerStation = station === 'A' ? 'B' : 'A';
const debugPort = Number(process.env.RD_DEBUG_PORT || 19500);
const appRoot = path.resolve(__dirname, '..');
const userDataDir = path.join(os.tmpdir(), `rd-distributed-${runId}-${station}`);
const partnerId = `${runId}-PART`;
const productId = `${runId}-PROD`;
const electronPath = require('electron');
const appLog = [];
let appProcess = null;

if (!['A', 'B'].includes(station)) {
  throw new Error('RD_STATION must be A or B');
}

function recordAppLog(chunk) {
  const lines = String(chunk || '').split(/\r?\n/).filter(Boolean);
  appLog.push(...lines);
  if (appLog.length > 300) appLog.splice(0, appLog.length - 300);
}

async function debuggerUrl() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
  const pages = await response.json();
  const page = pages.find(item => item.type === 'page' && !String(item.url || '').startsWith('devtools://'));
  if (!page) throw new Error(`No Electron page on port ${debugPort}`);
  return page.webSocketDebuggerUrl;
}

async function evaluate(expression, timeoutMs = 90000) {
  const ws = new WebSocket(await debuggerUrl());
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
    const timer = setTimeout(() => reject(new Error(`CDP evaluation timeout on ${debugPort}`)), timeoutMs);
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

function isTransientAppError(error) {
  const message = `${String(error && error.message || error)} ${String(error && error.cause || '')}`;
  return ['ReferenceError', 'Cannot access', 'fetch failed', 'ECONNREFUSED', 'No Electron page', 'WebSocket'].some(token => message.includes(token));
}

async function waitFor(expression, label, timeoutMs = 180000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(`Boolean(${expression})`)) {
        console.log(`[distributed:${station}] ${label}: ${Date.now() - started}ms`);
        return;
      }
      lastError = null;
    } catch (error) {
      if (!isTransientAppError(error)) throw error;
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const detail = lastError ? `; last error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}${detail}`);
}

async function startApp() {
  fs.mkdirSync(userDataDir, { recursive: true });
  const localDataDir = path.join(userDataDir, 'data');
  const localDbPath = path.join(localDataDir, 'rd_local.db');
  fs.mkdirSync(localDataDir, { recursive: true });
  if (!fs.existsSync(localDbPath)) fs.writeFileSync(localDbPath, '');
  appProcess = spawn(electronPath, [
    '.',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu'
  ], {
    cwd: appRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  appProcess.stdout.on('data', recordAppLog);
  appProcess.stderr.on('data', recordAppLog);
  appProcess.on('exit', code => console.log(`[distributed:${station}] Electron exited (${code})`));

  await waitFor(
    `typeof isStartupPullCompleted !== 'undefined' && isStartupPullCompleted &&
      typeof cloudWriteGate !== 'undefined' && cloudWriteGate.getStatus().status === 'ready'`,
    'startup cloud reconciliation',
    240000
  );
  await waitFor(
    `!isPulling && !isPushing && !pushPending && !pullPending &&
      !localStorage.getItem('rd_accounting_cloud_push_pending')`,
    'startup quiescent',
    180000
  );
}

async function stopApp() {
  if (!appProcess || appProcess.exitCode !== null) return;
  try {
    await evaluate('window.close(); true', 10000);
  } catch (error) {
    if (!isTransientAppError(error)) console.warn(`[distributed:${station}] graceful close warning: ${error.message}`);
  }
  const exited = await Promise.race([
    new Promise(resolve => appProcess.once('exit', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), 15000))
  ]);
  if (!exited && appProcess.exitCode === null) appProcess.kill();
  appProcess = null;
}

function markerId(stage, targetStation = station) {
  return `${runId}-MARK-${stage}-${targetStation}`;
}

async function publishMarker(stage) {
  const id = markerId(stage);
  await evaluate(`(async () => {
    const id = ${JSON.stringify(id)};
    if (!state.partners.some(item => item && item.id === id)) {
      state.partners.push({ id, name: id, address: 'distributed-e2e', _updatedAt: Date.now(), _sessionId: clientSessionId });
    }
    await saveStateAndSyncVoucher();
    return true;
  })()`);
}

async function barrier(stage, timeoutMs = 720000) {
  await publishMarker(stage);
  const ids = JSON.stringify([markerId(stage, 'A'), markerId(stage, 'B')]);
  await waitFor(`${ids}.every(id => state.partners.some(item => item && item.id === id))`, `${stage} barrier`, timeoutMs);
}

async function ensureSharedFixtures() {
  if (station === 'A') {
    await evaluate(`(async () => {
      if (!state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)})) {
        state.partners.push({ id: ${JSON.stringify(partnerId)}, name: 'Distributed E2E Partner', address: 'GitHub Windows runners', _updatedAt: Date.now(), _sessionId: clientSessionId });
      }
      if (!state.products.some(item => item && item.id === ${JSON.stringify(productId)})) {
        state.products.push({ id: ${JSON.stringify(productId)}, name: 'Distributed E2E Product', unit: 'piece', stock: 1000, avgCost: 1, totalValue: 1000, salePrice1: 1, _updatedAt: Date.now(), _sessionId: clientSessionId });
      }
      await saveStateAndSyncVoucher();
      return true;
    })()`);
  }
  await waitFor(
    `state.partners.some(item => item && item.id === ${JSON.stringify(partnerId)}) &&
      state.products.some(item => item && item.id === ${JSON.stringify(productId)})`,
    'shared partner and product',
    720000
  );
  await barrier('fixtures-ready');
}

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
  receipt: {
    kind: 'cash', type: 'receipt', formId: 'form-receipt', modalId: 'modal-add-receipt', resetName: 'resetReceiptForm', handlerName: 'handleReceiptSubmit',
    dateField: 'receipt-date', partnerField: 'receipt-partner', debitField: 'receipt-debit', creditField: 'receipt-credit', amountField: 'receipt-amount',
    descField: 'receipt-desc', debit: '111', credit: '131'
  },
  payment: {
    kind: 'cash', type: 'payment', formId: 'form-payment', modalId: 'modal-add-payment', resetName: 'resetPaymentForm', handlerName: 'handlePaymentSubmit',
    dateField: 'payment-date', partnerField: 'payment-partner', debitField: 'payment-debit', creditField: 'payment-credit', amountField: 'payment-amount',
    descField: 'payment-desc', debit: '331', credit: '111'
  }
};

async function submitVoucher(config) {
  const description = `${runId} distributed ${config.type} station ${station}`;
  const payload = JSON.stringify(config);
  await evaluate(`(() => {
    const config = ${payload};
    window[config.resetName]();
    if (config.kind === 'cash') document.getElementById(config.formId).reset();
    else clearActiveFormDraft(config.formId);
    openModal(config.modalId);
    if (config.idField) document.getElementById(config.idField).value = '';
    document.getElementById(config.partnerField).value = 'Distributed E2E Partner (${partnerId})';
    document.getElementById(config.dateField).value = '2026-07-22';
    document.getElementById(config.descField).value = ${JSON.stringify(description)};
    if (config.kind === 'cash') {
      document.getElementById(config.debitField).value = config.debit;
      document.getElementById(config.creditField).value = config.credit;
      document.getElementById(config.amountField).value = '1';
    } else {
      document.getElementById(config.paymentField).value = config.payment;
      if (config.taxField) document.getElementById(config.taxField).value = '0';
      replaceDynamicFormTableRows(config.tbodyId, [{ productId: ${JSON.stringify(productId)}, desc: 'Distributed line', qty: 1, price: 1, discount: 0 }]);
    }
    window.__distributedFormError = null;
    window.__distributedFormPromise = Promise.resolve(window[config.handlerName]({ preventDefault() {} }))
      .catch(error => { window.__distributedFormError = String(error && (error.stack || error.message) || error); });
    return true;
  })()`);
  await waitFor(`!isVoucherFormBusy(${JSON.stringify(config.modalId)})`, `${config.type} form completion`, 120000);
  const result = await evaluate(`(() => {
    const voucher = state.vouchers.find(item => item && item.type === ${JSON.stringify(config.type)} && item.description === ${JSON.stringify(description)});
    return {
      id: voucher && voucher.id,
      error: window.__distributedFormError,
      modal: document.getElementById(${JSON.stringify(config.modalId)}).style.display
    };
  })()`);
  assert.equal(result.error, null, `${config.type} form on station ${station} must not reject`);
  assert.ok(result.id, `${config.type} form on station ${station} must persist a voucher`);
  assert.equal(result.modal, 'none', `${config.type} form on station ${station} must close only after persistence completes`);
  await waitFor(`!localStorage.getItem('rd_accounting_cloud_push_pending') && !isPushing`, `${config.type} cloud commit`, 120000);
  console.log(`[distributed:${station}] created ${config.type} ${result.id}`);
  return result.id;
}

async function runVoucherRound(type) {
  await barrier(`${type}-ready`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await submitVoucher(voucherConfigs[type]);
  await barrier(`${type}-saved`);
  const descriptions = JSON.stringify([
    `${runId} distributed ${type} station A`,
    `${runId} distributed ${type} station B`
  ]);
  await waitFor(
    `${descriptions}.every(description => state.vouchers.some(item => item && item.type === ${JSON.stringify(type)} && item.description === description))`,
    `both distributed ${type} vouchers`,
    180000
  );
}

async function assertAllDistributedVouchers(label) {
  const expected = JSON.stringify(['sales', 'purchase', 'receipt', 'payment'].flatMap(type => [
    { type, description: `${runId} distributed ${type} station A` },
    { type, description: `${runId} distributed ${type} station B` }
  ]));
  await waitFor(
    `${expected}.every(expected => state.vouchers.some(item => item && item.type === expected.type && item.description === expected.description))`,
    label,
    240000
  );
  const ids = await evaluate(`state.vouchers.filter(item => item && String(item.description || '').startsWith(${JSON.stringify(`${runId} distributed`)})).map(item => item.id)`);
  assert.equal(new Set(ids).size, 8, `${label}: all eight distributed vouchers must have unique IDs`);
}

async function cleanupDistributedRows() {
  if (station === 'A') {
    await evaluate(`(async () => {
      const voucherIds = state.vouchers
        .filter(item => item && String(item.description || '').startsWith(${JSON.stringify(`${runId} distributed`)}))
        .map(item => item.id);
      const partnerIds = state.partners
        .filter(item => item && String(item.id || '').startsWith(${JSON.stringify(runId)}))
        .map(item => item.id);
      voucherIds.forEach(id => trackDeletedIds([id], 'voucher'));
      partnerIds.forEach(id => trackDeletedIds([id], 'partner'));
      if (state.products.some(item => item && item.id === ${JSON.stringify(productId)})) trackDeletedIds([${JSON.stringify(productId)}], 'product');
      state.vouchers = state.vouchers.filter(item => !voucherIds.includes(item && item.id));
      state.partners = state.partners.filter(item => !partnerIds.includes(item && item.id));
      state.products = state.products.filter(item => item && item.id !== ${JSON.stringify(productId)});
      await saveStateAndSyncVoucher();
      return { voucherIds, partnerIds };
    })()`, 120000);
  }
  await waitFor(
    `!state.vouchers.some(item => item && String(item.description || '').startsWith(${JSON.stringify(`${runId} distributed`)})) &&
      !state.partners.some(item => item && String(item.id || '').startsWith(${JSON.stringify(runId)})) &&
      !state.products.some(item => item && item.id === ${JSON.stringify(productId)})`,
    'distributed cleanup',
    240000
  );
}

async function run() {
  console.log(`[distributed:${station}] runId=${runId}; peer=${peerStation}; userData=${userDataDir}`);
  try {
    await startApp();
    const protocol = await evaluate(`({ versioned: cloudUsesVersionedRpc, vouchers: state.vouchers.length })`);
    console.log(`[distributed:${station}] protocol=${protocol.versioned ? 'v3-transactional' : 'legacy'}; vouchers=${protocol.vouchers}`);
    await ensureSharedFixtures();
    for (const type of ['sales', 'purchase', 'receipt', 'payment']) {
      await runVoucherRound(type);
    }
    await evaluate(`pullAndMergeFromCloud({ reason: 'distributed-final-full', force: true, forceFull: true })`, 180000);
    await assertAllDistributedVouchers('all vouchers after full cloud reconcile');
    await barrier('before-restart');

    await stopApp();
    await startApp();
    await assertAllDistributedVouchers('all vouchers after real Electron restart');
    await barrier('after-restart');
    // Do not let station A delete the barrier markers before station B has
    // observed them. Both stations must explicitly enter cleanup first.
    await barrier('cleanup-ready');
    await cleanupDistributedRows();
    console.log(`[distributed:${station}] PASS: two separate Windows runners retained 8/8 vouchers through sync, full reconcile and restart`);
  } catch (error) {
    console.error(`[distributed:${station}] FAIL:`, error);
    console.error(`[distributed:${station}] recent Electron log:\n${appLog.slice(-100).join('\n')}`);
    throw error;
  } finally {
    await stopApp();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
