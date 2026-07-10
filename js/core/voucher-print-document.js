const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const A5_WIDTH_RATIO = 148 / 210;

function voucherScaledFont(px) {
  return `calc(${px}px * var(--voucher-font-scale, 1))`;
}

function voucherTableScaledFont(px) {
  return `calc(var(--voucher-template-table-font-size, ${px}px) * var(--voucher-table-font-scale, 1))`;
}

function getVoucherPaperMaxWidth(printPaperSize) {
  return printPaperSize === "A4" ? 800 : Math.round(800 * A5_WIDTH_RATIO);
}

function readVoucherCssBlock(appDir) {
  const cssPath = path.join(appDir, "styles.css");
  const full = fs.readFileSync(cssPath, "utf8");
  const start = full.indexOf("/* Thiết kế biểu mẫu kế toán in ấn */");
  const end = full.indexOf("/* 8. FORMS & INPUTS */");
  return start >= 0 && end > start ? full.slice(start, end) : "";
}

function getVoucherPrintStyles(appDir) {
  let voucherBlock = "";
  try {
    voucherBlock = readVoucherCssBlock(appDir);
  } catch (err) {
    voucherBlock = `
      .printable-voucher {
        font-family: "Times New Roman", Times, serif;
        font-size: 13px;
        color: #000;
      }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 4px 6px; }
    `;
  }

  return `
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      height: auto !important;
      overflow: visible !important;
    }
    .skip-link,
    .app-bg-decoration,
    .toast-container,
    .custom-context-menu {
      display: none !important;
    }
    ${voucherBlock}
    .printable-voucher {
      box-shadow: none !important;
      margin: 0 auto !important;
      width: 100% !important;
      max-width: var(--voucher-paper-max-width, 100%) !important;
      border: none !important;
      background-color: #ffffff !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
      zoom: 1 !important;
      transform: none !important;
      padding: var(--voucher-template-margin-top, 10mm) var(--voucher-template-margin-right, 5mm) var(--voucher-template-margin-bottom, 10mm) var(--voucher-template-margin-left, 5mm);
    }
    .printable-voucher .voucher-rd-header {
      padding: 6px 0 5px !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .printable-voucher .voucher-rd-header-info {
      font-size: var(--voucher-template-title-font-size, 18px) !important;
    }
    .printable-voucher .voucher-rd-co-name {
      font-size: calc(var(--voucher-template-title-font-size, 18px) * 0.7) !important;
      letter-spacing: 0 !important;
      white-space: nowrap !important;
    }
    .printable-voucher .voucher-rd-co-unit {
      font-size: calc(var(--voucher-template-title-font-size, 18px) * 0.6) !important;
    }
    .printable-voucher .voucher-rd-co-addr,
    .printable-voucher .voucher-rd-co-tel {
      font-size: calc(var(--voucher-template-title-font-size, 18px) * 0.6) !important;
    }
    .printable-voucher .voucher-co-name {
      font-size: var(--voucher-template-title-font-size, 18px) !important;
    }
    .printable-voucher .voucher-co-addr {
      font-size: calc(var(--voucher-template-title-font-size, 18px) * 0.85) !important;
    }
    .printable-voucher .voucher-rd-header-qr img,
    .printable-voucher .voucher-rd-header-qr .voucher-rd-qr-box {
      width: 80px !important;
      height: 80px !important;
    }
    .printable-voucher .voucher-title,
    .printable-voucher .voucher-document-title {
      font-size: calc(var(--voucher-template-content-font-size, 13px) * 1.35) !important;
      letter-spacing: 0.8px !important;
      line-height: 1.15 !important;
    }
    .printable-voucher table {
      width: 100% !important;
      font-size: ${voucherTableScaledFont(13)} !important;
    }
    .printable-voucher table thead {
      display: table-header-group !important;
    }
    .printable-voucher table tfoot {
      display: table-footer-group !important;
    }
    .printable-voucher table th,
    .printable-voucher table td {
      box-sizing: border-box !important;
      font-size: ${voucherTableScaledFont(13)} !important;
      padding: calc(3px * var(--voucher-table-font-scale, 1)) 4px !important;
      overflow-wrap: normal !important;
      word-wrap: normal !important;
    }
    .printable-voucher table th {
      white-space: nowrap !important;
    }
    .printable-voucher table td.font-numeric,
    .printable-voucher table td.voucher-col-gc,
    .printable-voucher table th.voucher-col-gc {
      white-space: nowrap !important;
      overflow-wrap: normal !important;
      word-wrap: normal !important;
    }
    .printable-voucher table td.voucher-col-desc {
      white-space: normal !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
    }
    .printable-voucher table tr,
    .printable-voucher .voucher-signatures,
    .printable-voucher .sig-block {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .printable-voucher.debt-notice-voucher {
      max-width: none !important;
      padding: var(--voucher-template-margin-top, 10mm) var(--voucher-template-margin-right, 5mm) var(--voucher-template-margin-bottom, 10mm) var(--voucher-template-margin-left, 5mm) !important;
      margin: 0 !important;
    }
    .printable-voucher.debt-notice-voucher .debt-notice-table {
      width: 100% !important;
      table-layout: fixed;
    }
    .printable-voucher.debt-notice-voucher .debt-notice-info-grid {
      display: grid !important;
      grid-template-columns: 1.2fr 1fr;
      gap: 3px 12px;
    }
    .printable-voucher.debt-notice-voucher .debt-notice-table th,
    .printable-voucher.debt-notice-voucher .debt-notice-table td {
      padding: calc(3px * var(--voucher-table-font-scale, 1)) calc(5px * var(--voucher-table-font-scale, 1)) !important;
      font-size: ${voucherTableScaledFont(11.5)} !important;
      overflow-wrap: normal !important;
      word-wrap: normal !important;
    }
    .printable-voucher.debt-notice-voucher .debt-notice-table td.font-numeric {
      white-space: nowrap !important;
    }
  `;
}

function buildVoucherPrintDocument({ voucherHtml, printFontScale = 1, printPaperSize = "A5", appDir }) {
  const rootDir = appDir || path.join(__dirname, "..", "..");
  const baseHref = pathToFileURL(path.join(rootDir, path.sep)).href;
  const paper = printPaperSize === "A4" ? "A4" : "A5";
  const fontScale = Number(printFontScale) > 0 ? Number(printFontScale) : 1;
  const paperMaxW = getVoucherPaperMaxWidth(paper);
  const pageOverride = `@page { size: ${paper} portrait; margin: 0; }`;
  const layoutVars = `
    .printable-voucher {
      --voucher-font-scale: 1;
      --voucher-table-font-scale: ${fontScale};
      --voucher-paper-max-width: ${paperMaxW}px;
      max-width: ${paperMaxW}px !important;
    }
  `;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <base href="${baseHref}">
  <style>${getVoucherPrintStyles(rootDir)}${pageOverride}${layoutVars}</style>
</head>
<body>${String(voucherHtml || "")}</body>
</html>`;
}

module.exports = {
  buildVoucherPrintDocument,
  getVoucherPaperMaxWidth,
  getVoucherPrintStyles
};
