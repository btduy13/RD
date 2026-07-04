import { getPartnerNameForVoucher, matchPartnerQuery } from "@/lib/partner-utils";
import type { AppState, Voucher, VoucherItem } from "@/types/app-state";
import type { VoucherLineItem } from "@/components/shared/VoucherForm";

export type PurchaseVoucherType = "purchase" | "purchase_order" | "purchase_return";

export interface PurchaseTabConfig {
  voucherType: PurchaseVoucherType;
  title: string;
  description: string;
  createLabel: string;
  defaultDescription: string;
  emptyMessage: string;
  partnerFilter?: "supplier";
  debtAccount: "331";
}

export interface PurchaseFilters {
  query: string;
  fromDate: string;
  toDate: string;
}

export const PURCHASE_INVOICE_CONFIG: PurchaseTabConfig = {
  voucherType: "purchase",
  title: "Hóa đơn mua hàng",
  description: "Chứng từ mua hàng hóa, nguyên vật liệu nhập kho",
  createLabel: "Lập hóa đơn mua",
  defaultDescription: "Mua vật tư hàng hóa nhập kho",
  emptyMessage: "Không tìm thấy hóa đơn mua hàng",
  partnerFilter: "supplier",
  debtAccount: "331",
};

export const PURCHASE_ORDER_CONFIG: PurchaseTabConfig = {
  voucherType: "purchase_order",
  title: "Đơn đặt hàng mua",
  description: "Theo dõi đơn đặt hàng với nhà cung cấp",
  createLabel: "Lập đơn đặt hàng",
  defaultDescription: "Đơn đặt hàng mua vật tư hàng hóa",
  emptyMessage: "Không tìm thấy đơn đặt hàng mua",
  partnerFilter: "supplier",
  debtAccount: "331",
};

export const PURCHASE_RETURN_CONFIG: PurchaseTabConfig = {
  voucherType: "purchase_return",
  title: "Hàng trả lại mua",
  description: "Chứng từ trả lại hàng đã mua cho nhà cung cấp",
  createLabel: "Lập chứng từ trả lại",
  defaultDescription: "Trả lại hàng mua cho nhà cung cấp",
  emptyMessage: "Không tìm thấy chứng từ trả lại mua",
  partnerFilter: "supplier",
  debtAccount: "331",
};

export function filterPurchaseVouchers(
  state: AppState,
  type: PurchaseVoucherType,
  filters: PurchaseFilters
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

export function generateNextPurchaseVoucherId(vouchers: Voucher[]): string {
  const prefix = "NK";
  const regex = /^NK(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    if (v.type !== "purchase") continue;
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 8459;
  return `${prefix}${String(maxNum + 1).padStart(5, "0")}`;
}

export function generateNextPurchaseOrderVoucherId(vouchers: Voucher[]): string {
  const prefix = "ĐMH";
  const regex = /^(ĐMH|DMH)(\d{5})$/i;
  let maxNum = 0;

  for (const v of vouchers) {
    if (v.type !== "purchase_order" || !v.id) continue;
    const match = v.id.match(regex);
    if (match) {
      const num = parseInt(match[2], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(5, "0")}`;
}

export function generateNextPurchaseReturnVoucherId(vouchers: Voucher[]): string {
  const prefix = "MTL";
  const regex = /^MTL(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    if (v.type !== "purchase_return") continue;
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 8459;
  return `${prefix}${String(maxNum + 1).padStart(5, "0")}`;
}

export function generatePurchaseVoucherId(
  type: PurchaseVoucherType,
  vouchers: Voucher[]
): string {
  switch (type) {
    case "purchase_order":
      return generateNextPurchaseOrderVoucherId(vouchers);
    case "purchase_return":
      return generateNextPurchaseReturnVoucherId(vouchers);
    default:
      return generateNextPurchaseVoucherId(vouchers);
  }
}

export function getPurchasePaymentLabel(method?: string): string {
  if (method === "331") return "Công nợ (331)";
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

export function buildPurchaseVoucher(
  config: PurchaseTabConfig,
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
