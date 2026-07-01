/**
 * js/modules/auth.js
 * Quản lý tài khoản người dùng, Đăng nhập, Đăng xuất, Phân quyền sử dụng (RBAC) và CRUD người dùng.
 */

// Trạng thái phiên làm việc hiện tại
window.currentUser = null;

// Khởi chạy hệ thống Auth khi ứng dụng nạp xong dữ liệu
async function initAuth() {
  let users = state.users || [];
  
  if (users.length === 0) {
    // Tự động khởi tạo tài khoản admin mặc định nếu CSDL trống
    console.log('[Auth] CSDL chưa có tài khoản nào. Đang tạo tài khoản admin mặc định...');
    const defaultAdminUsername = 'admin';
    const defaultAdminPassword = 'admin';
    
    const defaultAdmin = {
      username: defaultAdminUsername,
      password: defaultAdminPassword,
      name: "Administrator",
      role: "admin"
    };
    
    state.users = [defaultAdmin];
    saveState(); // Lưu SQLite & Sync Cloud
    users = state.users;
  }
  
  // Đảm bảo mọi người dùng đều có mật khẩu thô dạng plain text
  let migrated = false;
  users.forEach(u => {
    if (!u.password) {
      u.password = u.passwordHash ? "admin" : u.username;
      migrated = true;
    }
  });
  if (migrated) {
    saveState();
  }
  
  // Hiển thị màn hình đăng nhập tiêu chuẩn
  showLoginForm();
}

function handleUsernameInput(el) {
  const pwdGroup = document.getElementById('login-password-group');
  const pwdInput = document.getElementById('login-password');
  if (!pwdGroup || !pwdInput) return;
  
  if (el.value.trim().toLowerCase() === 'admin') {
    pwdGroup.style.display = 'block';
    pwdInput.setAttribute('required', 'required');
  } else {
    pwdGroup.style.display = 'none';
    pwdInput.removeAttribute('required');
    pwdInput.value = '';
  }
}
window.handleUsernameInput = handleUsernameInput;

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
        <img src="logo.jpg" alt="Logo" class="login-logo">
        <h2 class="login-title">KẾ TOÁN RẠNG ĐÔNG</h2>
        <p class="login-subtitle">Hệ thống Quản lý và Hạch toán độc lập</p>
      </div>
      
      <div id="login-error" class="login-error-msg" style="display: none;"></div>
      
      <form id="login-form-submit" onsubmit="submitLogin(event)">
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label" style="color: rgba(255,255,255,0.7);">Tên của bạn (Tên đăng nhập)</label>
          <input type="text" id="login-username" class="form-control login-input" required placeholder="Nhập tên..." autofocus style="background: rgba(255,255,255,0.08); color: white; border-color: rgba(255,255,255,0.15);" oninput="handleUsernameInput(this)">
        </div>
        
        <div id="login-password-group" class="form-group" style="margin-bottom: 24px; display: none;">
          <label class="form-label" style="color: rgba(255,255,255,0.7);">Mật khẩu Admin</label>
          <input type="password" id="login-password" class="form-control login-input" placeholder="Mật khẩu..." style="background: rgba(255,255,255,0.08); color: white; border-color: rgba(255,255,255,0.15);">
        </div>
        
        <button type="submit" class="btn btn-primary" style="width: 100%; height: 42px; font-weight: 600;">
          ĐĂNG NHẬP
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

