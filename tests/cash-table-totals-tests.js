'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'cash.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'cash.js' });

const calculateCashListTotals = sandbox.window.calculateCashListTotals;
assert.equal(typeof calculateCashListTotals, 'function');

const totals = calculateCashListTotals([
  { type: 'receipt', amount: 2_278_175 },
  { type: 'escrow_receive', amount: 9_948_920 },
  { type: 'payment', amount: 1_500_000 },
  { type: 'escrow_pay', totalAmount: 250_000 },
  { type: 'sales', amount: 99_000_000 },
  { type: 'receipt', amount: 'không hợp lệ' }
]);

assert.deepEqual(
  { receipts: totals.receipts, payments: totals.payments },
  { receipts: 12_227_095, payments: 1_750_000 },
  'totals must separate receipts and payments and ignore non-cash or invalid values'
);

assert.deepEqual(
  calculateCashListTotals(null),
  { receipts: 0, payments: 0 },
  'an empty cash list must return zero totals'
);

console.log('cash table totals tests passed');
