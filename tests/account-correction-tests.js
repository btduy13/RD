'use strict';

// Sửa tài khoản: bút toán thiếu vế, quy tắc gợi ý TK đối ứng phiếu thu/chi,
// số dư đầu kỳ ký quỹ TT133 (244/344 → 1386/3386) và công cụ áp dụng ở tab Công nợ.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

function makeContext(state, files) {
  const ctx = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, setTimeout, clearTimeout,
    state,
    DEFAULT_DATA: { products: [], initialBalances: {} },
    safeParseFloat: v => Number(v) || 0,
    document: { getElementById() { return null; }, addEventListener() {}, querySelectorAll() { return []; } },
    formatVND: v => String(v),
    escapeHtmlAttr: s => s,
    matchAdvancedQuery: () => true,
    classifyPartnerCategory: () => 'project',
    findRelatedSalesVoucher: () => null,
    openModal() {}, closeModal() {},
    toasts: [],
    ensureRemainingDebt() {},
    saveState() {},
    refreshUI() {},
    XLSX: null
  };
  ctx.showToast = (msg, type) => ctx.toasts.push([type, msg]);
  ctx.window = ctx;
  vm.createContext(ctx);
  files.forEach(file => vm.runInContext(read(file), ctx, { filename: file }));
  return ctx;
}

const failures = [];
async function test(name, run) {
  try { await run(); console.log('PASS', name); }
  catch (err) { failures.push(name); console.error('FAIL', name, err.stack || err.message); }
}

function entrySums(vouchers) {
  let debit = 0, credit = 0;
  vouchers.forEach(v => (v.entries || []).forEach(e => {
    if (String(e.debit ?? '').trim()) debit += Number(e.amount) || 0;
    if (String(e.credit ?? '').trim()) credit += Number(e.amount) || 0;
  }));
  return { debit, credit };
}