function showRegisterError(msg) {
  const el = document.getElementById('register-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

// Xử lý sự kiện đăng nhập
function submitLogin(event) {
  if (event) event.preventDefault();
  
  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  if (!usernameEl) return;
  
  const username = usernameEl.value.trim();
  const password = passwordEl ? passwordEl.value : '';
  
  if (!username) return;

  const users = state.users || [];
  
  if (username.toLowerCase() === 'admin') {
    const adminUser = users.find(u => u.username.toLowerCase() === 'admin');
    if (!adminUser) {
      // Fallback: nếu chưa có admin trong DB, cho phép admin/admin
      if (password === 'admin') {
        const defaultAdmin = {
          username: 'admin',
          name: 'Quản trị viên',
          role: 'admin',
          password: 'admin'
        };
        state.users = state.users || [];
        state.users.push(defaultAdmin);
        saveState();
        window.currentUser = defaultAdmin;
        hideLoginOverlay();
        applyRolePermissions();
        logUserAction("Đăng nhập", "Người dùng Quản trị viên (admin) đã đăng nhập thành công.");
        if (typeof showToast === 'function') showToast("Đăng nhập thành công! Chào mừng Quản trị viên", 'success');
      } else {
        showLoginError("Mật khẩu Admin không chính xác.");
      }
      return;
    }

    if (adminUser.password === password) {
      window.currentUser = adminUser;
      hideLoginOverlay();
      applyRolePermissions();
      logUserAction("Đăng nhập", "Người dùng Quản trị viên (admin) đã đăng nhập thành công.");
      if (typeof showToast === 'function') showToast("Đăng nhập thành công! Chào mừng Quản trị viên", 'success');
    } else {
      showLoginError("Mật khẩu Admin không chính xác.");
    }
  } else {
    // Đăng nhập không cần mật khẩu cho các tài khoản khác
    let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      // Nếu chưa tồn tại -> Tự động đăng ký mới làm Kế toán viên (accountant)
      user = {
        username: username,
        name: username,
        role: 'accountant',
        password: ''
      };
      state.users = state.users || [];
      state.users.push(user);
      saveState();
    }
    
    window.currentUser = user;
    hideLoginOverlay();
    applyRolePermissions();
    logUserAction("Đăng nhập", `Người dùng ${user.name} (${user.username}) đã đăng nhập thành công.`);
    if (typeof showToast === 'function') {
      showToast(`Đăng nhập thành công! Chào mừng ${user.name}`, 'success');
    }
  }
}


function logoutUser() {
  if (window.currentUser) {
    // Ghi nhật ký đăng xuất mấu chốt
    logUserAction("Đăng xuất", `Người dùng ${window.currentUser.name} (${window.currentUser.username}) đã đăng xuất.`);
  }
  window.currentUser = null;
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
      userInfoDisplay.innerHTML = `
        <span class="chip-dot" style="background-color: var(--color-primary);"></span>
        <span>${window.currentUser.name} (${roleName})</span>
        <a onclick="showChangePasswordModal()" style="margin-left: 10px; color: var(--color-primary-light); cursor: pointer; font-size: 11px; text-decoration: underline;">Đổi mật khẩu</a>
        <a onclick="logoutUser()" style="margin-left: 10px; color: #ef4444; cursor: pointer; font-size: 11px; text-decoration: underline;">Thoát</a>
      `;
      userInfoDisplay.style.display = 'inline-flex';
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
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Không có dữ liệu người dùng</td></tr>';
    return;
  }
  
  let html = '';
  users.forEach(u => {
    const roleText = u.role === 'admin' ? 'Quản trị viên' : (u.role === 'accountant' ? 'Kế toán' : 'Người xem báo cáo');
    const isSelf = window.currentUser && window.currentUser.username === u.username;
    
    html += `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${u.name}</td>
        <td><code>${u.username}</code></td>
        <td><span class="badge badge-${u.role === 'admin' ? 'danger' : (u.role === 'accountant' ? 'success' : 'info')}">${roleText}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="showEditUserModal('${u.username}')" style="padding: 2px 8px; font-size: 11px;">
            Sửa
          </button>
          ${!isSelf ? `
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.username}')" style="padding: 2px 8px; font-size: 11px; margin-left: 4px;">
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
  document.getElementById('user-edit-password').value = user.password || "";
  document.getElementById('user-edit-password').placeholder = "Mật khẩu...";
  document.getElementById('user-edit-role').value = user.role;
  document.getElementById('user-edit-mode').value = "edit";
  
  openModal('modal-edit-user');
}

// Lưu người dùng (Cả Add và Edit)
function saveUserFromModal() {
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
    
    state.users.push({
      username: username,
      name: name,
      password: password,
      role: role
    });
    
    logUserAction("Thêm tài khoản", `Đã tạo tài khoản mới: ${username} (${name}), vai trò: ${role}`);
  } else {
    const idx = state.users.findIndex(u => u.username === username);
    if (idx === -1) return;
    
    const user = state.users[idx];
    user.name = name;
    user.role = role;
    
    if (password) {
      user.password = password;
    }
    
    state.users[idx] = user;
    
    if (window.currentUser && window.currentUser.username === username) {
      window.currentUser = user;
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
function deleteUser(username) {
  if (window.currentUser && window.currentUser.username === username) {
    alert("Không thể tự xóa tài khoản của chính mình khi đang đăng nhập.");
    return;
  }
  
  if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}" không?`)) {
    state.users = (state.users || []).filter(u => u.username !== username);
    saveState();
    logUserAction("Xóa tài khoản", `Đã xóa tài khoản nhân viên: ${username}`);
    applyRolePermissions();
    if (typeof showToast === 'function') {
      showToast("Đã xóa tài khoản thành công!", "success");
    }
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

function submitChangePassword() {
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
  
  if (currentPassword !== window.currentUser.password) {
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
    state.users[idx].password = newPassword;
    window.currentUser.password = newPassword;
    
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Không có hoạt động nào được ghi nhận.</td></tr>';
    return;
  }
  
  let html = '';
  logs.forEach(log => {
    const formattedTime = formatDateAndTime(log.timestamp);
    html += `
      <tr>
        <td style="color: var(--text-secondary);">${formattedTime}</td>
        <td><code>${log.username}</code></td>
        <td style="font-weight: 500;">${log.name}</td>
        <td><span class="badge badge-info" style="font-weight: 600; background-color: var(--color-primary-light); color: white; padding: 2px 6px; border-radius: 4px;">${log.action}</span></td>
        <td style="color: var(--text-primary);">${log.description}</td>
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

// Chạy tự động quét nút trên toàn trang khi khởi tạo
setInterval(autoTagRoleButtons, 1000);

// Đăng ký toàn cục các hàm để HTML onclick có thể gọi
window.initAuth = initAuth;
window.submitLogin = submitLogin;
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
