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
  assert.equal(
    api.findPartnerByIdentity('Công ty Không Gian Xanh (KH8159T09/2026)', partners),
    null,
    'a new coded project must not resolve to the generic enterprise'
  );
  assert.equal(
    api.findPartnerByIdentity('Cty Không Gian Xanh (KH7974T02/2026)', partners).id,
    'KGX1',
    'an existing coded project still resolves by its exact normalized name'
  );
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
        { id: 'GH1', name: 'Green Home (KHT02/2023R)', type: 'enterprise' },
        { id: 'KGX1', name: 'Cty Không Gian Xanh (KH7974T02/2026)', type: 'enterprise' },
        { id: 'OTHER', name: 'Anh Minh', type: 'project', parentId:'KGX1' },
        { id: 'KL9', name: 'Khách lẻ', type: 'retail' },
        { id: 'NCC9', name: 'NCC', type: 'supplier' }
      ],
      vouchers: [
        { id: 'BH1', partnerId: 'KGX1', partnerName: 'Cty Không Gian Xanh (KH7974T02/2026)' },
        { id: 'BH2', partnerId: 'OTHER', partnerName: 'Anh Minh' }
      ],
      partnerOpeningBalances: {
        GH1: { debit: '100', credit: 0 },
        KGX1: { debit: '50', credit: 0 }
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

  const before = Date.now();
  const result = sandbox.mergePartnerRecords('KGX1', 'GH1', { recalculate: false });
  assert.equal(result.ok, true);
  assert.equal(result.voucherCount, 1);
  assert.equal(sandbox.state.vouchers[0].partnerId, 'GH1');
  assert.equal(sandbox.state.partners.length, 4);
  assert.equal(sandbox.state.partnerOpeningBalances.GH1.debit, 150);
  assert.ok(sandbox.state.partnerOpeningBalanceTs.GH1 >= before);
  assert.ok(sandbox.state.partnerOpeningBalanceTs.KGX1 >= before);
  assert.equal(sandbox.state.partners.find(p => p.id === 'OTHER').parentId, 'GH1');

  // Công trình con không được treo vào khách lẻ
  const toRetail = sandbox.mergePartnerRecords('GH1', 'KL9', { recalculate: false });
  assert.equal(toRetail.ok, false, 'enterprise with projects cannot merge into a retail customer');
  assert.equal(sandbox.state.partners.find(p => p.id === 'OTHER').parentId, 'GH1', 'children untouched on refusal');
  // Số dư 131 của khách không được cộng vào phía 331 của NCC
  const toSupplier = sandbox.mergePartnerRecords('GH1', 'NCC9', { recalculate: false });
  assert.equal(toSupplier.ok, false);
  assert.equal(sandbox.state.partnerOpeningBalances.GH1.debit, 150, 'opening untouched on refusal');
  // Mã có khoảng trắng thừa trên chứng từ vẫn được chuyển
  sandbox.state.vouchers.push({ id: 'BH3', partnerId: ' KL9 ', partnerName: 'Khách lẻ' });
  sandbox.state.partners.push({ id: 'KL10', name: 'Khách lẻ 10', type: 'retail' });
  const padded = sandbox.mergePartnerRecords('KL9', 'KL10', { recalculate: false });
  assert.equal(padded.ok, true);
  assert.equal(sandbox.state.vouchers.find(v => v.id === 'BH3').partnerId, 'KL10');
  console.log('partner-merge tests passed');
}

testPartnerIdentity();
testPartnerMerge();
console.log('partner merge regression tests passed');
