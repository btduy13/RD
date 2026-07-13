'use strict';

const assert = require('assert');
const {
  isAllowedExternalUrl,
  isAllowedUpdateRequestUrl,
  isAllowedUpdateRedirectUrl
} = require('../js/core/url-security');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadCoreScript(relativePath, extraGlobals) {
  const code = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const sandbox = { window: {}, console, JSON, Math, Date, Set, Map, parseFloat, parseInt, Number, String, Array, Object, isNaN: Number.isNaN };
  Object.assign(sandbox, extraGlobals || {});
  vm.runInNewContext(code, sandbox);
  return sandbox.window;
}

function testStateDiff() {
  const core = loadCoreScript('js/core/state-diff.js');
  const prev = { id: 'BH1', type: 'sales', totalAmount: 100, note: 'a', _updatedAt: 1 };
  const same = { id: 'BH1', type: 'sales', totalAmount: 100, note: 'a', _updatedAt: 1 };
  const changedNote = { id: 'BH1', type: 'sales', totalAmount: 100, note: 'b', _updatedAt: 1 };

  assert.equal(core.entityChanged(prev, same, 'voucher'), false);
  assert.equal(core.entityChanged(prev, changedNote, 'voucher'), true);

  const lastSavedState = {
    companyName: 'A',
    taxCode: '',
    address: '',
    accountingStandard: 'TT200',
    initialBalances: {},
    partnerOpeningBalances: {},
    partnerOpeningBalanceTs: {},
    deletedIds: [],
    deletedCloudKeys: [],
    cashEntries: [],
    escrowItems: [],
    salesTemplatesData: [],
    users: [],
    vouchers: new Map([['BH1', prev]]),
    products: new Map(),
    partners: new Map()
  };

  const state = {
    companyName: 'A',
    vouchers: [changedNote],
    products: [],
    partners: []
  };

  const diff = core.buildStateDelta(state, lastSavedState);
  assert.equal(diff.hasChanges, true);
  assert.equal(diff.delta.vouchers.upsert.length, 1);

  const deletionState = {
    vouchers: [{ id: 'SHARED' }, { id: 'ACTIVE-V' }],
    products: [{ id: 'ACTIVE-P' }],
    partners: [{ id: 'ACTIVE-PART' }],
    cashEntries: [{ id: 'ACTIVE-CASH' }],
    escrowItems: [{ id: 'ACTIVE-ESCROW' }],
    deletedIds: ['SHARED', 'GONE'],
    deletedCloudKeys: [
      'p_SHARED', 'v_ACTIVE-V', 'p_ACTIVE-P', 'part_ACTIVE-PART',
      'cash_ACTIVE-CASH', 'escrow_ACTIVE-ESCROW', 'SHARED', 'part_GONE'
    ]
  };
  core.pruneResolvedDeletionMarkers(deletionState);
  assert.deepEqual(Array.from(deletionState.deletedIds), ['GONE']);
  assert.deepEqual(
    Array.from(deletionState.deletedCloudKeys),
    ['p_SHARED', 'part_GONE'],
    'typed tombstones must survive unrelated active entities with the same raw ID'
  );
  console.log('state-diff tests passed');
}

function testAccountingEngine() {
  const core = loadCoreScript('js/core/accounting-engine.js');
  const state = {
    _lastModified: 100,
    _accountingValid: true,
    _accountingValidTs: 200,
    _recalcWatermark: { voucherCount: 1, productCount: 0, lastModified: 100, maxVoucherUpdatedAt: 0 },
    vouchers: [{ id: 'BH1', _updatedAt: 0 }],
    products: []
  };

  assert.equal(core.shouldSkipFullRecalc(state, false, false), true);
  assert.equal(core.shouldSkipFullRecalc(state, true, false), false);
  assert.equal(core.shouldSkipFullRecalc(state, false, true), false);

  state._lastModified = 300;
  assert.equal(core.shouldSkipFullRecalc(state, false, false), false);

  core.markAccountingValid(state);
  assert.equal(state._accountingValid, true);
  assert.ok(state._recalcWatermark);

  const products = [{ id: 'P1', initialStock: 10, initialCost: 100 }];
  const vouchers = [
    {
      id: 'NK1', type: 'purchase', date: '2026-01-02',
      items: [
        { productId: 'P1', qty: 2, price: 200, amount: 400 },
        { productId: 'P1', qty: 3, price: 300, amount: 900 }
      ]
    },
    { id: 'BH1', type: 'sales', date: '2026-01-03', items: [{ productId: 'P1', qty: 5, cogsAmount: 767 }] },
    { id: 'TL1', type: 'purchase_return', date: '2026-01-04', items: [{ productId: 'P1', qty: 1, cogsAmount: 153 }] },
    { id: 'BTL1', type: 'sales_return', date: '2026-01-05', items: [{ productId: 'P1', qty: 1, cogsAmount: 153 }] },
    { id: 'DK1', type: 'inventory_adjust', date: '2026-01-06', items: [{ productId: 'P1', qty: 1, amount: 153, adjustDir: 'out' }] }
  ];
  assert.equal(core.calculateInventoryValueAt(products, vouchers, '2026-01-02'), 2300, 'all repeated product lines must affect historical inventory');
  assert.equal(core.calculateInventoryValueAt(products, vouchers, '2026-01-04'), 1380, 'purchase returns must reduce historical inventory value');
  assert.equal(core.calculateInventoryValueAt(products, vouchers, '2026-01-06'), 1380, 'returns and adjustments must follow accounting directions');
  console.log('accounting-engine tests passed');
}

function testUrlSecurity() {
  assert.equal(isAllowedExternalUrl('https://example.com/help'), true);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe'), false);

  assert.equal(isAllowedUpdateRequestUrl('https://github.com/btduy13/RD/releases/latest'), true);
  assert.equal(isAllowedUpdateRequestUrl('https://github.com/btduy13/RD/releases/download/v3/app.exe'), true);
  assert.equal(isAllowedUpdateRequestUrl('http://github.com/btduy13/RD/releases/latest'), false);
  assert.equal(isAllowedUpdateRequestUrl('https://github.com/attacker/repo/releases/download/app.exe'), false);
  assert.equal(isAllowedUpdateRequestUrl('https://release-assets.githubusercontent.com/arbitrary.exe'), false);

  assert.equal(isAllowedUpdateRedirectUrl('https://release-assets.githubusercontent.com/signed-asset'), true);
  assert.equal(isAllowedUpdateRedirectUrl('https://objects.githubusercontent.com/github-production-release-asset'), true);
  assert.equal(isAllowedUpdateRedirectUrl('https://evil.example/update.exe'), false);
  console.log('URL security tests passed');
}

testStateDiff();
testAccountingEngine();
testUrlSecurity();
console.log('core regression tests passed');