async function main() {
  await test('sales/purchase without payment method post balanced entries on 131/331', () => {
    const state = {
      accountingStandard: 'TT133', products: [], partners: [], initialBalances: {}, partnerOpeningBalances: {},
      vouchers: [
        { id: 'BH1', type: 'sales', date: '2026-07-01', notes: 'Bán hàng xuất kho', isImported: true,
          items: [{ productId: 'X', qty: 1, price: 3720000, amount: 3720000 }] },
        { id: 'NK1', type: 'purchase', date: '2026-06-01', paymentMethod: '', isManual: true,
          items: [{ productId: 'X', qty: 2, price: 1000, amount: 2000 }] }
      ]
    };
    const c = makeContext(state, ['js/core/accounting-engine.js', 'js/accounting.js']);
    c.recalculateAccounting(false, true);
    const bh = state.vouchers.find(v => v.id === 'BH1');
    const nk = state.vouchers.find(v => v.id === 'NK1');
    assert.equal(bh.paymentMethod, '131');
    assert.equal(nk.paymentMethod, '331');
    assert.equal(bh.entries[0].debit, '131');
    assert.equal(bh.entries[0].desc, 'Doanh thu Bán hàng xuất kho', 'description falls back to notes, never "undefined"');
    const sums = entrySums(state.vouchers);
    assert.equal(sums.debit, sums.credit, 'trial balance stays balanced');
  });

  await test('cash account rules suggest only with clear evidence', () => {
    const c = makeContext({}, ['js/core/accounting-engine.js']);
    const supplier = { salesOn131: 0, purchasesOn331: 3 };
    const customer = { salesOn131: 5, purchasesOn331: 0 };
    const s = (...a) => c.suggestCashAccountFix(...a);
    assert.equal(s('payment', '333', 'Chi nộp thuế GTGT tháng 12/2024', null, '', null).to, '3331');
    assert.equal(s('payment', '333', 'Chi nộp thuế môn bài 2025', null, '', null).to, '3338');
    assert.equal(s('payment', '333', 'Chi nộp thuế GTGT + phí lô hàng nhập khẩu', null, '', null), null, 'mixed tax+fee payments are left for manual split');
    assert.equal(s('payment', '341', 'tất toán tiền nợ QTM', { name: 'CTY QUÁCH TUẤN MINH' }, 'TUANMINH', supplier).to, '331');
    assert.equal(s('payment', '341', 'Chi khác 149 thùy vân tất toán không thu được', { name: 'Mua lẻ' }, 'ML1', supplier), null);
    assert.equal(s('payment', '341', 'Trả nợ vay ngân hàng', { name: 'Ngân hàng Sacombank' }, 'SACOMBANK', supplier), null);
    assert.equal(s('payment', '156', 'Chi Ck tiền mua hàng', { name: 'NHẬP HÀNG TQ' }, 'TQ', supplier).to, '331');
    assert.equal(s('payment', '156', 'Chi Ck tiền mua hàng', { name: 'NCC mới' }, 'NEW', { salesOn131: 0, purchasesOn331: 0 }), null);
    assert.equal(s('receipt', '341', 'PT3713/q75 Anh Lực CK sacombank', { name: 'Anh Lực' }, 'KH1', null).to, '131');
    assert.equal(s('receipt', '341', 'Giải ngân khoản vay', { name: 'Sacombank' }, 'SACOMBANK', null), null);
    assert.equal(s('receipt', '341', 'Nhận tiền vay anh Hai', { name: 'Anh Hai' }, 'KH2', null), null, '"vay" in description keeps 341');
    assert.equal(s('receipt', '511', 'Thu tiền bán hàng', { name: 'Anh Thiện' }, 'KH3', customer).to, '131');
    assert.equal(s('receipt', '511', 'Thu tiền bán hàng', { name: 'CH Thành Công' }, 'KH4', { salesOn131: 0, purchasesOn331: 0 }), null);
    assert.equal(s('receipt', '131', 'Thu nợ', { name: 'A' }, 'KH5', customer), null, 'correct entries stay untouched');
  });

  await test('TT133 reads 244/344 openings as 1386/3386, TT200 keeps them apart', () => {
    const state = {
      accountingStandard: 'TT133', products: [], partners: [], partnerOpeningBalances: {},
      initialBalances: {
        '244': { name: 'Phải thu ký quỹ (TK 1386 theo TT133)', type: 'debit', balance: 50000000 },
        '344': { name: 'Phải trả nhận ký quỹ (TK 3386 theo TT133)', type: 'credit', balance: 30000000 }
      },
      vouchers: [
        { id: 'KQ1', type: 'escrow_pay', date: '2026-01-15', paymentMethod: '112', amount: 20000000, entries: [{ debit: '1386', credit: '112', amount: 20000000 }] },
        { id: 'KQ2', type: 'escrow_receive', date: '2026-01-20', paymentMethod: '111', amount: 15000000, entries: [{ debit: '111', credit: '3386', amount: 15000000 }] }
      ]
    };
    const c = makeContext(state, ['js/core/accounting-engine.js', 'js/accounting.js', 'js/modules/reports.js']);
    assert.equal(c.getAccountBalance('1386'), 70000000, 'dashboard escrow paid includes opening');
    assert.equal(c.getAccountBalance('3386'), 45000000, 'dashboard escrow received includes opening');
    const codes = c.getReportAccounts().map(a => a.code);
    assert.ok(!codes.includes('244') && !codes.includes('344'), 'no duplicate 244/344 rows under TT133');
    const rows = c.calculateTrialBalance();
    assert.equal(rows.find(r => r.code === '1386').closeDebit, 70000000);
    assert.equal(rows.find(r => r.code === '3386').closeCredit, 45000000);

    state.accountingStandard = 'TT200';
    assert.equal(c.getAccountBalance('244'), 50000000);
    assert.equal(c.getAccountBalance('1386'), 20000000, 'TT200 does not alias');
    assert.ok(c.getReportAccounts().some(a => a.code === '244'));
    assert.equal(state.initialBalances['244'].balance, 50000000, 'stored openings are never rewritten');
  });

  await test('debts tool lists and applies account fixes, then stays idempotent', async () => {
    const state = {
      accountingStandard: 'TT133', products: [], initialBalances: {}, partnerOpeningBalances: {},
      partners: [{ id: 'TQ', name: 'NHẬP HÀNG TQ', type: 'supplier' }, { id: 'KH', name: 'Anh Lực', type: 'customer' }],
      vouchers: [
        { id: 'NK1', type: 'purchase', date: '2025-03-22', partnerId: 'TQ', paymentMethod: '331', items: [], entries: [{ debit: '156', credit: '331', amount: 100 }] },
        { id: 'PC1', type: 'payment', date: '2025-08-04', partnerId: 'TQ', paymentMethod: '112', amount: 100, description: 'Chi Ck tiền mua hàng', _updatedAt: 5, entries: [{ debit: '156', credit: '112', amount: 100, desc: 'Chi Ck tiền mua hàng' }] },
        { id: 'PT1', type: 'receipt', date: '2025-10-06', partnerId: 'KH', paymentMethod: '112', amount: 40, description: 'PT3713 Anh Lực CK sacombank', entries: [{ debit: '112', credit: '341', amount: 40, desc: 'PT3713 Anh Lực CK sacombank' }] },
        { id: 'PC2', type: 'payment', date: '2025-01-17', paymentMethod: '111', amount: 7, description: 'Chi nộp thuế GTGT tháng 12', entries: [{ debit: '333', credit: '111', amount: 7 }] },
        { id: 'PC3', type: 'payment', date: '2025-01-18', partnerId: 'TQ', paymentMethod: '111', amount: 9, description: 'Trả nợ NCC', entries: [{ debit: '331', credit: '111', amount: 9 }] }
      ]
    };
    const c = makeContext(state, ['js/core/accounting-engine.js', 'js/modules/debts.js']);
    let saved = 0, recalcs = 0, logged = '';
    c.showConfirmModal = async () => true;
    c.saveStateAndSyncVoucher = async () => { saved++; return true; };
    c.recalculateAccounting = () => { recalcs++; };
    c.logUserAction = (_t, d) => { logged = d; };
    c.filterDebts = () => {};

    const rows = c.computeCashAccountFixSuggestions();
    assert.deepEqual(rows.map(r => `${r.id}:${r.from}>${r.to}`), ['PC2:333>3331', 'PC1:156>331', 'PT1:341>131']);
    const html = c.renderCashAccountFixBlock(rows, d => d);
    assert.match(html, /Sửa tài khoản theo đề xuất \(3\)/);
    assert.match(html, /data-role-required="write"/);

    await c.applyCashAccountFixes();
    const byId = id => state.vouchers.find(v => v.id === id);
    assert.equal(byId('PC1').entries[0].debit, '331');
    assert.equal(byId('PC1').entries[0].amount, 100, 'amount unchanged');
    assert.ok(byId('PC1')._updatedAt > 5, 'edit is stamped for cloud sync');
    assert.equal(byId('PT1').entries[0].credit, '131');
    assert.equal(byId('PC2').entries[0].debit, '3331');
    assert.equal(byId('PC3').entries[0].debit, '331', 'already-correct voucher untouched');
    assert.equal(saved, 1); assert.equal(recalcs, 1);
    assert.match(logged, /PC1: 156→331/);
    assert.equal(c.computeCashAccountFixSuggestions().length, 0, 'nothing left to fix');

    c.window.currentUser = { role: 'viewer' };
    await c.applyCashAccountFixes();
    assert.equal(saved, 1, 'viewer cannot apply');
  });

  await test('report catalog names new tax account 3338', () => {
    const state = { accountingStandard: 'TT133', initialBalances: {}, vouchers: [{ id: 'X', entries: [{ debit: '3338', credit: '111', amount: 1 }] }] };
    const c = makeContext(state, ['js/core/accounting-engine.js', 'js/modules/reports.js']);
    assert.equal(c.getReportAccounts().find(a => a.code === '3338').name, 'Thuế bảo vệ môi trường và các loại thuế khác');
  });

  if (failures.length) {
    console.error(`\n${failures.length} account correction test(s) failed`);
    process.exit(1);
  }
  console.log('\naccount correction tests passed');
}

main();
