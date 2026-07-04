import { matchPartnerQuery } from "@/lib/partner-utils";
import type { AppState, Partner, Voucher, VoucherEntry } from "@/types/app-state";

export const UNMATCHED_PARTNER_ID = "__UNMATCHED__";

export type DebtTypeFilter = "all" | "131" | "331";

export interface DebtCounters {
  debit131: number;
  credit131: number;
  debit331: number;
  credit331: number;
}

export interface PartnerDebtSummary {
  id: string;
  name: string;
  type: string;
  declaredType?: string;
  openingDebit: number;
  openingCredit: number;
  debitTrans: number;
  creditTrans: number;
  closingDebit: number;
  closingCredit: number;
  netDebt: number;
  orphanPartnerIds?: string[];
}

export interface DebtFilters {
  query: string;
  type: DebtTypeFilter;
  activeOnly: boolean;
  fromDate: string;
  toDate: string;
}

export interface PartnerLedgerRow {
  date: string;
  voucherId: string;
  displayId: string;
  partnerId: string;
  description: string;
  offsetAccount: string;
  debit: number;
  credit: number;
  voucherType: string;
}

export interface PartnerLedgerResult {
  partner: Partner | undefined;
  debtRole: "customer" | "supplier" | "both";
  openingText: string;
  closingText: string;
  openingVal: number;
  closingVal: number;
  rows: PartnerLedgerRow[];
  debitSum: number;
  creditSum: number;
}

function createEmptyDebtCounters(): DebtCounters {
  return { debit131: 0, credit131: 0, debit331: 0, credit331: 0 };
}

function getDebtOpeningBasis(partnerType: string | undefined, op: { debit?: number; credit?: number }) {
  if (partnerType === "supplier") {
    return { debit131: 0, credit131: 0, debit331: op.debit || 0, credit331: op.credit || 0 };
  }
  return { debit131: op.debit || 0, credit131: op.credit || 0, debit331: 0, credit331: 0 };
}

function accumulateDebtEntryLines(e: VoucherEntry, counters: DebtCounters) {
  if (e.debit?.startsWith("131")) counters.debit131 += e.amount;
  if (e.credit?.startsWith("131")) counters.credit131 += e.amount;
  if (e.credit?.startsWith("331")) counters.credit331 += e.amount;
  if (e.debit?.startsWith("331")) counters.debit331 += e.amount;
}

function computeDebtSides(
  initialOpening: { debit?: number; credit?: number },
  priorCounters: DebtCounters,
  periodCounters: DebtCounters,
  partnerType: string | undefined
) {
  const basis = getDebtOpeningBasis(partnerType, initialOpening);

  const open131Debit = basis.debit131 + priorCounters.debit131;
  const open131Credit = basis.credit131 + priorCounters.credit131;
  const open331Debit = basis.debit331 + priorCounters.debit331;
  const open331Credit = basis.credit331 + priorCounters.credit331;

  const net131Open = open131Debit - open131Credit;
  const net331Open = open331Credit - open331Debit;

  const activity131 =
    open131Debit + open131Credit + periodCounters.debit131 + periodCounters.credit131;
  const activity331 =
    open331Debit + open331Credit + periodCounters.debit331 + periodCounters.credit331;

  const roleSupplier = partnerType === "supplier" || (activity331 > 0 && activity131 === 0);

  const resolveSides = (net131: number, net331: number) => {
    if (net131 > 0 && net331 > 0) {
      return { debit: net131, credit: net331 };
    }
    const combined = roleSupplier ? net331 - net131 : net131 + net331;
    if (roleSupplier) {
      return combined >= 0 ? { debit: 0, credit: combined } : { debit: -combined, credit: 0 };
    }
    return combined >= 0 ? { debit: combined, credit: 0 } : { debit: 0, credit: -combined };
  };

  const openSides = resolveSides(net131Open, net331Open);
  const net131Close = net131Open + periodCounters.debit131 - periodCounters.credit131;
  const net331Close = net331Open + periodCounters.credit331 - periodCounters.debit331;
  const closeSides = resolveSides(net131Close, net331Close);

  const debitTrans = roleSupplier
    ? periodCounters.debit131 + periodCounters.debit331
    : periodCounters.debit131 + periodCounters.credit331;
  const creditTrans = roleSupplier
    ? periodCounters.credit131 + periodCounters.credit331
    : periodCounters.credit131 + periodCounters.debit331;

  return {
    openingDebit: openSides.debit,
    openingCredit: openSides.credit,
    debitTrans,
    creditTrans,
    closingDebit: closeSides.debit,
    closingCredit: closeSides.credit,
    has131: activity131 > 0,
    has331: activity331 > 0,
    roleSupplier,
  };
}

