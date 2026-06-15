
async function autoIntegrateProductsExcel() {
  const hasProducts = state.products && state.products.length > 5;
  if (state.productsExcelIntegrated && hasProducts) {
    console.log("Products Excel database is already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Products Excel integration...");
    setTimeout(autoIntegrateProductsExcel, 1000);
    return;
  }

  console.log("Starting automatic integration of excel/Vat_tu__hang_hoa__dich_vu.xlsx...");
  try {
    let data;
    try {
      data = await readExcelViaIPC('Vat_tu__hang_hoa__dich_vu.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/Vat_tu__hang_hoa__dich_vu.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 2) {
      console.warn("excel/Vat_tu__hang_hoa__dich_vu.xlsx is empty.");
      return;
    }

    let count = 0;
    // Detect header row dynamically
    let headerRowIdx = 1;
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const rCells = rows[r] || [];
      const hasMa = rCells.some(cell => {
        const val = (cell || "").toString().trim().toLowerCase();
        return val === "mã" || val === "mã hàng" || val === "mã sản phẩm" || val === "mã đối tác";
      });
      const hasTen = rCells.some(cell => {
        const val = (cell || "").toString().trim().toLowerCase();
        return val === "tên" || val === "tên sản phẩm" || val === "tên đối tác";
      });
      if (hasMa && hasTen) {
        headerRowIdx = r;
        break;
      }
    }

    const headerRow = rows[headerRowIdx] || [];
    const isNewFormat = headerRow.length <= 15;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const id = (row[0] || "").toString().trim();
      const name = (row[1] || "").toString().trim();
      if (!id || !name || id === "Mã" || id === "Mã sản phẩm" || id === "Mã hàng" || id === "TỔNG CỘNG") continue;

      let unit, minStock, stock, totalVal, avgCost;
      let initialStock, initialCost, salePrice1;
      let nature = "Vật tư hàng hóa";
      let defaultWarehouse = "";
      let warehouseAccount = "1561";
      let cogsAccount = "632";
      let revenueAccount = "51111";
      let inactive = false;

      if (isNewFormat) {
        unit = (row[4] || "Cái").toString().trim();
        minStock = safeParseFloat(row[5]);
        stock = safeParseFloat(row[11]);
        totalVal = safeParseFloat(row[12]);
        avgCost = stock > 0 ? Math.round(totalVal / stock) : 0;
        initialStock = stock;
        initialCost = avgCost;
        salePrice1 = avgCost;

        nature = String(row[2] || "Vật tư hàng hóa").trim();
        defaultWarehouse = String(row[6] || "").trim();
        warehouseAccount = String(row[7] || "1561").trim();
        cogsAccount = String(row[8] || "632").trim();
        revenueAccount = String(row[9] || "51111").trim();

        const inactiveVal = String(row[10] || "").trim();
        inactive = inactiveVal === "1" || inactiveVal === "Có" || inactiveVal === "True" || inactiveVal === "true";
      } else {
        unit = (row[7] || "Cái").toString().trim();
        minStock = safeParseFloat(row[9]);
        stock = safeParseFloat(row[31]);
        totalVal = safeParseFloat(row[33]);
        avgCost = stock > 0 ? Math.round(totalVal / stock) : (safeParseFloat(row[20]) || safeParseFloat(row[19]) || 0);

        initialStock = stock;
        initialCost = safeParseFloat(row[19]) || avgCost || 0;
        salePrice1 = safeParseFloat(row[21]);

        nature = String(row[2] || "Vật tư hàng hóa").trim();
        defaultWarehouse = String(row[11] || "").trim();
        warehouseAccount = String(row[12] || "1561").trim();
        cogsAccount = String(row[13] || "632").trim();
        revenueAccount = String(row[14] || "51111").trim();

        const inactiveVal = String(row[30] || "").trim();
        inactive = inactiveVal === "1" || inactiveVal === "Có" || inactiveVal === "True" || inactiveVal === "true";
      }

      const idx = state.products.findIndex(p => String(p.id) === String(id));
      const pObj = {
        id,
        name,
        unit,
        stock,
        avgCost,
        totalValue: stock * avgCost,
        minStock,
        group: (row[isNewFormat ? 3 : 3] || "").toString().trim(),
        initialStock,
        actualStock: stock,
        initialCost,
        salePrice1,
        lastPurchasePrice: safeParseFloat(row[20]) || avgCost,
        nature,
        defaultWarehouse,
        warehouseAccount,
        cogsAccount,
        revenueAccount,
        inactive,
        excelRow: row
      };
      if (idx !== -1) {
        state.products[idx] = { ...state.products[idx], ...pObj };
      } else {
        state.products.push(pObj);
      }
      count++;
    }

    state.productsExcelIntegrated = true;
    saveState();
    recalculateAccounting();
    console.log(`Successfully auto-integrated ${count} products from excel/Vat_tu__hang_hoa__dich_vu.xlsx!`);
    if (typeof renderInventoryTable === "function") renderInventoryTable();
  } catch (err) {
    console.error("Error auto-integrating products Excel:", err);
  }
}

async function runAutoIntegrations() {
  console.log("Running automatic Excel integrations...");
  await autoIntegrateProductsExcel();
  await autoIntegrateSalesExcel();
  await autoIntegrateSoChiTietBanHangExcel();
  await autoIntegrateSoChiTietMuaHangExcel();
  await autoIntegrateVouchersExcel();
}

async function autoIntegrateVouchersExcel() {
  const hasCash = state.vouchers && state.vouchers.some(v => v.type === "receipt" || v.type === "payment");
  if (hasCash) {
    console.log("Vouchers (cash entries) are already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Vouchers Excel integration...");
    setTimeout(autoIntegrateVouchersExcel, 1000);
    return;
  }

  console.log("Starting automatic integration of excel/Thu__chi_tien.xlsx...");
  try {
    let data;
    try {
      data = await readExcelViaIPC('Thu__chi_tien.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/Thu__chi_tien.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }

    if (!data) return;

    const bytes = new Uint8Array(data);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 3) return;

    let count = 0;
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const id = (row[2] || "").toString().trim();
      if (!id || id === "Số chứng từ") continue;

      const dateStr = excelDateToISOString(row[0]);
      const description = (row[3] || "Giao dịch phát sinh").toString().trim();
      const amount = safeParseFloat(row[4]);
      const partnerName = (row[5] || "Khách hàng vãng lai").toString().trim();
      const voucherTypeStr = (row[8] || "").toString().trim().toUpperCase();

      const descLower = description.toLowerCase();
      let paymentMethod = "111";
      if (descLower.includes("ck") || descLower.includes("chuyển khoản") || descLower.includes("ủy nhiệm chi") || descLower.includes("ngân hàng")) {
        paymentMethod = "112";
      }

      let type = "receipt";
      let debitAccount = "111";
      let creditAccount = "131";

      if (voucherTypeStr.includes("CHI") || voucherTypeStr.includes("MUA HÀNG") || voucherTypeStr.includes("TRẢ LẠI")) {
        type = "payment";
        debitAccount = "331";
        creditAccount = paymentMethod;

        if (descLower.includes("mua hàng") || descLower.includes("nhập kho")) {
          debitAccount = "156";
        } else if (descLower.includes("chi phí") || descLower.includes("thuê xưởng")) {
          debitAccount = "642";
        }
      } else {
        type = "receipt";
        debitAccount = paymentMethod;
        creditAccount = "131";
        if (descLower.includes("doanh thu") || descLower.includes("bán hàng")) {
          creditAccount = "511";
        }
      }

      let partnerId = "";
      const matched = state.partners.find(p => p.name === partnerName);
      if (matched) {
        partnerId = matched.id;
      } else {
        partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
        state.partners.push({ id: partnerId, name: partnerName, type: type === "receipt" ? "customer" : "supplier", phone: "", email: "", address: "" });
      }

      const idx = state.vouchers.findIndex(v => v.id === id);
      const vObj = {
        id,
        type,
        date: dateStr,
        partnerId,
        partnerName,
        paymentMethod,
        description,
        amount,
        isImported: true,
        entries: [{ debit: debitAccount, credit: creditAccount, amount, desc: description }]
      };
      if (idx !== -1) {
        state.vouchers[idx] = vObj;
      } else {
        state.vouchers.push(vObj);
      }
      count++;
    }

    saveState();
    recalculateAccounting();
    console.log(`[AutoIntegration] Successfully integrated ${count} cash vouchers.`);
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof filterCash === "function") filterCash();
  } catch (err) {
    console.warn("Lỗi tự động tích hợp quỹ thu/chi:", err.message);
  }
}

async function autoIntegrateSalesExcel() {
  const hasSales = state.vouchers && state.vouchers.some(v => v.type === "sales");
  if (state.salesExcelIntegrated && hasSales) {
    console.log("Sales Excel database is already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Sales Excel integration...");
    setTimeout(autoIntegrateSalesExcel, 1000);
    return;
  }

  console.log("Starting automatic integration of excel/Ban_hang.xlsx...");
  try {
    let data;
    try {
      data = await readExcelViaIPC('Ban_hang.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/Ban_hang.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 2) {
      console.warn("excel/Ban_hang.xlsx is empty.");
      return;
    }

    let count = 0;
    const partnerMap = new Map();
    state.partners.forEach(p => partnerMap.set(p.name, p.id));

    const voucherMap = new Map();
    state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const id = (row[2] || "").toString().trim();
      if (!id || id === "Số chứng từ") continue;

      const dateStr = excelDateToISOString(row[0]);
      const partnerName = (row[6] || "Khách hàng vãng lai").toString().trim();
      const description = (row[7] || "Bán hàng").toString().trim();

      const H = safeParseFloat(row[8]);
      const C = safeParseFloat(row[9]);
      const T = safeParseFloat(row[10]);
      const totalAmount = safeParseFloat(row[11]);

      let paymentMethod = "131";
      const docTypeStr = (row[14] || "").toString().trim().toUpperCase();
      if (docTypeStr.includes("TIỀN MẶT")) {
        paymentMethod = "111";
      }

      let partnerId = partnerMap.get(partnerName);
      if (!partnerId) {
        partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
        state.partners.push({
          id: partnerId,
          name: partnerName,
          type: "customer",
          phone: "",
          email: "",
          address: ""
        });
        partnerMap.set(partnerName, partnerId);
      }

      const originalRow = [];
      for (let col = 0; col < 15; col++) {
        originalRow[col] = row[col] !== undefined ? row[col] : "";
      }

      const vObj = {
        id,
        type: "sales",
        date: dateStr,
        partnerId,
        partnerName,
        paymentMethod,
        description,
        taxRate: 0,
        taxAmount: T,
        totalAmount: totalAmount,
        amount: totalAmount,
        isImported: true,
        items: [
          {
            productId: "SP_GENERIC",
            qty: 1,
            price: H,
            discount: H > 0 ? Math.round((C / H) * 100 * 100) / 100 : 0,
            amount: H - C
          }
        ],
        excelRow: originalRow
      };

      const existingIdx = voucherMap.get(id);
      if (existingIdx !== undefined) {
        state.vouchers[existingIdx] = vObj;
      } else {
        state.vouchers.push(vObj);
        voucherMap.set(id, state.vouchers.length - 1);
      }
      count++;
    }

    state.salesExcelIntegrated = true;
    saveState();
    recalculateAccounting();
    console.log(`Successfully auto-integrated ${count} sales vouchers from Ban_hang.xlsx!`);
    if (typeof filterSales === "function") filterSales();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    console.error("Error auto-integrating sales Excel:", err);
  }
}

