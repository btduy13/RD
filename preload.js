// TỆP PRELOAD GIÚP BẢO MẬT GIAO TIẾP GIỮA DESKTOP VÀ GIAO DIỆN (PRELOAD.JS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Trả về phiên bản hiện tại từ package.json
  getLocalVersion: () => ipcRenderer.invoke('get-local-version'),
  // Mở URL bên ngoài bằng trình duyệt mặc định
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  // Mở trang tải bộ cài mới (GitHub Releases) trong trình duyệt
  triggerAutoUpdate: (downloadUrl) => ipcRenderer.invoke('trigger-auto-update', downloadUrl),
  // Kích hoạt tải và cài đặt cập nhật trực tiếp
  downloadAndInstallUpdate: (url) => ipcRenderer.invoke('download-and-install-update', url),
  // Đăng ký lắng nghe tiến trình tải về
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, percent) => callback(percent)),
  // Đọc file Excel từ thư mục excel/ trong app (dùng fs thay vì fetch để tránh lỗi file:// protocol)
  readExcelFile: (filename) => ipcRenderer.invoke('read-excel-file', filename),
  // Liệt kê danh sách file trong thư mục excel/
  listExcelDir: () => ipcRenderer.invoke('list-excel-dir')
});
