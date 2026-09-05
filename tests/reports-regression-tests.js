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

state.initialBalances['3388'] = { type:'credit', balance:'25', name:'Khoản phải trả khác' };
state.vouchers.push({ id:'ADJUST', entries:[{ debit:'156', credit:'711', amount:'75' }] });
state.vouchers.push({ id:'BANK', entries:[{ debit:'1121', credit:'131', amount:'10' }] });
const complete = sandbox.window.calculateTrialBalance();
assert.equal(complete.find(r => r.code === '711').moveCredit, 75, 'inventory adjustment income must not disappear from the trial balance');
assert.equal(complete.find(r => r.code === '1121').moveDebit, 10, 'imported subaccounts must appear');
assert.equal(complete.find(r => r.code === '3388').openCredit, 25, 'non-default opening accounts must appear');
assert.equal(complete.reduce((s,r) => s+r.moveDebit, 0), complete.reduce((s,r) => s+r.moveCredit, 0), 'every double-entry movement stays balanced');
const elements = { 'printable-report-area':{}, 'select-report-type':{value:'ledger'}, 'select-report-account':{value:'111'} };
sandbox.document = {getElementById:id => elements[id]};
sandbox.formatDateDisplay = value => value || '';
const formatted = [];
sandbox.formatVND = value => { formatted.push(value); return String(value); };
state.vouchers = [{id:'SELF', entries:[{debit:111,credit:'111 ',amount:'25'}]}];
sandbox.generateReport();
assert.equal(formatted.at(-1), 100, 'same-account debit/credit movement must not inflate ledger closing balance');
sandbox.populateReportAccountDropdown();
assert.match(elements['select-report-account'].innerHTML, /3388/);
assert.equal(elements['select-report-account'].value, '111', 'refresh preserves selected account');
console.log('reports regression tests passed');