function inferPartnerDebtRole(
  partnerType: string | undefined,
  has131: boolean,
  has331: boolean
): "customer" | "supplier" | "both" {
  if (partnerType === "both" || (has131 && has331)) return "both";
  if (partnerType === "supplier" && !has131) return "supplier";
  if (has331 && !has131) return "supplier";
  return "customer";
}

export function getVoucherDebtEntries(v: Voucher): VoucherEntry[] {
  if (!v) return [];

  const raw = v.entries;
  if (Array.isArray(raw) && raw.length > 0) {
    const hasDebtLine = raw.some(
      (e) =>
        (e.debit && (e.debit.startsWith("131") || e.debit.startsWith("331"))) ||
        (e.credit && (e.credit.startsWith("131") || e.credit.startsWith("331")))
    );
    if (hasDebtLine) return raw;
  }

  const amt = Number(v.remainingDebt ?? v.totalAmount ?? v.amount ?? 0);
  const pm = String(v.paymentMethod || "");

  switch (v.type) {
    case "sales":
      if (pm === "131" || pm.startsWith("131")) {
        return [{ debit: "131", credit: "511", amount: amt }];
      }
      break;
    case "purchase":
      if (pm === "331" || pm.startsWith("331")) {
        return [{ debit: "156", credit: "331", amount: amt }];
      }
      break;
    case "receipt": {
      const receiptAmt = Number(v.amount ?? amt);
      if (receiptAmt > 0) {
        return [{ debit: pm || "111", credit: "131", amount: receiptAmt }];
      }
      break;
    }
    case "payment": {
      const paymentAmt = Number(v.amount ?? amt);
      if (paymentAmt > 0) {
        return [{ debit: "331", credit: pm || "111", amount: paymentAmt }];
      }
      break;
    }
    case "sales_return":
      if (amt > 0) {
        const creditAcc = pm && pm !== "131" ? pm : "131";
        return [{ debit: "511", credit: creditAcc, amount: amt }];
      }
      break;
    case "purchase_return":
      if (amt > 0) {
        const debitAcc = pm && pm !== "331" ? pm : "331";
        return [{ debit: debitAcc, credit: "156", amount: amt }];
      }
      break;
    default:
      break;
  }
  return [];
}

function extractLedgerAmountsFromVoucher(
  v: Voucher,
  debtRole: "customer" | "supplier" | "both"
) {
  let debitAmount = 0;
  let creditAmount = 0;
  const offsetAccountSet = new Set<string>();

  getVoucherDebtEntries(v).forEach((e) => {
    const touches131 =
      (e.debit && e.debit.startsWith("131")) || (e.credit && e.credit.startsWith("131"));
    const touches331 =
      (e.debit && e.debit.startsWith("331")) || (e.credit && e.credit.startsWith("331"));
    let isRelevant = false;
    if (debtRole === "customer") isRelevant = Boolean(touches131);
    else if (debtRole === "supplier") isRelevant = Boolean(touches331);
    else isRelevant = Boolean(touches131 || touches331);
    if (!isRelevant) return;

    if (
      (e.debit && e.debit.startsWith("131")) ||
      (e.debit && e.debit.startsWith("331"))
    ) {
      debitAmount += e.amount;
      if (e.credit) offsetAccountSet.add(e.credit);
    } else if (
      (e.credit && e.credit.startsWith("131")) ||
      (e.credit && e.credit.startsWith("331"))
    ) {
      creditAmount += e.amount;
      if (e.debit) offsetAccountSet.add(e.debit);
    }
  });

  return { debitAmount, creditAmount, offsetAccount: Array.from(offsetAccountSet).join(", ") };
}

