'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPartners({ vouchers = [], balances = {}, selected = [], confirmed = true } = {}) {
  const calls = { confirm: 0, save: 0, sync: 0, deleted: [], toasts: [] };
  const checkboxes = selected.map(value => ({ value, checked: true }));
  const sandbox = {
    console,
    state: {
      partners: [
        { id: 'KEEP', name: 'Khách đang theo dõi', type: 'retail' },
        { id: 'FREE', name: 'Khách chưa giao dịch', type: 'retail' }
      ],
      vouchers: JSON.parse(JSON.stringify(vouchers)),
      partnerOpeningBalances: JSON.parse(JSON.stringify(balances)),
      partnerOpeningBalanceTs: { KEEP: 123, FREE: 456 },
      deletedIds: ['PREVIOUS'],
      deletedCloudKeys: ['part_PREVIOUS']
    },
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll(selector) { return selector === '.partner-checkbox' ? checkboxes : []; }
    },
    showToast(...args) { calls.toasts.push(args); },
    async showConfirmModal() { calls.confirm++; return confirmed; },
    saveState() { calls.save++; return true; },
    async saveStateAndSyncVoucher() { calls.sync++; return true; },
    trackDeletedIds(ids, type) {
      calls.deleted.push({ ids: Array.from(ids), type });
      sandbox.state.deletedIds.push(...ids);
      sandbox.state.deletedCloudKeys.push(...ids.map(id => `part_${id}`));
    },
    initExcelIntegration() {},
    filterDebts() {},
    resetBatchSelectionUI() {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/modules/partners.js'), 'utf8'), sandbox);
  // Keep real deletion functions; rendering is outside this persistence guard test.
  sandbox.filterPartners = () => {};
  sandbox.updateBatchPartnersUI = () => {};
  return { sandbox, calls };
}

async function expectBlocked(options, batch, label) {
  const { sandbox, calls } = loadPartners(options);
  const before = JSON.stringify(sandbox.state);
  if (batch) await sandbox.batchDeletePartners();
  else await sandbox.deletePartner('KEEP');
  assert.strictEqual(JSON.stringify(sandbox.state), before, `${label}: preserve all state and tombstones`);
  assert.strictEqual(calls.confirm, 0, `${label}: reject before confirmation`);
  assert.strictEqual(calls.save + calls.sync, 0, `${label}: no persistence`);
  assert.deepStrictEqual(calls.deleted, [], `${label}: no deletion markers`);
  assert.ok(calls.toasts.length > 0, `${label}: explain why deletion is blocked`);
}

async function run() {
  await expectBlocked({ vouchers: [{ id: 'BH1', type: 'sales', partnerId: 'KEEP', totalAmount: 0 }] }, false,
    'single partner with linked zero-value sale');
  await expectBlocked({ vouchers: [{ id: 'PT1', type: 'receipt', partnerId: 'KEEP', amount: 50 }] }, false,
    'single partner with linked receipt');

  for (const balance of [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }, { debit: 100, credit: 100 }]) {
    const label = `opening balance ${JSON.stringify(balance)}`;
    await expectBlocked({ balances: { KEEP: balance } }, false, `single ${label}`);
    await expectBlocked({ balances: { KEEP: balance }, selected: ['FREE', 'KEEP'] }, true, `batch ${label}`);
  }

  await expectBlocked({
    vouchers: [{ id: 'BH1', type: 'sales', partnerId: 'KEEP', totalAmount: 100 }],
    selected: ['FREE', 'KEEP']
  }, true, 'mixed batch containing linked partner');

  for (const batch of [false, true]) {
    const { sandbox, calls } = loadPartners({
      vouchers: [{ id: 'BH1', type: 'sales', partnerId: 'KEEP', totalAmount: 100 }],
      balances: { FREE: { debit: 0, credit: 0 } },
      selected: ['FREE']
    });
    if (batch) await sandbox.batchDeletePartners();
    else await sandbox.deletePartner('FREE');
    assert.deepStrictEqual(Array.from(sandbox.state.partners, p => p.id), ['KEEP'], 'safe deletion removes only selected free partner');
    assert.strictEqual(sandbox.state.vouchers[0].partnerId, 'KEEP', 'unselected linked partner stays intact');
    assert.strictEqual(calls.confirm, 1, 'safe deletion asks for confirmation');
    assert.ok(calls.save + calls.sync > 0, 'safe deletion persists');
    assert.deepStrictEqual(calls.deleted, [{ ids: ['FREE'], type: 'partner' }], 'safe deletion tracks exact partner');
    assert.strictEqual(sandbox.state.partnerOpeningBalances.FREE, undefined, 'safe deletion removes zero opening balance');
  }

  const cancelled = loadPartners({ selected: ['FREE'], confirmed: false });
  const beforeCancel = JSON.stringify(cancelled.sandbox.state);
  await cancelled.sandbox.batchDeletePartners();
  assert.strictEqual(JSON.stringify(cancelled.sandbox.state), beforeCancel, 'cancel preserves free partner');
  assert.strictEqual(cancelled.calls.save + cancelled.calls.sync, 0, 'cancel does not persist');
  assert.deepStrictEqual(cancelled.calls.deleted, [], 'cancel creates no tombstones');

  console.log('partner-deletion-tests.js: all tests passed');
}

run().catch(error => {
  console.error('partner-deletion-tests.js FAILED:', error);
  process.exitCode = 1;
});
