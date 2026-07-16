'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const appDir = path.join(__dirname, '..');
const coreSource = fs.readFileSync(path.join(appDir, 'js', 'core', 'voucher-form-ui.js'), 'utf8');
const autosaveSource = fs.readFileSync(path.join(appDir, 'js', 'modules', 'autosave.js'), 'utf8');
const purchaseSource = fs.readFileSync(path.join(appDir, 'js', 'modules', 'purchase.js'), 'utf8');
const salesSource = fs.readFileSync(path.join(appDir, 'js', 'modules', 'sales.js'), 'utf8');
const productionHtml = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

app.disableHardwareAcceleration();

async function main() {
  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: false, sandbox: false }
  });

  await win.loadFile(path.join(__dirname, 'voucher-form-table-fixture.html'));
  const result = await win.webContents.executeJavaScript(`(async () => {
    window.formatVND = value => Number(value || 0).toLocaleString('vi-VN') + 'đ';
    window.safeParseFloat = value => Number.parseFloat(String(value || '').replace(',', '.')) || 0;
    window.showToast = () => {};
    window.confirm = () => true;

    const definitions = [
      ['sales', 'form-sales', 'modal-add-sales', true, true],
      ['purchase', 'form-purchase', 'modal-add-purchase', false, true],
      ['purchase-order', 'form-purchase-order', 'modal-add-purchase-order', false, true],
      ['purchase-return', 'form-purchase-return', 'modal-add-purchase-return', false, true],
      ['sales-return', 'form-sales-return', 'modal-add-sales-return', false, true],
      ['quotation', 'form-quotation', 'modal-add-sales-quotation', true, true],
      ['sales-template', 'form-edit-template', 'modal-edit-template', true, false]
    ];

    document.body.innerHTML = definitions.map(([key, formId, modalId]) => {
      const tbodyId = key + '-items-body';
      return '<div id="' + modalId + '" class="modal-overlay" style="display:none">' +
        '<form id="' + formId + '">' +
          '<input id="' + key + '-id"><input id="' + key + '-partner">' +
          '<input id="' + key + '-tax-rate" value="0">' +
          '<input id="' + key + '-subtotal"><input id="' + key + '-tax"><input id="' + key + '-total">' +
          '<table class="dynamic-items-table"><thead></thead><tbody id="' + tbodyId + '"></tbody></table>' +
        '</form></div>';
    }).join('');

    ${coreSource}

    let editingId = null;
    definitions.forEach(([key, formId, modalId, hasDescription, hasDiscount]) => {
      registerDynamicFormTable(createStandardDynamicFormTableConfig({
        key,
        tbodyId: key + '-items-body',
        formId,
        modalId,
        rowIdPrefix: key + '-row',
        hasDescription,
        hasDiscount,
        productLabel: hasDescription ? 'Mã SP' : 'Tên sản phẩm',
        productListId: 'products',
        totals: {
          taxRateId: key + '-tax-rate',
          subtotalId: key + '-subtotal',
          taxId: key + '-tax',
          totalId: key + '-total'
        },
        fieldIds: { id: key + '-id', partner: key + '-partner', taxRate: key + '-tax-rate' },
        getEditingId: () => key === 'sales' ? editingId : null,
        setEditingId: value => { if (key === 'sales') editingId = value; }
      }));
    });

    ${autosaveSource}

    const validationErrors = getDynamicFormTableConfigs().flatMap(config => validateDynamicFormTableConfig(config));
    const configCount = getDynamicFormTableConfigs().length;
    const headerCounts = getDynamicFormTableConfigs().map(config => ({
      key: config.key,
      expected: config.columns.length,
      actual: document.querySelectorAll('#' + config.tbodyId).length
        ? document.getElementById(config.tbodyId).closest('table').querySelectorAll('thead th').length
        : 0
    }));

    const bulkRows = Array.from({ length: 60 }, (_, index) => ({
      productId: 'SP' + index,
      desc: 'Sản phẩm ' + index,
      qty: 2,
      price: 1000,
      discount: 10
    }));
    replaceDynamicFormTableRows('sales-items-body', bulkRows);
    const salesBody = document.getElementById('sales-items-body');
    const rowIds = Array.from(salesBody.rows).map(row => row.id);

    document.getElementById('sales-tax-rate').value = '10';
    replaceDynamicFormTableRows('sales-items-body', [
      { productId: 'SP1', desc: 'Một', qty: 2, price: 1000, discount: 10 },
      { productId: 'SP2', desc: 'Hai', qty: 1, price: 500, discount: 0 }
    ]);
    const totals = recalculateDynamicFormTable('sales-items-body');
    const grossLineDisplays = Array.from(salesBody.querySelectorAll('.item-total-display'))
      .map(el => parseDynamicMoney(el.textContent));
    const serialized = serializeDynamicFormTable('sales-items-body');

    const firstRow = salesBody.rows[0];
    insertDynamicFormRowAfter('sales-items-body', firstRow.id);
    const insertedAfterFirst = salesBody.rows[1].querySelector('.item-productId').value === '';
    while (salesBody.rows.length > 1) removeDynamicFormRow(salesBody.rows[0].id, 'sales-items-body');
    removeDynamicFormRow(salesBody.rows[0].id, 'sales-items-body');
    const minimumRowPreserved = salesBody.rows.length === 1;

    const templateConfig = getDynamicFormTableConfig('sales-template-items-body');
    replaceDynamicFormTableRows('sales-template-items-body', [
      { productId: 'TMP', desc: 'Mẫu', qty: 3, price: 2000 }
    ]);
    const templateTotals = recalculateDynamicFormTable('sales-template-items-body');
    const templateHasNoDiscount = !document.querySelector('#sales-template-items-body .item-discount');

    document.getElementById('sales-partner').value = 'KH001';
    document.getElementById('sales-id').value = 'BH001';
    editingId = 'BH001';
    replaceDynamicFormTableRows('sales-items-body', [
      { productId: 'SP-DRAFT', desc: 'Nháp', qty: 4, price: 2500, discount: 5 }
    ]);
    saveFormDraftDirect('form-sales');
    const savedDraft = JSON.parse(localStorage.getItem('rd_draft_form-sales'));
    document.getElementById('sales-partner').value = '';
    editingId = null;
    replaceDynamicFormTableRows('sales-items-body', []);
    const restored = restoreFormDraft('form-sales');
    const restoredRows = serializeDynamicFormTable('sales-items-body');

    return {
      validationErrors,
      configCount,
      headerCounts,
      bulkRowCount: rowIds.length,
      uniqueRowIds: new Set(rowIds).size,
      totals,
      grossLineDisplays,
      serialized,
      insertedAfterFirst,
      minimumRowPreserved,
      templateColumnCount: templateConfig.columns.length,
      templateTotals,
      templateHasNoDiscount,
      savedDraft,
      restored,
      restoredPartner: document.getElementById('sales-partner').value,
      restoredEditingId: editingId,
      restoredRows,
      lineValidation: [
        validateDynamicVoucherLine(1, 0, 0) === '',
        validateDynamicVoucherLine(0, 100, 0) !== '',
        validateDynamicVoucherLine(1, -1, 0) !== '',
        validateDynamicVoucherLine(1, 100, 101) !== '',
        parseDynamicMoney('-1.000') === -1000,
        parseDynamicDiscount('-5,5') === -5.5
      ],
      resetResult: (() => {
        const ok = resetDynamicVoucherForm('form-sales', { taxRate: '0' });
        return {
          ok,
          partner: document.getElementById('sales-partner').value,
          editingId,
          rowCount: document.getElementById('sales-items-body').rows.length
        };
      })()
    };
  })()`);

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.configCount, 7);
  result.headerCounts.forEach(item => assert.equal(item.actual, item.expected, `header mismatch for ${item.key}`));
  assert.equal(result.bulkRowCount, 60);
  assert.equal(result.uniqueRowIds, 60);
  assert.deepEqual(result.totals, { subtotal: 2300, taxAmount: 230, total: 2530 });
  assert.deepEqual(result.grossLineDisplays, [2000, 500], 'Thành tiền từng dòng phải bằng số lượng × đơn giá, chưa trừ chiết khấu');
  assert.equal(result.serialized[0].desc, 'Một');
  assert.equal(result.insertedAfterFirst, true);
  assert.equal(result.minimumRowPreserved, true);
  assert.equal(result.templateColumnCount, 6);
  assert.deepEqual(result.templateTotals, { subtotal: 6000, taxAmount: 0, total: 6000 });
  assert.equal(result.templateHasNoDiscount, true);
  assert.equal(result.savedDraft.fields.partner, 'KH001');
  assert.equal(result.savedDraft.items[0].productId, 'SP-DRAFT');
  assert.equal(result.restored, true);
  assert.equal(result.restoredPartner, 'KH001');
  assert.equal(result.restoredEditingId, 'BH001');
  assert.equal(result.restoredRows[0].productId, 'SP-DRAFT');
  assert.deepEqual(result.lineValidation, [true, true, true, true, true, true]);
  assert.deepEqual(result.resetResult, { ok: true, partner: '', editingId: null, rowCount: 1 });

  await win.loadFile(path.join(__dirname, 'voucher-form-table-fixture.html'));
  await win.webContents.executeJavaScript(`document.open(); document.write(${JSON.stringify(productionHtml)}); document.close();`);
  const productionResult = await win.webContents.executeJavaScript(`(() => {
    window.state = { vouchers: [], products: [], partners: [], salesTemplatesData: [] };
    window.getLocalDateString = () => '2026-07-10';
    window.formatVND = value => Number(value || 0).toLocaleString('vi-VN') + 'đ';
    window.safeParseFloat = value => Number.parseFloat(String(value || '').replace(',', '.')) || 0;
    window.showToast = () => {};
    window.resolveProduct = () => null;
    window.ensureProductExcelRow = () => {};
    ${coreSource}
    ${purchaseSource}
    ${salesSource}

    const errors = getDynamicFormTableConfigs().flatMap(config => validateDynamicFormTableConfig(config));
    const headers = getDynamicFormTableConfigs().map(config => ({
      key: config.key,
      expected: config.columns.length,
      actual: document.getElementById(config.tbodyId).closest('table').querySelectorAll('thead th').length
    }));
    document.getElementById('sale-partner').value = 'KH-CU';
    document.getElementById('sale-payment').value = '112';
    document.getElementById('sale-tax-rate').value = '10';
    resetSalesForm();
    return {
      count: getDynamicFormTableConfigs().length,
      errors,
      headers,
      salesReset: {
        partner: document.getElementById('sale-partner').value,
        payment: document.getElementById('sale-payment').value,
        taxRate: document.getElementById('sale-tax-rate').value,
        date: document.getElementById('sale-date').value,
        rows: document.getElementById('sales-form-items-body').rows.length
      }
    };
  })()`);

  assert.equal(productionResult.count, 7);
  assert.deepEqual(productionResult.errors, []);
  productionResult.headers.forEach(item => assert.equal(item.actual, item.expected, `production header mismatch for ${item.key}`));
  assert.deepEqual(productionResult.salesReset, {
    partner: '', payment: '131', taxRate: '0', date: '2026-07-10', rows: 1
  });

  await win.close();
  app.quit();
}

main().catch(err => {
  console.error(err);
  app.exit(1);
});
