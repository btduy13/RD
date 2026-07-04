import { removeAccents, matchPartnerQuery } from "@/lib/partner-utils";
import type { AppState, Partner } from "@/types/app-state";

export type PartnerTypeFilter = "all" | "retail" | "supplier" | "enterprise" | "project" | "customer";

export function generatePartnerIdClean(name: string, type: string): string {
  if (!name) return "";
  let clean = removeAccents(name).toUpperCase();

  clean = clean.replace(
    /^(CONG TY TNHH SX TM DV|CONG TY TNHH SX TM|CONG TY TNHH TM DV|CONG TY TNHH DV|CONG TY TNHH TM|CONG TY TNHH|CONG TY CO PHAN|CONG TY CP|CONG TY|CTY TNHH SX TM DV|CTY TNHH SX TM|CTY TNHH TM DV|CTY TNHH DV|CTY TNHH TM|CTY TNHH|CTY CP|CTY|DOANH NGHIEP|DN|CHI NHANH)\s+/g,
    ""
  );
  clean = clean.replace(/\s+(TNHH|CO PHAN|CP|SX|TM|DV)$/g, "");
  clean = clean.replace(/[^A-Z0-9/]/g, " ");
  clean = clean.trim().replace(/\s+/g, " ");

  const baseId = clean.split(" ").join("");

  if (type === "enterprise") return `DN_${baseId}`;
  if (type === "project") return baseId.endsWith("CH") ? baseId : `${baseId}(CH)`;
  if (type === "supplier") return `NCC_${baseId}`;
  if (type === "retail") return `KL_${baseId}`;
  return baseId;
}

export function getUniquePartnerId(
  partners: Partner[],
  name: string,
  type: string,
  excludeId = ""
): string {
  let base = generatePartnerIdClean(name, type);
  if (!base) return "";

  let uniqueId = base;
  let counter = 1;
  while (partners.some((p) => p.id === uniqueId && p.id !== excludeId)) {
    if (type === "project" && base.endsWith("(CH)")) {
      const baseWithoutCH = base.substring(0, base.length - 4);
      uniqueId = `${baseWithoutCH}_${counter}(CH)`;
    } else {
      uniqueId = `${base}_${counter}`;
    }
    counter++;
  }
  return uniqueId;
}

export function validatePartnerId(
  partners: Partner[],
  id: string,
  excludeId = ""
): { valid: boolean; message: string } {
  const idVal = id.trim().toUpperCase();
  if (!idVal) return { valid: false, message: "Mã đối tác không được để trống." };
  const isDuplicate = partners.some(
    (p) => p.id.toUpperCase() === idVal && p.id !== excludeId
  );
  if (isDuplicate) return { valid: false, message: "Mã đã tồn tại!" };
  return { valid: true, message: "Mã hợp lệ!" };
}

export function sanitizePartnerIdInput(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9_()/-]/g, "");
}

export function filterPartners(
  state: AppState,
  query: string,
  typeFilter: PartnerTypeFilter
): Partner[] {
  return (state.partners ?? []).filter((p) => {
    const combined = `${p.id ?? ""}\t${p.name ?? ""}\t${p.phone ?? ""}\t${p.address ?? ""}`;
    const matchesQuery = matchPartnerQuery(combined, query);

    let matchesType = false;
    if (typeFilter === "all") {
      matchesType = true;
    } else if (typeFilter === "customer") {
      matchesType = p.type === "retail" || p.type === "enterprise" || p.type === "project";
    } else {
      matchesType = p.type === typeFilter;
    }

    return matchesQuery && matchesType;
  });
}

export function countLinkedVouchers(state: AppState, partnerId: string): number {
  return (state.vouchers ?? []).filter((v) => v.partnerId === partnerId).length;
}

export function buildPartnerPayload(form: {
  id: string;
  name: string;
  type: string;
  phone: string;
  address: string;
}): Partner {
  return {
    id: form.id.trim().toUpperCase(),
    name: form.name.trim(),
    type: form.type,
    phone: form.phone.trim(),
    address: form.address.trim(),
    inactive: false,
  };
}
