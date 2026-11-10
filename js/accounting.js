
// Tài khoản ký quỹ trên phiếu thu/chi lập tay đi theo chế độ kế toán hiện hành
// lúc ghi sổ (giống chứng từ escrow_*), không sửa dữ liệu đã lưu một lần cho xong:
// nhận ký quỹ (Có của phiếu thu) TT200 344 / TT133 3386,
// chi ký quỹ (Nợ của phiếu chi) TT200 244 / TT133 1386.
// Chỉ ánh xạ đúng vị trí form tạo ra (TT200 3386 bên Nợ phiếu chi là BHTN, giữ nguyên).
function mapCashDepositEntries(v, standard) {
  if (!v || !Array.isArray(v.entries)) return;
  // TT99 thay TT200 (giá trị lưu "TT200" vẫn là bí danh của TT99): cùng TK 244/344
  const isTT200 = isTT99Family(standard);
  const side = v.type === "receipt" ? "credit" : v.type === "payment" ? "debit" : "";
  if (!side) return;
  const map = v.type === "receipt"
    ? (isTT200 ? { "3386": "344" } : { "344": "3386" })
    : (isTT200 ? { "1386": "244" } : { "244": "1386" });
  let changed = false;
  const entries = v.entries.map(e => {
    const code = e && e[side] !== undefined && e[side] !== null ? String(e[side]).trim() : "";
    if (!map[code]) return e;
    changed = true;
    return { ...e, [side]: map[code] };
  });
  if (changed) v.entries = entries;
}

// Ngưỡng tiền mặt và tách thuế GTGT TT133 vào 1331 chỉ áp từ năm tài chính 2026 (TT99): kỳ trước đã khóa sổ, giữ số liệu cũ.
const NEW_VAT_RULES_FROM = "2026-01-01";

// Thuế tính vào giá kho (không được khấu trừ, hoặc TT133 trước 2026): mỗi dòng nhận đúng thuế của chính dòng đó
// (chi phí trực tiếp, không phân bổ — B3), dòng cuối nhận phần làm tròn để tổng bằng thuế chứng từ.
// Lưu item.vatInCost để calculateInventoryValueAt tính lại cùng số.
function allocateVatInCost(items, tax, defaultRate) {
  let left = tax;
  (items || []).forEach((item, i) => {
    if (!item) return;
    delete item.nonDeductibleVat; // tên trường cũ
    const own = item.vatRate !== undefined && item.vatRate !== null && item.vatRate !== "";
    const rate = Number(vatRateKey(own ? item.vatRate : defaultRate)) || 0;
    const share = !tax ? 0 : i === items.length - 1 ? left : Math.round((Number(item.amount) || 0) * rate / 100);
    left -= share;
    if (share) item.vatInCost = share; else delete item.vatInCost;
  });
}

// Ngưỡng thanh toán không dùng tiền mặt (C4): phiếu mua trả tiền mặt (111) có tổng thanh toán (gồm thuế)
// từ ngưỡng theo ngày chứng từ trở lên → thuế GTGT không được khấu trừ, không được trừ chi phí TNDN (NĐ 181 Đ26.1, Đ23.16).
function isCashOverVatThreshold(v, totalAmount) {
  if (String(v.paymentMethod ?? "").trim() !== "111" || typeof getTaxRule !== "function") return false;
  const rule = getTaxRule("vat.cashThreshold", v.date);
  return !!rule && totalAmount >= rule.value;
}

// 3. THUẬT TOÁN KẾ TOÁN CỐT LÕI (ENGINE)
// - Tính giá vốn bình quân gia quyền liên hoàn sau mỗi lần nhập hàng
// - Tự động tạo bút toán Nhật ký kép đồng bộ
// NĐ 181 Đ26.3: nhiều hóa đơn của cùng người bán trong cùng ngày, tổng từ ngưỡng → xét ngưỡng theo tổng.
// NCC vãng lai gộp nhiều người bán thật khác nhau → không cộng dồn, mỗi hóa đơn xét riêng.
const isWalkInSupplier = v => String(v.partnerId ?? "").trim() === "DT_VANGLAI" || /vãng lai/i.test(String(v.partnerName || ""));
const cashPurchaseDayKey = v => `${(!isWalkInSupplier(v) && String(v.partnerId ?? "").trim()) || "#" + v.id}|${v.date}`;

const NEGATIVE_STOCK_DESC = "Điều chỉnh giá vốn xuất kho âm";
// Lần nhập bù hết tồn âm: chênh lệch giá trị kho trước/sau khi đặt lại đơn giá ghi vào giá vốn (B2).
function negativeStockEntry(adjust) {
  return adjust > 0
    ? { debit: "632", credit: "156", amount: adjust, desc: NEGATIVE_STOCK_DESC }
    : { debit: "156", credit: "632", amount: -adjust, desc: NEGATIVE_STOCK_DESC };
}

