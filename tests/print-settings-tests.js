'use strict';

const assert = require('assert');
const path = require('path');
const ps = require(path.join(__dirname, '..', 'js/core/print-settings.js'));

function testEffectiveScale() {
  assert.equal(ps.getEffectivePrintScale(1, 'A4'), 1);
  assert.equal(ps.getEffectivePrintScale(1.3, 'A5'), 1.3);
  assert.equal(ps.getEffectivePrintScale(1.3, 'A5'), 1.3 * 1); // font only, not paper zoom
  console.log('effective print scale passed');
}

function testPaperMaxWidth() {
  assert.equal(ps.getVoucherPaperMaxWidth('A4'), 800);
  assert.equal(ps.getVoucherPaperMaxWidth('A5'), Math.round(800 * ps.A5_WIDTH_RATIO));
  console.log('paper max width passed');
}

function testFontOptions() {
  assert.ok(ps.PRINT_FONT_SCALE_OPTIONS.includes(0.7));
  assert.ok(ps.PRINT_FONT_SCALE_OPTIONS.includes(1.5));
  assert.equal(ps.PRINT_FONT_SCALE_OPTIONS.length, 16);
  console.log('font scale options passed');
}

function testPageMargins() {
  assert.equal(ps.getPrintPageMargins('A4'), '10mm 12mm');
  assert.equal(ps.getPrintPageMargins('A5'), '6mm 5mm');
  console.log('page margins passed');
}

testEffectiveScale();
testPaperMaxWidth();
testFontOptions();
testPageMargins();
console.log('print settings tests passed');
