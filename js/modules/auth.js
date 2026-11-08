/**
 * js/modules/auth.js
 * Quản lý tài khoản người dùng, Đăng nhập, Đăng xuất, Phân quyền sử dụng (RBAC) và CRUD người dùng.
 */

// Trạng thái phiên làm việc hiện tại
window.currentUser = null;
const AUTH_SESSION_KEY = "rd_accounting_auth_session";
let authBootSessionIdCache = null;

async function getAuthBootSessionId() {
  if (authBootSessionIdCache) return authBootSessionIdCache;
  try {
    if (window.electronAPI && typeof window.electronAPI.getBootSessionId === "function") {
      authBootSessionIdCache = await window.electronAPI.getBootSessionId();
      return authBootSessionIdCache;
    }
  } catch (err) {
    console.error("[Auth] Không thể đọc phiên khởi động máy:", err);
  }
  authBootSessionIdCache = "browser-session";
  return authBootSessionIdCache;
}

function readSavedAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("[Auth] Không thể đọc phiên đăng nhập:", err);
    return null;
  }
}

async function saveAuthSession(user) {
  if (!user || !user.username) return;
  try {
    const bootSessionId = await getAuthBootSessionId();
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      username: user.username,
      bootSessionId,
      savedAt: Date.now()
    }));
  } catch (err) {
    console.error("[Auth] Không thể lưu phiên đăng nhập:", err);
  }
}

function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch (err) {
    console.error("[Auth] Không thể xóa phiên đăng nhập:", err);
  }
}

// Mật khẩu lưu dạng "pbkdf2$<vòng lặp>$<salt base64>$<hash base64>" (PBKDF2-SHA256).
const PASSWORD_HASH_ITERATIONS = 150000;
const authB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const authUnB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PASSWORD_HASH_ITERATIONS}$${authB64(salt)}$${authB64(await pbkdf2(password, salt, PASSWORD_HASH_ITERATIONS))}`;
}

function isPbkdf2Hash(value) {
  return typeof value === "string" && value.startsWith("pbkdf2$");
}

// Kiểm tra mật khẩu; tài khoản cũ còn mật khẩu thô được chuyển sang hash ngay khi đăng nhập đúng.
async function verifyUserPassword(user, password) {
  if (!user || !password) return false;
  if (isPbkdf2Hash(user.passwordHash)) {
    const [, iterations, salt, expected] = user.passwordHash.split("$");
    return authB64(await pbkdf2(password, authUnB64(salt), Number(iterations))) === expected;
  }
  if (typeof user.password !== "string" || user.password === "" || user.password !== password) return false;
  // Mật khẩu cũ dạng dễ đoán (admin hoặc trùng tên đăng nhập, vd. do bản cũ tự tạo lại) phải đổi ngay.
  if (password === "admin" || password.toLowerCase() === String(user.username || "").toLowerCase()) user.mustChangePassword = true;
  user.passwordHash = await hashPassword(password);
  delete user.password;
  saveState();
  return true;
}

async function setUserPassword(user, password) {
  user.passwordHash = await hashPassword(password);
  delete user.password;
  delete user.mustChangePassword;
}

// Khởi chạy hệ thống Auth khi ứng dụng nạp xong dữ liệu
// Dùng khi khởi động và sau khi khôi phục dữ liệu (importData): bảo đảm có tài khoản đăng nhập được.
function migrateAuthUsers() {
  let migrated = false;
  if (!(state.users || []).length) {
    // CSDL trống: tạo admin/admin, bắt buộc đổi mật khẩu ở lần đăng nhập đầu.
    console.log('[Auth] CSDL chưa có tài khoản nào. Đang tạo tài khoản admin mặc định...');
    state.users = [{ username: "admin", password: "admin", name: "Administrator", role: "admin", mustChangePassword: true }];
    migrated = true;
  }
  // Tài khoản cũ không có mật khẩu: tạm dùng tên đăng nhập (hoặc "admin" cho kiểu hash cũ) và bắt đổi.
  state.users.forEach(u => {
    if (!u.password && !isPbkdf2Hash(u.passwordHash)) {
      u.password = u.passwordHash ? "admin" : u.username;
      delete u.passwordHash;
      u.mustChangePassword = true;
      migrated = true;
    }
  });
  if (migrated) saveState();
  return migrated;
}

async function initAuth() {
  migrateAuthUsers();
  const users = state.users;

  const savedSession = readSavedAuthSession();
  const bootSessionId = await getAuthBootSessionId();
  if (savedSession && savedSession.username && savedSession.bootSessionId === bootSessionId) {
    const savedUser = users.find(u => u.username && u.username.toLowerCase() === String(savedSession.username).toLowerCase());
    if (savedUser && !savedUser.mustChangePassword) {
      window.currentUser = savedUser;
      hideLoginOverlay();
      applyRolePermissions();
      return;
    }
    clearAuthSession();
  } else if (savedSession) {
    clearAuthSession();
  }

  // Hiển thị màn hình đăng nhập tiêu chuẩn
  showLoginForm();
}

// ===========================================================================
// GIAO DIỆN MÀN HÌNH ĐĂNG NHẬP OVERLAY
// ===========================================================================

function showLoginForm() {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo-frame">
          <img src="logo.jpg" alt="Logo Rạng Đông" class="login-logo">
        </div>
        <span class="login-eyebrow">RD Accounting</span>
        <h2 class="login-title">Kế toán Rạng Đông</h2>
        <p class="login-subtitle">Đăng nhập để tiếp tục phiên làm việc</p>
      </div>
      
      <div id="login-error" class="login-error-msg" style="display: none;"></div>
      
      <form id="login-form-submit" class="login-form" onsubmit="submitLogin(event)">
        <div class="login-field">
          <label class="login-label" for="login-username">Tên đăng nhập</label>
          <div class="login-input-shell">
            <svg class="login-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 0115 0"></path>
            </svg>
            <input type="text" id="login-username" class="login-input" required placeholder="Nhập tên đăng nhập" autocomplete="username" autofocus>
          </div>
        </div>
        
        <div id="login-password-group" class="login-field">
          <label class="login-label" for="login-password">Mật khẩu</label>
          <div class="login-input-shell">
            <svg class="login-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.5 10.5V7.75a4.5 4.5 0 00-9 0v2.75M6.75 10.5h10.5a1.5 1.5 0 011.5 1.5v6.25a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V12a1.5 1.5 0 011.5-1.5z"></path>
            </svg>
            <input type="password" id="login-password" class="login-input" required placeholder="Nhập mật khẩu" autocomplete="current-password">
          </div>
        </div>
        
        <button type="submit" class="login-submit-btn">
          <span>Đăng nhập</span>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"></path>
          </svg>
        </button>
      </form>
    </div>
  `;
}

function hideLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

// Xử lý sự kiện đăng nhập. Không tự tạo tài khoản: chỉ admin thêm người dùng.
async function submitLogin(event) {
  if (event) event.preventDefault();

  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  if (!usernameEl) return;

  const username = usernameEl.value.trim();
  const password = passwordEl ? passwordEl.value : '';
  if (!username) return;

  const user = (state.users || []).find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
  if (!user || !(await verifyUserPassword(user, password))) {
    const tempHint = user && user.mustChangePassword && !isPbkdf2Hash(user.passwordHash)
      ? " Lần đăng nhập đầu sau khi cập nhật: mật khẩu tạm là tên đăng nhập (tài khoản admin mặc định: admin)." : "";
    showLoginError("Tên đăng nhập hoặc mật khẩu không chính xác." + tempHint);
    return;
  }
  if (user.mustChangePassword) {
    showForcedPasswordChange(user);
    return;
  }
  await completeLogin(user);
}

async function completeLogin(user) {
  window.currentUser = user;
  await saveAuthSession(user);
  hideLoginOverlay();
  applyRolePermissions();
  logUserAction("Đăng nhập", `Người dùng ${user.name} (${user.username}) đã đăng nhập thành công.`);
  if (typeof showToast === 'function') showToast(`Đăng nhập thành công! Chào mừng ${user.name}`, 'success');
}

