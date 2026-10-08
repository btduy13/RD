// Startup data "cleanups" must not silently diverge stations (Task 6).
// Real source slices of main.js / js/state.js / js/excel-integration.js run in vm.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const clone = o => JSON.parse(JSON.stringify(o));
const { dedupeProductCatalogOnState, cleanGarbageProducts } = require("../js/core/product-case-dedupe.js");

function fnSource(src, name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, "function " + name + " not found");
  const j = src.indexOf("\nfunction ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

const MARK = "\n// Đăng ký";
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function makeState() {
  return {
    products: [
      { id: "sp01", name: "Thep", unit: "kg", initialStock: 10, _updatedAt: 100 },
      { id: "SP01", name: "Thep dup", unit: "kg", initialStock: 0, _updatedAt: 100 },
      { id: "PX123", name: "real product with junk-looking id", unit: "cai", _updatedAt: 100 },
      { id: "N1", name: "numeric unit", unit: "16500", _updatedAt: 100 }
    ],
    partners: [{ id: "KH1", name: "Khach", type: "customer", _updatedAt: 100 }],
    vouchers: [], deletedIds: [], deletedCloudKeys: []
  };
}

// Simulates main.js read-state-file: loads readStateFromSQLiteWithDedupe from real source with a fake SQLite read.
function mainLoad(diskState) {
  const src = read("main.js");
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    dedupeProductCatalogOnState, cleanGarbageProducts,
    saved: 0,
    readStateFromSQLite: () => clone(diskState),
    saveStateToSQLite() { sandbox.saved++; },
    backupSqliteBeforeProductDedupe() {},
    db: { prepare: () => ({ run() {} }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSource(src, "applyProductCaseDedupeInDatabase") + "\n" + fnSource(src, "readStateFromSQLiteWithDedupe").split(MARK)[0], sandbox);
  const loaded = sandbox.readStateFromSQLiteWithDedupe();
  return { loaded, sandbox };
}

test("main.js load path does not mutate or re-save products (restart == pre-restart state)", () => {
  const disk = makeState();
  const { loaded, sandbox } = mainLoad(disk);
  assert.deepStrictEqual(loaded, disk, "state after restart must equal state before restart");
  assert.strictEqual(sandbox.saved, 0, "load must not write back to SQLite");
});

test("legitimate product whose id looks like junk (PX123) survives load", () => {
  const { loaded } = mainLoad(makeState());
  assert.ok(loaded.products.some(p => p.id === "PX123"));
});

test("explicit dedupe functions remain available for db:dedupe-products", () => {
  const st = makeState();
  const r = dedupeProductCatalogOnState(st);
  assert.strictEqual(typeof cleanGarbageProducts, "function");
  assert.ok(r.changed, "explicit dedupe path still works");
  assert.ok(fs.readFileSync(path.join(ROOT, "package.json"), "utf8").includes("db:dedupe-products"));
});

// Runs the real js/state.js startup slice (product-catalog + partner normalisation) in a vm with real
// ProductCaseDedupe / dedupeProductCatalogCase available, so any on-load call to them would show up as a mutation.
function rendererInit(state, localStorageFlag) {
  const src = read("js/state.js");
  const start = src.indexOf("let _productCatalogChanged");
  const end = src.indexOf("// === ", start);
  assert.ok(start > 0 && end > start, "renderer init slice not found");
  const sandbox = {
    state, console: { log() {}, warn() {}, error() {} }, saved: 0, window: {}, clientSessionId: "S1",
    ProductCaseDedupe: require("../js/core/product-case-dedupe.js"),
    touchEntityUpdatedAt: e => { e._updatedAt = Date.now(); return e; },
    saveState() { sandbox.saved++; }, recalculateAccounting() {},
    localStorage: { getItem: () => localStorageFlag, setItem() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(read("js/core/product-identity.js").replace(/^const _pcd/m, "var _pcd"), sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  return sandbox;
}

test("renderer init leaves products unchanged (sp01/SP01, PX123, numeric unit survive; nothing saved)", () => {
  const st = makeState();
  const before = clone(st.products);
  const sb = rendererInit(st, "true");
  assert.deepStrictEqual(st.products, before);
  assert.strictEqual(sb.saved, 0);
});

test("customer->retail runs on every load, even with migration flag set, and is NOT stamped", () => {
  for (const flag of ["true", null]) {
    const st = makeState();
    rendererInit(st, flag);
    const p = st.partners[0];
    assert.strictEqual(p.type, "retail");
    assert.strictEqual(p._updatedAt, 100, "no _updatedAt stamp");
    assert.strictEqual(p._sessionId, undefined, "no _sessionId stamp");
  }
});

test("customer->retail normalisation is outside the flag-gated one-time migration block", () => {
  const src = read("js/state.js");
  const gate = src.indexOf("rd_migrations_279_done') !== 'true'");
  const norm = src.indexOf('p.type === "customer"');
  assert.ok(gate > 0 && norm > 0 && norm < gate);
  assert.strictEqual(src.split('p.type === "customer"').length - 1, 1);
});

// Source assertion (not behavioural): Excel import builds partners across ~11 deep UI-bound code paths that
// need a full workbook/DOM harness; asserting the literal keeps every creation site honest at low cost.
test("Excel import creates 'retail' (never 'customer') partner types", () => {
  const src = read("js/excel-integration.js");
  assert.ok(!/['"]customer['"]/.test(src), "excel-integration.js still assigns customer");
  assert.ok(/['"]retail['"]/.test(src));
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.log("FAIL", t.name, "\n  ", e.message.split("\n")[0]); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
