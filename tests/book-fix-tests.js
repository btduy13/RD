'use strict';

// Sửa sổ có xác nhận (js/modules/book-fixes.js): trích lương/BHXH đã chi nhưng chưa trích (Nợ 642/6422 / Có 334, 338)
// và bổ sung số dư đầu kỳ cho cân (nợ đầu kỳ có chứng từ 334/338/3331, phần còn lại 4211). Plain node + assert trong vm.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['js/core/chart-of-accounts.js', 'js/core/tax-rules.js', 'js/core/accounting-engine.js', 'js/accounting.js',
  'js/core/payroll-calc.js', 'js/modules/book-fixes.js'];
const M = 1000000;
const pay = (id, date, account, amount, description) => ({
  id, type: 'payment', date, amount, description, partnerId: 'SP_9304', paymentMethod: '111', isImported: true,
  entries: [{ debit: account, credit: '111', amount, desc: description }]
});

function context({ standard = 'TT99', vouchers = [], initialBalances, lockedThrough } = {}) {
  const ctx = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, setTimeout, clearTimeout,
    state: {
      accountingStandard: standard, products: [], partners: [{ id: 'SP_9304', name: 'Khách hàng vãng lai', type: 'supplier' }],
      partnerOpeningBalances: {}, lockedThrough,
      initialBalances: initialBalances || {
        '111': { name: 'Tiền mặt', type: 'debit', balance: 500 * M },
        '156': { name: 'Hàng hóa', type: 'debit', balance: 1000 * M },
        '331': { name: 'Phải trả', type: 'credit', balance: 100 * M },
        '411': { name: 'Vốn', type: 'credit', balance: 200 * M },
        '3331': { name: 'Thuế GTGT phải nộp', type: 'credit', balance: 0 }
      },
      vouchers: [
        { id: 'BH1', type: 'sales', date: '2025-01-02', partnerId: 'SP_9304', paymentMethod: '111', taxRate: 'KCT', items: [], totalAmount: 0, isManual: true },
        ...vouchers
      ]
    },
    DEFAULT_DATA: { products: [], initialBalances: {} },
    document: { getElementById() { return null; }, addEventListener() {}, querySelectorAll() { return []; } },
    saveState() {}, refreshUI() {}, safeParseFloat: v => Number(v) || 0, formatVND: v => String(Math.round(v)), formatDateDisplay: String,
    toasts: [], confirms: [], logs: [],
    saveStateAndSyncVoucher: async () => true,
    currentUser: { role: 'admin', username: 'kt' }
  };
  ctx.showToast = (msg, type) => ctx.toasts.push([type, msg]);
  ctx.showConfirmModal = async opts => { ctx.confirms.push(opts); return true; };
  ctx.logUserAction = (a, d) => ctx.logs.push([a, d]);
  ctx.window = ctx;
  vm.createContext(ctx);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
  ctx.recalculateAccounting(false);
  return ctx;
}
const plain = x => JSON.parse(JSON.stringify(x));
const closing = (c, code) => { const t = c.getAccountTurnover(c.state, code, '', ''); return t.closeDebit - t.closeCredit; };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const PAYROLL = [
  pay('PC1', '2025-07-08', '334', 59600000, 'Chi lương T6/2025'),
  pay('PC2', '2025-12-08', '334', 85 * M, 'chi lương T11'),
  pay('PC3', '2026-02-13', '334', 105510000, 'Chi lương tháng 13 /2025'),
  pay('PC4', '2026-02-25', '334', 2 * M, 'Chi thưởng têt lĩ xì'),
  pay('PC5', '2025-06-27', '338', 17728000, 'Chi nộp BHXH t06'),
  pay('PC6', '2026-01-07', '334', 69 * M, 'chi lương'),
  // Không phải lương: hoa hồng (quy tắc chuyển 641) và "lương" là địa danh/tên đường.
  pay('PC6859', '2025-10-12', '334', 3 * M, 'trích thầu anh nhà 17/17 lương thế vinh anh ưng'),
  pay('PC6440', '2025-01-07', '334', 1300000, 'chi trả anh hà lắp 2 máy đô lương'),
  // Kỳ trước ngày mở sổ (01/01/2025): nợ đầu kỳ, không phải chi phí của sổ này.
  pay('PC6437', '2025-01-06', '334', 54 * M, 'chi lương T12/2024'),
  pay('PC6456', '2025-01-22', '338', 16016000, 'Chi nộp BHXH'),
  pay('PC6448', '2025-01-17', '3331', 56461487, 'Chi nộp thuế GTGT tháng 12/2024'),
  pay('PC6505', '2025-02-19', '3331', 30 * M, 'Chi nộp thuế GTGT T1/2025')
];

