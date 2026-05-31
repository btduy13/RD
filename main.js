// CẤU HÌNH VÒNG ĐỜI VÀ CỬA SỔ DESKTOP APP ĐỘC LẬP (MAIN.JS)
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

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
  });

  // 5. Giải phóng tài nguyên khi cửa sổ đóng
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC HANDLERS GIAO TIẾP ĐỂ TỰ ĐỘNG CẬP NHẬT

// 1. Trả về phiên bản hiện tại từ package.json
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
