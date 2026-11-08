/* ==========================================================================
   TÍNH LƯƠNG, BẢO HIỂM, THUẾ TNCN (pure, no DOM) — yêu cầu E1–E7
   Tham số lấy từ js/core/tax-rules.js theo NGÀY CHI TRẢ; số tiền làm tròn đến đồng.
   ========================================================================== */

function payrollRule(key, date) {
  const fn = typeof getTaxRule === "function" ? getTaxRule : require("./tax-rules.js").getTaxRule;
  const rule = fn(key, date);
  return rule ? rule.value : null;
}

function payrollIsTT99(std) {
  const fn = typeof isTT99Family === "function" ? isTT99Family : require("./chart-of-accounts.js").isTT99Family;
  return fn(std);
}

// Thuế lũy tiến từng phần. months = 12 khi quyết toán năm (ngưỡng bậc × 12).
function computePit(taxable, payDate, months = 1) {
  const brackets = payrollRule("pit.brackets", payDate) || [];
  let tax = 0, lower = 0;
  for (const b of brackets) {
    const upper = b.upTo == null ? Infinity : b.upTo * months;
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * b.rate / 100;
    lower = upper;
  }
  return Math.round(tax);
}

function computeInsurance(insSalary, region, date, opts = {}) {
  const rates = payrollRule("ins.rates", date);
  const caps = payrollRule("ins.caps", date) || {};
  // shortcut: chưa có bảng lương tối thiểu vùng trước 2026 trong tax-rules → không sàn, không trần BHTN.
  const minWage = (payrollRule("ins.regionMinWage", date) || {})[region || "I"] || 0;
  const base = insSalary > 0 ? Math.max(Number(insSalary), minWage) : 0;
  const bhxhBase = Math.min(base, caps.bhxhBhyt || Infinity);
  const bhtnBase = opts.foreign ? 0 : Math.min(base, minWage ? minWage * caps.bhtnRegionMultiplier : Infinity);
  const pct = (b, r) => Math.round(b * r / 100);
  const employer = { bhxh: pct(bhxhBase, rates.employer.bhxh), bhyt: pct(bhxhBase, rates.employer.bhyt), bhtn: pct(bhtnBase, rates.employer.bhtn), kpcd: pct(bhxhBase, rates.employer.kpcd) };
  const employee = { bhxh: pct(bhxhBase, rates.employee.bhxh), bhyt: pct(bhxhBase, rates.employee.bhyt), bhtn: pct(bhtnBase, rates.employee.bhtn) };
  employer.total = employer.bhxh + employer.bhyt + employer.bhtn + employer.kpcd;
  employee.total = employee.bhxh + employee.bhyt + employee.bhtn;
  return { base, employer, employee };
}

// employee: { resident, foreign, casual, dependants, insSalary, region }; gross gồm cả phụ cấp miễn thuế.
function computePayslip(employee, { gross = 0, allowancesTaxFree = 0, payDate } = {}) {
  const emp = employee || {};
  gross = Number(gross) || 0;
  allowancesTaxFree = Math.min(Number(allowancesTaxFree) || 0, gross);
  const ins = emp.casual ? computeInsurance(0, emp.region, payDate) : computeInsurance(Number(emp.insSalary) || 0, emp.region, payDate, { foreign: !!emp.foreign });
  const r = { gross, allowancesTaxFree, ins, insEmployee: ins.employee.total, insEmployer: ins.employer.total, deductionSelf: 0, deductionDependants: 0, taxable: 0, pit: 0 };
  if (emp.casual) {
    // Thu nhập vãng lai: khấu trừ 10% trên tổng chi trả khi ≥ ngưỡng/lần (2 tr trước 01/7/2026, 5 tr từ 01/7/2026).
    const c = payrollRule("pit.casualThreshold", payDate);
    r.taxable = gross - allowancesTaxFree;
    r.pit = r.taxable >= c.threshold ? Math.round(r.taxable * c.rate / 100) : 0;
  } else if (emp.resident === false) {
    // Không cư trú: 20% trên thu nhập chịu thuế, không giảm trừ (Luật 109/2025 chưa xác minh — giữ mức cũ).
    r.taxable = gross - allowancesTaxFree;
    r.pit = Math.round(r.taxable * 0.2);
  } else {
    const d = payrollRule("pit.deductions", payDate);
    r.deductionSelf = d.self;
    r.deductionDependants = (Number(emp.dependants) || 0) * d.dependent;
    r.taxable = Math.max(0, gross - allowancesTaxFree - r.insEmployee - r.deductionSelf - r.deductionDependants);
    r.pit = computePit(r.taxable, payDate);
  }
  r.net = gross - r.insEmployee - r.pit;
  return r;
}