test('trích lương/thưởng/BHXH: Nợ 642 / Có 334 (338), ngày cuối tháng nêu trong diễn giải, số phiếu theo phiếu chi', () => {
  const c = context({ vouchers: PAYROLL });
  const rows = plain(c.computePayrollAccrualSuggestions());
  const by = Object.fromEntries(rows.map(r => [r.paymentId, r]));
  assert.deepStrictEqual(Object.keys(by).sort(), ['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6']);
  assert.deepStrictEqual([by.PC1.id, by.PC1.date, by.PC1.amount, by.PC1.account, by.PC1.expenseAccount], ['TL-PC1', '2025-06-30', 59600000, '334', '642']);
  assert.strictEqual(by.PC2.date, '2025-11-30', 'T11 không ghi năm, chi tháng 12 → tháng 11 cùng năm');
  assert.strictEqual(by.PC3.date, '2025-12-31', 'lương tháng 13/2025 vào ngày 31/12/2025');
  assert.strictEqual(by.PC4.date, '2026-02-25', 'thưởng không nêu tháng → ngày chi');
  assert.strictEqual(by.PC6.date, '2026-01-07', 'không nêu kỳ, ngoài tháng mở sổ → ngày chi');
  assert.deepStrictEqual([by.PC5.id, by.PC5.account, by.PC5.date], ['TBH-PC5', '338', '2025-06-30']);
  rows.forEach(r => {
    assert.ok(['id', 'date', 'amount', 'account', 'description'].every(k => k in r));
    assert.ok(/10,5%/.test(r.reason) && /không có bảng lương/.test(r.reason), 'lý do nêu không tách 10,5% vì không có bảng lương');
  });
});

test('TT133 ghi Nợ 6422', () => {
  const c = context({ standard: 'TT133', vouchers: [pay('PC1', '2025-07-08', '334', 10 * M, 'Chi lương T6/2025')] });
  assert.strictEqual(plain(c.computePayrollAccrualSuggestions())[0].expenseAccount, '6422');
});

test('gần đúng nhưng không trích: hoa hồng trên 334, "lương" địa danh, kỳ trước ngày mở sổ, thuế GTGT', () => {
  const c = context({ vouchers: PAYROLL });
  const ids = plain(c.computePayrollAccrualSuggestions()).map(r => r.paymentId);
  ['PC6859', 'PC6440', 'PC6437', 'PC6456', 'PC6448', 'PC6505'].forEach(id => assert.ok(!ids.includes(id), id));
  assert.strictEqual(c.classifyPayrollPayment('334', 'Chi hoa hồng lương tháng 5'), null);
  assert.strictEqual(c.classifyPayrollPayment('338', 'Chi trả tiền điện'), null);
  assert.strictEqual(c.classifyPayrollPayment('3331', 'Chi tiền thuế GTGTNK + Vận chuyên bốc xếp lo hàng'), null);
});

