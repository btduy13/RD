# Graph Report - js  (2026-07-31)

## Corpus Check
- 42 files · ~151,793 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1007 nodes · 2076 edges · 64 communities (54 shown, 10 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 101 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- UI Framework Navigation
- Debt Management
- Voucher Form UI
- Excel Data Integration
- UI Input Interactions
- Cloud Sync State
- Inventory Management
- Partner Management
- Sales Filtering
- Cloud Sync Lifecycle
- Voucher Template Editor
- Shared Utilities
- Purchase Filtering
- Cloud Pull Scheduling
- Authentication
- Cash Management
- Cloud Entity Tombstones
- Cloud Metrics Tasks
- Settings and Backup
- Workspace Tabs
- Application State Persistence
- User Preferences
- Print Settings
- Printer Jobs
- Product Case Deduplication
- Form Autosave
- Voucher Print Document
- Partner Identity
- Backup Storage
- State Delta Tracking
- Purchase Order Tables
- Purchase Tables
- Accounting Reports
- Sales Tables
- Manual Cloud Actions
- Online Write Gate
- Purchase Return Tables
- Quotation Tables
- Sales Return Tables
- Accounting Recalculation
- Dashboard Rendering
- Sales Templates
- Accounting Engine
- Persistence Bridge
- Platform Paths
- Product Identity
- URL Security
- Error Logging
- Sales Form Helpers
- SQLite Migration Guard
- Cloud Voucher Reservation
- Partner Merge
- Purchase Price Autofill
- Purchase Return Pricing
- Purchase Return Filtering
- Purchase Return Submission
- Purchase Submission
- Quotation Filtering
- Sales Return Submission
- Sales Description Sync
- Sales Template Data

## God Nodes (most connected - your core abstractions)
1. `pullAndMergeFromCloud()` - 41 edges
2. `cloudSyncPushNow()` - 24 edges
3. `cloudSyncStartSupabaseClientAttempt()` - 21 edges
4. `cloudSyncLog()` - 18 edges
5. `cloudSyncReadWithRetry()` - 15 edges
6. `cloudSyncRestoreBaselineFromConfirmedCache()` - 14 edges
7. `cloudSyncMergeStatesCore()` - 14 edges
8. `pullFromCloudOnStartup()` - 14 edges
9. `listenToCloudChanges()` - 14 edges
10. `filterDebts()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `cloudSyncMergeStatesCore()` --references--> `CLOUD_SYNC_DELETE_DEFS`  [EXTRACTED]
  cloud-sync.js → cloud-sync.js  _Bridges community 16 → community 5_
- `cloudSyncFetchMetadata()` --calls--> `cloudSyncRecordIncoming()`  [EXTRACTED]
  cloud-sync.js → cloud-sync.js  _Bridges community 17 → community 13_
- `listenToCloudChanges()` --calls--> `cloudSyncRecordIncoming()`  [EXTRACTED]
  cloud-sync.js → cloud-sync.js  _Bridges community 17 → community 9_
- `checkCloudMetadataForChanges()` --calls--> `cloudSyncLog()`  [EXTRACTED]
  cloud-sync.js → cloud-sync.js  _Bridges community 9 → community 13_
- `cloudSyncClearPendingLocalWrite()` --calls--> `cloudSyncLog()`  [EXTRACTED]
  cloud-sync.js → cloud-sync.js  _Bridges community 9 → community 34_

## Import Cycles
- None detected.

## Communities (64 total, 10 thin omitted)

### Community 0 - "UI Framework Navigation"
Cohesion: 0.06
Nodes (77): activeModalsByTab, adjustVoucherPrintCopies(), applyPreset(), applyPrintFontScale(), applyPrintPaperSize(), applyPrintScaleToVoucherRoot(), applyVoucherDirectPrint(), applyVoucherFontScale() (+69 more)

### Community 1 - "Debt Management"
Cohesion: 0.08
Nodes (56): accumulateDebtEntryLines(), appendUnmatchedDebtRow(), batchDeleteDebts(), buildCompanyGroupedList(), calculatePartnerDebts(), calculatePartnerDebtsGrouped(), changeDebtPeriodFilter(), changeDebtsCompanyPage() (+48 more)

### Community 2 - "Voucher Form UI"
Cohesion: 0.10
Nodes (43): addDynamicFormTableRow(), beginVoucherSubmit(), createDynamicFormInput(), createDynamicRowActionsElement(), dynamicFormTableRegistry, endVoucherSubmit(), ensureDynamicItemsRowCountElement(), ensureVoucherModalChrome() (+35 more)

### Community 3 - "Excel Data Integration"
Cohesion: 0.09
Nodes (40): accountingDatalistOptionValue(), autoIntegrateProductsExcel(), autoIntegrateSalesExcel(), autoIntegrateSoChiTietBanHangExcel(), autoIntegrateSoChiTietMuaHangExcel(), autoIntegrateVouchersExcel(), cacheProductOptions(), convertStyle() (+32 more)

### Community 4 - "UI Input Interactions"
Cohesion: 0.08
Nodes (32): bulkSelectedInputs, closeCustomDropdown(), closeMobileSidebar(), filteredOptions, focusRowFirstCell(), getActiveLookupType(), getActiveSearchInputId(), getEditableCellsInRow() (+24 more)

### Community 5 - "Cloud Sync State"
Cohesion: 0.08
Nodes (37): arePartnersEqual(), areProductsEqual(), areVouchersEqual(), CLOUD_SYNC_MERGE_ENTITY_KEYS, CLOUD_SYNC_TIE_KEEP_LOCAL_KEYS, cloudSyncCapturePendingWriteManifest(), cloudSyncClone(), cloudSyncEgressMetrics (+29 more)

### Community 6 - "Inventory Management"
Cohesion: 0.10
Nodes (31): batchDeleteProducts(), buildInventoryTableRowHtml(), changeInventoryPage(), checkForUpdates(), compareVersions(), exportStockLedgerToExcel(), fetchLatestReleaseVersion(), fetchPackageJsonVersion() (+23 more)

### Community 7 - "Partner Management"
Cohesion: 0.11
Nodes (31): autoExtractPhonesAndCleanAddresses(), autoExtractPhonesFromNamesAndClean(), batchDeletePartners(), batchSetPartnersInactive(), buildPartnerTableActions(), changePartnersPage(), deletePartner(), filteredPartnersList (+23 more)

### Community 8 - "Sales Filtering"
Cohesion: 0.07
Nodes (20): allTemplateFiles, autoFillProductPrice(), autoFillQuotationPrice(), autoFillSalesReturnPrice(), autoFillTemplateProductPrice(), debouncedRenderSalesReturnTable, debouncedRenderSalesTable, generateNextQuotationVoucherId() (+12 more)

### Community 9 - "Cloud Sync Lifecycle"
Cohesion: 0.14
Nodes (30): attachCloudFocusCheck(), cloudSyncAuthenticateAndBootstrap(), cloudSyncGetBackoffDelayMs(), cloudSyncGetDatasetIdentity(), cloudSyncGetPendingLocalWriteToken(), cloudSyncGetPendingWriteManifest(), cloudSyncGetStoredDatasetIdentity(), cloudSyncHasPendingLocalWrite() (+22 more)

### Community 10 - "Voucher Template Editor"
Cohesion: 0.18
Nodes (28): addVoucherPreviewExtraContent(), applyVoucherInlineEditorLive(), applyVoucherTemplateSettingsToRoot(), cancelVoucherTemplateEditor(), getDefaultSettings(), getPrintTemplateSettings(), getVieValue(), getVoucherPreviewRoot() (+20 more)

### Community 11 - "Shared Utilities"
Cohesion: 0.09
Nodes (17): extractIdFromParentheses(), formatDateDisplay(), formatIsoDateDisplay(), getPartnerForVoucher(), getPartnerNameForVoucher(), getVoucherLineDiscountAmount(), getVoucherLineDiscountPercent(), getVoucherLineGrossAmount() (+9 more)

### Community 12 - "Purchase Filtering"
Cohesion: 0.09
Nodes (11): autoFillPurchaseOrderPrice(), debouncedRenderPurchaseOrderTable, debouncedRenderPurchaseTable, generateNextPurchaseOrderVoucherId(), handlePurchaseOrderSubmit(), onPurchaseFilterChange(), onPurchaseOrderFilterChange(), purchaseColumnFilters (+3 more)

### Community 13 - "Cloud Pull Scheduling"
Cohesion: 0.13
Nodes (25): checkCloudMetadataForChanges(), cloudSyncEnsureMetadataRow(), cloudSyncFetchMetadata(), cloudSyncGetCloudWatermark(), cloudSyncNoteLegacyLock(), cloudSyncPrePullBeforePush(), cloudSyncPruneStaleLocalOnlyItems(), cloudSyncRefreshUiAfterPull() (+17 more)

### Community 14 - "Authentication"
Cohesion: 0.16
Nodes (18): applyRolePermissions(), clearAuthSession(), deleteUser(), formatDateAndTime(), getAuthBootSessionId(), hideLoginOverlay(), initAuth(), logoutUser() (+10 more)

### Community 15 - "Cash Management"
Cohesion: 0.14
Nodes (19): batchDeleteCash(), calculateCashListTotals(), changeCashPage(), clearCashDateFilter(), filterCash(), filteredCashList, generateNextPaymentVoucherId(), generateNextReceiptVoucherId() (+11 more)

### Community 16 - "Cloud Entity Tombstones"
Cohesion: 0.18
Nodes (23): CLOUD_SYNC_DELETE_DEFS, CLOUD_SYNC_ENTITY_DEFS, cloudSyncApplyPushToLastSyncState(), cloudSyncBuildMetadataForPush(), cloudSyncBuildPushPayload(), cloudSyncClearDeletionMarkerForActiveRow(), cloudSyncDeduplicateState(), cloudSyncDefaultState() (+15 more)

### Community 17 - "Cloud Metrics Tasks"
Cohesion: 0.12
Nodes (21): cloudSyncDeleteRows(), cloudSyncErrorSummary(), cloudSyncFetchAllRows(), cloudSyncFetchLatestRowSummary(), cloudSyncFetchRowsSince(), cloudSyncFinishTask(), cloudSyncPayloadBytes(), cloudSyncPersistDatasetIdentity() (+13 more)

### Community 18 - "Settings and Backup"
Cohesion: 0.18
Nodes (16): cloudSyncSettings, exportData(), foundOldChunkIds, getCloudConfigElements(), importData(), isSupportedSupabaseUrl(), loadCloudSettings(), manualBackupNow() (+8 more)

### Community 19 - "Workspace Tabs"
Cohesion: 0.28
Nodes (15): closeTab(), createTabElement(), findOpenTab(), getHomeLabel(), getTabBar(), getTabBarInner(), init(), isTabRegistered() (+7 more)

### Community 20 - "Application State Persistence"
Cohesion: 0.26
Nodes (15): autoSaveBeforeClose(), cleanNumericVouchers(), executeSaveState(), initApp(), initializeLastSavedState(), logDeltaActivity(), persistStateLocallyWithoutCloud(), pushActivityLogDirectly() (+7 more)

### Community 21 - "User Preferences"
Cohesion: 0.33
Nodes (13): applyThemeEarlyFromStorage(), applyThemePreference(), DEFAULT_USER_PREFS, getPrefsStorage(), getUserPrefs(), loadRawUserPrefs(), persistDebtsUIFromDOM(), readLegacyTheme() (+5 more)

### Community 22 - "Print Settings"
Cohesion: 0.26
Nodes (10): clampNumber(), formatPrintScaleLabel(), getEffectivePrintScale(), getPaperWidthMm(), getPrintMarginPx(), getPrintPageMargins(), getVoucherPaperMaxWidth(), getVoucherPreviewPageHeight() (+2 more)

### Community 23 - "Printer Jobs"
Cohesion: 0.26
Nodes (11): buildElectronPrintOptions(), classifyPrintFailure(), cleanPrinterText(), normalizePaperSize(), normalizePrintRequest(), PRINT_ERROR_CODES, PRINT_MODES, PrinterJobError (+3 more)

### Community 24 - "Product Case Deduplication"
Cohesion: 0.36
Nodes (12): cleanGarbageProducts(), countVoucherRefsForProductId(), dedupeProductCatalogOnState(), findProductById(), findProductIndexById(), isGarbageProductId(), mergeProductRecordFields(), normalizeProductId() (+4 more)

### Community 25 - "Form Autosave"
Cohesion: 0.41
Nodes (11): checkAndRestoreDraft(), clearActiveFormDraft(), collectDraftFields(), debounceSaveDraft(), getConfig(), getDraftStorageKey(), handleTrackedFormChange(), hasMeaningfulDraftContent() (+3 more)

### Community 26 - "Voucher Print Document"
Cohesion: 0.27
Nodes (9): buildVoucherPrintDocument(), extractVoucherPageMargins(), fs, getVoucherPaperMaxWidth(), getVoucherPrintStyles(), path, { pathToFileURL }, readVoucherCssBlock() (+1 more)

### Community 27 - "Partner Identity"
Cohesion: 0.38
Nodes (9): findPartnerByIdentity(), getPartnerGroupDisplayName(), getPartnerGroupKey(), getPartnerIdentityDisplayName(), getPartnerIdentityKey(), getPartnerIdentityRule(), normalizePartnerNameForIdentity(), PARTNER_IDENTITY_RULES (+1 more)

### Community 28 - "Backup Storage"
Cohesion: 0.33
Nodes (8): crypto, fs, listJsonBackupsNewestFirst(), makeBackupTimestamp(), path, readLatestValidJsonBackup(), validateSerializedState(), writeJsonBackup()

### Community 29 - "State Delta Tracking"
Cohesion: 0.31
Nodes (5): buildStateDelta(), ENTITY_WATCH_FIELDS, entityChanged(), entityContentHash(), fnv1aHash()

### Community 30 - "Purchase Order Tables"
Cohesion: 0.22
Nodes (9): batchDeletePurchaseOrders(), changePurchaseOrderPage(), clearPurchaseOrderColumnFilters(), clearPurchaseOrderDateFilter(), filterPurchaseOrderTable(), renderPurchaseOrderTable(), switchPurchaseSubTab(), toggleSelectAllPurchaseOrders() (+1 more)

### Community 31 - "Purchase Tables"
Cohesion: 0.22
Nodes (9): batchDeletePurchases(), buildPurchaseTableRowHtml(), changePurchasePage(), clearPurchaseColumnFilters(), clearPurchaseDateFilter(), filterPurchaseTable(), renderPurchaseTable(), toggleSelectAllPurchases() (+1 more)

### Community 32 - "Accounting Reports"
Cohesion: 0.36
Nodes (7): calculateTrialBalance(), escapeReportText(), generateReport(), getReportSignaturesHTML(), handleReportTypeChange(), printReport(), triggerPrint()

### Community 33 - "Sales Tables"
Cohesion: 0.22
Nodes (9): batchDeleteSales(), buildSalesTableRowHtml(), changeSalesPage(), clearSalesColumnFilters(), clearSalesDateFilter(), filterSalesTable(), renderSalesTable(), toggleSelectAllSales() (+1 more)

### Community 34 - "Manual Cloud Actions"
Cohesion: 0.32
Nodes (8): canStartManualCloudSync(), cloudSyncClearPendingLocalWrite(), confirmCloudSyncAction(), forcePullFromCloud(), forcePushToCloud(), isCloudSyncActionBusy(), manualIncrementalSync(), pushToCloud()

### Community 35 - "Online Write Gate"
Cohesion: 0.50
Nodes (6): assertCanWrite(), canWrite(), ensureBanner(), getStatus(), refreshUi(), setStatus()

### Community 36 - "Purchase Return Tables"
Cohesion: 0.25
Nodes (8): batchDeletePurchaseReturns(), changePurchaseReturnPage(), clearPurchaseReturnColumnFilters(), clearPurchaseReturnDateFilter(), filterPurchaseReturnTable(), renderPurchaseReturnTable(), toggleSelectAllPurchaseReturns(), updateBatchPurchaseReturnsUI()

### Community 37 - "Quotation Tables"
Cohesion: 0.25
Nodes (8): batchDeleteQuotations(), changeQuotationPage(), clearQuotationColumnFilters(), clearQuotationDateFilter(), filterQuotationTable(), renderQuotationTable(), toggleSelectAllQuotations(), updateBatchQuotationsUI()

### Community 38 - "Sales Return Tables"
Cohesion: 0.25
Nodes (8): batchDeleteSalesReturns(), changeSalesReturnPage(), clearSalesReturnColumnFilters(), clearSalesReturnDateFilter(), filterSalesReturnTable(), renderSalesReturnTable(), toggleSelectAllSalesReturns(), updateBatchSalesReturnsUI()

### Community 39 - "Accounting Recalculation"
Cohesion: 0.43
Nodes (4): deleteVoucher(), rebalanceEquity(), recalculateAccounting(), recalculateAccountingFull()

### Community 40 - "Dashboard Rendering"
Cohesion: 0.52
Nodes (6): clearDashboardDateFilter(), filterDashboard(), renderDashboard(), renderDashboardDebts(), renderDashboardNegativeStocks(), renderRecentActivities()

### Community 41 - "Sales Templates"
Cohesion: 0.29
Nodes (7): deleteSalesTemplate(), displaySalesTemplateTable(), filterSalesTemplateTable(), filterTemplateCategory(), handleTemplateSubmit(), renderSalesTemplateTable(), switchSalesSubTab()

### Community 42 - "Accounting Engine"
Cohesion: 0.47
Nodes (3): getRecalcWatermark(), markAccountingValid(), shouldSkipFullRecalc()

### Community 43 - "Persistence Bridge"
Cohesion: 0.47
Nodes (3): getWebStorage(), loadStateFromDisk(), persistFullState()

### Community 44 - "Platform Paths"
Cohesion: 0.47
Nodes (5): ALLOWED_EXCEL_EXTENSIONS, fs, normalizePackagedExcelFilename(), path, resolvePackagedExcelFile()

### Community 45 - "Product Identity"
Cohesion: 0.47
Nodes (3): findProductById(), findProductIndexById(), productIdKey()

### Community 46 - "URL Security"
Cohesion: 0.67
Nodes (5): isAllowedExternalUrl(), isAllowedUpdateRedirectUrl(), isAllowedUpdateRequestUrl(), parseSafeUrl(), UPDATE_ASSET_HOSTS

### Community 47 - "Error Logging"
Cohesion: 0.47
Nodes (4): addErrorLog(), clearErrorLogs(), errorLogs, updateErrorLogsUI()

### Community 48 - "Sales Form Helpers"
Cohesion: 0.33
Nodes (6): findProductByName(), modifySalesTemplate(), openEditTemplateModal(), resetQuotationForm(), resetSalesForm(), templateToQuotation()

### Community 49 - "SQLite Migration Guard"
Cohesion: 0.50
Nodes (3): archiveLegacyStateFile(), fs, getAvailableArchivePath()

### Community 50 - "Cloud Voucher Reservation"
Cohesion: 0.50
Nodes (4): cloudSyncGetUpdatedByToken(), cloudSyncIsOwnUpdatedByToken(), isCloudDuplicateKeyError(), tryReserveCloudVoucherId()

## Knowledge Gaps
- **50 isolated node(s):** `lastRealtimeSelect`, `cloudSyncWriteQueue`, `cloudSyncTasks`, `cloudSyncStartupMetrics`, `cloudSyncEgressMetrics` (+45 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pullAndMergeFromCloud()` connect `Cloud Pull Scheduling` to `Manual Cloud Actions`, `Cloud Sync State`, `Cloud Sync Lifecycle`, `Cloud Entity Tombstones`, `Cloud Metrics Tasks`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `cloudSyncStartSupabaseClientAttempt()` connect `Cloud Sync Lifecycle` to `Cloud Metrics Tasks`, `Cloud Sync State`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **Why does `cloudSyncPushNow()` connect `Cloud Metrics Tasks` to `Manual Cloud Actions`, `Cloud Sync State`, `Cloud Sync Lifecycle`, `Cloud Pull Scheduling`, `Cloud Entity Tombstones`, `Cloud Voucher Reservation`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **What connects `lastRealtimeSelect`, `cloudSyncWriteQueue`, `cloudSyncTasks` to the rest of the system?**
  _50 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Framework Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.06046511627906977 - nodes in this community are weakly interconnected._
- **Should `Debt Management` be split into smaller, more focused modules?**
  _Cohesion score 0.07909604519774012 - nodes in this community are weakly interconnected._
- **Should `Voucher Form UI` be split into smaller, more focused modules?**
  _Cohesion score 0.0975177304964539 - nodes in this community are weakly interconnected._