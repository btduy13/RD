const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../js/sync-v2.js"), "utf8");
let body = src;

body = body.replace(/window\.initCloudSync[\s\S]*$/m, "");
body = body.replace(/^\/\/ ={10,}[\s\S]*?\/\/ ={10,}\n\n/, "");
body = body.replace("let supabaseClient = null;", "");
body = body.replace(
  "let lastSyncState = window.lastSyncState || null;",
  "let lastSyncState: AppState | null = null;"
);
body = body.replace(/window\.lastSyncState/g, "lastSyncState");
body = body.replace(/cloudSyncSettings\./g, "readCloudSyncSettings().");
body = body.replace(
  /if \(typeof supabase === "undefined" \|\| !supabase\.createClient\) \{[\s\S]*?return;\n  \}\n\n  startSupabaseClient\(\);/,
  "startSupabaseClient();"
);
body = body.replace(
  "supabaseClient = supabase.createClient(readCloudSyncSettings().supabaseUrl, readCloudSyncSettings().supabaseAnonKey);",
  "supabaseClient = createClient(readCloudSyncSettings().supabaseUrl!, readCloudSyncSettings().supabaseAnonKey!);"
);
body = body.replace(/showToast\(/g, "bridgeToast(");
body = body.replace(
  /if \(typeof addErrorLog === "function"\) addErrorLog\("([^"]+)", ([^,]+), ([^)]+)\);/g,
  'console.error("[CloudSyncV2] $1:", $2, $3);'
);
body = body.replace(
  /if \(result && result\.ok && typeof initializeLastSavedState === "function"\) \{\s*initializeLastSavedState\(cacheState\);\s*\}/g,
  "if (result && result.ok) syncBridge?.onStateSaved?.();"
);
body = body.replace(
  /if \(typeof initializeLastSavedState === "function"\) initializeLastSavedState\(cacheState\);/g,
  "syncBridge?.onStateSaved?.();"
);
body = body.replace(
  /function syncV2RefreshUiAfterPull\(\) \{[\s\S]*?\}/,
  `async function syncV2RefreshUiAfterPull() {
  if (syncBridge?.recalculate) {
    const next = await syncBridge.recalculate(getBridgeState());
    setBridgeState(next);
  }
}`
);
body = body.replace(
  /function updateCloudSyncBadge\(connected, text, color = "#64748b"\) \{[\s\S]*?\n\}/,
  `function updateCloudSyncBadge(connected: boolean, text: string, color = "#64748b") {
  const statusText = String(text || "");
  const lower = statusText.toLowerCase();
  const isSyncing =
    lower.includes("dang") ||
    lower.includes("tai") ||
    lower.includes("day") ||
    lower.includes("đang") ||
    lower.includes("quet") ||
    lower.includes("cho");
  const isError =
    color === "#ef4444" ||
    lower.includes("loi") ||
    lower.includes("lỗi") ||
    lower.includes("error");
  const badge: SyncBadgeState = {
    active: connected || isSyncing,
    label: statusText,
    color: isError
      ? "#ef4444"
      : isSyncing
        ? color && color !== "#64748b"
          ? color
          : "#f59e0b"
        : connected
          ? "#10b981"
          : color,
  };
  syncBridge?.onBadgeUpdate?.(badge);
  legacyBadgeCallback?.(connected, text, color);
}`
);
body = body.replace(/if \(typeof updateCloudSyncBadge === "function"\) \{\s*/g, "");
body = body.replace(
  /function isVoucherEntryModalOpen\(\) \{[\s\S]*?\n\}/,
  `function isVoucherEntryModalOpen(): boolean {
  if (syncBridge?.isVoucherModalOpen?.()) return true;
  const entryModalIds = [
    "modal-add-sales",
    "modal-add-purchase",
    "modal-add-purchase-order",
    "modal-add-purchase-return",
    "modal-add-sales-return",
    "modal-add-sales-quotation",
    "modal-add-receipt",
    "modal-add-payment",
    "modal-edit-debt",
  ];
  return entryModalIds.some((id) => isElementVisible(document.getElementById(id)));
}`
);
body = body.replace(
  /if \(typeof lastSavedState === "undefined" \|\| !lastSavedState\) return false;/,
  "if (!lastSavedStateSnapshot) return false;"
);
body = body.replace(/lastSavedState\[/g, "lastSavedStateSnapshot[");
body = body.replace(/lastSavedState\./g, "lastSavedStateSnapshot.");
body = body.replace(
  /\(typeof window !== "undefined" && window\.originalStateLastModified\)/g,
  "originalStateLastModified"
);
body = body.replace(
  /typeof state !== "undefined" && state \? state\._lastPulledCloudTs : 0/g,
  "getBridgeState()?._lastPulledCloudTs ?? 0"
);
body = body.replace(/typeof state !== "undefined" && state/g, "getBridgeState()");
body = body.replace(/typeof state !== "undefined" \? state : null/g, "getBridgeState()");
body = body.replace(/cacheState = state\)/g, "cacheState = getBridgeState())");
body = body.replace(
  /function trackDeletedIds\(ids, entityType = "voucher"\) \{[\s\S]*?\n\}/,
  `function trackDeletedIds(ids: string[] | null | undefined, entityType = "voucher") {
  if (!ids || ids.length === 0) return;
  const state = getBridgeState();
  const deletedIds = Array.isArray(state.deletedIds) ? [...state.deletedIds] : [];
  const deletedCloudKeys = Array.isArray(state.deletedCloudKeys) ? [...state.deletedCloudKeys] : [];
  const prefix = syncV2PrefixForEntity(entityType);
  ids.forEach((id) => {
    if (!id) return;
    if (!deletedIds.includes(id)) deletedIds.push(id);
    const cloudKey = \`\${prefix}\${id}\`;
    if (!deletedCloudKeys.includes(cloudKey)) deletedCloudKeys.push(cloudKey);
  });
  setBridgeState({ ...state, deletedIds, deletedCloudKeys, _lastModified: Date.now() });
}`
);
body = body.replace(
  /if \(getBridgeState\(\)\) \{\s*state\._lastPulledCloudTs = safeTs;\s*\}/g,
  "patchBridgeState({ _lastPulledCloudTs: safeTs });"
);
body = body.replace(
  "const metadata = syncV2SplitMetadata(state);",
  "const metadata = syncV2SplitMetadata(getBridgeState());"
);
body = body.replace(
  "lastSyncState = syncV2Clone(state);",
  "lastSyncState = syncV2Clone(getBridgeState());"
);
body = body.replace(
  `    const vouchersBefore = Array.isArray(state.vouchers) ? state.vouchers.length : 0;
    const mergeResult = syncV2MergeStatesCore(state, cloudSnapshot, {
      cloneWinners: true,
      cloneMetadata: true,
      collectStats: true
    });
    const merged = mergeResult.state;
    const stats = mergeResult.stats;
    const prunedCount = syncV2PruneStaleLocalOnlyItems(merged, state, cloudSnapshot, checkpoint);
    const hasChanges = stats.changed || prunedCount > 0;

    if (hasChanges) {
      state = merged;
    } else {
      // Nothing user-visible changed: keep the current state object and only
      // refresh the sync bookkeeping fields.
      state._lastModified = merged._lastModified;
      state._cloudWatermark = merged._cloudWatermark;
      state.deletedIds = merged.deletedIds;
      state.deletedCloudKeys = merged.deletedCloudKeys;
      if (merged.lastModifiedBy !== undefined) state.lastModifiedBy = merged.lastModifiedBy;
    }

    updateLastSyncState(cloudSnapshot);
    persistLastPulledCloudTs(watermark);
    syncV2Log(\`Ket qua merge: vouchers truoc=\${vouchersBefore}, sau=\${state.vouchers.length}, thay doi=\${hasChanges ? "co" : "khong"}, pruned=\${prunedCount}\`);

    if (hasChanges) {
      const deltaPersisted = await syncV2PersistPullDeltaToCache(state, stats.changedIdsByEntity);`,
  `    const liveState = getBridgeState();
    const vouchersBefore = Array.isArray(liveState.vouchers) ? liveState.vouchers.length : 0;
    const mergeResult = syncV2MergeStatesCore(liveState, cloudSnapshot, {
      cloneWinners: true,
      cloneMetadata: true,
      collectStats: true
    });
    const merged = mergeResult.state;
    const stats = mergeResult.stats;
    const prunedCount = syncV2PruneStaleLocalOnlyItems(merged, liveState, cloudSnapshot, checkpoint);
    const hasChanges = stats?.changed || prunedCount > 0;

    if (hasChanges) {
      setBridgeState(merged);
    } else {
      setBridgeState({
        ...liveState,
        _lastModified: merged._lastModified,
        _cloudWatermark: merged._cloudWatermark,
        deletedIds: merged.deletedIds,
        deletedCloudKeys: merged.deletedCloudKeys,
        ...(merged.lastModifiedBy !== undefined ? { lastModifiedBy: merged.lastModifiedBy } : {})
      });
    }

    updateLastSyncState(cloudSnapshot);
    persistLastPulledCloudTs(watermark);
    const afterState = getBridgeState();
    syncV2Log(\`Ket qua merge: vouchers truoc=\${vouchersBefore}, sau=\${afterState.vouchers.length}, thay doi=\${hasChanges ? "co" : "khong"}, pruned=\${prunedCount}\`);

    if (hasChanges) {
      const deltaPersisted = await syncV2PersistPullDeltaToCache(getBridgeState(), stats?.changedIdsByEntity ?? null);`
);
body = body.replace(
  "await persistStateCacheAfterCloudPull(state);",
  "await persistStateCacheAfterCloudPull(getBridgeState());"
);
body = body.replace(
  /function computeDelta\(\) \{[\s\S]*?const pushTs = Number\(state\._lastModified\) \|\| now;/,
  `function computeDelta() {
  lastSyncState = lastSyncState || null;
  const state = getBridgeState();
  const rowsToUpsert: SyncRow[] = [];
  const now = Date.now();
  const pushTs = Number(state._lastModified) || now;`
);
body = body.replace(
  /const pushTs = Math\.max\(Date\.now\(\), Number\(state\._lastModified\) \|\| 0, cloudWatermarkBefore \+ 1\);\n    state\._lastModified = pushTs;/,
  `const liveState = getBridgeState();
    const pushTs = Math.max(Date.now(), Number(liveState._lastModified) || 0, cloudWatermarkBefore + 1);
    let state = { ...liveState, _lastModified: pushTs };`
);
body = body.replace(
  /if \(tombstoneRows\.length > 0\) \{\n      state\.deletedIds = \[\];\n      state\.deletedCloudKeys = \[\];\n    \}\n    state\._cloudWatermark = pushTs;/,
  `if (tombstoneRows.length > 0) {
      state = { ...state, deletedIds: [], deletedCloudKeys: [] };
    }
    state = { ...state, _cloudWatermark: pushTs };
    setBridgeState(state);`
);
body = body.replace(/\(state\.vouchers \|\| \[\]\)\.forEach/, "(getBridgeState().vouchers || []).forEach");
body = body.replace(
  /    const forcePullBtn = document\.getElementById\("btn-force-pull"\);[\s\S]*?if \(forcePushBtn\) forcePushBtn\.style\.display = "inline-block";\n/,
  ""
);
body = body.replace(
  'if (confirm("Bạn có chắc muốn đẩy dữ liệu cục bộ lên cloud?")) {',
  'if (appConfirm("Bạn có chắc muốn đẩy dữ liệu cục bộ lên cloud?")) {'
);
body = body.replace(/state\._lastModified = Date\.now\(\);/g, "patchBridgeState({ _lastModified: Date.now() });");
body = body.replace(
  /updateCloudSyncBadge\(false, `May: Dang tai du lieu \(\$\{page \+ 1\}\)\.\.\.`, "#f59e0b"\);\n    \}/g,
  'updateCloudSyncBadge(false, `May: Dang tai du lieu (${page + 1})...`, "#f59e0b");'
);
body = body.replace(
  /updateCloudSyncBadge\(false, `May: Quet thay doi \(\$\{page \+ 1\}\)\.\.\.`, "#f59e0b"\);\n    \}/g,
  'updateCloudSyncBadge(false, `May: Quet thay doi (${page + 1})...`, "#f59e0b");'
);

