// Ghi đè hộp thoại confirm bằng hộp thoại native an toàn của Electron để tránh lỗi treo UI/brick
if (window.electronAPI && typeof window.electronAPI.confirm === 'function') {
  window.confirm = (message) => {
    return window.electronAPI.confirm(message);
  };
}

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
  if (window.electronAPI && typeof window.electronAPI.readExcelFile === 'function') {
    const result = await window.electronAPI.readExcelFile(filename);
    if (!result.ok) {
      throw new Error(result.error || `Không đọc được file: ${filename}`);
    }
    if (result.encoding === 'base64' && typeof result.data === 'string') {
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (Array.isArray(result.data)) {
      return new Uint8Array(result.data);
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
      
      // Xác định sản phẩm và đơn vị để quyết định có cho phép nhập số thập phân hay không
      let allowDecimals = true;
      const row = input.closest("tr");
      if (row) {
        const prodInput = row.querySelector(".item-productId");
        if (prodInput) {
          const prodVal = prodInput.value;
          const resolver = typeof resolveProduct === "function" ? resolveProduct : (window.resolveProduct || null);
          if (resolver) {
            const prod = resolver(prodVal);
            if (prod) {
              const unit = (prod.unit || "").trim().toLowerCase();
              const name = (prod.name || "").trim().toLowerCase();
              if (unit === "cái" && !name.includes("ống")) {
                allowDecimals = false;
              }
            }
          }
        }
      } else {
        let unitVal = "";
        let nameVal = "";
        if (input.id === "prod-stock" || input.id === "prod-min-stock") {
          const unitEl = document.getElementById("prod-unit");
          const nameEl = document.getElementById("prod-name");
          if (unitEl) unitVal = unitEl.value;
          if (nameEl) nameVal = nameEl.value;
        } else if (input.id === "edit-prod-initial-stock" || input.id === "edit-prod-min-stock") {
          const unitEl = document.getElementById("edit-prod-unit");
          const nameEl = document.getElementById("edit-prod-name");
          if (unitEl) unitVal = unitEl.value;
          if (nameEl) nameVal = nameEl.value;
        } else if (input.id === "qap-prod-stock") {
          const unitEl = document.getElementById("qap-prod-unit");
          const nameEl = document.getElementById("qap-prod-name");
          if (unitEl) unitVal = unitEl.value;
          if (nameEl) nameVal = nameEl.value;
        } else if (input.id === "quick-import-qty") {
          const prodIdEl = document.getElementById("quick-import-prod-id");
          const resolver = typeof resolveProduct === "function" ? resolveProduct : (window.resolveProduct || null);
          if (prodIdEl && prodIdEl.value && resolver) {
            const prod = resolver(prodIdEl.value);
            if (prod) {
              unitVal = prod.unit || "";
              nameVal = prod.name || "";
            }
          }
        }
        
        if (unitVal) {
          const unit = unitVal.trim().toLowerCase();
          const name = nameVal.trim().toLowerCase();
          if (unit === "cái" && !name.includes("ống")) {
            allowDecimals = false;
          }
        }
      }

      // Nếu cho phép số thập phân: cho phép số, dấu chấm, dấu phẩy, dấu trừ
      // Nếu không cho phép (đơn vị Cái): chỉ cho phép số nguyên và dấu trừ
      let cleaned = allowDecimals ? val.replace(/[^0-9.,-]/g, "") : val.replace(/[^0-9-]/g, "");
      
      if (allowDecimals) {
        // Đảm bảo tối đa 1 ký tự phân tách thập phân (chấm hoặc phẩy)
        const firstSepIdx = cleaned.search(/[.,]/);
        if (firstSepIdx !== -1) {
          const before = cleaned.substring(0, firstSepIdx + 1);
          const after = cleaned.substring(firstSepIdx + 1).replace(/[.,]/g, "");
          cleaned = before + after;
        }
      }
      
      if (val !== cleaned) {
        const selectionStart = input.selectionStart;
        input.value = cleaned;
        input.setSelectionRange(selectionStart, selectionStart);
      }
    }
  });

  // Tự động làm sạch ô Số lượng về Số nguyên khi thay đổi đơn vị tính / chọn mặt hàng là "Cái"
  document.addEventListener("blur", function (e) {
    if (e.target && (e.target.id === "prod-unit" || e.target.id === "edit-prod-unit" || e.target.id === "qap-prod-unit")) {
      const unitVal = e.target.value.trim().toLowerCase();
      let qtyInputId = "";
      let nameElId = "";
      if (e.target.id === "prod-unit") {
        qtyInputId = "prod-stock";
        nameElId = "prod-name";
      } else if (e.target.id === "edit-prod-unit") {
        qtyInputId = "edit-prod-initial-stock";
        nameElId = "edit-prod-name";
      } else if (e.target.id === "qap-prod-unit") {
        qtyInputId = "qap-prod-stock";
        nameElId = "qap-prod-name";
      }
      
      const qtyInput = document.getElementById(qtyInputId);
      const nameEl = document.getElementById(nameElId);
      const nameVal = nameEl ? nameEl.value.trim().toLowerCase() : "";
      if (qtyInput && unitVal === "cái" && !nameVal.includes("ống")) {
        const val = qtyInput.value;
        const cleaned = val.replace(/[^0-9-]/g, "");
        if (val !== cleaned) {
          qtyInput.value = cleaned;
          qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }
    
    if (e.target && e.target.classList.contains("item-productId")) {
      const row = e.target.closest("tr");
      if (row) {
        const qtyInput = row.querySelector(".item-qty");
        if (qtyInput) {
          const prodVal = e.target.value;
          const resolver = typeof resolveProduct === "function" ? resolveProduct : (window.resolveProduct || null);
          if (resolver) {
            const prod = resolver(prodVal);
            if (prod) {
              const unit = (prod.unit || "").trim().toLowerCase();
              const name = (prod.name || "").trim().toLowerCase();
              if (unit === "cái" && !name.includes("ống")) {
                const val = qtyInput.value;
                const cleaned = val.replace(/[^0-9-]/g, "");
                if (val !== cleaned) {
                  qtyInput.value = cleaned;
                  qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            }
          }
        }
      }
    }
  }, true);

  // Cũng hỗ trợ làm sạch ngay khi người dùng chọn/nhập xong mặt hàng (oninput event)
  document.addEventListener("input", function (e) {
    if (e.target && e.target.classList.contains("item-productId")) {
      const row = e.target.closest("tr");
      if (row) {
        const qtyInput = row.querySelector(".item-qty");
        if (qtyInput) {
          const prodVal = e.target.value;
          const resolver = typeof resolveProduct === "function" ? resolveProduct : (window.resolveProduct || null);
          if (resolver) {
            const prod = resolver(prodVal);
            if (prod) {
              const unit = (prod.unit || "").trim().toLowerCase();
              const name = (prod.name || "").trim().toLowerCase();
              if (unit === "cái" && !name.includes("ống")) {
                const val = qtyInput.value;
                const cleaned = val.replace(/[^0-9-]/g, "");
                if (val !== cleaned) {
                  qtyInput.value = cleaned;
                  qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            }
          }
        }
      }
    }
  });
}

// Lấy ngày hiện tại ở định dạng YYYY-MM-DD theo giờ địa phương (tránh lỗi lệch múi giờ ở múi giờ UTC)
function getLocalDateString() {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().split("T")[0];
}
window.getLocalDateString = getLocalDateString;

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
function getPartnerForVoucher(v, options = {}) {
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

  if (options.strict) {
    return p || null;
  }

    // 3. Fallback nâng cao: Tìm kiếm theo các cụm từ nằm trong ngoặc (...)
  if (!p) {
    const searchStrings = [partnerIdStr, partnerNameStr];
    for (const str of searchStrings) {
      if (!str) continue;
      const matches = str.match(/\(([^)]+)\)/g);
      if (matches) {
        for (const match of matches) {
          const inner = match.substring(1, match.length - 1).trim();
          if (!inner) continue;
          
          // Thử tìm theo ID khớp hoàn toàn
          const innerLower = inner.toLowerCase();
          p = partnerCacheById[innerLower] || (state.partners || []).find(item => String(item.id).toLowerCase() === innerLower);
          if (p) break;
          
          // Thử tìm theo ID/Tên chứa cụm từ này (chỉ áp dụng nếu cụm từ >= 4 ký tự để tránh khớp nhầm các từ khóa chung chung)
          if (innerLower.length >= 4) {
            p = (state.partners || []).find(item => 
              (item.name && item.name.toLowerCase().includes(innerLower)) || 
              (item.id && String(item.id).toLowerCase().includes(innerLower))
            );
            if (p) break;
          }
        }
      }
      if (p) break;
    }
  }

  return p;
}

// Lấy tên đối tác mới nhất một cách động dựa trên partnerId để liên kết CSDL
function getPartnerNameForVoucher(v) {
  const p = getPartnerForVoucher(v);
  if (p) {
    if (p.type === 'project' && p.parentId) {
      const parent = state.partners.find(item => item.id === p.parentId);
      if (parent) return `${p.name} (${parent.name})`;
    }
    return p.name;
  }
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

// matchStr: Tìm kiếm chuỗi con, không phân biệt hoa thường và dấu tiếng Việt
// Dùng cho các inline filter thay thế .toLowerCase().includes()
// Ví dụ: matchStr("An Trưng", "an tr") → true
function matchStr(text, query) {
  if (!query) return true;
  if (!text) return false;
  return removeAccents(text.toLowerCase()).includes(removeAccents(query.toLowerCase().trim()));
}
window.matchStr = matchStr;

// Helper thống nhất khởi tạo remainingDebt cho chứng từ (BUG #5 Fix)
function ensureRemainingDebt(v) {
  if (v.remainingDebt === undefined) {
    const totalAmt = v.totalAmount || v.amount || 0;
    v.remainingDebt = (v.paymentMethod === "131" || v.paymentMethod === "331") ? totalAmt : 0;
  }
}
window.ensureRemainingDebt = ensureRemainingDebt;

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

  // Tìm kiếm đơn trường (single field) -> dùng substring matching của cả cụm từ theo thứ tự
  if (!isMultiField) {
    if (posTokens.length > 0) {
      const phraseQuery = posTokens.join(' ');
      return cleanTarget.includes(phraseQuery);
    }
    return true;
  }

  // Tìm kiếm đa trường (multi-field):
  // Với multi-word query: tìm toàn bộ cụm từ (theo thứ tự) dưới dạng substring
  // Ví dụ: "an tr" khớp "an trung", "Công ty An Trung", v.v.
  // Với single-word query: tìm substring trong tất cả các trường
  const nameField = cleanFields.length > 1 ? cleanFields[1] : cleanFields[0];

  if (posTokens.length > 1) {
    // Ghép toàn bộ tokens lại thành một chuỗi tìm kiếm duy nhất
    // rồi kiểm tra substring trong tên (không phân biệt dấu, không phân biệt hoa thường)
    const phraseQuery = posTokens.join(' ');
    // Tìm trong name field (bỏ dấu)
    if (nameField.includes(phraseQuery)) return true;
    // Fallback: tìm trong toàn bộ target (mã + tên)
    return cleanTarget.includes(phraseQuery);
  }

  // Single-word: kiểm tra substring trong tất cả trường
  const singleToken = posTokens[0];
  return cleanFields.some(fieldVal => fieldVal.includes(singleToken));
}

// H11 Fix: Cache Intl.NumberFormat instance for performance
const _vndFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
function formatVND(value) {
  if (value === undefined || value === null || isNaN(value)) value = 0;
  return _vndFormatter.format(value);
}

// Formatter số tiền không có ký hiệu tiền tệ (dùng cho in ấn)
const _vndNumberOnly = new Intl.NumberFormat("vi-VN", { style: "decimal", maximumFractionDigits: 0 });
function formatVNDNoSymbol(value) {
  if (value === undefined || value === null || isNaN(value)) value = 0;
  return _vndNumberOnly.format(value);
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
function updateThemeToggleIcon() {
  const icon = document.getElementById("theme-toggle-icon");
  if (!icon) return;
  const isLight = document.body.classList.contains("light-theme");
  icon.innerHTML = isLight
    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>'
    : '<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>';
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle("light-theme");
  const isLight = body.classList.contains("light-theme");
  if (typeof saveUserPrefs === "function") {
    saveUserPrefs({ theme: isLight ? "light" : "dark" });
  } else {
    localStorage.setItem("theme", isLight ? "light" : "dark");
  }
  if (document.documentElement) {
    document.documentElement.classList.toggle("pref-light", isLight);
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }
  updateThemeToggleIcon();
  showToast(`Đã chuyển sang giao diện ${isLight ? 'Sáng' : 'Tối'}`, "info");
}

// Báo thông báo nổi (Toast Notifications)
const TOAST_MAX_VISIBLE = 4;

function showToast(message, type = "primary") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  while (container.children.length >= TOAST_MAX_VISIBLE) {
    container.firstElementChild?.remove();
  }

  if (type === "error") type = "danger";

  const colors = {
    primary: "var(--color-primary)",
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    info: "var(--color-info)"
  };

  const icons = {
    success: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
    danger: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
    warning: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
    info: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
    primary: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
  };

  const color = colors[type] || colors.primary;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--toast-color", color);

  const iconDiv = document.createElement("div");
  iconDiv.className = "toast-icon";
  iconDiv.style.color = color;
  iconDiv.innerHTML = icons[type] || icons.primary;

  const msgSpan = document.createElement("span");
  msgSpan.className = "toast-message";
  msgSpan.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close-btn";
  closeBtn.setAttribute("type", "button");
  closeBtn.setAttribute("aria-label", "Đóng thông báo");
  closeBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>';

  const progress = document.createElement("div");
  progress.className = "toast-progress";

  toast.appendChild(iconDiv);
  toast.appendChild(msgSpan);
  toast.appendChild(closeBtn);
  toast.appendChild(progress);
  container.appendChild(toast);

  const duration = 4000;
  let timeoutId;

  function dismissToast() {
    clearTimeout(timeoutId);
    toast.style.animation = "slideInLeft 0.3s ease reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }

  closeBtn.addEventListener("click", dismissToast);
  timeoutId = setTimeout(dismissToast, duration);
}
window.escapeHtmlAttr = escapeHtmlAttr;
window.toggleTheme = toggleTheme;
window.updateThemeToggleIcon = updateThemeToggleIcon;
window.showToast = showToast;