async function autoIntegrateSoChiTietBanHangExcel() {
  if (state.soChiTietBanHangIntegrated) {
    console.log("Detailed Sales Excel (SO_CHI_TIET_BAN_HANG) is already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Detailed Sales Excel integration...");
    setTimeout(autoIntegrateSoChiTietBanHangExcel, 1000);
    return;
  }

  console.log("Starting automatic integration of excel/SO_CHI_TIET_BAN_HANG.xlsx...");
  try {
    if (typeof showToast === "function") {
      showToast("Đang nạp Sổ chi tiết bán hàng (48.226 dòng)... Vui lòng đợi trong giây lát.", "info");
    }

    // Trì hoãn 100ms để Toast hiển thị trước khi CPU bận
    await new Promise(resolve => setTimeout(resolve, 100));

    let data;
    try {
      data = await readExcelViaIPC('SO_CHI_TIET_BAN_HANG.xlsx');
    } catch (fetchErr) {
      console.warn("No excel/SO_CHI_TIET_BAN_HANG.xlsx file found or failed to read. Skipping auto-integration.", fetchErr.message);
      return;
    }
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 3) {
      console.warn("excel/SO_CHI_TIET_BAN_HANG.xlsx is empty.");
      return;
    }

    // Gom nhóm các dòng theo Số chứng từ (row[2])
    const groupMap = new Map();
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      const voucherId = (row[2] || "").toString().trim();
      if (!voucherId) continue;

      if (!groupMap.has(voucherId)) {
        groupMap.set(voucherId, []);
      }
      groupMap.get(voucherId).push(row);
    }

    let count = 0;
    const partnerMap = new Map();
    state.partners.forEach(p => partnerMap.set(p.id, p));

    const productMap = new Map();
    state.products.forEach(p => productMap.set(p.id, p));

    const voucherMap = new Map();
    state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

    // Duyệt qua từng chứng từ bán hàng
    for (const [voucherId, voucherRows] of groupMap.entries()) {
      const firstRow = voucherRows[0];
      const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);

      const partnerIdRaw = (firstRow[7] || "").toString().trim();
      const partnerId = partnerIdRaw ? partnerIdRaw : `DT_${Math.floor(1000 + Math.random() * 9000)}`;
      const partnerName = (firstRow[8] || "Khách hàng vãng lai").toString().trim();
      const description = (firstRow[5] || "Bán hàng").toString().trim();

      // Đăng ký đối tác nếu chưa tồn tại
      if (!partnerMap.has(partnerId)) {
        const pObj = {
          id: partnerId,
          name: partnerName,
          type: "customer",
          phone: "",
          email: "",
          address: ""
        };
        state.partners.push(pObj);
        partnerMap.set(partnerId, pObj);
      }

      // Xác định phương thức thanh toán
      let paymentMethod = "131"; // Default: Công nợ
      const descUpper = description.toUpperCase();
      const nameUpper = partnerName.toUpperCase();
      if (descUpper.includes("TIỀN MẶT") || descUpper.includes("TM") || nameUpper.includes("BÁN LẺ") || nameUpper.includes("KHÁCH LẺ") || nameUpper.includes("VÃNG LAI")) {
        paymentMethod = "111"; // Tiền mặt
      }

      // Tạo mảng items
      const itemsArray = [];
      let totalVoucherAmount = 0;

      for (const row of voucherRows) {
        const productId = (row[9] || "SP_GENERIC").toString().trim();
        const productName = (row[10] || "Sản phẩm generic").toString().trim();
        const unit = (row[11] || "Cái").toString().trim();
        const qty = safeParseFloat(row[12]);
        const price = safeParseFloat(row[13]);
        const discountVal = safeParseFloat(row[15]);

        // Doanh số bán (row[14]) là gross, doanh thu thuần là gross - discount
        const grossAmount = qty * price;
        const amount = grossAmount - discountVal;
        const discountPercent = grossAmount > 0 ? Math.round((discountVal / grossAmount) * 100 * 100) / 100 : 0;

        itemsArray.push({
          productId: productId,
          qty: qty,
          price: price,
          discount: discountPercent,
          amount: amount
        });

        totalVoucherAmount += amount;

        // Đăng ký sản phẩm nếu chưa tồn tại
        if (!productMap.has(productId)) {
          const prodObj = {
            id: productId,
            name: productName,
            unit: unit,
            stock: 0,
            avgCost: 0,
            totalValue: 0
          };
          state.products.push(prodObj);
          productMap.set(productId, prodObj);
        }
      }

      const vObj = {
        id: voucherId,
        type: "sales",
        date: dateStr,
        partnerId: partnerId,
        partnerName: partnerName,
        paymentMethod: paymentMethod,
        description: description,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: totalVoucherAmount,
        amount: totalVoucherAmount,
        isImported: true,
        items: itemsArray
      };

      const existingIdx = voucherMap.get(voucherId);
      if (existingIdx !== undefined) {
        // Cập nhật và nâng cấp chứng từ hiện có
        state.vouchers[existingIdx] = vObj;
      } else {
        // Thêm mới chứng từ bán hàng
        state.vouchers.push(vObj);
        voucherMap.set(voucherId, state.vouchers.length - 1);
      }
      count++;
    }

    state.soChiTietBanHangIntegrated = true;
    state.salesExcelIntegrated = true; // Mark sales also integrated to bypass the Ban_hang.xlsx old loader
    saveState();
    recalculateAccounting();

    console.log(`Successfully integrated ${count} detailed sales vouchers from SO_CHI_TIET_BAN_HANG.xlsx!`);

    if (typeof showToast === "function") {
      showToast(`Tích hợp thành công Sổ chi tiết bán hàng! Đã nạp ${count} chứng từ.`, "success");
    }

    if (typeof updateExcelHubUI === "function") updateExcelHubUI();
    if (typeof filterSales === "function") filterSales();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    console.error("Error auto-integrating detailed sales Excel:", err);
    if (typeof showToast === "function") {
      showToast("Lỗi tích hợp Sổ chi tiết bán hàng Excel: " + err.message, "danger");
    }
  }
}

async function autoIntegrateSoChiTietMuaHangExcel(force = false) {
  if (state.soChiTietMuaHangIntegrated && !force) {
    console.log("Detailed Purchase Excel is already integrated.");
    return;
  }

  if (typeof XLSX === "undefined") {
    console.warn("SheetJS not loaded yet, deferring Detailed Purchase Excel integration...");
    setTimeout(() => autoIntegrateSoChiTietMuaHangExcel(force), 1000);
    return;
  }

  console.log("Starting automatic integration of detailed purchase excel...");
  try {
    if (typeof showToast === "function") {
      showToast("Đang nạp Sổ chi tiết mua hàng... Vui lòng đợi trong giây lát.", "info");
    }

    // Trì hoãn 100ms để Toast hiển thị trước khi CPU bận
    await new Promise(resolve => setTimeout(resolve, 100));

    let data;
    let loadedFilename = 'SO_CHI_TIET_MUA_HANG_THEO_MA_QUY_CACH.xlsx';
    try {
      data = await readExcelViaIPC('SO_CHI_TIET_MUA_HANG_THEO_MA_QUY_CACH.xlsx');
    } catch (fetchErr) {
      try {
        data = await readExcelViaIPC('SO_CHI_TIET_MUA_HANG.xlsx');
        loadedFilename = 'SO_CHI_TIET_MUA_HANG.xlsx';
      } catch (err2) {
        console.warn("No detailed purchase excel file found or failed to read. Skipping auto-integration.", err2.message);
        return;
      }
    }
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length < 3) {
      console.warn(`excel/${loadedFilename} is empty.`);
      return;
    }

    let colQty = 13;
    let colPrice = 14;
    let colAmount = 17;

    let headerIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      if (rows[r] && rows[r].includes("Số chứng từ") && rows[r].includes("Mã hàng")) {
        headerIdx = r;
        break;
      }
    }

    if (headerIdx !== -1) {
      const header = rows[headerIdx];
      const qIdx = header.indexOf("Số lượng mua");
      const pIdx = header.indexOf("Đơn giá");
      const aIdx = header.indexOf("Giá trị mua");
      if (qIdx !== -1) colQty = qIdx;
      if (pIdx !== -1) colPrice = pIdx;
      if (aIdx !== -1) colAmount = aIdx;
    }

    // Gom nhóm các dòng theo Số chứng từ (row[2])
    const groupMap = new Map();
    const startRow = headerIdx !== -1 ? headerIdx + 1 : 3;
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const voucherId = (row[2] || "").toString().trim();
      if (!voucherId || voucherId.startsWith("TỔNG")) continue;

      if (!groupMap.has(voucherId)) {
        groupMap.set(voucherId, []);
      }
      groupMap.get(voucherId).push(row);
    }

    let count = 0;
    const partnerMap = new Map();
    state.partners.forEach(p => partnerMap.set(p.id, p));

    const productMap = new Map();
    state.products.forEach(p => productMap.set(p.id, p));

    const voucherMap = new Map();
    state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

    // Đăng ký đối tác mặc định cho nhập hàng
    const partnerId = "NCC_EXCEL";
    const partnerName = "Nhà cung cấp Sổ chi tiết";
    if (!partnerMap.has(partnerId)) {
      const pObj = {
        id: partnerId,
        name: partnerName,
        type: "supplier",
        phone: "",
        email: "",
        address: ""
      };
      state.partners.push(pObj);
      partnerMap.set(partnerId, pObj);
    }

    // Duyệt qua từng chứng từ mua hàng
    for (const [voucherId, voucherRows] of groupMap.entries()) {
      const firstRow = voucherRows[0];
      const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);
      const invoiceNo = firstRow[4] || "";
      const description = `Nhập kho mua hàng theo số hóa đơn ${invoiceNo || voucherId}`;

      // Tạo mảng items
      const itemsArray = [];
      let totalVoucherAmount = 0;

      for (const row of voucherRows) {
        const productId = (row[5] || "SP_GENERIC").toString().trim();
        const productName = (row[6] || "Sản phẩm generic").toString().trim();
        const unit = (row[7] || "Cái").toString().trim();
        const qty = safeParseFloat(row[colQty]);
        const price = safeParseFloat(row[colPrice]);

        // Sử dụng giá trị mua ở row[colAmount], nếu không có thì tính bằng qty * price
        const amount = safeParseFloat(row[colAmount]) || (qty * price);

        itemsArray.push({
          productId: productId,
          qty: qty,
          price: price,
          amount: amount
        });

        totalVoucherAmount += amount;

        // Đăng ký sản phẩm nếu chưa tồn tại
        if (!productMap.has(productId)) {
          const prodObj = {
            id: productId,
            name: productName,
            unit: unit,
            stock: 0,
            avgCost: 0,
            totalValue: 0
          };
          state.products.push(prodObj);
          productMap.set(productId, prodObj);
        }
      }

      const vObj = {
        id: voucherId,
        type: "purchase",
        date: dateStr,
        partnerId: partnerId,
        partnerName: partnerName,
        paymentMethod: "331", // Mặc định là công nợ
        description: description,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: totalVoucherAmount,
        amount: totalVoucherAmount,
        isImported: true,
        items: itemsArray
      };

      const existingIdx = voucherMap.get(voucherId);
      if (existingIdx !== undefined) {
        // Cập nhật và nâng cấp chứng từ hiện có
        state.vouchers[existingIdx] = vObj;
      } else {
        // Thêm mới chứng từ mua hàng
        state.vouchers.push(vObj);
        voucherMap.set(voucherId, state.vouchers.length - 1);
      }
      count++;
    }

    state.soChiTietMuaHangIntegrated = true;
    saveState();
    recalculateAccounting();

    console.log(`Successfully integrated ${count} detailed purchase vouchers from ${loadedFilename}!`);

    if (typeof showToast === "function") {
      showToast(`Tích hợp thành công Sổ chi tiết mua hàng! Đã nạp ${count} chứng từ.`, "success");
    }

    if (typeof updateExcelHubUI === "function") updateExcelHubUI();
    if (typeof filterPurchaseTable === "function") filterPurchaseTable();
    if (typeof renderPurchaseTable === "function") renderPurchaseTable();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    console.error("Error auto-integrating detailed purchase Excel:", err);
    if (typeof showToast === "function") {
      showToast("Lỗi tích hợp Sổ chi tiết mua hàng Excel: " + err.message, "danger");
    }
  }
}