// Kiểm kê (TT99 TK 152 điểm 3.13): thiếu trong định mức Nợ 632 / Có 156; chưa rõ nguyên nhân thiếu Nợ 1381 / Có 156,
// thừa Nợ 156 / Có 3381. Phiếu cũ (không có adjustCause) giữ cặp 632/711 như trước.
function inventoryAdjustEntry(v, dirIn, amount) {
  if (dirIn) return { debit: "156", credit: v.adjustCause ? "3381" : "711", amount, desc: v.description || "Điều chỉnh tăng tồn kho" };
  return { debit: v.adjustCause === "unknown" ? "1381" : "632", credit: "156", amount, desc: v.description || "Điều chỉnh giảm tồn kho" };
}

function recalculateAccounting(shouldSave = true) {
  // Đảm bảo di trú dữ liệu khi nạp/thay đổi trạng thái
  if (state.products) {
    state.products.forEach(p => {
      if (p.actualStock === undefined && p.initialStock !== undefined) {
        p.actualStock = p.initialStock;
      }
    });
  }
  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (v.isManual === undefined && v.isImported === undefined) {
        v.isImported = true;
      }
    });
  }

  // BƯỚC A: Reset lại danh mục sản phẩm về số dư đầu kỳ, sau đó chạy lần lượt các chứng từ theo thời gian.

  const productBalanceMap = {};

  // Tính lượng chênh lệch tồn kho từ các chứng từ nhập khẩu (isImported)
  const voucherChanges = {};
  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (v.isImported && v.items) {
        v.items.forEach(item => {
          if (!voucherChanges[item.productId]) {
            voucherChanges[item.productId] = { purchases: 0, sales: 0 };
          }
          if (v.type === "purchase") {
            voucherChanges[item.productId].purchases += (item.qty || 0);
          } else if (v.type === "sales_return") {
            // Bán trả lại → hàng về kho → cộng stock (giống purchase)
            voucherChanges[item.productId].purchases += (item.qty || 0);
          } else if (v.type === "purchase_return") {
            // Mua trả lại → xuất kho trả NCC → trừ stock (giống sales)
            voucherChanges[item.productId].sales += (item.qty || 0);
          } else if (v.type === "sales") {
            voucherChanges[item.productId].sales += (item.qty || 0);
          }
        });
      }
    });
  }

  // Số dư đầu kỳ chốt một lần trên chính sản phẩm (initialStock/initialCost); sản phẩm chưa chốt lấy stock/avgCost hiện có.
  state.products.forEach(p => {
    if (p.initialStock === undefined) {
      // Sản phẩm nhập từ Excel có actualStock: tính ngược tồn đầu kỳ để tồn cuối kỳ chính là actualStock
      const changes = voucherChanges[p.id] || { purchases: 0, sales: 0 };
      p.initialStock = p.actualStock !== undefined
        ? Number((p.actualStock - changes.purchases + changes.sales).toFixed(3))
        : Number((p.stock || 0).toFixed(3));
    }
    if (p.initialCost === undefined) p.initialCost = p.avgCost || 0;
    if (p.lastPurchasePrice === undefined && p.excelRow && p.excelRow[20] !== undefined) p.lastPurchasePrice = safeParseFloat(p.excelRow[20]);
    productBalanceMap[p.id] = stockOpening(p);
  });

  // BƯỚC B: Sắp xếp các chứng từ kế toán theo ngày hạch toán (Tối ưu hóa: So sánh chuỗi trực tiếp thay vì new Date())
  // Thứ tự xác định (ngày -> nhập trước xuất -> _createdAt -> id) để mọi máy tính ra cùng kết quả.
  state.vouchers.sort(compareVouchersForAccounting);

  // Tổng mọi hóa đơn mua của cùng người bán trong ngày (mọi hình thức thanh toán); chỉ hóa đơn trả 111 mất khấu trừ.
  const cashPurchaseDayTotals = new Map();
  state.vouchers.forEach(v => {
    if (v.type !== "purchase") return;
    const vat = computeVatBreakdown(v.items, v.taxRate || 0);
    const key = cashPurchaseDayKey(v);
    cashPurchaseDayTotals.set(key, (cashPurchaseDayTotals.get(key) || 0) + vat.subtotal + vat.tax);
  });
  // Kết chuyển cuối kỳ sinh ngay tại vị trí của nó (sau mọi chứng từ cùng ngày) từ số dư lũy kế.
  const closeLedger = createCloseLedger(state);

  // BƯỚC C: Duyệt qua từng chứng từ để tính giá vốn và tự động cập nhật Định khoản kép
  state.vouchers.forEach(v => {
    if (v.type === "purchase_order") {
      v.taxAmount = 0;
      v.totalAmount = v.items ? v.items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
      v.entries = [];
    } else if (v.type === "sales_quotation") {
      const subtotal = v.items ? v.items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
      const vat = computeVatBreakdown(v.items, v.taxRate || 0);
      v.vatBreakdown = vat.breakdown;
      v.taxAmount = vat.tax;
      v.totalAmount = subtotal + v.taxAmount;
      v.entries = [];
    } else if (v.type === "purchase") {
      // Mua hàng: Tăng số lượng và tăng giá trị tồn
      // Phiếu nhập thiếu hình thức thanh toán (vd. nhập Excel không khớp NCC) từng sinh bút toán thiếu vế Có
      // làm lệch Bảng cân đối phát sinh — mặc định ghi công nợ 331.
      if (!String(v.paymentMethod ?? "").trim()) v.paymentMethod = "331";
      const vat = computeVatBreakdown(v.items, v.taxRate || 0);
      const taxAmount = vat.tax;
      const modern = String(v.date || "") >= NEW_VAT_RULES_FROM;
      // Thuế KHÔNG được khấu trừ (trả tiền mặt từ ngưỡng, NĐ 181 Đ26) tính vào giá 156 — quyết định trước vòng lặp để cộng vào giá trị kho.
      const nonDeductible = modern && taxAmount > 0 && isCashOverVatThreshold(v, cashPurchaseDayTotals.get(cashPurchaseDayKey(v)) || 0);
      // Từ 2026 cả TT99 và TT133 đều tách thuế GTGT được khấu trừ vào 1331; chứng từ trước 2026 theo TT133 gộp thuế vào 156 như sổ cũ
      // — giá trị kho cũng gồm thuế đó để sổ 156 khớp kho (B4).
      const capitalizeVat = nonDeductible || (!modern && !isTT99Family(state.accountingStandard));
      allocateVatInCost(v.items, capitalizeVat ? taxAmount : 0, v.taxRate || 0);
      let itemSubtotal = 0, negAdjust = 0;
      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) negAdjust += applyStockItem(p, "purchase", item).adjust;
        itemSubtotal += item.amount;
      });

      // Tự động hạch toán mua hàng nhập kho:
      // Nợ TK 156: Giá mua hàng
      // Nợ TK 1331: Thuế GTGT đầu vào
      // Có TK 331 (Chưa thanh toán), TK 111 (Tiền mặt), TK 112 (Chuyển khoản)
      const totalAmount = itemSubtotal + taxAmount;

      v.vatBreakdown = vat.breakdown;
      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      if (nonDeductible) {
        v.vatNonDeductible = true;
        v.citNonDeductible = true;
      } else {
        delete v.vatNonDeductible;
        delete v.citNonDeductible;
      }
      v.entries = [
        { debit: "156", credit: v.paymentMethod, amount: capitalizeVat ? totalAmount : itemSubtotal, desc: `Nhập kho ${v.description || v.notes || v.id || ""}` },
      ];
      if (taxAmount > 0 && !capitalizeVat) {
        v.entries.push({ debit: "1331", credit: v.paymentMethod, amount: taxAmount, desc: "Thuế GTGT đầu vào được khấu trừ" });
      }
      if (negAdjust) v.entries.push(negativeStockEntry(negAdjust));

    } else if (v.type === "sales_return") {
      // Bán hàng trả lại:
      // 1. Cộng lại kho (stock +)
      // 2. Giảm trừ doanh thu (Nợ 5212 / TT133 Nợ 511)
      // 3. Giảm công nợ phải thu khách hàng (Có 131)
      let totalCogs = 0;
      let itemSubtotal = 0, negAdjust = 0;

      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          const r = applyStockItem(p, "sales_return", item);
          item.cogsUnit = r.unit;
          item.cogsAmount = r.value;
          totalCogs += r.value;
          negAdjust += r.adjust;
        }
        itemSubtotal += item.amount;
      });

      v.cogsAmount = totalCogs;
      const vatSR = computeVatBreakdown(v.items, v.taxRate || 0);
      const taxAmountSR = vatSR.tax;
      v.vatBreakdown = vatSR.breakdown;
      const totalAmountSR = itemSubtotal + taxAmountSR;
      v.taxAmount = taxAmountSR;
      v.totalAmount = totalAmountSR;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // Bút toán: Nợ 5212 (TT99 TK 521 chi tiết hàng bán bị trả lại; TT133 không có 521 nên ghi thẳng Nợ 511) / Có 131
      const creditAccSR = v.paymentMethod && v.paymentMethod !== "131" ? v.paymentMethod : "131";
      v.entries = [
        { debit: salesReturnAccount(state.accountingStandard), credit: creditAccSR, amount: itemSubtotal, desc: `Giảm doanh thu bán hàng trả lại: ${v.description || v.notes || v.id || ""}` }
      ];
      if (taxAmountSR > 0) {
        v.entries.push({ debit: "3331", credit: creditAccSR, amount: taxAmountSR, desc: "Giảm thuế GTGT đầu ra" });
      }
      // Nhập lại kho: Nợ 156 / Có 632
      if (totalCogs > 0) {
        v.entries.push({ debit: "156", credit: "632", amount: totalCogs, desc: `Nhập lại kho hàng bán trả lại: ${v.description || v.notes || v.id || ""}` });
      }
      if (negAdjust) v.entries.push(negativeStockEntry(negAdjust));

    } else if (v.type === "purchase_return") {
      // Mua hàng trả lại (xuất trả NCC):
      // 1. Giảm tồn kho (stock -)
      // 2. Giảm công nợ phải trả NCC (Nợ 331)
      // 3. Ghi giảm giá vốn hàng mua (Có 156)
      let totalCogs = 0;
      let itemSubtotal = 0;
      let returnCost = 0; // giá trị ghi giảm 156: giá vốn; dòng không có mã hàng trong kho thì theo giá trả
      const vatPR = computeVatBreakdown(v.items, v.taxRate || 0);
      const taxAmountPR = vatPR.tax;
      const modernPR = String(v.date || "") >= NEW_VAT_RULES_FROM;
      // Cùng ngưỡng tiền mặt như phiếu mua: thuế không được khấu trừ thì ghi giảm 156 (và giá trị kho), không ghi giảm 1331.
      // Trả lại theo hóa đơn gốc: theo đúng việc thuế của phiếu mua gốc có được khấu trừ hay không.
      const origNo = String(v.originalInvoiceNo ?? "").trim();
      const origPurchase = origNo ? state.vouchers.find(o => o.type === "purchase" && String(o.invoiceNo ?? "").trim() === origNo && (!v.partnerId || o.partnerId === v.partnerId)) : null;
      const nonDeductiblePR = modernPR && taxAmountPR > 0 && (origPurchase ? !!origPurchase.vatNonDeductible : isCashOverVatThreshold(v, vatPR.subtotal + taxAmountPR));
      const legacyTT133PR = !modernPR && !isTT99Family(state.accountingStandard);
      allocateVatInCost(v.items, nonDeductiblePR || legacyTT133PR ? taxAmountPR : 0, v.taxRate || 0);
      if (nonDeductiblePR) v.vatNonDeductible = true; else delete v.vatNonDeductible;

      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (!p) returnCost += item.amount;
        if (p) {
          // Xuất trả NCC → trừ kho theo giá vốn (và thuế đã tính vào giá kho)
          const r = applyStockItem(p, "purchase_return", item);
          item.cogsUnit = r.unit;
          item.cogsAmount = r.value;
          returnCost += r.value;
          totalCogs += r.value;
        }
        itemSubtotal += item.amount;
      });

      v.cogsAmount = totalCogs;
      v.vatBreakdown = vatPR.breakdown;
      const totalAmountPR = itemSubtotal + taxAmountPR;
      v.taxAmount = taxAmountPR;
      v.totalAmount = totalAmountPR;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // Bút toán mua trả lại:
      // Nợ 331 (hoặc TK thanh toán): giá trị trả + thuế GTGT — giảm công nợ đúng số trên hóa đơn điều chỉnh
      // Có 156: theo GIÁ VỐN đang ghi sổ (không theo giá trả) để kho khớp thẻ kho bình quân
      // Chênh lệch giá trả và giá vốn (thực hành VAS, hàng đã nhập kho theo giá bình quân):
      //   giá trả > giá vốn → Có 632 (giảm giá vốn); giá trả < giá vốn → Nợ 632 (tăng giá vốn).
      //   Chọn 632 thay vì 711/811 vì chênh lệch sinh ra từ giá bình quân, không phải thu nhập/chi phí khác.
      // Thuế GTGT: Có 1331 cho cả TT99 và TT133 (trước đây TT133 ghi Có 156 — sai).
      const creditAccPR = v.paymentMethod && v.paymentMethod !== "331" ? v.paymentMethod : "331";
      v.entries = [
        { debit: creditAccPR, credit: "156", amount: Math.min(itemSubtotal, returnCost), desc: `Xuất trả hàng NCC: ${v.description || v.notes || v.id || ""}` }
      ];
      if (itemSubtotal > returnCost) {
        v.entries.push({ debit: creditAccPR, credit: "632", amount: itemSubtotal - returnCost, desc: "Chênh lệch giá trả > giá vốn hàng trả lại" });
      } else if (returnCost > itemSubtotal) {
        v.entries.push({ debit: "632", credit: "156", amount: returnCost - itemSubtotal, desc: "Chênh lệch giá vốn > giá trả hàng trả lại" });
      }
      if (taxAmountPR > 0) {
        if (nonDeductiblePR) {
          v.entries.push({ debit: creditAccPR, credit: "156", amount: taxAmountPR, desc: "Giảm thuế GTGT không được khấu trừ trong giá hàng trả lại" });
        } else if (legacyTT133PR) {
          v.entries.push({ debit: creditAccPR, credit: "156", amount: taxAmountPR, desc: "Giảm thuế GTGT gộp trong giá hàng trả lại (TT133)" });
        } else {
          v.entries.push({ debit: creditAccPR, credit: "1331", amount: taxAmountPR, desc: "Giảm thuế GTGT đầu vào" });
        }
      }

    } else if (v.type === "sales") {
      // Bán hàng: Tính giá vốn xuất kho và giảm tồn kho
      let totalCogs = 0;
      let itemSubtotal = 0;

      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          // Lưu giá vốn bình quân tại thời điểm xuất kho vào chi tiết hóa đơn
          const r = applyStockItem(p, "sales", item);
          item.cogsUnit = r.unit;
          item.cogsAmount = r.value;
          totalCogs += r.value;
        }
        itemSubtotal += item.amount; // Doanh số bán chưa thuế
      });

      v.cogsAmount = totalCogs;
      const vat = computeVatBreakdown(v.items, v.taxRate || 0);
      const taxAmount = vat.tax;
      const totalAmount = itemSubtotal + taxAmount;

      v.vatBreakdown = vat.breakdown;
      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // Định khoản kép cho bán hàng (2 cặp bút toán song song):
      // Bút toán 1: Ghi nhận doanh thu
      // Nợ TK 111, 112, 131 / Có TK 511 (Doanh thu), Có TK 3331 (Thuế GTGT đầu ra)
      // Hóa đơn thiếu hình thức thanh toán (vd. nhập Excel không khớp khách hàng) từng sinh bút toán
      // thiếu vế Nợ làm lệch Bảng cân đối phát sinh — mặc định ghi công nợ 131.
      if (!String(v.paymentMethod ?? "").trim()) v.paymentMethod = "131";
      v.entries = [
        { debit: v.paymentMethod, credit: "511", amount: itemSubtotal, desc: `Doanh thu ${v.description || v.notes || v.id || ""}` }
      ];
      if (taxAmount > 0) {
        v.entries.push({ debit: v.paymentMethod, credit: "3331", amount: taxAmount, desc: "Thuế GTGT đầu ra phải nộp" });
      }

      // Bút toán 2: Ghi nhận giá vốn
      // Nợ TK 632 / Có TK 156
      if (totalCogs > 0) {
        v.entries.push({ debit: "632", credit: "156", amount: totalCogs, desc: `Giá vốn ${v.description || v.notes || v.id || ""}` });
      }

    } else if (v.type === "escrow_pay") {
      // Ký quỹ mang đi: Nợ TK 244 (hoặc 1386) / Có TK 111 hoặc 112
      const targetAcct = isTT99Family(state.accountingStandard) ? "244" : "1386";
      v.entries = [
        { debit: targetAcct, credit: v.paymentMethod, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_receive") {
      // Nhận ký quỹ đối tác: Nợ TK 111 hoặc 112 / Có TK 344 (hoặc 3386)
      const targetAcct = isTT99Family(state.accountingStandard) ? "344" : "3386";
      v.entries = [
        { debit: v.paymentMethod, credit: targetAcct, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_refund_pay") {
      // Thu hồi ký quỹ mang đi: Nợ TK 111 hoặc 112 / Có TK 244 (hoặc 1386)
      const targetAcct = isTT99Family(state.accountingStandard) ? "244" : "1386";
      v.entries = [
        { debit: v.paymentMethod, credit: targetAcct, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_refund_receive") {
      // Hoàn trả ký quỹ nhận về: Nợ TK 344 (hoặc 3386) / Có TK 111 hoặc 112
      const targetAcct = isTT99Family(state.accountingStandard) ? "344" : "3386";
      v.entries = [
        { debit: targetAcct, credit: v.paymentMethod, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "receipt") {
      // Phiếu Thu: Nợ TK 111 hoặc 112 / Có TK 131 (hoặc định khoản sẵn từ Excel)
      if (!v.entries || v.entries.length === 0) {
        v.entries = [
          { debit: v.paymentMethod || "111", credit: "131", amount: v.amount, desc: v.description }
        ];
      }
      mapCashDepositEntries(v, state.accountingStandard);
    } else if (v.type === "payment") {
      // Phiếu Chi: Nợ TK 331 (hoặc định khoản sẵn từ Excel) / Có TK 111 hoặc 112
      if (!v.entries || v.entries.length === 0) {
        v.entries = [
          { debit: "331", credit: v.paymentMethod || "111", amount: v.amount, desc: v.description }
        ];
      }
      mapCashDepositEntries(v, state.accountingStandard);
    } else if (v.type === "inventory_adjust") {
      // Điều chỉnh tồn kho: tăng/giảm số lượng theo đơn giá bình quân hiện tại (không đổi avgCost)
      let totalAmount = 0, negAdjust = 0;
      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (!p) return;
        const r = applyStockItem(p, "inventory_adjust", item);
        item.price = r.unit;
        item.amount = r.value;
        totalAmount += r.value;
        negAdjust += r.adjust;
        if (item.adjustDir !== "in") {
          item.cogsUnit = r.unit;
          item.cogsAmount = r.value;
        }
      });

      v.amount = totalAmount;
      v.totalAmount = totalAmount;
      // Giữ tài khoản đã lưu (phiếu cũ) nhưng số tiền luôn theo giá trị tính lại.
      const stored = (v.entries || []).filter(e => e && e.desc !== NEGATIVE_STOCK_DESC);
      const firstItem = (v.items || [])[0];
      if (!stored.length) v.entries = [inventoryAdjustEntry(v, !!firstItem && firstItem.adjustDir === "in", totalAmount)];
      // shortcut: phiếu nhiều bút toán (chỉ có từ dữ liệu ngoài) giữ nguyên số tiền — tách theo dòng khi có loại phiếu đó.
      else v.entries = stored.length === 1 ? [{ ...stored[0], amount: totalAmount }] : stored;
      if (negAdjust) v.entries.push(negativeStockEntry(negAdjust));
    } else if (v.type === "general_journal") {
      // Phiếu kế toán tổng hợp: giữ nguyên bút toán tay; TK không có trong danh mục của chế độ hiện hành
      // vẫn ghi sổ nhưng gắn cảnh báo để kế toán sửa (không tự đổi số liệu).
      if (!Array.isArray(v.entries)) v.entries = [];
      if (v.citProvision) {
        // Phiếu tạm tính thuế TNDN: TK chi phí thuế đổi theo chế độ (TT99 82111 / TT133 821).
        const [fromAcct, toAcct] = isTT99Family(state.accountingStandard) ? ["821", "82111"] : ["82111", "821"];
        const remap = code => String(code ?? "").trim() === fromAcct ? toAcct : code;
        v.entries = v.entries.map(e => e ? { ...e, debit: remap(e.debit), credit: remap(e.credit) } : e);
      }
      const invalid = new Set();
      v.entries.forEach(e => {
        if (!e) return;
        [e.debit, e.credit].forEach(code => { if (!isValidAccount(code, state.accountingStandard)) invalid.add(String(code ?? "").trim()); });
      });
      if (invalid.size) v.accountWarnings = [...invalid].map(code => `TK ${code || "(trống)"} không có trong danh mục tài khoản`);
      else delete v.accountWarnings;
    } else if (v.type === "payroll") {
      // Bảng lương: sinh lại từ bảng lương gốc theo chế độ hiện hành (TK BHTN/641 khác nhau); không có bảng lương thì giữ bút toán đã lưu.
      const payroll = v.payrollId && typeof buildPayrollEntries === "function" && (state.payrolls || []).find(x => x && x.id === v.payrollId);
      if (payroll) v.entries = buildPayrollEntries(payroll, state.accountingStandard);
      else if (!Array.isArray(v.entries)) v.entries = [];
    } else if (v.type === "period_close") {
      v.entries = closeLedger.close(v.periodFrom || "", v.periodTo || v.date || "");
    }
    closeLedger.post(v);
  });

  // BƯỚC C2 (Bug C): Suy diễn remainingDebt từ bút toán bằng phân bổ FIFO
  // partnerId chỉ được phân giải cục bộ để tính toán; KHÔNG ghi ngược vào chứng từ (dữ liệu đồng bộ).
  // Nếu một tên khớp nhiều đối tác thì không đoán, giữ nguyên partnerId gốc.
  const resolveVoucherPartnerIdForCalc = createVoucherPartnerResolver(state.partners);
  const openingRemaining = Object.create(null);
  const arQueues = Object.create(null);
  const apQueues = Object.create(null);
  const arAdvances = Object.create(null);
  const apAdvances = Object.create(null);
  (state.partners || []).forEach(p => {
    const op = (state.partnerOpeningBalances || {})[p.id];
    if (!op) return;
    const net = (Number(op.debit) || 0) - (Number(op.credit) || 0);
    // Opening amounts follow the same account/role as the partner ledger.
    openingRemaining[p.id] = p.type === 'supplier'
      ? { debit: 0, credit: Math.max(-net, 0) }
      : { debit: Math.max(net, 0), credit: 0 };
    queueOf(p.type === 'supplier' ? apAdvances : arAdvances, p.id).list.push({ remaining: Math.max(p.type === 'supplier' ? net : -net, 0) });
  });
  // FIFO theo đối tác; head bỏ qua phần đã tất toán để một đối tác hàng chục nghìn chứng từ vẫn O(n).
  function queueOf(map, pid) { return map[pid] || (map[pid] = { list: [], head: 0 }); }
  const settleFifo = (q, amount) => {
    let left = amount;
    while (left > 0 && q.head < q.list.length) {
      const x = q.list[q.head];
      if (x.remaining > 0) {
        const used = Math.min(x.remaining, left);
        x.remaining -= used;
        left -= used;
        if (x.v) x.v.remainingDebt = x.isAdvance ? -x.remaining : x.remaining;
      }
      if (x.remaining <= 0) q.head++;
    }
    return left;
  };
  const consumeAdvance = (pool, pid, amount) => amount - settleFifo(queueOf(pool, pid), amount);

  // Task 5 (giống debts.js computeDebtSides): phiếu chi Nợ 331 cho đối tác vai trò KHÁCH
  // (không khai báo supplier/both, không có phát sinh 331 thật) được đọc là Nợ 131.
  // Chi tiền cho khách (Nợ 131) chỉ dùng hết khoản khách trả thừa/trả trước, KHÔNG tất toán hóa đơn.
  const partnerTypeById = Object.create(null);
  (state.partners || []).forEach(p => { if (p) partnerTypeById[p.id] = p.type; });
  const genuine331Pids = new Set();
  state.vouchers.forEach(v => {
    if (!v.entries || v.entries.length === 0) return;
    const pid = resolveVoucherPartnerIdForCalc(v);
    if (!pid) return;
    if (v.entries.some(e => e && ((e.credit && String(e.credit).startsWith("331")) ||
      (v.type !== "payment" && e.debit && String(e.debit).startsWith("331"))))) genuine331Pids.add(pid);
  });
  const readsPayment331As131 = pid => pid && partnerTypeById[pid] !== undefined &&
    partnerTypeById[pid] !== "supplier" && partnerTypeById[pid] !== "both" && !genuine331Pids.has(pid);

  state.vouchers.forEach(v => {
    const isDebtType = (v.type === "sales" || v.type === "purchase" || v.type === "sales_return" || v.type === "purchase_return");
    if (!v.entries || v.entries.length === 0) {
      if (isDebtType) v.remainingDebt = 0;
      return;
    }

    const pid = resolveVoucherPartnerIdForCalc(v);
    let debit131 = 0, credit131 = 0, debit331 = 0, credit331 = 0;
    v.entries.forEach(e => {
      const amt = Number(e.amount) || 0;
      const dr = e.debit ? String(e.debit) : "";
      const cr = e.credit ? String(e.credit) : "";
      if (dr.startsWith("131")) debit131 += amt;
      if (cr.startsWith("131")) credit131 += amt;
      if (dr.startsWith("331")) debit331 += amt;
      if (cr.startsWith("331")) credit331 += amt;
    });

    if (isDebtType) v.remainingDebt = 0;

    if (v.type === "payment" && pid) {
      let refund131 = debit131;
      if (debit331 > 0 && readsPayment331As131(pid)) {
        refund131 += debit331;
        debit331 = 0;
      }
      if (refund131 > 0) consumeAdvance(arAdvances, pid, refund131);
    }

    if (v.type === "sales" && debit131 > 0) {
      const used = pid ? consumeAdvance(arAdvances, pid, debit131) : 0;
      const order = { v, remaining: debit131 - used };
      queueOf(arQueues, pid).list.push(order);
      v.remainingDebt = order.remaining;
    } else if (v.type === "purchase" && credit331 > 0) {
      const used = pid ? consumeAdvance(apAdvances, pid, credit331) : 0;
      const order = { v, remaining: credit331 - used };
      queueOf(apQueues, pid).list.push(order);
      v.remainingDebt = order.remaining;
    }

    if (pid && credit131 > 0 && v.type !== "sales") {
      let toAlloc = credit131;
      const op = openingRemaining[pid];
      if (op && op.debit > 0) {
        const used = Math.min(op.debit, toAlloc);
        op.debit -= used;
        toAlloc -= used;
      }
      toAlloc = settleFifo(queueOf(arQueues, pid), toAlloc);
      if (toAlloc > 0) queueOf(arAdvances, pid).list.push({ remaining: toAlloc, v: v.type === "sales_return" ? v : null, isAdvance: true });
      if (v.type === "sales_return") {
        v.remainingDebt = -toAlloc;
      }
    }

    if (pid && debit331 > 0 && v.type !== "purchase") {
      let toAlloc = debit331;
      const op = openingRemaining[pid];
      if (op && op.credit > 0) {
        const used = Math.min(op.credit, toAlloc);
        op.credit -= used;
        toAlloc -= used;
      }
      toAlloc = settleFifo(queueOf(apQueues, pid), toAlloc);
      if (toAlloc > 0) queueOf(apAdvances, pid).list.push({ remaining: toAlloc, v: v.type === "purchase_return" ? v : null, isAdvance: true });
      if (v.type === "purchase_return") {
        v.remainingDebt = -toAlloc;
      }
    }
  });

  state.vouchers.forEach(v => {
    if (v.type === "sales" || v.type === "purchase" || v.type === "sales_return" || v.type === "purchase_return") {
      const adj = Number(v.debtAdjustment) || 0;
      if (adj !== 0) {
        v.remainingDebt = (Number(v.remainingDebt) || 0) + adj;
      }
    }
  });

  // BƯỚC D: Cập nhật lại số liệu tồn kho cuối cùng vào State để hiển thị danh mục
  state.products.forEach(p => {
    const finalVal = productBalanceMap[p.id];
    if (finalVal) {
      p.stock = Number((finalVal.stock || 0).toFixed(3));
      p.avgCost = finalVal.avgCost;
      p.totalValue = finalVal.totalValue;
      p.lastPurchasePrice = finalVal.lastPurchasePrice;
    }
  });

  // Opening balances are entered data, never a side effect of recalculation.

  // Cập nhật lại cache sản phẩm & đối tác
  if (typeof cacheProductOptions === "function") {
    cacheProductOptions();
  }
  if (typeof updateExcelHubUI === "function") {
    updateExcelHubUI();
  }

  // Lưu lại và vẽ giao diện
  if (shouldSave) {
    saveState();
  }
  refreshUI();
}

// Call only after an explicit edit/import of partner opening balances.
function syncPartnerOpeningAccounts() {
  applyPartnerOpeningTotals(state);
}

// Chặn ghi chứng từ xuất làm tồn kho âm (B2); trả về true nếu đã chặn.
function blockNegativeStockIssue(voucher) {
  const ids = findNegativeStockProducts(state, voucher);
  if (!ids.length) return false;
  const names = ids.map(id => (state.products.find(p => String(p.id) === id) || {}).name || id).join(", ");
  showToast(`Không đủ tồn kho tại ngày ${voucher.date}: ${names}. Bổ sung phiếu nhập trước hoặc giảm số lượng xuất (Cài đặt cho phép tắt kiểm tra này).`, "danger");
  return true;
}

function salesReturnAccount(standard) {
  return isTT99Family(standard) ? "5212" : "511";
}

// Chặn thao tác chạm kỳ đã khóa sổ (next: bản mới khi thêm/sửa; prev: bản cũ hoặc mảng chứng từ khi sửa/xóa).
// Trả về true nếu đã chặn.
function blockLockedPeriodEdit(next, prev) {
  const hit = [next].concat(prev).find(v => isVoucherInLockedPeriod(state, v));
  if (!hit) return false;
  showToast(`Sổ kế toán đã khóa đến ngày ${formatDateDisplay(state.lockedThrough)}: không được thêm, sửa hoặc xóa chứng từ ngày ${formatDateDisplay(hit.date)} (Luật Kế toán Điều 26). Quản trị viên mở khóa trong Thiết lập.`, "danger");
  return true;
}

// Số dư đầu kỳ đứng trước mọi kỳ: khi đã khóa sổ, sửa nó làm đổi số liệu kỳ đã khóa.
// Không phải quản trị viên thì chặn; quản trị viên phải xác nhận. Trả về true nếu được sửa.
async function confirmOpeningBalanceEdit() {
  if (!state.lockedThrough) return true;
  if (!window.currentUser || window.currentUser.role !== "admin") {
    showToast(`Sổ kế toán đã khóa đến ngày ${formatDateDisplay(state.lockedThrough)}: chỉ quản trị viên được sửa số dư đầu kỳ.`, "danger");
    return false;
  }
  return !!(await showConfirmModal({
    title: "Sửa số dư đầu kỳ khi đã khóa sổ",
    message: `Sổ đã khóa đến ngày ${formatDateDisplay(state.lockedThrough)}. Sửa số dư đầu kỳ sẽ làm thay đổi số liệu các kỳ đã khóa. Vẫn sửa?`,
    confirmText: "Vẫn sửa", cancelText: "Hủy bỏ", type: "warning"
  }));
}

// Xóa chứng từ khỏi sổ cái
async function deleteVoucher(id) {
  if (window.assertCanWriteRole?.() === false) return;
  if (blockLockedPeriodEdit(null, state.vouchers.find(v => v.id === id))) return;
  const ok = await showConfirmModal({
    title: "Xác nhận xóa chứng từ",
    message: `Bạn có chắc chắn muốn xóa và hủy ghi sổ chứng từ "${id}"? Việc này sẽ tính toán lại toàn bộ giá trị tồn kho và công nợ.`,
    confirmText: "Xóa chứng từ",
    cancelText: "Hủy bỏ",
    type: "danger"
  });
  if (!ok) return;

  const removed = state.vouchers.filter(v => v.id === id);
  const unlinked = [];
  let deletionToken;
  let localSaved = false;
    try {
      deletionToken = trackDeletedIds([id], 'voucher');
      state.vouchers = state.vouchers.filter(v => v.id !== id);

      // Nếu có các khoản tất toán gắn liền với nó, xóa liên kết hoặc cảnh báo
      // Để an toàn, xóa các khoản tham chiếu
      state.vouchers.forEach(v => {
        if (v.escrowRefId === id) {
          unlinked.push(v);
          v.escrowRefId = null;
        }
      });

      // Reset any active editing voucher IDs if they match the deleted voucher
      if (typeof window.resetEditingSalesId === "function") {
        try {
          window.resetEditingSalesId();
        } catch (e) {
          console.error("Lỗi resetEditingSalesId khi xóa:", e);
        }
      }
      if (typeof window.resetEditingPurchaseIds === "function") {
        try {
          window.resetEditingPurchaseIds();
        } catch (e) {
          console.error("Lỗi resetEditingPurchaseIds khi xóa:", e);
        }
      }
      if (typeof window.resetEditingQuotationId === "function") {
        try {
          window.resetEditingQuotationId();
        } catch (e) {
          console.error("Lỗi resetEditingQuotationId khi xóa:", e);
        }
      }

      recalculateAccounting(false);
      const cloudCommitted = await saveStateAndSyncVoucher();
      localSaved = true;
      showToast(
        cloudCommitted ? `Đã xóa và đồng bộ chứng từ ${id} sang các máy trạm!` : `Đã xóa chứng từ ${id} trên máy này và đang chờ đồng bộ.`,
        cloudCommitted ? "success" : "warning"
      );
      refreshUI();
    } catch (err) {
      if (!localSaved) {
        const active = new Set(state.vouchers.map(v => v.id));
        state.vouchers.push(...removed.filter(v => !active.has(v.id)));
        unlinked.forEach(v => { if (state.vouchers.includes(v) && v.escrowRefId === null) v.escrowRefId = id; });
        if (typeof rollbackTrackedDeletedIds === "function") rollbackTrackedDeletedIds(deletionToken);
        recalculateAccounting(false);
      }
      console.error("Lỗi nghiêm trọng trong quá trình xóa chứng từ:", err);
      showToast(`Không thể hoàn tất thao tác xóa: ${err.message}`, "danger");
    }
}

// 13. CÁC HÀM TIỆN ÍCH DỮ LIỆU & QUỸ (UTILITIES)

// Số dư đúng mã tài khoản (không gồm TK con) đến ngày toDate, theo chiều số dư đầu kỳ khai báo.
function getAccountBalance(acctCode, toDate = "") {
  const code = String(acctCode);
  const { beforeNet, debit, credit } = sumAccountMovements(state, c => c === code, "", toDate);
  const net = beforeNet + debit - credit;
  return (getOpeningBalanceForAccount(state.initialBalances, code, state.accountingStandard).type === "credit" ? -net : net) || 0;
}
window.deleteVoucher = deleteVoucher;
