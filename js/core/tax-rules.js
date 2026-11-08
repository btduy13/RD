/* ==========================================================================
   BẢNG QUY TẮC THUẾ THEO NGÀY HIỆU LỰC (pure, no DOM) — yêu cầu A1
   Mỗi quy tắc: { key, value, from, to, ref }; from/to dạng "YYYY-MM-DD", null = không giới hạn.
   Căn cứ số liệu: reports/Luật thuế kế toán Việt Nam 2026.md (bản 07/11/2026).
   ========================================================================== */

const TAX_RULES = [
  // ---- Thuế GTGT ----
  { key: "vat.reduced8.window", value: { rate: 8, baseRate: 10, from: "2025-07-01", to: "2026-12-31" }, from: "2025-07-01", to: "2026-12-31",
    ref: "NĐ 174/2025/NĐ-CP Điều 1 (NQ 204/2025/QH15) — giảm 10% → 8% đến hết 31/12/2026, chưa thấy văn bản gia hạn" },
  // Hóa đơn mua vào tổng thanh toán (gồm thuế) từ ngưỡng trở lên phải thanh toán không dùng tiền mặt mới được khấu trừ
  { key: "vat.cashThreshold", value: 20000000, from: null, to: "2025-06-30",
    ref: "TT 219/2013/TT-BTC Điều 15 — từ 20 triệu đồng trở lên" },
  { key: "vat.cashThreshold", value: 5000000, from: "2025-07-01", to: null,
    ref: "NĐ 181/2025/NĐ-CP Điều 26; NĐ 320/2025 Điều 9.1.c (chi phí TNDN) — từ 05 triệu đồng trở lên đã gồm thuế" },

  // ---- Thuế TNDN ---- (doanh thu xét bậc = doanh thu năm trước liền kề; maxRevenue null = không giới hạn)
  { key: "cit.rateTiers", value: [{ maxRevenue: 3000000000, rate: 15 }, { maxRevenue: 50000000000, rate: 17 }, { maxRevenue: null, rate: 20 }],
    from: "2025-01-01", to: null,
    ref: "Luật Thuế TNDN 67/2025/QH15; NĐ 320/2025/NĐ-CP Điều 11 — ≤3 tỷ 15%, >3 đến 50 tỷ 17%, còn lại 20%" },
  { key: "cit.reduction30", value: { percent: 30, maxRevenue: 10000000000 }, from: "2026-01-01", to: "2027-12-31",
    ref: "NĐ 398/2026/NĐ-CP Điều 3 (NQ 43/2026/QH16) — giảm 30% thuế TNDN năm 2026, 2027 nếu doanh thu chính năm đó ≤ 10 tỷ" },

  // ---- Thuế TNCN (tra theo NGÀY CHI TRẢ; bậc tính theo tháng, upTo null = phần còn lại) ----
  { key: "pit.brackets", value: [
      { upTo: 5000000, rate: 5 }, { upTo: 10000000, rate: 10 }, { upTo: 18000000, rate: 15 }, { upTo: 32000000, rate: 20 },
      { upTo: 52000000, rate: 25 }, { upTo: 80000000, rate: 30 }, { upTo: null, rate: 35 }],
    from: null, to: "2025-12-31", ref: "Luật Thuế TNCN 04/2007/QH12 (sửa bởi Luật 26/2012/QH13) Điều 22 — biểu 7 bậc" },
  { key: "pit.brackets", value: [
      { upTo: 10000000, rate: 5 }, { upTo: 30000000, rate: 10 }, { upTo: 60000000, rate: 20 },
      { upTo: 100000000, rate: 30 }, { upTo: null, rate: 35 }],
    from: "2026-01-01", to: null, ref: "Luật Thuế TNCN 109/2025/QH15 Điều 9, Điều 29.2 — biểu 5 bậc từ kỳ tính thuế 2026" },
  { key: "pit.deductions", value: { self: 11000000, dependent: 4400000 }, from: null, to: "2025-12-31",
    ref: "NQ 954/2020/UBTVQH14" },
  { key: "pit.deductions", value: { self: 15500000, dependent: 6200000 }, from: "2026-01-01", to: null,
    ref: "NQ 110/2025/UBTVQH15" },
  { key: "pit.casualThreshold", value: { threshold: 2000000, rate: 10 }, from: null, to: "2026-06-30",
    ref: "TT 111/2013/TT-BTC Điều 25.1.i — khấu trừ 10% khoản chi từ 2 triệu đồng/lần" },
  { key: "pit.casualThreshold", value: { threshold: 5000000, rate: 10 }, from: "2026-07-01", to: null,
    ref: "NĐ 253/2026/NĐ-CP Điều 50.2 — khấu trừ 10% khoản chi từ 5 triệu đồng/lần" },

  // ---- Bảo hiểm (tỷ lệ %) ----
  { key: "ins.rates", value: { employer: { bhxh: 17.5, bhyt: 3, bhtn: 1, kpcd: 2 }, employee: { bhxh: 8, bhyt: 1.5, bhtn: 1 } },
    from: null, to: null,
    ref: "Luật BHXH 41/2024/QH15; Luật BHYT; Luật Việc làm; Luật Công đoàn — tổng 32% (+ KPCĐ 2%); lao động nước ngoài không đóng BHTN" },
  // Trần BHXH/BHYT = 20 × mức tham chiếu (lương cơ sở); trần BHTN = 20 × lương tối thiểu vùng (ins.regionMinWage)
  { key: "ins.caps", value: { bhxhBhyt: 46800000, bhtnRegionMultiplier: 20 }, from: null, to: "2026-06-30",
    ref: "NĐ 73/2024/NĐ-CP (lương cơ sở 2,34 triệu) × 20" },
  { key: "ins.caps", value: { bhxhBhyt: 50600000, bhtnRegionMultiplier: 20 }, from: "2026-07-01", to: null,
    ref: "NĐ 161/2026/NĐ-CP (lương cơ sở 2,53 triệu) × 20" },
  { key: "ins.regionMinWage", value: { I: 4960000, II: 4410000, III: 3860000, IV: 3450000 }, from: "2024-07-01", to: "2025-12-31",
    ref: "NĐ 74/2024/NĐ-CP" },
  { key: "ins.regionMinWage", value: { I: 5310000, II: 4730000, III: 4140000, IV: 3700000 }, from: "2026-01-01", to: "2026-12-31",
    ref: "NĐ 293/2025/NĐ-CP" },
  { key: "ins.regionMinWage", value: { I: 5700000, II: 5080000, III: 4450000, IV: 4040000 }, from: "2027-01-01", to: null,
    ref: "NĐ 399/2026/NĐ-CP" },

  // ---- Ngày nghỉ lễ (A4) — mỗi năm một quy tắc; chỉ liệt kê ngày nghỉ rơi vào ngày làm việc, kể cả ngày nghỉ bù.
  // Dùng để lùi hạn thuế (NĐ 252/2026 Đ3.7) nên theo lịch của cơ quan thuế = lịch công chức (gồm ngày hoán đổi).
  // Nguồn: research_notes/Luật thuế kế toán Việt Nam 2026/xac_minh_truoc_sua.md mục C.
  { key: "holidays", from: "2025-01-01", to: "2025-12-31", ref: "Bộ luật Lao động 2019 Điều 112; thông báo nghỉ lễ 2025",
    value: [
      { date: "2025-01-01", name: "Tết Dương lịch" },
      { date: "2025-01-27", name: "Tết Nguyên đán" }, { date: "2025-01-28", name: "Tết Nguyên đán" },
      { date: "2025-01-29", name: "Tết Nguyên đán (mùng 1)" }, { date: "2025-01-30", name: "Tết Nguyên đán" },
      { date: "2025-01-31", name: "Tết Nguyên đán" },
      { date: "2025-04-07", name: "Giỗ Tổ Hùng Vương (10/3 âm lịch)" },
      { date: "2025-04-30", name: "Ngày Chiến thắng" }, { date: "2025-05-01", name: "Quốc tế Lao động" },
      { date: "2025-09-01", name: "Quốc khánh (ngày liền kề)" }, { date: "2025-09-02", name: "Quốc khánh" }
    ] },
  { key: "holidays", from: "2026-01-01", to: "2026-12-31",
    ref: "BLLĐ 2019 Điều 112; NQ 28/2026/QH16 Điều 2 (24/11); lịch nghỉ công chức 2026 (Tết 14–22/02, Quốc khánh 29/8–02/9)",
    value: [
      { date: "2026-01-01", name: "Tết Dương lịch" },
      // Mùng 1 Tết Bính Ngọ = 17/02/2026; công chức nghỉ 14–22/02 (14–15, 21–22 là cuối tuần)
      { date: "2026-02-16", name: "Tết Nguyên đán" }, { date: "2026-02-17", name: "Tết Nguyên đán (mùng 1)" },
      { date: "2026-02-18", name: "Tết Nguyên đán" }, { date: "2026-02-19", name: "Tết Nguyên đán" },
      { date: "2026-02-20", name: "Tết Nguyên đán" },
      // 10/3 âm lịch = 26/04/2026 (Chủ nhật) → nghỉ bù thứ Hai 27/04
      { date: "2026-04-27", name: "Nghỉ bù Giỗ Tổ Hùng Vương" },
      { date: "2026-04-30", name: "Ngày Chiến thắng" }, { date: "2026-05-01", name: "Quốc tế Lao động" },
      // Công chức nghỉ 29/8–02/9, hoán đổi 31/8 sang làm thứ Bảy 22/8. computeDueDate luôn bỏ qua thứ Bảy:
      // hạn rơi vào 22/8 vẫn lùi sang 24/8 (có lợi cho người nộp thuế) — để nguyên.
      { date: "2026-08-31", name: "Nghỉ hoán đổi Quốc khánh (làm bù thứ Bảy 22/08)" },
      { date: "2026-09-01", name: "Quốc khánh (ngày liền kề)" }, { date: "2026-09-02", name: "Quốc khánh" },
      { date: "2026-11-24", name: "Ngày Văn hóa Việt Nam" }
    ] },
  { key: "holidays", from: "2027-01-01", to: "2027-12-31",
    ref: "BLLĐ 2019 Điều 112; NQ 28/2026/QH16 Điều 2; Bộ Nội vụ thông báo lịch nghỉ Tết, Quốc khánh 2027 (10/2026)",
    value: [
      { date: "2027-01-01", name: "Tết Dương lịch" },
      // Mùng 1 Tết Đinh Mùi = 06/02/2027 (thứ Bảy); công chức nghỉ 04–10/02 (6–7 là cuối tuần)
      { date: "2027-02-04", name: "Tết Nguyên đán" }, { date: "2027-02-05", name: "Tết Nguyên đán" },
      { date: "2027-02-08", name: "Tết Nguyên đán" }, { date: "2027-02-09", name: "Tết Nguyên đán" },
      { date: "2027-02-10", name: "Tết Nguyên đán" },
      { date: "2027-04-16", name: "Giỗ Tổ Hùng Vương (10/3 âm lịch — tính theo âm lịch, chưa có thông báo)" },
      { date: "2027-04-30", name: "Ngày Chiến thắng" },
      { date: "2027-05-03", name: "Nghỉ bù Quốc tế Lao động (01/5 là thứ Bảy)" },
      // Công chức nghỉ 02–05/9/2027 (thông báo Bộ Nội vụ) → ngày liền kề 03/9
      { date: "2027-09-02", name: "Quốc khánh" }, { date: "2027-09-03", name: "Quốc khánh (ngày liền kề)" },
      { date: "2027-11-24", name: "Ngày Văn hóa Việt Nam" }
    ] }
];

function toRuleDate(date) {
  if (date instanceof Date) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return String(date ?? "").slice(0, 10);
}

// Trả về quy tắc { key, value, from, to, ref } hiệu lực tại ngày (chuỗi "YYYY-MM-DD" hoặc Date), hoặc null.
function getTaxRule(key, date) {
  const d = toRuleDate(date);
  return TAX_RULES.find(r => r.key === key && (!r.from || r.from <= d) && (!r.to || d <= r.to)) || null;
}

const TAX_RULES_API = { TAX_RULES, getTaxRule };
if (typeof window !== "undefined") Object.assign(window, TAX_RULES_API);
if (typeof module !== "undefined" && module.exports) module.exports = TAX_RULES_API;