// Mật khẩu mặc định/tạm: phải đặt mật khẩu mới trước khi vào phần mềm.
function showForcedPasswordChange(user) {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <h2 class="login-title">Đặt mật khẩu mới</h2>
        <p class="login-subtitle">Tài khoản ${escapeHtmlText(user.username)} đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới.</p>
      </div>
      <div id="login-error" class="login-error-msg" style="display: none;"></div>
      <form class="login-form" id="forced-password-form">
        <div class="login-field">
          <label class="login-label" for="forced-pwd-new">Mật khẩu mới</label>
          <input type="password" id="forced-pwd-new" class="login-input" required minlength="6" autocomplete="new-password">
        </div>
        <div class="login-field">
          <label class="login-label" for="forced-pwd-confirm">Nhập lại mật khẩu mới</label>
          <input type="password" id="forced-pwd-confirm" class="login-input" required minlength="6" autocomplete="new-password">
        </div>
        <button type="submit" class="login-submit-btn"><span>Lưu và đăng nhập</span></button>
      </form>
    </div>
  `;
  document.getElementById('forced-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const next = document.getElementById('forced-pwd-new').value;
    if (next.length < 6) return showLoginError("Mật khẩu mới phải dài tối thiểu 6 ký tự.");
    if (next !== document.getElementById('forced-pwd-confirm').value) return showLoginError("Mật khẩu xác nhận không trùng khớp.");
    if (await verifyUserPassword(user, next)) return showLoginError("Mật khẩu mới phải khác mật khẩu tạm.");
    await setUserPassword(user, next);
    saveState();
    await completeLogin(user);
  });
}

async function confirmLogoutUser() {
  const ok = typeof showConfirmModal === "function"
    ? await showConfirmModal({ title: "Đăng xuất", message: "Bạn muốn đăng xuất khỏi phần mềm?", confirmText: "Đăng xuất", cancelText: "Ở lại", type: "danger" })
    : true;
  if (ok) logoutUser();
}
window.confirmLogoutUser = confirmLogoutUser;

function logoutUser() {
  if (window.currentUser) {
    // Ghi nhật ký đăng xuất mấu chốt
    logUserAction("Đăng xuất", `Người dùng ${window.currentUser.name} (${window.currentUser.username}) đã đăng xuất.`);
  }
  window.currentUser = null;
  clearAuthSession();
  showLoginForm();
  applyRolePermissions();
  if (typeof showToast === 'function') {
    showToast("Đã đăng xuất khỏi hệ thống.", "info");
  }
}

// ===========================================================================
// THIẾT LẬP VÀ ÁP DỤNG QUYỀN HẠN (RBAC)
// ===========================================================================

function applyRolePermissions() {
  const role = window.currentUser ? window.currentUser.role : 'viewer';
  console.log(`[Auth] Đang áp dụng phân quyền cho vai trò: ${role}`);
  
  // 1. Gắn các class vai trò vào body để xử lý CSS Selector
  document.body.classList.remove('role-admin', 'role-accountant', 'role-viewer');
  document.body.classList.add(`role-${role}`);
  
  // 2. Hiển thị thông tin người dùng lên Header
  const userInfoDisplay = document.getElementById('user-info-display');
  if (userInfoDisplay) {
    if (window.currentUser) {
      const roleName = role === 'admin' ? 'Quản trị' : (role === 'accountant' ? 'Kế toán' : 'Xem');
      // Menu người dùng: "Đổi mật khẩu" và "Đăng xuất" nằm trong menu thả xuống thay vì hai link
      // chữ nhỏ cạnh tên (dễ bấm nhầm Thoát).
      const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      userInfoDisplay.innerHTML = `
        <details class="user-menu">
          <summary class="user-menu-trigger" aria-label="Tài khoản">
            <span class="chip-dot" style="background-color: var(--color-primary);"></span>
            <span>${esc(window.currentUser.name)} (${roleName})</span>
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div class="user-menu-list" role="menu">
            <button type="button" role="menuitem" onclick="this.closest('details').open=false; showChangePasswordModal()">Đổi mật khẩu</button>
            <button type="button" role="menuitem" class="user-menu-danger" onclick="this.closest('details').open=false; confirmLogoutUser()">Đăng xuất</button>
          </div>
        </details>
      `;
      userInfoDisplay.style.display = 'inline-flex';
      // Toast góc phải trên (z-index cao hơn header) nằm đè lên menu thả xuống ngay sau khi đăng nhập
      // — mở menu thì đóng các toast đang hiện để bấm được "Đăng xuất".
      const userMenu = userInfoDisplay.querySelector('details.user-menu');
      if (userMenu) {
        userMenu.addEventListener('toggle', () => {
          if (userMenu.open) document.querySelectorAll('.toast-container .toast').forEach(t => t.remove());
        });
      }
    } else {
      userInfoDisplay.style.display = 'none';
    }
  }
  
  // 3. Tải danh sách người dùng lên bảng UI nếu là admin
  if (role === 'admin') {
    renderUserListTable();
    if (typeof renderActivityLogTable === 'function') {
      renderActivityLogTable();
    }
  }
}

// ===========================================================================
// QUẢN LÝ NGƯỜI DÙNG (CHỈ DÀNH CHO ADMIN)
// ===========================================================================

function renderUserListTable() {
  const tbody = document.getElementById('user-list-tbody');
  if (!tbody) return;
  
  const users = state.users || [];
  if (users.length === 0) {
    renderEmptyState(tbody, 4, 'Không có dữ liệu người dùng', 'Thêm tài khoản người dùng trong phần quản lý');
    return;
  }
  
  let html = '';
  users.forEach(u => {
    const roleText = u.role === 'admin' ? 'Quản trị viên' : (u.role === 'accountant' ? 'Kế toán' : 'Người xem báo cáo');
    const isSelf = window.currentUser && window.currentUser.username === u.username;
    
    html += `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${escapeHtmlText(u.name)}</td>
        <td><code>${escapeHtmlText(u.username)}</code></td>
        <td><span class="badge badge-${u.role === 'admin' ? 'danger' : (u.role === 'accountant' ? 'success' : 'info')}">${roleText}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="showEditUserModal(${escapeHtmlText(JSON.stringify(u.username))})" style="padding: 2px 8px; font-size: 11px;">
            Sửa
          </button>
          ${!isSelf ? `
            <button class="btn btn-danger btn-sm" onclick="deleteUser(${escapeHtmlText(JSON.stringify(u.username))})" style="padding: 2px 8px; font-size: 11px; margin-left: 4px;">
              Xóa
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  });
  
  tbody.innerHTML = html;
}

// Hiển thị modal thêm người dùng mới
function showAddUserModal() {
  document.getElementById('user-modal-title').textContent = "Thêm người dùng mới";
  document.getElementById('user-edit-username').value = "";
  document.getElementById('user-edit-username').disabled = false;
  document.getElementById('user-edit-name').value = "";
  document.getElementById('user-edit-password').value = "";
  document.getElementById('user-edit-password').placeholder = "Nhập mật khẩu...";
  document.getElementById('user-edit-role').value = "accountant";
  document.getElementById('user-edit-mode').value = "add";
  
  openModal('modal-edit-user');
}

// Hiển thị modal sửa thông tin người dùng
function showEditUserModal(username) {
  const users = state.users || [];
  const user = users.find(u => u.username === username);
  if (!user) return;
  
  document.getElementById('user-modal-title').textContent = `Chỉnh sửa: ${user.name}`;
  document.getElementById('user-edit-username').value = user.username;
  document.getElementById('user-edit-username').disabled = true;
  document.getElementById('user-edit-name').value = user.name;
  document.getElementById('user-edit-password').value = "";
  document.getElementById('user-edit-password').placeholder = "Để trống nếu không đổi mật khẩu";
  document.getElementById('user-edit-role').value = user.role;
  document.getElementById('user-edit-mode').value = "edit";
  
  openModal('modal-edit-user');
}

// Lưu người dùng (Cả Add và Edit)
async function saveUserFromModal() {
  const mode = document.getElementById('user-edit-mode').value;
  const username = document.getElementById('user-edit-username').value.trim();
  const name = document.getElementById('user-edit-name').value.trim();
  const password = document.getElementById('user-edit-password').value.trim();
  const role = document.getElementById('user-edit-role').value;
  
  if (!username || !name) {
    alert("Vui lòng nhập đầy đủ Tên đăng nhập và Họ tên.");
    return;
  }
  
  state.users = state.users || [];
  
  if (mode === "add") {
    if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      alert("Tên đăng nhập đã tồn tại trên hệ thống.");
      return;
    }
    if (!password) {
      alert("Vui lòng nhập mật khẩu cho tài khoản mới.");
      return;
    }
    
    const newUser = { username, name, role };
    await setUserPassword(newUser, password);
    state.users.push(newUser);
    
    logUserAction("Thêm tài khoản", `Đã tạo tài khoản mới: ${username} (${name}), vai trò: ${role}`);
  } else {
    const idx = state.users.findIndex(u => u.username === username);
    if (idx === -1) return;
    
    const user = state.users[idx];
    user.name = name;
    user.role = role;
    
    if (password) {
      await setUserPassword(user, password);
    }
    
    state.users[idx] = user;
    
    if (window.currentUser && window.currentUser.username === username) {
      window.currentUser = user;
      saveAuthSession(user);
    }
    
    logUserAction("Sửa tài khoản", `Đã cập nhật tài khoản: ${username} (${name})`);
  }
  
  saveState();
  closeModal('modal-edit-user');
  applyRolePermissions();
  if (typeof showToast === 'function') {
    showToast("Đã cập nhật thông tin tài khoản thành công!", "success");
  }
}

// Xóa tài khoản người dùng
async function deleteUser(username) {
  if (window.currentUser && window.currentUser.username === username) {
    alert("Không thể tự xóa tài khoản của chính mình khi đang đăng nhập.");
    return;
  }
  
  const ok = await showConfirmModal({
    title: "Xác nhận xóa tài khoản",
    message: `Bạn có chắc chắn muốn xóa tài khoản "${username}" không?`,
    confirmText: "Xóa tài khoản",
    cancelText: "Hủy bỏ",
    type: "danger"
  });
  if (!ok) return;

  state.users = (state.users || []).filter(u => u.username !== username);
  saveState();
  logUserAction("Xóa tài khoản", `Đã xóa tài khoản nhân viên: ${username}`);
  applyRolePermissions();
  if (typeof showToast === 'function') {
    showToast("Đã xóa tài khoản thành công!", "success");
  }
}

// ===========================================================================
// ĐỔI MẬT KHẨU CÁ NHÂN & NHẬT KÝ HOẠT ĐỘNG MẤU CHỐT (AUDIT LOG)
// ===========================================================================

// Đổi mật khẩu cá nhân
function showChangePasswordModal() {
  const errDiv = document.getElementById('change-pwd-error');
  if (errDiv) errDiv.style.display = 'none';
  
  document.getElementById('change-pwd-current').value = '';
  document.getElementById('change-pwd-new').value = '';
  document.getElementById('change-pwd-confirm').value = '';
  
  openModal('modal-change-password');
}

async function submitChangePassword() {
  const currentPassword = document.getElementById('change-pwd-current').value;
  const newPassword = document.getElementById('change-pwd-new').value;
  const confirmPassword = document.getElementById('change-pwd-confirm').value;
  const errDiv = document.getElementById('change-pwd-error');
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    if (errDiv) {
      errDiv.textContent = 'Vui lòng điền đầy đủ các trường.';
      errDiv.style.display = 'block';
    }
    return;
  }
  
  if (!window.currentUser) return;
  
  if (!(await verifyUserPassword(window.currentUser, currentPassword))) {
    if (errDiv) {
      errDiv.textContent = 'Mật khẩu hiện tại không chính xác.';
      errDiv.style.display = 'block';
    }
    return;
  }
  
  if (newPassword.length < 4) {
    if (errDiv) {
      errDiv.textContent = 'Mật khẩu mới phải dài tối thiểu 4 ký tự.';
      errDiv.style.display = 'block';
    }
    return;
  }
  
  if (newPassword !== confirmPassword) {
    if (errDiv) {
      errDiv.textContent = 'Mật khẩu xác nhận không trùng khớp.';
      errDiv.style.display = 'block';
    }
    return;
  }
  
  const idx = state.users.findIndex(u => u.username === window.currentUser.username);
  if (idx !== -1) {
    await setUserPassword(state.users[idx], newPassword);
    if (state.users[idx] !== window.currentUser) await setUserPassword(window.currentUser, newPassword);

    saveState();
    logUserAction("Đổi mật khẩu", `Đã tự thay đổi mật khẩu của tài khoản: ${window.currentUser.username}`);
    
    closeModal('modal-change-password');
    if (typeof showToast === 'function') {
      showToast("Đã thay đổi mật khẩu thành công!", "success");
    }
  }
}

// Ghi nhật ký hoạt động
function logUserAction(actionType, description) {
  if (!window.currentUser) return;
  
  const newLog = {
    timestamp: Date.now(),
    username: window.currentUser.username,
    name: window.currentUser.name,
    action: actionType,
    description: description
  };
  
  state.actionLogs = state.actionLogs || [];
  state.actionLogs.unshift(newLog);
  
  if (state.actionLogs.length > 1000) {
    state.actionLogs = state.actionLogs.slice(0, 1000);
  }
  
  saveState();
}

// Nạp nhật ký lên bảng UI
function renderActivityLogTable() {
  const tbody = document.getElementById('activity-log-tbody');
  if (!tbody) return;
  
  const logs = state.actionLogs || [];
  if (logs.length === 0) {
    renderEmptyState(tbody, 5, 'Không có hoạt động nào được ghi nhận', 'Nhật ký sẽ cập nhật khi có thao tác trên hệ thống');
    return;
  }
  
  let html = '';
  logs.forEach(log => {
    const formattedTime = formatDateAndTime(log.timestamp);
    html += `
      <tr>
        <td style="color: var(--text-secondary);">${formattedTime}</td>
        <td><code>${escapeHtmlText(log.username)}</code></td>
        <td style="font-weight: 500;">${escapeHtmlText(log.name)}</td>
        <td><span class="badge badge-info" style="font-weight: 600; background-color: var(--color-primary-light); color: white; padding: 2px 6px; border-radius: 4px;">${escapeHtmlText(log.action)}</span></td>
        <td style="color: var(--text-primary);">${escapeHtmlText(log.description)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function formatDateAndTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Tự động gắn nhãn vai trò dựa trên văn bản và hành động
function autoTagRoleButtons() {
  const writeKeywords = ["lập", "thêm", "sửa", "xóa", "nhập excel", "lưu", "ghi sổ", "bỏ ghi", "trộn", "revert"];
  const adminKeywords = ["sao lưu", "khôi phục", "tính lại", "cấu hình", "thiết lập", "reset", "đồng bộ lại"];

  document.querySelectorAll("button, a.btn, .btn, .icon-btn").forEach(btn => {
    if (btn.hasAttribute("data-role-required")) return;

    const text = (btn.innerText || btn.textContent || "").toLowerCase().trim();
    const onclick = (btn.getAttribute("onclick") || "").toLowerCase();

    const isAdmin = adminKeywords.some(kw => text.includes(kw)) ||
                    onclick.includes("recalibrate") ||
                    (onclick.includes("reset") && !onclick.includes("form")) ||
                    onclick.includes("backup");
                    
    if (isAdmin) {
      btn.setAttribute("data-role-required", "admin");
      return;
    }

    const isWrite = writeKeywords.some(kw => text.includes(kw)) ||
                    onclick.includes("showadd") ||
                    onclick.includes("delete") ||
                    onclick.includes("edit") ||
                    onclick.includes("import") ||
                    onclick.includes("save") ||
                    onclick.includes("submit");
                    
    if (isWrite) {
      if (text.includes("đóng") || text.includes("hủy") || onclick.includes("closemodal")) {
        return;
      }
      btn.setAttribute("data-role-required", "write");
    }
  });
}

// Gắn nhãn khi DOM thay đổi (modal/bảng vừa render) thay vì quét mỗi giây.
autoTagRoleButtons();
if (typeof MutationObserver === "function") {
  new MutationObserver(autoTagRoleButtons).observe(document.body, { childList: true, subtree: true });
}

// Đăng ký toàn cục các hàm để HTML onclick có thể gọi
window.initAuth = initAuth;
window.submitLogin = submitLogin;
window.hashPassword = hashPassword;
window.verifyUserPassword = verifyUserPassword;
window.logoutUser = logoutUser;
window.showAddUserModal = showAddUserModal;
window.showEditUserModal = showEditUserModal;
window.saveUserFromModal = saveUserFromModal;
window.deleteUser = deleteUser;
window.autoTagRoleButtons = autoTagRoleButtons;
window.showChangePasswordModal = showChangePasswordModal;
window.submitChangePassword = submitChangePassword;
window.logUserAction = logUserAction;
window.renderActivityLogTable = renderActivityLogTable;
