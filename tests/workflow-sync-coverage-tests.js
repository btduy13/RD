const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sources = ['purchase.js', 'sales.js', 'cash.js', 'inventory.js', 'partners.js', 'debts.js']
  .map(name => fs.readFileSync(path.join(root, 'js', 'modules', name), 'utf8')).join('\n');
const cashSource = fs.readFileSync(path.join(root, 'js', 'modules', 'cash.js'), 'utf8');
const accounting = fs.readFileSync(path.join(root, 'js', 'accounting.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const excelSource = fs.readFileSync(path.join(root, 'js', 'excel-integration.js'), 'utf8');

const forms = [...index.matchAll(/<form\b[^>]*id="([^"]+)"[^>]*onsubmit="([A-Za-z0-9_]+)\(event\)"/g)]
  .map(match => ({ id: match[1], handler: match[2] }))
  .filter(item => item.id !== 'form-cloud-sync');
assert.ok(forms.length >= 17, `expected all business forms, found ${forms.length}`);
for (const form of forms) {
  assert.match(sources, new RegExp(`(?:async\\s+)?function\\s+${form.handler}\\s*\\(`), `${form.id} handler missing`);
}

for (const handler of ['handlePurchaseSubmit', 'handlePurchaseOrderSubmit', 'handlePurchaseReturnSubmit', 'handleSalesSubmit', 'handleSalesReturnSubmit', 'handleQuotationSubmit', 'handleReceiptSubmit', 'handlePaymentSubmit']) {
  const start = sources.search(new RegExp(`async\\s+function\\s+${handler}\\s*\\(`));
  assert.ok(start >= 0, `${handler} must be async`);
  const excerpt = sources.slice(start, start + 9000);
  assert.match(excerpt, /await\s+saveStateAndSyncVoucher\(\)/, `${handler} must wait for cloud acknowledgement`);
}

const saveAndSyncStart = stateSource.search(/async\s+function\s+saveStateAndSyncVoucher\s*\(/);
assert.ok(saveAndSyncStart >= 0, 'saveStateAndSyncVoucher missing');
const saveAndSyncExcerpt = stateSource.slice(saveAndSyncStart, saveAndSyncStart + 3000);
assert.match(saveAndSyncExcerpt, /await\s+pushToCloud\s*\(\s*\{\s*pendingToken\s*\}\s*\)/, 'voucher persistence must await the first cloud commit attempt');
assert.doesNotMatch(saveAndSyncExcerpt, /queueBackgroundCloudPush\s*\(/, 'voucher persistence must not report success immediately after only queueing the cloud push');

const closeStart = stateSource.search(/async\s+function\s+autoSaveBeforeClose\s*\(/);
assert.ok(closeStart >= 0, 'autoSaveBeforeClose missing');
const closeExcerpt = stateSource.slice(closeStart, closeStart + 3500);
assert.match(closeExcerpt, /getPendingCloudWriteToken/, 'close flush must inspect the durable pending cloud write');
assert.match(closeExcerpt, /await\s+waitForPushToComplete\s*\(\s*7000\s*\)/, 'close flush must wait for the queued cloud write');

for (const [handler, prefix] of [['handleReceiptSubmit', 'PT'], ['handlePaymentSubmit', 'PC']]) {
  const start = cashSource.search(new RegExp(`async\\s+function\\s+${handler}\\s*\\(`));
  assert.ok(start >= 0, `${handler} missing`);
  const excerpt = cashSource.slice(start, start + 5000);
  assert.match(excerpt, /await\s+ensureCloudSafeVoucherIdForSave\s*\(/, `${handler} must reserve a cloud-safe voucher id`);
  assert.match(excerpt, new RegExp(`prefix:\\s*["']${prefix}["']`), `${handler} must reserve the ${prefix} sequence`);
}

for (const [name, type] of [
  ['deleteVoucher', 'voucher'], ['deleteProduct', 'product'], ['deletePartner', 'partner'],
  ['batchDeletePurchases', 'voucher'], ['batchDeletePurchaseOrders', 'voucher'],
  ['batchDeletePurchaseReturns', 'voucher'], ['batchDeleteSales', 'voucher'],
  ['batchDeleteSalesReturns', 'voucher'], ['batchDeleteQuotations', 'voucher'],
  ['batchDeleteProducts', 'product'], ['batchDeletePartners', 'partner']
]) {
  const source = name === 'deleteVoucher' ? accounting : sources;
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `${name} missing`);
  const excerpt = source.slice(start, start + 4500);
  assert.match(excerpt, /trackDeletedIds\s*\(/, `${name} must create a ${type} tombstone`);
}

for (const name of ['deleteVoucher', 'deleteProduct', 'deletePartner']) {
  const source = name === 'deleteVoucher' ? accounting : sources;
  const start = source.search(new RegExp(`async\\s+function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `${name} must wait for cloud confirmation`);
  const excerpt = source.slice(start, start + 5000);
  assert.match(excerpt, /await\s+saveStateAndSyncVoucher\(\)/, `${name} must confirm the cloud delete`);
  assert.match(excerpt, /Before/, `${name} must keep rollback state`);
}

assert.match(index, /js\/cloud-sync\.js/);
assert.equal((index.match(/<script[^>]+js\/cloud-sync\.js/g) || []).length, 1);
const excelInitSource = excelSource.slice(
  excelSource.indexOf('function initExcelIntegration()'),
  excelSource.indexOf('function cacheProductOptions()')
);
assert.match(excelSource, /ACCOUNTING_DATALIST_RESULT_LIMIT = 250/);
assert.match(excelSource, /function refreshPartnerDatalist\(/);
assert.match(excelSource, /function initAccountingDatalistLazyLoading\(/);
assert.doesNotMatch(
  excelInitSource,
  /state\.partners\.map\(|productDatalist\.innerHTML|purchaseProductDatalist\.innerHTML/,
  'startup must not materialize the full partner/product catalogs into datalist DOM nodes'
);
const initAppSource = stateSource.slice(
  stateSource.indexOf('async function initApp()'),
  stateSource.indexOf('function cleanNumericVouchers()')
);
assert.doesNotMatch(
  initAppSource,
  /autoExtractPhonesAndCleanAddresses\(\)/,
  'startup must not mutate partner addresses and queue redundant cloud writes on every station'
);
console.log(`workflow sync coverage passed (${forms.length} business forms)`);