test('áp dụng: mỗi phiếu cân, 334/338 về 0, lần quét thứ hai không còn gì; xóa phiếu chi vẫn nhận ra phiếu trích', async () => {
  const c = context({ vouchers: PAYROLL.filter(v => !['PC6859', 'PC6440', 'PC6437', 'PC6456'].includes(v.id)) });
  const res = plain(await c.applyPayrollAccrualSuggestions());
  assert.strictEqual(res.created.length, 6);
  const made = c.state.vouchers.filter(v => res.created.includes(v.id));
  made.forEach(v => {
    assert.strictEqual(v.type, 'general_journal');
    assert.strictEqual(v.entries.length, 1);
    assert.ok(v.entries[0].debit && v.entries[0].credit && v.entries[0].amount === v.amount);
    assert.ok(!v.accountWarnings, 'TK hợp lệ trong danh mục');
    assert.strictEqual(v.id.replace(/^T(L|BH)-/, ''), v.accrualFor);
  });
  assert.ok(Math.abs(closing(c, '334')) < 0.01 && Math.abs(closing(c, '338')) < 0.01);
  assert.strictEqual(c.computePayrollAccrualSuggestions().length, 0);
  assert.strictEqual(c.confirms.length, 1);
  assert.ok(c.logs.length === 1 && /TL-PC1/.test(c.logs[0][1]));
  // Xóa phiếu chi: phiếu trích vẫn mang accrualFor và số TL-<phiếu chi>, không bị đề xuất lại.
  c.state.vouchers = c.state.vouchers.filter(v => v.id !== 'PC1');
  assert.ok(c.state.vouchers.some(v => v.id === 'TL-PC1' && v.accrualFor === 'PC1'));
  assert.strictEqual(c.computePayrollAccrualSuggestions().length, 0);
});

test('khóa sổ: không lập phiếu trích có ngày trong kỳ đã khóa', async () => {
  const c = context({ vouchers: PAYROLL, lockedThrough: '2025-11-30' });
  const res = plain(await c.applyPayrollAccrualSuggestions());
  assert.deepStrictEqual(res.created.sort(), ['TL-PC3', 'TL-PC4', 'TL-PC6']);
  assert.strictEqual(res.skipped, 3);
  assert.ok(c.toasts.some(([, m]) => /kỳ đã khóa sổ/.test(m)));
});

test('người dùng chỉ xem không lập được phiếu', async () => {
  const c = context({ vouchers: PAYROLL });
  c.currentUser = { role: 'viewer' };
  const before = c.state.vouchers.length;
  await c.applyPayrollAccrualSuggestions();
  assert.strictEqual(c.state.vouchers.length, before);
});

test('số dư đầu kỳ: nợ có chứng từ 334/338/3331 trước, còn lại Có 4211; áp dụng xong cân và quét lại không còn gì', async () => {
  const c = context({ vouchers: PAYROLL });
  const plug = plain(c.computeOpeningBalancePlug());
  assert.strictEqual(plug.difference, 1200 * M);
  assert.deepStrictEqual(plug.lines.map(l => [l.account, l.side, Math.round(l.amount)]), [
    ['334', 'credit', 54 * M], ['338', 'credit', 16016000], ['3331', 'credit', 56461487],
    ['4211', 'credit', 1200 * M - 54 * M - 16016000 - 56461487]
  ]);
  assert.ok(await c.applyOpeningBalancePlug());
  const t = c.openingBalanceTotals();
  assert.ok(Math.abs(t.debit - t.credit) < 0.01);
  assert.strictEqual(c.state.initialBalances['4211'].type, 'credit');
  assert.strictEqual(plain(c.computeOpeningBalancePlug()).lines.length, 0);
  const msg = c.confirms.map(x => x.message).join(' ');
  assert.ok(/số cân đối cho phần số liệu bị thiếu trước ngày mở sổ/.test(msg) && /BCTC năm 2024/.test(msg) && /vốn góp, vay, lợi nhuận lũy kế/.test(msg));
  // Trích lương xong + khoản chi trước ngày mở sổ đã có số dư đầu kỳ: 334/338 về 0 sau khi chi.
  await c.applyPayrollAccrualSuggestions();
  assert.ok(Math.abs(closing(c, '3331') - 30000000) < 0.01, 'GTGT T1/2025 chi trong kỳ không có hóa đơn đầu ra trong test');
  assert.ok(Math.abs(closing(c, '334') - 4300000) < 0.01, 'chỉ còn hoa hồng và khoản lắp máy chưa xử lý');
  assert.ok(Math.abs(closing(c, '338')) < 0.01);
});

