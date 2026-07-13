'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  PRINT_ERROR_CODES,
  buildElectronPrintOptions,
  classifyPrintFailure,
  normalizePrintRequest,
  resolvePrinterDeviceName,
  sanitizePrinterList
} = require('../js/core/printer-job');

const rawPrinters = [
  {
    name: 'RD_Printer_A5',
    displayName: 'Máy in Rạng Đông',
    description: 'Văn phòng',
    status: 0,
    isDefault: true,
    options: { secretDriverValue: 'must not cross IPC' }
  },
  {
    name: 'RD_Printer_A5',
    displayName: 'Duplicate must be removed'
  },
  {
    name: 'Backup_Printer',
    displayName: 'Backup\u0000 printer',
    status: '3',
    isDefault: false
  },
  { displayName: 'Missing system name' }
];

function assertPrinterError(run, code) {
  assert.throws(run, error => error && error.code === code);
}

function testPrinterSanitization() {
  const printers = sanitizePrinterList(rawPrinters);
  assert.equal(printers.length, 2);
  assert.deepEqual(Object.keys(printers[0]).sort(), ['description', 'displayName', 'isDefault', 'name', 'status']);
  assert.equal(printers[1].displayName.includes('\u0000'), false);
  assert.equal(printers[1].status, 3);
}

function testRequestNormalizationAndResolution() {
  assert.deepEqual(normalizePrintRequest(), { mode: 'dialog', directPrint: false, deviceName: '' });
  assert.deepEqual(
    normalizePrintRequest({ directPrint: true, deviceName: 'RD_Printer_A5' }),
    { mode: 'direct', directPrint: true, deviceName: 'RD_Printer_A5' }
  );
  assert.equal(normalizePrintRequest({ mode: 'direct' }).directPrint, true);
  assertPrinterError(() => normalizePrintRequest({ directPrint: 'yes' }), PRINT_ERROR_CODES.INVALID_OPTIONS);

  assert.equal(
    resolvePrinterDeviceName(rawPrinters, { directPrint: true }),
    'RD_Printer_A5',
    'direct print without a selection must use the OS default printer'
  );
  assert.equal(
    resolvePrinterDeviceName(rawPrinters, { directPrint: false, deviceName: 'Backup_Printer' }),
    'Backup_Printer'
  );
  assert.equal(resolvePrinterDeviceName(rawPrinters, { directPrint: false }), '');
  assertPrinterError(
    () => resolvePrinterDeviceName(rawPrinters, { deviceName: 'Missing_Printer' }),
    PRINT_ERROR_CODES.PRINTER_NOT_FOUND
  );
  assertPrinterError(
    () => resolvePrinterDeviceName([], { directPrint: true }),
    PRINT_ERROR_CODES.NO_PRINTERS
  );
  assertPrinterError(
    () => resolvePrinterDeviceName([{ name: 'Only', isDefault: false }], { directPrint: true }),
    PRINT_ERROR_CODES.NO_DEFAULT_PRINTER
  );
}

function testElectronOptions() {
  const direct = buildElectronPrintOptions({
    paperSize: 'A5',
    request: { directPrint: true },
    deviceName: 'RD_Printer_A5',
    margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }
  });
  assert.equal(direct.silent, true);
  assert.equal(direct.deviceName, 'RD_Printer_A5');
  assert.equal(direct.pageSize, 'A5');
  assert.equal(direct.landscape, false);
  assert.equal(Object.prototype.hasOwnProperty.call(direct, 'preferCSSPageSize'), false);

  const dialog = buildElectronPrintOptions({ paperSize: 'A4', request: { directPrint: false } });
  assert.equal(dialog.silent, false);
  assert.equal(dialog.pageSize, 'A4');
  assert.equal(Object.prototype.hasOwnProperty.call(dialog, 'deviceName'), false);
}

function testFailureClassification() {
  assert.equal(classifyPrintFailure('Print job canceled').code, PRINT_ERROR_CODES.CANCELLED);
  assert.equal(classifyPrintFailure('Invalid printer settings').code, PRINT_ERROR_CODES.INVALID_SETTINGS);
  assert.equal(classifyPrintFailure('Spooler unavailable').code, PRINT_ERROR_CODES.FAILED);
}

function testMainProcessWiring() {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  assert(main.includes("ipcMain.handle('get-printers'"));
  assert(main.includes('event.sender.getPrintersAsync()') || main.includes('webContents.getPrintersAsync()'));
  assert(main.includes('buildElectronPrintOptions({'));
  assert(preload.includes("getPrinters: () => ipcRenderer.invoke('get-printers')"));
  assert(preload.includes("ipcRenderer.invoke('print-html', html, printFontScale, printPaperSize, printerOptions)"));
}

testPrinterSanitization();
testRequestNormalizationAndResolution();
testElectronOptions();
testFailureClassification();
testMainProcessWiring();
console.log('printer job tests passed');