function convertStyle(s) {
  if (!s) return undefined;
  const out = {};

  // Fill style
  if (s.patternType || s.fgColor || s.bgColor) {
    out.fill = {
      patternType: s.patternType || 'solid',
      fgColor: s.fgColor,
      bgColor: s.bgColor
    };
  } else if (s.fill) {
    out.fill = s.fill;
  }

  // Font style
  if (s.font) {
    out.font = s.font;
  } else if (s.name || s.sz || s.bold || s.italic || s.underline || s.color) {
    out.font = {
      name: s.name,
      sz: s.sz,
      bold: s.bold,
      italic: s.italic,
      underline: s.underline,
      color: s.color
    };
  }

  // Alignment style
  if (s.alignment) {
    out.alignment = s.alignment;
  } else if (s.horizontal || s.vertical || s.wrapText) {
    out.alignment = {
      horizontal: s.horizontal,
      vertical: s.vertical,
      wrapText: s.wrapText
    };
  }

  // Border style
  if (s.border) {
    out.border = s.border;
  } else if (s.top || s.bottom || s.left || s.right) {
    out.border = {
      top: s.top,
      bottom: s.bottom,
      left: s.left,
      right: s.right
    };
  }

  if (s.numFmt) {
    out.numFmt = s.numFmt;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

async function exportExcelWithTemplate(templatePath, outputName, list, mapper, fallbackHeaders, fallbackMapper, headerRowCount = 2) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    let workbook;
    let sheetName;
    let newSheet;
    try {
      const response = await fetch(templatePath);
      if (!response.ok) throw new Error("Fetch template failed: " + response.statusText);
      const arrayBuffer = await response.arrayBuffer();
      workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellStyles: true });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A2');
      const maxCol = range.e.c;

      const colStyles = {};
      const sampleRow = headerRowCount;
      for (let c = range.s.c; c <= maxCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: sampleRow, c: c });
        const cell = sheet[cellRef];
        if (cell && cell.s) colStyles[c] = convertStyle(cell.s);
        if (cell && cell.z) colStyles[c + '_z'] = cell.z;
      }

      for (const key in sheet) {
        if (key[0] === '!') continue;
        const cellCoord = XLSX.utils.decode_cell(key);
        if (cellCoord.r < headerRowCount) {
          if (sheet[key] && sheet[key].s) sheet[key].s = convertStyle(sheet[key].s);
        } else {
          delete sheet[key];
        }
      }

      list.forEach((item, idx) => {
        const r = idx + headerRowCount;
        const newRow = new Array(maxCol + 1).fill("");
        mapper(item, newRow, idx);

        for (let c = 0; c <= maxCol; c++) {
          const val = newRow[c];
          if (val !== undefined && val !== null && val !== "") {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
            const cell = { v: val };
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) && colStyles[c + '_z'] && colStyles[c + '_z'].toLowerCase().includes('d')) {
              const d = new Date(val);
              if (!isNaN(d.getTime())) {
                cell.v = dateToExcelSerial(d);
                cell.t = 'n';
              } else {
                cell.t = 's';
              }
            } else if (typeof val === 'number') {
              cell.t = 'n';
            } else if (typeof val === 'boolean') {
              cell.t = 'b';
            } else {
              cell.t = 's';
            }
            if (colStyles[c]) cell.s = colStyles[c];
            if (colStyles[c + '_z']) cell.z = colStyles[c + '_z'];
            sheet[cellRef] = cell;
          }
        }
      });

      range.e.r = Math.max(headerRowCount - 1, list.length + headerRowCount - 1);
      sheet['!ref'] = XLSX.utils.encode_range(range);
      newSheet = sheet;
    } catch (fetchErr) {
      console.warn("Fallback excel generation", fetchErr);
      workbook = XLSX.utils.book_new();
      sheetName = "Sheet1";
      const rows = JSON.parse(JSON.stringify(fallbackHeaders));
      list.forEach((item, idx) => {
        const newRow = new Array(fallbackHeaders[0].length).fill("");
        fallbackMapper(item, newRow, idx);
        rows.push(newRow);
      });
      newSheet = XLSX.utils.aoa_to_sheet(rows);
    }

    workbook.Sheets[sheetName] = newSheet;
    if (workbook.SheetNames.indexOf(sheetName) === -1) {
      XLSX.utils.book_append_sheet(workbook, newSheet, sheetName);
    }
    XLSX.writeFile(workbook, outputName);
    showToast(`Đã xuất Excel thành công: ${outputName}`, "success");
  } catch (err) {
    showToast(`Lỗi xuất Excel: ${err.message}`, "danger");
  }
}

function dateToExcelSerial(date) {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
}

function dateStrToSerial(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return "";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : dateToExcelSerial(d);
}

function createDefaultProductExcelRow(p) {
  const r = new Array(57).fill("");
  r[0] = p.id;
  r[1] = p.name;
  r[2] = "Vật tư hàng hóa";
  r[3] = p.group || "";
  r[7] = p.unit || "Cái";
  r[9] = p.minStock || 0;
  r[11] = "1561";
  r[12] = "156";
  r[13] = "632";
  r[14] = "51111";
  r[30] = p.inactive ? "TRUE" : "FALSE";
  r[31] = p.stock || 0;
  r[33] = p.totalValue || 0;
  return r;
}

function createDefaultPartnerExcelRow(p) {
  const r = new Array(7).fill("");
  r[0] = p.id;
  r[1] = p.name;
  r[2] = p.address || "";
  r[3] = p.group || (p.type === "supplier" ? "NCC" : "KH");
  r[4] = p.taxCode || "";
  r[5] = p.phone || "";
  r[6] = p.inactive ? "TRUE" : "FALSE";
  return r;
}

function createDefaultDebtExcelRow(id, d) {
  const r = new Array(18).fill("");
  const p = state.partners.find(x => String(x.id) === String(id)) || {};
  r[0] = id;
  r[1] = p.name || d.name || "";
  r[2] = d.debit || 0;
  r[3] = d.credit || 0;
  r[4] = (d.debit || 0) - (d.credit || 0);
  r[5] = p.address || "";
  r[6] = p.taxCode || "";
  r[7] = p.phone || "";
  r[8] = p.phone || "";
  r[17] = p.type === "supplier" ? "NCC" : "KH";
  return r;
}

function createDefaultVoucherExcelRow(v) {
  const r = new Array(10).fill("");
  const typeLabel = (v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay") ? "Phiếu thu" :
    ((v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive") ? "Phiếu chi" :
      (v.type === "sales" ? "Hóa đơn bán hàng" : "Hóa đơn mua hàng"));
  r[0] = v.date || "";
  r[1] = v.date || "";
  r[2] = v.id || "";
  r[3] = v.description || "";
  r[4] = v.amount !== undefined ? v.amount : (v.totalAmount !== undefined ? v.totalAmount : 0);
  r[5] = v.partnerName || "";
  r[6] = v.description || "";
  r[7] = "";
  r[8] = typeLabel || "";
  r[9] = "";
  return r;
}

function initializeMissingExcelRows() {
  if (state.products) {
    state.products.forEach(p => {
      if (!p.excelRow) {
        p.excelRow = createDefaultProductExcelRow(p);
      }
    });
  }
  if (state.partners) {
    state.partners.forEach(p => {
      if (!p.excelRow) {
        p.excelRow = createDefaultPartnerExcelRow(p);
      }
    });
  }
  if (state.partnerOpeningBalances) {
    Object.keys(state.partnerOpeningBalances).forEach(id => {
      const d = state.partnerOpeningBalances[id];
      if (!d.excelRow) {
        d.excelRow = createDefaultDebtExcelRow(id, d);
      }
    });
  }
  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (!v.excelRow) {
        v.excelRow = createDefaultVoucherExcelRow(v);
      }
    });
  }
}

