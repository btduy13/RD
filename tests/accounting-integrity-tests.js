'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function context(files) {
  const ctx = { console, setTimeout, clearTimeout, document: { addEventListener() {} },
    state: { products: [], partners: [], vouchers: [], initialBalances: {}, partnerOpeningBalances: {} },
    DEFAULT_DATA: { products: [] }, saveState() {}, refreshUI() {}, safeParseFloat: Number };
  ctx.window = ctx;
  vm.createContext(ctx);
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx));
  return ctx;
}
const failures = [];
async function test(name, run) {
  try { await run(); console.log('PASS', name); }
  catch (err) { failures.push(name); console.error('FAIL', name, err.message); }
}
function order(id, type, partnerId, date = '2026-01-02') {
  return { id, type, partnerId, date, isManual: true, paymentMethod: type === 'sales' ? '131' : '331',
    items: [{ productId: 'P', qty: 1, price: 1000, amount: 1000 }] };
}
async function main() {
  await test('browser-cache startup preserves numeric IDs and test-like descriptions', async () => {
    const c = context(['js/state.js']);
    const data = { products:[], partners:[], initialBalances:{'111':{type:'debit',balance:0}}, vouchers:[
      {id:'20260905', type:'receipt', amount:100, description:'Thu tiền'},
      {id:'PT123', type:'receipt', amount:100, description:'test'}
    ] };
    c.localStorage = { getItem(key) { return key === 'rd_accounting_online_cache' ? JSON.stringify(data) : key === 'rd_migrations_279_done' ? 'true' : null; }, setItem() {} };
    c.lastSyncedCloudTs = 0;
    c.updateCompanyUI = c.switchTab = c.saveState = c.recalculateAccounting = () => {};
    c.trackDeletedIds = ids => { c.deletions = ids; };
    await c.initApp();
    assert.equal(vm.runInContext('state.vouchers.length', c), 2);
    assert.equal(c.deletions, undefined);
  });
  await test('recalculation preserves entered account openings and equity', () => {
    const c = context(['js/accounting.js']);
    c.state.initialBalances = { '131': { type: 'debit', balance: 900 }, '331': { type: 'credit', balance: 300 }, '411': { type: 'credit', balance: 600 } };
    const before = JSON.stringify(c.state.initialBalances);
    c.recalculateAccounting(false);
    assert.equal(JSON.stringify(c.state.initialBalances), before);
  });
  await test('cash account balance treats imported amounts and account codes numerically', () => {
    const c = context(['js/accounting.js']);
    c.state.initialBalances = {'111':{type:'debit',balance:'100'}};
    c.state.vouchers = [{entries:[{debit:111,credit:'131',amount:'25'},{debit:'331',credit:'111 ',amount:'10'}]}];
    assert.equal(c.getAccountBalance('111'), 115);
  });
  for (const type of ['sales', 'purchase']) {
    await test(`${type}: advance cash and opening advances settle later invoices`, () => {
      const c = context(['js/accounting.js']);
      c.state.partners = [{ id: 'A', type: type === 'sales' ? 'retail' : 'supplier' }];
      c.state.partnerOpeningBalances.A = type === 'sales' ? { debit: 0, credit: 200 } : { debit: 200, credit: 0 };
      c.state.vouchers = [order('I', type, 'A'), { id: 'C', type: type === 'sales' ? 'receipt' : 'payment', partnerId: 'A', date: '2026-01-01', amount: 400, paymentMethod: '111' }];
      c.recalculateAccounting(false);
      assert.equal(c.state.vouchers.find(v => v.id === 'I').remainingDebt, 400);
      c.recalculateAccounting(false);
      assert.equal(c.state.vouchers.find(v => v.id === 'I').remainingDebt, 400);
      c.state.vouchers = c.state.vouchers.filter(v => v.id !== 'C');
      c.recalculateAccounting(false);
      assert.equal(c.state.vouchers[0].remainingDebt, 800);
    });
  }
  await test('unidentified partners never settle each other', () => {
    const c = context(['js/accounting.js']);
    c.state.vouchers = [order('I', 'sales', ''), { id: 'C', type: 'receipt', partnerId: '', date: '2026-01-03', amount: 400 }];
    c.recalculateAccounting(false);
    assert.equal(c.state.vouchers.find(v => v.id === 'I').remainingDebt, 1000);
  });
  await test('opening debit and credit net within the same partner account', () => {
    const c = context(['js/accounting.js']);
    c.state.partners = [{ id: 'A', type: 'retail' }];
    c.state.partnerOpeningBalances.A = { debit: 100, credit: 200 };
    c.state.vouchers = [order('I', 'sales', 'A')];
    c.recalculateAccounting(false);
    assert.equal(c.state.vouchers[0].remainingDebt, 900);
  });
  await test('return credit consumed by a later order is not counted twice', () => {
    const c = context(['js/accounting.js']);
    c.state.vouchers = [{ ...order('R', 'sales_return', 'A', '2026-01-01'), paymentMethod: '131' }, order('I', 'sales', 'A')];
    c.recalculateAccounting(false);
    assert.equal(c.state.vouchers.find(v => v.id === 'I').remainingDebt, 0);
    assert.equal(c.state.vouchers.find(v => v.id === 'R').remainingDebt, 0);
  });
  await test('editing imported movements preserves opening inventory', () => {
    const c = context(['js/accounting.js']);
    c.state.products = [{ id: 'P', initialStock: 10, initialCost: 100, actualStock: 10 }];
    c.state.vouchers = [{ ...order('I', 'sales', 'A'), isImported: true }];
    c.recalculateAccounting(false);
    assert.equal(c.state.products[0].initialStock, 10);
    assert.equal(c.state.products[0].stock, 9);
  });
  await test('catalog defaults do not overwrite entered inventory and recalc is stable', () => {
    const c = context(['js/accounting.js']);
    c.DEFAULT_DATA.products = [{ id:'P', stock:50, avgCost:90 }];
    c.state.products = [{ id:'P', initialStock:10, initialCost:100 }];
    c.state.vouchers = [order('I', 'sales', 'A')];
    c.recalculateAccounting(false); c.recalculateAccounting(false);
    assert.equal(c.state.products[0].stock, 9);
    assert.equal(c.state.products[0].initialCost, 100);
  });
  await test('full persistence snapshots only the bytes committed, including concurrent new vouchers', async () => {
    const c = context(['js/core/state-diff.js', 'js/state.js']);
    let release;
    c.persistFullState = async json => { c.persisted = JSON.parse(json); await new Promise(r => { release = r; }); return { ok: true }; };
    c.persistStateDelta = async delta => { c.delta = delta; return { ok: true }; };
    c.pushActivityLogDirectly = () => {};
    vm.runInContext("state.vouchers = [{ id: 'A', type: 'receipt', amount: 100 }]; saveStateIsDirty = true;", c);
    const first = c.executeSaveState(true, { skipCloudPush: true });
    await new Promise(r => setImmediate(r));
    vm.runInContext("state.vouchers.push({id:'B', type:'payment',amount:50}); saveStateRevision++;", c);
    release(); await first;
    assert.equal(vm.runInContext("lastSavedState.vouchers.has('B')", c), false);
    await c.executeSaveState(true, { skipCloudPush: true });
    assert.ok(c.delta.vouchers.upsert.some(v => v.id === 'B'));
  });
  await test('delta persistence does not mark a concurrent edit as committed', async () => {
    const c = context(['js/core/state-diff.js', 'js/state.js']);
    c.pushActivityLogDirectly = () => {};
    vm.runInContext("state.vouchers = [{ id:'A', type:'receipt', amount:100 }]; initializeLastSavedState(state); state.vouchers[0].amount = 200; saveStateIsDirty = true;", c);
    let release;
    c.persistStateDelta = async delta => { c.diskDelta = JSON.parse(JSON.stringify(delta)); await new Promise(r => { release = r; }); return { ok:true }; };
    const save = c.executeSaveState(true, { skipCloudPush:true });
    await new Promise(r => setImmediate(r));
    vm.runInContext("state.vouchers[0].amount = 300; saveStateRevision++;", c);
    release(); await save;
    assert.equal(c.diskDelta.vouchers.upsert[0].amount, 200);
    assert.equal(vm.runInContext("lastSavedState.vouchers.get('A').amount", c), 200);
  });
  if (failures.length) throw new Error(`${failures.length} integrity tests failed`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
