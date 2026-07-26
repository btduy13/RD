/* ==========================================================================
   USER PREFERENCES — Nhớ lựa chọn giao diện / điều hướng giữa các lần mở app
   ========================================================================== */

const USER_PREFS_KEY = "rd_user_prefs";
const USER_PREFS_VERSION = 1;

const DEFAULT_USER_PREFS = {
  v: USER_PREFS_VERSION,
  theme: "dark",
  sidebarCollapsed: false,
  fontScale: 1,
  printFontScale: 1,
  printPaperSize: "A5",
  printDestination: "printer",
  printDirectEnabled: true,
  printPrinterDeviceName: "",
  printCopies: 1,
  printTemplate: {
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
  },
  lastTab: "dashboard",
  debtsViewTab: "overview",
  debtActiveOnly: false,
  debtTypeFilter: "all",
  debtPeriodFilter: "all"
};

function getPrefsStorage() {
  if (typeof getWebStorage === "function") return getWebStorage();
  if (typeof localStorage !== "undefined") return localStorage;
  if (window && window.localStorage) return window.localStorage;
  return null;
}

function readLegacyTheme(storage) {
  if (!storage) return null;
  return storage.getItem("theme") === "light" ? "light" : null;
}

function loadRawUserPrefs() {
  const storage = getPrefsStorage();
  if (!storage) return { ...DEFAULT_USER_PREFS };

  try {
    const raw = storage.getItem(USER_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_USER_PREFS, ...parsed, v: USER_PREFS_VERSION };
    }
  } catch (_) {
    /* fall through to migration */
  }

  const migrated = { ...DEFAULT_USER_PREFS };
  const legacyTheme = readLegacyTheme(storage);
  if (legacyTheme) migrated.theme = legacyTheme;
  if (storage.getItem("sidebar-collapsed") === "true") migrated.sidebarCollapsed = true;
  const legacyScale = parseFloat(storage.getItem("rd_font_scale"));
  if (!Number.isNaN(legacyScale) && legacyScale > 0) migrated.fontScale = legacyScale;

  try {
    storage.setItem(USER_PREFS_KEY, JSON.stringify(migrated));
  } catch (_) {}

  syncLegacyPreferenceKeys(migrated);
  return migrated;
}

let cachedUserPrefs = null;

function getUserPrefs() {
  if (!cachedUserPrefs) cachedUserPrefs = loadRawUserPrefs();
  return cachedUserPrefs;
}

function syncLegacyPreferenceKeys(prefs) {
  const storage = getPrefsStorage();
  if (!storage || !prefs) return;
  try {
    storage.setItem("theme", prefs.theme === "light" ? "light" : "dark");
    storage.setItem("sidebar-collapsed", prefs.sidebarCollapsed ? "true" : "false");
    storage.setItem("rd_font_scale", String(prefs.fontScale || 1));
  } catch (_) {}
}

function saveUserPrefs(partial) {
  const next = { ...getUserPrefs(), ...partial, v: USER_PREFS_VERSION };
  cachedUserPrefs = next;
  const storage = getPrefsStorage();
  if (!storage) return next;
  try {
    storage.setItem(USER_PREFS_KEY, JSON.stringify(next));
  } catch (_) {}
  syncLegacyPreferenceKeys(next);
  return next;
}

function applyThemePreference(theme) {
  const isLight = theme === "light";
  if (document.body) {
    document.body.classList.toggle("light-theme", isLight);
  }
  if (document.documentElement) {
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    document.documentElement.classList.toggle("pref-light", isLight);
  }
}

function applyThemeEarlyFromStorage() {
  try {
    const storage = getPrefsStorage();
    if (!storage) return;
    let theme = "dark";
    const raw = storage.getItem(USER_PREFS_KEY);
    if (raw) {
      theme = JSON.parse(raw).theme || theme;
    } else if (storage.getItem("theme") === "light") {
      theme = "light";
    }
    if (theme === "light" && document.documentElement) {
      document.documentElement.classList.add("pref-light");
    }
    if (theme === "light" && document.body) {
      document.body.classList.add("light-theme");
    }
  } catch (_) {}
}

