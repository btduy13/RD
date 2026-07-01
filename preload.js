// TỆP PRELOAD GIÚP BẢO MẬT GIAO TIẾP GIỮA DESKTOP VÀ GIAO DIỆN (PRELOAD.JS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Trả về phiên bản hiện tại từ package.json
  getLocalVersion: () => ipcRenderer.invoke('get-local-version'),
  getBootSessionId: () => ipcRenderer.invoke('get-boot-session-id'),
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
  // Sao lưu thủ công (renderer gửi JSON data lên main để ghi file)
  saveBackupOnExit: (jsonData) => ipcRenderer.invoke('save-backup-on-exit', jsonData),
  // Lấy đường dẫn thư mục backup
  getBackupDir: () => ipcRenderer.invoke('get-backup-dir'),
  // Ghi log gỡ lỗi đồng bộ
  writeLog: (content) => ipcRenderer.invoke('write-log', content),
  // Kích hoạt tiến trình in ấn hệ thống
  printWindow: () => ipcRenderer.invoke('print-window'),
  // Xuất file PDF bản địa của OS
  printToPDF: (filename) => ipcRenderer.invoke('print-to-pdf', filename),
  // Lưu state ra file JSON (không giới hạn kích thước, thay thế localStorage)
  writeStateFile: (jsonData) => ipcRenderer.invoke('write-state-file', jsonData),
  // Đọc state từ file JSON
  readStateFile: () => ipcRenderer.invoke('read-state-file'),
  // Đọc file backup gần nhất để phục hồi khi state bị hỏng
  readLatestBackup: () => ipcRenderer.invoke('read-latest-backup'),
  // Ghi phần chênh lệch (delta) ra SQLite
  writeStateDelta: (delta) => ipcRenderer.invoke('write-state-delta', delta),
  listTemplateFiles: () => ipcRenderer.invoke('list-template-files'),
  confirm: (message) => ipcRenderer.sendSync('show-confirm-dialog', message),
});

