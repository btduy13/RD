// Auth: PBKDF2 password hashes, plaintext migration on login, no auto-register,
// forced password change for the default admin. Runs the real js/modules/auth.js in a vm.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");

function loadAuth(users) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { id, value: "", style: {}, innerHTML: "", textContent: "", addEventListener() {}, querySelector: () => null });
    return elements.get(id);
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    crypto: webcrypto, TextEncoder, btoa, atob, Uint8Array, Date, JSON, Number, String, Promise,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: el, querySelectorAll: () => [], body: { classList: { add() {}, remove() {} } } },
    state: { users },
    saves: 0,
    escapeHtmlText: v => String(v),
    showToast() {}
  };
  ctx.window = ctx;
  ctx.saveState = () => { ctx.saves++; };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "modules", "auth.js"), "utf8"), ctx);
  const login = async (username, password) => {
    el("login-username").value = username;
    el("login-password").value = password;
    el("login-error").textContent = "";
    await ctx.submitLogin({ preventDefault() {} });
  };
  return { ctx, el, login };
}

(async () => {
  {
    const { ctx } = loadAuth([]);
    const hash = await ctx.hashPassword("bí mật");
    const [scheme, iterations, salt] = hash.split("$");
    assert.strictEqual(scheme, "pbkdf2");
    assert.ok(Number(iterations) >= 100000, "at least 100k PBKDF2 iterations");
    assert.notStrictEqual(salt, (await ctx.hashPassword("bí mật")).split("$")[2], "random salt per hash");
    assert.strictEqual(await ctx.verifyUserPassword({ passwordHash: hash }, "bí mật"), true);
    assert.strictEqual(await ctx.verifyUserPassword({ passwordHash: hash }, "sai"), false);
  }

  {
    const legacy = { username: "ketoan", name: "KT", role: "accountant", password: "old-plain" };
    const { ctx, login } = loadAuth([legacy]);
    await login("KETOAN", "wrong");
    assert.strictEqual(ctx.currentUser, null, "wrong password rejected");
    assert.strictEqual(legacy.password, "old-plain", "no migration on a failed login");
    await login("ketoan", "old-plain");
    assert.strictEqual(ctx.currentUser && ctx.currentUser.username, "ketoan");
    assert.strictEqual(legacy.password, undefined, "plaintext removed after successful login");
    assert.ok(legacy.passwordHash.startsWith("pbkdf2$"), "migrated to PBKDF2");
    assert.strictEqual(await ctx.verifyUserPassword(legacy, "old-plain"), true);
  }

  {
    const { ctx, el, login } = loadAuth([{ username: "admin", name: "A", role: "admin", password: "x" }]);
    await login("nguoi-la", "");
    assert.strictEqual(ctx.currentUser, null, "unknown username is not logged in");
    assert.strictEqual(ctx.state.users.length, 1, "unknown username is not auto-registered");
    assert.ok(el("login-error").textContent.length > 0);
    await login("admin", "");
    assert.strictEqual(ctx.currentUser, null, "every account needs its password, admin included");
  }

  {
    const { ctx, el, login } = loadAuth([]);
    await ctx.initAuth();
    assert.strictEqual(ctx.state.users[0].mustChangePassword, true, "default admin must change password");
    await login("admin", "admin");
    assert.strictEqual(ctx.currentUser, null, "default admin/admin cannot enter before setting a new password");
    assert.ok(el("login-overlay").innerHTML.includes("forced-pwd-new"), "forced password change form shown");
  }

  {
    // Bản cũ tự tạo lại admin/admin không có cờ đổi mật khẩu: vẫn phải bắt đổi.
    const { ctx, el, login } = loadAuth([{ username: "admin", name: "A", role: "admin", password: "admin" }]);
    await login("admin", "admin");
    assert.strictEqual(ctx.currentUser, null, "legacy admin/admin must change password");
    assert.ok(el("login-overlay").innerHTML.includes("forced-pwd-new"));
  }

  {
    const { el, login } = loadAuth([{ username: "kho", name: "K", role: "accountant", password: "kho", mustChangePassword: true }]);
    await login("kho", "");
    assert.ok(el("login-error").textContent.includes("mật khẩu tạm là tên đăng nhập"), "temp-password hint shown");
  }

  {
    // Khôi phục dữ liệu (importData) thay state bằng bản cũ: migrateAuthUsers chạy ngay, không cần khởi động lại.
    const { ctx, el, login } = loadAuth([{ username: "admin", name: "A", role: "admin", password: "x" }]);
    ctx.state = { users: [{ username: "kho", name: "K", role: "accountant" }] };
    assert.strictEqual(ctx.migrateAuthUsers(), true);
    await login("kho", "kho");
    assert.ok(el("login-overlay").innerHTML.includes("forced-pwd-new"), "restored legacy user logs in with temp password, must change it");
    ctx.state = { users: [] };
    ctx.migrateAuthUsers();
    assert.strictEqual(ctx.state.users[0].username, "admin", "restore without accounts gets the default admin");
  }

  console.log("auth tests passed");
})().catch(err => { console.error(err); process.exit(1); });