// payroll.lines: [{ dept, gross, ins: {employer, employee}, pit }] (đã tính bằng computePayslip).
function buildPayrollEntries(payroll, std) {
  const tt99 = payrollIsTT99(std);
  const bhtn = tt99 ? "3386" : "3385";
  const sums = {};
  const add = (debit, credit, amount, desc) => {
    const k = debit + "|" + credit;
    sums[k] = sums[k] || { debit, credit, amount: 0, desc };
    sums[k].amount += Number(amount) || 0;
  };
  ((payroll && payroll.lines) || []).forEach(l => {
    const exp = tt99 && l.dept === "sales" ? "641" : "642";
    const er = (l.ins && l.ins.employer) || {}, ee = (l.ins && l.ins.employee) || {};
    add(exp, "334", l.gross, "Tiền lương phải trả");
    add(exp, "3383", er.bhxh, "BHXH doanh nghiệp đóng");
    add(exp, "3384", er.bhyt, "BHYT doanh nghiệp đóng");
    add(exp, bhtn, er.bhtn, "BHTN doanh nghiệp đóng");
    add(exp, "3382", er.kpcd, "Kinh phí công đoàn");
    add("334", "3383", ee.bhxh, "BHXH trừ lương người lao động");
    add("334", "3384", ee.bhyt, "BHYT trừ lương người lao động");
    add("334", bhtn, ee.bhtn, "BHTN trừ lương người lao động");
    add("334", "3335", l.pit, "Thuế TNCN khấu trừ");
  });
  return Object.values(sums).filter(e => e.amount > 0);
}

// Quyết toán năm thay người lao động: tính lại cả năm theo biểu năm (bậc × 12), giảm trừ 12 tháng.
// shortcut: số người phụ thuộc lấy theo hồ sơ hiện tại cho cả 12 tháng; cần nhập theo tháng đăng ký nếu thay đổi giữa năm.
function computeAnnualSettlement(employee, lines, year) {
  const sum = k => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  const r = { gross: sum("gross"), allowancesTaxFree: sum("allowancesTaxFree"), insEmployee: sum("insEmployee"), withheld: sum("pit") };
  const eligible = employee && employee.resident !== false && !employee.casual;
  if (!eligible) return { ...r, eligible: false, taxable: r.gross - r.allowancesTaxFree, pitDue: r.withheld, diff: 0 };
  const d = payrollRule("pit.deductions", `${year}-12-31`);
  r.deduction = 12 * (d.self + (Number(employee.dependants) || 0) * d.dependent);
  r.taxable = Math.max(0, r.gross - r.allowancesTaxFree - r.insEmployee - r.deduction);
  r.pitDue = computePit(r.taxable, `${year}-12-31`, 12);
  r.diff = r.pitDue - r.withheld; // > 0 nộp thêm, < 0 nộp thừa
  return { ...r, eligible: true };
}

const PAYROLL_CALC_API = { computePit, computeInsurance, computePayslip, buildPayrollEntries, computeAnnualSettlement };
if (typeof window !== "undefined") Object.assign(window, PAYROLL_CALC_API);
if (typeof module !== "undefined" && module.exports) module.exports = PAYROLL_CALC_API;
