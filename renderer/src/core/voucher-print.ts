import {
  escapeHtmlAttr,
  formatVND,
  numberToVietnameseWords,
} from "@/lib/formatters";
import { useAppStore } from "@/store/app-store";
import type { AppState, Partner, Product, Voucher, VoucherItem } from "@/types/app-state";

interface PartnerExt extends Partner {
  phone?: string;
  address?: string;
  parentId?: string;
}

interface VoucherItemExt extends VoucherItem {
  discount?: number;
  itemDesc?: string;
}

interface VoucherExt extends Voucher {
  partnerName?: string;
  note?: string;
  notes?: string;
  adjustReason?: string;
  items?: VoucherItemExt[];
}

export interface VoucherPrintResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

const LOGO_SRC = "./logo.jpg";

const VOUCHER_PREVIEW_CSS = `
  html, body { margin: 0; padding: 8px; background: #fff; color: #000; }
  .printable-voucher { max-width: 800px; margin: 0 auto; }
  .voucher-rd-header {
    display: grid;
    grid-template-columns: 70px 1fr auto;
    gap: 0 6px;
    align-items: center;
    border-bottom: 2px solid #000;
    padding: 6px 0 5px;
    margin-bottom: 6px;
  }
  .voucher-rd-header--no-qr { grid-template-columns: 70px 1fr; }
  .voucher-rd-header-logo { display: flex; align-items: center; justify-content: center; }
  .voucher-rd-header-logo img { max-height: 42px; max-width: 68px; object-fit: contain; }
  .voucher-rd-header-info { text-align: center; min-width: 0; line-height: 1.2; }
  .voucher-rd-co-name { font-weight: bold; font-size: 13.5px; text-transform: uppercase; margin-bottom: 1px; }
  .voucher-rd-co-unit { font-weight: bold; font-size: 10.5px; text-transform: uppercase; }
  .voucher-rd-co-addr, .voucher-rd-co-tel { font-size: 11px; margin-top: 1px; line-height: 1.2; }
  .voucher-rd-header-qr { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 2px; }
  .voucher-rd-qr-label { font-size: 7.5px; font-weight: bold; text-transform: uppercase; margin-bottom: 1px; }
  .voucher-rd-header-qr img { width: 80px; height: 80px; display: block; }
  .voucher-rd-qr-stk { font-size: 8.5px; margin-top: 1px; font-family: monospace; font-weight: bold; }
  @media print {
    html, body { padding: 0; }
    .printable-voucher { box-shadow: none !important; }
  }
`;

function vndNoSymbol(value: number): string {
  return formatVND(value).replace(/đ/g, "").trim();
}

function formatDateLong(date: string): string {
  return `Ngày ${date.substring(8, 10)} tháng ${date.substring(5, 7)} năm ${date.substring(0, 4)}`;
}

function formatDateShort(date: string): string {
  return `${date.substring(8, 10)}/${date.substring(5, 7)}/${date.substring(0, 4)}`;
}

function extractIdFromParentheses(val: unknown): string {
  if (!val) return "";
  const str = String(val).trim();
  if (!str.endsWith(")")) return "";

  let depth = 0;
  let lastOpenParenIdx = -1;
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === ")") depth++;
    else if (str[i] === "(") {
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

function buildPartnerCaches(state: AppState) {
  const byId: Record<string, PartnerExt> = {};
  const byName: Record<string, PartnerExt> = {};

  for (const x of state.partners || []) {
    const idKey = x.id !== undefined && x.id !== null ? String(x.id).trim() : "";
    const nameKey = x.name !== undefined && x.name !== null ? String(x.name).trim().toLowerCase() : "";
    if (idKey && !byId[idKey]) byId[idKey] = x as PartnerExt;
    if (nameKey && !byName[nameKey]) byName[nameKey] = x as PartnerExt;
  }

  return { byId, byName };
}

export function getPartnerForVoucher(state: AppState, v: VoucherExt): PartnerExt | null {
  if (!v) return null;

  const { byId, byName } = buildPartnerCaches(state);
  const partnerIdStr = v.partnerId !== undefined && v.partnerId !== null ? String(v.partnerId).trim() : "";
  const partnerNameStr = v.partnerName !== undefined && v.partnerName !== null ? String(v.partnerName).trim() : "";

  let p: PartnerExt | null = null;

  if (partnerIdStr) {
    p = byId[partnerIdStr] ?? null;
    if (!p) {
      const extractedId = extractIdFromParentheses(partnerIdStr);
      if (extractedId) p = byId[extractedId] ?? null;
    }
  }

  if (!p && partnerNameStr) {
    p = byName[partnerNameStr.toLowerCase()] ?? null;
    if (!p) {
      const extractedId = extractIdFromParentheses(partnerNameStr);
      if (extractedId) p = byId[extractedId] ?? null;
    }
  }

  if (!p && partnerIdStr) {
    const idLower = partnerIdStr.toLowerCase();
    p = byName[idLower] ?? byId[idLower] ?? null;
  }

  if (!p) {
    const searchStrings = [partnerIdStr, partnerNameStr];
    for (const str of searchStrings) {
      if (!str) continue;
      const matches = str.match(/\(([^)]+)\)/g);
      if (matches) {
        for (const match of matches) {
          const inner = match.substring(1, match.length - 1).trim();
          if (!inner) continue;
          const innerLower = inner.toLowerCase();
          p = byId[innerLower] ?? (state.partners || []).find((item) => String(item.id).toLowerCase() === innerLower) as PartnerExt | undefined ?? null;
          if (p) break;
          if (innerLower.length >= 4) {
            p = (state.partners || []).find(
              (item) =>
                (item.name && item.name.toLowerCase().includes(innerLower)) ||
                (item.id && String(item.id).toLowerCase().includes(innerLower))
            ) as PartnerExt | undefined ?? null;
            if (p) break;
          }
        }
      }
      if (p) break;
    }
  }

  return p;
}

