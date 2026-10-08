'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
function load(state, withUtils) {
  const ctx = { console, setTimeout, clearTimeout, document: { addEventListener() {} }, state,
    DEFAULT_DATA: { products: [] }, saveState() {}, refreshUI() {}, safeParseFloat: v => Number(v) || 0 };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['js/core/accounting-engine.js', 'js/accounting.js'];
  if (withUtils) files.push('js/utils.js');
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), ctx));
  ctx.state = state;
  return ctx;
}
const clone = o => JSON.parse(JSON.stringify(o));
const D = '2026-10-08';
const mk = (id, type, qty, price, pid, pm, extra) => Object.assign({ id, type, date: D, partnerId: pid, paymentMethod: pm, isManual: true, taxRate: 0,
  items: [{ productId: 'SP1', qty, price, amount: qty * price }] }, extra || {});
const baseState = vouchers => ({ accountingStandard: 'TT200', initialBalances: {}, partnerOpeningBalances: {},
  products: [{ id: 'SP1', name: 'Thep', initialStock: 0, initialCost: 0 }],
  partners: [{ id: 'KH1', name: 'Khach 1', type: 'customer' }, { id: 'NCC1', name: 'NCC 1', type: 'supplier' }], vouchers });

function figures(vouchers) {
  const st = baseState(clone(vouchers));
  const c = load(st);
  c.recalculateAccounting(false, true);
  const p = st.products[0];
  return { stock: p.stock, avgCost: p.avgCost, totalValue: p.totalValue,
    cogs: Object.fromEntries(st.vouchers.filter(v => v.type === 'sales').map(v => [v.id, v.cogsAmount])),
    debt: Object.fromEntries(st.vouchers.map(v => [v.id, v.remainingDebt])),
    tk156: c.getAccountBalance('156'), tk632: c.getAccountBalance('632') };
}

const tests = [];
const test = (n, f) => tests.push([n, f]);

test('comparator: date, then stock-in before stock-out, then _createdAt, then id', () => {
  const c = load(baseState([]));
  const cmp = c.compareVouchersForAccounting;
  assert.equal(typeof cmp, 'function');
  const s = (...vs) => vs.sort(cmp).map(v => v.id).join(',');
  assert.equal(s({ id: 'B', type: 'sales', date: D }, { id: 'Z', type: 'purchase', date: D }), 'Z,B');
  assert.equal(s({ id: 'B', type: 'purchase_return', date: D }, { id: 'Z', type: 'sales_return', date: D }), 'Z,B');
  assert.equal(s({ id: 'M', type: 'receipt', date: D }, { id: 'Z', type: 'purchase', date: D }, { id: 'A', type: 'sales', date: D }), 'Z,M,A');
  assert.equal(s({ id: 'a', type: 'sales', date: D, _createdAt: 5 }, { id: 'b', type: 'sales', date: D, _createdAt: 2 }), 'b,a');
  assert.equal(s({ id: 'b', type: 'sales', date: D }, { id: 'a', type: 'sales', date: D }), 'a,b');
  assert.equal(s({ id: 'a', type: 'purchase', date: '2026-10-09' }, { id: 'b', type: 'sales', date: D }), 'b,a');
});

test('recalculation figures identical for any array order of same-day vouchers', () => {
  const vs = [mk('PN-A', 'purchase', 10, 100, 'NCC1', '331'), mk('BH-A', 'sales', 5, 300, 'KH1', '131'),
    mk('PN-B', 'purchase', 10, 200, 'NCC1', '331'), mk('BH-B', 'sales', 5, 300, 'KH1', '131'),
    { id: 'PT-B', type: 'receipt', date: D, partnerId: 'KH1', paymentMethod: '111', amount: 1500, isManual: true, entries: [{ debit: '111', credit: '131', amount: 1500 }] }];
  const fwd = figures(vs);
  const rev = figures([...vs].reverse());
  const mid = figures([vs[3], vs[0], vs[4], vs[2], vs[1]]);
  assert.deepStrictEqual(rev, fwd);
  assert.deepStrictEqual(mid, fwd);
});

test('sales sorted after purchase same day (stock never negative in-between)', () => {
  const fig = figures([mk('A-SALE', 'sales', 5, 300, 'KH1', '131'), mk('Z-BUY', 'purchase', 10, 100, 'NCC1', '331')]);
  assert.equal(fig.cogs['A-SALE'], 500);
  assert.equal(fig.stock, 5);
});

test('calculateInventoryValueAt is independent of same-day array order', () => {
  const c = load(baseState([]));
  const vs = [mk('S', 'sales', 5, 300, 'KH1', '131'), mk('P', 'purchase', 10, 100, 'NCC1', '331')];
  const prods = baseState([]).products;
  assert.equal(c.calculateInventoryValueAt(prods, vs, D), c.calculateInventoryValueAt(prods, [...vs].reverse(), D));
});

test('recalculation does not rewrite voucher.partnerId or _updatedAt', () => {
  const partners = [{ id: 'KH1', name: 'Cong ty An Phat', type: 'customer' }, { id: 'KH2', name: 'Cong ty An Phat', type: 'customer' }];
  [[0, 1], [1, 0]].forEach(order => {
    const st = baseState([{ id: 'BH9', type: 'sales', date: '2026-10-01', partnerId: 'OLD9', partnerName: 'Cong ty An Phat', paymentMethod: '131',
      isManual: true, taxRate: 0, items: [{ productId: 'SP1', qty: 1, price: 1000, amount: 1000 }], _updatedAt: 50 }]);
    st.partners = order.map(i => clone(partners[i]));
    const c = load(st, true);
    c.state = st;
    c.recalculateAccounting(false, true);
    assert.equal(st.vouchers[0].partnerId, 'OLD9');
    assert.equal(st.vouchers[0]._updatedAt, 50);
  });
});

test('recalculation does not rewrite partnerId even for unique name match, and still uses it for debt', () => {
  const st = baseState([{ id: 'BH1', type: 'sales', date: '2026-10-01', partnerId: 'khach 1', paymentMethod: '131',
    isManual: true, taxRate: 0, items: [{ productId: 'SP1', qty: 1, price: 1000, amount: 1000 }] }]);
  st.products[0].initialStock = 5; st.products[0].initialCost = 100;
  const c = load(st, true);
  c.state = st;
  c.recalculateAccounting(false, true);
  assert.equal(st.vouchers[0].partnerId, 'khach 1');
  assert.equal(st.vouchers[0].remainingDebt, 1000);
});

let failed = 0;
for (const [n, f] of tests) {
  try { f(); console.log('PASS', n); } catch (e) { failed++; console.error('FAIL', n, '-', e.message); }
}
if (failed) { console.error(failed + ' accounting-order test(s) failed'); process.exit(1); }
console.log('accounting-order tests passed');