test('số dư đầu kỳ: TK đã có số dư thì không thêm dòng có chứng từ; 4211 đã có thì điều chỉnh số dư đó', async () => {
  const c = context({ vouchers: PAYROLL });
  c.state.initialBalances['334'] = { name: 'Phải trả NLĐ', type: 'credit', balance: 10 * M };
  c.state.initialBalances['4211'] = { name: 'LNST lũy kế', type: 'credit', balance: 50 * M };
  let plug = plain(c.computeOpeningBalancePlug());
  assert.ok(!plug.lines.some(l => l.account === '334'));
  const l4211 = plug.lines.find(l => l.account === '4211');
  assert.strictEqual(Math.round(l4211.amount), 1200 * M - 10 * M - 50 * M - 16016000 - 56461487);
  assert.deepStrictEqual(l4211.before, { type: 'credit', balance: 50 * M });
  await c.applyOpeningBalancePlug();
  assert.ok(Math.abs(c.openingBalanceTotals().difference) < 0.01);
  // Sau một lần sửa khác (vd. xóa đầu kỳ ảo 131 làm giảm dư Nợ), dùng lại công cụ: chỉ điều chỉnh 4211.
  c.state.initialBalances['156'].balance -= 300 * M;
  plug = plain(c.computeOpeningBalancePlug());
  assert.deepStrictEqual(plug.lines.map(l => [l.account, l.side, Math.round(l.amount)]), [['4211', 'debit', 300 * M]]);
  const before4211 = c.state.initialBalances['4211'].balance;
  await c.applyOpeningBalancePlug();
  assert.ok(Math.abs(c.state.initialBalances['4211'].balance - (before4211 - 300 * M)) < 0.01);
  assert.ok(Math.abs(c.openingBalanceTotals().difference) < 0.01);
  // Dư Có vượt dư Nợ: 4211 đổi sang dư Nợ.
  c.state.initialBalances['156'].balance -= 2000 * M;
  await c.applyOpeningBalancePlug();
  assert.strictEqual(c.state.initialBalances['4211'].type, 'debit');
  assert.ok(Math.abs(c.openingBalanceTotals().difference) < 0.01);
});

test('số dư đầu kỳ: khóa sổ chỉ quản trị viên được sửa; không đụng 131/331', async () => {
  const c = context({ vouchers: PAYROLL, lockedThrough: '2025-12-31' });
  c.currentUser = { role: 'accountant' };
  assert.strictEqual(await c.applyOpeningBalancePlug(), false);
  assert.ok(!c.state.initialBalances['4211']);
  c.currentUser = { role: 'admin' };
  const before331 = JSON.stringify(c.state.initialBalances['331']);
  assert.ok(await c.applyOpeningBalancePlug());
  assert.strictEqual(JSON.stringify(c.state.initialBalances['331']), before331);
});

test('TK 4211/334/338/3331 hợp lệ ở cả hai chế độ', () => {
  const c = context();
  ['TT99', 'TT133'].forEach(std => ['4211', '334', '338', '3331', '642', '6422'].forEach(code => assert.ok(c.isValidAccount(code, std), `${code} ${std}`)));
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok - ${t.name}`); }
    catch (e) { failed++; console.error(`FAIL - ${t.name}\n${e.stack}`); }
  }
  if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
  console.log(`${tests.length} book-fix tests passed`);
})();