export function getPartnerNameForVoucher(state: AppState, v: VoucherExt): string {
  const p = getPartnerForVoucher(state, v);
  if (p) {
    if (p.type === "project" && p.parentId) {
      const parent = state.partners.find((item) => item.id === p.parentId);
      if (parent) return `${p.name} (${parent.name})`;
    }
    return p.name;
  }
  return v?.partnerName ? v.partnerName : "Khách hàng vãng lai";
}

export function findRelatedSalesVoucher(
  state: AppState,
  voucherId: string,
  description?: string,
  partnerId?: string,
  amount?: number
): Voucher | null {
  const v = state.vouchers.find((x) => x.id === voucherId);
  if (!v) return null;

  const descStr = (description || v.description || "").toString();
  const bhMatch = descStr.match(/BH\s*-?\s*\d+/i);
  if (bhMatch) {
    const matchedId = bhMatch[0].toUpperCase().replace(/\s/g, "").replace("-", "");
    const relatedSales = state.vouchers.find(
      (x) => x.type === "sales" && x.id.toUpperCase().replace("-", "") === matchedId
    );
    if (relatedSales) return relatedSales;
  }

  const numMatches = descStr.match(/\d+/g);
  if (numMatches) {
    for (const num of numMatches) {
      if (num.length >= 3) {
        const relatedSales = state.vouchers.find((x) => {
          if (x.type !== "sales") return false;
          const numericPart = x.id.replace(/^\D+/, "").replace(/-/g, "");
          return numericPart === num;
        });
        if (relatedSales) return relatedSales;
      }
    }
  }

  const amt = amount || v.amount || 0;
  if (amt > 0) {
    const relatedSales = state.vouchers.find(
      (x) =>
        x.type === "sales" &&
        String(x.partnerId) === String(partnerId) &&
        Math.abs((x.totalAmount || 0) - amt) < 100
    );
    if (relatedSales) return relatedSales;
  }

  return null;
}

function findProduct(state: AppState, productId: unknown): Product {
  return (
    (state.products || []).find((p) => String(p.id) === String(productId)) || {
      id: String(productId ?? ""),
      name: String(productId ?? "Sản phẩm"),
      unit: "Cái",
    }
  );
}

function calcItemDiscount(item: VoucherItemExt): { gross: number; discountPercent: number; amount: number; gcVal: string } {
  const itemGross = (item.qty || 0) * (item.price || 0);
  let discountPercent = item.discount || 0;
  if (discountPercent > 100) {
    discountPercent = itemGross > 0 ? (discountPercent / itemGross) * 100 : 0;
  }
  const amount = item.amount || itemGross - itemGross * (discountPercent / 100);
  const gcVal = discountPercent > 0 ? `${Math.round(discountPercent * 100) / 100}%` : "0";
  return { gross: itemGross, discountPercent, amount, gcVal };
}

function calcItemsTotals(items: VoucherItemExt[] = []) {
  let grossTotal = 0;
  let totalDiscount = 0;
  for (const item of items) {
    const { gross, discountPercent, amount } = calcItemDiscount(item);
    grossTotal += gross;
    totalDiscount += gross - amount;
    void discountPercent;
  }
  return { grossTotal, totalDiscount };
}

function renderRdBrandedHeader(qrAmount: number, withQr = true): string {
  const amount = Math.round(qrAmount || 0);
  const qrBlock = withQr
    ? `
          <div class="voucher-rd-header-qr">
            <span class="voucher-rd-qr-label">Quét Mã QR Thanh Toán</span>
            <img src="https://img.vietqr.io/image/sacombank-050033493999-qr_only.png?amount=${amount}&addInfo=${encodeURIComponent("thanh toan mua hang")}&accountName=${encodeURIComponent("CTY CP SX DT PHAT TRIEN RANG DONG")}" alt="VietQR" />
            <span class="voucher-rd-qr-stk">STK: 050033493999</span>
          </div>`
    : "";

  return `
        <div class="voucher-rd-header${withQr ? "" : " voucher-rd-header--no-qr"}">
          <div class="voucher-rd-header-logo">
            <img src="${LOGO_SRC}" alt="Logo Rạng Đông" />
          </div>
          <div class="voucher-rd-header-info">
            <div class="voucher-rd-co-name">CÔNG TY CỔ PHẦN RẠNG ĐÔNG</div>
            <div class="voucher-rd-co-unit">TRUNG TÂM PP BẢO HÀNH–MÁY NƯỚC NÓNG NLMT SOLARKYO</div>
            <div class="voucher-rd-co-addr">Địa chỉ: 255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh</div>
            <div class="voucher-rd-co-tel">Tel: 0254.3543551 – Hotline: 0913 693 485 - 0913 128 074</div>
          </div>${qrBlock}
        </div>`;
}

