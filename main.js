// CẤU HÌNH VÒNG ĐỜI VÀ CỬA SỔ DESKTOP APP ĐỘC LẬP (MAIN.JS)
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { pipeline } = require('stream');
const { buildVoucherPrintDocument } = require('./js/core/voucher-print-document');
const {
  PRINT_ERROR_CODES,
  buildElectronPrintOptions,
  classifyPrintFailure,
  normalizePrintRequest,
  resolvePrinterDeviceName,
  sanitizePrinterList
} = require('./js/core/printer-job');
const {
  readLatestValidJsonBackup,
  writeJsonBackup
} = require('./js/core/backup-store');
const { resolvePackagedExcelFile } = require('./js/core/platform-paths');
const {
  archiveLegacyStateFile,
  databaseHasPersistedState
} = require('./js/core/sqlite-migration-guard');
const {
  isAllowedExternalUrl,
  isAllowedUpdateRequestUrl,
  isAllowedUpdateRedirectUrl
} = require('./js/core/url-security');

// Tăng giới hạn heap V8 lên 4 GB để xử lý tập dữ liệu lớn (7000+ chứng từ, 1600+ sản phẩm)
// Ngăn chặn lỗi "FATAL ERROR: Oilpan: Large allocation" khi ghi nhớ vượt ngưỡng mặc định ~1.5 GB
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

let mainWindow;
const bootSessionId = String(Math.floor((Date.now() - os.uptime() * 1000) / 60000));

