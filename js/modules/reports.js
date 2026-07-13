
// 10. PHÂN HỆ LẬP BÁO CÁO KẾ TOÁN (REPORTS ENGINE)
function escapeReportText(value) {
  if (typeof escapeHtml === "function") return escapeHtml(String(value ?? ""));
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function populateReportAccountDropdown() {
  const select = document.getElementById("select-report-account");
  if (!select) return;

  const std = state.accountingStandard;
  const accounts = [
    { code: "111", name: "Tiền mặt" },
    { code: "112", name: "Tiền gửi ngân hàng" },
    { code: "131", name: "Phải thu khách hàng" },
    { code: "156", name: "Hàng hóa tồn kho" },
    { code: std === "TT200" ? "244" : "1386", name: "Phải thu ký quỹ, ký cược" },
    { code: "1331", name: "Thuế GTGT đầu vào được khấu trừ" },
    { code: "331", name: "Phải trả người bán" },
    { code: "3331", name: "Thuế GTGT đầu ra phải nộp" },
    { code: std === "TT200" ? "344" : "3386", name: "Phải trả nhận ký quỹ, ký cược" },
    { code: "511", name: "Doanh thu bán hàng" },
    { code: "632", name: "Giá vốn hàng bán" }
  ];

  select.innerHTML = accounts.map(a => `<option value="${a.code}">${a.code} - ${a.name}</option>`).join("");
}

// Xử lý khi đổi loại báo cáo
function handleReportTypeChange() {
  const type = document.getElementById("select-report-type").value;
  const acctSelect = document.getElementById("report-account-selector-wrapper");

  if (type === "ledger") {
    acctSelect.style.display = "";
  } else {
    acctSelect.style.display = "none";
  }

  generateReport();
}

// Tạo lập Báo cáo Động
function generateReport() {
  const container = document.getElementById("printable-report-area");
  if (!container) return;

  const type = document.getElementById("select-report-type").value;
  const std = state.accountingStandard;

  let html = "";

  // A. BÁO CÁO 1: SỔ NHẬT KÝ CHUNG
  if (type === "journal") {
    html += `
      <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin-bottom:20px;">
        <h2 style="font-size: 20px; font-weight: bold; text-transform: uppercase;">SỔ NHẬT KÝ CHUNG</h2>
        <p style="font-style: italic; font-size:13px;">Niên độ kế toán năm ${new Date().getFullYear()}</p>
        <p style="font-size:12px;">Áp dụng theo ${std === 'TT200' ? 'Thông tư 200/2014/TT-BTC' : 'Thông tư 133/2016/TT-BTC'}</p>
      </div>

      <table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background-color:#f3f4f6;">
            <th style="border:1px solid #000; padding:6px; color:#000;">Ngày hạch toán</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Số chứng từ</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Diễn giải giao dịch</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:center;">TK Nợ</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:center;">TK Có</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Số tiền phát sinh</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalVal = 0;
    if (state.vouchers.length === 0) {
      html += `<tr><td colspan="6" style="text-align:center; padding:10px; border:1px solid #000;">Chưa có dữ liệu chứng từ.</td></tr>`;
    } else {
      state.vouchers.forEach(v => {
        (v.entries || []).forEach((e, idx) => {
          totalVal += e.amount;
          html += `
            <tr>
              <td style="border:1px solid #000; padding:6px; color:#000;">${idx === 0 ? escapeReportText(v.date) : ""}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; font-weight:700;">${idx === 0 ? escapeReportText(v.id) : ""}</td>
              <td style="border:1px solid #000; padding:6px; color:#000;">${escapeReportText(e.desc)}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; text-align:center; font-weight:700;">${escapeReportText(e.debit)}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; text-align:center; font-weight:700;">${escapeReportText(e.credit)}</td>
              <td style="border:1px solid #000; padding:6px; color:#000; text-align:right; font-weight:700;" class="font-numeric">${formatVND(e.amount)}</td>
            </tr>
          `;
        });
      });
    }

    html += `
          <tr style="background-color:#e5e7eb; font-weight:bold;">
            <td colspan="5" style="border:1px solid #000; padding:8px; text-align:center;">TỔNG PHÁT SINH NHẬT KÝ CHUNG</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(totalVal)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Chữ ký báo cáo -->
      ${getReportSignaturesHTML()}
    `;
  }

  // B. BÁO CÁO 2: SỔ CÁI CHI TIẾT TÀI KHOẢN
  else if (type === "ledger") {
    const acctCode = document.getElementById("select-report-account").value;
    const acctName = state.initialBalances[acctCode] ? state.initialBalances[acctCode].name : "Tài khoản";

    html += `
      <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin-bottom:20px;">
        <h2 style="font-size: 20px; font-weight: bold; text-transform: uppercase;">SỔ CÁI TÀI KHOẢN</h2>
        <h3 style="font-size: 16px; font-weight: bold;">Tài khoản: ${escapeReportText(acctCode)} - ${escapeReportText(acctName)}</h3>
        <p style="font-style: italic; font-size:12px;">Niên độ kế toán năm ${new Date().getFullYear()}</p>
      </div>

      <table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background-color:#f3f4f6;">
            <th style="border:1px solid #000; padding:6px; color:#000;">Ngày</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Số chứng từ</th>
            <th style="border:1px solid #000; padding:6px; color:#000;">Diễn giải giao dịch đối ứng</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:center;">TK đối ứng</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Phát sinh Nợ (đ)</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Phát sinh Có (đ)</th>
            <th style="border:1px solid #000; padding:6px; color:#000; text-align:right;">Số dư lũy kế (đ)</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Lấy số dư đầu kỳ
    const initBalObj = state.initialBalances[acctCode] || { type: "debit", balance: 0 };
    let currentBalance = initBalObj.balance;
    const isDebitAccount = initBalObj.type === "debit";

    html += `
      <tr style="background-color: rgba(0,0,0,0.02); font-style: italic;">
        <td>01/01/2026</td>
        <td>-</td>
        <td style="font-weight:700;">SỐ DƯ ĐẦU KỲ</td>
        <td style="text-align:center;">-</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right font-numeric" style="font-weight:700;">${formatVND(currentBalance)}</td>
      </tr>
    `;

    let totalDebit = 0;
    let totalCredit = 0;

    // Quét qua các nghiệp vụ trong nhật ký
    state.vouchers.forEach(v => {
      (v.entries || []).forEach(e => {
        if (e.debit !== acctCode && e.credit !== acctCode) return;

        let dbAmt = 0;
        let crAmt = 0;
        let oppositeAcct = "";

        if (e.debit === acctCode) {
          dbAmt = e.amount;
          totalDebit += dbAmt;
          oppositeAcct = e.credit;
          currentBalance += isDebitAccount ? dbAmt : -dbAmt;
        } else {
          crAmt = e.amount;
          totalCredit += crAmt;
          oppositeAcct = e.debit;
          currentBalance += isDebitAccount ? -crAmt : crAmt;
        }

        html += `
          <tr>
            <td style="border:1px solid #000; padding:6px; color:#000;">${escapeReportText(v.date)}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; font-weight:700;">${escapeReportText(v.id)}</td>
            <td style="border:1px solid #000; padding:6px; color:#000;">${escapeReportText(e.desc)}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:center; font-weight:700;">${escapeReportText(oppositeAcct)}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:right;" class="font-numeric">${dbAmt > 0 ? formatVND(dbAmt) : "-"}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:right;" class="font-numeric">${crAmt > 0 ? formatVND(crAmt) : "-"}</td>
            <td style="border:1px solid #000; padding:6px; color:#000; text-align:right;" class="font-numeric">${formatVND(currentBalance)}</td>
          </tr>
        `;
      });
    });

    html += `
          <tr style="background-color:#f3f4f6; font-weight:bold;">
            <td colspan="4" style="border:1px solid #000; padding:8px; text-align:center;">CỘNG PHÁT SINH TRONG KỲ</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(totalDebit)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(totalCredit)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">-</td>
          </tr>
          <tr style="background-color:#e5e7eb; font-weight:bold;">
            <td colspan="6" style="border:1px solid #000; padding:8px; text-align:center;">SỐ DƯ CUỐI KỲ</td>
            <td style="border:1px solid #000; padding:8px; text-align:right; color:var(--color-primary);" class="font-numeric">${formatVND(currentBalance)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Chữ ký báo cáo -->
      ${getReportSignaturesHTML()}
    `;
  }

  // C. BÁO CÁO 3: BẢNG CÂN ĐỐI PHÁT SINH TÀI KHOẢN (TRÌNH TRẠNG THÁI CAO CẤP NHẤT)
  else if (type === "balance") {
    html += `
      <div style="text-align:center; font-family:'Times New Roman', serif; color:#000; margin-bottom:20px;">
        <h2 style="font-size: 20px; font-weight: bold; text-transform: uppercase;">BẢNG CÂN ĐỐI PHÁT SINH TÀI KHOẢN</h2>
        <p style="font-style: italic; font-size:12px;">Niên độ kế toán năm ${new Date().getFullYear()}</p>
        <p style="font-size:11px;">(Đảm bảo tính chính xác và cân đối kép của toàn bộ hệ thống)</p>
      </div>

      <table class="data-table" style="width:100%; font-family:'Times New Roman', serif; border:1px solid #000; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="background-color:#e5e7eb;">
            <th rowspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center; width:80px;">Mã TK</th>
            <th rowspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:left;">Tên tài khoản kế toán</th>
            <th colspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center;">Số dư đầu kỳ (đ)</th>
            <th colspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center;">Số phát sinh trong kỳ (đ)</th>
            <th colspan="2" style="border:1px solid #000; padding:6px; color:#000; text-align:center;">Số dư cuối kỳ (đ)</th>
          </tr>
          <tr style="background-color:#f3f4f6;">
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Nợ</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Có</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Nợ</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Có</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Nợ</th>
            <th style="border:1px solid #000; padding:4px; color:#000; text-align:right;">Có</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Tính toán cân đối cho toàn bộ tài khoản
    const balanceData = calculateTrialBalance();

    let sumOpDeb = 0, sumOpCre = 0;
    let sumMovDeb = 0, sumMovCre = 0;
    let sumClDeb = 0, sumClCre = 0;

    balanceData.forEach(row => {
      sumOpDeb += row.openDebit;
      sumOpCre += row.openCredit;
      sumMovDeb += row.moveDebit;
      sumMovCre += row.moveCredit;
      sumClDeb += row.closeDebit;
      sumClCre += row.closeCredit;

      html += `
        <tr>
          <td style="border:1px solid #000; padding:6px; text-align:center; font-weight:700; color:#000;">${escapeReportText(row.code)}</td>
          <td style="border:1px solid #000; padding:6px; font-weight:600; color:#000;">${escapeReportText(row.name)}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.openDebit > 0 ? formatVND(row.openDebit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.openCredit > 0 ? formatVND(row.openCredit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.moveDebit > 0 ? formatVND(row.moveDebit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;" class="font-numeric">${row.moveCredit > 0 ? formatVND(row.moveCredit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:700; color:var(--color-primary);" class="font-numeric">${row.closeDebit > 0 ? formatVND(row.closeDebit) : "-"}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:700; color:var(--color-warning);" class="font-numeric">${row.closeCredit > 0 ? formatVND(row.closeCredit) : "-"}</td>
        </tr>
      `;
    });

    html += `
          <tr style="background-color:#e5e7eb; font-weight:bold; color:#000;">
            <td colspan="2" style="border:1px solid #000; padding:8px; text-align:center;">CỘNG CÂN ĐỐI</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumOpDeb)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumOpCre)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumMovDeb)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right;" class="font-numeric">${formatVND(sumMovCre)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right; color:var(--color-primary);" class="font-numeric">${formatVND(sumClDeb)}</td>
            <td style="border:1px solid #000; padding:8px; text-align:right; color:var(--color-warning);" class="font-numeric">${formatVND(sumClCre)}</td>
          </tr>
        </tbody>
      </table>

      <p style="font-size: 11px; margin-top:8px; font-style:italic; color:#444;">
        * Nhận xét: Tổng phát sinh Nợ luôn luôn bằng Tổng phát sinh Có trên từng phân khúc dữ liệu giúp bảo toàn tuyệt đối nguyên lý định khoản kép.
      </p>

      <!-- Chữ ký báo cáo -->
      ${getReportSignaturesHTML()}
    `;
  }

  container.innerHTML = html;
}

// Bảng chữ ký kế toán Việt Nam mẫu
function getReportSignaturesHTML() {
  return `
    <div style="display:flex; justify-content:space-between; margin-top:30px; font-family:'Times New Roman', serif; color:#000; text-align:center; font-size:12px;">
      <div style="width:30%;">
        <span style="font-weight:bold;">Người lập biểu</span><br>
        <span style="font-style:italic; font-size:11px;">(Ký, ghi rõ họ tên)</span>
        <div style="height:60px;"></div>
        <span style="font-weight:bold;">Kế toán viên</span>
      </div>
      <div style="width:30%;">
        <span style="font-weight:bold;">Kế toán trưởng</span><br>
        <span style="font-style:italic; font-size:11px;">(Ký, ghi rõ họ tên)</span>
        <div style="height:60px;"></div>
        <span style="font-weight:bold;">Nguyễn Văn Minh</span>
      </div>
      <div style="width:30%;">
        <span style="font-weight:bold;">Giám đốc</span><br>
        <span style="font-style:italic; font-size:11px;">(Ký, đóng dấu, ghi rõ họ tên)</span>
        <div style="height:60px;"></div>
        <span style="font-weight:bold;">Lê Hoàng Đông</span>
      </div>
    </div>
  `;
}

// Hàm in báo cáo
function triggerPrint() {
  if (window.electronAPI && typeof window.electronAPI.printWindow === "function") {
    window.electronAPI.printWindow()
      .then(res => {
        if (res && res.ok === false) {
          console.warn("[Print] Electron printWindow trả về lỗi:", res.error, "- chuyển sang window.print()");
          window.print();
        }
      })
      .catch(err => {
        console.error("[Print] Lỗi khi gọi API in Electron, chuyển sang window.print():", err);
        window.print();
      });
  } else {
    window.print();
  }
}
window.triggerPrint = triggerPrint;

function printReport() {
  document.body.classList.add("printing-report");
  triggerPrint();
  setTimeout(() => {
    document.body.classList.remove("printing-report");
  }, 500);
}

// Tính bảng cân đối phát sinh tài khoản
function calculateTrialBalance() {
  const std = state.accountingStandard;

  // Danh sách các tài khoản sử dụng
  const accounts = [
    { code: "111", name: "Tiền mặt tại quỹ" },
    { code: "112", name: "Tiền gửi ngân hàng" },
    { code: "131", name: "Phải thu của khách hàng" },
    { code: "1331", name: "Thuế GTGT đầu vào được khấu trừ" },
    { code: "156", name: "Hàng hóa nhập kho" },
    { code: std === "TT200" ? "244" : "1386", name: "Phải thu ký quỹ, ký cược" },
    { code: "331", name: "Phải trả cho người bán" },
    { code: "3331", name: "Thuế GTGT phải nộp" },
    { code: std === "TT200" ? "344" : "3386", name: "Phải trả nhận ký quỹ, ký cược" },
    { code: "411", name: "Vốn góp của chủ sở hữu" },
    { code: "511", name: "Doanh thu bán hàng" },
    { code: "632", name: "Giá vốn hàng bán" }
  ];

  const trialRows = [];

  // H9 Fix: Single-pass aggregation for all accounts (runs ONCE, not per-account)
  const acctMoves = {};
  accounts.forEach(a => { acctMoves[a.code] = { deb: 0, cre: 0 }; });

  state.vouchers.forEach(v => {
    (v.entries || []).forEach(e => {
      if (acctMoves[e.debit]) acctMoves[e.debit].deb += e.amount;
      if (acctMoves[e.credit]) acctMoves[e.credit].cre += e.amount;
    });
  });

  accounts.forEach(acct => {
    // 1. Số dư đầu kỳ
    const initBalObj = state.initialBalances[acct.code] || { type: "debit", balance: 0 };
    let openDeb = 0;
    let openCre = 0;

    if (initBalObj.type === "debit") {
      openDeb = initBalObj.balance;
    } else {
      openCre = initBalObj.balance;
    }

    // 2. Cộng phát sinh trong kỳ (from single-pass result)
    const moves = acctMoves[acct.code] || { deb: 0, cre: 0 };
    const moveDeb = moves.deb;
    const moveCre = moves.cre;

    // 3. Số dư cuối kỳ
    let closeDeb = 0;
    let closeCre = 0;

    if (initBalObj.type === "debit") {
      const net = openDeb + moveDeb - moveCre;
      if (net >= 0) {
        closeDeb = net;
      } else {
        closeCre = -net;
      }
    } else {
      const net = openCre + moveCre - moveDeb;
      if (net >= 0) {
        closeCre = net;
      } else {
        closeDeb = -net;
      }
    }

    trialRows.push({
      code: acct.code,
      name: acct.name,
      openDebit: openDeb,
      openCredit: openCre,
      moveDebit: moveDeb,
      moveCredit: moveCre,
      closeDebit: closeDeb,
      closeCredit: closeCre
    });
  });

  return trialRows;
}

window.populateReportAccountDropdown = populateReportAccountDropdown;
window.handleReportTypeChange = handleReportTypeChange;
window.generateReport = generateReport;
window.printReport = printReport;
window.calculateTrialBalance = calculateTrialBalance;

