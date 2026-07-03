'use strict';

const assert = require('assert');
const { dedupeProductCatalogOnState, normalizeProductId, findProductById, findProductIndexById } = require('../js/core/product-case-dedupe.js');

function testNormalizeProductId() {
  assert.equal(normalizeProductId('b-3'), 'B-3');
  assert.equal(normalizeProductId('  bangkeobac '), 'BANGKEOBAC');
  console.log('normalizeProductId tests passed');
}

function testFindProductByIdCaseInsensitive() {
  const products = [
    { id: 'B-3', name: 'Tẻ', stock: 10, avgCost: 1000, totalValue: 10000 },
    { id: 'OTHER', name: 'Khác', stock: 1, avgCost: 1, totalValue: 1 }
  ];
  assert.equal(findProductById('b-3', products).name, 'Tẻ');
  assert.equal(findProductIndexById('B-3', products), 0);
  console.log('findProductById tests passed');
}

function testDedupeProductCatalogOnState() {
  const state = {
    products: [
      { id: 'b-3', name: 'Tẻ', stock: 5, avgCost: 1000, totalValue: 5000 },
      { id: 'B-3', name: 'Tẻ', stock: 7, avgCost: 1000, totalValue: 7000 },
      { id: 'bangkeobac', name: 'Băng keo bạc', stock: 10, avgCost: 500, totalValue: 5000 },
      { id: 'BANGKEOBAC', name: 'Băng keo bạc', stock: 5, avgCost: 500, totalValue: 2500 }
    ],
    vouchers: [
      { id: 'BH1', items: [{ productId: 'b-3', qty: 1, price: 1000, amount: 1000 }] },
      { id: 'BH2', items: [{ productId: 'bangkeobac', qty: 2, price: 500, amount: 1000 }] }
    ],
    deletedIds: []
  };

  const result = dedupeProductCatalogOnState(state);
  assert.equal(result.removedCount, 2);
  assert.equal(state.products.length, 2);
  assert.ok(state.products.every((p) => p.id === normalizeProductId(p.id)));
  assert.equal(state.vouchers[0].items[0].productId, 'B-3');
  assert.equal(state.vouchers[1].items[0].productId, 'BANGKEOBAC');
  assert.equal(state.deletedIds.length, 2);

  const te = state.products.find((p) => p.id === 'B-3');
  assert.equal(te.stock, 12);

  console.log('dedupeProductCatalogOnState tests passed');
}

testNormalizeProductId();
testFindProductByIdCaseInsensitive();
testDedupeProductCatalogOnState();
console.log('All product-identity tests passed');
