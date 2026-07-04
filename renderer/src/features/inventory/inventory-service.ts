import { matchPartnerQuery } from "@/lib/partner-utils";
import type { AppState, Product, Voucher, VoucherItem } from "@/types/app-state";

export interface StockLedgerRow {
  date: string;
  voucherId: string;
  description: string;
  importQty: number | null;
  exportQty: number | null;
  unitCost: number;
  runningStock: number;
  voucherType: string;
}

export function filterProducts(state: AppState, query: string): Product[] {
  return (state.products ?? []).filter((p) => {
    const combined = `${p.id ?? ""} ${p.name ?? ""}`;
    return matchPartnerQuery(combined, query);
  });
}

export function getProductInitialStock(product: Product, defaultProducts: Product[]): number {
  const orig = defaultProducts.find((o) => o.id === product.id);
  return orig?.stock ?? product.initialStock ?? 0;
}

export function getProductInitialCost(product: Product, defaultProducts: Product[]): number {
  const orig = defaultProducts.find((o) => o.id === product.id);
  return orig?.avgCost ?? product.initialCost ?? product.avgCost ?? 0;
}

export function buildStockLedger(
  state: AppState,
  productId: string,
  defaultProducts: Product[],
  fromDate = "",
  toDate = ""
): { product: Product | undefined; rows: StockLedgerRow[] } {
  const product = state.products?.find((p) => String(p.id) === String(productId));
  if (!product) return { product: undefined, rows: [] };

  const initStock = getProductInitialStock(product, defaultProducts);
  const initCost = getProductInitialCost(product, defaultProducts);

  const rows: StockLedgerRow[] = [
    {
      date: "01/01/2026",
      voucherId: "TỒN ĐẦU KỲ",
      description: "Số dư đầu kỳ",
      importQty: null,
      exportQty: null,
      unitCost: initCost,
      runningStock: initStock,
      voucherType: "opening",
    },
  ];

  const ledgerTypes = new Set([
    "purchase",
    "sales",
    "purchase_return",
    "sales_return",
    "inventory_adjust",
  ]);

  const vouchers = (state.vouchers ?? [])
    .filter((v) => {
      if (!ledgerTypes.has(v.type)) return false;
      const item = v.items?.find((i) => String(i.productId) === String(productId));
      if (!item) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" })
    );

  let runningStock = initStock;

  for (const v of vouchers) {
    const item = v.items?.find((i) => String(i.productId) === String(productId));
    if (!item) continue;

    const row = voucherToLedgerRow(v, item, runningStock);
    runningStock = row.runningStock;
    rows.push(row);
  }

  return { product, rows };
}

function voucherToLedgerRow(
  voucher: Voucher,
  item: VoucherItem,
  runningStock: number
): StockLedgerRow {
  const qty = item.qty ?? 0;
  let importQty: number | null = null;
  let exportQty: number | null = null;
  let unitCost = item.price ?? item.cogsUnit ?? 0;

  if (voucher.type === "purchase" || voucher.type === "purchase_return" || voucher.type === "sales_return") {
    runningStock += qty;
    importQty = qty;
    unitCost = item.price ?? 0;
  } else if (voucher.type === "sales") {
    runningStock -= qty;
    exportQty = qty;
    unitCost = item.cogsUnit ?? 0;
  } else if (voucher.type === "inventory_adjust") {
    if (item.adjustDir === "in") {
      runningStock += qty;
      importQty = qty;
      unitCost = item.price ?? 0;
    } else {
      runningStock -= qty;
      exportQty = qty;
      unitCost = item.price ?? item.cogsUnit ?? 0;
    }
  }

  return {
    date: voucher.date,
    voucherId: voucher.id,
    description: voucher.description ?? voucher.type,
    importQty,
    exportQty,
    unitCost,
    runningStock,
    voucherType: voucher.type,
  };
}
