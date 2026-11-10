const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { computePit, computeInsurance, computePayslip, buildPayrollEntries, computeAnnualSettlement } = require("../js/core/payroll-calc.js");

// --- TNCN: biểu 5 bậc từ 2026 (công thức nhanh 20%T − 3,5 tr cho 30–60 tr) ---
assert.equal(computePit(40000000, "2026-03-31"), 4500000);
assert.equal(computePit(10000000, "2026-01-05"), 500000);
assert.equal(computePit(150000000, "2026-06-30"), 150000000 * 0.35 - 14500000);
// --- biểu 7 bậc trước 2026: 25%T − 3,25 tr cho 32–52 tr ---
assert.equal(computePit(40000000, "2025-12-31"), 6750000);
assert.equal(computePit(5000000, "2025-06-30"), 250000);
assert.equal(computePit(0, "2026-01-01"), 0);
// Biểu năm = bậc tháng × 12
assert.equal(computePit(12 * 40000000, "2026-12-31", 12), 12 * 4500000);

// --- Bảo hiểm: trần BHXH/BHYT theo ngày, trần BHTN 20 × lương tối thiểu vùng, sàn = lương tối thiểu vùng ---
let ins = computeInsurance(60000000, "I", "2026-03-15");
assert.deepEqual([ins.employee.bhxh, ins.employee.bhyt, ins.employee.bhtn], [3744000, 702000, 600000]); // 46,8 tr; BHTN 60 tr < 106,2 tr
assert.equal(ins.employer.kpcd, 936000);
ins = computeInsurance(60000000, "I", "2026-07-31");
assert.equal(ins.employee.bhxh, 4048000); // 8% × 50,6 tr
ins = computeInsurance(120000000, "IV", "2026-08-31");
assert.equal(ins.employee.bhtn, 740000); // 1% × 20 × 3,7 tr
assert.equal(ins.employer.bhtn, 740000);
ins = computeInsurance(3000000, "I", "2026-05-31");
assert.equal(ins.base, 5310000);
assert.equal(ins.employee.bhxh, 424800);
ins = computeInsurance(30000000, "I", "2026-05-31", { foreign: true });
assert.equal(ins.employee.bhtn + ins.employer.bhtn, 0);
assert.equal(ins.employee.total, 2850000);
assert.equal(computeInsurance(0, "I", "2026-05-31").employer.total, 0);

// --- Phiếu lương cư trú: 30 tr, 1 NPT, trả 31/07/2026 ---
// BH NLĐ 10,5% = 3.150.000; TNTT = 30 − 3,15 − 15,5 − 6,2 = 5,15 tr → thuế 5% = 257.500
const emp = { id: "NV1", resident: true, dependants: 1, insSalary: 30000000, region: "I", dept: "sales" };
let slip = computePayslip(emp, { gross: 30000000, payDate: "2026-07-31" });
assert.equal(slip.insEmployee, 3150000);
assert.equal(slip.insEmployer, 7050000); // 23,5%
assert.equal(slip.taxable, 5150000);
assert.equal(slip.pit, 257500);
assert.equal(slip.net, 26592500);
// Phụ cấp miễn thuế giảm thu nhập tính thuế
assert.equal(computePayslip(emp, { gross: 31000000, allowancesTaxFree: 1000000, payDate: "2026-07-31" }).pit, 257500);
// Cùng số liệu nhưng trả 31/12/2025 → giảm trừ cũ 11 + 4,4; biểu 7 bậc: TNTT 11,45 tr → 0,25 + 0,5 + 1,45×15% = 967.500
slip = computePayslip(emp, { gross: 30000000, payDate: "2025-12-31" });
assert.equal(slip.taxable, 11450000);
assert.equal(slip.pit, 967500);
// Không cư trú 20% toàn phần
assert.equal(computePayslip({ resident: false, insSalary: 0 }, { gross: 50000000, payDate: "2026-07-31" }).pit, 10000000);
// Vãng lai 10%: ngưỡng 2 tr trước 01/7/2026, 5 tr từ 01/7/2026
const casual = { casual: true };
assert.equal(computePayslip(casual, { gross: 3000000, payDate: "2026-06-15" }).pit, 300000);
assert.equal(computePayslip(casual, { gross: 3000000, payDate: "2026-07-15" }).pit, 0);
assert.equal(computePayslip(casual, { gross: 5000000, payDate: "2026-07-15" }).pit, 500000);
assert.equal(computePayslip(casual, { gross: 5000000, payDate: "2026-07-15" }).insEmployee, 0);
// Ngưỡng so trên TỔNG chi trả (gồm phụ cấp): 5,5 tr có 1 tr phụ cấp miễn thuế vẫn khấu trừ 10% × 4,5 tr
assert.equal(computePayslip(casual, { gross: 5500000, allowancesTaxFree: 1000000, payDate: "2026-07-15" }).pit, 450000);
// HĐLĐ 1 đến dưới 3 tháng: vẫn đóng BH (Luật BHXH 2024 Đ2.1.a), thuế 10%
slip = computePayslip({ shortContract: true, insSalary: 10000000, region: "I" }, { gross: 10000000, payDate: "2026-07-15" });
assert.equal(slip.insEmployee, 1050000);
assert.equal(slip.pit, 1000000);
assert.equal(computeAnnualSettlement({ shortContract: true }, [{ gross: 10, allowancesTaxFree: 0, pit: 1 }], 2026).eligible, false);
// Bảo hiểm tra theo THÁNG LƯƠNG: lương tháng 6/2026 trả 05/7 → trần 46,8 tr; thuế vẫn theo ngày trả
const rich = { resident: true, insSalary: 60000000, region: "I" };
assert.equal(computePayslip(rich, { gross: 60000000, payDate: "2026-07-05", period: "2026-06" }).ins.employee.bhxh, 3744000);
assert.equal(computePayslip(rich, { gross: 60000000, payDate: "2026-07-05" }).ins.employee.bhxh, 4048000); // không có period → theo ngày trả
// Lương tháng 12/2026 trả tháng 01/2027: sàn vẫn 5,31 tr (NĐ 293), không phải 5,7 tr
assert.equal(computePayslip({ insSalary: 3000000, region: "I" }, { gross: 3000000, payDate: "2027-01-10", period: "2026-12" }).ins.base, 5310000);
// Không trọn thời gian, lương dưới sàn: không nâng lên sàn, không đóng; trên sàn thì đóng bình thường
assert.equal(computeInsurance(3000000, "I", "2026-05-31", { partTime: true }).employee.total, 0);
assert.equal(computeInsurance(6000000, "I", "2026-05-31", { partTime: true }).base, 6000000);