export function calculatePartnerDebts(
  state: AppState,
  fromDate = "",
  toDate = ""
): PartnerDebtSummary[] {
  const debts: Record<
    string,
    PartnerDebtSummary & { priorCounters: DebtCounters; periodCounters: DebtCounters; initialOpeningDebit: number; initialOpeningCredit: number }
  > = {};
  const partnerIds = new Set<string>();

  for (const p of state.partners ?? []) {
    partnerIds.add(p.id);
    const opening = state.partnerOpeningBalances?.[p.id] || { debit: 0, credit: 0 };
    debts[p.id] = {
      id: p.id,
      name: p.name,
      type: p.type ?? "",
      declaredType: p.type,
      initialOpeningDebit: opening.debit || 0,
      initialOpeningCredit: opening.credit || 0,
      priorCounters: createEmptyDebtCounters(),
      periodCounters: createEmptyDebtCounters(),
      openingDebit: 0,
      openingCredit: 0,
      debitTrans: 0,
      creditTrans: 0,
      closingDebit: 0,
      closingCredit: 0,
      netDebt: 0,
    };
  }

  for (const v of state.vouchers ?? []) {
    if (toDate && v.date > toDate) continue;
    if (!v.partnerId) continue;
    if (!partnerIds.has(v.partnerId)) continue;

    const d = debts[v.partnerId];
    const isPrior = Boolean(fromDate && v.date < fromDate);
    getVoucherDebtEntries(v).forEach((e) => {
      accumulateDebtEntryLines(e, isPrior ? d.priorCounters : d.periodCounters);
    });
  }

  const unmatchedPrior = createEmptyDebtCounters();
  const unmatchedPeriod = createEmptyDebtCounters();
  const orphanPartnerIds = new Set<string>();

  for (const v of state.vouchers ?? []) {
    if (toDate && v.date > toDate) continue;
    if (!v.partnerId) continue;
    if (partnerIds.has(v.partnerId)) continue;
    orphanPartnerIds.add(v.partnerId);
    const isPrior = Boolean(fromDate && v.date < fromDate);
    getVoucherDebtEntries(v).forEach((e) => {
      accumulateDebtEntryLines(e, isPrior ? unmatchedPrior : unmatchedPeriod);
    });
  }

  const results: PartnerDebtSummary[] = [];

  for (const id of Object.keys(debts)) {
    const d = debts[id];
    const opening = { debit: d.initialOpeningDebit, credit: d.initialOpeningCredit };
    const sides = computeDebtSides(opening, d.priorCounters, d.periodCounters, d.type);
    let type = d.type;
    if (inferPartnerDebtRole(d.type, sides.has131, sides.has331) === "both") {
      type = "both";
    }
    results.push({
      id: d.id,
      name: d.name,
      type,
      declaredType: d.declaredType,
      openingDebit: sides.openingDebit,
      openingCredit: sides.openingCredit,
      debitTrans: sides.debitTrans,
      creditTrans: sides.creditTrans,
      closingDebit: sides.closingDebit,
      closingCredit: sides.closingCredit,
      netDebt: sides.closingDebit - sides.closingCredit,
    });
  }

  if (orphanPartnerIds.size > 0) {
    const orphanHas131 =
      unmatchedPrior.debit131 +
        unmatchedPrior.credit131 +
        unmatchedPeriod.debit131 +
        unmatchedPeriod.credit131 >
      0;
    const orphanHas331 =
      unmatchedPrior.debit331 +
        unmatchedPrior.credit331 +
        unmatchedPeriod.debit331 +
        unmatchedPeriod.credit331 >
      0;
    const orphanRole = inferPartnerDebtRole("both", orphanHas131, orphanHas331);
    const unmatchedSides = computeDebtSides(
      { debit: 0, credit: 0 },
      unmatchedPrior,
      unmatchedPeriod,
      orphanRole
    );
    results.push({
      id: UNMATCHED_PARTNER_ID,
      name: `⚠ Chưa khớp đối tác (${orphanPartnerIds.size} mã)`,
      type: "unmatched",
      openingDebit: unmatchedSides.openingDebit,
      openingCredit: unmatchedSides.openingCredit,
      debitTrans: unmatchedSides.debitTrans,
      creditTrans: unmatchedSides.creditTrans,
      closingDebit: unmatchedSides.closingDebit,
      closingCredit: unmatchedSides.closingCredit,
      netDebt: unmatchedSides.closingDebit - unmatchedSides.closingCredit,
      orphanPartnerIds: Array.from(orphanPartnerIds),
    });
  }

  return results;
}