function renderRelatedSalesHtml(state: AppState, v: VoucherExt): string {
  const relatedSales = findRelatedSalesVoucher(state, v.id, v.description, v.partnerId, v.amount);
  if (!relatedSales) return "";
  return `
      <div class="voucher-info-row" style="margin-top: 6px; padding: 6px 10px; background: rgba(14, 165, 233, 0.05); border: 1px dashed #0ea5e9; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="color: #0ea5e9; font-weight: 600; font-family: 'Times New Roman', serif; font-size: 13px;">- Hóa đơn bán hàng liên quan:</span>
        <span style="font-weight: bold; color: #0ea5e9; font-family: 'Times New Roman', serif; font-size: 13px;">${escapeHtmlAttr(relatedSales.id)} (${formatVND(relatedSales.totalAmount || 0)})</span>
      </div>
    `;
}

function renderPurchaseOrder(
  state: AppState,
  v: VoucherExt,
  partnerName: string,
  companyName: string,
  companyAddr: string,
  companyTax: string
): string {
  const { grossTotal, totalDiscount } = calcItemsTotals(v.items);
  const items = v.items || [];

  return `
      <div class="printable-voucher">
        <div class="voucher-header-top">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 70px; flex-shrink: 0;">
              <img src="${LOGO_SRC}" style="max-height: 42px; max-width: 68px; object-fit: contain;" alt="Logo Rạng Đông" />
            </div>
            <div class="voucher-co-info" style="width: auto;">
              <span class="voucher-co-name">${companyName}</span><br>
              <span class="voucher-co-addr">Địa chỉ: ${companyAddr}</span><br>
              <span class="voucher-co-addr">MST: ${companyTax}</span>
            </div>
          </div>
          <div class="voucher-template-code">
            <span style="font-weight:bold;">Mẫu Đơn Đặt Hàng</span><br>
            <span>RD-PO</span>
          </div>
        </div>
        <div style="text-align:center; margin-bottom:6px;">
          <span style="font-size:20px; font-weight:bold;">ĐƠN ĐẶT HÀNG</span><br>
          <span style="font-size:12px;">${formatDateLong(v.date)}</span>
        </div>
        <div style="margin-bottom:6px;">
          <span>Số: <strong>${v.id}</strong></span><br>
          <span style="font-size: 12px; color: #666; font-style: italic;">(Không hạch toán kho & kế toán)</span>
        </div>
        <div style="margin-top:8px;">
          <div><strong>- Nhà cung cấp:</strong> ${partnerName}</div>
          <div><strong>- Diễn giải:</strong> ${v.description || ""}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin:10px 0; border:1.5px solid #000;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">STT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left;">Tên, nhãn hiệu quy cách sản phẩm vật tư</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:8%;">ĐVT</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:10%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá (đ)</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:15%;">Thành tiền (đ)</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">G.C</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item, idx) => {
                const prod = findProduct(state, item.productId);
                const { amount, gcVal } = calcItemDiscount(item);
                return `
                <tr>
                  <td style="border:1px solid #000; padding:4px; text-align:center;">${idx + 1}</td>
                  <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${prod.name}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit || "Cái"}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:right;">${item.qty || 0}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:right;">${vndNoSymbol(item.price || 0)}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${vndNoSymbol(amount)}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:center;">${gcVal}</td>
                </tr>`;
              })
              .join("")}
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">Cộng tiền hàng:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(grossTotal)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right;">Số tiền chiết khấu:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right;">${vndNoSymbol(totalDiscount)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
            <tr style="background-color:#e5e7eb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase;">Tổng cộng tiền đặt hàng:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(v.totalAmount || 0)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:12px;">Tổng số tiền (viết bằng chữ): <strong><em>${numberToVietnameseWords(v.totalAmount || 0)}</em></strong></div>
      </div>`;
}

