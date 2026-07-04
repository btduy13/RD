import { PurchaseTabContent } from "./PurchaseTabContent";
import { PURCHASE_INVOICE_CONFIG } from "./purchase-service";

export function PurchaseInvoiceTab() {
  return <PurchaseTabContent config={PURCHASE_INVOICE_CONFIG} />;
}
