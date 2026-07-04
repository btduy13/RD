import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import type { Product } from "@/types/app-state";
import { InventoryTable } from "./InventoryTable";
import { StockLedgerDialog } from "./StockLedgerDialog";
import { filterProducts } from "./inventory-service";

export function InventoryPage() {
  const state = useAppStore((s) => s.state);
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);

  const products = useMemo(
    () =>
      filterProducts(state, "").sort((a, b) =>
        a.name.localeCompare(b.name, "vi", { numeric: true })
      ),
    [state]
  );

  const negativeCount = useMemo(
    () => products.filter((p) => (p.stock ?? 0) < 0).length,
    [products]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Tồn kho sản phẩm</CardTitle>
            <CardDescription>
              Theo dõi số lượng, giá bình quân và giá trị tồn kho
            </CardDescription>
          </div>
          {negativeCount > 0 && (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {negativeCount} âm kho
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <InventoryTable products={products} onViewLedger={setLedgerProduct} />
        </CardContent>
      </Card>

      <StockLedgerDialog
        open={Boolean(ledgerProduct)}
        onOpenChange={(open) => !open && setLedgerProduct(null)}
        product={ledgerProduct}
      />
    </div>
  );
}
