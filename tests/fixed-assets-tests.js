const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Nạp module trong sandbox với các hàm app được giả lập (không DOM).
const toasts = [];
let saves = 0;
const sandbox = {
  console, Date, JSON, Math, Number, String, Array, Object, Set, Map, Promise,
  state: { accountingStandard: "TT200", vouchers: [], fixedAssets: [], deletedIds: [] },
  document: { getElementById: () => null },
  escapeHtmlText: s => String(s), escapeHtmlAttr: s => String(s), formatVNDNoSymbol: String, formatDateDisplay: String,
  getLocalDateString: () => "2026-11-10",
  showToast: (msg, type) => toasts.push([type, msg]),
  saveState() {}, recalculateAccounting() {},
  saveStateAndSyncVoucher: async () => { saves++; return true; },
  trackDeletedIds(ids) { sandbox.state.deletedIds.push(...ids); },
  isTT99Family: std => std === "TT200" || std === "TT99"
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const file = path.join(__dirname, "..", "js", "modules", "fixed-assets.js");
vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
const { faSchedule, faBookValue, faWarnings, faCandidateLines, faDraftFromLines, postFixedAssetDepreciation } = sandbox;
const state = sandbox.state;

(async () => {
  // --- Lịch khấu hao: đường thẳng, tháng cuối nhận phần dư ---
  let s = faSchedule({ cost: 100000000, months: 3, startDate: "2026-01" });
  assert.deepEqual(s.map(r => r.month), ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(s.map(r => r.amount), [33333333, 33333333, 33333334]);
  // Phần dư không bao giờ âm (round(1,5)=2 × 9 = 18 > 15 sẽ âm).
  s = faSchedule({ cost: 15, months: 10, startDate: "2026-01" });
  assert.equal(s.reduce((t, r) => t + r.amount, 0), 15);
  assert.ok(s.every(r => r.amount >= 0));
  // Bắt đầu giữa tháng (ngày 19/5): trích từ chính tháng 05, qua năm mới.
  s = faSchedule({ cost: 414700000, months: 72, startDate: "2025-06-11" });
  assert.equal(s[0].month, "2025-06");
  assert.equal(s[7].month, "2026-01");
  assert.equal(s[71].month, "2031-05");
  assert.equal(s.reduce((t, r) => t + r.amount, 0), 414700000);
  // Ghi giảm: thôi trích từ tháng sau tháng thanh lý.
  assert.equal(faSchedule({ cost: 120, months: 12, startDate: "2026-01", disposedDate: "2026-03-15" }).length, 3);

  // --- Lũy kế / còn lại ---
  const truck = { id: "TS001", name: "Xe tải", kind: "tscd", group: "vehicle", assetAccount: "211", expenseAccount: "6424", cost: 72000000, months: 72, startDate: "2026-01" };
  assert.deepEqual(faBookValue(truck, "2026-03-15"), { cost: 72000000, accumulated: 3000000, net: 69000000 });
  assert.equal(faBookValue(truck, "2025-12-31").accumulated, 0);
  assert.equal(faBookValue(truck, "2040-01-01").net, 0);

  // --- Cảnh báo ---
  assert.equal(faWarnings(truck).length, 0);
  assert.ok(faWarnings({ ...truck, cost: 25000000 }).some(w => w.includes("30 triệu")));
  assert.ok(faWarnings({ ...truck, months: 48 }).some(w => w.includes("6–10 năm")));
  assert.ok(faWarnings({ kind: "ccdc", assetAccount: "242", months: 48, cost: 10 }).some(w => w.includes("36 tháng")));

  // --- Nhận từ chứng từ: mua xe trả nhiều đợt → một tài sản ---
  state.vouchers = [
    { id: "PC1", type: "payment", date: "2025-05-19", entries: [{ debit: "211", credit: "111", amount: 85000000, desc: "Chi mua xe tải" }] },
    { id: "PC2", type: "payment", date: "2025-06-06", entries: [{ debit: "211", credit: "111", amount: 213000000, desc: "Chi mua xe tải đợt 2" }] },
    { id: "PC3", type: "payment", date: "2025-07-01", entries: [{ debit: "6422", credit: "111", amount: 5, desc: "khác" }] }
  ];
  let cands = faCandidateLines();
  assert.deepEqual(cands.map(c => c.voucherId), ["PC1", "PC2"]);
  const draft = faDraftFromLines(cands);
  assert.equal(draft.cost, 298000000);
  assert.equal(draft.startDate, "2025-06");
  assert.equal(draft.group, "vehicle");
  assert.equal(draft.expenseAccount, "6424");
  assert.deepEqual(draft.sourceVoucherIds, ["PC1", "PC2"]);
  state.fixedAssets = [{ id: "TS009", ...draft }];
  assert.equal(faCandidateLines().length, 0, "chứng từ đã gắn tài sản không còn trong danh sách");

  // --- Phiếu khấu hao tháng: một phiếu, idempotent ---
  state.vouchers = [];
  state.fixedAssets = [
    truck,
    { id: "CC001", name: "Máy tính", kind: "ccdc", group: "other", assetAccount: "242", expenseAccount: "6423", cost: 24000000, months: 24, startDate: "2026-02" },
    { id: "TS002", name: "Phần mềm", kind: "tscd", group: "other", assetAccount: "2135", expenseAccount: "6424", cost: 36000000, months: 36, startDate: "2026-03" }
  ];
  let res = await postFixedAssetDepreciation("2026-03");
  assert.equal(res.posted.length, 1);
  let deps = state.vouchers.filter(v => v.depMonth);
  assert.equal(deps.length, 1);
  const v = deps[0];
  assert.equal(v.type, "general_journal");
  assert.equal(v.date, "2026-03-31");
  assert.equal(v.id, "KH-2026-03");
  assert.deepEqual(v.entries.map(e => [e.debit, e.credit, e.amount]), [["6424", "2141", 1000000], ["6423", "242", 1000000], ["6424", "2143", 1000000]]);
  assert.equal(v.amount, 3000000);
  // Chạy lại sau khi sửa nguyên giá → thay phiếu cũ, giữ số phiếu.
  truck.cost = 144000000;
  await postFixedAssetDepreciation("2026-03");
  deps = state.vouchers.filter(x => x.depMonth);
  assert.equal(deps.length, 1);
  assert.equal(deps[0].id, "KH-2026-03");
  assert.equal(deps[0].entries[0].amount, 2000000);
  assert.ok(deps[0]._updatedAt > v._updatedAt || deps[0]._updatedAt >= Date.now() - 1000);

  // --- Trích bù: lập các tháng còn thiếu từ tháng bắt đầu sớm nhất ---
  res = await postFixedAssetDepreciation("2026-05", true);
  deps = state.vouchers.filter(x => x.depMonth).map(x => x.depMonth).sort();
  assert.deepEqual(deps, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
  assert.equal(res.posted.length, 4, "tháng 03 đã có phiếu → không lập lại khi trích bù");
  assert.equal(new Set(state.vouchers.map(x => x.id)).size, 5, "số phiếu không trùng");
  const jan = state.vouchers.find(x => x.depMonth === "2026-01");
  assert.deepEqual(jan.entries.map(e => e.assetId), ["TS001"], "tháng 01 chỉ có xe; CCDC bắt đầu tháng 02");

  // --- Phân bổ CCDC hết kỳ: tổng phân bổ = giá trị, sau đó không còn dòng ---
  const ccdc = state.fixedAssets[1];
  assert.equal(faSchedule(ccdc).reduce((t, r) => t + r.amount, 0), 24000000);
  assert.equal(faBookValue(ccdc, "2028-01-31").net, 0);

  // --- Tháng không còn số liệu: xóa phiếu cũ và ghi tombstone ---
  state.fixedAssets = [];
  res = await postFixedAssetDepreciation("2026-05");
  assert.equal(res.removed.length, 1);
  assert.ok(!state.vouchers.some(x => x.depMonth === "2026-05"));
  assert.ok(state.deletedIds.includes(res.removed[0]));

  // --- Phiếu PKT bản cũ cùng tháng: thay bằng KH-YYYY-MM, tombstone số cũ (hai máy không nhân đôi) ---
  state.fixedAssets = [truck];
  state.vouchers = [{ id: "PKT55", type: "general_journal", depMonth: "2026-04", date: "2026-04-30", entries: [], _updatedAt: 1 }];
  await postFixedAssetDepreciation("2026-04");
  assert.deepEqual(state.vouchers.filter(x => x.depMonth === "2026-04").map(x => x.id), ["KH-2026-04"]);
  assert.ok(state.deletedIds.includes("PKT55"));

  // --- TT133: TSCĐ vô hình 2113 ghi Có 2143 ---
  assert.equal(sandbox.faCreditAccount({ kind: "tscd", assetAccount: "2113" }), "2143");
  assert.equal(sandbox.faCreditAccount({ kind: "tscd", assetAccount: "2111" }), "2141");

  // --- Mã tài sản không phụ thuộc max cục bộ (hai máy không trùng) ---
  const ids = new Set(Array.from({ length: 50 }, () => sandbox.faNextId()));
  assert.equal(ids.size, 50);

  // --- Tài khoản chỉ xem bị chặn ---
  sandbox.currentUser = { role: "viewer" };
  const before = saves;
  res = await postFixedAssetDepreciation("2026-04");
  assert.equal(saves, before);
  assert.equal(res.posted.length, 0);
  delete sandbox.currentUser;

  console.log("fixed-assets-tests: all passed");
})().catch(err => { console.error(err); process.exit(1); });
