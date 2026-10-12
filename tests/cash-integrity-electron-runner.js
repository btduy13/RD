'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, session, BrowserWindow } = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-cash-integrity-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
// Seed only synthetic data and prevent legacy install-folder import into this profile.
fs.mkdirSync(path.join(profile, 'data'));
new (require('better-sqlite3'))(path.join(profile, 'data', 'rd_local.db')).close();
fs.writeFileSync(path.join(profile, 'data', 'rd_state.json'), JSON.stringify({ products: [], partners: [], vouchers: [], initialBalances: {}, schemaVersion: 4 }));
const timeout = setTimeout(() => { console.error('Runtime integrity timed out'); app.exit(1); }, 60000);
async function main() {
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_r, cb) => cb({ cancel: true }));
  session.defaultSession.setPreloads([path.join(__dirname, 'app-shell-smoke-preload.js')]);
  const created = new Promise(resolve => app.once('browser-window-created', (_e, win) => resolve(win)));
  require('../main.js');
  const win = await created;
  const errors = [];
  win.webContents.on('console-message', (_e, level, text) => {
    if (level >= 3 && !/ERR_FAILED|Failed to load resource|INJECTED|^Check update error:/.test(text)) errors.push(text);
  });
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  await new Promise(resolve => setTimeout(resolve, 1500));
  const run = expression => win.webContents.executeJavaScript(expression, true);
  assert.equal((await run('electronAPI.getDatabaseHealth()')).ok, true);
  assert.equal(await run('cloudSyncSettings.enabled'), false);
  const login = await run(`(async () => {
    showLoginForm(); document.getElementById('login-username').value = 'cash-integrity-test';
    await submitLogin({ preventDefault() {} });
    return getComputedStyle(document.getElementById('login-overlay')).display === 'none';
  })()`);
  assert.equal(login, true);
  await run(`(async () => {
    state.vouchers = []; state.products = [];
    state.partners = [{ id: 'KH-TEST', name: 'Khách thử', type: 'retail' }, { id: 'NCC-TEST', name: 'Nhà cung cấp thử', type: 'supplier' }];
    state.partnerOpeningBalances = { 'KH-TEST': { debit: 0, credit: 200 }, 'NCC-TEST': { debit: 200, credit: 0 }, 'ORPHAN-TEST': { debit: 99, credit: 0 } };
    state.initialBalances = { '111': { type: 'debit', balance: 10000 }, '112': { type: 'debit', balance: 0 }, '131': { type: 'credit', balance: 200 }, '331': { type: 'debit', balance: 200 }, '411': { type: 'credit', balance: 10000 } };
    window.testOpenings = JSON.stringify(state.initialBalances);
    window.testFillCash = (kind, amount) => {
      openModal('modal-add-' + kind);
      const values = { date: '2026-01-01', partner: kind === 'receipt' ? 'KH-TEST' : 'NCC-TEST', debit: kind === 'receipt' ? '111' : '331', credit: kind === 'receipt' ? '131' : '112', amount: String(amount), desc: 'Kiểm thử thu chi' };
      Object.entries(values).forEach(([key, value]) => { document.getElementById(kind + '-' + key).value = value; });
    };
    await saveStateAndSyncVoucher();
  })()`);
  for (const kind of ['receipt', 'payment']) {
    const handler = kind === 'receipt' ? 'handleReceiptSubmit' : 'handlePaymentSubmit';
    const edit = kind === 'receipt' ? 'editReceiptVoucher' : 'editPaymentVoucher';
    const editVar = kind === 'receipt' ? 'editingReceiptId' : 'editingPaymentId';
    const result = await run(`(async () => {
      testFillCash('${kind}', 400);
      const originalSave = window.saveStateAndSyncVoucher;
      window.saveStateAndSyncVoucher = async () => { throw new Error('INJECTED SQLite failure'); };
      try { await ${handler}({ preventDefault() {} }); } finally { window.saveStateAndSyncVoucher = originalSave; }
      const failedCount = state.vouchers.filter(v => v.type === '${kind}').length;
      await ${handler}({ preventDefault() {} });
      const voucher = state.vouchers.find(v => v.type === '${kind}');
      const id = voucher.id;
      ${edit}(id); document.getElementById('${kind}-amount').value = '500';
      window.saveStateAndSyncVoucher = async () => { throw new Error('INJECTED SQLite edit failure'); };
      try { await ${handler}({ preventDefault() {} }); } finally { window.saveStateAndSyncVoucher = originalSave; }
      const failedEditAmount = state.vouchers.find(v => v.id === id).amount;
      const stillEditing = ${editVar} === id;
      await ${handler}({ preventDefault() {} });
      const data = await electronAPI.readStateFile();
      const stored = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
      return { failedCount, failedEditAmount, stillEditing, count: stored.vouchers.filter(v => v.type === '${kind}').length, amount: stored.vouchers.find(v => v.id === id).amount };
    })()`);
    assert.deepEqual(result, { failedCount: 0, failedEditAmount: 400, stillEditing: true, count: 1, amount: 500 });
    console.log('PASS real SQLite cash create/edit/failure/retry', kind);
  }
  const accounting = await run(`(async () => {
    for (const type of ['sales', 'purchase']) state.vouchers.push({ id: type === 'sales' ? 'BH-TEST' : 'MH-TEST', type, date: '2026-01-02', partnerId: type === 'sales' ? 'KH-TEST' : 'NCC-TEST', paymentMethod: type === 'sales' ? '131' : '331', isManual: true, items: [{ productId: 'P', qty: 1, price: 1000, amount: 1000 }] });
    recalculateAccounting(false); await saveStateAndSyncVoucher();
    const debts = calculatePartnerDebts();
    return { remaining: state.vouchers.filter(v => v.type === 'sales' || v.type === 'purchase').map(v => v.remainingDebt), cash: getAccountBalance('111'), bank: getAccountBalance('112'), customer: debts.find(p => p.id === 'KH-TEST').closingDebit, supplier: debts.find(p => p.id === 'NCC-TEST').closingCredit, openings: JSON.stringify(state.initialBalances) === testOpenings };
  })()`);
  assert.deepEqual(accounting, { remaining: [300, 300], cash: 10500, bank: -500, customer: 300, supplier: 300, openings: true });
  console.log('PASS real renderer cash/debt/ledger balances', JSON.stringify(accounting));
  // Exercise the startup migration again, then reload from the actual SQLite IPC.
  const fillCashSource = await run('testFillCash.toString()');
  await run("localStorage.removeItem('rd_migrations_279_done')");
  const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  win.reload(); await loaded;
  await new Promise(resolve => setTimeout(resolve, 1200));
  await run(`window.testFillCash = (${fillCashSource}); void 0`);
  const reloaded = await run(`({ count: state.vouchers.length, orphan: state.partnerOpeningBalances['ORPHAN-TEST'].debit, equity: state.initialBalances['411'].balance, remaining: state.vouchers.filter(v => v.type === 'sales' || v.type === 'purchase').map(v => v.remainingDebt) })`);
  assert.deepEqual(reloaded, { count: 4, orphan: 99, equity: 10000, remaining: [300, 300] });
  console.log('PASS SQLite reload and startup migration preserve vouchers/openings');
  const deleted = await run(`(async () => {
    for (const kind of ['receipt', 'payment']) {
      const v = state.vouchers.find(v => v.type === kind);
      const pending = deleteVoucher(v.id);
      document.getElementById('custom-confirm-btn-ok').click(); await pending;
    }
    const result = await electronAPI.readStateFile(); const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
    return { count: data.vouchers.length, remaining: data.vouchers.map(v => v.remainingDebt), cash: getAccountBalance('111'), bank: getAccountBalance('112') };
  })()`);
  assert.deepEqual(deleted, { count: 2, remaining: [800, 800], cash: 10000, bank: 0 });
  console.log('PASS cash delete reverses debt and persists SQLite');
  const deleteRetry = await run(`(async () => {
    testFillCash('receipt', 100); await handleReceiptSubmit({ preventDefault() {} });
    testFillCash('payment', 100); await handlePaymentSubmit({ preventDefault() {} });
    const cashIds = state.vouchers.filter(v => ['receipt','payment'].includes(v.type)).map(v => v.id);
    const originalSave = window.saveStateAndSyncVoucher;
    window.saveStateAndSyncVoucher = async () => {
      state.vouchers.push({ id:'CONCURRENT-TEST', type:'receipt', partnerId:'KH-TEST', date:'2026-01-03', amount:1, entries:[{debit:'111',credit:'131',amount:1}] });
      throw new Error('INJECTED delete failure');
    };
    try {
      const pending = deleteVoucher(cashIds[0]);
      document.getElementById('custom-confirm-btn-ok').click(); await pending;
    } finally { window.saveStateAndSyncVoucher = originalSave; }
    const singleRestored = state.vouchers.some(v => v.id === cashIds[0]);
    const concurrentPreserved = state.vouchers.some(v => v.id === 'CONCURRENT-TEST');
    const singleTombstoneCleared = !cloudSyncPendingDeletionKeys.has('v_' + cashIds[0]);
    document.querySelectorAll('.cash-checkbox').forEach(cb => { cb.checked = false; });
    const checks = cashIds.map(id => { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'cash-checkbox'; cb.value = id; cb.checked = true; document.body.appendChild(cb); return cb; });
    window.saveStateAndSyncVoucher = async () => { throw new Error('INJECTED batch delete failure'); };
    try {
      const pending = batchDeleteCash(); document.getElementById('custom-confirm-btn-ok').click(); await pending;
    } finally { window.saveStateAndSyncVoucher = originalSave; }
    const restored = cashIds.every(id => state.vouchers.some(v => v.id === id));
    const markersCleared = cashIds.every(id => !cloudSyncPendingDeletionKeys.has('v_' + id) && !(state.deletedCloudKeys || []).includes('v_' + id));
    checks.forEach(cb => { cb.checked = true; });
    const pending = batchDeleteCash(); document.getElementById('custom-confirm-btn-ok').click(); await pending;
    checks.forEach(cb => cb.remove());
    const result = await electronAPI.readStateFile(); const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
    return { singleRestored, concurrentPreserved, singleTombstoneCleared, restored, markersCleared, deleted: cashIds.every(id => !data.vouchers.some(v => v.id === id)), unrelated: data.vouchers.some(v => v.id === 'CONCURRENT-TEST') };
  })()`);
  assert.deepEqual(deleteRetry, { singleRestored:true, concurrentPreserved:true, singleTombstoneCleared:true, restored:true, markersCleared:true, deleted:true, unrelated:true });
  console.log('PASS single/batch deletion failure clears tombstones and preserves concurrent vouchers');
  assert.deepEqual(errors, [], 'no unexpected renderer errors');
  await new Promise(resolve => setTimeout(resolve, 1200));
  fs.mkdirSync(path.join(__dirname, '..', 'diagnostics'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'diagnostics', 'cash-integrity-runtime.png'), (await win.webContents.capturePage()).toPNG());
  console.log('PASS actual main.js/preload.js/Electron/SQLite runtime; isolated profile:', profile);
  clearTimeout(timeout); app.exit(0);
}
main().catch(err => { console.error(err); clearTimeout(timeout); app.exit(1); });