function renderPurchase(
  state: AppState,
  v: VoucherExt,
  partnerName: string,
  companyName: string,
  companyAddr: string,
  companyTax: string
): string {
  const { grossTotal, totalDiscount } = calcItemsTotals(v.items);
  const partner = getPartnerForVoucher(state, v);
  const std = state.accountingStandard;

  return `
      <div class="printable-voucher" style="padding:8px; font-family:'Times New Roman',Times,serif; font-size: 13px; color:#000; line-height:1.25;">
        <div style="position:relative; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; text-align:center; min-height:50px;">
          <div style="position:absolute; left:0; top:50%; transform:translateY(-50%); width:80px; display:flex; align-items:center; justify-content:center;">
            <img src="${LOGO_SRC}" style="max-height:45px; max-width:75px; object-fit:contain;" alt="Logo" />
          </div>
          <div style="padding:0 10px 0 90px; color:#000;">
            <div style="font-weight:bold; font-size: 14px; text-transform:uppercase;">${companyName}</div>
            <div style="font-size: 11.5px; margin-top:2px;">Mật số: ${std === "TT133" ? "Mẫu số C21-DN (TT133)" : "Mẫu số 01-VT (TT200)"}</div>
            <div style="font-size: 11.5px; margin-top:2px;">Địa chỉ: ${companyAddr}</div>
            <div style="font-size: 11.5px; margin-top:1px;">MST: ${companyTax}</div>
          </div>
        </div>
        <div style="text-align:center; margin-bottom:10px;">
          <div style="font-size: 21px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase;">PHIẾU NHẬP KHO</div>
          <div style="font-size: 12.5px; font-style:italic;">${formatDateLong(v.date)}</div>
        </div>
        <div style="display:grid; grid-template-columns:2fr 1fr; row-gap:3px; column-gap:12px; margin-bottom:8px; font-size: 12.5px;">
          <div><strong>Nhà cung cấp:</strong> <span style="font-weight:bold;">${partnerName}</span></div>
          <div style="text-align:right;"><strong>Ngày:</strong> ${formatDateShort(v.date)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner?.phone || "-"}</span></div>
          <div style="text-align:right;"><strong>Số:</strong> <span style="font-family:monospace; font-weight:bold;">${v.id}</span></div>
          <div style="grid-column:span 2;"><strong>Địa chỉ NCC:</strong> <span>${partner?.address || "-"}</span></div>
          <div style="grid-column:span 2;"><strong>Diễn giải:</strong> ${v.description || "Nhập kho hàng mua"}</div>
          <div style="grid-column:span 2; font-size: 14px; color:#555;">
            Nợ TK: <strong>156</strong>${(v.taxAmount || 0) > 0 && std !== "TT133" ? " / Nợ TK: <strong>1331</strong>" : ""} &nbsp;|&nbsp; Có TK: <strong>${v.paymentMethod || "331"}</strong>
          </div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1.5px solid #000;">
          <thead>
            <tr style="background-color:#f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">TT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left;">Tên, nhãn hiệu, quy cách</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:7%;">ĐV</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:9%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:14%;">Thành tiền</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:13%;">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${(v.items || [])
              .map((item, idx) => {
                const prod = findProduct(state, item.productId);
                const displayName = item.itemDesc || prod.name;
                const { amount, gcVal } = calcItemDiscount(item);
                return `<tr>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${idx + 1}</td>
                <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${displayName}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit || "Cái"}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${item.qty || 0}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${vndNoSymbol(item.price || 0)}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${vndNoSymbol(amount)}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${gcVal}</td>
              </tr>`;
              })
              .join("")}
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">Cộng tiền hàng:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(grossTotal)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right;">Số tiền chiết khấu:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right;">${vndNoSymbol(totalDiscount)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
            ${(v.taxAmount || 0) > 0
              ? `<tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right;">Thuế GTGT (${v.taxRate || 0}%):</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right;">${vndNoSymbol(v.taxAmount || 0)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>`
              : ""}
            <tr style="background-color:#f9fafb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase;">Tổng tiền thanh toán:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(v.totalAmount || 0)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:6px;"><strong>Số tiền viết bằng chữ:</strong> <em>${numberToVietnameseWords(v.totalAmount || 0)}</em></div>
        ${v.note ? `<div style="margin-bottom:10px; border:1px dashed #888; padding:5px 8px;"><strong>Ghi chú:</strong> ${v.note}</div>` : ""}
      </div>`;
}

function renderSalesLikeTable(
  state: AppState,
  v: VoucherExt,
  descColumnLabel: string,
  discountColumnLabel: string
): string {
  const { grossTotal, totalDiscount } = calcItemsTotals(v.items);
  const items = v.items || [];

  return `
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1.5px solid #000;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">TT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left;">${descColumnLabel}</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:8%;">ĐV</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:10%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:15%;">Thành tiền</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">${discountColumnLabel}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item, idx) => {
                const prod = findProduct(state, item.productId);
                const qtyFormatted = Number.isInteger(item.qty)
                  ? `${item.qty},0`
                  : String(item.qty ?? 0).replace(".", ",");
                const { amount, gcVal } = calcItemDiscount(item);
                return `
                <tr>
                  <td style="border:1px solid #000; padding:4px; text-align:center;">${idx + 1}</td>
                  <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${item.itemDesc || prod.name}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit || "Cái"}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:right;">${qtyFormatted}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:right;">${vndNoSymbol(item.price || 0)}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${vndNoSymbol(amount)}</td>
                  <td style="border:1px solid #000; padding:4px; text-align:center;">${gcVal}</td>
                </tr>`;
              })
              .join("")}
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">Cộng tiền hàng :</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(grossTotal)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
            <tr>
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right;">Số tiền chiết khấu:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right;">${vndNoSymbol(totalDiscount)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
            <tr style="background-color:#f9fafb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase;">Tổng tiền thanh toán:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(v.totalAmount || 0)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
          </tbody>
        </table>`;
}

