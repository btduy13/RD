'use strict';

// Bàn làm việc (js/modules/dashboard.js): kiểm tra sổ sách, chuỗi doanh thu/giá vốn theo tháng khớp B02,
// nhóm tuổi nợ, biểu đồ SVG không gắn cứng màu. Plain node + assert, nạp lõi + module vào vm sandbox.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['data.js', 'js/core/chart-of-accounts.js', 'js/core/tax-rules.js', 'js/core/accounting-engine.js',
  'js/accounting.js', 'js/modules/reports.js', 'js/modules/tax-reports.js', 'js/modules/dashboard.js'];

function context(standard, vouchers, extra = {}) {
  const ctx = {
    console,
    state: { accountingStandard: standard, products: [{ id: 'P1', name: 'Bóng đèn LED', initialStock: 1000, initialCost: 100 }],
      partners: [{ id: 'KH1', name: 'Khách' }], vouchers, initialBalances: {}, partnerOpeningBalances: {}, ...extra },
    saveState() {}, refreshUI() {}, safeParseFloat: Number,
    formatVND: v => `${Math.round(v)}đ`, escapeHtmlAttr: s => String(s), escapeHtmlText: s => String(s)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  FILES.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename: file }));
  ctx.recalculateAccounting(false);
  return ctx;
}

const item = (amount, vatRate, qty = 1) => ({ productId: 'P1', qty, price: amount / qty, amount, vatRate });
const VOUCHERS = () => [
  { id: 'NK1', type: 'purchase', date: '2026-05-10', partnerId: 'NCC', paymentMethod: '331', taxRate: 8, items: [item(50000, 8, 10)], isManual: true },
  { id: 'DH1', type: 'purchase_order', date: '2026-06-02', partnerId: 'NCC', items: [item(999999, 8, 10)], isManual: true },
  { id: 'BH1', type: 'sales', date: '2026-06-01', partnerId: 'KH1', paymentMethod: '131', taxRate: 8, items: [item(15000, 8, 5), item(2000, 'KCT')], isManual: true },
  { id: 'BH2', type: 'sales', date: '2026-08-10', partnerId: 'KH1', paymentMethod: '131', taxRate: 10, items: [item(100000, 10, 10)], isManual: true },
  { id: 'TL1', type: 'sales_return', date: '2026-08-20', partnerId: 'KH1', paymentMethod: '131', taxRate: 10, items: [item(10000, 10, 1)], isManual: true },
  { id: 'BH3', type: 'sales', date: '2026-09-25', partnerId: 'KH1', paymentMethod: '131', taxRate: 0, items: [item(7000, 0, 1)], isManual: true },
  { id: 'BH4', type: 'sales', date: '2026-09-05', partnerId: 'KH1', paymentMethod: '131', items: [item(3000, 'KCT', 1)], isManual: true }
];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const plain = x => JSON.parse(JSON.stringify(x)); // đối tượng tạo trong vm khác realm
const keys = items => plain(items).map(i => i.key);

test('chuỗi 12 tháng khớp computeProfitLoss từng tháng; tháng cuối cắt ở endDate; đơn đặt hàng không tính', () => {
  for (const standard of ['TT133', 'TT99']) {
    const c = context(standard, VOUCHERS());
    const end = '2026-09-20';
    const series = c.computeDashboardMonthlySeries(c.state, end);
    assert.strictEqual(series.length, 12);
    assert.deepStrictEqual([series[0].month, series[11].month], ['2025-10', '2026-09']);
    series.forEach(row => {
      const [y, m] = row.month.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const pl = c.computeProfitLoss(c.state, `${row.month}-01`, last < end ? last : end);
      assert.strictEqual(row.revenue, pl.netRevenue, `${standard} ${row.month} doanh thu thuần`);
      assert.strictEqual(row.cogs, pl.cogs, `${standard} ${row.month} giá vốn`);
      assert.strictEqual(row.grossProfit, pl.grossProfit, `${standard} ${row.month} lãi gộp`);
    });
    const aug = series.find(r => r.month === '2026-08');
    assert.strictEqual(aug.revenue, 100000 - 10000);
    assert.ok(aug.cogs > 0);
    assert.strictEqual(series[11].revenue, 3000, 'BH3 ngày 25/9 nằm sau endDate');
  }
});

