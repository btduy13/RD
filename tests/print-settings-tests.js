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
  assert.equal(ps.getPrintPageMargins('A4'), '0');
  assert.equal(ps.getPrintPageMargins('A5'), '0');
  console.log('page margins passed');
}

function testTemplateSettings() {
  const defaults = ps.normalizePrintTemplateSettings();
  assert.equal(defaults.marginTopMm, 4);
  assert.equal(defaults.marginRightMm, 5);
  assert.equal(defaults.tableFontSize, 13);
  const normalized = ps.normalizePrintTemplateSettings({
    fontFamily: 'Arial',
    contentFontSize: 99,
    tableFontSize: 7,
    marginLeftMm: -4,
    textAlign: 'center',
    showQr: false
  });
  assert.equal(normalized.fontFamily, 'Arial');
  assert.equal(normalized.contentFontSize, 24);
  assert.equal(normalized.tableFontSize, 8);
  assert.equal(normalized.marginLeftMm, 0);
  assert.equal(normalized.textAlign, 'center');
  assert.equal(normalized.showQr, false);
  console.log('print template settings passed');
}

function testPreviewPageHeight() {
  const a5w = ps.getVoucherPaperMaxWidth('A5');
  const a4w = ps.getVoucherPaperMaxWidth('A4');
  assert.equal(ps.getVoucherPreviewPageHeight('A5', a5w), a5w * (210 / 148));
  assert.equal(ps.getVoucherPreviewPageHeight('A4', a4w), a4w * (297 / 210));
  console.log('preview page height passed');
}

testEffectiveScale();
testPaperMaxWidth();
testFontOptions();
testPageMargins();
testTemplateSettings();
testPreviewPageHeight();
console.log('print settings tests passed');