function renderSales(state: AppState, v: VoucherExt, partnerName: string): string {
  const partner = getPartnerForVoucher(state, v);
  const { grossTotal, totalDiscount } = calcItemsTotals(v.items);

  return `
      <div class="printable-voucher" style="padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; line-height: 1.25;">
        ${renderRdBrandedHeader(v.totalAmount || grossTotal - totalDiscount || 0)}
        <div style="text-align: center; margin-bottom: 10px;">
          <div style="font-size: 21px; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase;">PHIẾU GIAO HÀNG</div>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr; row-gap: 3px; column-gap: 12px; margin-bottom: 8px; font-size: 12.5px;">
          <div><strong>Tên khách hàng:</strong> <span style="font-weight: bold;">${partnerName}</span></div>
          <div style="text-align: right;"><strong>Ngày:</strong> ${formatDateShort(v.date)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner?.phone || "-"}</span></div>
          <div style="text-align: right;"><strong>Số:</strong> <span style="font-family: monospace; font-weight: bold;">${v.id}</span></div>
          <div style="grid-column: span 2;"><strong>Địa chỉ:</strong> <span>${partner?.address || "-"}</span></div>
          <div style="grid-column: span 2;"><strong>Diễn giải:</strong> ${v.description || `Bán hàng ${partnerName}`}</div>
        </div>
        ${renderSalesLikeTable(state, v, "Diễn giải", "G.C")}
        <div style="margin-bottom: 12px; font-size: 13px;">
          <div style="margin-bottom: 3px;"><strong>Số tiền viết bằng chữ:</strong> <em>${numberToVietnameseWords(v.totalAmount || 0)}</em></div>
          <div><strong>Ghi chú:</strong> <em style="color: #374151;">hàng thừa trả lại dơ bẩn không thu lại. Không thu lại nút bịt.${v.note || v.notes ? ` ${v.note || v.notes}` : ""}</em></div>
        </div>
      </div>`;
}

function renderSalesQuotation(state: AppState, v: VoucherExt, partnerName: string): string {
  const partner = getPartnerForVoucher(state, v);
  const { grossTotal, totalDiscount } = calcItemsTotals(v.items);

  return `
      <div class="printable-voucher" style="padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; line-height: 1.25;">
        ${renderRdBrandedHeader(v.totalAmount || grossTotal - totalDiscount || 0)}
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-size: 20px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">BẢNG BÁO GIÁ</div>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr; row-gap: 3px; column-gap: 12px; margin-bottom: 8px; font-size: 12.5px;">
          <div><strong>Kính gửi khách hàng:</strong> <span style="font-weight: bold;">${partnerName}</span></div>
          <div style="text-align: right;"><strong>Ngày lập:</strong> ${formatDateShort(v.date)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner?.phone || "-"}</span></div>
          <div style="text-align: right;"><strong>Số báo giá:</strong> <span style="font-family: monospace; font-weight: bold;">${v.id}</span></div>
          <div style="grid-column: span 2;"><strong>Địa chỉ:</strong> <span>${partner?.address || "-"}</span></div>
          <div style="grid-column: span 2;"><strong>Nội dung báo giá:</strong> ${v.description || `Báo giá hàng hóa cho ${partnerName}`}</div>
        </div>
        ${renderSalesLikeTable(state, v, "Tên sản phẩm / quy cách", "C.K")}
        <div style="margin-bottom: 12px; font-size: 13px;">
          <div style="margin-bottom: 3px;"><strong>Số tiền viết bằng chữ:</strong> <em>${numberToVietnameseWords(v.totalAmount || 0)}</em></div>
          <div><strong>Ghi chú:</strong> <em style="color: #374151;">Báo giá có giá trị trong vòng 30 ngày kể từ ngày lập. Giá trên đã bao gồm VAT.</em></div>
        </div>
      </div>`;
}

