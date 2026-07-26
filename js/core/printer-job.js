'use strict';

const PRINT_MODES = Object.freeze({
  DIALOG: 'dialog',
  DIRECT: 'direct'
});

const PRINT_ERROR_CODES = Object.freeze({
  INVALID_OPTIONS: 'INVALID_PRINT_OPTIONS',
  ENUMERATION_FAILED: 'PRINTER_ENUMERATION_FAILED',
  NO_PRINTERS: 'NO_PRINTERS',
  NO_DEFAULT_PRINTER: 'NO_DEFAULT_PRINTER',
  PRINTER_NOT_FOUND: 'PRINTER_NOT_FOUND',
  CANCELLED: 'PRINT_CANCELLED',
  INVALID_SETTINGS: 'INVALID_PRINTER_SETTINGS',
  FAILED: 'PRINT_FAILED'
});

class PrinterJobError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PrinterJobError';
    this.code = code;
  }
}

function cleanPrinterText(value, maxLength = 512) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function normalizePrintRequest(value) {
  if (value == null) {
    return { mode: PRINT_MODES.DIALOG, directPrint: false, deviceName: '' };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new PrinterJobError(PRINT_ERROR_CODES.INVALID_OPTIONS, 'Tùy chọn máy in không hợp lệ');
  }

  let directPrint = false;
  if (Object.prototype.hasOwnProperty.call(value, 'directPrint')) {
    if (typeof value.directPrint !== 'boolean') {
      throw new PrinterJobError(PRINT_ERROR_CODES.INVALID_OPTIONS, 'Chế độ in trực tiếp không hợp lệ');
    }
    directPrint = value.directPrint;
  } else if (Object.prototype.hasOwnProperty.call(value, 'mode')) {
    if (value.mode !== PRINT_MODES.DIALOG && value.mode !== PRINT_MODES.DIRECT) {
      throw new PrinterJobError(PRINT_ERROR_CODES.INVALID_OPTIONS, 'Chế độ in không hợp lệ');
    }
    directPrint = value.mode === PRINT_MODES.DIRECT;
  }

  if (value.deviceName != null && typeof value.deviceName !== 'string') {
    throw new PrinterJobError(PRINT_ERROR_CODES.INVALID_OPTIONS, 'Tên máy in không hợp lệ');
  }
  if (typeof value.deviceName === 'string' && value.deviceName.length > 512) {
    throw new PrinterJobError(PRINT_ERROR_CODES.INVALID_OPTIONS, 'Tên máy in quá dài');
  }

  let copies = 1;
  if (value.copies != null) {
    const parsedCopies = parseInt(value.copies, 10);
    if (!isNaN(parsedCopies) && parsedCopies >= 1) {
      copies = Math.min(parsedCopies, 99);
    }
  }

  return {
    mode: directPrint ? PRINT_MODES.DIRECT : PRINT_MODES.DIALOG,
    directPrint,
    deviceName: cleanPrinterText(value.deviceName),
    copies
  };
}

function sanitizePrinterInfo(value) {
  if (!value || typeof value !== 'object') return null;
  const name = cleanPrinterText(value.name);
  if (!name) return null;
  const numericStatus = Number(value.status);
  return {
    name,
    displayName: cleanPrinterText(value.displayName) || name,
    description: cleanPrinterText(value.description, 1024),
    status: Number.isFinite(numericStatus) ? numericStatus : 0,
    isDefault: value.isDefault === true
  };
}

function sanitizePrinterList(list) {
  if (!Array.isArray(list)) return [];
  const names = new Set();
  const printers = [];
  for (const item of list) {
    const printer = sanitizePrinterInfo(item);
    if (!printer || names.has(printer.name)) continue;
    names.add(printer.name);
    printers.push(printer);
  }
  return printers;
}

function resolvePrinterDeviceName(printersValue, requestValue) {
  const printers = sanitizePrinterList(printersValue);
  const request = normalizePrintRequest(requestValue);
  if (printers.length === 0) {
    throw new PrinterJobError(PRINT_ERROR_CODES.NO_PRINTERS, 'Không tìm thấy máy in nào trên hệ thống');
  }

  if (request.deviceName) {
    const selected = printers.find(printer => printer.name === request.deviceName);
    if (!selected) {
      throw new PrinterJobError(PRINT_ERROR_CODES.PRINTER_NOT_FOUND, `Không tìm thấy máy in "${request.deviceName}"`);
    }
    return selected.name;
  }

  const defaultPrinter = printers.find(printer => printer.isDefault);
  if (!defaultPrinter) {
    throw new PrinterJobError(PRINT_ERROR_CODES.NO_DEFAULT_PRINTER, 'Chưa có máy in mặc định để in trực tiếp');
  }
  return defaultPrinter.name;
}

function normalizePaperSize(value) {
  return value === 'A4' ? 'A4' : 'A5';
}

function buildElectronPrintOptions({ paperSize, request, deviceName, margins }) {
  const normalizedRequest = normalizePrintRequest(request);
  const options = {
    silent: normalizedRequest.directPrint,
    printBackground: true,
    color: true,
    landscape: false,
    pageSize: normalizePaperSize(paperSize),
    copies: normalizedRequest.copies || 1
  };
  if (deviceName) options.deviceName = deviceName;
  if (margins) options.margins = margins;
  return options;
}

function classifyPrintFailure(failureReason) {
  const reason = cleanPrinterText(failureReason, 1024);
  if (/cancel(?:ed|led)?|cancell?ation/i.test(reason)) {
    return { code: PRINT_ERROR_CODES.CANCELLED, error: 'Hủy in' };
  }
  if (/invalid printer settings|invalid settings/i.test(reason)) {
    return { code: PRINT_ERROR_CODES.INVALID_SETTINGS, error: 'Thiết lập máy in không hợp lệ' };
  }
  return { code: PRINT_ERROR_CODES.FAILED, error: reason || 'In thất bại' };
}

module.exports = {
  PRINT_ERROR_CODES,
  PRINT_MODES,
  PrinterJobError,
  buildElectronPrintOptions,
  classifyPrintFailure,
  normalizePaperSize,
  normalizePrintRequest,
  resolvePrinterDeviceName,
  sanitizePrinterInfo,
  sanitizePrinterList
};
