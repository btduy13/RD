// TỆP PRELOAD GIÚP BẢO MẬT GIAO TIẾP GIỮA DESKTOP VÀ GIAO DIỆN (PRELOAD.JS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Trả về phiên bản hiện tại từ package.json
  getLocalVersion: () => ipcRenderer.invoke('get-local-version'),
  // Kích hoạt kéo mã nguồn tự động bằng Git và khởi động lại
  triggerAutoUpdate: () => ipcRenderer.invoke('trigger-auto-update')
});
