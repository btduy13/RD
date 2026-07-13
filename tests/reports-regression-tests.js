'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const state = {
  accountingStandard: 'TT200',
  initialBalances: {
    '111': { type: 'debit', balance: 100 },
    '331': { type: 'credit', balance: 50 }
  },
  vouchers: [
    { id: 'NK1', entries: [{ debit: '111', credit: '331', amount: 200 }] },
    { id: 'IMPORTED', entries: null }
  ]
};
const sandbox = { window: {}, state, console, Date, setTimeout };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'reports.js'), 'utf8'),
  sandbox,
  { filename: 'reports.js' }
);

const rows = sandbox.window.calculateTrialBalance();
const cash = rows.find(row => row.code === '111');
const payable = rows.find(row => row.code === '331');
assert.deepEqual(
  { open: cash.openDebit, movement: cash.moveDebit, close: cash.closeDebit },
  { open: 100, movement: 200, close: 300 }
);
assert.deepEqual(
  { open: payable.openCredit, movement: payable.moveCredit, close: payable.closeCredit },
  { open: 50, movement: 200, close: 250 }
);

console.log('reports regression tests passed');

