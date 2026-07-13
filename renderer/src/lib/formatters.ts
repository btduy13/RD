const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

export function safeParseFloat(val: unknown): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  if (str === "") return 0;

  let cleaned = str;
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    if (str.indexOf(",") > str.indexOf(".")) {
      cleaned = str.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = str.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      cleaned = str.replace(/,/g, "");
    } else {
      const commaIdx = str.indexOf(",");
      const afterComma = str.substring(commaIdx + 1).replace(/[^\d]/g, "");
      if (afterComma.length === 3) {
        cleaned = str.replace(/,/g, "");
      } else {
        cleaned = str.replace(",", ".");
      }
    }
  } else if (hasDot) {
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      cleaned = str.replace(/\./g, "");
    }
  }

  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function parseVND(val: unknown): number {
  return safeParseFloat(val);
}

export function formatVND(value: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return vndFormatter.format(0);
  }
  return vndFormatter.format(value);
}

/** Local calendar YYYY-MM-DD — never use toISOString() (UTC) for date-only values. */
export function getLocalDateString(date: Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  const raw = String(isoDate).trim().slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function numberToVietnameseWords(number: number): string {
  const isNegative = number < 0;
  number = Math.abs(Math.round(number));
  if (number === 0) return "Không đồng.";

  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

  function readGroupThree(n: number, showZeroHundreds: boolean): string {
    const hundred = Math.floor(n / 100);
    const ten = Math.floor((n % 100) / 10);
    const unit = n % 10;
    let res = "";

    if (hundred > 0 || showZeroHundreds) {
      res += `${digits[hundred]} trăm `;
    }

    if (ten > 0) {
      if (ten === 1) res += "mười ";
      else res += `${digits[ten]} mươi `;
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
  const groups: number[] = [];
  let temp = number;

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g > 0) {
      const showZero = i < groups.length - 1;
      const gRead = readGroupThree(g, showZero);
      if (gRead !== "") {
        str += `${gRead} ${units[i]} `;
      }
    }
  }

  str = str.trim();
  const result = `${str.charAt(0).toUpperCase()}${str.slice(1)} đồng chẵn.`;
  return isNegative ? `Âm ${result.charAt(0).toLowerCase()}${result.slice(1)}` : result;
}

export function escapeHtmlAttr(str: unknown): string {
  if (str === undefined || str === null) return "";
  const jsEscaped = str
    .toString()
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  return jsEscaped
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