test('KPI: lãi gộp như B02; kỳ trước cùng số ngày chỉ khi đủ hai ngày', () => {
  const c = context('TT99', VOUCHERS());
  const k = c.computeDashboardKpis(c.state, '2026-08-01', '2026-08-31');
  const pl = c.computeProfitLoss(c.state, '2026-08-01', '2026-08-31');
  assert.strictEqual(k.grossProfit, pl.grossProfit);
  assert.strictEqual(k.margin, pl.grossProfit / pl.netRevenue);
  assert.strictEqual(k.cash, k.cashOnHand + k.bank);
  assert.strictEqual(k.prev.revenue, c.computeProfitLoss(c.state, '2026-07-01', '2026-07-31').netRevenue);
  const june = c.computeDashboardKpis(c.state, '2026-07-01', '2026-07-30'); // 30 ngày → kỳ trước 01/06–30/06
  assert.strictEqual(june.prev.revenue, 17000);
  assert.strictEqual(c.computeDashboardKpis(c.state, '', '2026-08-31').prev, null);
  assert.strictEqual(c.computeDashboardKpis(c.state, '', '').prev, null);
});

test('health: sổ sạch không có mục nào; hóa đơn chỉ KCT không bị báo thiếu thuế', () => {
  const c = context('TT99', VOUCHERS().filter(v => v.id !== 'BH3'),
    { initialBalances: { '111': { type: 'debit', balance: 500 }, '4111': { type: 'credit', balance: 500 } } });
  assert.deepStrictEqual(keys(c.computeDashboardHealth(c.state, '', '')), []);
});

test('health: số dư đầu kỳ lệch, quỹ âm, âm kho, hóa đơn không thuế — đúng thứ tự và số liệu', () => {
  const c = context('TT133', [
    ...VOUCHERS(),
    { id: 'KQ1', type: 'payment', date: '2026-08-12', paymentMethod: '1121', amount: 70, isManual: true, entries: [{ debit: '1386', credit: '1121', amount: 70 }] }
  ], { initialBalances: { '111': { type: 'debit', balance: 500 }, '344': { type: 'credit', balance: 40 } } });
  c.state.products.push({ id: 'N1', name: 'Âm', stock: -2, avgCost: 150 });
  const items = plain(c.computeDashboardHealth(c.state, '2026-12-31', '2026-01-01'));
  assert.deepStrictEqual(keys(items), ['opening-unbalanced', 'cash-negative', 'negative-stock', 'sales-no-vat']);
  const by = Object.fromEntries(items.map(i => [i.key, i]));
  assert.deepStrictEqual([by['opening-unbalanced'].severity, by['opening-unbalanced'].amount], ['danger', 460], '344 khai theo TT133 chỉ tính một lần');
  assert.deepStrictEqual([by['cash-negative'].severity, by['cash-negative'].count, by['cash-negative'].amount, by['cash-negative'].action], ['danger', 1, 70, 'cash']);
  assert.deepStrictEqual([by['negative-stock'].severity, by['negative-stock'].count, by['negative-stock'].amount], ['warning', 1, 300]);
  assert.deepStrictEqual([by['sales-no-vat'].severity, by['sales-no-vat'].count, by['sales-no-vat'].amount], ['info', 1, 7000]);
  items.forEach(i => assert.ok(i.title && i.detail && i.action, i.key));

  // Quỹ chỉ âm kể từ ngày chi; kỳ không chứa BH3 thì không báo thiếu thuế
  assert.deepStrictEqual(keys(c.computeDashboardHealth(c.state, '2026-08-11', '2026-08-01')), ['opening-unbalanced', 'negative-stock']);
  // Doanh nghiệp không tính thuế trên hóa đơn → bỏ kiểm tra
  c.state.taxSettings = { vatMethod: 'truc_tiep' };
  assert.ok(!keys(c.computeDashboardHealth(c.state, '', '')).includes('sales-no-vat'));
});

test('health: phiếu sai TK đối ứng / kiểm kê chưa rõ nguyên nhân lấy từ công cụ ở tab Công nợ', () => {
  const c = context('TT99', []);
  assert.deepStrictEqual(keys(c.computeDashboardHealth(c.state, '', '')), [], 'chưa nạp debts.js thì bỏ qua');
  c.computeCashAccountFixSuggestions = () => [{ id: 'PT1', amount: 100 }, { id: 'PC1', amount: 50 }];
  c.computeInventoryAdjustCauseFixes = () => [{ id: 'KK1', amount: 30 }];
  c.computeBankChannelFixes = () => [{ id: 'PT9', amount: 70 }];
  c.computeRetailDoubleCashFixes = () => [{ id: 'BH9', amount: 100 }, { id: 'TL9', amount: -10 }];
  c.computePayrollAccrualSuggestions = () => [{ amount: 500 }, { amount: 200 }];
  const items = plain(c.computeDashboardHealth(c.state, '', ''));
  assert.deepStrictEqual(items.map(i => [i.key, i.severity, i.count, i.amount, i.action]), [
    ['cash-account-fix', 'warning', 2, 150, 'debt-audit'],
    ['bank-channel-fix', 'warning', 1, 70, 'debt-audit'],
    ['retail-double-cash', 'warning', 2, 90, 'debt-audit'],
    ['inventory-adjust-cause', 'warning', 1, 30, 'debt-audit'],
    ['payroll-accrual', 'warning', 2, 700, 'payroll-accrual']
  ]);
  items.forEach(i => assert.ok(i.title && i.detail, i.key));
});