function renderReturnVoucher(
  state: AppState,
  v: VoucherExt,
  partnerName: string,
  companyName: string,
  companyAddr: string,
  companyTax: string,
  options: {
    title: string;
    templateLabel: string;
    partnerLabel: string;
    reasonLabel: string;
    reasonText: string;
    accountsLine: string;
    totalLabel: string;
    signatures: string[];
  }
): string {
  const partner = getPartnerForVoucher(state, v);
  let grossTotal = 0;
  for (const item of v.items || []) {
    grossTotal += item.amount || (item.qty || 0) * (item.price || 0);
  }

  return `
      <div class="printable-voucher" style="padding:8px; font-family:'Times New Roman',Times,serif; font-size: 13px; color:#000; line-height:1.25;">
        <div style="position:relative; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; text-align:center; min-height:50px;">
          <div style="position:absolute; left:0; top:50%; transform:translateY(-50%); width:80px; display:flex; align-items:center; justify-content:center;">
            <img src="${LOGO_SRC}" style="max-height:45px; max-width:75px; object-fit:contain;" alt="Logo" />
          </div>
          <div style="padding:0 10px 0 90px; color:#000;">
            <div style="font-weight:bold; font-size: 14px; text-transform:uppercase;">${companyName}</div>
            <div style="font-size: 11.5px; margin-top:2px;">${options.templateLabel}</div>
            <div style="font-size: 11.5px; margin-top:2px;">Địa chỉ: ${companyAddr}</div>
            <div style="font-size: 11.5px; margin-top:1px;">MST: ${companyTax}</div>
          </div>
        </div>
        <div style="text-align:center; margin-bottom:10px;">
          <div style="font-size: 21px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase;">${options.title}</div>
          <div style="font-size: 12.5px; font-style:italic;">${formatDateLong(v.date)}</div>
        </div>
        <div style="display:grid; grid-template-columns:2fr 1fr; row-gap:3px; column-gap:12px; margin-bottom:8px; font-size: 12.5px;">
          <div><strong>${options.partnerLabel}:</strong> <span style="font-weight:bold;">${partnerName}</span></div>
          <div style="text-align:right;"><strong>Ngày:</strong> ${formatDateShort(v.date)}</div>
          <div><strong>Điện thoại:</strong> <span>${partner?.phone || "-"}</span></div>
          <div style="text-align:right;"><strong>Số:</strong> <span style="font-family:monospace; font-weight:bold;">${v.id}</span></div>
          <div style="grid-column:span 2;"><strong>Địa chỉ:</strong> <span>${partner?.address || "-"}</span></div>
          <div style="grid-column:span 2;"><strong>${options.reasonLabel}:</strong> ${options.reasonText}</div>
          <div style="grid-column:span 2; font-size: 14px; color:#555;">${options.accountsLine}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; border:1.5px solid #000;">
          <thead>
            <tr style="background-color:#f3f4f6;">
              <th style="border:1px solid #000; padding:4px; text-align:center; width:5%;">TT</th>
              <th style="border:1px solid #000; padding:4px 6px; text-align:left;">Tên, nhãn hiệu, quy cách</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:7%;">ĐV</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:9%;">Số lượng</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:12%;">Đơn giá</th>
              <th style="border:1px solid #000; padding:4px; text-align:right; width:14%;">Thành tiền</th>
              <th style="border:1px solid #000; padding:4px; text-align:center; width:13%;">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${(v.items || [])
              .map((item, idx) => {
                const prod = findProduct(state, item.productId);
                const amt = item.amount || (item.qty || 0) * (item.price || 0);
                return `<tr>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${idx + 1}</td>
                <td style="border:1px solid #000; padding:4px 6px; font-weight:500;">${prod.name}</td>
                <td style="border:1px solid #000; padding:4px; text-align:center;">${prod.unit || "Cái"}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${item.qty || 0}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right;">${vndNoSymbol(item.price || 0)}</td>
                <td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">${vndNoSymbol(amt)}</td>
                <td style="border:1px solid #000; padding:4px;"></td>
              </tr>`;
              })
              .join("")}
            <tr style="background-color:#f9fafb;">
              <td colspan="5" style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold; text-transform:uppercase;">${options.totalLabel}:</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:right; font-weight:bold;">${vndNoSymbol(v.totalAmount || grossTotal)}</td>
              <td style="border:1px solid #000;"></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:12px;"><strong>Số tiền viết bằng chữ:</strong> <em>${numberToVietnameseWords(v.totalAmount || grossTotal)}</em></div>
      </div>`;
}

