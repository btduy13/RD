const assert = require("assert");
const { computeDueDate, buildTaxCalendar, lateInterest, lateFilingPenaltyTier } = require("../js/modules/tax-calendar.js");

// Lùi ngày: thứ Bảy/Chủ nhật/ngày lễ → ngày làm việc kế tiếp
assert.equal(computeDueDate("2026-10-31"), "2026-11-02"); // thứ Bảy → thứ Hai (Q3/2026)
assert.equal(computeDueDate("2026-12-20"), "2026-12-21"); // Chủ nhật (khớp NĐ 245: 21/12/2026)
assert.equal(computeDueDate("2026-11-24"), "2026-11-25"); // Ngày Văn hóa Việt Nam
assert.equal(computeDueDate("2026-04-30"), "2026-05-04"); // 30/4, 1/5 nghỉ, 2–3/5 cuối tuần
assert.equal(computeDueDate("2026-02-20"), "2026-02-23"); // Tết + cuối tuần
assert.equal(computeDueDate("2027-01-31"), "2027-02-01"); // Chủ nhật
assert.equal(computeDueDate("2026-08-29"), "2026-09-03"); // 29–30/8 cuối tuần, 31/8 hoán đổi, 1–2/9 Quốc khánh
assert.equal(computeDueDate("2027-02-04"), "2027-02-11"); // Tết Đinh Mùi công chức 04–10/02
assert.equal(computeDueDate("2027-04-16"), "2027-04-19"); // Giỗ Tổ 16/4/2027 (10/3 âm lịch), rồi cuối tuần
assert.equal(computeDueDate("2027-05-01"), "2027-05-04"); // 01/5 thứ Bảy → nghỉ bù 03/5
assert.equal(computeDueDate("2026-11-20"), "2026-11-20"); // ngày làm việc giữ nguyên

// Lịch năm 2026, mặc định khai quý
const cal = buildTaxCalendar(2026);
const find = label => cal.find(it => it.label === label);
assert.equal(find("Tờ khai GTGT quý 3/2026").dueDate, "2026-11-02");
assert.equal(find("Tờ khai GTGT quý 3/2026").rawDate, "2026-10-31");
assert.equal(find("Tờ khai GTGT quý 4/2026").dueDate, "2027-02-01");
assert.equal(find("Tờ khai GTGT quý 2/2026").extendedDue, "2026-11-02");
assert.equal(find("Tạm nộp TNDN quý 1/2026").dueDate, "2026-05-04"); // 30/4 lễ
// Tạm nộp TNDN: quý kết thúc trước 01/7/2026 hạn ngày 30 (Luật 38/2019), từ quý 3/2026 ngày cuối tháng
assert.equal(find("Tạm nộp TNDN quý 2/2026").rawDate, "2026-07-30");
assert.equal(find("Tạm nộp TNDN quý 3/2026").rawDate, "2026-10-31");
assert.equal(buildTaxCalendar(2025).find(it => it.label === "Tạm nộp TNDN quý 4/2025").rawDate, "2026-01-30");
assert.equal(find("Tờ khai GTGT quý 2/2026").rawDate, "2026-07-31"); // tờ khai quý vẫn ngày cuối tháng
assert.equal(find("Quyết toán TNDN năm 2026").dueDate, "2027-03-31");
assert.equal(find("Nộp BCTC năm 2026").dueDate, "2027-03-31");
assert.equal(find("Tờ khai 05/KK-TNCN quý 3/2026").dueDate, "2026-11-02");
assert.equal(cal.filter(it => it.tax === "GTGT").length, 4);
// Khai tháng: ngày 20 tháng sau, gia hạn NĐ 245
const monthly = buildTaxCalendar(2026, { vatPeriod: "month" });
const vat = p => monthly.find(it => it.tax === "GTGT" && it.period === p);
assert.equal(monthly.filter(it => it.tax === "GTGT").length, 12);
assert.equal(vat("2026-12").rawDate, "2027-01-20");
assert.equal(vat("2026-09").dueDate, "2026-10-20");
assert.equal(vat("2026-09").extendedDue, "2026-12-21");
assert.equal(vat("2026-05").extendedDue, "2026-11-20");
assert.equal(vat("2026-10").extendedDue, undefined);
assert.equal(vat("2026-05").dueDate, "2026-06-22"); // 20/6/2026 thứ Bảy
assert.ok(monthly.every((it, i) => i === 0 || monthly[i - 1].dueDate <= it.dueDate));

