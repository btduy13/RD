const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sources = ['purchase.js', 'sales.js', 'cash.js', 'inventory.js', 'partners.js', 'debts.js']
  .map(name => fs.readFileSync(path.join(root, 'js', 'modules', name), 'utf8')).join('\n');
const accounting = fs.readFileSync(path.join(root, 'js', 'accounting.js'), 'utf8');

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
console.log(`workflow sync coverage passed (${forms.length} business forms)`);