function renderCashVoucher(
  state: AppState,
  v: VoucherExt,
  partnerName: string,
  companyName: string,
  companyAddr: string,
  companyTax: string
): string {
  const isReceipt = v.type === "escrow_receive" || v.type === "escrow_refund_pay" || v.type === "receipt";
  const title = isReceipt ? "PHIẾU THU" : "PHIẾU CHI";
  const templateCode = isReceipt ? "Mẫu số 01 - TT" : "Mẫu số 02 - TT";
  const e = (v.entries && v.entries[0]) || {
    debit: isReceipt ? "111" : "331",
    credit: isReceipt ? "131" : "111",
  };
  const partner = getPartnerForVoucher(state, v);
  const partnerAddr = partner?.address || "";
  const partnerPhone = partner?.phone || "";
  const partnerAddrLine = [partnerAddr, partnerPhone].filter(Boolean).join(" - ");
  const amount = v.amount || v.totalAmount || 0;
  const sigRow = isReceipt
    ? ["Giám đốc", "Kế toán trưởng", "Người nộp tiền", "Người lập phiếu", "Thủ quỹ"]
    : ["Giám đốc", "Kế toán trưởng", "Thủ quỹ", "Người lập phiếu", "Người nhận tiền"];
  const sigSub = isReceipt
    ? ["Ký, họ tên, đóng dấu", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên"]
    : ["Ký, họ tên, đóng dấu", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên", "Ký, họ tên"];

  return `
      <div class="printable-voucher" style="max-width:780px; padding:10px; font-family:'Times New Roman',Times,serif; font-size: 13px; color:#000; line-height:1.4;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:10px; flex:1;">
            <img src="${LOGO_SRC}" style="max-height:44px; max-width:100px; object-fit:contain;" alt="Logo" />
            <div>
              <div style="font-weight:bold; font-size: 11.5px; text-transform:uppercase;">${companyName}</div>
              <div style="font-size: 11.5px;">Địa chỉ: ${companyAddr}</div>
              <div style="font-size: 11.5px;">MST: ${companyTax}</div>
            </div>
          </div>
          <div style="text-align:right; font-size: 14px; min-width:160px;">
            <div style="font-size: 14px; color:#555;">${templateCode} &nbsp;(TT 200/2014/TT-BTC)</div>
            <div style="margin-top:3px;">Quyển số: <span style="border-bottom:1px dotted #000; display:inline-block; min-width:50px;">&nbsp;</span></div>
            <div>Số: <strong>${v.id}</strong></div>
            <div>Nợ: <strong>${e.debit}</strong></div>
            <div>Có: <strong>${e.credit}</strong></div>
          </div>
        </div>
        <div style="text-align:center; margin-bottom:12px;">
          <div style="font-size: 25px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">${title}</div>
          <div style="font-size: 13px; font-style:italic;">${formatDateLong(v.date)}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size: 13px; margin-bottom:6px;">
          <tr>
            <td style="padding:3px 0; white-space:nowrap; width:220px;"><strong>Họ và tên người ${isReceipt ? "nộp" : "nhận"} tiền:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">${partnerName}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Địa chỉ:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">${partnerAddrLine || "&nbsp;"}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Lý do ${isReceipt ? "nộp" : "chi"}:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">${v.description || ""}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Số tiền:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;"><strong>${amount.toLocaleString("vi-VN")} VND</strong></td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Viết bằng chữ:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999; font-style:italic; font-weight:bold;">${numberToVietnameseWords(amount)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;"><strong>Kèm theo:</strong></td>
            <td style="padding:3px 6px; border-bottom:1px dotted #999;">............... chứng từ gốc</td>
          </tr>
        </table>
        ${renderRelatedSalesHtml(state, v)}
        <div style="text-align:right; font-style:italic; font-size: 12.5px; margin:10px 20px 6px 0;">
          ngày...... tháng ...... năm..............
        </div>
        <table style="width:100%; border-collapse:collapse; text-align:center; font-size: 12.5px; margin-top:4px;">
          <tr>${sigRow.map((s) => `<td style="width:20%; padding:4px 2px; font-weight:bold;">${s}</td>`).join("")}</tr>
          <tr>${sigSub.map((s) => `<td style="font-style:italic; font-size: 11.5px; color:#555;">(${s})</td>`).join("")}</tr>
          <tr>${sigRow.map(() => `<td style="height:70px; border-bottom:1px dotted #bbb;"></td>`).join("")}</tr>
        </table>
        <div style="margin-top:16px; padding-top:8px; border-top:1px solid #ddd; font-size: 12.5px;">
          <strong>Đã nhận đủ số tiền (Viết bằng chữ):</strong>
          <span style="font-style:italic;"> ${numberToVietnameseWords(amount)}</span>
        </div>
      </div>`;
}

export function renderVoucherHtml(state: AppState, voucherId: string): string {
  const v = state.vouchers.find((item) => item.id === voucherId) as VoucherExt | undefined;
  if (!v) return "";

  const partnerName = getPartnerNameForVoucher(state, v);
  const companyName = state.companyName || "Công Ty Cổ Phần Rạng Đông";
  const companyAddr = state.address || "255 Trương Công Định, Phường Vũng Tàu, Thành Phố Hồ Chí Minh";
  const companyTax = state.taxCode || "0100101438";
  const std = state.accountingStandard;

  switch (v.type) {
    case "purchase_order":
      return renderPurchaseOrder(state, v, partnerName, companyName, companyAddr, companyTax);
    case "purchase":
      return renderPurchase(state, v, partnerName, companyName, companyAddr, companyTax);
    case "purchase_return":
      return renderReturnVoucher(state, v, partnerName, companyName, companyAddr, companyTax, {
        title: "PHIẾU XUẤT KHO TRẢ NHÀ CUNG CẤP",
        templateLabel: std === "TT133" ? "Mẫu số C21-DN (TT133)" : "Mẫu số 02-VT (TT200)",
        partnerLabel: "Nhà cung cấp",
        reasonLabel: "Lý do trả",
        reasonText: v.description || "",
        accountsLine: `Nợ TK: <strong>331</strong>${std !== "TT133" && (v.taxAmount || 0) > 0 ? " / Nợ TK: <strong>1331</strong>" : ""} &nbsp;|&nbsp; Có TK: <strong>156</strong>`,
        totalLabel: "Tổng cộng tiền trả NCC",
        signatures: [],
      });
    case "sales_return": {
      const creditAccSR = v.paymentMethod && v.paymentMethod !== "131" ? v.paymentMethod : "131";
      return renderReturnVoucher(state, v, partnerName, companyName, companyAddr, companyTax, {
        title: "PHIẾU NHẬP KHO HÀNG BÁN TRẢ LẠI",
        templateLabel: "Mẫu số 01-VT (TT200) — Phục hồi hàng bán trả lại",
        partnerLabel: "Khách hàng trả lại",
        reasonLabel: "Lý do trả",
        reasonText: v.description || "",
        accountsLine: `Nợ TK: <strong>511</strong>${(v.taxAmount || 0) > 0 ? ", <strong>3331</strong>" : ""} &nbsp;|&nbsp; Có TK: <strong>${creditAccSR}</strong> &nbsp;&nbsp; Nợ TK: <strong>156</strong> / Có TK: <strong>632</strong> (nhập lại kho)`,
        totalLabel: "Tổng tiền trả lại khách",
        signatures: [],
      });
    }
    case "sales":
      return renderSales(state, v, partnerName);
    case "sales_quotation":
      return renderSalesQuotation(state, v, partnerName);
    case "receipt":
    case "payment":
    case "escrow_receive":
    case "escrow_refund_pay":
    case "escrow_pay":
    case "escrow_refund_receive":
      return renderCashVoucher(state, v, partnerName, companyName, companyAddr, companyTax);
    default:
      return `
        <div class="printable-voucher" style="padding:16px; font-family:'Times New Roman',Times,serif;">
          <h2 style="text-align:center;">CHỨNG TỪ KẾ TOÁN</h2>
          <p><strong>Số:</strong> ${v.id}</p>
          <p><strong>Loại:</strong> ${v.type}</p>
          <p><strong>Ngày:</strong> ${formatDateShort(v.date)}</p>
          <p><strong>Đối tác:</strong> ${partnerName}</p>
          <p><strong>Diễn giải:</strong> ${v.description || ""}</p>
          <p><strong>Số tiền:</strong> ${formatVND(v.totalAmount || v.amount || 0)}</p>
        </div>`;
  }
}

export function wrapVoucherHtmlDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chứng từ kế toán</title>
  <style>${VOUCHER_PREVIEW_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function getVoucherFromStore(id: string): VoucherExt | undefined {
  const state = useAppStore.getState().state;
  return state.vouchers.find((item) => item.id === id) as VoucherExt | undefined;
}

export async function printVoucher(id: string): Promise<VoucherPrintResult> {
  const state = useAppStore.getState().state;
  const bodyHtml = renderVoucherHtml(state, id);
  if (!bodyHtml) {
    return { ok: false, error: "Không tìm thấy chứng từ" };
  }

  const fullDoc = wrapVoucherHtmlDocument(bodyHtml);

  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:none;";
    frame.title = "Voucher print";
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) {
      frame.remove();
      if (window.electronAPI?.printWindow) {
        void window.electronAPI.printWindow().then(() => resolve({ ok: true }));
        return;
      }
      window.print();
      resolve({ ok: true });
      return;
    }

    doc.open();
    doc.write(fullDoc);
    doc.close();

    const doPrint = () => {
      win.focus();
      win.print();
      setTimeout(() => {
        frame.remove();
        resolve({ ok: true });
      }, 500);
    };

    if (doc.readyState === "complete") {
      setTimeout(doPrint, 250);
    } else {
      frame.onload = () => setTimeout(doPrint, 250);
    }
  });
}