// --- Bút toán: TT99 (lưu là "TT200") dùng 3386 và 641 cho bộ phận bán hàng; TT133 dùng 3385, chỉ 642 ---
const line = { employeeId: "NV1", dept: "sales", ...computePayslip(emp, { gross: 30000000, payDate: "2026-07-31" }) };
const line2 = { employeeId: "NV2", dept: "admin", ...computePayslip({ ...emp, dependants: 0 }, { gross: 20000000, payDate: "2026-07-31" }) };
const payroll = { lines: [line, line2] };
const sumBy = (entries, pred) => entries.filter(pred).reduce((s, e) => s + e.amount, 0);
for (const [std, bhtn, salesExp] of [["TT200", "3386", "641"], ["TT99", "3386", "641"], ["TT133", "3385", "642"]]) {
  const entries = buildPayrollEntries(payroll, std);
  assert.ok(entries.every(e => e.debit && e.credit && e.amount > 0));
  assert.ok(entries.some(e => e.credit === bhtn) && !entries.some(e => e.credit === (bhtn === "3386" ? "3385" : "3386")), std);
  assert.equal(sumBy(entries, e => e.debit === salesExp && e.credit === "334"), std === "TT133" ? 50000000 : 30000000, std);
  if (std === "TT133") assert.ok(!entries.some(e => e.debit === "641"));
  // TK 334 dư Có = thực lĩnh; chi phí = lương gộp + BH doanh nghiệp
  const net334 = sumBy(entries, e => e.credit === "334") - sumBy(entries, e => e.debit === "334");
  assert.equal(net334, line.net + line2.net);
  assert.equal(sumBy(entries, e => /^64/.test(e.debit)), 50000000 + line.insEmployer + line2.insEmployer);
  assert.equal(sumBy(entries, e => e.credit === "3335"), line.pit + line2.pit);
}

// --- Quyết toán năm: 12 tháng như nhau → thuế năm = tổng khấu trừ tháng ---
const months = Array.from({ length: 12 }, () => ({ ...line, allowancesTaxFree: 0 }));
let settle = computeAnnualSettlement(emp, months, 2026);
assert.equal(settle.pitDue, 12 * 257500);
assert.equal(settle.diff, 0);
// Khấu trừ nửa đầu năm theo biểu cũ cao hơn → nộp thừa (âm)
settle = computeAnnualSettlement(emp, months.map((l, i) => i < 6 ? { ...l, pit: 967500 } : l), 2026);
assert.equal(settle.diff, -6 * (967500 - 257500));
assert.equal(computeAnnualSettlement({ resident: false }, [{ gross: 10, allowancesTaxFree: 0, pit: 2 }], 2026).eligible, false);
// Người phụ thuộc theo tháng: 1 NPT chỉ 6 tháng đầu → giảm trừ 12 × 15,5 + 6 × 6,2 tr
settle = computeAnnualSettlement(emp, months.map((l, i) => i < 6 ? l : { ...l, deductionDependants: 0 }), 2026);
assert.equal(settle.deduction, 12 * 15500000 + 6 * 6200000);
// Dòng lương cũ không có deductionDependants → lấy hồ sơ hiện tại
assert.equal(computeAnnualSettlement(emp, [{ gross: 1, allowancesTaxFree: 0, pit: 0 }], 2026).deduction, 12 * 15500000 + 6200000);

