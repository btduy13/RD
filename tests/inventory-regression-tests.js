'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'inventory.js'), 'utf8');
const sandbox = {
  window: {},
  state: { vouchers: [], products: [], partners: [] },
  console,
  Date,
  Map,
  Set,
  Number,
  String,
  Array,
  Object,
  Math,
  JSON
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'inventory.js' });

const movement = sandbox.window.getInventoryVoucherProductMovement;
const makeId = sandbox.window.generateUniqueInventoryVoucherId;

const purchase = movement({
  type: 'purchase',
  items: [
    { productId: 'P1', qty: 2, price: 100 },
    { productId: 'P1', qty: 3, price: 200 },
    { productId: 'P2', qty: 99, price: 999 }
  ]
}, 'P1');
assert.equal(purchase.inQty, 5, 'all repeated product lines must be included');
assert.equal(purchase.outQty, 0);
assert.equal(purchase.unitCost, 160, 'movement cost should be quantity weighted');

const purchaseReturn = movement({
  type: 'purchase_return',
  items: [{ productId: 'P1', qty: 4, price: 300, cogsUnit: 125 }]
}, 'P1');
assert.equal(purchaseReturn.inQty, 0);
assert.equal(purchaseReturn.outQty, 4, 'purchase returns must leave inventory');
assert.equal(purchaseReturn.unitCost, 125, 'outbound movements must use recorded COGS');

const salesReturn = movement({
  type: 'sales_return',
  items: [{ productId: 'P1', qty: 2, price: 450, cogsUnit: 120 }]
}, 'P1');
assert.equal(salesReturn.inQty, 2, 'sales returns must re-enter inventory');

sandbox.state.vouchers = [{ id: 'PNK-Q1000' }, { id: 'PNK-Q1000-1' }];
assert.equal(makeId('PNK-Q', 1000), 'PNK-Q1000-2', 'generated inventory voucher IDs must avoid collisions');

console.log('inventory regression tests passed');

