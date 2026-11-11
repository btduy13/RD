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

const plainRows = x => JSON.parse(JSON.stringify(x)); // đối tượng tạo trong vm khác realm

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
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/accounting.js']);
    c.recalculateAccounting(false);
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
    const c = makeContext({}, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js']);
    const supplier = { salesOn131: 0, purchasesOn331: 3 };
    const customer = { salesOn131: 5, purchasesOn331: 0 };
    const s = (...a) => c.suggestCashAccountFix(...a);
    assert.equal(s('payment', '333', 'Chi nộp thuế GTGT tháng 12/2024', null, '', null).to, '3331');
    assert.equal(s('payment', '333', 'Chi nộp thuế môn bài 2025', null, '', null).to, '3338');
    assert.equal(s('payment', '333', 'Chi nộp thuế GTGT + phí lô hàng nhập khẩu', null, '', null), null, 'mixed tax+fee payments are left for manual split');
    assert.equal(s('payment', '341', 'tất toán tiền nợ QTM', { name: 'CTY QUÁCH TUẤN MINH' }, 'TUANMINH', supplier).to, '331');
    assert.equal(s('payment', '341', 'Chi khác 149 thùy vân tất toán không thu được', { name: 'Mua lẻ' }, 'ML1', supplier).to, '642', 'bad-debt write-off is an expense, not a loan repayment');
    assert.ok(s('payment', '341', 'Chi khác 149 thùy vân tất toán không thu được', { name: 'Mua lẻ' }, 'ML1', supplier).reason.includes('Tài sản & dự phòng'), 'reason points to the write-off voucher flow');
    assert.equal(s('payment', '331', 'Chi thầu anh chinh nhà 64/4 ngyễn hới', undefined, 'DT_8061', null).to, '641', 'commission to a partner missing from the catalog');
    assert.equal(s('payment', '331', 'Trích thầu nhà 50', { name: 'Thầu' }, 'SP_9304', supplier), null, 'existing payee keeps 331');
    assert.equal(s('payment', '341', 'Trả nợ vay ngân hàng', { name: 'Ngân hàng Sacombank' }, 'SACOMBANK', supplier), null);
    assert.equal(s('payment', '156', 'Chi Ck tiền mua hàng', { name: 'NHẬP HÀNG TQ' }, 'TQ', supplier).to, '331');
    assert.equal(s('payment', '156', 'Chi Ck tiền mua hàng', { name: 'NCC mới' }, 'NEW', { salesOn131: 0, purchasesOn331: 0 }), null);
    assert.equal(s('receipt', '341', 'PT3713/q75 Anh Lực CK sacombank', { name: 'Anh Lực' }, 'KH1', null).to, '131');
    assert.equal(s('receipt', '341', 'Giải ngân khoản vay', { name: 'Sacombank' }, 'SACOMBANK', null), null);
    assert.equal(s('receipt', '341', 'Nhận tiền vay anh Hai', { name: 'Anh Hai' }, 'KH2', null), null, '"vay" in description keeps 341');
    assert.equal(s('receipt', '511', 'Thu tiền bán hàng', { name: 'Anh Thiện' }, 'KH3', customer).to, '131');
    assert.equal(s('receipt', '511', 'Thu tiền bán hàng', { name: 'CH Thành Công' }, 'KH4', { salesOn131: 0, purchasesOn331: 0 }), null);
    assert.equal(s('receipt', '511', 'Thu tiền bán hàng', { name: 'A' }, 'KH4', { salesOn131: 1, purchasesOn331: 0, firstSale131: '2026-01-16' }, '2025-04-03'), null, 'a later credit sale is no evidence for an earlier receipt');
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
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/accounting.js', 'js/modules/reports.js']);
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
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/modules/debts.js']);
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

  await test('rules: loan interest, supplier on 131, commission, owner spending, running costs', () => {
    const c = makeContext({}, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js']);
    const s = (...a) => c.suggestCashAccountFix(...a);
    const none = { salesOn131: 0, purchasesOn331: 0 };
    const bank = { name: 'Ngân hàng sacombank', type: 'supplier' };
    const walkIn = { name: 'Mua lẻ', type: 'supplier' };
    const walkInStats = { salesOn131: 10, purchasesOn331: 14 }; // nhóm gộp vẫn có phiếu nhập ghi 331
    const realSupplier = { name: 'CTy HWATA', type: 'supplier' };

    // R1 lãi vay → 635
    assert.equal(s('payment', '341', 'Chi trả lZaxi vay ngân hàng sacombank T01/2026', bank, 'SACOMBANK', none).to, '635', 'Telex typo still reads as interest');
    assert.equal(s('payment', '341', 'Chi nộp lãi T04/2026', bank, 'SACOMBANK', none).to, '635');
    assert.equal(s('payment', '341', 'chi tiền lãi vay sacobank', null, '', null).to, '635');
    assert.equal(s('payment', '341', 'chi trả tiền vay sacombank', bank, 'SACOMBANK', none), null, 'plain loan repayment keeps 341');
    assert.equal(s('payment', '341', 'chi trả gốc + lãi vay sacombank', bank, 'SACOMBANK', none), null, 'principal + interest needs a manual split');
    assert.equal(s('payment', '341', 'Chi trả lại tiền vay anh Hai', { name: 'Anh Hai' }, 'KH2', none), null, '"trả lại" is a refund, not interest');
    assert.equal(s('payment', '341', 'chi tra lai tien vay', bank, 'SACOMBANK', none), null, 'unaccented "tra lai" is ambiguous');

    // R2 trả tiền NCC ghi Nợ 131 → 331: cần đối tác là NCC và không có hóa đơn bán chịu
    assert.equal(s('payment', '131', 'Trả tiền mua hàng cho nhà cung cấp', realSupplier, 'HWATA', { salesOn131: 0, purchasesOn331: 49 }).to, '331');
    assert.equal(s('payment', '131', 'Trả tiền mua hàng cho nhà cung cấp', { name: 'Cty Ecocrop', type: 'project' }, 'ECOCROP(CH)', { salesOn131: 4, purchasesOn331: 0 }), null,
      'default form text on a customer refund is no evidence');
    assert.equal(s('payment', '131', 'Hoàn tiền khách trả thừa', realSupplier, 'HWATA', { salesOn131: 0, purchasesOn331: 49 }), null);

    // R3 hoa hồng/trích thầu → 641
    assert.equal(s('payment', '331', 'Chi hoa hồng anh tự 2025', walkIn, 'ML1', walkInStats).to, '641', 'walk-in bucket');
    assert.equal(s('payment', '331', 'Chi hooa hồng an thợ nươc', { name: 'Khách hàng vãng lai', type: 'supplier' }, 'SP_9304', walkInStats).to, '641');
    assert.equal(s('payment', '331', 'Trích thầu chị kim anh 670', { name: 'Chị Kim Anh', type: 'retail' }, 'KH7669', none).to, '641', 'payee is a customer, not a supplier');
    assert.equal(s('payment', '334', 'trích thầu 17/17/4 lương thé vinh', walkIn, 'ML1', walkInStats).to, '641');
    assert.equal(s('payment', '331', 'Chi hoa hồng đại lý', realSupplier, 'HWATA', { salesOn131: 0, purchasesOn331: 49 }), null, 'a real supplier keeps 331');
    assert.equal(s('payment', '334', 'Chi hoa hồng tháng 5', { name: 'Nguyễn Văn A', type: 'employee' }, 'NV1', none), null, 'employee commission may run through payroll');
    assert.equal(s('payment', '331', 'Chi trả tiền thầu phụ lắp đặt', walkIn, 'ML1', walkInStats), null);

    // R4 chi tiêu cá nhân của chủ → 1388
    assert.equal(s('payment', '331', 'Chi nộp học phí minh', walkIn, 'ML1', walkInStats).to, '1388');
    assert.equal(s('payment', '331', 'Chi tền ký tuc xá minh', undefined, 'DT_1', null).to, '1388', 'partner missing from the catalog');
    assert.equal(s('payment', '331', 'Chi học phí khóa đào tạo', realSupplier, 'HWATA', { salesOn131: 0, purchasesOn331: 49 }), null);
    assert.equal(s('payment', '642', 'Chi nộp học phí minh', walkIn, 'ML1', walkInStats), null, 'only Nợ 331 is reassigned');

    // R5 chi phí vận hành ghi nhóm vãng lai → 642
    assert.equal(s('payment', '331', 'Chi đổ dâu xe tải', walkIn, 'ML1', walkInStats).to, '642');
    assert.equal(s('payment', '331', 'chi trả tiền Đt + nươc', walkIn, 'ML1', walkInStats).to, '642');
    assert.equal(s('payment', '331', 'chi trả tiền nước lavi', walkIn, 'ML1', walkInStats).to, '642');
    assert.equal(s('payment', '331', 'Chi tiền internet vietel T2/2026', walkIn, 'ML1', walkInStats).to, '642');
    for (const desc of ['Chi mua ống nước', 'Chi anh sơn thợ nước', 'Chi mua nước rửa chén', 'chi tiền nước rửa chén', 'chi tiền điện máy xanh', 'Chi mua dầu nhớt']) {
      assert.equal(s('payment', '331', desc, walkIn, 'ML1', walkInStats), null, desc);
    }
    assert.equal(s('payment', '331', 'Chi đổ dầu xe tải', realSupplier, 'HWATA', { salesOn131: 0, purchasesOn331: 49 }), null, 'only the walk-in bucket');
  });

  await test('cash leg booked to 111 moves to 112 when the description names a bank channel', async () => {
    const c = makeContext({}, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js']);
    const cash = (type, description, partner, partnerId, counter = type === 'receipt' ? '131' : '331') => plainRows(c.suggestBankChannelFixes({
      type, partnerId, description,
      entries: [type === 'receipt' ? { debit: '111', credit: counter, amount: 50 } : { debit: counter, credit: '111', amount: 50 }]
    }, partner));
    const kh = { name: 'Anh Thiều', type: 'retail' }, ncc = { name: 'CTy HWATA', type: 'supplier' }, bank = { name: 'Ngân hàng sacombank', type: 'supplier' };

    const pay = cash('payment', 'chi tra hwta ck scb', ncc, 'HWATA');
    assert.deepEqual(pay.map(f => [f.from, f.to, f.side, f.index, f.amount]), [['111', '112', 'credit', 0, 50]]);
    assert.match(pay[0].reason, /Nợ 112\/Có 111/, 'reason warns a cash deposit entry may be needed');
    assert.deepEqual(cash('receipt', 'anh thieu ck', kh, 'KH1').map(f => f.side), ['debit']);
    assert.equal(cash('receipt', 'PT3735/q75 Anh Thạch thầu sacombank', kh, 'KH1').length, 1);
    assert.equal(cash('payment', 'Chi trả HWta BIDV', ncc, 'HWATA').length, 1);
    assert.equal(cash('payment', 'chi trả tiền vay sacombank', bank, 'SACOMBANK', '341').length, 0, 'the bank is the payee, not the channel');
    assert.equal(cash('receipt', 'thu vay sacombank tm', bank, 'SACOMBANK', '341').length, 0);
    assert.equal(cash('receipt', 'thu tiền bán hàng ck 50% còn lại TM', kh, 'KH1').length, 0, 'cash marker wins');
    assert.equal(cash('receipt', 'thu tiền hàng đã trừ ck 5%', kh, 'KH1').length, 0, '"ck 5%" is a discount');
    assert.equal(cash('payment', 'chi thanh toán HWata vay sacombank', ncc, 'HWATA').length, 0, 'loan paid straight to the supplier is left to the accountant');
    assert.equal(cash('payment', 'chi mua backup pin', ncc, 'HWATA').length, 0, 'word-bounded');

    const state = {
      accountingStandard: 'TT200', products: [], initialBalances: {}, partnerOpeningBalances: {},
      partners: [{ id: 'ML1', name: 'Mua lẻ', type: 'supplier' }],
      vouchers: [
        { id: 'PC1', type: 'payment', date: '2026-07-03', partnerId: 'ML1', paymentMethod: '111', amount: 80, description: 'Chi hoa hồng anh thắng ck',
          entries: [{ debit: '331', credit: '111', amount: 80 }] },
        { id: 'PC2', type: 'payment', date: '2026-07-04', partnerId: 'ML1', paymentMethod: '111', amount: 20, description: 'chi mua vật tư tm', entries: [{ debit: '331', credit: '111', amount: 20 }] }
      ]
    };
    const d = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/modules/debts.js']);
    let confirmMsg = '', logged = '';
    d.showConfirmModal = async o => { confirmMsg = o.message; return true; };
    d.saveStateAndSyncVoucher = async () => true;
    d.recalculateAccounting = () => {};
    d.logUserAction = (_t, x) => { logged = x; };
    d.filterDebts = () => {};
    assert.equal(d.window.computeBankChannelFixes, d.computeBankChannelFixes, 'exposed on window');
    assert.deepEqual(plainRows(d.computeCashAccountFixSuggestions()).map(r => [r.id, r.from, r.to, r.amount]), [['PC1', '331', '641', 80]],
      'counter-account fixes no longer carry the bank-channel leg');
    assert.deepEqual(plainRows(d.computeBankChannelFixes()).map(r => [r.id, r.from, r.to, r.amount]), [['PC1', '111', '112', 80]]);
    const html = d.renderBankChannelFixBlock(d.computeBankChannelFixes(), x => x);
    assert.match(html, /Chuyển sang TK 112 \(1\)/);
    assert.match(html, /Nợ 112\/Có 111/, 'block reminds to book deposits per bank statement');
    assert.match(html, /data-role-required="write"/);

    // Sửa TK đối ứng không chạm vế tiền
    await d.applyCashAccountFixes();
    assert.deepEqual(plainRows(state.vouchers[0].entries), [{ debit: '641', credit: '111', amount: 80 }]);
    assert.equal(state.vouchers[0].paymentMethod, '111');
    assert.equal(d.computeCashAccountFixSuggestions().length, 0);
    assert.equal(d.computeBankChannelFixes().length, 1, 'bank-channel fix waits for its own button');

    // Nút riêng 111 → 112, bỏ qua kỳ đã khóa
    state.vouchers.push({ id: 'PT1', type: 'receipt', date: '2025-12-20', partnerId: 'ML1', paymentMethod: '111', amount: 30, description: 'thu anh A ck', entries: [{ debit: '111', credit: '131', amount: 30 }] });
    state.lockedThrough = '2025-12-31';
    await d.applyBankChannelFixes();
    assert.match(confirmMsg, /Nợ 112\/Có 111/);
    assert.deepEqual(plainRows(state.vouchers[0].entries), [{ debit: '641', credit: '112', amount: 80 }]);
    assert.equal(state.vouchers[0].paymentMethod, '112', 'cash book filter follows the cash leg');
    assert.equal(state.vouchers[1].entries[0].credit, '111');
    assert.equal(state.vouchers[2].entries[0].debit, '111', 'locked period skipped');
    assert.match(logged, /PC1: 111→112/);
    assert.ok(d.toasts.some(([, msg]) => /Bỏ qua 1 chứng từ thuộc kỳ đã khóa sổ/.test(msg)));
    assert.deepEqual(plainRows(d.computeBankChannelFixes()).map(r => r.id), ['PT1']);
    state.lockedThrough = '';
    await d.applyBankChannelFixes();
    assert.equal(d.computeBankChannelFixes().length, 0, 'idempotent');
  });

  await test('retail sales counted twice in cash move to 131 only when partner totals reconcile', async () => {
    const sale = (id, date, partnerId, amount, type = 'sales') => ({ id, type, date, partnerId, paymentMethod: '111', taxRate: 0, isManual: true,
      items: [{ productId: 'P', qty: 1, price: amount, amount, vatRate: 0 }] });
    const receipt = (id, date, partnerId, amount) => ({ id, type: 'receipt', date, partnerId, paymentMethod: '111', amount, description: `${id} Bán lẻ`, isManual: true,
      entries: [{ debit: '111', credit: '131', amount, desc: `${id} Bán lẻ` }] });
    const state = {
      accountingStandard: 'TT200', products: [{ id: 'P', name: 'Hàng', initialStock: 1000, initialCost: 1 }],
      initialBalances: { '111': { type: 'debit', balance: 0 }, '131': { type: 'debit', balance: 430 } },
      partnerOpeningBalances: { BL1: { debit: 300, credit: 0 }, BL4: { debit: 130, credit: 0 } }, partnerOpeningBalanceTs: {},
      partners: ['BL1', 'BL2', 'BL3', 'BL4', 'KH5'].map(id => ({ id, name: id === 'KH5' ? 'Anh Năm' : `Bán lẻ ${id}`, type: 'retail' })),
      vouchers: [
        // BL1: dư Nợ đầu kỳ 300 = bán 111 thuần (200 + 120 − 20) → đầu kỳ ảo; phiếu thu cuối tháng giữ nguyên
        sale('BH1', '2026-05-02', 'BL1', 200), sale('BH2', '2026-05-20', 'BL1', 120), sale('TL1', '2026-05-21', 'BL1', 20, 'sales_return'),
        receipt('PT1', '2026-05-31', 'BL1', 300),
        // BL2: không đầu kỳ, phiếu thu 100 = bán 111 (100) — hóa đơn thuộc kỳ đã khóa ở lần áp dụng đầu
        sale('BH3', '2025-12-10', 'BL2', 100), receipt('PT2', '2026-01-05', 'BL2', 100),
        // BL3: phiếu thu lệch 10% → cần xem; BL4: đầu kỳ 130 ≠ bán 100 → cần xem
        sale('BH4', '2026-02-01', 'BL3', 100), receipt('PT3', '2026-02-28', 'BL3', 110),
        sale('BH5', '2026-03-01', 'BL4', 100), receipt('PT4', '2026-03-31', 'BL4', 130),
        // KH5: bán tiền mặt bình thường, không có phiếu thu Có 131 → không liệt kê
        sale('BH6', '2026-03-02', 'KH5', 50)
      ]
    };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/accounting.js', 'js/modules/debts.js']);
    let saved = 0, logged = '';
    c.showConfirmModal = async () => true;
    c.saveStateAndSyncVoucher = async () => { saved++; return true; };
    c.logUserAction = (_t, d) => { logged = d; };
    c.filterDebts = () => {};
    c.formatDateDisplay = d => d;
    c.recalculateAccounting(false);
    const ledger = () => {
      const m = {};
      state.vouchers.forEach(v => (v.entries || []).forEach(e => {
        m[e.debit] = (m[e.debit] || 0) + e.amount; m[e.credit] = (m[e.credit] || 0) - e.amount;
      }));
      return m;
    };
    const ib = code => state.initialBalances[code].balance;
    const partner131 = pid => (state.partnerOpeningBalances[pid] ? state.partnerOpeningBalances[pid].debit : 0)
      + state.vouchers.filter(v => v.partnerId === pid).reduce((s, v) => s + v.entries.reduce((t, e) => t + (e.debit === '131' ? e.amount : 0) - (e.credit === '131' ? e.amount : 0), 0), 0);
    const before = ledger();

    const scan = plainRows(c.scanRetailDoubleCash());
    assert.deepEqual(scan.fixes.map(r => [r.id, r.date, r.amount]), [['BH3', '2025-12-10', 100], ['BH1', '2026-05-02', 200], ['BH2', '2026-05-20', 120], ['TL1', '2026-05-21', -20]],
      'returns carry a negative amount so the rows sum to the double-counted cash');
    assert.deepEqual(scan.openings.map(o => [o.partnerId, o.debit]), [['BL1', 300]]);
    assert.deepEqual(scan.review.map(r => r.partnerId), ['BL3', 'BL4'], 'near misses are listed, not fixed');
    assert.equal(c.window.computeRetailDoubleCashFixes().length, 4, 'dashboard contract: rows with amount');
    const html = c.renderRetailDoubleCashBlock(scan, d => d);
    assert.match(html, /2 đối tác cần xem/);
    assert.match(html, /Chuyển sang 131 và xóa đầu kỳ ảo \(4\)/);
    assert.match(html, /data-role-required="write"/);

    // BL2 có hóa đơn trong kỳ đã khóa → bỏ qua cả đối tác
    state.lockedThrough = '2025-12-31';
    c.window.currentUser = { role: 'admin' };
    await c.applyRetailDoubleCashFixes();
    const byId = id => state.vouchers.find(v => v.id === id);
    assert.deepEqual(['BH1', 'BH2', 'TL1', 'BH3'].map(id => byId(id).paymentMethod), ['131', '131', '131', '111']);
    assert.deepEqual(plainRows(byId('TL1').entries.filter(e => e.credit === '131').map(e => e.debit)), ['5212'], 'return now reduces 131');
    assert.equal(state.partnerOpeningBalances.BL1.debit, 0, 'phantom opening cleared');
    assert.equal(state.partnerOpeningBalances.BL4.debit, 130, 'unreconciled partner untouched');
    assert.ok(state.partnerOpeningBalanceTs.BL1 > 0, 'opening edit stamped for sync');
    assert.equal(ib('131'), 130, 'ledger opening follows partner detail');
    assert.ok(c.toasts.some(([, msg]) => /Bỏ qua 1 chứng từ thuộc kỳ đã khóa sổ/.test(msg)));
    assert.match(logged, /BH1; BH2; TL1/);
    assert.equal(partner131('BL1'), 0, 'receipt now settles the invoices');

    state.lockedThrough = '';
    await c.applyRetailDoubleCashFixes();
    assert.equal(byId('BH3').paymentMethod, '131');
    assert.equal(partner131('BL2'), 0);
    const after = ledger();
    assert.equal(after['111'] - before['111'], -400, 'cash drops by the double-counted amount (300 + 100)');
    assert.equal(after['511'], before['511'], 'revenue unchanged');
    assert.equal(after['5212'], before['5212']);
    const sums = entrySums(state.vouchers);
    assert.equal(sums.debit, sums.credit, 'ledger stays balanced');
    const detail = ['BL1', 'BL2', 'BL3', 'BL4', 'KH5'].reduce((s, pid) => s + partner131(pid), 0);
    assert.equal(ib('131') + after['131'], detail, 'ledger 131 equals partner detail');
    assert.equal(byId('PT1').entries[0].credit, '131', 'receipts kept');
    assert.equal(byId('BH6').paymentMethod, '111', 'ordinary cash sale untouched');
    assert.equal(saved, 2);
    assert.equal(c.computeRetailDoubleCashFixes().length, 0, 'idempotent');
    assert.equal(c.scanRetailDoubleCash().review.length, 2, 'near misses stay listed');

    c.window.currentUser = { role: 'viewer' };
    byId('BH1').paymentMethod = '111';
    await c.applyRetailDoubleCashFixes();
    assert.equal(saved, 2, 'viewer cannot apply');
  });

  await test('Excel cash-book import rules never apply the bank-channel leg', () => {
    const src = read('js/excel-integration.js');
    assert.ok(!/suggestBankChannelFixes|isBankChannelDescription|computeBankChannelFixes/.test(src));
    const c = makeContext({}, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js']);
    assert.equal(c.suggestCashAccountFix('payment', '331', 'chi tra hwta ck scb', { name: 'CTy HWATA', type: 'supplier' }, 'HWATA', { salesOn131: 0, purchasesOn331: 3 }), null);
  });

  await test('legacy stock-count vouchers get adjustCause "unknown"; quantity errors are listed, not changed', async () => {
    const legacy = (id, date, productId, qty, dir, amount) => ({
      id, type: 'inventory_adjust', date, isManual: true, description: `Điều chỉnh tồn kho ${id}. Lý do: aa`, amount, totalAmount: amount,
      items: [{ productId, qty, adjustDir: dir, price: amount / qty, amount }],
      entries: [dir === 'in' ? { debit: '156', credit: '711', amount } : { debit: '632', credit: '156', amount }]
    });
    const state = {
      accountingStandard: 'TT200', partners: [], initialBalances: {}, partnerOpeningBalances: {},
      products: [
        { id: 'P', name: 'Co 25', initialStock: 10, initialCost: 100 },
        { id: 'Q', name: 'Dây đồng trần', initialStock: 86, initialCost: 1000 },
        { id: 'R', name: 'Keo dán', initialStock: 0, initialCost: 50 }
      ],
      vouchers: [
        legacy('DK1', '2026-07-03', 'P', 3, 'out', 300),
        legacy('DK2', '2026-07-04', 'P', 2, 'in', 200),
        legacy('DK3', '2026-10-23', 'Q', 86000, 'out', 86000000), // gõ nhầm ×1000: tồn 86 → −85.914
        { id: 'NK1', type: 'purchase', date: '2026-10-24', isManual: true, paymentMethod: '111', items: [{ productId: 'Q', qty: 85914, price: 0, amount: 0 }] },
        { id: 'BH1', type: 'sales', date: '2026-08-01', isManual: true, paymentMethod: '131', items: [{ productId: 'R', qty: 1, price: 80, amount: 80 }] },
        legacy('DK4', '2026-09-04', 'R', 3, 'in', 150), // điều chỉnh khi tồn đang âm (−1 → 2)
        { ...legacy('DK5', '2026-07-05', 'P', 1, 'out', 100), adjustCause: 'norm' },
        legacy('DK6', '2025-12-30', 'P', 1, 'out', 100) // thuộc kỳ đã khóa sổ
      ]
    };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/accounting.js', 'js/modules/debts.js']);
    let saved = 0, logged = '';
    c.showConfirmModal = async () => true;
    c.saveStateAndSyncVoucher = async () => { saved++; return true; };
    c.logUserAction = (_t, d) => { logged = d; };
    c.filterDebts = () => {};
    c.recalculateAccounting(false);
    const byId = id => state.vouchers.find(v => v.id === id);
    const pair = id => byId(id).entries.map(e => `${e.debit}/${e.credit}:${e.amount}`).join(' ');
    const credit632 = () => plainRows(state.vouchers.flatMap(v => (v.entries || []).filter(e => e.credit === '632').map(e => [v.id, e.amount])));
    assert.equal(pair('NK1'), '156/111:0 156/632:85914000', 'the refill reverses the over-posted cost of goods');
    const reversal = credit632();

    const scan = plainRows(c.scanLegacyInventoryAdjusts());
    assert.deepEqual(scan.fixes.map(r => [r.id, r.date, r.amount, r.direction]),
      [['DK6', '2025-12-30', 100, 'out'], ['DK1', '2026-07-03', 300, 'out'], ['DK2', '2026-07-04', 200, 'in']]);
    assert.deepEqual(scan.excluded.map(r => r.id), ['DK4', 'DK3'], 'vouchers touching negative stock are quantity errors');
    assert.equal(c.computeInventoryAdjustCauseFixes().length, 3, 'dashboard contract: rows with amount');
    const html = c.renderInventoryAdjustCauseBlock(scan, d => d);
    assert.match(html, /2 phiếu cần sửa số lượng/);
    assert.match(html, /Ghi nguyên nhân "chưa rõ" \(3\)/);
    assert.match(html, /data-role-required="write"/);

    state.lockedThrough = '2025-12-31';
    await c.applyInventoryAdjustCauseFixes();
    assert.equal(byId('DK1').adjustCause, 'unknown');
    assert.equal(pair('DK1'), '1381/156:300', 'shortage waits on 1381, not cost of goods');
    assert.equal(pair('DK2'), '156/3381:200', 'surplus waits on 3381, not other income');
    assert.equal(byId('DK3').adjustCause, undefined, 'quantity error untouched');
    assert.equal(pair('DK3'), '632/156:86000000');
    assert.equal(pair('DK4'), '156/711:150');
    assert.equal(pair('DK5'), '632/156:100', 'voucher with a recorded cause untouched');
    assert.equal(pair('DK6'), '632/156:100', 'locked period skipped');
    assert.deepEqual(credit632(), reversal, 'no new credit on 632');
    const sums = entrySums(state.vouchers);
    assert.equal(sums.debit, sums.credit, 'ledger stays balanced');
    assert.equal(saved, 1);
    assert.match(logged, /2 phiếu: DK1; DK2/);
    assert.ok(c.toasts.some(([, msg]) => /Bỏ qua 1 chứng từ thuộc kỳ đã khóa sổ/.test(msg)));

    state.lockedThrough = '';
    await c.applyInventoryAdjustCauseFixes();
    assert.equal(pair('DK6'), '1381/156:100');
    assert.equal(c.computeInventoryAdjustCauseFixes().length, 0, 'idempotent');
    assert.equal(c.scanLegacyInventoryAdjusts().excluded.length, 2, 'quantity errors stay listed until fixed');

    c.window.currentUser = { role: 'viewer' };
    byId('DK1').adjustCause = undefined;
    await c.applyInventoryAdjustCauseFixes();
    assert.equal(saved, 2, 'viewer cannot apply');
  });

  await test('orphan partner vouchers relink by name to existing partners only', async () => {
    const state = {
      accountingStandard: 'TT133', products: [], initialBalances: {}, partnerOpeningBalances: {},
      partners: [
        { id: 'BANLET01/2025(CH)', name: 'Bán lẻ T01/2025', type: 'retail' },
        { id: 'NCC1', name: 'Công ty Lan Thanh', type: 'supplier' },
        { id: 'A1', name: 'Anh Thanh', type: 'retail' }, { id: 'A2', name: 'Anh Thanh', type: 'retail' },
        { id: 'KH1', name: 'Anh Lực', type: 'project' }
      ],
      vouchers: [
        { id: 'BH1', type: 'sales', date: '2025-01-04', partnerId: 'DT_1735', partnerName: 'Bán lẻ T01/2025 - A Nam cty', totalAmount: 100, _updatedAt: 3 },
        { id: 'BH2', type: 'sales', date: '2025-02-05', partnerId: 'DT_5430', partnerName: 'Bán Lẻ T02/2025', totalAmount: 50 },
        { id: 'BH3', type: 'sales', date: '2025-01-05', partnerId: 'DT_1', partnerName: 'Anh Thanh', totalAmount: 7 },
        { id: 'BH4', type: 'sales', date: '2025-01-06', partnerId: 'DT_2', partnerName: 'Công ty Lan Thanh', totalAmount: 9 },
        { id: 'NK1', type: 'purchase', date: '2025-01-06', partnerId: '', partnerName: 'Công ty Lan Thanh', totalAmount: 11, needsReview: true },
        { id: 'BH5', type: 'sales', date: '2025-01-07', partnerId: 'kh1', partnerName: 'Tên cũ', totalAmount: 1 },
        { id: 'BH6', type: 'sales', date: '2025-01-08', partnerId: 'KH1', partnerName: 'Anh Lực', totalAmount: 1 }
      ]
    };
    const c = makeContext(state, ['js/utils.js', 'js/core/partner-identity.js', 'js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/excel-integration.js', 'js/modules/debts.js']);
    c.showConfirmModal = async () => true;
    let saved = 0;
    c.saveStateAndSyncVoucher = async () => { saved++; return true; };
    c.recalculateAccounting = () => {};
    c.logUserAction = () => {};
    c.filterDebts = () => {};
    const rows = c.computeOrphanPartnerRelinks();
    assert.deepEqual(rows.map(r => `${r.id}:${r.from}>${r.to}`), ['BH1:DT_1735>BANLET01/2025(CH)', 'NK1:>NCC1'],
      'prefix match only; no match, ambiguous names, supplier on sales and case-only ids are left alone');
    assert.match(c.renderOrphanPartnerRelinkBlock(rows, d => d), /Gán lại đối tác theo tên \(2\)/);
    await c.applyOrphanPartnerRelinks();
    const byId = id => state.vouchers.find(v => v.id === id);
    assert.equal(byId('BH1').partnerId, 'BANLET01/2025(CH)');
    assert.equal(byId('BH1').partnerName, 'Bán lẻ T01/2025 - A Nam cty', 'file name snapshot kept');
    assert.ok(byId('BH1')._updatedAt > 3);
    assert.equal(byId('NK1').partnerId, 'NCC1');
    assert.equal(byId('NK1').needsReview, undefined);
    assert.equal(byId('BH2').partnerId, 'DT_5430', 'unresolved stays for manual review');
    assert.equal(byId('BH5').partnerId, 'kh1', 'case-insensitive id already resolves, untouched');
    assert.equal(saved, 1);
    assert.equal(c.computeOrphanPartnerRelinks().length, 0);
  });

  await test('orphan codes with debt and no catalog match get a new partner, never a same-name one', async () => {
    const state = {
      accountingStandard: 'TT133', products: [], initialBalances: {}, partnerOpeningBalances: {},
      deletedIds: ['KL_CHIHUONG'],
      partners: [{ id: 'H1', name: 'Chị Hương', type: 'retail' }, { id: 'H2', name: 'Chị Hương', type: 'retail' }],
      vouchers: [
        { id: 'BH1', type: 'sales', date: '2025-05-19', partnerId: 'DT_4231', partnerName: 'Chị Hương', paymentMethod: '131', totalAmount: 100, entries: [{ debit: '131', credit: '511', amount: 100 }] },
        { id: 'PT1', type: 'receipt', date: '2025-05-20', partnerId: 'DT_4231', partnerName: 'Chị Hương', amount: 40, entries: [{ debit: '111', credit: '131', amount: 40 }] },
        { id: 'BH2', type: 'sales', date: '2025-05-21', partnerId: 'DT_9', partnerName: 'Khách lẻ', paymentMethod: '111', totalAmount: 5, entries: [{ debit: '111', credit: '511', amount: 5 }] },
        { id: 'BH3', type: 'sales', date: '2026-07-01', partnerName: 'BẮC KỊNH (CH; A Tự)', paymentMethod: '131', totalAmount: 7, entries: [{ debit: '131', credit: '511', amount: 7 }] },
        { id: 'PC1', type: 'payment', date: '2025-05-29', partnerId: 'DT_8061', partnerName: 'BÁN HÀNG THU TIỀN MẶT', amount: 3, description: 'Chi thầu anh chinh', entries: [{ debit: '331', credit: '111', amount: 3, desc: 'Chi thầu anh chinh' }] }
      ]
    };
    const c = makeContext(state, ['js/utils.js', 'js/core/partner-identity.js', 'js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/excel-integration.js', 'js/modules/debts.js']);
    c.showConfirmModal = async () => true;
    c.saveStateAndSyncVoucher = async () => true;
    c.recalculateAccounting = () => {};
    c.logUserAction = () => {};
    c.filterDebts = () => {};
    const rows = c.computeOrphanPartnerRelinks();
    assert.deepEqual(rows.map(r => `${r.id}>${r.to}`), ['BH1>KL_CHIHUONG_1', 'PT1>KL_CHIHUONG_1', 'BH3>KL_BACKINHCHATU'],
      'tombstoned id skipped; cash-only code and voucher awaiting an account fix get no partner');
    await c.applyOrphanPartnerRelinks();
    assert.equal(state.partners.filter(x => x.id === 'KL_CHIHUONG_1' && x.name === 'Chị Hương').length, 1, 'one partner per lost code');
    assert.equal(state.vouchers.find(v => v.id === 'BH3').partnerId, 'KL_BACKINHCHATU');
    assert.equal(state.vouchers.find(v => v.id === 'PC1').partnerId, 'DT_8061');
    assert.equal(c.computeOrphanPartnerRelinks().length, 0);
  });

  await test('receipt carrying goods on Có 511 becomes credit sale + receipt on 131', async () => {
    const state = {
      accountingStandard: 'TT133', initialBalances: {}, partnerOpeningBalances: {},
      products: [{ id: 'P1', name: 'Ống', unit: 'cây', stock: 0, avgCost: 0 }],
      partners: [{ id: 'KH', name: 'CH Thành Công', type: 'retail' }],
      vouchers: [
        { id: 'NK1', type: 'purchase', date: '2026-01-01', partnerId: 'KH', paymentMethod: '111', items: [{ productId: 'P1', qty: 10, price: 50, amount: 500 }] },
        { id: 'PT1', type: 'receipt', date: '2026-01-16', partnerId: 'KH', partnerName: 'CH Thành Công', amount: 300, paymentMethod: '111', taxRate: 0, taxAmount: 0, totalAmount: 300, _updatedAt: 2,
          items: [{ productId: 'P1', qty: 4, price: 75, amount: 300, discount: 0 }], entries: [{ debit: '111', credit: '511', amount: 300, desc: 'Thu tiền bán hàng' }] },
        { id: 'PT2', type: 'receipt', date: '2025-01-20', partnerId: 'KH', amount: 9, entries: [{ debit: '111', credit: '511', amount: 9 }] }
      ]
    };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/tax-rules.js', 'js/core/accounting-engine.js', 'js/accounting.js', 'js/modules/debts.js']);
    c.showConfirmModal = async () => true;
    c.saveStateAndSyncVoucher = async () => true;
    c.logUserAction = () => {};
    c.filterDebts = () => {};
    c.getCloudSafeVoucherId = async () => 'BH9';
    assert.deepEqual(c.computeCashSaleReceiptSplits().map(r => r.id), ['PT1'], 'receipt without goods is not split');
    assert.match(c.renderCashSaleReceiptSplitBlock(c.computeCashSaleReceiptSplits(), d => d), /Lập hóa đơn bán hàng \(1\)/);
    await c.applyCashSaleReceiptSplits();
    const sale = state.vouchers.find(v => v.id === 'BH9');
    const pt = state.vouchers.find(v => v.id === 'PT1');
    assert.equal(sale.paymentMethod, '131');
    assert.deepEqual(sale.entries.map(e => `${e.debit}/${e.credit}/${e.amount}`), ['131/511/300', '632/156/200'], 'revenue and cost of goods');
    assert.deepEqual(pt.entries.map(e => `${e.debit}/${e.credit}/${e.amount}`), ['111/131/300']);
    assert.equal(pt.items, undefined, 'goods moved to the invoice');
    assert.ok(pt._updatedAt > 2, 'receipt edit is stamped for sync');
    assert.equal(sale.remainingDebt, 0, 'receipt settles the new invoice');
    assert.equal(c.computeCashSaleReceiptSplits().length, 0);
  });

  await test('resync 131/331 openings to partner detail totals', async () => {
    const state = {
      accountingStandard: 'TT133', products: [], vouchers: [],
      partners: [{ id: 'KH1', type: 'retail' }, { id: 'KH2', type: 'project' }, { id: 'NCC1', type: 'supplier' }],
      partnerOpeningBalances: { KH1: { debit: 100, credit: 0 }, KH2: { debit: 0, credit: 30 }, NCC1: { debit: 0, credit: 50 }, GONE: { debit: 999, credit: 0 } },
      initialBalances: { '131': { name: 'Phải thu', type: 'debit', balance: 40 }, '331': { name: 'Phải trả', type: 'credit', balance: 50 } }
    };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/accounting.js', 'js/modules/debts.js']);
    c.showConfirmModal = async () => true;
    let saved = 0, logged = '';
    c.saveStateAndSyncVoucher = async () => { saved++; return true; };
    c.recalculateAccounting = () => {};
    c.logUserAction = (_t, d) => { logged = d; };
    c.filterDebts = () => {};
    await c.resyncPartnerOpeningTotals();
    assert.deepEqual({ type: state.initialBalances['131'].type, balance: state.initialBalances['131'].balance }, { type: 'debit', balance: 70 });
    assert.equal(state.initialBalances['331'].balance, 50);
    assert.equal(state.initialBalances['131'].name, 'Phải thu', 'account name kept');
    assert.equal(state.partnerOpeningBalances.KH1.debit, 100, 'partner detail untouched');
    assert.equal(saved, 1);
    assert.match(logged, /131 40 → 70/);
    c.window.currentUser = { role: 'viewer' };
    state.initialBalances['131'].balance = 1;
    await c.resyncPartnerOpeningTotals();
    assert.equal(state.initialBalances['131'].balance, 1, 'viewer cannot resync');
  });

  await test('partner list audit: merge same-name duplicates, rename code-named, delete junk', async () => {
    const state = {
      accountingStandard: 'TT133', products: [], initialBalances: { '131': { type: 'debit', balance: 0 } },
      partnerOpeningBalances: { 'BANLET08/2026(CH)': { debit: 0, credit: 0 }, BUSY: { debit: 5, credit: 0 } }, partnerOpeningBalanceTs: {},
      partners: [
        { id: 'BANLET08(CH)', name: 'Bán Lẻ T08/2026', type: 'retail', address: '', phone: '' },
        { id: 'BANLET08/2026(CH)', name: 'Bán Lẻ T08/2026', type: 'retail', address: '', phone: '' },
        { id: 'AN1', name: 'Anh An', type: 'retail', address: '12 Lê Lợi', phone: '' },
        { id: 'AN2', name: 'Anh An', type: 'retail', address: '', phone: '' },
        { id: 'BANLET07/2026(CH)', name: 'BANLET07/2026(CH)', type: 'retail' },
        { id: 'CHỊ PHƯỢNG (KH8101)', name: 'CHỊ PHƯỢNG (KH8101)', type: 'project' },
        { id: 'TEST', name: 'test', type: 'retail' }, { id: 'CÂY', name: '150', type: 'retail' },
        { id: '17', name: '17', type: 'retail' }, { id: 'BUSY', name: '18', type: 'retail' }
      ],
      vouchers: [
        { id: 'BH1', type: 'sales', partnerId: 'BANLET08(CH)', partnerName: 'Bán Lẻ T08/2026' },
        { id: 'BH2', type: 'sales', partnerId: 'BANLET08(CH)', partnerName: 'Bán Lẻ T08/2026' },
        { id: 'BG1', type: 'sales_quotation', partnerId: 'BANLET08/2026(CH)', partnerName: 'Bán Lẻ T08/2026 - chị Hoa' },
        { id: 'BH3', type: 'sales', partnerId: '17', partnerName: '17' }
      ]
    };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/core/partner-merge.js', 'js/modules/partners.js', 'js/modules/partner-audit.js']);
    const deleted = [];
    c.trackDeletedIds = ids => { deleted.push(...ids); };
    c.showConfirmModal = async () => true;
    let saved = 0;
    const logs = [];
    c.saveStateAndSyncVoucher = async () => { saved++; return true; };
    c.recalculateAccounting = () => {};
    c.logUserAction = (t, d) => logs.push(t + ': ' + d);
    c.filterPartners = () => {};

    const issues = c.computePartnerAuditIssues();
    assert.deepEqual(issues.duplicates.map(d => `${d.sourceId}>${d.targetId}`), ['BANLET08/2026(CH)>BANLET08(CH)'],
      'only exact same name+address+phone; "Anh An" with one address differing is not merged');
    assert.deepEqual(issues.nameIsCode.map(n => `${n.id}=${n.suggestedName}`), ['BANLET07/2026(CH)=Bán Lẻ T07/2026']);
    assert.deepEqual(issues.junk.map(j => j.id), ['TEST', 'CÂY'], 'junk only without vouchers/opening');

    await c.mergeDuplicatePartner('BANLET08/2026(CH)', 'BANLET08(CH)');
    assert.ok(!state.partners.some(p => p.id === 'BANLET08/2026(CH)'));
    const bg = state.vouchers.find(v => v.id === 'BG1');
    assert.equal(bg.partnerId, 'BANLET08(CH)');
    assert.equal(bg.partnerName, 'Bán Lẻ T08/2026 - chị Hoa', 'voucher name snapshot kept');
    assert.ok(deleted.includes('BANLET08/2026(CH)'), 'merged code tombstoned for cloud');

    await c.renamePartnerFromCode('BANLET07/2026(CH)');
    const p7 = state.partners.find(p => p.id === 'BANLET07/2026(CH)');
    assert.equal(p7.name, 'Bán Lẻ T07/2026');
    assert.ok(p7._updatedAt > 0);

    await c.deleteJunkPartners();
    assert.deepEqual(state.partners.map(p => p.id).filter(id => ['TEST', 'CÂY', '17', 'BUSY'].includes(id)), ['17', 'BUSY']);
    assert.equal(saved, 3);
    assert.equal(logs.length, 3);
    const after = c.computePartnerAuditIssues();
    assert.equal(after.duplicates.length + after.nameIsCode.length + after.junk.length, 0);

    c.window.currentUser = { role: 'viewer' };
    state.partners.push({ id: 'TEST2', name: 'test', type: 'retail' });
    await c.deleteJunkPartners();
    assert.ok(state.partners.some(p => p.id === 'TEST2'), 'viewer cannot delete');
  });

  await test('report catalog uses official TT133/TT200 names', () => {
    const state = { accountingStandard: 'TT133', initialBalances: {}, vouchers: [{ id: 'X', entries: [{ debit: '211', credit: '1111', amount: 1 }, { debit: '156', credit: '1121', amount: 1 }] }] };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/modules/reports.js']);
    const name = code => c.getReportAccounts().find(a => a.code === code).name;
    assert.equal(name('211'), 'Tài sản cố định');
    assert.equal(name('1111'), 'Tiền Việt Nam');
    assert.equal(name('156'), 'Hàng hóa');
    state.accountingStandard = 'TT200';
    assert.equal(name('211'), 'Tài sản cố định hữu hình');
  });

  await test('report catalog names new tax account 3338', () => {
    const state = { accountingStandard: 'TT133', initialBalances: {}, vouchers: [{ id: 'X', entries: [{ debit: '3338', credit: '111', amount: 1 }] }] };
    const c = makeContext(state, ['js/core/chart-of-accounts.js', 'js/core/accounting-engine.js', 'js/modules/reports.js']);
    assert.equal(c.getReportAccounts().find(a => a.code === '3338').name, 'Thuế bảo vệ môi trường và các loại thuế khác');
  });

  if (failures.length) {
    console.error(`\n${failures.length} account correction test(s) failed`);
    process.exit(1);
  }
  console.log('\naccount correction tests passed');
}

main();
