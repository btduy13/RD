
// 3. THUẬT TOÁN KẾ TOÁN CỐT LÕI (ENGINE)
// - Tính giá vốn bình quân gia quyền liên hoàn sau mỗi lần nhập hàng
// - Tự động tạo bút toán Nhật ký kép đồng bộ
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
          } else if (v.type === "purchase_return") {
            voucherChanges[item.productId].sales -= (item.qty || 0);
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
    let initStock = orig ? orig.stock : (p.initialStock !== undefined ? p.initialStock : (p.stock || 0));
    initStock = Number((initStock || 0).toFixed(3));
    
    // Nếu sản phẩm được nhập từ Excel và có actualStock, ta tính ngược lại tồn đầu kỳ để tồn cuối kỳ chính là actualStock
    if (!orig && p.actualStock !== undefined) {
      const changes = voucherChanges[p.id] || { purchases: 0, sales: 0 };
      initStock = Number((p.actualStock - changes.purchases + changes.sales).toFixed(3));
      p.initialStock = initStock;
    }

    const initCost = orig ? orig.avgCost : (p.initialCost !== undefined ? p.initialCost : (p.avgCost || 0));
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
    } else if (v.type === "purchase") {
      // Mua hàng: Tăng số lượng và tăng giá trị tồn
      let itemSubtotal = 0;
      v.items.forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          const oldStock = p.stock;
          const oldVal = p.totalValue;

          p.stock = Number((p.stock + item.qty).toFixed(3));
          p.totalValue += item.amount; // Thành tiền mua chưa thuế

          if (oldStock >= 0 && p.stock > 0) {
            p.avgCost = Math.round(p.totalValue / p.stock);
          } else if (p.stock > 0) {
            // Trước đó bị âm, nay dương trở lại: Đơn giá bình quân = đơn giá mua mới
            p.avgCost = item.price;
            p.totalValue = p.stock * p.avgCost;
          } else {
            // Vẫn bị âm hoặc bằng 0: giữ nguyên đơn giá cũ
            if (!p.avgCost || p.avgCost <= 0) {
              p.avgCost = item.price;
            }
            p.totalValue = p.stock * p.avgCost;
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
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "331") ? totalAmount : 0;
      }

      v.entries = [
        { debit: "156", credit: v.paymentMethod, amount: itemSubtotal, desc: `Nhập kho ${v.description}` },
      ];
      if (taxAmount > 0) {
        v.entries.push({ debit: "1331", credit: v.paymentMethod, amount: taxAmount, desc: "Thuế GTGT đầu vào được khấu trừ" });
      }

    } else if (v.type === "purchase_return") {
      // Hàng trả lại: Cộng vào stock trong kho và giảm trừ doanh thu
      let totalCogs = 0;
      let itemSubtotal = 0;

      v.items.forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          if (!p.avgCost || p.avgCost <= 0) {
            p.avgCost = p.lastPurchasePrice || p.initialCost || 0;
          }
          item.cogsUnit = p.avgCost;
          item.cogsAmount = Math.round(item.qty * p.avgCost);

          p.stock = Number((p.stock + item.qty).toFixed(3));
          p.totalValue += item.cogsAmount;

          totalCogs += item.cogsAmount;
        }
        itemSubtotal += item.amount;
      });

      v.cogsAmount = totalCogs;
      const taxRate = v.taxRate || 0;
      const taxAmount = Math.round(itemSubtotal * (taxRate / 100));
      const totalAmount = itemSubtotal + taxAmount;

      v.taxAmount = taxAmount;
      v.totalAmount = totalAmount;
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131" || v.paymentMethod === "331") ? totalAmount : 0;
      }

      // Giảm trừ doanh thu: Nợ TK 511 / Có TK đối ứng (131, 331, 111, 112)
      v.entries = [
        { debit: "511", credit: v.paymentMethod, amount: itemSubtotal, desc: `Giảm trừ doanh thu hàng trả lại ${v.description}` }
      ];
      if (taxAmount > 0) {
        v.entries.push({ debit: "3331", credit: v.paymentMethod, amount: taxAmount, desc: "Giảm thuế GTGT đầu ra phải nộp" });
      }

      // Nhập lại kho: Nợ TK 156 / Có TK 632
      if (totalCogs > 0) {
        v.entries.push({ debit: "156", credit: "632", amount: totalCogs, desc: `Nhập lại kho hàng trả lại ${v.description}` });
      }

    } else if (v.type === "sales") {
      // Bán hàng: Tính giá vốn xuất kho và giảm tồn kho
      let totalCogs = 0;
      let itemSubtotal = 0;

      v.items.forEach(item => {
        const p = productBalanceMap[item.productId];
        if (p) {
          // Nếu chưa có đơn giá bình quân (bị 0), lấy đơn giá mua gần nhất hoặc đơn giá khởi tạo
          if (!p.avgCost || p.avgCost <= 0) {
            p.avgCost = p.lastPurchasePrice || p.initialCost || 0;
          }
          // Lưu giá vốn bình quân tại thời điểm xuất kho vào chi tiết hóa đơn
          item.cogsUnit = p.avgCost;
          item.cogsAmount = Math.round(item.qty * p.avgCost);

          // Trừ tồn kho
          p.stock = Number((p.stock - item.qty).toFixed(3));
          p.totalValue -= item.cogsAmount;

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
      if (v.remainingDebt === undefined) {
        v.remainingDebt = (v.paymentMethod === "131") ? totalAmount : 0;
      }

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

// Tự động cân đối tài sản và nguồn vốn bằng cách điều chỉnh TK 411 (Vốn chủ sở hữu)
function rebalanceEquity() {
  let debitSum = 0;
  let creditSum = 0;

  Object.keys(state.initialBalances).forEach(code => {
    if (code === "411") return; // Bỏ qua vốn chủ để tính chênh lệch
    const b = state.initialBalances[code];
    if (b.type === "debit") {
      debitSum += b.balance;
    } else {
      creditSum += b.balance;
    }
  });

  state.initialBalances["411"].balance = debitSum - creditSum;
}

// Xóa chứng từ khỏi sổ cái
function deleteVoucher(id) {
  if (confirm(`Bạn có chắc chắn muốn xóa và hủy ghi sổ chứng từ "${id}"? Việc này sẽ tính toán lại toàn bộ giá trị tồn kho và công nợ.`)) {
    trackDeletedIds([id]);
    state.vouchers = state.vouchers.filter(v => v.id !== id);

    // Nếu có các khoản tất toán gắn liền với nó, xóa liên kết hoặc cảnh báo
    // Để an toàn, xóa các khoản tham chiếu
    state.vouchers.forEach(v => {
      if (v.escrowRefId === id) {
        v.escrowRefId = null;
      }
    });

    saveState();
    recalculateAccounting();

    // Tự động làm tươi tất cả các bảng và KPIs trên mọi tab
    if (typeof filterSales === "function") filterSales();
    if (typeof filterPurchases === "function") filterPurchases();
    if (typeof filterCash === "function") {
      filterCash();
      if (typeof recalculateCashKpis === "function") recalculateCashKpis();
    }
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterDebts === "function") filterDebts();
    if (typeof filterPartners === "function") filterPartners();
    if (typeof renderInventoryTable === "function") renderInventoryTable();

    showToast(`Đã xóa thành công chứng từ ${id}!`, "success");
  }
}

// 13. CÁC HÀM TIỆN ÍCH DỮ LIỆU & QUỸ (UTILITIES)

// Tìm số dư của tài khoản (111, 112, 156, etc.) phục vụ Dashboard và báo cáo
function getAccountBalance(acctCode, toDate = "") {
  const initBalObj = (state.initialBalances && state.initialBalances[acctCode]) || { type: "debit", balance: 0 };
  let bal = initBalObj.balance;
  const isDebit = initBalObj.type === "debit";

  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (toDate && v.date > toDate) return;
      if (v.entries && Array.isArray(v.entries)) {
        v.entries.forEach(e => {
          if (e.debit === acctCode) {
            bal += isDebit ? e.amount : -e.amount;
          }
          if (e.credit === acctCode) {
            bal += isDebit ? -e.amount : e.amount;
          }
        });
      }
    });
  }

  return bal;
}
window.deleteVoucher = deleteVoucher;