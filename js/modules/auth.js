/**
 * js/modules/auth.js
 * Quản lý tài khoản người dùng, Đăng nhập, Đăng xuất, Phân quyền sử dụng (RBAC) và CRUD người dùng.
 */

// Trạng thái phiên làm việc hiện tại
window.currentUser = null;

// Hàm băm mật khẩu bảo mật (SHA-256 kèm salt dựa trên username)
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Khởi chạy hệ thống Auth khi ứng dụng nạp xong dữ liệu
async function initAuth() {
  const users = state.users || [];
  
  if (users.length === 0) {
    // Chưa có người dùng nào -> Hiển thị màn hình đăng ký tài khoản Admin tối cao
    showRegisterAdminForm();
  } else {
    // Đã có người dùng -> Hiển thị màn hình đăng nhập tiêu chuẩn
    showLoginForm();
  }
}

// ===========================================================================
// GIAO DIỆN MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ OVERLAY
// ===========================================================================

function showRegisterAdminForm() {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <img src="logo.jpg" alt="Logo" class="login-logo">
        <h2 class="login-title">THIẾT LẬP HỆ THỐNG</h2>
        <p class="login-subtitle">Vui lòng khởi tạo tài khoản quản trị tối cao (Admin)</p>
      </div>
      
      <div id="register-error" class="login-error-msg" style="display: none;"></div>
      
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label" style="color: rgba(255,255,255,0.7);">Họ và tên</label>
        <input type="text" id="reg-fullname" class="form-control login-input" placeholder="Nhập họ và tên...">
      </div>
      
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label" style="color: rgba(255,255,255,0.7);">Tên đăng nhập (User ID)</label>
        <input type="text" id="reg-username" class="form-control login-input" placeholder="Ví dụ: admin...">
      </div>
      
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label" style="color: rgba(255,255,255,0.7);">Mật khẩu</label>
        <input type="password" id="reg-password" class="form-control login-input" placeholder="Nhập mật khẩu...">
      </div>
      
      <div class="form-group" style="margin-bottom: 20px;">
        <label class="form-label" style="color: rgba(255,255,255,0.7);">Xác nhận mật khẩu</label>
        <input type="password" id="reg-confirm-password" class="form-control login-input" placeholder="Xác nhận mật khẩu...">
      </div>
      
      <button class="btn btn-primary" onclick="submitRegisterAdmin()" style="width: 100%; height: 42px; font-weight: 600;">
        KHỞI TẠO & ĐĂNG NHẬP
      </button>
    </div>
  `;
}

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
          <label class="form-label" style="color: rgba(255,255,255,0.7);">Tên đăng nhập</label>
          <input type="text" id="login-username" class="form-control login-input" required placeholder="User ID..." autofocus>
        </div>
        
        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label" style="color: rgba(255,255,255,0.7);">Mật khẩu</label>
          <input type="password" id="login-password" class="form-control login-input" required placeholder="Mật khẩu...">
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
async function submitLogin(event) {
  if (event) event.preventDefault();
  
  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  if (!usernameEl || !passwordEl) return;
  
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  
  const users = state.users || [];
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (!user) {
    showLoginError("Tên đăng nhập không tồn tại.");
    return;
  }
  
  const salt = user.username.toLowerCase();
  const enteredHash = await hashPassword(password, salt);
  
  if (enteredHash === user.passwordHash) {
    window.currentUser = user;
    hideLoginOverlay();
    applyRolePermissions();
    if (typeof showToast === 'function') {
      showToast(`Đăng nhập thành công! Chào mừng ${user.name}`, 'success');
    }
  } else {
    showLoginError("Mật khẩu không chính xác.");
  }
}

// Xử lý đăng ký Admin đầu tiên
async function submitRegisterAdmin() {
  const fullNameEl = document.getElementById('reg-fullname');
  const usernameEl = document.getElementById('reg-username');
  const passwordEl = document.getElementById('reg-password');
  const confirmPasswordEl = document.getElementById('reg-confirm-password');
  
  if (!fullNameEl || !usernameEl || !passwordEl || !confirmPasswordEl) return;
  
  const fullName = fullNameEl.value.trim();
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  const confirmPassword = confirmPasswordEl.value;
  
  if (!fullName || !username || !password) {
    showRegisterError("Vui lòng điền đầy đủ thông tin.");
    return;
  }
  
  if (username.length < 3) {
    showRegisterError("Tên đăng nhập phải dài tối thiểu 3 ký tự.");
    return;
  }
  
  if (password.length < 4) {
    showRegisterError("Mật khẩu phải dài tối thiểu 4 ký tự.");
    return;
  }
  
  if (password !== confirmPassword) {
    showRegisterError("Mật khẩu xác nhận không trùng khớp.");
    return;
  }
  
  const salt = username.toLowerCase();
  const passwordHash = await hashPassword(password, salt);
  
  const adminUser = {
    username: username,
    passwordHash: passwordHash,
    name: fullName,
    role: 'admin'
  };
  
  state.users = [adminUser];
  saveState(); // Lưu database cục bộ & tự động sync mây
  
  window.currentUser = adminUser;
  hideLoginOverlay();
  applyRolePermissions();
  if (typeof showToast === 'function') {
    showToast("Đã khởi tạo tài khoản quản trị tối cao thành công!", "success");
  }
}

function logoutUser() {
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
        <a onclick="logoutUser()" style="margin-left: 6px; color: #ef4444; cursor: pointer; font-size: 11px; text-decoration: underline;">Thoát</a>
      `;
      userInfoDisplay.style.display = 'inline-flex';
    } else {
      userInfoDisplay.style.display = 'none';
    }
  }
  
  // 3. Tải danh sách người dùng lên bảng UI nếu là admin
  if (role === 'admin') {
    renderUserListTable();
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
  // Reset form
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
  document.getElementById('user-edit-username').disabled = true; // Không được sửa username (khóa chính)
  document.getElementById('user-edit-name').value = user.name;
  document.getElementById('user-edit-password').value = "";
  document.getElementById('user-edit-password').placeholder = "Để trống nếu không muốn đổi mật khẩu";
  document.getElementById('user-edit-role').value = user.role;
  document.getElementById('user-edit-mode').value = "edit";
  
  openModal('modal-edit-user');
}

