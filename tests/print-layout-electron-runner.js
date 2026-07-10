const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const {
  buildVoucherPrintDocument,
  getVoucherPaperMaxWidth
} = require("../js/core/voucher-print-document");

const appDir = path.join(__dirname, "..");
const appStyles = fs.readFileSync(path.join(appDir, "styles.css"), "utf8");

app.disableHardwareAcceleration();

const sampleVoucherHtml = `
  <div class="printable-voucher" style="max-width: 800px; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; line-height: 1.25;">
    <div class="voucher-rd-header">
      <div class="voucher-rd-header-logo">
        <img src="logo.jpg" alt="Logo Rang Dong" />
      </div>
      <div class="voucher-rd-header-info">
        <div class="voucher-rd-co-name">CÔNG TY CỔ PHẦN SX VÀ ĐT PHÁT TRIỂN RẠNG ĐÔNG</div>
        <div class="voucher-rd-co-unit">TRUNG TÂM PP BẢO HÀNH-MÁY NƯỚC NÓNG NLMT SOLARKYO</div>
        <div class="voucher-rd-co-addr">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
        <div class="voucher-rd-co-tel">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
      </div>
      <div class="voucher-rd-header-qr">
        <span class="voucher-rd-qr-label">QUÉT MÃ QR THANH TOÁN</span>
        <div class="voucher-rd-qr-box"></div>
        <span class="voucher-rd-qr-stk">STK: 050033493999</span>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 6px;">
      <div class="voucher-document-title">PHIẾU GIAO HÀNG</div>
    </div>

    <table class="voucher-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1.5px solid #000;">
      <thead>
        <tr>
          <th style="width: 6%;">TT</th>
          <th class="voucher-col-desc" style="width: 36%;">D.giải</th>
          <th style="width: 8%;">ĐV</th>
          <th style="width: 9%;">SL</th>
          <th style="width: 15%;">Đ.giá</th>
          <th style="width: 20%;">T.tiền</th>
          <th class="voucher-col-gc" style="width: 6%;">GC</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td class="voucher-col-desc">Ống lạnh BM Ø 90x2,6mm</td>
          <td>Mét</td>
          <td class="font-numeric">1,0</td>
          <td class="font-numeric">83.808</td>
          <td class="font-numeric">83.808</td>
          <td class="voucher-col-gc">0</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

async function main() {
  await app.whenReady();

  const doc = buildVoucherPrintDocument({
    voucherHtml: sampleVoucherHtml,
    printFontScale: 1,
    printPaperSize: "A5",
    appDir
  });

  assert(!doc.includes("max-width: 100% !important"), "print CSS must not override paper width with max-width: 100%");
  assert(!doc.includes("127.0.0.1:7918"), "print document must not include debug ingest calls");
  assert(doc.includes("grid-template-columns: 70px 1fr auto"), "print CSS must include the same branded header grid as preview");

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    }
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`);

  const collectMetricsScript = `(() => {
    const root = document.querySelector(".printable-voucher");
    const title = document.querySelector(".voucher-document-title");
    const company = document.querySelector(".voucher-rd-co-name");
    const tableCell = document.querySelector(".voucher-table td");
    const rootStyle = getComputedStyle(root);
    const titleStyle = getComputedStyle(title);
    const companyStyle = getComputedStyle(company);
    const cellStyle = getComputedStyle(tableCell);
    const header = document.querySelector(".voucher-rd-header");
    const headerStyle = getComputedStyle(header);
    return {
      rootOffsetWidth: root.offsetWidth,
      rootClientWidth: root.clientWidth,
      rootMaxWidth: rootStyle.maxWidth,
      rootWidth: rootStyle.width,
      rootBoxSizing: rootStyle.boxSizing,
      rootPaddingLeft: rootStyle.paddingLeft,
      rootPaddingRight: rootStyle.paddingRight,
      parentClientWidth: root.parentElement.clientWidth,
      rootCssVarWidth: rootStyle.getPropertyValue("--voucher-paper-max-width").trim(),
      fontScale: rootStyle.getPropertyValue("--voucher-font-scale").trim(),
      tableFontScale: rootStyle.getPropertyValue("--voucher-table-font-scale").trim(),
      headerDisplay: headerStyle.display,
      headerGridTemplateColumns: headerStyle.gridTemplateColumns,
      titleFontSize: titleStyle.fontSize,
      titleScrollWidth: title.scrollWidth,
      titleClientWidth: title.clientWidth,
      companyFontSize: companyStyle.fontSize,
      companyWhiteSpace: companyStyle.whiteSpace,
      companyScrollWidth: company.scrollWidth,
      companyClientWidth: company.clientWidth,
      cellFontSize: cellStyle.fontSize,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    };
  })()`;

  const metrics = await win.webContents.executeJavaScript(collectMetricsScript);

  const expectedA5Width = getVoucherPaperMaxWidth("A5");
  assert(Math.abs(metrics.rootOffsetWidth - expectedA5Width) <= 1, `A5 print root width ${metrics.rootOffsetWidth} != ${expectedA5Width}`);
  assert.equal(metrics.rootCssVarWidth, `${expectedA5Width}px`);
  assert.equal(metrics.rootMaxWidth, `${expectedA5Width}px`);
  assert.equal(metrics.fontScale, "1");
  assert.equal(metrics.tableFontScale, "1");
  assert.equal(metrics.headerDisplay, "grid");
  assert(metrics.headerGridTemplateColumns.includes("70px"), `unexpected header grid columns: ${metrics.headerGridTemplateColumns}`);
  assert.equal(metrics.titleFontSize, "17.55px");
  assert(metrics.titleScrollWidth <= metrics.titleClientWidth + 1, "voucher title is clipped/overflowing");
  assert.equal(metrics.companyWhiteSpace, "nowrap");
  assert(metrics.companyScrollWidth <= metrics.companyClientWidth + 1, "company title is clipped/overflowing");
  assert.equal(metrics.cellFontSize, "13px");
  assert(metrics.bodyScrollWidth <= metrics.viewportWidth + 1, "print document has horizontal overflow");

  const previewDoc = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <style>${appStyles}</style>
  <style>
    body { margin: 0; background: #dbe3ee; display: block; }
    .printable-voucher {
      --voucher-font-scale: 1;
      --voucher-table-font-scale: 1;
      --voucher-paper-max-width: ${expectedA5Width}px;
      --voucher-paper-height: ${expectedA5Width * (210 / 148)}px;
      max-width: ${expectedA5Width}px !important;
    }
  </style>
</head>
<body>
  <div id="voucher-print-area">${sampleVoucherHtml}</div>
</body>
</html>`;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewDoc)}`);
  const previewMetrics = await win.webContents.executeJavaScript(collectMetricsScript);
  assert(Math.abs(previewMetrics.rootOffsetWidth - metrics.rootOffsetWidth) <= 1, `preview width ${previewMetrics.rootOffsetWidth} != print width ${metrics.rootOffsetWidth}: ${JSON.stringify(previewMetrics)}`);
  assert.equal(previewMetrics.headerDisplay, metrics.headerDisplay);
  assert.equal(previewMetrics.titleFontSize, metrics.titleFontSize);
  assert.equal(previewMetrics.companyFontSize, metrics.companyFontSize);
  assert.equal(previewMetrics.cellFontSize, metrics.cellFontSize);

  const scaledPrintDoc = buildVoucherPrintDocument({
    voucherHtml: sampleVoucherHtml,
    printFontScale: 1.2,
    printPaperSize: "A5",
    appDir
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(scaledPrintDoc)}`);
  const scaledPrintMetrics = await win.webContents.executeJavaScript(collectMetricsScript);

  const scaledPreviewDoc = previewDoc.replaceAll("--voucher-table-font-scale: 1;", "--voucher-table-font-scale: 1.2;");
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(scaledPreviewDoc)}`);
  const scaledPreviewMetrics = await win.webContents.executeJavaScript(collectMetricsScript);

  assert.equal(scaledPrintMetrics.fontScale, "1");
  assert.equal(scaledPrintMetrics.tableFontScale, "1.2");
  assert.equal(scaledPrintMetrics.titleFontSize, "17.55px");
  assert.equal(scaledPrintMetrics.companyFontSize, "12.6px");
  assert.equal(scaledPrintMetrics.cellFontSize, "15.6px");
  assert.equal(scaledPreviewMetrics.titleFontSize, scaledPrintMetrics.titleFontSize);
  assert.equal(scaledPreviewMetrics.companyFontSize, scaledPrintMetrics.companyFontSize);
  assert.equal(scaledPreviewMetrics.cellFontSize, scaledPrintMetrics.cellFontSize);

  const customizedVoucherHtml = sampleVoucherHtml.replace(
    'class="printable-voucher" style="',
    'class="printable-voucher voucher-template-customized" style="--voucher-template-font-family: Arial, sans-serif; --voucher-template-title-font-size: 20px; --voucher-template-table-font-size: 12px; --voucher-template-margin-left: 5mm; --voucher-template-margin-right: 5mm; '
  ).replace(
    'line-height: 1.25;">',
    'line-height: 1.25; padding-left: 5mm; padding-right: 5mm;">'
  );
  const customizedDoc = buildVoucherPrintDocument({
    voucherHtml: customizedVoucherHtml,
    printFontScale: 1,
    printPaperSize: "A5",
    appDir
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(customizedDoc)}`);
  const customizedMetrics = await win.webContents.executeJavaScript(collectMetricsScript);
  assert.equal(customizedMetrics.titleFontSize, "17.55px");
  assert.equal(customizedMetrics.companyFontSize, "14px");
  assert.equal(customizedMetrics.cellFontSize, "12px");
  assert(Math.abs(parseFloat(customizedMetrics.rootPaddingLeft) - 18.9) < 0.6);
  assert(Math.abs(parseFloat(customizedMetrics.rootPaddingRight) - 18.9) < 0.6);

  const a4Doc = buildVoucherPrintDocument({
    voucherHtml: sampleVoucherHtml,
    printFontScale: 1,
    printPaperSize: "A4",
    appDir
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(a4Doc)}`);
  const a4RootWidth = await win.webContents.executeJavaScript(`document.querySelector(".printable-voucher").offsetWidth`);
  assert.equal(a4RootWidth, getVoucherPaperMaxWidth("A4"));

  await win.close();
  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
