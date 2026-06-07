// CẤU HÌNH VÒNG ĐỜI VÀ CỬA SỔ DESKTOP APP ĐỘC LẬP (MAIN.JS)
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

// ===========================================================================
// AUTO-BACKUP: Tự động lưu file backup JSON vào thư mục backup/ khi đóng app
// ===========================================================================
const BACKUP_DIR = path.join(__dirname, 'backup');
const MAX_BACKUP_FILES = 30; // Giữ tối đa 30 bản sao lưu gần nhất

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('RD_Backup_') && f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time); // Mới nhất trước

    // Xóa các file cũ vượt quá giới hạn
    files.slice(MAX_BACKUP_FILES).forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch(e) {}
    });
  } catch(e) {
    console.error('Lỗi dọn backup cũ:', e);
  }
}

function makeBackupTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ===========================================================================
// HELPER
// ===========================================================================

// Helper đọc phiên bản từ package.json
function getAppVersion() {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '1.0.0';
    }
  } catch (err) {
    console.error("Lỗi đọc phiên bản package.json:", err);
  }
  return '1.0.0';
}

// ===========================================================================
// TẠO CỬA SỔ CHÍNH
// ===========================================================================
function createWindow() {
  const appVersion = getAppVersion();

  // 1. Khởi tạo cửa sổ Desktop với kích thước tiêu chuẩn và thiết kế cao cấp
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    title: `RD Accounting v${appVersion} - Phần Mềm Kế Toán Rạng Đông`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Tắt sandbox để preload.js có quyền chạy giao tiếp IPC đầy đủ
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    // Giao diện bắt đầu mượt mà, ẩn cửa sổ cho đến khi sẵn sàng hiển thị để tránh chớp trắng
    show: false,
    backgroundColor: '#0b0f19' // Đồng bộ với màu Slate mặc định của app
  });

  // 2. Tải trang giao diện chính
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 3. Ẩn thanh menu trình duyệt mặc định (File, Edit, View...) để giống app Desktop chuyên nghiệp
  Menu.setApplicationMenu(null);

  // 4. Hiển thị cửa sổ khi đã nạp xong toàn bộ tài nguyên
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(async () => {
      try {
        const db = await mainWindow.webContents.executeJavaScript("localStorage.getItem('rd_accounting_db')");
        console.log('--- LOCAL_STORAGE_DB_SIZE: ' + (db ? db.length : 0));
        if (db) {
          const parsed = JSON.parse(db);
          console.log('--- LOCAL_STORAGE_VOUCHERS_COUNT: ' + (parsed.vouchers ? parsed.vouchers.length : 0));
          const types = {};
          if (parsed.vouchers) {
            parsed.vouchers.forEach(v => types[v.type] = (types[v.type] || 0) + 1);
          }
          console.log('--- LOCAL_STORAGE_VOUCHER_TYPES: ' + JSON.stringify(types));
          
          const errLogs = await mainWindow.webContents.executeJavaScript("localStorage.getItem('rd_accounting_error_logs')");
          console.log('--- LOCAL_STORAGE_ERRORS: ' + errLogs);
          const restoreV6 = await mainWindow.webContents.executeJavaScript("localStorage.getItem('db_restore_v6')");
          console.log('--- LOCAL_STORAGE_RESTORE_V6: ' + restoreV6);
          const fbStatus = await mainWindow.webContents.executeJavaScript("({ active: cloudSyncActive, hasDb: !!firebaseDb, hasFirebase: typeof firebase !== 'undefined', badge: document.getElementById('cloud-sync-status-text') ? document.getElementById('cloud-sync-status-text').innerText : 'no badge' })");
          console.log('--- FIREBASE_STATUS: ' + JSON.stringify(fbStatus));
        }
      } catch (err) {
        console.error('Error reading localStorage:', err);
      }
    }, 5000);
  });

  // 5. Tự động sao lưu và đẩy Cloud trước khi đóng (ngăn tắt tức thì, chờ xong rồi destroy)
  let _isClosing = false;
  mainWindow.on('close', async (e) => {
    if (_isClosing) return; // Đã xử lý xong, cho phép đóng
    e.preventDefault();    // Ngăn đóng ngay lập tức

    _isClosing = true;

    // Timeout fallback: nếu quá 10 giây vẫn chưa xong thì buộc đóng
    const forceCloseTimer = setTimeout(() => {
      console.warn('[AutoSave] Timeout 10s, buộc đóng ứng dụng.');
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    }, 10000);

    try {
      // Bước 1: Gọi renderer thực hiện saveState() + pushToCloud() và chờ
      if (mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.webContents.executeJavaScript('autoSaveBeforeClose()');
      }

      // Bước 2: Đọc lại localStorage (sau khi đã lưu) để ghi file backup cục bộ
      if (mainWindow && !mainWindow.isDestroyed()) {
        const jsonData = await mainWindow.webContents.executeJavaScript(
          "localStorage.getItem('rd_accounting_db') || ''"
        );
        if (jsonData && jsonData.length > 10) {
          ensureBackupDir();
          const backupPath = path.join(BACKUP_DIR, `RD_Backup_${makeBackupTimestamp()}.json`);
          fs.writeFileSync(backupPath, jsonData, 'utf8');
          cleanOldBackups();
          console.log(`[AutoBackup] Đã tự động sao lưu khi đóng: ${backupPath}`);
        }
      }
    } catch (err) {
      console.error('[AutoSave] Lỗi trong quá trình lưu trước khi đóng:', err);
    } finally {
      clearTimeout(forceCloseTimer);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    }
  });

  // 6. Giải phóng tài nguyên khi cửa sổ đóng
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===========================================================================
// IPC HANDLERS GIAO TIẾP ĐỂ TỰ ĐỘNG CẬP NHẬT
// ===========================================================================

