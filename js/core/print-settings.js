// Shared print scale / paper helpers (preview + Electron print pipeline)
(function (root) {
  const PRINT_FONT_SCALE_OPTIONS = [
    0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5
  ];
  const PRINT_PAPER_SIZES = ["A4", "A5"];
  const A5_WIDTH_RATIO = 148 / 210;
  const PRINT_TEMPLATE_FONT_FAMILIES = [
    "Times New Roman",
    "Arial",
    "Tahoma",
    "Verdana"
  ];
  const DEFAULT_PRINT_TEMPLATE_SETTINGS = Object.freeze({
    fontFamily: "Times New Roman",
    contentFontSize: 13,
    tableFontSize: 13,
    titleFontSize: 18,
    lineHeight: 1.25,
    textAlign: "left",
    marginTopMm: 10,
    marginRightMm: 5,
    marginBottomMm: 10,
    marginLeftMm: 5,
    showLogo: true,
    showQr: true,
    showSignatures: true
  });

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizePrintTemplateSettings(value) {
    const raw = value && typeof value === "object" ? value : {};
    const defaults = DEFAULT_PRINT_TEMPLATE_SETTINGS;
    return {
      fontFamily: PRINT_TEMPLATE_FONT_FAMILIES.includes(raw.fontFamily) ? raw.fontFamily : defaults.fontFamily,
      contentFontSize: clampNumber(raw.contentFontSize, 8, 24, defaults.contentFontSize),
      tableFontSize: clampNumber(raw.tableFontSize, 8, 20, defaults.tableFontSize),
      titleFontSize: clampNumber(raw.titleFontSize, 12, 32, defaults.titleFontSize),
      lineHeight: clampNumber(raw.lineHeight, 1, 2, defaults.lineHeight),
      textAlign: ["left", "center", "right"].includes(raw.textAlign) ? raw.textAlign : defaults.textAlign,
      marginTopMm: clampNumber(raw.marginTopMm, 0, 30, defaults.marginTopMm),
      marginRightMm: clampNumber(raw.marginRightMm, 0, 30, defaults.marginRightMm),
      marginBottomMm: clampNumber(raw.marginBottomMm, 0, 30, defaults.marginBottomMm),
      marginLeftMm: clampNumber(raw.marginLeftMm, 0, 30, defaults.marginLeftMm),
      showLogo: raw.showLogo !== false,
      showQr: raw.showQr !== false,
      showSignatures: raw.showSignatures !== false
    };
  }

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
    return "0";
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
    PRINT_TEMPLATE_FONT_FAMILIES,
    DEFAULT_PRINT_TEMPLATE_SETTINGS,
    A5_WIDTH_RATIO,
    normalizePrintFontScale,
    getPrintPaperFitFactor,
    getVoucherPaperMaxWidth,
    getEffectivePrintScale,
    getPrintPageMargins,
    normalizePrintTemplateSettings,
    getVoucherPreviewPageHeight,
    formatPrintScaleLabel
  };

  root.PrintSettings = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
