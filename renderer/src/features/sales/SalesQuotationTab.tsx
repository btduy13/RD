import { SalesTabContent } from "./SalesTabContent";
import { SALES_QUOTATION_CONFIG } from "./sales-service";

export function SalesQuotationTab() {
  return <SalesTabContent config={SALES_QUOTATION_CONFIG} />;
}
