// Login and password storage (js/modules/auth.js) in a vm sandbox with real WebCrypto.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");

function loadAuth(users) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: "", style: {}, textContent: "", innerHTML: "", setAttribute() {}, removeAttribute() {} });
    return elements.get(id);
  };
  const calls = { saved: 0, toasts: [], modal: [] };
  const ctx = {
    console, Date, JSON, Math, Array, Object, String, Number, Promise, TextEncoder, Uint8Array,
    setInterval: () => 0, clearInterval() {}, setTimeout: (fn) => 0, clearTimeout() {},
    crypto: webcrypto,
    state: { users },
    document: { getElementById: el, body: { classList: { add() {}, remove() {} } }, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    saveState() { calls.saved++; },
    showToast(msg, kind) { calls.toasts.push([kind, msg]); },
    openModal(id) { calls.modal.push(id); },
    closeModal() {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "modules", "auth.js"), "utf8"), ctx, { filename: "auth.js" });
  ctx.renderUserListTable = () => {};
  ctx.renderActivityLogTable = () => {};
  const login = async (u, p) => {
    el("login-username").value = u; el("login-password").value = p; el("login-error").textContent = "";
    ctx.currentUser = null;
    await ctx.submitLogin({ preventDefault() {} });
    return { user: ctx.currentUser, error: el("login-error").textContent };
  };
  return { ctx, calls, login, el };
}

async function run() {
  // Plain-text password from an old version: still accepted once, then stored only as a hash.
  const users = [{ username: "admin", name: "Admin", role: "admin", password: "s3cret-pw" }, { username: "kt", name: "Kế toán", role: "accountant" }];
  const { ctx, calls, login } = loadAuth(users);
  assert.equal(await ctx.migratePlainPasswords(users), true);
  assert.ok(!("password" in users[0]), "plain text password removed");
  assert.match(users[0].passwordHash, /^[0-9a-f]{64}$/);
  assert.match(users[0].passwordSalt, /^[0-9a-f]{32}$/);

  let r = await login("ADMIN", "s3cret-pw");
  assert.equal(r.user && r.user.username, "admin", "correct password logs in (username case-insensitive)");
  r = await login("admin", "wrong");
  assert.equal(r.user, null);
  assert.match(r.error, /Mật khẩu không chính xác/);

  // No more self-registration, no password-less login
  r = await login("nguoi-la", "");
  assert.equal(r.user, null, "unknown user is refused instead of auto-created");
  assert.equal(ctx.state.users.length, 2);
  r = await login("kt", "kt");
  assert.equal(r.user, null, "a user without a password cannot log in");
  assert.match(r.error, /chưa có mật khẩu/);

  // A hash wins over a plain-text password written back by an old app version
  users[0].password = "admin";
  r = await login("admin", "admin");
  assert.equal(r.user, null, "old-version plain text cannot bypass the hash");

  // Default admin/admin forces a password change
  const fresh = [{ username: "admin", name: "Admin", role: "admin" }];
  const f = loadAuth(fresh);
  await f.ctx.setUserPassword(fresh[0], "admin");
  fresh[0].mustChangePassword = true;
  f.ctx.showChangePasswordModal = () => f.calls.modal.push("modal-change-password");
  r = await f.login("admin", "admin");
  assert.equal(r.user && r.user.username, "admin");
  assert.ok(f.calls.modal.includes("modal-change-password"), "default password opens the change-password dialog");
  console.log("auth-tests.js: all tests passed");
}

run().catch(err => { console.error("auth-tests.js FAILED:", err); process.exit(1); });
