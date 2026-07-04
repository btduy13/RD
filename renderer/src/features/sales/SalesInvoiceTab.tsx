import { SalesTabContent } from "./SalesTabContent";
import { SALES_INVOICE_CONFIG } from "./sales-service";

export function SalesInvoiceTab() {
  return <SalesTabContent config={SALES_INVOICE_CONFIG} />;
}