// ===========================================================================
// AUTO-BACKUP: Tự động lưu file backup JSON vào thư mục backup/ khi đóng app
// ===========================================================================
const BACKUP_DIR = path.join(app.getPath('userData'), 'backup');
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
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    // Giao diện bắt đầu mượt mà, ẩn cửa sổ cho đến khi sẵn sàng hiển thị để tránh chớp trắng
    show: false,
    backgroundColor: '#0b0f19' // Đồng bộ với màu Slate mặc định của app
  });

  // 2. Tải trang giao diện chính
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`RENDERER CONSOLE [${level}]: ${message} (at ${sourceId}:${line})`);
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch(err => console.error('Lỗi mở liên kết ngoài:', err));
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  // 3. Thiết lập menu ứng dụng tối giản để các phím tắt soạn thảo hoạt động bình thường
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Hoàn tác' },
        { role: 'redo', label: 'Làm lại' },
        { type: 'separator' },
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { role: 'selectAll', label: 'Chọn tất cả' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Ẩn thanh menu trình duyệt mặc định trên Windows/Linux nhưng vẫn giữ phím tắt hoạt động
  mainWindow.setMenuBarVisibility(false);

  // 4. Hiển thị cửa sổ khi đã nạp xong toàn bộ tài nguyên
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(async () => {
      try {
        const db = await mainWindow.webContents.executeJavaScript("JSON.stringify(state)");
        console.log('--- LOCAL_STORAGE_DB_SIZE: ' + (db ? db.length : 0));
        if (db && db !== '{}') {
          const parsed = JSON.parse(db);
          console.log('--- LOCAL_STORAGE_VOUCHERS_COUNT: ' + (parsed.vouchers ? parsed.vouchers.length : 0));
          const types = {};
          if (parsed.vouchers) {
            parsed.vouchers.forEach(v => types[v.type] = (types[v.type] || 0) + 1);
          }
          console.log('--- LOCAL_STORAGE_VOUCHER_TYPES: ' + JSON.stringify(types));
          
          const errLogs = await mainWindow.webContents.executeJavaScript("localStorage.getItem('rd_accounting_error_logs')");
          let errorLogCount = 0;
          try {
            const parsedErrorLogs = JSON.parse(errLogs || '[]');
            errorLogCount = Array.isArray(parsedErrorLogs) ? parsedErrorLogs.length : 0;
          } catch (error) {}
          console.log('--- LOCAL_STORAGE_ERRORS_SUMMARY: ' + JSON.stringify({
            count: errorLogCount,
            bytes: Buffer.byteLength(errLogs || '', 'utf8')
          }));
          const restoreV6 = await mainWindow.webContents.executeJavaScript("localStorage.getItem('db_restore_v6')");
          console.log('--- LOCAL_STORAGE_RESTORE_V6: ' + restoreV6);
          const cloudStatus = await mainWindow.webContents.executeJavaScript("({ active: cloudSyncActive, hasClient: !!supabaseClient, hasSupabase: typeof supabase !== 'undefined', badge: document.getElementById('cloud-sync-status-text') ? document.getElementById('cloud-sync-status-text').innerText : 'no badge' })");
          console.log('--- SUPABASE_STATUS: ' + JSON.stringify(cloudStatus));
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
    const closingWindow = mainWindow;

    // Local save + cloud flush can legitimately take several seconds
    // (SQLite save + up to ~7s cloud wait). 10s used to cut the flow before
    // the JSON safety backup was written; the backup now runs FIRST and the
    // budget is wider so the local save is never truncated on slow disks.
    const forceCloseTimer = setTimeout(() => {
      console.warn('[AutoSave] Timeout 20s, buộc đóng ứng dụng.');
      if (closingWindow && !closingWindow.isDestroyed()) closingWindow.destroy();
    }, 20000);

    let backupWritten = false;
    try {
      // Bước 1: Ghi backup nguyên tử NGAY khi phiên có thay đổi, trước khi chờ
      // save/cloud (bước có thể chậm hoặc bị force-close cắt ngang).
      if (closingWindow && !closingWindow.isDestroyed()) {
        const preClose = await closingWindow.webContents.executeJavaScript(`
          ({
            wasDirty: typeof saveStateIsDirty !== 'undefined' && !!saveStateIsDirty,
            json: (typeof state !== 'undefined' && state) ? (JSON.stringify(state) || '') : ''
          })
        `);
        if (preClose && preClose.wasDirty && preClose.json && preClose.json.length > 10) {
          ensureBackupDir();
          const backupPath = writeJsonBackup(BACKUP_DIR, preClose.json);
          cleanOldBackups();
          backupWritten = true;
          console.log(`[AutoBackup] Đã tự động sao lưu khi đóng: ${backupPath}`);
        }
      }
    } catch (err) {
      console.error('[AutoBackup] Lỗi ghi backup trước khi đóng:', err);
    }

    let saveFailed = false;
    try {
      // Bước 2: Gọi renderer thực hiện saveState() + pushToCloud() và chờ
      if (closingWindow && !closingWindow.isDestroyed()) {
        await closingWindow.webContents.executeJavaScript('autoSaveBeforeClose()');
      }
    } catch (err) {
      saveFailed = true;
      console.error('[AutoSave] Lỗi trong quá trình lưu trước khi đóng:', err);
    }

    try {
      // Bước 3: Nếu autosave lỗi mà chưa có backup (phiên tưởng là sạch), vẫn
      // cố gắng giữ lại state trong bộ nhớ dưới dạng JSON.
      if (saveFailed && !backupWritten && closingWindow && !closingWindow.isDestroyed()) {
        const jsonData = await closingWindow.webContents.executeJavaScript(
          "JSON.stringify(state) || ''"
        );
        if (jsonData && jsonData.length > 10) {
          ensureBackupDir();
          const backupPath = writeJsonBackup(BACKUP_DIR, jsonData);
          cleanOldBackups();
          console.log(`[AutoBackup] Đã sao lưu khẩn cấp khi autosave lỗi: ${backupPath}`);
        }
      }
    } catch (err) {
      console.error('[AutoBackup] Lỗi ghi backup trước khi đóng:', err);
    } finally {
      clearTimeout(forceCloseTimer);
      if (closingWindow && !closingWindow.isDestroyed()) closingWindow.destroy();
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

ipcMain.handle('list-template-files', async () => {
  try {
    const templateDir = path.join(__dirname, 'excel', 'phieu mau');
    if (!fs.existsSync(templateDir)) {
      return { ok: false, error: 'Thư mục phiếu mẫu không tồn tại.' };
    }
    const files = fs.readdirSync(templateDir)
      .filter(f => (/\.xlsx?$/i.test(f)) && !f.startsWith('~$'))
      .sort((a, b) => a.localeCompare(b, 'vi'));
    return { ok: true, files };
  } catch (err) {
    console.error('Lỗi đọc danh sách file mẫu:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('read-excel-file', async (event, filename) => {
  try {
    // Templates are listed from excel/phieu mau while legacy files live in excel/.
    // Resolve only a plain .xls/.xlsx basename within those two packaged folders.
    const filePath = resolvePackagedExcelFile(__dirname, filename);
    const buffer = fs.readFileSync(filePath);
    return { ok: true, encoding: 'base64', data: buffer.toString('base64') };
  } catch (err) {
    console.error('Lỗi đọc file Excel:', err);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Renderer gửi dữ liệu JSON để main.js ghi xuống đĩa (sao lưu thủ công)
ipcMain.handle('save-backup-on-exit', async (event, jsonData) => {
  try {
    ensureBackupDir();
    const backupPath = writeJsonBackup(BACKUP_DIR, jsonData);
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

// Open only the app-owned backup directory. Do not pass file:// URLs through
// openExternalUrl: that API intentionally accepts web protocols only.
ipcMain.handle('open-backup-folder', async () => {
  try {
    ensureBackupDir();
    const error = await shell.openPath(BACKUP_DIR);
    if (error) throw new Error(error);
    return { ok: true };
  } catch (err) {
    console.error('[AutoBackup] Lỗi mở thư mục backup:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('write-log', async (event, content) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'sync_debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${content}\n`, 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Lỗi ghi log:', err);
    return { ok: false, error: err.message };
  }
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

ipcMain.handle('get-boot-session-id', () => {
  return bootSessionId;
});

// 2. Mở URL bằng trình duyệt mặc định của hệ thống
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    if (!isAllowedExternalUrl(url)) throw new Error('URL không hợp lệ hoặc giao thức không được phép.');
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
    if (!isAllowedUpdateRequestUrl(url)) throw new Error('URL cập nhật không thuộc kho phát hành chính thức.');
    await shell.openExternal(url);
    return { ok: true, message: 'Đã mở trang tải bộ cài mới trong trình duyệt.' };
  } catch (err) {
    console.error('Lỗi mở trang tải:', err);
    return { ok: false, error: err.message };
  }
});

// 4. Tải trực tiếp tệp cài đặt mới từ GitHub và tự động kích hoạt tiến trình cài đặt
const https = require('https');
const UPDATE_REQUEST_TIMEOUT_MS = 30000;
const MAX_UPDATE_DOWNLOAD_BYTES = 1024 * 1024 * 1024;
let updateDownloadInProgress = false;

function downloadFile(fileUrl, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const removePartialDownload = () => {
      fs.unlink(destPath, () => {});
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      removePartialDownload();
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      if (progressCallback) progressCallback(100);
      resolve();
    };

    function get(url, redirectCount = 0) {
      if (!isAllowedUpdateRedirectUrl(url)) {
        return fail(new Error('Máy chủ tải bản cập nhật không được phép.'));
      }
      if (redirectCount > 5) return fail(new Error('Quá nhiều lần chuyển hướng khi tải cập nhật.'));

      const request = https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectedUrl = new URL(response.headers.location, url).toString();
          response.resume();
          return get(redirectedUrl, redirectCount + 1);
        }

        if (response.statusCode !== 200) {
          response.resume();
          return fail(new Error(`Server returned status code ${response.statusCode}`));
        }

        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        if (totalSize > MAX_UPDATE_DOWNLOAD_BYTES) {
          response.resume();
          return fail(new Error('Tệp cập nhật vượt quá giới hạn kích thước an toàn.'));
        }

        let downloadedSize = 0;
        const fileStream = fs.createWriteStream(destPath);

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (downloadedSize > MAX_UPDATE_DOWNLOAD_BYTES) {
            response.destroy(new Error('Tệp cập nhật vượt quá giới hạn kích thước an toàn.'));
            return;
          }
          if (progressCallback && totalSize > 0) {
            const percent = Math.min(99, Math.round((downloadedSize / totalSize) * 100));
            progressCallback(percent);
          }
        });

        // pipeline honors stream backpressure and calls back only after the file
        // stream has finished, avoiding memory spikes on large installers.
        pipeline(response, fileStream, (error) => {
          if (error) fail(error);
          else succeed();
        });
      });

      request.setTimeout(UPDATE_REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error('Hết thời gian chờ máy chủ cập nhật.'));
      });
      request.on('error', fail);
    }

    get(fileUrl);
  });
}

async function launchDetachedInstaller(installerPath) {
  let openPathError = '';
  try {
    openPathError = await shell.openPath(installerPath);
  } catch (error) {
    openPathError = error && error.message ? error.message : String(error);
  }
  if (!openPathError) return;

  console.error('Lỗi khi mở bộ cài qua shell.openPath, chuyển sang dùng spawn:', openPathError);
  await new Promise((resolve, reject) => {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

ipcMain.handle('download-and-install-update', async (event, downloadUrl) => {
  if (updateDownloadInProgress) {
    return { ok: false, error: 'Một bản cập nhật khác đang được tải.' };
  }
  updateDownloadInProgress = true;

  let updateTempDir = null;
  try {
    if (!isAllowedUpdateRequestUrl(downloadUrl)) {
      throw new Error('URL cập nhật không thuộc kho phát hành chính thức.');
    }

    updateTempDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'rd-accounting-update-'));
    const destPath = path.join(updateTempDir, 'Ke_Toan_Rang_Dong_Setup_Update.exe');
    const sender = event.sender;
    await downloadFile(downloadUrl, destPath, (percent) => {
      if (sender && !sender.isDestroyed()) {
        sender.send('download-progress', percent);
      }
    });

    await launchDetachedInstaller(destPath);

    // Thoát ứng dụng chính sau khi kích hoạt bộ cài thành công
    setTimeout(() => {
      app.quit();
    }, 1000);
    
    return { ok: true };
  } catch (err) {
    if (updateTempDir) {
      try { fs.rmSync(updateTempDir, { recursive: true, force: true }); } catch (_) {}
    }
    console.error('Lỗi tải/cài đặt bản cập nhật:', err);
    return { ok: false, error: err.message };
  } finally {
    updateDownloadInProgress = false;
  }
});

async function getSafePrinters(webContents) {
  if (!webContents || webContents.isDestroyed() || typeof webContents.getPrintersAsync !== 'function') {
    throw new Error('Không thể truy cập danh sách máy in');
  }
  return sanitizePrinterList(await webContents.getPrintersAsync());
}

function printerErrorResult(error, fallbackCode = PRINT_ERROR_CODES.FAILED, fallbackMessage = 'In thất bại') {
  const knownCodes = Object.values(PRINT_ERROR_CODES);
  const code = error && knownCodes.includes(error.code) ? error.code : fallbackCode;
  const message = error && typeof error.message === 'string' && error.message.trim()
    ? error.message.trim().slice(0, 1024)
    : fallbackMessage;
  return { ok: false, code, error: message };
}

ipcMain.handle('get-printers', async (event) => {
  try {
    return { ok: true, printers: await getSafePrinters(event.sender) };
  } catch (error) {
    console.error('[Print] Không thể liệt kê máy in:', error);
    return printerErrorResult(
      error,
      PRINT_ERROR_CODES.ENUMERATION_FAILED,
      'Không thể đọc danh sách máy in'
    );
  }
});

// IPC Handler: Kích hoạt in ấn thông qua webContents.print của Electron
ipcMain.handle('print-window', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'Không tìm thấy cửa sổ ứng dụng' };
    
    win.webContents.print({
      silent: false,           // Hiển thị hộp thoại chọn máy in hệ thống
      printBackground: true,   // In hình nền và màu sắc (quan trọng để giữ giao diện thiết kế)
      color: true,             // In màu sắc
      margins: {
        marginType: 'none'     // Hủy lề mặc định của Electron để lề CSS @page tự quyết định, tránh lùi sâu
      }
    }, (success, failureReason) => {
      if (!success) {
        console.error('[Print] In thất bại hoặc bị hủy:', failureReason);
      } else {
        console.log('[Print] Tiến trình in ấn hoàn tất thành công!');
      }
    });
    return { ok: true };
  } catch (err) {
    console.error('[Print] Lỗi khi xử lý in ấn IPC:', err);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Xuất chứng từ thành PDF
ipcMain.handle('print-to-pdf', async (event, filename) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'Không tìm thấy cửa sổ ứng dụng' };

    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Lưu chứng từ PDF',
      defaultPath: path.join(app.getPath('downloads'), filename || 'ChungTu.pdf'),
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    });

    if (!filePath) {
      return { ok: false, error: 'Hủy lưu PDF' };
    }

    const data = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });

    fs.writeFileSync(filePath, data);
    return { ok: true, filePath };
  } catch (err) {
    console.error('[PDF] Lỗi khi xuất PDF:', err);
    return { ok: false, error: err.message };
  }
});

function buildVoucherPdfDocument(voucherHtml, printFontScale = 1, printPaperSize = "A5") {
  return buildVoucherPrintDocument({
    voucherHtml,
    printFontScale,
    printPaperSize,
    appDir: __dirname
  });
}

// Chromium data URL limit ~2MB; stay below to avoid silent load failures on large vouchers.
const VOUCHER_PDF_DATA_URL_MAX_LEN = 1_500_000;
const VOUCHER_PDF_PAGE_LOAD_TIMEOUT_MS = 30000;
const VOUCHER_PDF_IMAGE_TIMEOUT_MS = 8000;
const VOUCHER_PRINT_MARGINS_IN = {
  marginType: 'custom',
  top: 0,
  bottom: 0,
  left: 0,
  right: 0
};

function createTempVoucherHtmlPath(doc) {
  const tempDir = path.join(app.getPath('temp'), 'rd-voucher-pdf');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `voucher-${Date.now()}-${process.pid}.html`);
  fs.writeFileSync(tempPath, doc, 'utf8');
  return tempPath;
}

async function loadPrintWindowDocument(printWin, doc) {
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;
  if (dataUrl.length <= VOUCHER_PDF_DATA_URL_MAX_LEN) {
    await printWin.loadURL(dataUrl);
    return null;
  }

  const tempPath = createTempVoucherHtmlPath(doc);
  await printWin.loadFile(tempPath);
  return tempPath;
}

async function waitForPrintWindowImages(printWin, imageTimeoutMs = VOUCHER_PDF_IMAGE_TIMEOUT_MS) {
  if (printWin.isDestroyed()) {
    throw new Error('Cửa sổ in đã bị đóng trước khi hoàn tất');
  }

  await printWin.webContents.executeJavaScript(`
    Promise.all(Array.from(document.images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        const timer = setTimeout(resolve, ${imageTimeoutMs});
        const done = () => { clearTimeout(timer); resolve(); };
        img.onload = done;
        img.onerror = done;
      });
    }))
  `);
}

async function prepareVoucherPrintWindow(voucherHtml, printFontScale = 1, printPaperSize = "A5") {
  const isA5 = printPaperSize !== "A4";
  const doc = buildVoucherPdfDocument(String(voucherHtml), printFontScale, printPaperSize);
  const printWin = new BrowserWindow({
    show: false,
    width: isA5 ? 560 : 794,
    height: isA5 ? 794 : 1123,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: false
    }
  });

  let tempHtmlPath = null;
  try {
    const pageLoadTimeout = setTimeout(() => {
      if (!printWin.isDestroyed()) printWin.webContents.stop();
    }, VOUCHER_PDF_PAGE_LOAD_TIMEOUT_MS);

    try {
      tempHtmlPath = await loadPrintWindowDocument(printWin, doc);
    } catch (loadErr) {
      const detail = loadErr && loadErr.message ? loadErr.message : String(loadErr);
      throw new Error(`Không tải được nội dung chứng từ (${detail})`);
    } finally {
      clearTimeout(pageLoadTimeout);
    }

    await waitForPrintWindowImages(printWin);

    if (printWin.isDestroyed()) {
      throw new Error('Cửa sổ in đã bị đóng trước khi in');
    }

    try {
      const contentHeight = await printWin.webContents.executeJavaScript(
        'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)'
      );
      if (Number.isFinite(contentHeight) && contentHeight > 0) {
        const winWidth = isA5 ? 560 : 794;
        const winHeight = Math.min(Math.max(Math.ceil(contentHeight) + 40, isA5 ? 794 : 1123), 16000);
        printWin.setSize(winWidth, winHeight);
      }
    } catch (_) {}

    return { printWin, tempHtmlPath };
  } catch (error) {
    cleanupVoucherPrintWindow(printWin, tempHtmlPath);
    throw error;
  }
}

function cleanupVoucherPrintWindow(printWin, tempHtmlPath) {
  if (tempHtmlPath) {
    try { fs.unlinkSync(tempHtmlPath); } catch (_) {}
  }
  if (printWin && !printWin.isDestroyed()) {
    printWin.destroy();
  }
}

ipcMain.handle('print-html-to-pdf', async (event, voucherHtml, filename, printFontScale, printPaperSize) => {
  let printWin = null;
  let tempHtmlPath = null;
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    if (!parentWin) return { ok: false, error: 'Không tìm thấy cửa sổ ứng dụng' };

    if (!voucherHtml || !String(voucherHtml).trim()) {
      return { ok: false, error: 'Không có nội dung chứng từ để xuất PDF' };
    }

    const { filePath } = await dialog.showSaveDialog(parentWin, {
      title: 'Lưu chứng từ PDF',
      defaultPath: path.join(app.getPath('downloads'), filename || 'ChungTu.pdf'),
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    });

    if (!filePath) {
      return { ok: false, error: 'Hủy lưu PDF' };
    }

    const prepared = await prepareVoucherPrintWindow(String(voucherHtml), printFontScale, printPaperSize);
    printWin = prepared.printWin;
    tempHtmlPath = prepared.tempHtmlPath;

    const data = await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: VOUCHER_PRINT_MARGINS_IN
    });

    fs.writeFileSync(filePath, data);
    return { ok: true, filePath };
  } catch (err) {
    console.error('[PDF] Lỗi khi xuất HTML sang PDF:', err);
    const message = err && err.message ? err.message : String(err);
    if (/timeout/i.test(message)) {
      return { ok: false, error: 'Hết thời gian chờ tải nội dung chứng từ. Thử lại hoặc kiểm tra kết nối mạng (mã QR VietQR).' };
    }
    return { ok: false, error: message };
  } finally {
    cleanupVoucherPrintWindow(printWin, tempHtmlPath);
  }
});

ipcMain.handle('print-html', async (event, voucherHtml, printFontScale, printPaperSize, printerOptions) => {
  let printWin = null;
  let tempHtmlPath = null;
  try {
    if (!voucherHtml || !String(voucherHtml).trim()) {
      return { ok: false, code: 'PRINT_CONTENT_EMPTY', error: 'Không có nội dung chứng từ để in' };
    }

    const request = normalizePrintRequest(printerOptions);
    let deviceName = '';

    // Direct printing must resolve an exact system printer before submitting
    // the job. Dialog printing can still proceed when enumeration fails or a
    // previously saved printer disappeared: Windows will let the user choose.
    if (request.directPrint || request.deviceName) {
      try {
        const printers = await getSafePrinters(event.sender);
        deviceName = resolvePrinterDeviceName(printers, request);
      } catch (error) {
        if (request.directPrint) {
          console.error('[Print] Không thể xác định máy in trực tiếp:', error);
          return printerErrorResult(
            error,
            PRINT_ERROR_CODES.ENUMERATION_FAILED,
            'Không thể đọc danh sách máy in'
          );
        }
        console.warn('[Print] Máy in đã lưu không khả dụng; mở hộp thoại hệ thống:', error.message);
      }
    }

    const prepared = await prepareVoucherPrintWindow(String(voucherHtml), printFontScale, printPaperSize);
    printWin = prepared.printWin;
    tempHtmlPath = prepared.tempHtmlPath;

    const electronPrintOptions = buildElectronPrintOptions({
      paperSize: printPaperSize,
      request,
      deviceName,
      margins: VOUCHER_PRINT_MARGINS_IN
    });
    const printResult = await new Promise((resolve) => {
      printWin.webContents.print(electronPrintOptions, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });

    if (!printResult.success) {
      return { ok: false, ...classifyPrintFailure(printResult.failureReason) };
    }

    return {
      ok: true,
      mode: request.mode,
      deviceName: deviceName || null,
      pageSize: electronPrintOptions.pageSize
    };
  } catch (err) {
    console.error('[Print] Lỗi khi in HTML chứng từ:', err);
    const message = err && err.message ? err.message : String(err);
    if (/invalid printer settings|invalid settings|cancel(?:ed|led)?/i.test(message)) {
      return { ok: false, ...classifyPrintFailure(message) };
    }
    if (/timeout/i.test(message)) {
      return {
        ok: false,
        code: PRINT_ERROR_CODES.FAILED,
        error: 'Hết thời gian chờ tải nội dung chứng từ. Thử lại hoặc kiểm tra kết nối mạng (mã QR VietQR).'
      };
    }
    return printerErrorResult(err);
  } finally {
    cleanupVoucherPrintWindow(printWin, tempHtmlPath);
  }
});

// ===========================================================================
// IPC HANDLERS: LƯU/ĐỌC STATE FILE (thay thế localStorage để tránh giới hạn 5MB)
// ===========================================================================

// ===========================================================================
// IPC HANDLERS: LƯU/ĐỌC STATE FILE BẰNG SQLITE CỤC BỘ (THAY THẾ JSON FILE)
// ===========================================================================

const STATE_DIR_PATH = path.join(app.getPath('userData'), 'data');
const STATE_DB_PATH = path.join(STATE_DIR_PATH, 'rd_local.db');
const STATE_FILE_PATH = path.join(STATE_DIR_PATH, 'rd_state.json');
const SCHEMA_VERSION = 4;

const Database = require('better-sqlite3');
const { dedupeProductCatalogOnState, cleanGarbageProducts } = require('./js/core/product-case-dedupe.js');
let db = null;
let databaseInitError = null;

function getEmptyStateObject() {
  return {
    companyName: '',
    address: '',
    taxCode: '',
    accountingStandard: 'TT200',
    initialBalances: {},
    partnerOpeningBalances: {},
    partnerOpeningBalanceTs: {},
    deletedIds: [],
    deletedCloudKeys: [],
    _deletedCloudKeyTs: {},
    _cloudDatasetIdentity: '',
    _pendingCloudWrite: null,
    products: [],
    partners: [],
    vouchers: [],
    schemaVersion: SCHEMA_VERSION,
    _accountingValid: false,
    _lastModified: Date.now()
  };
}

function runSchemaMigrations(stateObj) {
  if (!stateObj || typeof stateObj !== 'object') return getEmptyStateObject();
  let version = Number(stateObj.schemaVersion) || 1;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Phiên bản dữ liệu ${version} mới hơn phiên bản ứng dụng hỗ trợ (${SCHEMA_VERSION}).`);
  }

  if (version < 2) {
    if (!stateObj.partnerOpeningBalanceTs) stateObj.partnerOpeningBalanceTs = {};
    version = 2;
  }
  if (version < 3) {
    if (!Array.isArray(stateObj.deletedCloudKeys)) stateObj.deletedCloudKeys = [];
    version = 3;
  }
  if (version < 4) {
    if (stateObj._accountingValid === undefined) stateObj._accountingValid = false;
    if (stateObj._accountingValidTs === undefined) stateObj._accountingValidTs = 0;
    version = 4;
  }

  stateObj.schemaVersion = SCHEMA_VERSION;
  return stateObj;
}

// Đảm bảo thư mục data/ tồn tại
function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR_PATH)) {
    fs.mkdirSync(STATE_DIR_PATH, { recursive: true });
  }
}

// Di trú dữ liệu từ thư mục cài đặt cũ (nếu có) sang thư mục AppData mới
function migrateFromOldPathsIfNecessary() {
  try {
    ensureStateDir();
    ensureBackupDir();
    let migratedLegacyState = false;

    // 1. Di trú CSDL SQLite (rd_local.db)
    const oldDbPath = path.join(__dirname, 'data', 'rd_local.db');
    if (fs.existsSync(oldDbPath) && !fs.existsSync(STATE_DB_PATH) && !oldDbPath.includes('.asar')) {
      console.log('[SQLiteStore] Phát hiện CSDL cũ tại thư mục cài đặt. Di chuyển sang AppData...');
      fs.copyFileSync(oldDbPath, STATE_DB_PATH);
      migratedLegacyState = true;
      console.log('[SQLiteStore] Đã sao chép rd_local.db sang AppData thành công.');
    }

    // 2. Di trú file state JSON cũ (rd_state.json)
    const oldJsonPath = path.join(__dirname, 'data', 'rd_state.json');
    if (fs.existsSync(oldJsonPath) && !fs.existsSync(STATE_FILE_PATH) && !oldJsonPath.includes('.asar')) {
      console.log('[SQLiteStore] Phát hiện file rd_state.json cũ tại thư mục cài đặt. Di chuyển sang AppData...');
      fs.copyFileSync(oldJsonPath, STATE_FILE_PATH);
      migratedLegacyState = true;
      console.log('[SQLiteStore] Đã sao chép rd_state.json sang AppData thành công.');
    }

    // 3. Di trú các bản sao lưu từ thư mục cài đặt/backup cũ sang AppData/backup mới
    const oldBackupDir = path.join(__dirname, 'backup');
    if (migratedLegacyState && fs.existsSync(oldBackupDir) && !oldBackupDir.includes('.asar')) {
      const files = fs.readdirSync(oldBackupDir);
      files.forEach(f => {
        const oldF = path.join(oldBackupDir, f);
        const newF = path.join(BACKUP_DIR, f);
        if (fs.existsSync(oldF) && !fs.existsSync(newF)) {
          try {
            fs.copyFileSync(oldF, newF);
          } catch (e) {
            console.error('[Migration] Không thể copy backup file:', f, e);
          }
        }
      });
    }
  } catch (err) {
    console.error('[Migration] Lỗi khi thực hiện di trú thư mục dữ liệu:', err);
  }
}

// Khởi tạo SQLite database cục bộ
function initDatabase() {
  if (db && db.open) return db;

  databaseInitError = null;
  try {
    migrateFromOldPathsIfNecessary();
    ensureStateDir();
    db = new Database(STATE_DB_PATH);
    db.pragma('busy_timeout = 5000');
    
    // Tạo bảng nếu chưa tồn tại
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS vouchers (
        id TEXT PRIMARY KEY,
        type TEXT,
        date TEXT,
        data TEXT,
        _updatedAt INTEGER,
        _sessionId TEXT
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        unit TEXT,
        stock REAL,
        avgCost REAL,
        data TEXT,
        _updatedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS partners (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        data TEXT,
        _updatedAt INTEGER
      );
    `);
    
    console.log('[SQLiteStore] Cơ sở dữ liệu SQLite đã được khởi tạo thành công.');
    
    // Áp dụng schema version metadata nếu thiếu
    try {
      const row = db.prepare("SELECT value FROM metadata WHERE key = 'schemaVersion'").get();
      if (!row) {
        db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('schemaVersion', JSON.stringify(SCHEMA_VERSION));
      }
    } catch (e) {
      console.warn('[SQLiteStore] Không thể ghi schemaVersion mặc định:', e.message);
    }

    // Tự động di trú từ rd_state.json cũ sang SQLite nếu có
    migrateFromJsonIfNecessary();
    return db;
  } catch (err) {
    databaseInitError = err;
    console.error('[SQLiteStore] Lỗi khởi tạo SQLite:', err);
    try {
      if (db && db.open) db.close();
    } catch (_) {}
    db = null;
    return null;
  }
}

function requireDatabase() {
  if (!db || !db.open) initDatabase();
  if (!db || !db.open) {
    const detail = databaseInitError && databaseInitError.message
      ? ` (${databaseInitError.message})`
      : '';
    throw new Error(`Cơ sở dữ liệu cục bộ chưa sẵn sàng${detail}`);
  }
  return db;
}

function getDatabaseHealth() {
  try {
    const activeDb = requireDatabase();
    activeDb.prepare('SELECT 1 AS ok').get();
    return { ok: true, path: STATE_DB_PATH, schemaVersion: SCHEMA_VERSION };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      recovery: 'Chạy npm run rebuild:native trong mã nguồn hoặc cài lại bản phát hành mới.'
    };
  }
}

function closeDatabase() {
  if (!db) return;
  try {
    if (db.open) db.close();
  } catch (err) {
    console.error('[SQLiteStore] Lỗi đóng SQLite:', err);
  } finally {
    db = null;
  }
}

// Hàm di trú dữ liệu từ file JSON cũ sang SQLite
function migrateFromJsonIfNecessary() {
  if (fs.existsSync(STATE_FILE_PATH)) {
    try {
      // A leftover legacy JSON file must never overwrite a database that has
      // already received newer writes (for example, if an earlier rename failed).
      if (databaseHasPersistedState(db)) {
        try {
          const skippedPath = archiveLegacyStateFile(STATE_FILE_PATH, 'bak_skipped_existing_db');
          console.warn(`[SQLiteStore] Bỏ qua JSON cũ vì SQLite đã có dữ liệu; lưu tại ${path.basename(skippedPath)}.`);
        } catch (archiveErr) {
          console.warn('[SQLiteStore] Bỏ qua JSON cũ nhưng không thể đổi tên file:', archiveErr.message);
        }
        return;
      }

      console.log('[SQLiteStore] Phát hiện file rd_state.json cũ. Bắt đầu di trú sang SQLite...');
      const rawData = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const stateObj = runSchemaMigrations(JSON.parse(rawData));
      
      if (stateObj && Array.isArray(stateObj.vouchers)) {
        saveStateToSQLite(stateObj);
        console.log('[SQLiteStore] Di trú sang SQLite thành công!');
        
        // Đổi tên file cũ để tránh di trú lại lần sau
        try {
          const bakPath = archiveLegacyStateFile(STATE_FILE_PATH, 'bak_migrated');
          console.log(`[SQLiteStore] Đã đổi tên file cũ thành: ${path.basename(bakPath)}`);
        } catch (archiveErr) {
          // The next startup will see the now-populated database and skip this
          // JSON instead of importing it again.
          console.warn('[SQLiteStore] Đã di trú nhưng không thể đổi tên JSON cũ:', archiveErr.message);
        }
      }
    } catch (err) {
      console.error('[SQLiteStore] Lỗi khi di trú dữ liệu:', err);
      throw err;
    }
  }
}

// Lưu toàn bộ state đối tượng vào SQLite
function saveStateToSQLite(stateObj) {
  requireDatabase();
  
  const transaction = db.transaction(() => {
    // 1. Lưu metadata
    const stmtMetadata = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    stmtMetadata.run('companyName', JSON.stringify(stateObj.companyName || ''));
    stmtMetadata.run('address', JSON.stringify(stateObj.address || ''));
    stmtMetadata.run('taxCode', JSON.stringify(stateObj.taxCode || ''));
    stmtMetadata.run('accountingStandard', JSON.stringify(stateObj.accountingStandard || 'TT200'));
    stmtMetadata.run('initialBalances', JSON.stringify(stateObj.initialBalances || {}));
    stmtMetadata.run('partnerOpeningBalances', JSON.stringify(stateObj.partnerOpeningBalances || {}));
    stmtMetadata.run('deletedIds', JSON.stringify(stateObj.deletedIds || []));
    stmtMetadata.run('deletedCloudKeys', JSON.stringify(stateObj.deletedCloudKeys || []));
    stmtMetadata.run('_deletedCloudKeyTs', JSON.stringify(stateObj._deletedCloudKeyTs || {}));
    stmtMetadata.run('_lastModified', JSON.stringify(stateObj._lastModified || Date.now()));
    stmtMetadata.run('_lastPulledCloudTs', JSON.stringify(stateObj._lastPulledCloudTs || 0));
    stmtMetadata.run('_cloudDatasetIdentity', JSON.stringify(stateObj._cloudDatasetIdentity || ''));
    stmtMetadata.run('_pendingCloudWrite', JSON.stringify(stateObj._pendingCloudWrite || null));
    stmtMetadata.run('schemaVersion', JSON.stringify(stateObj.schemaVersion || SCHEMA_VERSION));
    stmtMetadata.run('_accountingValid', JSON.stringify(!!stateObj._accountingValid));
    stmtMetadata.run('_accountingValidTs', JSON.stringify(stateObj._accountingValidTs || 0));
    stmtMetadata.run('_recalcWatermark', JSON.stringify(stateObj._recalcWatermark || null));
    if (stateObj.partnerOpeningBalanceTs) {
      stmtMetadata.run('partnerOpeningBalanceTs', JSON.stringify(stateObj.partnerOpeningBalanceTs));
    }
    if (stateObj.cashEntries) {
      stmtMetadata.run('cashEntries', JSON.stringify(stateObj.cashEntries));
    }
    if (stateObj.escrowItems) {
      stmtMetadata.run('escrowItems', JSON.stringify(stateObj.escrowItems));
    }
    if (stateObj.salesTemplatesData) {
      stmtMetadata.run('salesTemplatesData', JSON.stringify(stateObj.salesTemplatesData));
    }
    if (stateObj.users) {
      stmtMetadata.run('users', JSON.stringify(stateObj.users));
    }
    if (stateObj.actionLogs) {
      stmtMetadata.run('actionLogs', JSON.stringify(stateObj.actionLogs));
    }

    // 2. Lưu vouchers
    db.prepare('DELETE FROM vouchers').run();
    if (Array.isArray(stateObj.vouchers)) {
      const stmtVoucher = db.prepare('INSERT OR REPLACE INTO vouchers (id, type, date, data, _updatedAt, _sessionId) VALUES (?, ?, ?, ?, ?, ?)');
      for (const v of stateObj.vouchers) {
        stmtVoucher.run(
          v.id,
          v.type || '',
          v.date || '',
          JSON.stringify(v),
          v._updatedAt || 0,
          v._sessionId || ''
        );
      }
    }

    // 3. Lưu products
    db.prepare('DELETE FROM products').run();
    if (Array.isArray(stateObj.products)) {
      const stmtProduct = db.prepare('INSERT OR REPLACE INTO products (id, name, unit, stock, avgCost, data, _updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const p of stateObj.products) {
        stmtProduct.run(
          p.id,
          p.name || '',
          p.unit || '',
          p.stock || 0,
          p.avgCost || 0,
          JSON.stringify(p),
          p._updatedAt || 0
        );
      }
    }

    // 4. Lưu partners
    db.prepare('DELETE FROM partners').run();
    if (Array.isArray(stateObj.partners)) {
      const stmtPartner = db.prepare('INSERT OR REPLACE INTO partners (id, name, type, data, _updatedAt) VALUES (?, ?, ?, ?, ?)');
      for (const p of stateObj.partners) {
        stmtPartner.run(
          p.id,
          p.name || '',
          p.type || '',
          JSON.stringify(p),
          p._updatedAt || 0
        );
      }
    }
  });

  transaction();
}

// Lưu phần chênh lệch dữ liệu (delta) vào SQLite
function saveStateDeltaToSQLite(delta) {
  requireDatabase();

  const transaction = db.transaction(() => {
    // 1. Lưu metadata
    if (delta.metadata) {
      const stmtMetadata = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
      for (const [key, val] of Object.entries(delta.metadata)) {
        stmtMetadata.run(key, val);
      }
    }

    // 2. Lưu/Xóa vouchers
    if (delta.vouchers) {
      if (Array.isArray(delta.vouchers.upsert) && delta.vouchers.upsert.length > 0) {
        const stmtVoucher = db.prepare('INSERT OR REPLACE INTO vouchers (id, type, date, data, _updatedAt, _sessionId) VALUES (?, ?, ?, ?, ?, ?)');
        for (const v of delta.vouchers.upsert) {
          if (!v || !v.id) continue;
          stmtVoucher.run(
            v.id,
            v.type || '',
            v.date || '',
            JSON.stringify(v),
            v._updatedAt || 0,
            v._sessionId || ''
          );
        }
      }
      if (Array.isArray(delta.vouchers.deleteIds) && delta.vouchers.deleteIds.length > 0) {
        const stmtDeleteVoucher = db.prepare('DELETE FROM vouchers WHERE id = ?');
        for (const id of delta.vouchers.deleteIds) {
          if (id) stmtDeleteVoucher.run(id);
        }
      }
    }

    // 3. Lưu/Xóa products
    if (delta.products) {
      if (Array.isArray(delta.products.upsert) && delta.products.upsert.length > 0) {
        const stmtProduct = db.prepare('INSERT OR REPLACE INTO products (id, name, unit, stock, avgCost, data, _updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const p of delta.products.upsert) {
          if (!p || !p.id) continue;
          stmtProduct.run(
            p.id,
            p.name || '',
            p.unit || '',
            p.stock || 0,
            p.avgCost || 0,
            JSON.stringify(p),
            p._updatedAt || 0
          );
        }
      }
      if (Array.isArray(delta.products.deleteIds) && delta.products.deleteIds.length > 0) {
        const stmtDeleteProduct = db.prepare('DELETE FROM products WHERE id = ?');
        for (const id of delta.products.deleteIds) {
          if (id) stmtDeleteProduct.run(id);
        }
      }
    }

    // 4. Lưu/Xóa partners
    if (delta.partners) {
      if (Array.isArray(delta.partners.upsert) && delta.partners.upsert.length > 0) {
        const stmtPartner = db.prepare('INSERT OR REPLACE INTO partners (id, name, type, data, _updatedAt) VALUES (?, ?, ?, ?, ?)');
        for (const p of delta.partners.upsert) {
          if (!p || !p.id) continue;
          stmtPartner.run(
            p.id,
            p.name || '',
            p.type || '',
            JSON.stringify(p),
            p._updatedAt || 0
          );
        }
      }
      if (Array.isArray(delta.partners.deleteIds) && delta.partners.deleteIds.length > 0) {
        const stmtDeletePartner = db.prepare('DELETE FROM partners WHERE id = ?');
        for (const id of delta.partners.deleteIds) {
          if (id) stmtDeletePartner.run(id);
        }
      }
    }
  });

  transaction();
}

// Đọc toàn bộ state đối tượng từ SQLite
function readStateFromSQLite() {
  requireDatabase();
  
  const stateObj = {
    companyName: "",
    address: "",
    taxCode: "",
    accountingStandard: "TT200",
    initialBalances: {},
    deletedIds: [],
    products: [],
    partners: [],
    vouchers: []
  };

  // 1. Đọc metadata
  const metadataRows = db.prepare('SELECT key, value FROM metadata').all();
  for (const row of metadataRows) {
    try {
      const parsedVal = JSON.parse(row.value);
      if (row.key === 'companyName') stateObj.companyName = parsedVal;
      else if (row.key === 'address') stateObj.address = parsedVal;
      else if (row.key === 'taxCode') stateObj.taxCode = parsedVal;
      else if (row.key === 'accountingStandard') stateObj.accountingStandard = parsedVal;
      else if (row.key === 'initialBalances') stateObj.initialBalances = parsedVal;
      else if (row.key === 'partnerOpeningBalances') stateObj.partnerOpeningBalances = parsedVal;
      else if (row.key === 'deletedIds') stateObj.deletedIds = parsedVal;
      else if (row.key === 'deletedCloudKeys') stateObj.deletedCloudKeys = parsedVal;
      else if (row.key === '_deletedCloudKeyTs') stateObj._deletedCloudKeyTs = parsedVal || {};
      else if (row.key === '_lastModified') stateObj._lastModified = parsedVal;
      else if (row.key === '_lastPulledCloudTs') stateObj._lastPulledCloudTs = parsedVal;
      else if (row.key === '_cloudDatasetIdentity') stateObj._cloudDatasetIdentity = parsedVal;
      else if (row.key === '_pendingCloudWrite') stateObj._pendingCloudWrite = parsedVal;
      else if (row.key === 'partnerOpeningBalanceTs') stateObj.partnerOpeningBalanceTs = parsedVal;
      else if (row.key === 'schemaVersion') stateObj.schemaVersion = parsedVal;
      else if (row.key === '_accountingValid') stateObj._accountingValid = parsedVal;
      else if (row.key === '_accountingValidTs') stateObj._accountingValidTs = parsedVal;
      else if (row.key === '_recalcWatermark') stateObj._recalcWatermark = parsedVal;
      else if (row.key === 'cashEntries') stateObj.cashEntries = parsedVal;
      else if (row.key === 'escrowItems') stateObj.escrowItems = parsedVal;
      else if (row.key === 'salesTemplatesData') stateObj.salesTemplatesData = parsedVal;
      else if (row.key === 'users') stateObj.users = parsedVal;
      else if (row.key === 'actionLogs') stateObj.actionLogs = parsedVal;
    } catch (e) {
      console.error(`[SQLiteStore] Lỗi parse metadata key ${row.key}:`, e);
    }
  }

  // 2. Đọc vouchers
  const voucherRows = db.prepare('SELECT data FROM vouchers').all();
  for (const row of voucherRows) {
    try {
      stateObj.vouchers.push(JSON.parse(row.data));
    } catch (e) {
      console.error('[SQLiteStore] Lỗi parse voucher data:', e);
    }
  }

  // 3. Đọc products
  const productRows = db.prepare('SELECT data FROM products').all();
  for (const row of productRows) {
    try {
      stateObj.products.push(JSON.parse(row.data));
    } catch (e) {
      console.error('[SQLiteStore] Lỗi parse product data:', e);
    }
  }

  // 4. Đọc partners
  const partnerRows = db.prepare('SELECT data FROM partners').all();
  for (const row of partnerRows) {
    try {
      stateObj.partners.push(JSON.parse(row.data));
    } catch (e) {
      console.error('[SQLiteStore] Lỗi parse partner data:', e);
    }
  }

  return runSchemaMigrations(stateObj);
}

function backupSqliteBeforeProductDedupe() {
  try {
    ensureBackupDir();
    if (fs.existsSync(STATE_DB_PATH)) {
      const stamp = typeof makeBackupTimestamp === 'function' ? makeBackupTimestamp() : Date.now();
      const dest = path.join(BACKUP_DIR, `rd_local_pre_product_dedupe_${stamp}.db`);
      fs.copyFileSync(STATE_DB_PATH, dest);
      console.log('[ProductDedupe] Đã sao lưu CSDL trước khi gộp mã:', dest);
      return dest;
    }
  } catch (err) {
    console.warn('[ProductDedupe] Không thể sao lưu CSDL:', err.message);
  }
  return null;
}

function applyProductCaseDedupeInDatabase(stateObj) {
  if (!stateObj || !Array.isArray(stateObj.products) || stateObj.products.length === 0) {
    return { ok: true, changed: false };
  }

  const garbageResult = cleanGarbageProducts(stateObj);
  if (garbageResult && garbageResult.removed > 0) {
    console.log(`[ProductClean] SQLite: xóa ${garbageResult.removed} mã hàng rác.`);
  }

  const result = dedupeProductCatalogOnState(stateObj);
  if (!result.changed && (!garbageResult || garbageResult.removed === 0)) {
    return result;
  }

  backupSqliteBeforeProductDedupe();
  saveStateToSQLite(stateObj);

  try {
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
      'productCaseDedupe_v1',
      JSON.stringify({
        at: Date.now(),
        beforeCount: result.beforeCount,
        afterCount: result.afterCount,
        removedCount: result.removedCount,
        voucherItemUpdates: result.voucherItemUpdates
      })
    );
  } catch (metaErr) {
    console.warn('[ProductDedupe] Không ghi metadata migration:', metaErr.message);
  }

  console.log(
    `[ProductDedupe] SQLite đã dọn: ${result.beforeCount} → ${result.afterCount} mặt hàng ` +
    `(gộp ${result.removedCount}, cập nhật ${result.voucherItemUpdates} dòng CT)`
  );
  return result;
}

function readStateFromSQLiteWithDedupe() {
  const stateObj = readStateFromSQLite();
  if (!stateObj) return null;
  applyProductCaseDedupeInDatabase(stateObj);
  return stateObj;
}

// Đăng ký các IPC handlers
ipcMain.handle('write-state-file', async (event, jsonData) => {
  try {
    const stateObj = runSchemaMigrations(JSON.parse(jsonData));
    saveStateToSQLite(stateObj);
    return { ok: true };
  } catch (err) {
    console.error('[SQLiteStore] Lỗi ghi state vào SQLite:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('write-state-delta', async (event, delta) => {
  try {
    saveStateDeltaToSQLite(delta);
    return { ok: true };
  } catch (err) {
    console.error('[SQLiteStore] Lỗi ghi delta vào SQLite:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('read-state-file', async (event) => {
  try {
    const stateObj = readStateFromSQLiteWithDedupe();
    if (!stateObj) {
      return { ok: true, data: getEmptyStateObject(), isEmpty: true };
    }
    return { ok: true, data: stateObj, isEmpty: (stateObj.vouchers.length === 0 && stateObj.products.length === 0) };
  } catch (err) {
    console.error('[SQLiteStore] Lỗi đọc state từ SQLite:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-database-health', async () => getDatabaseHealth());

// Đọc backup gần nhất để phục hồi khi state file bị hỏng
ipcMain.handle('read-latest-backup', async (event) => {
  try {
    ensureBackupDir();
    const result = readLatestValidJsonBackup(BACKUP_DIR);
    if (!result.ok) {
      return { ok: false, error: result.error, invalidFiles: result.invalidFiles };
    }
    return result;
  } catch (err) {
    console.error('[StateFile] Lỗi đọc backup gần nhất:', err);
    return { ok: false, error: err.message };
  }
});

// Hiển thị hộp thoại xác nhận native đồng bộ của hệ điều hành
ipcMain.on('show-confirm-dialog', (event, message) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Hủy', 'Đồng ý'],
      defaultId: 1,
      cancelId: 0,
      title: 'Xác nhận',
      message: message
    });
    event.returnValue = (result === 1);
  } catch (err) {
    console.error('Lỗi khi hiển thị hộp thoại xác nhận:', err);
    event.returnValue = false;
  }
});

// ===========================================================================
// VÒNG ĐỜI ỨNG DỤNG
// ===========================================================================

// Khởi chạy khi Electron sẵn sàng
app.whenReady().then(() => {
  initDatabase(); // Khởi tạo SQLite database cục bộ
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

app.on('will-quit', () => {
  closeDatabase();
});
