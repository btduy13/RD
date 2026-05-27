// CẤU HÌNH VÒNG ĐỜI VÀ CỬA SỔ DESKTOP APP ĐỘC LẬP (MAIN.JS)
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

function createWindow() {
  // 1. Khởi tạo cửa sổ Desktop với kích thước tiêu chuẩn và thiết kế cao cấp
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    title: "Phần mềm Kế toán Rạng Đông - RD Accounting",
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

// 2. Chạy lệnh tự động cập nhật qua Git Pull và khởi động lại
ipcMain.handle('trigger-auto-update', async () => {
  return new Promise((resolve, reject) => {
    console.log("Đang kích hoạt tự động cập nhật qua Git pull...");
    exec('git pull origin main', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.error("Lỗi chạy git pull:", error);
        reject(error.message || "Lỗi kết nối hoặc xung đột mã nguồn.");
        return;
      }
      
      console.log("Git pull thành công:", stdout);
      
      // Relaunch app sau khi kéo mã nguồn mới về thành công
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 1000);
      
      resolve(stdout);
    });
  });
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
