function safeParseFloat(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  if (str === "") return 0;
  
  let cleaned = str;
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");
  
  if (hasComma && hasDot) {
    if (str.indexOf(",") > str.indexOf(".")) {
      // Định dạng Việt Nam: 1.234,56 -> xóa chấm, thay phẩy bằng chấm
      cleaned = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Định dạng Quốc tế: 1,234.56 -> xóa phẩy
      cleaned = str.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      cleaned = str.replace(/,/g, "");
    } else {
      // C8 Fix: Check if digits after comma are exactly 3 → thousands separator (Vietnamese: "1,000" = 1000)
      const commaIdx = str.indexOf(",");
      const afterComma = str.substring(commaIdx + 1).replace(/[^\d]/g, "");
      if (afterComma.length === 3) {
        cleaned = str.replace(/,/g, ""); // Thousands separator
      } else {
        cleaned = str.replace(",", "."); // Decimal separator
      }
    }
  } else if (hasDot) {
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      cleaned = str.replace(/\./g, "");
    }
  }
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper đọc file Excel: ưu tiên dùng IPC (Electron), fallback sang fetch (web)
async function readExcelViaIPC(filename) {
  // Nếu đang chạy trong Electron desktop app, dùng IPC để tránh lỗi fetch với file:// protocol
  if (window.electronAPI && typeof window.electronAPI.readExcelFile === 'function') {
    const result = await window.electronAPI.readExcelFile(filename);
    if (!result.ok) {
      throw new Error(result.error || `Không đọc được file: ${filename}`);
    }
    return new Uint8Array(result.data);
  }
  // Fallback: dùng fetch cho môi trường web thông thường
  const response = await fetch('excel/' + filename);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// Trích xuất ID nằm trong dấu ngoặc kép ở cuối chuỗi, hỗ trợ cả ngoặc lồng nhau (ví dụ: "(37NGUYENBINH(CH))")
function extractIdFromParentheses(val) {
  if (!val) return "";
  const str = String(val).trim();
  if (!str.endsWith(")")) return "";
  
  let depth = 0;
  let lastOpenParenIdx = -1;
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === ')') {
      depth++;
    } else if (str[i] === '(') {
      depth--;
      if (depth === 0) {
        lastOpenParenIdx = i;
        break;
      }
    }
  }
  
  if (lastOpenParenIdx !== -1) {
    return str.substring(lastOpenParenIdx + 1, str.length - 1).trim();
  }
  return "";
}

function setupNumberFormattingEventListeners() {
  document.addEventListener("input", function (e) {
    if (e.target && e.target.classList.contains("number-format")) {
      const input = e.target;
      const selectionStart = input.selectionStart;
      const valBefore = input.value;
      
      // Đếm số lượng chữ số đứng trước con trỏ trước khi format lại
      let digitsBeforeCursor = 0;
      for (let i = 0; i < selectionStart; i++) {
        if (/\d/.test(valBefore[i])) {
          digitsBeforeCursor++;
        }
      }
      
      const rawVal = valBefore.replace(/\D/g, "");
      let formattedVal = "";
      if (rawVal) {
        formattedVal = Number(rawVal).toLocaleString("vi-VN");
      }
      
      input.value = formattedVal;
      
      // Tìm vị trí mới của con trỏ dựa trên số lượng chữ số digitsBeforeCursor
      let newCursorPos = 0;
      let digitsCount = 0;
      while (newCursorPos < formattedVal.length && digitsCount < digitsBeforeCursor) {
        if (/\d/.test(formattedVal[newCursorPos])) {
          digitsCount++;
        }
        newCursorPos++;
      }
      
      input.setSelectionRange(newCursorPos, newCursorPos);
    }

    // Qty format: allow digits, comma, dot, and negative sign
    if (e.target && e.target.classList.contains("qty-format")) {
      const input = e.target;
      const val = input.value;
      
      // Allow only numbers, comma, dot, and negative sign
      let cleaned = val.replace(/[^0-9.,-]/g, "");
      
      // Ensure at most one decimal separator (comma or dot)
      const firstSepIdx = cleaned.search(/[.,]/);
      if (firstSepIdx !== -1) {
        const before = cleaned.substring(0, firstSepIdx + 1);
        const after = cleaned.substring(firstSepIdx + 1).replace(/[.,]/g, "");
        cleaned = before + after;
      }
      
      if (val !== cleaned) {
        const selectionStart = input.selectionStart;
        input.value = cleaned;
        input.setSelectionRange(selectionStart, selectionStart);
      }
    }
  });
}