test('health: nút Xem mở công cụ sửa khi module đã nạp, nếu chưa thì chuyển tab', () => {
  const c = context('TT99', [], { initialBalances: { '111': { type: 'debit', balance: 500 } } });
  const opening = () => plain(c.computeDashboardHealth(c.state, '', '')).find(i => i.key === 'opening-unbalanced');
  assert.strictEqual(opening().action, 'reports');
  const calls = [];
  c.switchTab = tab => calls.push(`tab:${tab}`);
  c.runDashboardAction('opening-plug');
  c.runDashboardAction('payroll-accrual');
  c.openOpeningBalancePlug = () => calls.push('plug');
  c.openPayrollAccrualFixes = () => calls.push('payroll');
  assert.strictEqual(opening().action, 'opening-plug');
  c.runDashboardAction(opening().action);
  c.runDashboardAction('payroll-accrual');
  assert.deepStrictEqual(calls, ['tab:reports', 'tab:payroll', 'plug', 'payroll']);
});

test('tuổi nợ: ranh giới 30/90/180 ngày', () => {
  const c = context('TT99', []);
  const day = n => new Date(Date.UTC(2026, 10, 11) - n * 86400000).toISOString().slice(0, 10);
  const items = [0, 30, 31, 90, 91, 180, 181, 700].map((n, i) => ({ date: day(n), remainingDebt: 10 ** i }));
  const buckets = plain(c.computeDashboardAging(items, '2026-11-11'));
  assert.deepStrictEqual(buckets.map(b => b.amount), [11, 1100, 110000, 11000000]);
  assert.deepStrictEqual(buckets.map(b => b.count), [2, 2, 2, 2]);
  assert.deepStrictEqual(plain(c.computeDashboardAging([], '2026-11-11')).map(b => b.amount), [0, 0, 0, 0]);
});

test('biểu đồ: SVG có role/aria-label/title, không gắn cứng màu hay style; không số liệu → trạng thái trống', () => {
  const c = context('TT99', VOUCHERS());
  const monthly = c.renderDashboardMonthlyChart(c.computeDashboardMonthlySeries(c.state, '2026-09-30'));
  const aging = c.renderDashboardAgingChart(c.computeDashboardAging([{ date: '2026-01-01', remainingDebt: 5 }], '2026-11-11'));
  [monthly, aging].forEach(svg => {
    assert.ok(/^<svg class="dash-chart" viewBox="[^"]+" role="img" aria-label="[^"]+">/.test(svg), svg.slice(0, 120));
    assert.ok(svg.includes('<title>'));
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|style=|fill=|stroke=|NaN|Infinity/i.test(svg));
  });
  assert.strictEqual((monthly.match(/class="dash-chart-revenue"/g) || []).length, 12);
  assert.strictEqual((monthly.match(/class="dash-chart-axis"/g) || []).length, 1, 'một đường gốc 0');
  assert.ok(!c.renderDashboardMonthlyChart(c.computeDashboardMonthlySeries(c.state, '2020-01-31')).includes('<svg'));
  assert.ok(!c.renderDashboardAgingChart(c.computeDashboardAging([], '2026-11-11')).includes('<svg'));
});

test('index.html: khung dashboard giữ đủ id, không style nội tuyến; dashboard.css được nạp và đóng gói', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const view = html.slice(html.indexOf('<section id="view-dashboard"'), html.indexOf('<section id="view-purchase"'));
  ['search-dashboard-from', 'search-dashboard-to', 'dashboard-date-range-display', 'dash-health-status', 'dash-health-list',
    'kpi-cash-value', 'kpi-revenue-value', 'kpi-gross-value', 'kpi-inventory-value', 'kpi-debt-receivable', 'kpi-debt-payable',
    'kpi-debt-supplier-receivable', 'kpi-escrow-value', 'dash-chart-monthly', 'dash-chart-aging', 'dashboard-unsettled-orders',
    'dashboard-aged-debts', 'dashboard-negative-stock-list', 'dashboard-negative-stock-count', 'dashboard-recent-activities']
    .forEach(id => assert.strictEqual(view.split(`id="${id}"`).length, 2, id));
  assert.ok(!/\sstyle=/.test(view), 'không style nội tuyến');
  assert.ok(html.includes('<link rel="stylesheet" href="dashboard.css">'));
  assert.ok(require(path.join(root, 'package.json')).build.files.includes('dashboard.css'));
  const css = fs.readFileSync(path.join(root, 'dashboard.css'), 'utf8');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|gradient/i.test(css), 'dashboard.css chỉ dùng biến màu');
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('ok -', name); } catch (err) { failed++; console.error('FAIL -', name, '\n', err); }
}
if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log(`dashboard tests passed (${tests.length})`);
