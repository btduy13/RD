'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function createBaseSandbox(partners) {
  const domReadyCallbacks = [];
  const sandbox = {
    console,
    Date,
    JSON,
    Number,
    Math,
    Array,
    Object,
    String,
    Set,
    Map,
    Intl,
    Promise,
    setTimeout,
    clearTimeout,
    state: {
      partners: partners || [],
      products: [],
      vouchers: [],
      partnerOpeningBalances: {},
      partnerOpeningBalanceTs: {}
    },
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      }
    },
    XLSX: null,
    showToast() {},
    saveState() {},
    formatVND: value => String(value),
    invalidatePartnerCache() {}
  };
  sandbox.window = sandbox;
  sandbox.__domReadyCallbacks = domReadyCallbacks;
  vm.createContext(sandbox);
  return sandbox;
}

function loadPartnerResolution(partners, includePartnerModule = false) {
  const sandbox = createBaseSandbox(partners);
  [
    'js/utils.js',
    'js/core/partner-identity.js',
    'js/excel-integration.js'
  ].forEach(relativePath => {
    vm.runInContext(readSource(relativePath), sandbox, { filename: relativePath });
  });
  if (includePartnerModule) {
    vm.runInContext(readSource('js/modules/partners.js'), sandbox, { filename: 'js/modules/partners.js' });
  }
  return sandbox;
}

function testPureLookupDoesNotCreatePartner() {
  const original = { id: 'DN01', name: 'Công ty Rạng Đông', type: 'enterprise' };
  const sandbox = loadPartnerResolution([original]);

  assert.equal(sandbox.findExistingPartner('DN01'), original, 'finds an exact partner ID');
  assert.equal(
    sandbox.findExistingPartner('Công ty Rạng Đông (DN01)'),
    original,
    'finds an ID in the datalist display format'
  );
  assert.equal(sandbox.findExistingPartner('DN0'), null, 'does not fuzzy-match partial input');
  assert.equal(sandbox.findExistingPartner('Doanh nghiệp chưa có'), null, 'unknown partner returns null');
  assert.equal(sandbox.state.partners.length, 1, 'pure lookup never mutates state.partners');

  const created = sandbox.resolvePartner('Khách hàng mới');
  assert.equal(sandbox.state.partners.length, 2, 'write-path resolver still creates a new partner');
  assert.equal(sandbox.state.partners[1], created, 'created partner is registered in state');
}

function testEnterpriseParentValidationDoesNotCreatePartner() {
  const enterprise = { id: 'DN01', name: 'Công ty Rạng Đông', type: 'enterprise' };
  const retail = { id: 'KH01', name: 'Khách lẻ', type: 'retail' };
  const sandbox = loadPartnerResolution([enterprise, retail], true);

  assert.equal(sandbox.resolveEnterpriseParent('Công ty Rạng Đông (DN01)'), enterprise);
  assert.equal(sandbox.resolveEnterpriseParent('Khách lẻ (KH01)'), null, 'non-enterprise cannot be a parent');
  assert.equal(sandbox.resolveEnterpriseParent('Doanh nghiệp gõ dở'), null, 'unknown parent is rejected');
  assert.equal(sandbox.state.partners.length, 2, 'parent validation does not create ghost partners');
}

function createInput(value = '') {
  return {
    value,
    dataset: {},
    listeners: {},
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }
  };
}

function testSalesDescriptionPreviewDoesNotResolveOrCreate() {
  const partnerInput = createInput();
  const descriptionInput = createInput();
  let mutatingResolveCalls = 0;
  const knownPartner = { id: 'KH01', name: 'Khách hàng hiện có', type: 'retail' };
  const domReadyCallbacks = [];
  const sandbox = {
    console,
    Date,
    JSON,
    Number,
    Math,
    Array,
    Object,
    String,
    Set,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    state: { partners: [knownPartner], products: [], vouchers: [] },
    document: {
      getElementById(id) {
        if (id === 'sale-partner') return partnerInput;
        if (id === 'sale-desc') return descriptionInput;
        return null;
      },
      querySelectorAll() { return []; },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      }
    },
    findExistingPartner(value) {
      return value === knownPartner.id ? knownPartner : null;
    },
    resolvePartner() {
      mutatingResolveCalls++;
      throw new Error('description preview must not call resolvePartner');
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readSource('js/modules/sales.js'), sandbox, { filename: 'js/modules/sales.js' });
  domReadyCallbacks.forEach(callback => callback());

  partnerInput.value = 'KH';
  partnerInput.listeners.input();
  assert.equal(descriptionInput.value, 'Bán hàng KH', 'partial text is previewed as typed');
  assert.equal(sandbox.state.partners.length, 1, 'typing does not add a partner');

  partnerInput.value = 'KH01';
  partnerInput.listeners.input();
  assert.equal(descriptionInput.value, 'Bán hàng Khách hàng hiện có', 'existing partner name is previewed');
  assert.equal(mutatingResolveCalls, 0, 'typing never calls the mutating resolver');
}

testPureLookupDoesNotCreatePartner();
testEnterpriseParentValidationDoesNotCreatePartner();
testSalesDescriptionPreviewDoesNotResolveOrCreate();
console.log('partner resolution regression tests passed');