// Hàm escape thuộc tính HTML và JavaScript để tránh lỗi vỡ chuỗi khi ID hoặc Tên chứa dấu nháy kép / nháy đơn / dấu gạch chéo ngược
function escapeHtmlAttr(str) {
  if (str === undefined || str === null) return "";
  // 1. Escape cho JS (gạch chéo ngược \ và nháy đơn ')
  const jsEscaped = str.toString()
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  // 2. Escape cho HTML Attribute (các ký tự đặc biệt khác bao gồm dấu ngoặc nhọn, nháy kép, và &)
  return jsEscaped.replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let partnerCacheById = null;
let partnerCacheByName = null;
let cachedPartnersRef = null;
let cachedPartnersLength = 0;

function invalidatePartnerCache() {
  partnerCacheById = null;
  partnerCacheByName = null;
  cachedPartnersRef = null;
  cachedPartnersLength = 0;
}
window.invalidatePartnerCache = invalidatePartnerCache;

// Tìm đối tác an toàn từ chứng từ để lấy thông tin liên hệ sđt, địa chỉ
function getPartnerForVoucher(v) {
  if (!v) return null;

  if (state.partners !== cachedPartnersRef || (state.partners && state.partners.length !== cachedPartnersLength)) {
    partnerCacheById = null;
    partnerCacheByName = null;
    cachedPartnersRef = state.partners;
    cachedPartnersLength = state.partners ? state.partners.length : 0;
  }

  if (!partnerCacheById || !partnerCacheByName) {
    partnerCacheById = {};
    partnerCacheByName = {};
    if (Array.isArray(state.partners)) {
      state.partners.forEach(x => {
        const idKey = x.id !== undefined && x.id !== null ? String(x.id).trim() : "";
        const nameKey = x.name !== undefined && x.name !== null ? String(x.name).trim().toLowerCase() : "";
        if (idKey && !partnerCacheById[idKey]) {
          partnerCacheById[idKey] = x;
        }
        if (nameKey && !partnerCacheByName[nameKey]) {
          partnerCacheByName[nameKey] = x;
        }
      });
    }
  }

  const partnerIdStr = v.partnerId !== undefined && v.partnerId !== null ? String(v.partnerId).trim() : "";
  const partnerNameStr = v.partnerName !== undefined && v.partnerName !== null ? String(v.partnerName).trim() : "";

  let p = null;

  // 1. Tìm theo ID trước
  if (partnerIdStr) {
    p = partnerCacheById[partnerIdStr];
    if (!p) {
      const extractedId = extractIdFromParentheses(partnerIdStr);
      if (extractedId) {
        p = partnerCacheById[extractedId];
      }
    }
  }

  // 2. Tìm theo tên nếu tìm theo ID thất bại hoặc nếu partnerId chính là tên đối tác
  if (!p && partnerNameStr) {
    const nameLower = partnerNameStr.toLowerCase();
    p = partnerCacheByName[nameLower];
    if (!p) {
      const extractedId = extractIdFromParentheses(partnerNameStr);
      if (extractedId) {
        p = partnerCacheById[extractedId];
      }
    }
  }

  if (!p && partnerIdStr) {
    const idLower = partnerIdStr.toLowerCase();
    p = partnerCacheByName[idLower] || partnerCacheById[idLower];
  }

  return p;
}

// Lấy tên đối tác mới nhất một cách động dựa trên partnerId để liên kết CSDL
function getPartnerNameForVoucher(v) {
  const p = getPartnerForVoucher(v);
  if (p) return p.name;
  return (v && v.partnerName) ? v.partnerName : "Khách hàng vãng lai";
}
// Phân tích chuỗi số định dạng tiền tệ Việt Nam thành Number
function parseFormattedNumber(str) {
  if (!str) return 0;
  // Loại bỏ tất cả dấu chấm (.) dùng để phân tách hàng nghìn
  // Thay thế dấu phẩy (,) thành dấu chấm (.) để chuyển sang dấu thập phân chuẩn JS
  let cleaned = str.replace(/\./g, '').replace(/,/g, '.');
  // Giữ lại các ký tự số, dấu trừ và dấu chấm thập phân
  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// Loại bỏ dấu tiếng Việt và chuẩn hóa ký tự để tìm kiếm không dấu
function removeAccents(str) {
  if (!str) return "";
  return str.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Bộ lọc nâng cao (Advanced Filter) cho ô tìm kiếm
// Hỗ trợ: Không dấu, tìm kiếm AND đa từ khóa, tìm kiếm phủ định, tìm kiếm OR và lọc khoảng số
function matchAdvancedQuery(targetText, queryText, numericValue = null) {
  if (!queryText) return true;
  if (!targetText) targetText = "";

  const isMultiField = targetText.includes('\t');
  const fields = isMultiField ? targetText.split('\t') : [targetText];
  const cleanTarget = removeAccents(targetText.toLowerCase());
  const cleanQuery = removeAccents(queryText.toLowerCase().trim());

  // 1. Lọc khoảng số (Ví dụ: >100k, <5M, 100k-500k)
  if (numericValue !== null && typeof numericValue === "number") {
    // Kiểu so sánh: >100k, <5M, =500
    const numberMatch = cleanQuery.match(/^([><=]=?)\s*([0-9.]+)([kmM]?)$/);
    if (numberMatch) {
      const op = numberMatch[1];
      let val = parseFloat(numberMatch[2]);
      const unit = numberMatch[3].toLowerCase();
      if (unit === 'k') val *= 1000;
      else if (unit === 'm') val *= 1000000;

      if (op === '>') return numericValue > val;
      if (op === '>=') return numericValue >= val;
      if (op === '<') return numericValue < val;
      if (op === '<=') return numericValue <= val;
      if (op === '=' || op === '==') return numericValue === val;
    }

    // Kiểu khoảng: 100k-500k
    const rangeMatch = cleanQuery.match(/^([0-9.]+)([kmM]?)-([0-9.]+)([kmM]?)$/);
    if (rangeMatch) {
      let minVal = parseFloat(rangeMatch[1]);
      const minUnit = rangeMatch[2].toLowerCase();
      if (minUnit === 'k') minVal *= 1000;
      else if (minUnit === 'm') minVal *= 1000000;

      let maxVal = parseFloat(rangeMatch[3]);
      const maxUnit = rangeMatch[4].toLowerCase();
      if (maxUnit === 'k') maxVal *= 1000;
      else if (maxUnit === 'm') maxVal *= 1000000;

      return numericValue >= minVal && numericValue <= maxVal;
    }
  }

  // 2. Tìm kiếm OR (Sử dụng dấu phẩy hoặc dấu gạch đứng '|')
  if (cleanQuery.includes("|") || cleanQuery.includes(",")) {
    const parts = cleanQuery.split(/[|,]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Mỗi phần OR được xử lý riêng qua matchAdvancedQuery để giữ đúng logic exact word matching
      return parts.some(part => matchAdvancedQuery(targetText, part, numericValue));
    }
  }

  // 3. Tìm kiếm phủ định (Không chứa từ khóa bằng dấu '-') & Tìm kiếm AND đa từ khóa
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  const posTokens = tokens.filter(t => !(t.startsWith("-") && t.length > 1));
  const negTokens = tokens.filter(t => t.startsWith("-") && t.length > 1).map(t => t.substring(1));
  const cleanFields = fields.map(f => removeAccents(f.toLowerCase()));

  // Kiểm tra từ khóa phủ định
  for (const neg of negTokens) {
    if (cleanFields.some(f => f.includes(neg))) return false;
  }

  if (posTokens.length === 0) return true;

  // Tìm kiếm đơn trường (single field) -> dùng substring matching
  if (!isMultiField) {
    return posTokens.every(token => cleanTarget.includes(token));
  }

  // Tìm kiếm đa trường (multi-field):
  // - Query NHIỀU TỪ (≥2): Tìm cụm từ liên tiếp trong Tên (phrase matching theo thứ tự)
  //   "an trung" → Tên phải chứa ["an","trung"] liên tiếp, đúng thứ tự
  //   Không tìm trong Mã đối tác để tránh false positive
  // - Query MỘT TỪ: Tìm trong tất cả các trường (Mã: substring, Tên: exact word)
  const nameField = cleanFields.length > 1 ? cleanFields[1] : cleanFields[0];
  const nameWords = nameField.split(/[^a-z0-9]+/).filter(Boolean);

  if (posTokens.length > 1) {
    // Phrase matching: tokens phải xuất hiện liên tiếp, đúng thứ tự trong mảng từ của Tên
    for (let i = 0; i <= nameWords.length - posTokens.length; i++) {
      if (posTokens.every((token, j) => nameWords[i + j] === token)) {
        return true;
      }
    }
    return false;
  }

  // Single-word: kiểm tra tất cả trường
  const singleToken = posTokens[0];
  return cleanFields.some((fieldVal, fieldIdx) => {
    if (fieldIdx === 1) return nameWords.includes(singleToken);
    return fieldVal.includes(singleToken);
  });
}

// H11 Fix: Cache Intl.NumberFormat instance for performance
const _vndFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
function formatVND(value) {
  if (value === undefined || value === null || isNaN(value)) value = 0;
  return _vndFormatter.format(value);
}

// Thuật toán chuyển đổi Số thành Chữ tiếng Việt cực chuẩn và chuyên nghiệp
function numberToVietnameseWords(number) {
  // H7 Fix: Handle negative numbers
  const isNegative = number < 0;
  number = Math.abs(Math.round(number)); // Làm tròn số tiền thành số nguyên trước khi đọc chữ
  if (number === 0) return "Không đồng.";

  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

  function readGroupThree(n, showZeroHundreds) {
    let hundred = Math.floor(n / 100);
    let ten = Math.floor((n % 100) / 10);
    let unit = n % 10;
    let res = "";

    if (hundred > 0 || showZeroHundreds) {
      res += digits[hundred] + " trăm ";
    }

    if (ten > 0) {
      if (ten === 1) res += "mười ";
      else res += digits[ten] + " mươi ";
    } else if (hundred > 0 && unit > 0) {
      res += "linh ";
    }

    if (unit > 0) {
      if (unit === 1 && ten > 1) res += "mốt";
      else if (unit === 5 && ten > 0) res += "lăm";
      else res += digits[unit];
    }

    return res.trim();
  }

  let str = "";
  let groups = [];
  let temp = number;

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  for (let i = groups.length - 1; i >= 0; i--) {
    let g = groups[i];
    if (g > 0) {
      // Chỉ hiện "không trăm" ở các nhóm sau nhóm cao nhất nếu nhóm đó có hàng chục/đơn vị
      let showZero = i < groups.length - 1;
      let gRead = readGroupThree(g, showZero);
      if (gRead !== "") {
        str += gRead + " " + units[i] + " ";
      }
    }
  }

  str = str.trim();
  // Viết hoa chữ cái đầu tiên và thêm đuôi "đồng chẵn."
  const result = str.charAt(0).toUpperCase() + str.slice(1) + " đồng chẵn.";
  return isNegative ? "Âm " + result.charAt(0).toLowerCase() + result.slice(1) : result;
}

// Giao diện đổi Theme Tối/Sáng
function toggleTheme() {
  const body = document.body;
  body.classList.toggle("light-theme");
  const isLight = body.classList.contains("light-theme");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  showToast(`Đã chuyển sang giao diện ${isLight ? 'Sáng' : 'Tối'}`, "info");
}

// Báo thông báo nổi (Toast Notifications)
function showToast(message, type = "primary") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const colors = {
    primary: "var(--color-primary)",
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    info: "var(--color-info)"
  };

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--toast-color", colors[type] || colors.primary);

  // H3 Fix: Use textContent instead of raw innerHTML to prevent XSS
  const iconDiv = document.createElement("div");
  iconDiv.style.cssText = `color: ${colors[type] || colors.primary}; display:flex; align-items:center;`;
  iconDiv.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px; height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  const msgSpan = document.createElement("span");
  msgSpan.className = "toast-message";
  msgSpan.textContent = message; // Safe: textContent escapes HTML
  toast.appendChild(iconDiv);
  toast.appendChild(msgSpan);

  container.appendChild(toast);

  // Tự hủy sau 4s
  setTimeout(() => {
    toast.style.animation = "slideInLeft 0.3s ease reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
window.escapeHtmlAttr = escapeHtmlAttr;