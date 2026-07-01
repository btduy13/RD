const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const syncPath = path.join(repoRoot, "js", "sync.js");
const uiFrameworkPath = path.join(repoRoot, "js", "ui-framework.js");
const syncSource = fs.readFileSync(syncPath, "utf8");
const uiFrameworkSource = fs.readFileSync(uiFrameworkPath, "utf8");

function loadSyncInternals() {
  const store = new Map();
  const elements = new Map();
  const localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Number,
    Map,
    Set,
    Error,
    localStorage,
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      }
    },
    window: null
  };
  sandbox.window = sandbox;
  sandbox.window.getComputedStyle = el => ({ display: el.style && el.style.display ? el.style.display : "none" });

  vm.createContext(sandbox);
  vm.runInContext(`var lastSyncedCloudTs = 0;\n${syncSource}`, sandbox, { filename: syncPath });

  assert.ok(sandbox.window.__syncInternals__, "sync internals should be exposed for regression tests");
  return { internals: sandbox.window.__syncInternals__, store, elements };
}

async function testDeepComparators() {
  const { internals } = loadSyncInternals();

  const voucherA = {
    id: "SO-1",
    type: "sale",
    items: [{ productId: "P1", qty: 1, price: 100, taxRate: 8, itemDesc: "old" }],
    entries: [{ debit: "131", credit: "511", amount: 100 }]
  };
  const voucherB = {
    entries: [{ credit: "511", amount: 100, debit: "131" }],
    items: [{ itemDesc: "old", taxRate: 8, price: 100, qty: 1, productId: "P1" }],
    type: "sale",
    id: "SO-1"
  };
  const voucherChanged = JSON.parse(JSON.stringify(voucherB));
  voucherChanged.items[0].taxRate = 10;

  assert.equal(internals.areVouchersEqual(voucherA, voucherB), true, "same voucher with reordered object keys should match");
  assert.equal(internals.areVouchersEqual(voucherA, voucherChanged), false, "voucher tax/detail changes must be detected");

  const productA = { id: "P1", name: "A", units: [{ name: "box", ratio: 10 }] };
  const productB = { id: "P1", name: "A", units: [{ name: "box", ratio: 12 }] };
  assert.equal(internals.areProductsEqual(productA, productB), false, "nested product changes must be detected");

  const partnerA = { id: "C1", name: "Customer", contacts: [{ phone: "1" }] };
  const partnerB = { id: "C1", name: "Customer", contacts: [{ phone: "2" }] };
  assert.equal(internals.arePartnersEqual(partnerA, partnerB), false, "nested partner changes must be detected");
}

async function testPullCheckpointStorage() {
  const { internals, store } = loadSyncInternals();

  internals.persistLastPulledCloudTs(12345);
  assert.equal(store.get("rd_accounting_last_pulled_cloud_ts"), "12345");
  assert.equal(internals.getStoredLastPulledCloudTs(), 12345);
  assert.equal(internals.getPullCheckpointTs(), 12345);

  internals.persistLastPulledCloudTs(0);
  assert.equal(store.has("rd_accounting_last_pulled_cloud_ts"), false, "zero checkpoint should clear stored pull marker");
}

async function testEntryModalDetection() {
  const { internals, elements } = loadSyncInternals();

  assert.equal(internals.isVoucherEntryModalOpen(), false);
  elements.set("modal-add-sales", { style: { display: "flex" } });
  assert.equal(internals.isVoucherEntryModalOpen(), true, "visible sales modal should defer cloud pull");
  elements.set("modal-add-sales", { style: { display: "none" } });
  assert.equal(internals.isVoucherEntryModalOpen(), false);
}

async function testRescueLookupIsBatchedAndExact() {
  const { internals } = loadSyncInternals();
  const keys = Array.from({ length: 405 }, (_, index) => `v_${index}`);
  const calls = [];

  const fakeClient = {
    from(table) {
      assert.equal(table, "rd_accounting_data");
      return {
        select(columns) {
          assert.equal(columns, "id");
          return {
            in(column, batch) {
              assert.equal(column, "id");
              calls.push(batch.slice());
              return Promise.resolve({
                data: batch.filter(id => id.endsWith("0")).map(id => ({ id })),
                error: null
              });
            }
          };
        }
      };
    }
  };

  const found = await internals.fetchExistingCloudIdsByKeysFromClient(fakeClient, keys);
  assert.equal(calls.length, 3, "405 keys should be fetched in 3 exact-key batches");
  assert.ok(calls.every(batch => batch.length <= 200), "rescue batches must stay within the configured size");
  assert.ok(found.has("v_0"));
  assert.ok(found.has("v_400"));
  assert.equal(found.has("v_401"), false);
}

async function testStaticSafetyChecks() {
  assert.ok(syncSource.includes("Cloud full pull reached pagination safety limit"));
  assert.ok(syncSource.includes("Cloud incremental pull reached pagination safety limit"));
  assert.ok(syncSource.includes("LAST_PULLED_CLOUD_TS_KEY"));
  assert.ok(!syncSource.includes("const { data: cloudRows"), "rescue must not use unpaginated full-table id select");
}

async function testBatchSelectionResetUI() {
  const match = uiFrameworkSource.match(/function resetBatchSelectionUI\([\s\S]*?\n}\n/);
  assert.ok(match, "resetBatchSelectionUI helper should exist");

  const rows = [
    { checked: true },
    { checked: true }
  ];
  const elements = new Map([
    ["check-all-sales", { checked: true }],
    ["btn-batch-delete-sales", { style: { display: "inline-flex" } }],
    ["selected-sales-count", { innerText: "2" }]
  ]);
  const sandbox = {
    document: {
      querySelectorAll(selector) {
        return selector === ".sale-checkbox" ? rows : [];
      },
      getElementById(id) {
        return elements.get(id) || null;
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(`${match[0]}; resetBatchSelectionUI({
    checkboxSelector: ".sale-checkbox",
    masterId: "check-all-sales",
    buttonId: "btn-batch-delete-sales",
    countId: "selected-sales-count"
  });`, sandbox, { filename: uiFrameworkPath });

  assert.deepEqual(rows.map(row => row.checked), [false, false], "row checkboxes should be cleared after batch delete");
  assert.equal(elements.get("check-all-sales").checked, false, "master checkbox should be cleared after batch delete");
  assert.equal(elements.get("btn-batch-delete-sales").style.display, "none", "batch delete button should be hidden after delete");
  assert.equal(elements.get("selected-sales-count").innerText, "0", "selected count should return to zero");
}

async function run() {
  await testDeepComparators();
  await testPullCheckpointStorage();
  await testEntryModalDetection();
  await testRescueLookupIsBatchedAndExact();
  await testStaticSafetyChecks();
  await testBatchSelectionResetUI();
  console.log("sync regression tests passed");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
