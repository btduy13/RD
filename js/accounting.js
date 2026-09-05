
// 3. THUẬT TOÁN KẾ TOÁN CỐT LÕI (ENGINE)
// - Tính giá vốn bình quân gia quyền liên hoàn sau mỗi lần nhập hàng
// - Tự động tạo bút toán Nhật ký kép đồng bộ
function recalculateAccounting(shouldSave = true, forceFullRecalc = false) {
  if (typeof shouldSkipFullRecalc === 'function' && shouldSkipFullRecalc(state, shouldSave, forceFullRecalc)) {
    return;
  }
  if (typeof invalidateAccounting === 'function') {
    invalidateAccounting(state);
  }
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
      // Tự động chuẩn hóa và làm sạch partnerId bị sai lệch hoặc lệch định dạng từ dữ liệu lịch sử.
      // Bug E fix: chỉ ghi đè partnerId khi khớp CHÍNH XÁC (ID hoặc tên chuẩn hóa).
      // Fuzzy substring match chỉ dành cho hiển thị, không sửa dữ liệu gốc (sync cloud).
      if (typeof getPartnerForVoucher === "function") {
        const resolvedP = getPartnerForVoucher(v, { strict: true });
        if (resolvedP && v.partnerId !== resolvedP.id) {
          v.partnerId = resolvedP.id;
        }
      }
    });
  }

  // BƯỚC A: Reset lại danh mục sản phẩm về trạng thái số dư đầu kỳ
  // Ta lấy số lượng tồn đầu kỳ và giá vốn đầu kỳ từ danh mục gốc trong data.js hoặc từ state
  // Ở đây, để đơn giản, ta xem dữ liệu ban đầu trong state.products là số dư đầu kỳ (trước khi phát sinh các voucher)
  // Nhưng để tính toán chuẩn xác, ta phải tính lại tồn kho bằng cách:
  // Lấy danh mục sản phẩm rỗng (hoặc chỉ giữ thông số khởi tạo đầu kỳ), sau đó chạy lần lượt các hóa đơn theo thời gian.

  // Lấy số dư đầu kỳ của hàng hóa từ sản phẩm gốc ban đầu
  const productBalanceMap = {};
  const originalProducts = DEFAULT_DATA.products;

  // Tối ưu hóa: Tạo map tra cứu O(1) thay vì dùng .find() trong vòng lặp O(N)
  const originalProductsMap = {};
  if (Array.isArray(originalProducts)) {
    originalProducts.forEach(o => {
      originalProductsMap[o.id] = o;
    });
  }

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

  // Đọc số lượng đầu kỳ của sản phẩm (nếu sản phẩm mới khai báo thì xem như tồn 0, đơn giá 0)
  state.products.forEach(p => {
    // Tìm thông số khởi tạo của sản phẩm này từ map tra cứu O(1)
    const orig = originalProductsMap[p.id];
    let initStock = p.initialStock !== undefined ? p.initialStock : (orig ? orig.stock : (p.stock || 0));
    initStock = Number((initStock || 0).toFixed(3));
    
    // Nếu sản phẩm được nhập từ Excel và có actualStock, ta tính ngược lại tồn đầu kỳ để tồn cuối kỳ chính là actualStock
    if (!orig && p.initialStock === undefined && p.actualStock !== undefined) {
      const changes = voucherChanges[p.id] || { purchases: 0, sales: 0 };
      initStock = Number((p.actualStock - changes.purchases + changes.sales).toFixed(3));
      p.initialStock = initStock;
    }

    const initCost = p.initialCost !== undefined ? p.initialCost : (orig ? orig.avgCost : (p.avgCost || 0));
    if (p.initialStock === undefined) p.initialStock = initStock;
    if (p.initialCost === undefined) p.initialCost = initCost;
    productBalanceMap[p.id] = {
      stock: initStock,
      avgCost: initCost,
      totalValue: initStock * initCost,
      lastPurchasePrice: p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : (p.excelRow && p.excelRow[20] !== undefined ? safeParseFloat(p.excelRow[20]) : initCost)
    };
  });

  // BƯỚC B: Sắp xếp các chứng từ kế toán theo ngày hạch toán (Tối ưu hóa: So sánh chuỗi trực tiếp thay vì new Date())
  state.vouchers.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });

  // BƯỚC C: Duyệt qua từng chứng từ để tính giá vốn và tự động cập nhật Định khoản kép
  state.vouchers.forEach(v => {
    if (v.type === "purchase_order") {
      v.taxAmount = 0;
      v.totalAmount = v.items ? v.items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
      v.entries = [];
    } else if (v.type === "sales_quotation") {
      const subtotal = v.items ? v.items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
      const taxRate = v.taxRate || 0;
      v.taxAmount = Math.round(subtotal * (taxRate / 100));
      v.totalAmount = subtotal + v.taxAmount;
      v.entries = [];
    } else if (v.type === "purchase") {
      // Mua hàng: Tăng số lượng và tăng giá trị tồn
      let itemSubtotal = 0;
      v.items.forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          const oldStock = p.stock;

          p.stock = Number((p.stock + item.qty).toFixed(3));
          p.totalValue += item.amount; // Thành tiền mua chưa thuế

          if (oldStock >= 0 && p.stock > 0) {
            p.avgCost = Math.round((p.totalValue / p.stock) * 100) / 100;
          } else if (p.stock > 0) {
            // Trước đó bị âm, nay dương trở lại: Đơn giá bình quân = đơn giá mua mới
            p.avgCost = item.price;
            p.totalValue = Math.round(p.stock * p.avgCost);
          } else {
            // Vẫn bị âm hoặc bằng 0: giữ nguyên đơn giá cũ
            if (!p.avgCost || p.avgCost <= 0) {
              p.avgCost = item.price;
            }
            p.totalValue = Math.round(p.stock * p.avgCost);
          }
          // Lưu đơn giá mua này làm đơn giá mua gần nhất
          p.lastPurchasePrice = item.price;
        }
        itemSubtotal += item.amount;
      });

      // Tự động hạch toán mua hàng nhập kho:
      // Nợ TK 156: Giá mua hàng
      // Nợ TK 1331: Thuế GTGT đầu vào
      // Có TK 331 (Chưa thanh toán), TK 111 (Tiền mặt), TK 112 (Chuyển khoản)
      const taxRate = v.taxRate || 0;
      const taxAmount = Math.round(itemSubtotal * (taxRate / 100));
      const totalAmount = itemSubtotal + taxAmount;

      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // TT133: thuế GTGT gộp vào giá hàng mua (cộng tax vào TK 156)
      const purchaseDebitAmount = (state.accountingStandard === "TT133") ? (itemSubtotal + taxAmount) : itemSubtotal;
      v.entries = [
        { debit: "156", credit: v.paymentMethod, amount: purchaseDebitAmount, desc: `Nhập kho ${v.description}` },
      ];
      // TT200: tách riêng TK 1331 cho thuế GTGT đầu vào
      if (taxAmount > 0 && state.accountingStandard !== "TT133") {
        v.entries.push({ debit: "1331", credit: v.paymentMethod, amount: taxAmount, desc: "Thuế GTGT đầu vào được khấu trừ" });
      }

    } else if (v.type === "sales_return") {
      // Bán hàng trả lại:
      // 1. Cộng lại kho (stock +)
      // 2. Giảm doanh thu (Nợ 511)
      // 3. Giảm công nợ phải thu khách hàng (Có 131)
      let totalCogs = 0;
      let itemSubtotal = 0;

      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          if (!p.avgCost || p.avgCost <= 0) p.avgCost = p.lastPurchasePrice || p.initialCost || 0;
          item.cogsUnit = p.avgCost;
          item.cogsAmount = Math.round(item.qty * p.avgCost);
          p.stock = Number((p.stock + item.qty).toFixed(3));
          p.totalValue += item.cogsAmount;
          // C3 Fix: Recalculate avgCost after restoring stock from sales return
          if (p.stock > 0) {
            p.avgCost = Math.round((p.totalValue / p.stock) * 100) / 100;
          }
          totalCogs += item.cogsAmount;
        }
        itemSubtotal += item.amount;
      });

      v.cogsAmount = totalCogs;
      const taxRateSR = v.taxRate || 0;
      const taxAmountSR = Math.round(itemSubtotal * (taxRateSR / 100));
      const totalAmountSR = itemSubtotal + taxAmountSR;
      v.taxAmount = taxAmountSR;
      v.totalAmount = totalAmountSR;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // Bút toán:
      // Nợ 511: Giảm doanh thu / Có 131: Giảm công nợ phải thu
      const creditAccSR = v.paymentMethod && v.paymentMethod !== "131" ? v.paymentMethod : "131";
      v.entries = [
        { debit: "511", credit: creditAccSR, amount: itemSubtotal, desc: `Giảm doanh thu bán hàng trả lại: ${v.description}` }
      ];
      if (taxAmountSR > 0) {
        v.entries.push({ debit: "3331", credit: creditAccSR, amount: taxAmountSR, desc: "Giảm thuế GTGT đầu ra" });
      }
      // Nhập lại kho: Nợ 156 / Có 632
      if (totalCogs > 0) {
        v.entries.push({ debit: "156", credit: "632", amount: totalCogs, desc: `Nhập lại kho hàng bán trả lại: ${v.description}` });
      }

    } else if (v.type === "purchase_return") {
      // Mua hàng trả lại (xuất trả NCC):
      // 1. Giảm tồn kho (stock -)
      // 2. Giảm công nợ phải trả NCC (Nợ 331)
      // 3. Ghi giảm giá vốn hàng mua (Có 156)
      let totalCogs = 0;
      let itemSubtotal = 0;

      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          if (!p.avgCost || p.avgCost <= 0) p.avgCost = p.lastPurchasePrice || p.initialCost || 0;
          item.cogsUnit = p.avgCost;
          item.cogsAmount = Math.round(item.qty * p.avgCost);
          // Xuất trả NCC → trừ kho (C1 Fix: không clamp Math.max(0) nữa)
          p.stock = Number((p.stock - item.qty).toFixed(3));
          p.totalValue -= item.cogsAmount;
          // Nếu stock <= 0 sau khi trả, reset totalValue để tránh drift
          if (p.stock <= 0) {
            p.totalValue = 0;
            if (!p.avgCost || p.avgCost <= 0) p.avgCost = p.lastPurchasePrice || item.price || 0;
          } else {
            p.avgCost = Math.round((p.totalValue / p.stock) * 100) / 100;
          }
          totalCogs += item.cogsAmount;
        }
        itemSubtotal += item.amount;
      });

      v.cogsAmount = totalCogs;
      const taxRatePR = v.taxRate || 0;
      const taxAmountPR = Math.round(itemSubtotal * (taxRatePR / 100));
      const totalAmountPR = itemSubtotal + taxAmountPR;
      v.taxAmount = taxAmountPR;
      v.totalAmount = totalAmountPR;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // Bút toán mua trả lại:
      // Nợ 331: Giảm công nợ phải trả NCC (theo giá trị trả — itemSubtotal)
      // Có 156: Giảm hàng tồn kho (theo giá vốn — totalCogs)
      const creditAccPR = v.paymentMethod && v.paymentMethod !== "331" ? v.paymentMethod : "331";
      // Entry chính: Nợ 331 / Có 156 theo giá trị trả (itemSubtotal) — tác động đúng đến công nợ
      v.entries = [
        { debit: creditAccPR, credit: "156", amount: itemSubtotal, desc: `Xuất trả hàng NCC: ${v.description}` }
      ];
      // Nếu giá vốn khác giá trị trả: ghi chênh lệch vào TK 711
      // C7 Fix: Ghi chênh lệch vào TK 632/711, không credit TK 156 lần thứ hai
      if (totalCogs > 0 && totalCogs !== itemSubtotal) {
        const diff = itemSubtotal - totalCogs;
        if (diff > 0) {
          v.entries.push({ debit: "632", credit: "711", amount: diff, desc: "Chênh lệch giá trả > giá vốn" });
        } else {
          v.entries.push({ debit: "632", credit: "711", amount: -diff, desc: "Chênh lệch giá vốn > giá trả" });
        }
      }
      // Thuế GTGT — chỉ TT200 mới tách riêng 1331
      if (taxAmountPR > 0) {
        if (state.accountingStandard === "TT133") {
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
          // Nếu chưa có đơn giá bình quân (bị 0), lấy đơn giá mua gần nhất hoặc đơn giá khởi tạo
          if (!p.avgCost || p.avgCost <= 0) {
            p.avgCost = p.lastPurchasePrice || p.initialCost || 0;
          }
          // Lưu giá vốn bình quân tại thời điểm xuất kho vào chi tiết hóa đơn
          item.cogsUnit = p.avgCost;
          item.cogsAmount = Math.round(item.qty * p.avgCost);

          // Trừ tồn kho (C2 Fix: nếu stock <= 0 thì reset totalValue)
          p.stock = Number((p.stock - item.qty).toFixed(3));
          p.totalValue -= item.cogsAmount;
          if (p.stock <= 0) {
            p.totalValue = 0;
          } else if (p.stock > 0) {
            p.avgCost = Math.round((p.totalValue / p.stock) * 100) / 100;
          }

          totalCogs += item.cogsAmount;
        }
        itemSubtotal += item.amount; // Doanh số bán chưa thuế
      });

      v.cogsAmount = totalCogs;
      const taxRate = v.taxRate || 0;
      const taxAmount = Math.round(itemSubtotal * (taxRate / 100));
      const totalAmount = itemSubtotal + taxAmount;

      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;
      // Bug C: remainingDebt suy diễn ở BƯỚC C2 (FIFO)

      // Định khoản kép cho bán hàng (2 cặp bút toán song song):
      // Bút toán 1: Ghi nhận doanh thu
      // Nợ TK 111, 112, 131 / Có TK 511 (Doanh thu), Có TK 3331 (Thuế GTGT đầu ra)
      v.entries = [
        { debit: v.paymentMethod, credit: "511", amount: itemSubtotal, desc: `Doanh thu ${v.description}` }
      ];
      if (taxAmount > 0) {
        v.entries.push({ debit: v.paymentMethod, credit: "3331", amount: taxAmount, desc: "Thuế GTGT đầu ra phải nộp" });
      }

      // Bút toán 2: Ghi nhận giá vốn
      // Nợ TK 632 / Có TK 156
      if (totalCogs > 0) {
        v.entries.push({ debit: "632", credit: "156", amount: totalCogs, desc: `Giá vốn ${v.description}` });
      }

    } else if (v.type === "escrow_pay") {
      // Ký quỹ mang đi: Nợ TK 244 (hoặc 1386) / Có TK 111 hoặc 112
      const targetAcct = state.accountingStandard === "TT200" ? "244" : "1386";
      v.entries = [
        { debit: targetAcct, credit: v.paymentMethod, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_receive") {
      // Nhận ký quỹ đối tác: Nợ TK 111 hoặc 112 / Có TK 344 (hoặc 3386)
      const targetAcct = state.accountingStandard === "TT200" ? "344" : "3386";
      v.entries = [
        { debit: v.paymentMethod, credit: targetAcct, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_refund_pay") {
      // Thu hồi ký quỹ mang đi: Nợ TK 111 hoặc 112 / Có TK 244 (hoặc 1386)
      const targetAcct = state.accountingStandard === "TT200" ? "244" : "1386";
      v.entries = [
        { debit: v.paymentMethod, credit: targetAcct, amount: v.amount, desc: v.description }
      ];
    } else if (v.type === "escrow_refund_receive") {
      // Hoàn trả ký quỹ nhận về: Nợ TK 344 (hoặc 3386) / Có TK 111 hoặc 112
      const targetAcct = state.accountingStandard === "TT200" ? "344" : "3386";
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
    } else if (v.type === "payment") {
      // Phiếu Chi: Nợ TK 331 (hoặc định khoản sẵn từ Excel) / Có TK 111 hoặc 112
      if (!v.entries || v.entries.length === 0) {
        v.entries = [
          { debit: "331", credit: v.paymentMethod || "111", amount: v.amount, desc: v.description }
        ];
      }
    } else if (v.type === "inventory_adjust") {
      // Điều chỉnh tồn kho: tăng/giảm số lượng theo đơn giá bình quân hiện tại (không đổi avgCost)
      let totalAmount = 0;
      (v.items || []).forEach(item => {
        const p = productBalanceMap[item.productId];
        if (!p) return;

        const unitCost = p.avgCost || p.lastPurchasePrice || p.initialCost || item.price || 0;
        item.price = unitCost;
        const amt = Math.round((item.qty || 0) * unitCost);
        item.amount = amt;
        totalAmount += amt;

        if (item.adjustDir === "in") {
          p.stock = Number((p.stock + item.qty).toFixed(3));
          p.totalValue += amt;
          if (p.stock > 0) {
            p.avgCost = Math.round((p.totalValue / p.stock) * 100) / 100;
          }
        } else {
          item.cogsUnit = unitCost;
          item.cogsAmount = amt;
          p.stock = Number((p.stock - item.qty).toFixed(3));
          p.totalValue -= amt;
          if (p.stock <= 0) {
            p.totalValue = 0;
          } else {
            p.avgCost = Math.round((p.totalValue / p.stock) * 100) / 100;
          }
        }
      });

      v.amount = totalAmount;
      v.totalAmount = totalAmount;
      if (!v.entries || v.entries.length === 0) {
        const firstItem = (v.items || [])[0];
        if (firstItem && firstItem.adjustDir === "in") {
          v.entries = [{ debit: "156", credit: "711", amount: totalAmount, desc: v.description || "Điều chỉnh tăng tồn kho" }];
        } else {
          v.entries = [{ debit: "632", credit: "156", amount: totalAmount, desc: v.description || "Điều chỉnh giảm tồn kho" }];
        }
      }
    }
  });

  // BƯỚC C2 (Bug C): Suy diễn remainingDebt từ bút toán bằng phân bổ FIFO
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
    const pool = p.type === 'supplier' ? apAdvances : arAdvances;
    pool[p.id] = [{ remaining: Math.max(p.type === 'supplier' ? net : -net, 0) }];
  });
  const consumeAdvance = (pool, pid, amount) => {
    let left = amount;
    for (const credit of pool[pid] || []) {
      const used = Math.min(credit.remaining, left);
      credit.remaining -= used;
      left -= used;
      if (credit.v) credit.v.remainingDebt = -credit.remaining;
      if (left <= 0) break;
    }
    return amount - left;
  };

  state.vouchers.forEach(v => {
    const isDebtType = (v.type === "sales" || v.type === "purchase" || v.type === "sales_return" || v.type === "purchase_return");
    if (!v.entries || v.entries.length === 0) {
      if (isDebtType) v.remainingDebt = 0;
      return;
    }

    const pid = v.partnerId !== undefined && v.partnerId !== null ? String(v.partnerId) : "";
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

    if (v.type === "sales" && debit131 > 0) {
      const used = pid ? consumeAdvance(arAdvances, pid, debit131) : 0;
      const order = { v, remaining: debit131 - used };
      (arQueues[pid] = arQueues[pid] || []).push(order);
      v.remainingDebt = order.remaining;
    } else if (v.type === "purchase" && credit331 > 0) {
      const used = pid ? consumeAdvance(apAdvances, pid, credit331) : 0;
      const order = { v, remaining: credit331 - used };
      (apQueues[pid] = apQueues[pid] || []).push(order);
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
      const q = arQueues[pid] || [];
      for (let i = 0; i < q.length && toAlloc > 0; i++) {
        const order = q[i];
        if (order.remaining <= 0) continue;
        const used = Math.min(order.remaining, toAlloc);
        order.remaining -= used;
        toAlloc -= used;
        order.v.remainingDebt = order.remaining;
      }
      if (toAlloc > 0) (arAdvances[pid] = arAdvances[pid] || []).push({ remaining: toAlloc, v: v.type === "sales_return" ? v : null });
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
      const q = apQueues[pid] || [];
      for (let i = 0; i < q.length && toAlloc > 0; i++) {
        const order = q[i];
        if (order.remaining <= 0) continue;
        const used = Math.min(order.remaining, toAlloc);
        order.remaining -= used;
        toAlloc -= used;
        order.v.remainingDebt = order.remaining;
      }
      if (toAlloc > 0) (apAdvances[pid] = apAdvances[pid] || []).push({ remaining: toAlloc, v: v.type === "purchase_return" ? v : null });
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

  if (typeof markAccountingValid === 'function') {
    markAccountingValid(state);
  }

  // Lưu lại và vẽ giao diện
  if (shouldSave) {
    saveState();
  }
  refreshUI();
}

// Call only after an explicit edit/import of partner opening balances.
function syncPartnerOpeningAccounts() {
  if (state.initialBalances && state.partnerOpeningBalances) {
    let customerNetOpen = 0;
    let supplierNetOpen = 0;
    state.partners.forEach(p => {
      const op = state.partnerOpeningBalances[p.id];
      if (op) {
        if (p.type !== 'supplier') {
          customerNetOpen += (op.debit || 0) - (op.credit || 0);
        } else if (p.type === 'supplier') {
          supplierNetOpen += (op.credit || 0) - (op.debit || 0);
        }
      }
    });
    if (state.initialBalances["131"]) {
      state.initialBalances["131"].balance = customerNetOpen >= 0 ? customerNetOpen : -customerNetOpen;
      state.initialBalances["131"].type = customerNetOpen >= 0 ? "debit" : "credit";
    }
    if (state.initialBalances["331"]) {
      state.initialBalances["331"].balance = supplierNetOpen >= 0 ? supplierNetOpen : -supplierNetOpen;
      state.initialBalances["331"].type = supplierNetOpen >= 0 ? "credit" : "debit";
    }
  }

}

// Xóa chứng từ khỏi sổ cái
async function deleteVoucher(id) {
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
        recalculateAccounting(false, true);
      }
      console.error("Lỗi nghiêm trọng trong quá trình xóa chứng từ:", err);
      showToast(`Không thể hoàn tất thao tác xóa: ${err.message}`, "danger");
    }
}

// 13. CÁC HÀM TIỆN ÍCH DỮ LIỆU & QUỸ (UTILITIES)

// Tìm số dư của tài khoản (111, 112, 156, etc.) phục vụ Dashboard và báo cáo
function getAccountBalance(acctCode, toDate = "") {
  const initBalObj = (state.initialBalances && state.initialBalances[acctCode]) || { type: "debit", balance: 0 };
  let bal = Number(initBalObj.balance) || 0;
  const isDebit = initBalObj.type === "debit";

  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (toDate && v.date > toDate) return;
      if (v.entries && Array.isArray(v.entries)) {
        v.entries.forEach(e => {
          if (String(e.debit ?? '').trim() === String(acctCode)) {
            bal += isDebit ? (Number(e.amount) || 0) : -(Number(e.amount) || 0);
          }
          if (String(e.credit ?? '').trim() === String(acctCode)) {
            bal += isDebit ? -(Number(e.amount) || 0) : (Number(e.amount) || 0);
          }
        });
      }
    });
  }

  return bal;
}
window.deleteVoucher = deleteVoucher;