function restoreDebtsUIFromPrefs(prefs) {
  const p = prefs || getUserPrefs();
  const typeEl = document.getElementById("debt-type-filter");
  const periodEl = document.getElementById("debt-period-filter");
  const activeEl = document.getElementById("debt-active-only-filter");

  if (typeEl && p.debtTypeFilter) typeEl.value = p.debtTypeFilter;
  if (periodEl && p.debtPeriodFilter) periodEl.value = p.debtPeriodFilter;
  if (activeEl) activeEl.checked = !!p.debtActiveOnly;

  if (typeof changeDebtPeriodFilter === "function") {
    changeDebtPeriodFilter();
  }
}

function persistDebtsUIFromDOM() {
  saveUserPrefs({
    debtActiveOnly: !!document.getElementById("debt-active-only-filter")?.checked,
    debtTypeFilter: document.getElementById("debt-type-filter")?.value || "all",
    debtPeriodFilter: document.getElementById("debt-period-filter")?.value || "all",
    debtsViewTab: typeof currentDebtsViewTab !== "undefined" ? currentDebtsViewTab : getUserPrefs().debtsViewTab
  });
}

function restoreUserPreferencesUI() {
  const prefs = getUserPrefs();
  applyThemePreference(prefs.theme);

  if (prefs.sidebarCollapsed) {
    const sidebar = document.querySelector(".sidebar");
    if (sidebar) sidebar.classList.add("collapsed");
  }

  const printScaleSelect = document.getElementById("voucher-preview-font-scale-select");
  if (printScaleSelect) {
    const printScale = prefs.printFontScale || 1;
    printScaleSelect.value = String(printScale);
  }

  const printPaperSelect = document.getElementById("voucher-preview-paper-size-select");
  if (printPaperSelect && prefs.printPaperSize) {
    printPaperSelect.value = prefs.printPaperSize;
  }

  const directPrintToggle = document.getElementById("voucher-direct-print-enabled");
  if (directPrintToggle) {
    directPrintToggle.checked = prefs.printDirectEnabled !== false;
  }

  const printCopiesInput = document.getElementById("voucher-print-copies-input");
  if (printCopiesInput) {
    const copiesVal = parseInt(prefs.printCopies, 10);
    printCopiesInput.value = (!isNaN(copiesVal) && copiesVal >= 1) ? String(Math.min(copiesVal, 99)) : "1";
  }

  if (typeof ensurePrintPageStyle === "function") {
    ensurePrintPageStyle(prefs.printPaperSize || "A5");
  }

  if (typeof applyFontSizeScale === "function") {
    applyFontSizeScale(prefs.fontScale);
  } else if (document.body && prefs.fontScale) {
    document.body.style.zoom = prefs.fontScale;
    document.body.style.height = (100 / prefs.fontScale) + "vh";
    document.body.style.width = (100 / prefs.fontScale) + "vw";
  }

  restoreDebtsUIFromPrefs(prefs);

  if (typeof updateThemeToggleIcon === "function") {
    updateThemeToggleIcon();
  }
}

function restoreLastNavigationTab() {
  const prefs = getUserPrefs();
  const tabId = prefs.lastTab || "dashboard";
  if (typeof switchTab === "function") {
    switchTab(tabId);
  }
  if (tabId === "debts" && typeof switchDebtsViewTab === "function") {
    switchDebtsViewTab(prefs.debtsViewTab || "overview");
    restoreDebtsUIFromPrefs(prefs);
    if (typeof filterDebts === "function") filterDebts();
  }
}

window.USER_PREFS_KEY = USER_PREFS_KEY;
window.DEFAULT_USER_PREFS = DEFAULT_USER_PREFS;
window.getUserPrefs = getUserPrefs;
window.saveUserPrefs = saveUserPrefs;
window.applyThemePreference = applyThemePreference;
window.applyThemeEarlyFromStorage = applyThemeEarlyFromStorage;
window.restoreDebtsUIFromPrefs = restoreDebtsUIFromPrefs;
window.persistDebtsUIFromDOM = persistDebtsUIFromDOM;
window.restoreUserPreferencesUI = restoreUserPreferencesUI;
window.restoreLastNavigationTab = restoreLastNavigationTab;
