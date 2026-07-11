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