// --- Đồng bộ cloud: employees/payrolls gộp theo từng phần tử và tôn trọng tombstone emp_/pay_ ---
const cloudSyncPath = path.join(__dirname, "..", "js", "cloud-sync.js");
const sandbox = {
  console, setTimeout, clearTimeout, Promise, Date, JSON, Number, Map, Set, Error,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { getElementById: () => null },
  state: { vouchers: [], products: [], partners: [], employees: [], payrolls: [], deletedIds: [], deletedCloudKeys: [], _lastModified: 0 },
  cloudSyncActive: false, cloudSyncSettings: { enabled: false }, saveStateSync: async () => {}
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`var lastSyncedCloudTs = 0;\nvar clientSessionId = "session-local";\n${fs.readFileSync(cloudSyncPath, "utf8")}`, sandbox, { filename: cloudSyncPath });
const { mergeStates } = sandbox.window.__cloudSyncInternals__;
const local = { _lastModified: 2000, vouchers: [], products: [], partners: [], employees: [{ id: "A", name: "A2", _updatedAt: 2000 }], payrolls: [{ id: "2026-10", _updatedAt: 100 }], taxSettings: { vatPeriod: "month" } };
const cloud = { _lastModified: 1500, vouchers: [], products: [], partners: [], employees: [{ id: "A", name: "A1", _updatedAt: 1000 }, { id: "B", name: "B", _updatedAt: 1500 }], payrolls: [{ id: "2026-10", _updatedAt: 100 }] };
let merged = mergeStates(local, cloud);
assert.deepEqual(merged.employees.map(e => e.id + ":" + e.name).sort(), ["A:A2", "B:B"]);
assert.equal(merged.payrolls.length, 1);
assert.equal(merged.taxSettings.vatPeriod, "month");
merged = mergeStates(local, { ...cloud, deletedCloudKeys: ["pay_2026-10"], _deletedCloudKeyTs: { "pay_2026-10": 1500 } });
assert.equal(merged.payrolls.length, 0, "cloud payroll tombstone must remove the stale local payroll");
sandbox.state.employees = [{ id: "X" }];
sandbox.trackDeletedIds(["X"], "employee");
assert.ok(sandbox.state.deletedCloudKeys.includes("emp_X"));

// --- taxSettings trong metadata: trạm cũ không biết khóa → không coi là xóa; vatInputs/prevYearRevenue gộp theo từng kỳ ---
const { cloudSyncMergeStatesCore } = sandbox.window.__cloudSyncInternals__;
const empty = { vouchers: [], products: [], partners: [], employees: [], payrolls: [] };
const base = { ...empty, taxSettings: { vatPeriod: "quarter", vatInputs: { "2026-Q1": { v22: 1 } }, prevYearRevenue: { 2026: 100 } }, _lastModified: 1000 };
const mergeWithBase = (l, c) => cloudSyncMergeStatesCore(l, c, { cloneWinners: true, cloneMetadata: true, baselineState: base }).state;
// Trạm cũ ghi metadata không có taxSettings (ts mới hơn) → giữ của máy này.
merged = mergeWithBase({ ...base }, { ...empty, companyName: "X", _lastModified: 3000, _cloudWatermark: 3000 });
assert.deepEqual(merged.taxSettings, base.taxSettings, "older station omitting taxSettings must not delete it");
// Hai máy nhập hai kỳ khác nhau cùng lúc → giữ cả hai.
const localTax = { ...base, taxSettings: { ...base.taxSettings, vatInputs: { ...base.taxSettings.vatInputs, "2026-Q2": { v22: 2 } } }, _lastModified: 2000 };
const cloudTax = { ...empty, taxSettings: { ...base.taxSettings, vatInputs: { ...base.taxSettings.vatInputs, "2026-Q3": { v22: 3 } }, prevYearRevenue: { 2026: 100, 2027: 500 } }, _lastModified: 3000, _cloudWatermark: 3000 };
merged = mergeWithBase(localTax, cloudTax);
assert.deepEqual(Object.keys(merged.taxSettings.vatInputs).sort(), ["2026-Q1", "2026-Q2", "2026-Q3"]);
assert.deepEqual(merged.taxSettings.prevYearRevenue, { 2026: 100, 2027: 500 });
assert.equal(merged.taxSettings.vatPeriod, "quarter");

console.log("payroll-tests: all passed");