export async function exportVoucherPdf(id: string): Promise<VoucherPrintResult> {
  const v = getVoucherFromStore(id);
  if (!v) {
    return { ok: false, error: "Không tìm thấy chứng từ" };
  }

  const state = useAppStore.getState().state;
  const bodyHtml = renderVoucherHtml(state, id);
  if (!bodyHtml.trim()) {
    return { ok: false, error: "Không có nội dung chứng từ để xuất PDF" };
  }

  const filename = `${v.id}_${v.date}.pdf`;

  try {
    if (window.electronAPI?.printHtmlToPDF) {
      const res = (await window.electronAPI.printHtmlToPDF(bodyHtml, filename)) as VoucherPrintResult;
      if (res?.ok) {
        return { ok: true, filePath: res.filePath };
      }
      return { ok: false, error: res?.error || "Không rõ nguyên nhân" };
    }

    if (window.electronAPI?.printToPDF) {
      const res = (await window.electronAPI.printToPDF(filename)) as VoucherPrintResult;
      if (res?.ok) {
        return { ok: true, filePath: res.filePath };
      }
      return { ok: false, error: res?.error || "Không rõ nguyên nhân" };
    }

    return {
      ok: false,
      error: "Môi trường trình duyệt không hỗ trợ xuất PDF trực tiếp",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
