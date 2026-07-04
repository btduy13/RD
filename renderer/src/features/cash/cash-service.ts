import { getAccountBalance } from "@/core/accounting";
import { getPartnerNameForVoucher, matchPartnerQuery } from "@/lib/partner-utils";
import type { AppState, Voucher } from "@/types/app-state";

export type CashTypeFilter = "all" | "receipt" | "payment";
export type CashMethodFilter = "all" | "111" | "112";

export interface CashKpis {
  cash111: number;
  bank112: number;
  totalReceipts: number;
  totalPayments: number;
}

export interface CashFilters {
  query: string;
  type: CashTypeFilter;
  method: CashMethodFilter;
  fromDate: string;
  toDate: string;
}

function isCashVoucher(v: Voucher): boolean {
  return (
    v.type === "receipt" ||
    v.type === "payment" ||
    Boolean(v.type?.startsWith("escrow_"))
  );
}

function isReceiptType(v: Voucher): boolean {
  return v.type === "receipt" || v.type === "escrow_receive" || v.type === "escrow_refund_pay";
}

function isPaymentType(v: Voucher): boolean {
  return v.type === "payment" || v.type === "escrow_pay" || v.type === "escrow_refund_receive";
}

export function computeCashKpis(state: AppState): CashKpis {
  let totalReceipts = 0;
  let totalPayments = 0;

  for (const v of state.vouchers ?? []) {
    if (!isCashVoucher(v)) continue;
    const amount = v.amount ?? 0;
    if (isReceiptType(v)) totalReceipts += amount;
    else if (isPaymentType(v)) totalPayments += amount;
  }

  return {
    cash111: getAccountBalance(state, "111"),
    bank112: getAccountBalance(state, "112"),
    totalReceipts,
    totalPayments,
  };
}

export function filterCashVouchers(state: AppState, filters: CashFilters): Voucher[] {
  const { query, type, method, fromDate, toDate } = filters;

  return (state.vouchers ?? [])
    .filter((v) => {
      if (!isCashVoucher(v)) return false;

      const partnerName = getPartnerNameForVoucher(state, v);
      const combined = `${v.id ?? ""}\t${partnerName}\t${v.description ?? ""}`;
      if (!matchPartnerQuery(combined, query)) return false;

      if (type === "receipt" && !isReceiptType(v)) return false;
      if (type === "payment" && !isPaymentType(v)) return false;

      if (method !== "all" && v.paymentMethod !== method) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;

      return true;
    })
    .sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da < db) return 1;
      if (da > db) return -1;
      return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: "base" });
    });
}

export function generateNextReceiptVoucherId(vouchers: Voucher[]): string {
  const prefix = "PT";
  const regex = /^PT(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 13122;
  return `${prefix}${maxNum + 1}`;
}

export function generateNextPaymentVoucherId(vouchers: Voucher[]): string {
  const prefix = "PC";
  const regex = /^PC(\d+)$/;
  let maxNum = 0;

  for (const v of vouchers) {
    const match = v.id?.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (maxNum === 0) maxNum = 7194;
  return `${prefix}${maxNum + 1}`;
}

export function buildReceiptVoucher(
  form: {
    id: string;
    date: string;
    partnerId: string;
    partnerName: string;
    amount: number;
    paymentMethod: string;
    description: string;
  }
): Voucher {
  const debit = form.paymentMethod;
  const credit = "131";
  return {
    id: form.id,
    type: "receipt",
    date: form.date,
    partnerId: form.partnerId,
    partnerName: form.partnerName,
    paymentMethod: debit,
    description: form.description,
    amount: form.amount,
    isManual: true,
    entries: [{ debit, credit, amount: form.amount, desc: form.description }],
  };
}

export function buildPaymentVoucher(
  form: {
    id: string;
    date: string;
    partnerId: string;
    partnerName: string;
    amount: number;
    paymentMethod: string;
    description: string;
  }
): Voucher {
  const debit = "331";
  const credit = form.paymentMethod;
  return {
    id: form.id,
    type: "payment",
    date: form.date,
    partnerId: form.partnerId,
    partnerName: form.partnerName,
    paymentMethod: credit,
    description: form.description,
    amount: form.amount,
    isManual: true,
    entries: [{ debit, credit, amount: form.amount, desc: form.description }],
  };
}

export { isReceiptType, isPaymentType };
