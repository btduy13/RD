'use strict';

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadScripts() {
  const sandbox = { window: {}, console, JSON, Math, Date, removeAccents: (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '') };
  const files = [
    'js/core/partner-identity.js',
    'js/core/partner-merge.js'
  ];
  files.forEach((rel) => {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), sandbox);
  });
  return sandbox.window;
}

function testPartnerIdentity() {
  const api = loadScripts();
  assert.equal(api.getPartnerGroupKey('Green Home (KHT02/2023R)'), 'green-home-khong-gian-xanh');
  assert.equal(api.getPartnerGroupKey('Cty Không Gian Xanh (KH7974T02/2026)'), 'green-home-khong-gian-xanh');
  assert.equal(api.getPartnerGroupDisplayName('Cty Không Gian Xanh (KH7974T02/2026)'), 'Green Home / Không Gian Xanh');
  assert.notEqual(api.getPartnerGroupKey('Anh Minh (KH7507T10/2024)'), 'green-home-khong-gian-xanh');

  const partners = [
    { id: 'GH1', name: 'Green Home (KHT02/2023R)', type: 'enterprise' },
    { id: 'KGX1', name: 'Cty Không Gian Xanh (KH7974T02/2026)', type: 'customer' }
  ];
  assert.equal(api.findPartnerByIdentity('Green Home', partners).id, 'GH1');
  assert.equal(api.findPartnerByIdentity('Không Gian Xanh', partners).id, 'GH1');
  console.log('partner-identity tests passed');
}

function testPartnerMerge() {
  const sandbox = {
    window: {},
    console,
    JSON,
    Math,
    Date,
    removeAccents: (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    state: {
      partners: [
        { id: 'GH1', name: 'Green Home (KHT02/2023R)', type: 'customer' },
        { id: 'KGX1', name: 'Cty Không Gian Xanh (KH7974T02/2026)', type: 'customer' },
        { id: 'OTHER', name: 'Anh Minh', type: 'customer' }
      ],
      vouchers: [
        { id: 'BH1', partnerId: 'KGX1', partnerName: 'Cty Không Gian Xanh (KH7974T02/2026)' },
        { id: 'BH2', partnerId: 'OTHER', partnerName: 'Anh Minh' }
      ],
      partnerOpeningBalances: {
        GH1: { debit: 100, credit: 0 },
        KGX1: { debit: 50, credit: 0 }
      },
      partnerOpeningBalanceTs: {}
    },
    deleted: [],
    trackDeletedIds(ids) { sandbox.deleted = ids; },
    invalidatePartnerCache() {},
    invalidateAccounting() {},
    recalced: false,
    saved: false,
    recalculateAccounting() { sandbox.recalced = true; },
    saveState() { sandbox.saved = true; },
    touchEntityUpdatedAt(v) { v._updatedAt = Date.now(); }
  };

  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js/core/partner-identity.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js/core/partner-merge.js'), 'utf8'), sandbox);

  const result = sandbox.mergePartnerRecords('KGX1', 'GH1', { recalculate: false });
  assert.equal(result.ok, true);
  assert.equal(result.voucherCount, 1);
  assert.equal(sandbox.state.vouchers[0].partnerId, 'GH1');
  assert.equal(sandbox.state.partners.length, 2);
  assert.equal(sandbox.state.partnerOpeningBalances.GH1.debit, 150);
  console.log('partner-merge tests passed');
}

testPartnerIdentity();
testPartnerMerge();
console.log('partner merge regression tests passed');
