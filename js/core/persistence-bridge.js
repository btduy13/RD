/* ==========================================================================
   PERSISTENCE BRIDGE — Gói IPC Electron thành Promise awaitable
   ========================================================================== */

function getWebStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  if (window && window.localStorage) return window.localStorage;
  return null;
}

async function persistFullState(jsonString) {
  if (window.electronAPI && typeof window.electronAPI.writeStateFile === "function") {
    return window.electronAPI.writeStateFile(jsonString);
  }
  const storage = getWebStorage();
  if (storage) {
    storage.setItem("rd_accounting_online_cache", jsonString);
  }
  return { ok: true };
}

async function persistStateDelta(delta) {
  if (window.electronAPI && typeof window.electronAPI.writeStateDelta === "function") {
    return window.electronAPI.writeStateDelta(delta);
  }
  return { ok: false, error: "Delta persist unavailable outside Electron" };
}

async function loadStateFromDisk() {
  if (window.electronAPI && typeof window.electronAPI.readStateFile === "function") {
    return window.electronAPI.readStateFile();
  }
  const storage = getWebStorage();
  const cache = storage ? storage.getItem("rd_accounting_online_cache") : null;
  if (!cache) return { ok: false, error: "No cache" };
  try {
    return { ok: true, data: JSON.parse(cache) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function loadLatestBackupFromDisk() {
  if (window.electronAPI && typeof window.electronAPI.readLatestBackup === "function") {
    return window.electronAPI.readLatestBackup();
  }
  return { ok: false, error: "Backup read unavailable" };
}

window.persistFullState = persistFullState;
window.persistStateDelta = persistStateDelta;
window.loadStateFromDisk = loadStateFromDisk;
window.loadLatestBackupFromDisk = loadLatestBackupFromDisk;
