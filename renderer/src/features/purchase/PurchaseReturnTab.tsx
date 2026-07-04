import { PurchaseTabContent } from "./PurchaseTabContent";
import { PURCHASE_RETURN_CONFIG } from "./purchase-service";

export function PurchaseReturnTab() {
  return <PurchaseTabContent config={PURCHASE_RETURN_CONFIG} />;
}
