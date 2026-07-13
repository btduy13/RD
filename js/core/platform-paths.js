"use strict";

const fs = require("fs");
const path = require("path");

const ALLOWED_EXCEL_EXTENSIONS = new Set([".xls", ".xlsx"]);

function normalizePackagedExcelFilename(filename) {
  if (typeof filename !== "string" || filename.length === 0 || filename.length > 255) {
    throw new Error("Invalid Excel filename.");
  }
  if (filename.includes("\0") || path.posix.basename(filename) !== filename || path.win32.basename(filename) !== filename) {
    throw new Error("Invalid Excel filename.");
  }
  if (!ALLOWED_EXCEL_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    throw new Error("Unsupported Excel file type.");
  }
  return filename;
}

function resolvePackagedExcelFile(appDir, filename) {
  const safeName = normalizePackagedExcelFilename(filename);
  const excelDir = path.join(appDir, "excel");
  const candidateDirs = [excelDir, path.join(excelDir, "phieu mau")];

  for (const directory of candidateDirs) {
    const candidate = path.join(directory, safeName);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (_) {}
  }

  throw new Error(`Excel file does not exist: ${safeName}`);
}

module.exports = {
  ALLOWED_EXCEL_EXTENSIONS,
  normalizePackagedExcelFilename,
  resolvePackagedExcelFile
};