function migrateAndCleanExistingExcelRows() {
  let migrated = false;

  if (state.vouchers) {
    state.vouchers.forEach(v => {
      if (v.excelRow && Array.isArray(v.excelRow)) {
        for (let i = 0; i < v.excelRow.length; i++) {
          if (v.excelRow[i] === undefined || v.excelRow[i] === null) {
            v.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }

  if (state.products) {
    state.products.forEach(p => {
      if (p.excelRow && Array.isArray(p.excelRow)) {
        for (let i = 0; i < p.excelRow.length; i++) {
          if (p.excelRow[i] === undefined || p.excelRow[i] === null) {
            p.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }

  if (state.partners) {
    state.partners.forEach(p => {
      if (p.excelRow && Array.isArray(p.excelRow)) {
        for (let i = 0; i < p.excelRow.length; i++) {
          if (p.excelRow[i] === undefined || p.excelRow[i] === null) {
            p.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }

  if (state.partnerOpeningBalances) {
    Object.keys(state.partnerOpeningBalances).forEach(key => {
      const d = state.partnerOpeningBalances[key];
      if (d && d.excelRow && Array.isArray(d.excelRow)) {
        for (let i = 0; i < d.excelRow.length; i++) {
          if (d.excelRow[i] === undefined || d.excelRow[i] === null) {
            d.excelRow[i] = "";
            migrated = true;
          }
        }
      }
    });
  }

  if (migrated) {
    saveState();
  }
}

function cleanNumericUnitProducts() {
  if (!state || !state.products) return;
  const originalLength = state.products.length;

  // Lọc bỏ các sản phẩm có đơn vị tính là số (ví dụ "16500", "6600")
  state.products = state.products.filter(p => {
    if (!p.unit) return true;
    const unitStr = String(p.unit).trim();
    if (unitStr === "") return true;

    // Nếu đơn vị tính chỉ toàn chữ số (hoặc số thập phân), ta coi là số và xóa bỏ
    const isNumeric = !isNaN(Number(unitStr));
    return !isNumeric;
  });

  if (state.products.length !== originalLength) {
    console.log(`[Database Cleanup] Đã xóa ${originalLength - state.products.length} sản phẩm lỗi có đơn vị tính là số.`);
    saveState();
  }
}

// Chức năng khôi phục danh mục gốc và giá S06 đã bị loại bỏ vì là module lỗi

function getVNAccountingAccounts(nature) {
  const nat = (nature || "").trim();
  let defaultWarehouse = "";
  let warehouseAccount = "";
  let cogsAccount = "";
  let revenueAccount = "";
  let discountAccount = "5211";
  let rebateAccount = "5212";
  let returnAccount = "5213";

  if (nat === "Vật tư hàng hóa" || nat === "Hàng hóa") {
    defaultWarehouse = "1561";
    warehouseAccount = "1561";
    cogsAccount = "632";
    revenueAccount = "51111";
  } else if (nat === "Nguyên vật liệu") {
    defaultWarehouse = "152";
    warehouseAccount = "152";
    cogsAccount = "632";
    revenueAccount = "51111";
  } else if (nat === "Công cụ dụng cụ") {
    defaultWarehouse = "153";
    warehouseAccount = "153";
    cogsAccount = "632";
    revenueAccount = "51111";
  } else if (nat === "Thành phẩm" || nat === "Bán thành phẩm") {
    defaultWarehouse = "155";
    warehouseAccount = "155";
    cogsAccount = "632";
    revenueAccount = "5112";
  } else if (nat === "Dịch vụ") {
    defaultWarehouse = "";
    warehouseAccount = "";
    cogsAccount = "632";
    revenueAccount = "5113";
  } else {
    // Chỉ là diễn giải hoặc mặc định
    defaultWarehouse = "";
    warehouseAccount = "";
    cogsAccount = "";
    revenueAccount = "";
    discountAccount = "";
    rebateAccount = "";
    returnAccount = "";
  }

  return {
    defaultWarehouse,
    warehouseAccount,
    cogsAccount,
    revenueAccount,
    discountAccount,
    rebateAccount,
    returnAccount
  };
}

function ensureProductExcelRow(p) {
  const accounts = getVNAccountingAccounts(p.nature || "Vật tư hàng hóa");

  if (!p.excelRow || p.excelRow.length < 57) {
    const er = new Array(57).fill("");
    er[0] = p.id || "";
    er[1] = p.name || "";
    er[2] = p.nature || "Vật tư hàng hóa";
    er[3] = p.group || "";
    er[7] = p.unit || "Cái";
    er[9] = p.minStock || 0;
    er[11] = accounts.defaultWarehouse;
    er[12] = accounts.warehouseAccount;
    er[13] = accounts.cogsAccount;
    er[14] = accounts.revenueAccount;
    er[15] = accounts.discountAccount;
    er[16] = accounts.rebateAccount;
    er[17] = accounts.returnAccount;
    er[18] = 0;
    er[19] = p.initialCost || 0;
    er[20] = p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : (p.avgCost || 0);
    er[21] = p.salePrice1 || 0;
    er[22] = 0;
    er[23] = 0;
    er[24] = 0;
    er[25] = 0;
    er[26] = 0;
    er[27] = 0;
    er[29] = "False";
    er[30] = p.inactive ? 1 : 0;
    er[31] = p.stock || 0;
    er[33] = p.totalValue || 0;
    er[35] = "Chưa xác định";
    er[36] = 0;
    er[37] = 0;
    er[41] = 0;
    p.excelRow = er;
  }
  // Đồng bộ các thuộc tính hiện tại của sản phẩm vào excelRow
  p.excelRow[0] = p.id || "";
  p.excelRow[1] = p.name || "";
  p.excelRow[2] = p.nature || "Vật tư hàng hóa";
  p.excelRow[3] = p.group || "";
  p.excelRow[7] = p.unit || "Cái";
  p.excelRow[9] = p.minStock || 0;
  p.excelRow[11] = accounts.defaultWarehouse;
  p.excelRow[12] = accounts.warehouseAccount;
  p.excelRow[13] = accounts.cogsAccount;
  p.excelRow[14] = accounts.revenueAccount;
  p.excelRow[15] = accounts.discountAccount;
  p.excelRow[16] = accounts.rebateAccount;
  p.excelRow[17] = accounts.returnAccount;
  p.excelRow[19] = p.initialCost || 0;
  p.excelRow[20] = p.lastPurchasePrice !== undefined ? p.lastPurchasePrice : (p.avgCost || 0);
  p.excelRow[21] = p.salePrice1 || 0;
  p.excelRow[30] = p.inactive ? 1 : 0;
  p.excelRow[31] = p.stock || 0;
  p.excelRow[33] = p.totalValue || 0;
  return p.excelRow;
}


function exportProductsToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "CCCCFF" } }; // Nền tím nhạt (FFCCCCFF)
    const fntT = { name: "Times New Roman", sz: 14, bold: true };
    const fntH = { name: "Microsoft Sans Serif", sz: 8, bold: false };
    const fntN = { name: "Microsoft Sans Serif", sz: 8 };
    const cC = { horizontal: "center", vertical: "center" };
    const cL = { horizontal: "left", vertical: "center", wrapText: true };
    const cR = { horizontal: "right", vertical: "center" };
    const numFmt = "#,##0 ;[Red](#,##0)";

    const sc = (r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    // 57 Cột theo đúng template gốc của MISA
    const headers = [
      "Mã", "Tên", "Tính chất", "Nhóm VTHH", "Mô tả", "Diễn giải khi mua", "Diễn giải khi bán",
      "ĐVT chính", "Thời hạn BH", "Số lượng tồn tối thiểu", "Nguồn gốc", "Kho ngầm định",
      "Tài khoản kho", "TK chi phí", "TK doanh thu", "TK chiết khấu", "TK giảm giá", "TK trả lại",
      "Tỷ lệ CKMH", "Đơn giá mua cố định", "Đơn giá mua gần nhất", "Đơn giá bán 1", "Đơn giá bán 2",
      "Đơn giá bán 3", "Đơn giá cố định", "Là đơn giá sau thuế", "Thuế suất thuế NK", "Thuế suất thuế XK",
      "Nhóm HHDV chịu thuế TTĐB", "Là hàng khuyến mại", "Ngừng theo dõi", "Số lượng tồn", "Đặc tính",
      "Giá trị tồn", "Thuế suất GTGT", "Giảm thuế theo NQ43/2022/QH15", "Theo dõi vật tư, hàng hóa theo mã quy cách",
      "Chiết khấu", "Số lượng từ", "Số lượng đến", "% chiết khấu", "Số tiền chiết khấu", "Đơn vị chuyển đổi",
      "Tỷ lệ chuyển đổi về đơn vị chính", "Phép tính", "Mô tả", "Đơn giá bán 1", "Đơn giá bán 2", "Đơn giá bán 3",
      "Đơn giá cố định", "Mã nguyên vật liệu", "Tên nguyên vật liệu", "ĐVT", "Số lượng", "Mã quy cách",
      "Tên hiển thị", "Cho phép trùng"
    ];
    const ncols = headers.length;

    // ROW 0: Tiêu đề khớp 100% tệp mẫu MISA
    sc(0, 0, "DANH SÁCH VẬT TƯ, HÀNG HÓA, DỊCH VỤ", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Headers
    headers.forEach((h, c) => sc(1, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    let rowIdx = 2;
    (state.products || []).forEach((p) => {
      const bs = (al) => ({ font: fntN, alignment: al, border: border4 });
      const er = ensureProductExcelRow(p);
      const rowData = [...er];

      // Đảm bảo đồng bộ thông tin mới nhất từ CSDL app
      rowData[0] = p.id || "";
      rowData[1] = p.name || "";
      rowData[2] = p.nature || "Vật tư hàng hóa";
      rowData[3] = p.group || "";
      rowData[7] = p.unit || "Cái";
      rowData[9] = p.minStock !== undefined ? p.minStock : (er[9] !== undefined ? safeParseFloat(er[9]) : 0);
      rowData[11] = p.defaultWarehouse || "";
      rowData[12] = p.warehouseAccount || "1561";
      rowData[13] = p.cogsAccount || "632";
      rowData[14] = p.revenueAccount || "51111";
      rowData[19] = p.initialCost !== undefined ? p.initialCost : (er[19] !== undefined ? safeParseFloat(er[19]) : 0);
      rowData[20] = p.avgCost !== undefined ? p.avgCost : (er[20] !== undefined ? safeParseFloat(er[20]) : 0);
      rowData[21] = p.salePrice1 !== undefined ? p.salePrice1 : (er[21] !== undefined ? safeParseFloat(er[21]) : 0);
      rowData[30] = p.inactive ? 1 : (er[30] !== undefined ? safeParseFloat(er[30]) : 0);
      rowData[31] = p.stock !== undefined ? p.stock : (er[31] !== undefined ? safeParseFloat(er[31]) : 0);
      rowData[33] = p.totalValue !== undefined ? p.totalValue : (er[33] !== undefined ? safeParseFloat(er[33]) : 0);

      for (let c = 34; c < 57; c++) {
        rowData[c] = er[c] !== undefined ? er[c] : "";
      }

      rowData.forEach((val, c) => {
        let align = cL;
        if ([0, 2, 7, 10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 30, 32].includes(c)) {
          align = cC;
        } else if ([5, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 31, 33, 37, 38, 39, 40, 41, 43, 46, 47, 48, 49, 53].includes(c)) {
          align = cR;
        }

        let type = 's';
        let z = null;
        if (typeof val === 'number') {
          type = 'n';
          z = numFmt;
          if (c === 31) z = "#,##0.##";
        } else if (typeof val === 'boolean') {
          type = 'b';
        }

        sc(rowIdx, c, val, type, bs(align), z);
      });
      rowIdx++;
    });

    // DÒNG TỔNG SỐ DÒNG (Dưới cùng của file MISA mẫu)
    sc(rowIdx, 0, "Số dòng = " + state.products.length, 's', { font: fntN });
    for (let c = 1; c < ncols; c++) {
      sc(rowIdx, c, "", 's');
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;

    // Thiết lập độ rộng cột
    const colWidths = [];
    for (let c = 0; c < ncols; c++) {
      if (c === 0) colWidths.push({ wch: 16 }); // Mã
      else if (c === 1) colWidths.push({ wch: 32 }); // Tên
      else if (c === 3) colWidths.push({ wch: 18 }); // Nhóm VTHH
      else colWidths.push({ wch: 12 });
    }
    ws['!cols'] = colWidths;
    ws['!rows'] = [{ hpt: 22 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Vat_tu__hang_hoa__dich_vu");
    const outName = `Vat_tu_hang_hoa_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel hàng hóa: ${err.message}`, "danger");
  }
}

function exportPartnersToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }
  try {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const merges = [];

    const thin = { style: "thin", color: { rgb: "AAAAAA" } };
    const border4 = { top: thin, bottom: thin, left: thin, right: thin };
    const hdrBg = { patternType: "solid", fgColor: { rgb: "1F497D" } };
    const altBg = { patternType: "solid", fgColor: { rgb: "F5F8FF" } };
    const totBg = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
    const fntT = { name: "Times New Roman", sz: 13, bold: true };
    const fntH = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
    const fntB = { name: "Times New Roman", sz: 11, bold: true };
    const fntN = { name: "Times New Roman", sz: 11 };
    const cC = { horizontal: "center", vertical: "center" };
    const cL = { horizontal: "left", vertical: "center", wrapText: true };
    const cR = { horizontal: "right", vertical: "center" };

    const sc = (r, c, v, t, s, z) => {
      const key = XLSX.utils.encode_cell({ r, c });
      const cell = { v, t: t || (typeof v === 'number' ? 'n' : 's') };
      if (s) cell.s = s;
      if (z) cell.z = z;
      ws[key] = cell;
    };

    // Columns
    const headers = ["Mã khách hàng", "Tên khách hàng", "Địa chỉ", "Nhóm KH, NCC", "Mã số thuế", "Điện thoại", "Ngưng theo dõi"];
    const ncols = headers.length;

    // ROW 0: Tiêu đề
    sc(0, 0, (state.companyName || "Công Ty Cổ Phần Rạng Đông") + " — DANH SÁCH KHÁCH HÀNG / NHÀ CUNG CẤP", 's', { font: fntT, alignment: cC });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });

    // ROW 1: Headers
    headers.forEach((h, c) => sc(1, c, h, 's', { font: fntH, fill: hdrBg, alignment: cC, border: border4 }));

    // DATA ROWS
    let rowIdx = 2;
    let totalKH = 0, totalNCC = 0;
    (state.partners || []).forEach((p, idx) => {
      const bg = idx % 2 === 0 ? null : altBg;
      const bs = (al) => ({ font: fntN, fill: bg, alignment: al, border: border4 });
      sc(rowIdx, 0, p.id || "", 's', bs(cC));
      sc(rowIdx, 1, p.name || "", 's', bs(cL));
      sc(rowIdx, 2, p.address || "", 's', bs(cL));
      sc(rowIdx, 3, p.group || (p.type === "supplier" ? "NCC" : "KH"), 's', bs(cC));
      sc(rowIdx, 4, p.taxCode || "", 's', bs(cC));
      sc(rowIdx, 5, p.phone || "", 's', bs(cC));
      sc(rowIdx, 6, p.inactive ? "Có" : "", 's', bs(cC));
      if (p.type === "supplier") totalNCC++; else totalKH++;
      rowIdx++;
    });

    // DÒNG TỔNG
    const ts = (al) => ({ font: fntB, fill: totBg, alignment: al, border: border4 });
    sc(rowIdx, 0, `TỔNG: ${totalKH} KH + ${totalNCC} NCC = ${totalKH + totalNCC} đối tượng`, 's', ts(cL));
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: ncols - 1 } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 40 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 14 }];
    ws['!rows'] = [{ hpt: 22 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, "Doi tuong");
    const outName = `Khach_hang_NCC_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Đã xuất Excel: ${outName}`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Lỗi xuất Excel khách hàng: ${err.message}`, "danger");
  }
}

function createDefaultSalesExcelRow(v) {
  const r = [];
  r[0] = v.date;
  r[1] = v.date;
  r[2] = v.id;
  r[3] = "";
  r[4] = "";
  r[5] = "";
  r[6] = v.partnerName;
  r[7] = v.description;

  let grossTotal = 0;
  let totalDiscount = 0;
  v.items.forEach(item => {
    const itemGross = (item.qty || 0) * (item.price || 0);
    const discountVal = itemGross * ((item.discount || 0) / 100);
    grossTotal += itemGross;
    totalDiscount += discountVal;
  });

  r[8] = grossTotal;
  r[9] = totalDiscount;
  r[10] = v.taxAmount || 0;
  r[11] = v.totalAmount;
  r[12] = "Đã lập";
  r[13] = "Đã xuất";
  r[14] = v.paymentMethod === "111" ? "Bán hàng hóa, dịch vụ trong nước - Tiền mặt" : "Bán hàng hóa, dịch vụ trong nước chưa thu tiền";
  return r;
}

// ==========================================================
// CÁC HÀM TÍCH HỢP EXCEL HUB & AUTOCOMPLETE (EXCEL HUB UTILITIES)
// ==========================================================

let productOptionsHTML = "";
let productOptionsSalesHTML = "";

// Khởi tạo cache sản phẩm và datalist đối tác
function initExcelIntegration() {
  cacheProductOptions();

  // Nạp datalist partners
  const datalist = document.getElementById("datalist-partners");
  if (datalist && state.partners) {
    datalist.innerHTML = state.partners.map(p =>
      `<option value="${p.name} (${p.id})">[${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
    ).join("");
  }

  // Nạp datalist sản phẩm phục vụ autocomplete trong hóa đơn bán hàng & mua hàng
  const productDatalist = document.getElementById("datalist-sales-products");
  const purchaseProductDatalist = document.getElementById("datalist-purchase-products");
  if (state.products) {
    const optionsHTML = state.products.map(p =>
      `<option value="${p.name} (${p.id})">(Tồn: ${p.stock})</option>`
    ).join("");
    if (productDatalist) productDatalist.innerHTML = optionsHTML;
    if (purchaseProductDatalist) purchaseProductDatalist.innerHTML = optionsHTML;
  }

  // Khởi tạo các sự kiện kéo thả (Drag & Drop) cho Excel Drop Zones
  initExcelDragAndDrop();

  // Cập nhật thống kê
  updateExcelHubUI();
}

// Caching dropdown sản phẩm
function cacheProductOptions() {
  if (!state.products) return;
  productOptionsHTML = state.products.map(p => `<option value="${p.name} (${p.id})">(Tồn: ${p.stock})</option>`).join("");
  productOptionsSalesHTML = state.products.map(p => `<option value="${p.name} (${p.id})">(Tồn: ${p.stock})</option>`).join("");

  const productDatalist = document.getElementById("datalist-sales-products");
  const purchaseProductDatalist = document.getElementById("datalist-purchase-products");
  if (state.products) {
    const optionsHTML = state.products.map(p =>
      `<option value="${p.name} (${p.id})">(Tồn: ${p.stock})</option>`
    ).join("");
    if (productDatalist) productDatalist.innerHTML = optionsHTML;
    if (purchaseProductDatalist) purchaseProductDatalist.innerHTML = optionsHTML;
  }
}

// Hàm cập nhật datalist sản phẩm (Backward-compatibility)
function populateDatalistProducts() {
  cacheProductOptions();
}

// Cập nhật thống kê trên Excel Hub
function updateExcelHubUI() {
  const statProds = document.getElementById("excel-stat-products");
  const statParts = document.getElementById("excel-stat-partners");
  const statVouch = document.getElementById("excel-stat-vouchers");
  const statStatus = document.getElementById("excel-stat-status");

  if (statProds && state.products) statProds.innerText = state.products.length.toLocaleString();
  if (statParts && state.partners) statParts.innerText = state.partners.length.toLocaleString();
  if (statVouch && state.vouchers) statVouch.innerText = state.vouchers.length.toLocaleString();
  if (statStatus) {
    if (state.vouchers && state.vouchers.length > 5) {
      statStatus.innerText = "Excel Database Active";
      statStatus.style.color = "var(--color-success)";
    } else {
      statStatus.innerText = "Demo Database Active";
      statStatus.style.color = "var(--color-warning)";
    }
  }
}

// Tìm đối tác thông minh
function resolvePartner(value) {
  const val = (value || "").toString().trim();
  if (!val) return { id: "DT_VANGLAI", name: "Khách hàng vãng lai" };

  // Hỗ trợ định dạng "Tên đối tác (Mã đối tác)"
  const match = val.match(/\(([^)]+)\)$/);
  if (match) {
    const idInParens = match[1].trim();
    let p = state.partners.find(item => String(item.id).toLowerCase() === idInParens.toLowerCase());
    if (p) return p;
  }

  // 1. Tìm chính xác theo ID
  let p = state.partners.find(item => String(item.id).toLowerCase() === val.toLowerCase());
  if (p) return p;

  // 2. Tìm chính xác theo Tên
  p = state.partners.find(item => item.name.toLowerCase() === val.toLowerCase());
  if (p) return p;

  // 3. Tìm tương đối theo Tên hoặc ID
  p = state.partners.find(item => item.name.toLowerCase().includes(val.toLowerCase()) || String(item.id).toLowerCase().includes(val.toLowerCase()));
  if (p) return p;

  // 4. Tạo đối tác mới tự động nếu không tồn tại
  return { id: val, name: val };
}

// Tìm sản phẩm thông minh từ từ khóa nhập (ID hoặc Tên) phục vụ autocomplete
function resolveProduct(value) {
  const val = (value || "").toString().trim();
  if (!val) return null;

  // Hỗ trợ định dạng "Tên sản phẩm (Mã sản phẩm)" khi nạp từ form sửa hoặc khi blur
  const match = val.match(/\(([^)]+)\)$/);
  if (match) {
    const idInParens = match[1].trim();
    let p = state.products.find(item => String(item.id).toLowerCase() === idInParens.toLowerCase());
    if (p) return p;
  }

  // 1. Tìm chính xác theo ID
  let p = state.products.find(item => String(item.id).toLowerCase() === val.toLowerCase());
  if (p) return p;

  // 2. Tìm chính xác theo Tên
  p = state.products.find(item => item.name.toLowerCase() === val.toLowerCase());
  if (p) return p;

  // 3. Tìm tương đối theo Tên hoặc ID
  p = state.products.find(item => item.name.toLowerCase().includes(val.toLowerCase()) || String(item.id).toLowerCase().includes(val.toLowerCase()));
  return p || null;
}

// Thiết lập kéo thả File Excel
function initExcelDragAndDrop() {
  const zones = [
    { id: 'excel-drop-zone-products', fileId: 'excel-file-products' },
    { id: 'excel-drop-zone-partners', fileId: 'excel-file-partners' },
    { id: 'excel-drop-zone-vouchers', fileId: 'excel-file-vouchers' }
  ];

  zones.forEach(zone => {
    const el = document.getElementById(zone.id);
    if (!el) return;

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('dragover');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('dragover');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dragover');

      const file = e.dataTransfer.files[0];
      if (file) {
        const type = zone.id.replace('excel-drop-zone-', '');
        parseExcelFile(file, type);
      }
    });
  });
}

function triggerFileInput(id) {
  const input = document.getElementById(id);
  if (input) input.click();
}

// Xử lý nộp file excel
function handleExcelImport(event, type) {
  const file = event.target.files[0];
  if (!file) return;
  parseExcelFile(file, type);
  // Clear input
  event.target.value = "";
}

// Bộ máy phân tích Excel động Client-side
function parseExcelFile(file, type) {
  if (typeof XLSX === "undefined") {
    showToast("Thư viện SheetJS chưa được nạp!", "danger");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (rows.length < 2) {
        showToast("File Excel trống hoặc không có dữ liệu!", "danger");
        return;
      }

      if (type === 'products') {
        let count = 0;
        // Phát hiện hàng chứa header động
        let headerRowIdx = 1; // Mặc định ở hàng chỉ số 1 (MISA template)
        for (let r = 0; r < Math.min(rows.length, 5); r++) {
          const rCells = rows[r] || [];
          const hasMa = rCells.some(cell => {
            const val = (cell || "").toString().trim().toLowerCase();
            return val === "mã" || val === "mã hàng" || val === "mã sản phẩm" || val === "mã đối tác" || val === "mã khách hàng";
          });
          const hasTen = rCells.some(cell => {
            const val = (cell || "").toString().trim().toLowerCase();
            return val === "tên" || val === "tên sản phẩm" || val === "tên đối tác" || val === "tên khách hàng";
          });
          if (hasMa && hasTen) {
            headerRowIdx = r;
            break;
          }
        }

        const headerRow = rows[headerRowIdx] || [];
        const isNewFormat = headerRow.length <= 15; // file mới có <= 15 cột, cũ có 57 cột

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          const name = (row[1] || "").toString().trim();
          if (!id || !name || id === "Mã" || id === "Mã sản phẩm" || id === "Mã hàng" || id === "TỔNG CỘNG") continue;

          let unit, minStock, stock, totalVal, avgCost;
          let initialStock, initialCost, salePrice1;
          let nature = "Vật tư hàng hóa";
          let defaultWarehouse = "";
          let warehouseAccount = "1561";
          let cogsAccount = "632";
          let revenueAccount = "51111";
          let inactive = false;

          if (isNewFormat) {
            // File mới: Mã(0) Tên(1) Tính chất(2) Nhóm(3) ĐVT(4) Tồn tối thiểu(5) Kho(6) TK kho(7) TK CP(8) TK DT(9) Ngừng TD(10) Tồn hiện tại(11) Giá trị tồn(12)
            unit = (row[4] || "Cái").toString().trim();
            minStock = safeParseFloat(row[5]);
            stock = safeParseFloat(row[11]);
            totalVal = safeParseFloat(row[12]);
            avgCost = stock > 0 ? Math.round(totalVal / stock) : 0;
            initialStock = stock;
            initialCost = avgCost;
            salePrice1 = avgCost;

            nature = String(row[2] || "Vật tư hàng hóa").trim();
            defaultWarehouse = String(row[6] || "").trim();
            warehouseAccount = String(row[7] || "1561").trim();
            cogsAccount = String(row[8] || "632").trim();
            revenueAccount = String(row[9] || "51111").trim();

            const inactiveVal = String(row[10] || "").trim();
            inactive = inactiveVal === "1" || inactiveVal === "Có" || inactiveVal === "True" || inactiveVal === "true";
          } else {
            // File cũ (57 cột): ĐVT ở col 7, Tồn tối thiểu col 9, Tồn kho col 31, Giá trị col 33
            unit = (row[7] || "Cái").toString().trim();
            minStock = safeParseFloat(row[9]);
            stock = safeParseFloat(row[31]);
            totalVal = safeParseFloat(row[33]);
            avgCost = stock > 0 ? Math.round(totalVal / stock) : (safeParseFloat(row[20]) || safeParseFloat(row[19]) || 0);

            initialStock = stock;
            initialCost = safeParseFloat(row[19]) || avgCost || 0;
            salePrice1 = safeParseFloat(row[21]);

            nature = String(row[2] || "Vật tư hàng hóa").trim();
            defaultWarehouse = String(row[11] || "").trim();
            warehouseAccount = String(row[12] || "1561").trim();
            cogsAccount = String(row[13] || "632").trim();
            revenueAccount = String(row[14] || "51111").trim();

            const inactiveVal = String(row[30] || "").trim();
            inactive = inactiveVal === "1" || inactiveVal === "Có" || inactiveVal === "True" || inactiveVal === "true";
          }

          const idx = state.products.findIndex(p => String(p.id) === String(id));
          const pObj = {
            id,
            name,
            unit,
            stock,
            avgCost,
            totalValue: stock * avgCost,
            minStock,
            group: (row[isNewFormat ? 3 : 3] || "").toString().trim(),
            initialStock,
            actualStock: stock,
            initialCost,
            salePrice1,
            lastPurchasePrice: safeParseFloat(row[20]) || avgCost,
            nature,
            defaultWarehouse,
            warehouseAccount,
            cogsAccount,
            revenueAccount,
            inactive,
            excelRow: row
          };
          if (idx !== -1) {
            state.products[idx] = { ...state.products[idx], ...pObj };
          } else {
            state.products.push(pObj);
          }
          count++;
        }
        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} sản phẩm từ file Excel (${isNewFormat ? 'định dạng mới' : 'định dạng cũ'})!`, "success");
      }

      else if (type === 'partners') {
        let count = 0;
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          const name = (row[1] || "").toString().trim();
          if (!id || !name || id === "Mã khách hàng" || id.startsWith("TỔNG")) continue;

          const address = (row[2] || "").toString().trim();
          const group = (row[3] || "").toString().trim().toUpperCase();
          const taxCode = (row[4] || "").toString().trim();
          const phone = (row[5] || "").toString().trim();
          const type = (group.includes("NCC") || id.startsWith("NCC")) ? "supplier" : "customer";
          const inactiveVal = row[6];
          // Hỗ trợ cả "TRUE"/"FALSE" (file cũ) và "Có"/"" (file mới)
          const inactive = inactiveVal === true || (inactiveVal || "").toString().toLowerCase() === "true"
            || (inactiveVal || "").toString().trim() === "Có";

          const idx = state.partners.findIndex(p => String(p.id) === String(id));
          const pObj = { id, name, type, phone, email: "", address, taxCode, group, inactive };
          if (idx !== -1) {
            state.partners[idx] = pObj;
          } else {
            state.partners.push(pObj);
          }
          count++;
        }

        // Cập nhật datalist
        const datalist = document.getElementById("datalist-partners");
        if (datalist) {
          datalist.innerHTML = state.partners.map(p =>
            `<option value="${p.name} (${p.id})">[${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
          ).join("");
        }

        saveState();
        showToast(`Đã nạp thành công ${count} đối tác từ file Excel!`, "success");
        filterPartners();
      }

      else if (type === 'debts_opening') {
        let count = 0;
        state.partnerOpeningBalances = state.partnerOpeningBalances || {};

        // Phát hiện định dạng: file mới xuất (10 cột: Mã, Tên, Loại, Dư đầu kỳ, PS Nợ, PS Có, Dư cuối kỳ, Địa chỉ, MST, ĐT)
        // hay file cũ 18 cột (Mã, Tên, Phải thu HĐ, Thu trước, Còn phải thu, ...)
        const hdr = rows[1] || [];
        const colCount = hdr.filter(h => (h || "").toString().trim() !== "").length;
        const isNewDebtFormat = colCount <= 12; // file mới có 10 cột

        // Xác định dòng bắt đầu dữ liệu: bỏ qua dòng tiêu đề, phạm vi (nếu có)
        let startRow = 2;
        // Nếu row[1] có giá trị ở col 0 trông như tiêu đề cột → startRow=2
        // Nếu row[2] lại là tiêu đề cột (file xuất mới có 3 header rows) → startRow=3
        const row1col0 = (rows[1] ? rows[1][0] : "").toString().trim();
        if (row1col0 === "Từ ngày:" || row1col0.startsWith("Từ")) startRow = 3;

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[0] || "").toString().trim();
          if (!id || id === "Mã" || id === "Mã khách hàng") continue;
          // Bỏ qua dòng tổng cộng
          if (id.startsWith("TỔNG") || id === "TỔNG KHÁCH HÀNG" || id === "TỔNG NHÀ CUNG CẤP") continue;

          const name = (row[1] || "").toString().trim();
          let debit = 0, credit = 0;

          if (isNewDebtFormat) {
            // File mới: Mã(0) Tên(1) Loại(2) Dư đầu kỳ(3) PS Nợ(4) PS Có(5) Dư cuối kỳ(6) Địa chỉ(7) MST(8) ĐT(9)
            const loai = (row[2] || "").toString().trim().toUpperCase();
            const duDauKy = safeParseFloat(row[3]);
            // KH: Dư đầu kỳ > 0 → debit; NCC: Dư đầu kỳ > 0 → credit
            if (loai === "NCC" || id.startsWith("NCC")) {
              debit = 0; credit = duDauKy;
            } else {
              debit = duDauKy; credit = 0;
            }
          } else {
            // File cũ 18 cột: row[2] = phải thu, row[3] = thu trước/giảm trừ
            debit = safeParseFloat(row[2]);
            credit = safeParseFloat(row[3]);
          }

          state.partnerOpeningBalances[id] = { debit, credit };

          const idx = state.partners.findIndex(p => String(p.id) === String(id));
          if (idx === -1) {
            const addrCol = isNewDebtFormat ? 7 : 5;
            const taxCol = isNewDebtFormat ? 8 : 6;
            const phoneCol = isNewDebtFormat ? 9 : 7;
            const loaiVal = isNewDebtFormat ? (row[2] || "").toString().trim().toUpperCase() : "";
            const pType = (loaiVal === "NCC" || id.startsWith("NCC")) ? "supplier" : "customer";
            state.partners.push({
              id, name,
              type: pType,
              phone: (row[phoneCol] || "").toString().trim(),
              email: "",
              address: (row[addrCol] || "").toString().trim(),
              taxCode: (row[taxCol] || "").toString().trim(),
              group: pType === "supplier" ? "NCC" : "KH",
              inactive: false
            });
          }
          count++;
        }

        // Cập nhật datalist
        const datalist = document.getElementById("datalist-partners");
        if (datalist) {
          datalist.innerHTML = state.partners.map(p =>
            `<option value="${p.name} (${p.id})">[${p.type === 'supplier' ? 'NCC' : 'KH'}]</option>`
          ).join("");
        }

        saveState();
        recalculateAccounting();
        showToast(`Đã nạp số dư đầu kỳ cho ${count} đối tác (${isNewDebtFormat ? 'định dạng mới' : 'định dạng cũ'})!`, "success");
        filterDebts();
      }

      else if (type === 'vouchers') {
        let count = 0;
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          const id = (row[2] || "").toString().trim();
          if (!id || id === "Số chứng từ") continue;

          const dateStr = excelDateToISOString(row[0]);
          const description = (row[3] || "Giao dịch phát sinh").toString().trim();
          const amount = safeParseFloat(row[4]);
          const partnerName = (row[5] || "Khách hàng vãng lai").toString().trim();
          const voucherTypeStr = (row[8] || "").toString().trim().toUpperCase();

          const descLower = description.toLowerCase();
          let paymentMethod = "111";
          if (descLower.includes("ck") || descLower.includes("chuyển khoản") || descLower.includes("ủy nhiệm chi") || descLower.includes("ngân hàng")) {
            paymentMethod = "112";
          }

          let type = "receipt";
          let debitAccount = "111";
          let creditAccount = "131";

          if (voucherTypeStr.includes("CHI") || voucherTypeStr.includes("MUA HÀNG") || voucherTypeStr.includes("TRẢ LẠI")) {
            type = "payment";
            debitAccount = "331";
            creditAccount = paymentMethod;

            if (descLower.includes("mua hàng") || descLower.includes("nhập kho")) {
              debitAccount = "156";
            } else if (descLower.includes("chi phí") || descLower.includes("thuê xưởng")) {
              debitAccount = "642";
            }
          } else {
            type = "receipt";
            debitAccount = paymentMethod;
            creditAccount = "131";
            if (descLower.includes("doanh thu") || descLower.includes("bán hàng")) {
              creditAccount = "511";
            }
          }

          let partnerId = "";
          const matched = state.partners.find(p => p.name === partnerName);
          if (matched) {
            partnerId = matched.id;
          } else {
            partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
            state.partners.push({ id: partnerId, name: partnerName, type: type === "receipt" ? "customer" : "supplier", phone: "", email: "", address: "" });
          }

          const idx = state.vouchers.findIndex(v => v.id === id);
          const vObj = {
            id,
            type,
            date: dateStr,
            partnerId,
            partnerName,
            paymentMethod,
            description,
            amount,
            isImported: true,
            entries: [{ debit: debitAccount, credit: creditAccount, amount, desc: description }]
          };
          if (idx !== -1) {
            state.vouchers[idx] = vObj;
          } else {
            state.vouchers.push(vObj);
          }
          count++;
        }
        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} chứng từ vào sổ cái!`, "success");
      } else if (type === 'sales') {
        let isDetailed = false;
        let headerIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          if (rows[r] && rows[r].includes("Số chứng từ") && rows[r].includes("Mã hàng")) {
            headerIdx = r;
            isDetailed = true;
            break;
          }
        }

        if (isDetailed) {
          let count = 0;
          const groupMap = new Map();
          const startRow = headerIdx + 1;
          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            const voucherId = (row[2] || "").toString().trim();
            if (!voucherId || voucherId.startsWith("TỔNG")) continue;

            if (!groupMap.has(voucherId)) {
              groupMap.set(voucherId, []);
            }
            groupMap.get(voucherId).push(row);
          }

          const partnerMap = new Map();
          state.partners.forEach(p => partnerMap.set(p.id, p));

          const productMap = new Map();
          state.products.forEach(p => productMap.set(p.id, p));

          const voucherMap = new Map();
          state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

          for (const [voucherId, voucherRows] of groupMap.entries()) {
            const firstRow = voucherRows[0];
            const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);

            const partnerIdRaw = (firstRow[7] || "").toString().trim();
            const partnerId = partnerIdRaw ? partnerIdRaw : `DT_${Math.floor(1000 + Math.random() * 9000)}`;
            const partnerName = (firstRow[8] || "Khách hàng vãng lai").toString().trim();
            const description = (firstRow[5] || "Bán hàng").toString().trim();

            if (!partnerMap.has(partnerId)) {
              const pObj = {
                id: partnerId,
                name: partnerName,
                type: "customer",
                phone: "",
                email: "",
                address: ""
              };
              state.partners.push(pObj);
              partnerMap.set(partnerId, pObj);
            }

            let paymentMethod = "131";
            const descUpper = description.toUpperCase();
            const nameUpper = partnerName.toUpperCase();
            if (descUpper.includes("TIỀN MẶT") || descUpper.includes("TM") || nameUpper.includes("BÁN LẺ") || nameUpper.includes("KHÁCH LẺ") || nameUpper.includes("VÃNG LAI")) {
              paymentMethod = "111";
            }

            const itemsArray = [];
            let totalVoucherAmount = 0;

            for (const row of voucherRows) {
              const productId = (row[9] || "SP_GENERIC").toString().trim();
              const productName = (row[10] || "Sản phẩm generic").toString().trim();
              const unit = (row[11] || "Cái").toString().trim();
              const qty = safeParseFloat(row[12]);
              const price = safeParseFloat(row[13]);
              const discountVal = safeParseFloat(row[15]);

              const grossAmount = qty * price;
              const amount = grossAmount - discountVal;
              const discountPercent = grossAmount > 0 ? Math.round((discountVal / grossAmount) * 100 * 100) / 100 : 0;

              itemsArray.push({
                productId: productId,
                qty: qty,
                price: price,
                discount: discountPercent,
                amount: amount
              });

              totalVoucherAmount += amount;

              if (!productMap.has(productId)) {
                const prodObj = {
                  id: productId,
                  name: productName,
                  unit: unit,
                  stock: 0,
                  avgCost: 0,
                  totalValue: 0
                };
                state.products.push(prodObj);
                productMap.set(productId, prodObj);
              }
            }

            const vObj = {
              id: voucherId,
              type: "sales",
              date: dateStr,
              partnerId: partnerId,
              partnerName: partnerName,
              paymentMethod: paymentMethod,
              description: description,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: totalVoucherAmount,
              amount: totalVoucherAmount,
              isImported: true,
              items: itemsArray
            };

            const existingIdx = voucherMap.get(voucherId);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(voucherId, state.vouchers.length - 1);
            }
            count++;
          }

          saveState();
          recalculateAccounting();
          showToast(`Đã nạp thành công ${count} chứng từ chi tiết bán hàng từ file Excel!`, "success");
          if (typeof filterSales === "function") filterSales();
          if (typeof renderDashboard === "function") renderDashboard();
        } else {
          let count = 0;
          const partnerMap = new Map();
          state.partners.forEach(p => partnerMap.set(p.name, p.id));
          const voucherMap = new Map();
          state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

          for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            const id = (row[2] || "").toString().trim();
            if (!id || id === "Số chứng từ") continue;

            const dateStr = excelDateToISOString(row[0]);
            const partnerName = (row[6] || "Khách hàng vãng lai").toString().trim();
            const description = (row[7] || "Bán hàng").toString().trim();

            const H = safeParseFloat(row[8]);
            const C = safeParseFloat(row[9]);
            const T = safeParseFloat(row[10]);
            const totalAmount = safeParseFloat(row[11]);

            let paymentMethod = "131";
            const docTypeStr = (row[14] || "").toString().trim().toUpperCase();
            if (docTypeStr.includes("TIỀN MẶT")) {
              paymentMethod = "111";
            }

            let partnerId = partnerMap.get(partnerName);
            if (!partnerId) {
              partnerId = `DT_${Math.floor(1000 + Math.random() * 9000)}`;
              state.partners.push({
                id: partnerId,
                name: partnerName,
                type: "customer",
                phone: "",
                email: "",
                address: ""
              });
              partnerMap.set(partnerName, partnerId);
            }

            const originalRow = [];
            for (let col = 0; col < 15; col++) {
              originalRow[col] = row[col] !== undefined ? row[col] : "";
            }

            const vObj = {
              id,
              type: "sales",
              date: dateStr,
              partnerId,
              partnerName,
              paymentMethod,
              description,
              taxRate: 0,
              taxAmount: T,
              totalAmount: totalAmount,
              amount: totalAmount,
              isImported: true,
              items: [
                {
                  productId: "SP_GENERIC",
                  qty: 1,
                  price: H,
                  discount: H > 0 ? Math.round((C / H) * 100 * 100) / 100 : 0,
                  amount: H - C
                }
              ],
              excelRow: originalRow
            };

            const existingIdx = voucherMap.get(id);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(id, state.vouchers.length - 1);
            }
            count++;
          }
          saveState();
          recalculateAccounting();
          showToast(`Đã nạp thành công ${count} hóa đơn bán hàng vào lịch sử!`, "success");
          if (typeof filterSales === "function") filterSales();
        }
      }
      
      else if (type === 'purchase' || type === 'purchase_return' || type === 'sales_return') {
        let count = 0;
        const groupMap = new Map();
        
        let startRow = 2;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const firstVal = (rows[i] ? rows[i][2] : "").toString().trim();
          if (firstVal === "Số chứng từ") {
            startRow = i + 1;
            break;
          }
        }

        let colQty = 13;
        let colPrice = 14;
        let colAmount = 17;

        let headerIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          if (rows[r] && rows[r].includes("Số chứng từ") && rows[r].includes("Mã hàng")) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx !== -1) {
          const header = rows[headerIdx];
          const qIdx = header.indexOf("Số lượng mua") !== -1 ? header.indexOf("Số lượng mua") : header.indexOf("Số lượng");
          const pIdx = header.indexOf("Đơn giá");
          const aIdx = header.indexOf("Giá trị mua") !== -1 ? header.indexOf("Giá trị mua") : header.indexOf("Thành tiền");
          if (qIdx !== -1) colQty = qIdx;
          if (pIdx !== -1) colPrice = pIdx;
          if (aIdx !== -1) colAmount = aIdx;
        }

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          const voucherId = (row[2] || "").toString().trim();
          if (!voucherId || voucherId.startsWith("TỔNG")) continue;

          if (!groupMap.has(voucherId)) {
            groupMap.set(voucherId, []);
          }
          groupMap.get(voucherId).push(row);
        }

        const partnerMap = new Map();
        state.partners.forEach(p => partnerMap.set(p.id, p));

        const productMap = new Map();
        state.products.forEach(p => productMap.set(p.id, p));

        const voucherMap = new Map();
        state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

        const partnerId = type === 'purchase' ? "NCC_EXCEL" : (type === 'sales_return' ? "KH_RETURN_EXCEL" : "NCC_RETURN_EXCEL");
        const partnerName = type === 'purchase' ? "Nhà cung cấp Sổ chi tiết" : (type === 'sales_return' ? "Khách hàng Trả lại" : "Nhà cung cấp Trả lại");
        const partnerType = type === 'purchase' ? "supplier" : (type === 'sales_return' ? "customer" : "supplier");
        if (!partnerMap.has(partnerId)) {
          const pObj = {
            id: partnerId,
            name: partnerName,
            type: partnerType,
            phone: "",
            email: "",
            address: ""
          };
          state.partners.push(pObj);
          partnerMap.set(partnerId, pObj);
        }

        for (const [voucherId, voucherRows] of groupMap.entries()) {
          const firstRow = voucherRows[0];
          const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);
          const invoiceNo = firstRow[4] || "";
          const description = type === 'purchase'
            ? `Nhập kho mua hàng theo số hóa đơn ${invoiceNo || voucherId}`
            : (type === 'sales_return'
               ? `Nhập kho hàng bán trả lại theo số hóa đơn ${invoiceNo || voucherId}`
               : `Xuất kho trả lại hàng theo số hóa đơn ${invoiceNo || voucherId}`);

          const itemsArray = [];
          let totalVoucherAmount = 0;

          for (const row of voucherRows) {
            const productId = (row[5] || "SP_GENERIC").toString().trim();
            const productName = (row[6] || "Sản phẩm generic").toString().trim();
            const unit = (row[7] || "Cái").toString().trim();
            const qty = safeParseFloat(row[colQty]);
            const price = safeParseFloat(row[colPrice]);
            const amount = safeParseFloat(row[colAmount]) || (qty * price);

            itemsArray.push({
              productId: productId,
              qty: qty,
              price: price,
              amount: amount
            });

            totalVoucherAmount += amount;

            if (!productMap.has(productId)) {
              const prodObj = {
                id: productId,
                name: productName,
                unit: unit,
                stock: 0,
                avgCost: 0,
                totalValue: 0
              };
              state.products.push(prodObj);
              productMap.set(productId, prodObj);
            }
          }

          const vObj = {
            id: voucherId,
            type: type,
            date: dateStr,
            partnerId: partnerId,
            partnerName: partnerName,
            paymentMethod: type === 'sales_return' ? "131" : "331",
            description: description,
            taxRate: 0,
            taxAmount: 0,
            totalAmount: totalVoucherAmount,
            amount: totalVoucherAmount,
            isImported: true,
            items: itemsArray
          };

          const existingIdx = voucherMap.get(voucherId);
          if (existingIdx !== undefined) {
            state.vouchers[existingIdx] = vObj;
          } else {
            state.vouchers.push(vObj);
            voucherMap.set(voucherId, state.vouchers.length - 1);
          }
          count++;
        }

        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} chứng từ ${type === 'purchase' ? 'mua hàng' : (type === 'sales_return' ? 'hàng bán trả lại' : 'trả lại hàng')} từ file Excel!`, "success");
        if (type === 'purchase') {
          if (typeof filterPurchaseTable === "function") filterPurchaseTable();
          if (typeof renderPurchaseTable === "function") renderPurchaseTable();
        } else if (type === 'sales_return') {
          if (typeof filterSalesReturnTable === "function") filterSalesReturnTable();
          if (typeof renderSalesReturnTable === "function") renderSalesReturnTable();
        } else {
          if (typeof filterPurchaseReturnTable === "function") filterPurchaseReturnTable();
          if (typeof renderPurchaseReturnTable === "function") renderPurchaseReturnTable();
        }
      } else if (type === 'purchase_order') {
        let count = 0;
        
        // 1. Phân biệt định dạng
        let headerIdx = -1;
        let isDetailedFormat = false;

        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          const row = rows[r];
          if (row && (row.includes("Số chứng từ") || row.includes("Số đơn hàng"))) {
            headerIdx = r;
            if (row.includes("Mã hàng") || row.includes("Mã SP")) {
              isDetailedFormat = true;
            }
            break;
          }
        }

        const partnerMap = new Map();
        state.partners.forEach(p => partnerMap.set(p.id, p));

        const productMap = new Map();
        state.products.forEach(p => productMap.set(p.id, p));

        const voucherMap = new Map();
        state.vouchers.forEach((v, idx) => voucherMap.set(v.id, idx));

        if (isDetailedFormat) {
          // --- THẾ HỆ CŨ: SỔ CHI TIẾT ---
          const groupMap = new Map();
          let startRow = headerIdx !== -1 ? headerIdx + 1 : 2;

          let colQty = 13;
          let colPrice = 14;
          let colAmount = 17;

          if (headerIdx !== -1) {
            const header = rows[headerIdx];
            const qIdx = header.indexOf("Số lượng mua") !== -1 ? header.indexOf("Số lượng mua") : header.indexOf("Số lượng");
            const pIdx = header.indexOf("Đơn giá");
            const aIdx = header.indexOf("Giá trị mua") !== -1 ? header.indexOf("Giá trị mua") : header.indexOf("Thành tiền");
            if (qIdx !== -1) colQty = qIdx;
            if (pIdx !== -1) colPrice = pIdx;
            if (aIdx !== -1) colAmount = aIdx;
          }

          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            const voucherId = (row[2] || "").toString().trim();
            if (!voucherId || voucherId.startsWith("TỔNG")) continue;

            if (!groupMap.has(voucherId)) {
              groupMap.set(voucherId, []);
            }
            groupMap.get(voucherId).push(row);
          }

          const partnerId = "NCC_ORDER_EXCEL";
          const partnerName = "Nhà cung cấp Đơn đặt hàng Sổ chi tiết";
          if (!partnerMap.has(partnerId)) {
            const pObj = {
              id: partnerId,
              name: partnerName,
              type: "supplier",
              phone: "",
              email: "",
              address: ""
            };
            state.partners.push(pObj);
            partnerMap.set(partnerId, pObj);
          }

          for (const [voucherId, voucherRows] of groupMap.entries()) {
            const firstRow = voucherRows[0];
            const dateStr = excelDateToISOString(firstRow[1] || firstRow[0]);
            const invoiceNo = firstRow[4] || "";
            const description = `Đơn đặt hàng mua hàng theo số ${invoiceNo || voucherId}`;

            const itemsArray = [];
            let totalVoucherAmount = 0;

            for (const row of voucherRows) {
              const productId = (row[5] || "SP_GENERIC").toString().trim();
              const productName = (row[6] || "Sản phẩm generic").toString().trim();
              const unit = (row[7] || "Cái").toString().trim();
              const qty = safeParseFloat(row[colQty]);
              const price = safeParseFloat(row[colPrice]);
              const amount = safeParseFloat(row[colAmount]) || (qty * price);

              itemsArray.push({
                productId: productId,
                qty: qty,
                price: price,
                amount: amount
              });

              totalVoucherAmount += amount;

              if (!productMap.has(productId)) {
                const prodObj = {
                  id: productId,
                  name: productName,
                  unit: unit,
                  stock: 0,
                  avgCost: 0,
                  totalValue: 0
                };
                state.products.push(prodObj);
                productMap.set(productId, prodObj);
              }
            }

            const vObj = {
              id: voucherId,
              type: "purchase_order",
              date: dateStr,
              partnerId: partnerId,
              partnerName: partnerName,
              paymentMethod: "331",
              description: description,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: totalVoucherAmount,
              amount: totalVoucherAmount,
              isImported: true,
              items: itemsArray
            };

            const existingIdx = voucherMap.get(voucherId);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(voucherId, state.vouchers.length - 1);
            }
            count++;
          }
        } else {
          // --- THẾ HỆ MỚI: DANH SÁCH ĐƠN MUA HÀNG (MẪU DON_MUA_HANG.XLSX) ---
          let startRow = headerIdx !== -1 ? headerIdx + 1 : 2;
          const header = headerIdx !== -1 ? rows[headerIdx] : [];

          const colDate = header.indexOf("Ngày đơn hàng") !== -1 ? header.indexOf("Ngày đơn hàng") : 1;
          const colId = header.indexOf("Số đơn hàng") !== -1 ? header.indexOf("Số đơn hàng") : 2;
          const colPartner = header.indexOf("Nhà cung cấp") !== -1 ? header.indexOf("Nhà cung cấp") : 4;
          const colDesc = header.indexOf("Diễn giải") !== -1 ? header.indexOf("Diễn giải") : 5;
          const colTotal = header.indexOf("Giá trị đơn hàng") !== -1 ? header.indexOf("Giá trị đơn hàng") : 6;

          // Đảm bảo có sản phẩm generic
          const genericProductId = "SP_GENERIC";
          const genericProductName = "Sản phẩm tổng hợp (Theo đơn hàng)";
          if (!productMap.has(genericProductId)) {
            const prodObj = {
              id: genericProductId,
              name: genericProductName,
              unit: "Cái",
              stock: 0,
              avgCost: 0,
              totalValue: 0
            };
            state.products.push(prodObj);
            productMap.set(genericProductId, prodObj);
          }

          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const voucherId = (row[colId] || "").toString().trim();
            if (!voucherId || voucherId === "" || voucherId.startsWith("TỔNG")) continue;

            const rawDate = row[colDate];
            const dateStr = excelDateToISOString(rawDate);
            const partnerInputVal = (row[colPartner] || "").toString().trim();
            const description = (row[colDesc] || "").toString().trim() || "Đơn đặt hàng nhập khẩu lịch sử";
            const totalAmount = safeParseFloat(row[colTotal]);

            // Resolve/Create Partner
            const resolvedPartner = resolvePartner(partnerInputVal);
            const pId = resolvedPartner.id;
            const pName = resolvedPartner.name;

            if (!partnerMap.has(pId)) {
              const pObj = {
                id: pId,
                name: pName,
                type: "supplier",
                phone: "",
                email: "",
                address: ""
              };
              state.partners.push(pObj);
              partnerMap.set(pId, pObj);
            }

            // Create generic item list for the PO
            const itemsArray = [
              {
                productId: genericProductId,
                qty: 1,
                price: totalAmount,
                amount: totalAmount
              }
            ];

            const vObj = {
              id: voucherId,
              type: "purchase_order",
              date: dateStr,
              partnerId: pId,
              partnerName: pName,
              paymentMethod: "331",
              description: description,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: totalAmount,
              amount: totalAmount,
              isImported: true,
              items: itemsArray
            };

            const existingIdx = voucherMap.get(voucherId);
            if (existingIdx !== undefined) {
              state.vouchers[existingIdx] = vObj;
            } else {
              state.vouchers.push(vObj);
              voucherMap.set(voucherId, state.vouchers.length - 1);
            }
            count++;
          }
        }

        saveState();
        recalculateAccounting();
        showToast(`Đã nạp thành công ${count} đơn đặt hàng từ file Excel!`, "success");
        if (typeof filterPurchaseOrderTable === "function") filterPurchaseOrderTable();
        if (typeof renderPurchaseOrderTable === "function") renderPurchaseOrderTable();
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi phân tích file Excel. Định dạng không tương thích!", "danger");
    }
  };
  reader.readAsArrayBuffer(file);
}

