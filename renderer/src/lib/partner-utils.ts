import type { AppState, Partner, Voucher } from "@/types/app-state";

export function removeAccents(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function matchPartnerQuery(text: string, query: string): boolean {
  if (!query.trim()) return true;
  const cleanTarget = removeAccents(text.toLowerCase());
  const cleanQuery = removeAccents(query.toLowerCase().trim());
  return cleanTarget.includes(cleanQuery);
}

export function getPartnerForVoucher(
  state: AppState,
  voucher: Voucher
): Partner | undefined {
  if (!voucher.partnerId) return undefined;
  return state.partners?.find((p) => String(p.id) === String(voucher.partnerId));
}

export function getPartnerNameForVoucher(state: AppState, voucher: Voucher): string {
  const partner = getPartnerForVoucher(state, voucher);
  if (partner) {
    if (partner.type === "project" && partner.parentId) {
      const parent = state.partners?.find((p) => p.id === partner.parentId);
      if (parent) return `${partner.name} (${parent.name})`;
    }
    return partner.name;
  }
  return (voucher as Voucher & { partnerName?: string }).partnerName ?? "Khách hàng vãng lai";
}

export const PARTNER_TYPE_LABELS: Record<string, string> = {
  retail: "Khách lẻ",
  supplier: "Nhà cung cấp",
  enterprise: "Doanh nghiệp",
  project: "Công trình",
};

export const PARTNER_TYPE_VARIANTS: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive"
> = {
  enterprise: "default",
  project: "warning",
  retail: "success",
  supplier: "secondary",
};
