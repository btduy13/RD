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

test("cleanNumericUnitProducts is not invoked on renderer init", () => {
  const stateSrc = read("js/state.js");
  assert.ok(!/cleanNumericUnitProducts\s*\(\s*\)\s*;/.test(stateSrc.replace(/\/\/.*$/gm, "")), "state.js must not call cleanNumericUnitProducts on load");
});

test("renderer init does not delete junk-looking products", () => {
  const stateSrc = read("js/state.js").replace(/\/\/.*$/gm, "");
  assert.ok(!/ProductCaseDedupe\.cleanGarbageProducts\s*\(/.test(stateSrc), "state.js must not call cleanGarbageProducts on load");
});

test("partner type migration stamps _updatedAt/_sessionId so it syncs", () => {
  const src = read("js/state.js");
  const start = src.indexOf("// Di chuyển loại đối tác");
  const end = src.indexOf("// Preserve orphan openings", start);
  assert.ok(start > 0 && end > start, "partner migration block not found");
  const state = makeState();
  const sandbox = { state, saved: 0, saveState() { sandbox.saved++; }, setTimeout: fn => fn(), clientSessionId: "S1", console };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  const p = state.partners[0];
  assert.strictEqual(p.type, "retail");
  assert.ok(p._updatedAt > 100, "_updatedAt must be bumped");
  assert.strictEqual(p._sessionId, "S1");
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.log("FAIL", t.name, "\n  ", e.message.split("\n")[0]); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
