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

window.persistFullState = persistFullState;
window.persistStateDelta = persistStateDelta;
