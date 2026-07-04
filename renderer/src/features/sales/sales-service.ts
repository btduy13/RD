import { getPartnerNameForVoucher, matchPartnerQuery } from "@/lib/partner-utils";
import type { AppState, Voucher, VoucherItem } from "@/types/app-state";
import type { VoucherLineItem } from "@/components/shared/VoucherForm";

export type SalesVoucherType = "sales" | "sales_return" | "sales_quotation";

export interface SalesTabConfig {
  voucherType: SalesVoucherType;
  title: string;
  description: string;
  createLabel: string;
  defaultDescription: string;
  emptyMessage: string;
  showCogs: boolean;
  debtAccount: "131";
}

export interface SalesFilters {
  query: string;
  fromDate: string;
  toDate: string;
}

export const SALES_INVOICE_CONFIG: SalesTabConfig = {
  voucherType: "sales",
  title: "Hóa đơn bán hàng",
  description: "Chứng từ bán hàng xuất kho và công nợ khách hàng",
  createLabel: "Lập hóa đơn bán",
  defaultDescription: "Bán hàng xuất kho",
  emptyMessage: "Không tìm thấy hóa đơn bán hàng",
  showCogs: true,
  debtAccount: "131",
};

export const SALES_RETURN_CONFIG: SalesTabConfig = {
  voucherType: "sales_return",
  title: "Hàng bán trả lại",
  description: "Chứng từ hàng bán trả lại nhập kho",
  createLabel: "Lập chứng từ trả lại",
  defaultDescription: "Nhập hàng bán trả lại",
  emptyMessage: "Không tìm thấy chứng từ trả lại bán hàng",
  showCogs: false,
  debtAccount: "131",
};

export const SALES_QUOTATION_CONFIG: SalesTabConfig = {
  voucherType: "sales_quotation",
  title: "Báo giá",
  description: "Quản lý báo giá hàng hóa cho khách hàng",
  createLabel: "Lập báo giá",
  defaultDescription: "Báo giá hàng hóa",
  emptyMessage: "Không tìm thấy báo giá",
  showCogs: false,
  debtAccount: "131",
};

export function filterSalesVouchers(
  state: AppState,
  type: SalesVoucherType,
  filters: SalesFilters
): Voucher[] {
  const { query, fromDate, toDate } = filters;

  return (state.vouchers ?? [])
    .filter((v) => {
      if (v.type !== type) return false;

      const partnerName = getPartnerNameForVoucher(state, v);
      const combined = `${v.id ?? ""}\t${partnerName}\t${v.description ?? ""}`;
      if (!matchPartnerQuery(combined, query)) return false;

      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;

      return true;
    })
    .sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da !== db) return db.localeCompare(da);
      return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: "base" });
    });
}

export function generateNextSalesVoucherId(vouchers: Voucher[]): string {
  const prefix = "BH";
  const regex = /^BH(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 44340;
  return `${prefix}${maxNum + 1}`;
}

export function generateNextSalesReturnVoucherId(vouchers: Voucher[]): string {
  const prefix = "BTL";
  const regex = /^BTL(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    if (v.type !== "sales_return") continue;
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 1000;
  return `${prefix}${maxNum + 1}`;
}

export function generateNextQuotationVoucherId(vouchers: Voucher[]): string {
  const prefix = "BG";
  const regex = /^BG(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 10000;
  return `${prefix}${maxNum + 1}`;
}

export function generateSalesVoucherId(type: SalesVoucherType, vouchers: Voucher[]): string {
  switch (type) {
    case "sales_return":
      return generateNextSalesReturnVoucherId(vouchers);
    case "sales_quotation":
      return generateNextQuotationVoucherId(vouchers);
    default:
      return generateNextSalesVoucherId(vouchers);
  }
}

export function getSalesPaymentLabel(method?: string): string {
  if (method === "131") return "Công nợ (131)";
  if (method === "111") return "Tiền mặt (111)";
  if (method === "112") return "Ngân hàng (112)";
  return method ?? "—";
}

export function lineItemsToVoucherItems(items: VoucherLineItem[]): VoucherItem[] {
  return items
    .filter((row) => row.productId && row.qty > 0)
    .map((row) => ({
      productId: row.productId,
      qty: row.qty,
      price: row.price,
      amount: row.amount,
      discount: row.discount,
    }));
}

export function voucherItemsToLineItems(items: VoucherItem[] = []): VoucherLineItem[] {
  return items.map((item, index) => ({
    id: `${item.productId ?? "row"}-${index}-${Date.now()}`,
    productId: item.productId,
    qty: item.qty ?? 0,
    price: item.price ?? 0,
    discount: (item as VoucherItem & { discount?: number }).discount ?? 0,
    amount: item.amount ?? 0,
  }));
}

export function buildSalesVoucher(
  config: SalesTabConfig,
  form: {
    id: string;
    date: string;
    partnerId: string;
    partnerName: string;
    paymentMethod: string;
    description: string;
    taxRate: number;
    items: VoucherLineItem[];
  }
): Voucher {
  const voucherItems = lineItemsToVoucherItems(form.items);
  const subtotal = voucherItems.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = Math.round(subtotal * (form.taxRate / 100));

  return {
    id: form.id,
    type: config.voucherType,
    date: form.date,
    partnerId: form.partnerId,
    partnerName: form.partnerName,
    paymentMethod: form.paymentMethod,
    description: form.description,
    items: voucherItems,
    taxRate: form.taxRate,
    taxAmount,
    totalAmount: subtotal + taxAmount,
    isManual: true,
  };
}

export function isDuplicateVoucherId(
  vouchers: Voucher[],
  id: string,
  editingId?: string | null
): boolean {
  const normalized = id.trim().toLowerCase();
  return vouchers.some(
    (v) =>
      v.id.toLowerCase() === normalized &&
      (!editingId || v.id.toLowerCase() !== editingId.toLowerCase())
  );
}
