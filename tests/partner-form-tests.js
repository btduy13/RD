// Partner add/edit form (handlePartnerSubmit) and code helpers, run on the real js/modules/partners.js in a vm sandbox.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

function loadPartners(partners, openings = {}) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: "", checked: false, style: {}, innerHTML: "", innerText: "", reset() {} });
    return elements.get(id);
  };
  const toasts = [];
  const ctx = {
    console, Date, JSON, Number, Math, Array, Object, String, Set, Map, RegExp,
    state: { partners, vouchers: [], partnerOpeningBalances: openings, partnerOpeningBalanceTs: {} },
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    window: { getComputedStyle: () => ({ display: "block" }) },
    showToast: (msg, kind) => toasts.push([kind, msg]),
    saveState() {}, initExcelIntegration() {}, closeModal() {}, filterPartners() {},
    invalidated: 0
  };
  ctx.window = Object.assign(ctx, ctx.window);
  ctx.invalidatePartnerCache = () => { ctx.invalidated++; };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, "js", "modules", "partners.js"), "utf8"), ctx, { filename: "partners.js" });
  ctx.findExistingPartner = v => ctx.state.partners.find(p => p.id === v || `${p.name} (${p.id})` === v) || null;
  ctx.trackDeletedIds = () => {};
  ctx.filterPartners = () => {}; // list rendering is not under test here
  el("modal-add-partner").style.display = "block";
  const submit = fields => {
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "boolean") el(k).checked = v; else el(k).value = v;
    }
    ctx.handlePartnerSubmit({ preventDefault() {} });
  };
  return { ctx, el, toasts, submit };
}

const base = { "partner-phone": "", "partner-address": "", "partner-taxcode": "", "partner-inactive": false, "partner-parent-search": "" };

function testEditKeepsLowercaseCodeAndExtraFields() {
  const { ctx, submit, toasts } = loadPartners([
    { id: "kh001", name: "Khách cũ", type: "retail", group: "VIP", excelRow: ["kh001"] },
    { id: "KH001X", name: "Khác", type: "retail" }
  ]);
  submit({ ...base, "edit-partner-index": "kh001", "partner-id": "KH001", "partner-name": "Khách cũ", "partner-phone": "0909",
    "partner-modal-type": "retail", "partner-edit-type-select": "retail" });
  const p = ctx.state.partners.find(x => x.name === "Khách cũ");
  assert.equal(p.id, "kh001", "upper-cased display of the same code is not a rename");
  assert.equal(p.phone, "0909");
  assert.equal(p.group, "VIP", "fields the form does not manage are kept");
  assert.ok(p._updatedAt > 0);
  assert.ok(ctx.invalidated > 0, "partner cache invalidated after an in-place edit");
  assert.ok(!toasts.some(t => t[0] === "danger"), JSON.stringify(toasts));
}

function testEditWithEmptyCodeKeepsCode() {
  const { ctx, submit } = loadPartners([{ id: "KH002", name: "B", type: "retail" }]);
  submit({ ...base, "edit-partner-index": "KH002", "partner-id": "", "partner-name": "B mới",
    "partner-modal-type": "retail", "partner-edit-type-select": "retail" });
  assert.deepEqual(ctx.state.partners.map(p => p.id), ["KH002"], "empty code field never saves id ''");
  assert.equal(ctx.state.partners[0].name, "B mới");
}

function testDuplicateCodeIsCaseInsensitive() {
  const { ctx, submit, toasts } = loadPartners([{ id: "kh003", name: "C", type: "retail" }]);
  submit({ ...base, "edit-partner-index": "-1", "partner-id": "KH003", "partner-name": "D", "partner-modal-type": "retail" });
  assert.equal(ctx.state.partners.length, 1, "KH003 is rejected when kh003 exists");
  assert.ok(toasts.some(t => t[0] === "danger" && t[1].includes("đã tồn tại")));
}

function testAutoCodesSkipTakenNumbers() {
  const { ctx } = loadPartners([{ id: "KL002", name: "x", type: "retail" }]);
  assert.equal(ctx.nextFreePartnerId("KL", 2), "KL003", "after a delete the counted number may be taken");
  assert.equal(ctx.partnerIdTaken(" kl002 "), true);
}

function testTypeChangeDropsParentAndKeepsBoth() {
  const { ctx, submit } = loadPartners([
    { id: "DN1", name: "Công ty 1", type: "enterprise" },
    { id: "CT1", name: "Công trình 1", type: "project", parentId: "DN1" },
    { id: "AB", name: "Hai chiều", type: "both" }
  ]);
  submit({ ...base, "edit-partner-index": "CT1", "partner-id": "CT1", "partner-name": "Công trình 1",
    "partner-modal-type": "retail", "partner-edit-type-select": "retail" });
  assert.ok(!("parentId" in ctx.state.partners.find(p => p.id === "CT1")), "retail partner has no parentId");
  submit({ ...base, "edit-partner-index": "AB", "partner-id": "AB", "partner-name": "Hai chiều",
    "partner-modal-type": "both", "partner-edit-type-select": "both" });
  assert.equal(ctx.state.partners.find(p => p.id === "AB").type, "both", "dual-role type survives an edit");
}

testEditKeepsLowercaseCodeAndExtraFields();
testEditWithEmptyCodeKeepsCode();
testDuplicateCodeIsCaseInsensitive();
testAutoCodesSkipTakenNumbers();
testTypeChangeDropsParentAndKeepsBoth();
console.log("partner-form-tests.js: all tests passed");