body = body.replace(/^function initCloudSync/m, "export function initCloudSync");
body = body.replace(/^async function pushToCloud/m, "export async function pushToCloud");
body = body.replace(/^function forcePushToCloud/m, "export function forcePushToCloud");
body = body.replace(/^function forcePullFromCloud/m, "export function forcePullFromCloud");
body = body.replace(/^function manualIncrementalSync/m, "export function manualIncrementalSync");
body = body.replace(/^async function flushDeferredCloudSync/m, "export async function flushDeferredCloudSync");
body = body.replace(/^async function getCloudSafeVoucherId/m, "export async function getCloudSafeVoucherId");
body = body.replace(/^async function ensureCloudSafeVoucherIdForSave/m, "export async function ensureCloudSafeVoucherIdForSave");

const header = `// ==========================================================================
// CLOUD SYNC V2 - React/Zustand port (from js/sync-v2.js)
// ==========================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "@/types/app-state";

export type SyncBadgeState = { active: boolean; label: string; color: string };

export interface SyncBridge {
  getState: () => AppState;
  setState: (state: AppState) => void;
  onStateSaved?: () => void;
  onBadgeUpdate?: (badge: SyncBadgeState) => void;
  onToast?: (message: string, type?: string) => void;
  isVoucherModalOpen?: () => boolean;
  recalculate?: (state: AppState) => AppState | Promise<AppState>;
}

const CLOUD_SETTINGS_KEY = "rd_accounting_cloud_settings";

interface CloudSyncSettings {
  enabled?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

interface SyncEntityDef {
  stateKey: "vouchers" | "products" | "partners";
  rowPrefix: string;
  deleteType: string;
}

interface SyncRow {
  id: string;
  data: Record<string, unknown>;
  last_modified: number;
  is_syncing: boolean;
  updated_at: string;
}

interface SyncMetadataRow {
  id: string;
  data?: Record<string, unknown>;
  last_modified?: number;
  is_syncing?: boolean;
  updated_at?: string;
}

interface LastSavedStateSnapshot {
  companyName?: string;
  address?: string;
  taxCode?: string;
  accountingStandard?: string;
  initialBalances?: Record<string, unknown>;
  partnerOpeningBalances?: Record<string, unknown>;
  partnerOpeningBalanceTs?: Record<string, number>;
  deletedIds?: string[];
  deletedCloudKeys?: string[];
  _lastModified?: number;
  _lastPulledCloudTs?: number;
  cashEntries?: unknown[];
  escrowItems?: unknown[];
  salesTemplatesData?: unknown;
  users?: unknown[];
  actionLogs?: unknown[];
  vouchers: Map<string, unknown>;
  products: Map<string, unknown>;
  partners: Map<string, unknown>;
  [key: string]: unknown;
}

let syncBridge: SyncBridge | null = null;
let legacyBadgeCallback: ((connected: boolean, text: string, color?: string) => void) | null = null;
let lastSavedStateSnapshot: LastSavedStateSnapshot | null = null;
let originalStateLastModified = 0;

let supabaseClient: SupabaseClient | null = null;
`;