// Convert Excel Serial Date in Client
function excelDateToISOString(serial) {
  if (!serial) return new Date().toISOString().split('T')[0];
  if (typeof serial === "string") return serial.split('T')[0];
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return date.toISOString().split('T')[0];
}

// Ghi đè cơ sở dữ liệu mặc định từ Excel
function syncDefaultExcelDatabase() {
  if (typeof PREPOPULATED_DATABASE === "undefined") {
    showToast("Cơ sở dữ liệu tích hợp Excel chưa được nạp sẵn!", "danger");
    return;
  }
  if (confirm("XÁC NHẬN: Bạn có chắc chắn muốn đồng bộ toàn bộ dữ liệu Excel gốc? Toàn bộ giao dịch và thiết lập hiện tại sẽ được ghi đè hoàn toàn bằng 9.297 đối tác, 1.588 sản phẩm và 2.153 chứng từ từ folder Excel.")) {
    state = JSON.parse(JSON.stringify(PREPOPULATED_DATABASE));
    initializeMissingExcelRows();
    saveState();
    initExcelIntegration();
    recalculateAccounting();
    showToast("Đồng bộ Cơ sở dữ liệu tích hợp Excel thành công!", "success");
    switchTab("dashboard");
  }
}

// Xem biểu mẫu in ấn chứng từ excel mẫu chuẩn MISA
function viewExcelFormSample(type) {
  const id = type === 'PT' ? 'PT13134' : 'PC7194';
  const v = state.vouchers.find(x => x.id === id);
  if (v) {
    viewVoucher(id);
  } else {
    let sampleV = {};
    if (type === 'PT') {
      sampleV = {
        id: "PT13134",
        type: "receipt",
        date: "2026-05-18",
        partnerName: "Anh Cường (KH7970T02/2026)",
        paymentMethod: "111",
        description: "PT4054/q82 Anh Cường (KH7970T02/2026) nộp tiền mua hàng",
        amount: 17944820,
        entries: [{ debit: "1111", credit: "131", amount: 17944820, desc: "PT4054/q82 Anh Cường thu nợ" }]
      };
    } else {
      sampleV = {
        id: "PC7194",
        type: "payment",
        date: "2026-05-19",
        partnerName: "Công ty TNHH Sản Xuất Thương Mại Dịch Vụ Lan Thanh",
        paymentMethod: "111",
        description: "Chi khác ck thanh toán lan thanh",
        amount: 120000000,
        entries: [{ debit: "331", credit: "1111", amount: 120000000, desc: "Chi trả nợ cho Lan Thanh" }]
      };
    }
    state.vouchers.push(sampleV);
    viewVoucher(sampleV.id);
    state.vouchers = state.vouchers.filter(x => x.id !== id);
  }
}

// Xuất dữ liệu hệ thống ra file Excel
function exportDataToExcelSample() {
  exportProductsToExcel();
  setTimeout(() => {
    exportPartnersToExcel();
  }, 300);
  setTimeout(() => {
    exportCashToExcel();
  }, 600);
}
window.autoIntegrateSoChiTietMuaHangExcel = autoIntegrateSoChiTietMuaHangExcel;