// Lưu người dùng (Cả Add và Edit)
async function saveUserFromModal() {
  const mode = document.getElementById('user-edit-mode').value;
  const username = document.getElementById('user-edit-username').value.trim();
  const name = document.getElementById('user-edit-name').value.trim();
  const password = document.getElementById('user-edit-password').value;
  const role = document.getElementById('user-edit-role').value;
  
  if (!username || !name) {
    alert("Vui lòng nhập đầy đủ Tên đăng nhập và Họ tên.");
    return;
  }
  
  state.users = state.users || [];
  
  if (mode === "add") {
    // Kiểm tra trùng username
    if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      alert("Tên đăng nhập đã tồn tại trên hệ thống.");
      return;
    }
    if (!password) {
      alert("Vui lòng nhập mật khẩu cho tài khoản mới.");
      return;
    }
    
    const salt = username.toLowerCase();
    const passwordHash = await hashPassword(password, salt);
    
    state.users.push({
      username: username,
      name: name,
      passwordHash: passwordHash,
      role: role
    });
    
  } else {
    // Sửa thông tin
    const idx = state.users.findIndex(u => u.username === username);
    if (idx === -1) return;
    
    const user = state.users[idx];
    user.name = name;
    user.role = role;
    
    // Nếu có nhập mật khẩu mới thì băm và lưu
    if (password.trim().length > 0) {
      const salt = username.toLowerCase();
      user.passwordHash = await hashPassword(password, salt);
    }
    
    state.users[idx] = user;
    
    // Cập nhật lại phiên làm việc nếu admin tự sửa thông tin của chính mình
    if (window.currentUser && window.currentUser.username === username) {
      window.currentUser = user;
    }
  }
  
  saveState(); // Lưu SQLite & Sync Cloud
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
    saveState(); // Lưu SQLite & Sync Cloud
    applyRolePermissions();
    if (typeof showToast === 'function') {
      showToast("Đã xóa tài khoản thành công!", "success");
    }
  }
}

// Tự động gắn nhãn vai trò dựa trên văn bản và hành động
function autoTagRoleButtons() {
  const writeKeywords = ["thêm", "sửa", "xóa", "nhập excel", "lưu", "ghi sổ", "bỏ ghi", "trộn", "revert"];
  const adminKeywords = ["sao lưu", "khôi phục", "tính lại", "cấu hình", "thiết lập", "reset", "đồng bộ lại"];

  document.querySelectorAll("button, a.btn, .btn, .icon-btn").forEach(btn => {
    if (btn.hasAttribute("data-role-required")) return;

    const text = (btn.innerText || btn.textContent || "").toLowerCase().trim();
    const onclick = (btn.getAttribute("onclick") || "").toLowerCase();

    const isAdmin = adminKeywords.some(kw => text.includes(kw)) ||
                    onclick.includes("recalibrate") ||
                    onclick.includes("reset") ||
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
window.submitRegisterAdmin = submitRegisterAdmin;
window.logoutUser = logoutUser;
window.showAddUserModal = showAddUserModal;
window.showEditUserModal = showEditUserModal;
window.saveUserFromModal = saveUserFromModal;
window.deleteUser = deleteUser;
window.autoTagRoleButtons = autoTagRoleButtons;