const bridgeHelpers = `
export function configureSyncBridge(bridge: SyncBridge): void {
  syncBridge = bridge;
}

export function setSyncBadgeCallback(
  callback: (connected: boolean, text: string, color?: string) => void
): void {
  legacyBadgeCallback = callback;
}

function getBridgeState(): AppState {
  if (!syncBridge) throw new Error("SyncBridge not configured; call configureSyncBridge first.");
  return syncBridge.getState();
}

function setBridgeState(next: AppState): void {
  syncBridge!.setState(next);
}

function patchBridgeState(patch: Partial<AppState>): void {
  setBridgeState({ ...getBridgeState(), ...patch });
}

function readCloudSyncSettings(): CloudSyncSettings {
  try {
    const saved = localStorage.getItem(CLOUD_SETTINGS_KEY);
    if (saved) return JSON.parse(saved) as CloudSyncSettings;
  } catch {
    /* ignore */
  }
  return { enabled: true };
}

function bridgeToast(message: string, type?: string): void {
  syncBridge?.onToast?.(message, type);
}

function appConfirm(message: string): boolean {
  if (window.electronAPI?.confirm) return window.electronAPI.confirm(message);
  return confirm(message);
}

let clientSessionId = "client_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
let lastSyncedCloudTs = 0;

`;

const footer = `
export {
  trackDeletedIds,
  updateCloudSyncBadge,
  isVoucherEntryModalOpen,
};

export const __syncV2Internals__ = {
  syncV2StateFromRows,
  syncV2FetchAllRows,
  syncV2FetchRowsSince,
  mergeStates,
  computeDelta,
  getStoredLastPulledCloudTs,
  persistLastPulledCloudTs,
  getPullCheckpointTs,
  getStartupPullCheckpointTs,
  getLegacyStartupCheckpointTs,
  isCloudSyncLockActive,
  checkCloudMetadataForChanges,
  getCloudSafeVoucherId,
  ensureCloudSafeVoucherIdForSave,
  getMaxVoucherSequenceFromRows,
  fetchExistingCloudIdsByKeysFromClient,
};

export const __syncInternals__ = __syncV2Internals__;
`;

const out = header + bridgeHelpers + body + "\n" + footer;
const outPath = path.join(__dirname, "../renderer/src/core/sync.ts");
fs.writeFileSync(outPath, out);
console.log("Written", out.split("\n").length, "lines to", outPath);
