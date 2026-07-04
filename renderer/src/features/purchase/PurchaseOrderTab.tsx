import { PurchaseTabContent } from "./PurchaseTabContent";
import { PURCHASE_ORDER_CONFIG } from "./purchase-service";

export function PurchaseOrderTab() {
  return <PurchaseTabContent config={PURCHASE_ORDER_CONFIG} />;
}
