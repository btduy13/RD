// Shared print scale / paper helpers (preview + Electron print pipeline)
(function (root) {
  const PRINT_FONT_SCALE_OPTIONS = [
    0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5
  ];
  const PRINT_PAPER_SIZES = ["A4", "A5"];
  const A5_WIDTH_RATIO = 148 / 210;

  function normalizePrintFontScale(value) {
    const n = Number(value);
    if (Number.isNaN(n) || n <= 0) return 1;
    return n;
  }

  function getPrintPaperFitFactor(paperSize) {
    return paperSize === "A5" ? A5_WIDTH_RATIO : 1;
  }

  function getVoucherPaperMaxWidth(paperSize) {
    const paper = paperSize === "A4" ? "A4" : "A5";
    return paper === "A5" ? Math.round(800 * A5_WIDTH_RATIO) : 800;
  }

  /** @deprecated Use getPrintFontScale + getVoucherPaperMaxWidth; kept for compat — font scale only */
  function getEffectivePrintScale(fontScale, paperSize) {
    return normalizePrintFontScale(fontScale);
  }

  function getPrintPageMargins(paperSize) {
    return paperSize === "A4" ? "10mm 12mm" : "6mm 8mm";
  }

  function getVoucherPreviewPageHeight(paperSize, paperWidthPx) {
    const width = Number(paperWidthPx);
    const paperW = width > 0 ? width : getVoucherPaperMaxWidth(paperSize);
    const paper = paperSize === "A4" ? "A4" : "A5";
    if (paper === "A5") {
      return paperW * (210 / 148);
    }
    return paperW * (297 / 210);
  }

  function formatPrintScaleLabel(scale) {
    return `${Math.round(normalizePrintFontScale(scale) * 100)}%`;
  }

  const api = {
    PRINT_FONT_SCALE_OPTIONS,
    PRINT_PAPER_SIZES,
    A5_WIDTH_RATIO,
    normalizePrintFontScale,
    getPrintPaperFitFactor,
    getVoucherPaperMaxWidth,
    getEffectivePrintScale,
    getPrintPageMargins,
    getVoucherPreviewPageHeight,
    formatPrintScaleLabel
  };

  root.PrintSettings = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