// 0. Đọc file Excel từ thư mục excel/ bằng fs (tránh lỗi fetch với file:// protocol trong Electron)
ipcMain.handle('read-excel-file', async (event, filename) => {
  try {
    const filePath = path.join(__dirname, 'excel', filename);
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File không tồn tại: ${filename}` };
    }
    const buffer = fs.readFileSync(filePath);
    // Trả về dưới dạng mảng số nguyên để renderer có thể tạo Uint8Array
    return { ok: true, data: Array.from(buffer) };
  } catch (err) {
    console.error('Lỗi đọc file Excel:', err);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Renderer gửi dữ liệu JSON để main.js ghi xuống đĩa (sao lưu thủ công)
ipcMain.handle('save-backup-on-exit', async (event, jsonData) => {
  try {
    ensureBackupDir();
    const backupPath = path.join(BACKUP_DIR, `RD_Backup_${makeBackupTimestamp()}.json`);
    fs.writeFileSync(backupPath, jsonData, 'utf8');
    cleanOldBackups();
    console.log(`[AutoBackup] Đã lưu sao lưu: ${backupPath}`);
    return { ok: true, path: backupPath };
  } catch (err) {
    console.error('[AutoBackup] Lỗi ghi backup:', err);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Trả về đường dẫn thư mục backup
ipcMain.handle('get-backup-dir', () => {
  ensureBackupDir();
  return BACKUP_DIR;
});

ipcMain.handle('get-local-version', () => {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '1.0.0';
    }
  } catch (err) {
    console.error("Lỗi đọc phiên bản package.json:", err);
  }
  return app.getVersion() || '1.0.0';
});

// 2. Mở URL bằng trình duyệt mặc định của hệ thống
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    console.error('Lỗi mở URL:', err);
    return { ok: false, error: err.message };
  }
});

// 3. Tự động cập nhật — mở trang GitHub Releases để tải bộ cài mới (không dùng git pull
//    vì bản đóng gói không có git)
ipcMain.handle('trigger-auto-update', async (event, downloadUrl) => {
  const url = downloadUrl || 'https://github.com/btduy13/RD/releases/latest';
  try {
    await shell.openExternal(url);
    return { ok: true, message: 'Đã mở trang tải bộ cài mới trong trình duyệt.' };
  } catch (err) {
    console.error('Lỗi mở trang tải:', err);
    return { ok: false, error: err.message };
  }
});

// 4. Tải trực tiếp tệp cài đặt mới từ GitHub và tự động kích hoạt tiến trình cài đặt
const https = require('https');
const http = require('http');
const urlModule = require('url');

function downloadFile(fileUrl, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    function get(url) {
      const parsedUrl = urlModule.parse(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      protocol.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Follow redirect
          return get(response.headers.location);
        }
        
        if (response.statusCode !== 200) {
          return reject(new Error(`Server returned status code ${response.statusCode}`));
        }
        
        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedSize = 0;
        const fileStream = fs.createWriteStream(destPath);
        
        // Đảm bảo chỉ resolve khi fileStream đã hoàn tất ghi toàn bộ xuống đĩa và đóng handle
        fileStream.on('finish', () => {
          resolve();
        });
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          fileStream.write(chunk);
          if (progressCallback && totalSize > 0) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            progressCallback(percent);
          }
        });
        
        response.on('end', () => {
          fileStream.end();
        });
        
        response.on('error', (err) => {
          fileStream.destroy();
          fs.unlink(destPath, () => {});
          reject(err);
        });
        
        fileStream.on('error', (err) => {
          fileStream.destroy();
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    }
    
    get(fileUrl);
  });
}

ipcMain.handle('download-and-install-update', async (event, downloadUrl) => {
  const tempDir = app.getPath('temp');
  const destPath = path.join(tempDir, 'Ke_Toan_Rang_Dong_Setup_Update.exe');
  
  try {
    await downloadFile(downloadUrl, destPath, (percent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', percent);
      }
    });
    
    // Khởi chạy bộ cài đặt mới
    // Sử dụng shell.openPath giúp tích hợp tốt với UAC (User Account Control) của Windows và tránh lỗi EBUSY
    try {
      const errStr = await shell.openPath(destPath);
      if (errStr) {
        console.error('Lỗi khi mở bộ cài qua shell.openPath, chuyển sang dùng spawn:', errStr);
        const { spawn } = require('child_process');
        const child = spawn(destPath, [], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      }
    } catch (openErr) {
      console.error('Lỗi try-catch khi mở bộ cài qua shell.openPath, dùng spawn:', openErr);
      const { spawn } = require('child_process');
      const child = spawn(destPath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
    
    // Thoát ứng dụng chính sau khi kích hoạt bộ cài thành công
    setTimeout(() => {
      app.quit();
    }, 1000);
    
    return { ok: true };
  } catch (err) {
    console.error('Lỗi tải/cài đặt bản cập nhật:', err);
    return { ok: false, error: err.message };
  }
});

// ===========================================================================
// VÒNG ĐỜI ỨNG DỤNG
// ===========================================================================

// Khởi chạy khi Electron sẵn sàng
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Thoát hoàn toàn khi đóng hết cửa sổ (trừ hệ điều hành macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