export function filterPartnerDebts(
  debts: PartnerDebtSummary[],
  filters: DebtFilters
): PartnerDebtSummary[] {
  const { query, type, activeOnly } = filters;

  return debts
    .filter((d) => {
      const combined = `${d.id || ""}\t${d.name || ""}`;
      if (!matchPartnerQuery(combined, query)) return false;

      if (type === "131" && (d.declaredType || d.type) === "supplier") return false;
      if (type === "331" && (d.declaredType || d.type) !== "supplier") return false;

      if (activeOnly && d.closingDebit <= 0 && d.closingCredit <= 0) return false;

      return true;
    })
    .sort((a, b) => {
      if (a.id === UNMATCHED_PARTNER_ID) return -1;
      if (b.id === UNMATCHED_PARTNER_ID) return 1;
      return a.name.localeCompare(b.name, "vi");
    });
}

export function buildPartnerLedger(
  state: AppState,
  partnerId: string,
  fromDate = "",
  toDate = ""
): PartnerLedgerResult {
  const partner = state.partners?.find((p) => p.id === partnerId);
  const debtRole = partner
    ? inferPartnerDebtRole(
        partner.type,
        partner.type !== "supplier",
        partner.type === "supplier" || partner.type === "both"
      )
    : "customer";

  const op = state.partnerOpeningBalances?.[partnerId] || { debit: 0, credit: 0 };
  const prior = createEmptyDebtCounters();

  for (const v of state.vouchers ?? []) {
    if (v.partnerId !== partnerId) continue;
    if (fromDate && v.date < fromDate) continue;
    getVoucherDebtEntries(v).forEach((e) => accumulateDebtEntryLines(e, prior));
  }

  const openingSides = computeDebtSides(op, prior, createEmptyDebtCounters(), partner?.type);
  let openingVal = 0;
  if (debtRole === "supplier") {
    openingVal = openingSides.openingCredit - openingSides.openingDebit;
  } else {
    openingVal = openingSides.openingDebit - openingSides.openingCredit;
  }

  const openingText =
    openingVal >= 0
      ? `${openingVal.toLocaleString("vi-VN")} (${debtRole === "supplier" ? "Có" : "Nợ"})`
      : `${Math.abs(openingVal).toLocaleString("vi-VN")} (${debtRole === "supplier" ? "Nợ" : "Có"})`;

  const rows: PartnerLedgerRow[] = [];
  let debitSum = 0;
  let creditSum = 0;

  for (const v of state.vouchers ?? []) {
    if (v.partnerId !== partnerId) continue;
    if (fromDate && v.date < fromDate) continue;
    if (toDate && v.date > toDate) continue;

    const extracted = extractLedgerAmountsFromVoucher(v, debtRole);
    if (extracted.debitAmount <= 0 && extracted.creditAmount <= 0) continue;

    rows.push({
      date: v.date,
      voucherId: v.id,
      displayId: v.id,
      partnerId: v.partnerId ?? "",
      description: v.description ?? "",
      offsetAccount: extracted.offsetAccount,
      debit: extracted.debitAmount,
      credit: extracted.creditAmount,
      voucherType: v.type,
    });
    debitSum += extracted.debitAmount;
    creditSum += extracted.creditAmount;
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let closingVal = 0;
  if (debtRole === "supplier") {
    closingVal = openingVal + creditSum - debitSum;
  } else {
    closingVal = openingVal + debitSum - creditSum;
  }

  const closingText =
    closingVal >= 0
      ? `${closingVal.toLocaleString("vi-VN")} (${debtRole === "supplier" ? "Có" : "Nợ"})`
      : `${Math.abs(closingVal).toLocaleString("vi-VN")} (${debtRole === "supplier" ? "Nợ" : "Có"})`;

  return {
    partner,
    debtRole,
    openingText,
    closingText,
    openingVal,
    closingVal,
    rows,
    debitSum,
    creditSum,
  };
}

export function getDebtTypeLabel(type: string): string {
  if (type === "supplier") return "NCC (331)";
  if (type === "both") return "Hỗn hợp";
  if (type === "unmatched") return "Chưa khớp";
  if (type === "enterprise") return "Doanh nghiệp";
  if (type === "project") return "Công trình";
  if (type === "retail") return "Khách lẻ";
  return "Phải thu (131)";
}