// Tiền chậm nộp 0,03%/ngày
assert.deepEqual(lateInterest(100000000, "2026-11-02", "2026-11-12"), { days: 10, interest: 300000 });
assert.deepEqual(lateInterest(100000000, "2026-11-02", "2026-11-12", 4), { days: 6, interest: 180000 });
assert.deepEqual(lateInterest(100000000, "2026-11-02", "2026-11-01"), { days: 0, interest: 0 });

// Khung phạt chậm nộp tờ khai
assert.equal(lateFilingPenaltyTier(0), null);
assert.deepEqual(lateFilingPenaltyTier(3), { min: 2e6, max: 5e6, warning: true, note: "Có tình tiết giảm nhẹ: phạt cảnh cáo" });
assert.equal(lateFilingPenaltyTier(30).max, 5e6);
assert.deepEqual([lateFilingPenaltyTier(31).min, lateFilingPenaltyTier(60).max], [5e6, 8e6]);
assert.deepEqual([lateFilingPenaltyTier(61).min, lateFilingPenaltyTier(90).max], [8e6, 15e6]);
assert.deepEqual([lateFilingPenaltyTier(91).min, lateFilingPenaltyTier(91).max], [15e6, 25e6]);
assert.deepEqual([lateFilingPenaltyTier(45, true).min, lateFilingPenaltyTier(45, true).max], [2.5e6, 4e6]);
// Quá 90 ngày, không phát sinh thuế phải nộp → 8–15 tr
assert.deepEqual([lateFilingPenaltyTier(91, false, false).min, lateFilingPenaltyTier(91, false, false).max], [8e6, 15e6]);
assert.deepEqual([lateFilingPenaltyTier(120, true, false).min, lateFilingPenaltyTier(120, true, true).max], [4e6, 12.5e6]);

// 02/01/2026 nghỉ hoán đổi
assert.equal(computeDueDate("2026-01-02"), "2026-01-05");
// BHXH: ngày cuối tháng sau; tháng 12/2026 → 31/01/2027 (Chủ nhật) lùi 01/02/2027
const bhxh = p => cal.find(it => it.tax === "BHXH" && it.period === p);
assert.equal(cal.filter(it => it.tax === "BHXH").length, 12);
assert.equal(bhxh("2026-10").dueDate, "2026-11-30");
assert.equal(bhxh("2026-12").rawDate, "2027-01-31");
assert.equal(bhxh("2026-12").dueDate, "2027-02-01");
// NĐ 141/2026: doanh thu năm trước ≤ 1 tỷ → không tạm nộp TNDN; quyết toán vẫn còn
const citQ = c => c.filter(it => it.tax === "TNDN" && /^Tạm nộp/.test(it.label)).length;
assert.equal(citQ(buildTaxCalendar(2026, { prevYearRevenue: { 2026: 1000000000 } })), 0);
assert.ok(buildTaxCalendar(2026, { prevYearRevenue: { 2026: 900000000 } }).some(it => it.label === "Quyết toán TNDN năm 2026"));
assert.equal(citQ(buildTaxCalendar(2026, { prevYearRevenue: { 2026: 1000000001 } })), 4);
assert.equal(citQ(buildTaxCalendar(2026, { prevYearRevenue: { 2027: 0 } })), 4); // chưa nhập năm 2026
assert.equal(citQ(buildTaxCalendar(2025, { prevYearRevenue: { 2025: 0 } })), 4); // trước 2026 không có miễn

console.log("tax-calendar-tests: all passed");
