import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { VoucherListTable } from "@/components/shared/VoucherListTable";
import { VoucherPreviewDialog } from "@/components/shared/VoucherPreviewDialog";
import { useToast } from "@/components/shared/ToastProvider";
import { useCanEdit } from "@/hooks/useCanEdit";
import { useAppStore } from "@/store/app-store";
import type { Voucher } from "@/types/app-state";
import { SalesFormDialog } from "./SalesFormDialog";
import {
  filterSalesVouchers,
  getSalesPaymentLabel,
  type SalesFilters,
  type SalesTabConfig,
} from "./sales-service";

export interface SalesTabContentProps {
  config: SalesTabConfig;
}

export function SalesTabContent({ config }: SalesTabContentProps) {
  const state = useAppStore((s) => s.state);
  const deleteVoucher = useAppStore((s) => s.deleteVoucher);
  const canEdit = useCanEdit();
  const { toast } = useToast();

  const [filters, setFilters] = useState<SalesFilters>({
    query: "",
    fromDate: "",
    toDate: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null);
  const [batchDeleteIds, setBatchDeleteIds] = useState<string[] | null>(null);

  const vouchers = useMemo(
    () => filterSalesVouchers(state, config.voucherType, filters),
    [state, config.voucherType, filters]
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteVoucher(deleteTarget.id);
    toast(`Đã xóa thành công chứng từ ${deleteTarget.id}!`, "success");
    setDeleteTarget(null);
  };

  const handleBatchDelete = async () => {
    if (!batchDeleteIds?.length) return;
    for (const id of batchDeleteIds) {
      await deleteVoucher(id);
    }
    toast(`Đã xóa thành công ${batchDeleteIds.length} chứng từ!`, "success");
    setBatchDeleteIds(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </div>
          {canEdit && (
            <Button
              onClick={() => {
                setEditingVoucher(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {config.createLabel}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter
              fromDate={filters.fromDate}
              toDate={filters.toDate}
              onFromDateChange={(fromDate) => setFilters((f) => ({ ...f, fromDate }))}
              onToDateChange={(toDate) => setFilters((f) => ({ ...f, toDate }))}
            />
            <Button
              variant="ghost"
              onClick={() => setFilters({ query: "", fromDate: "", toDate: "" })}
            >
              Xóa lọc
            </Button>
          </div>

          <VoucherListTable
            state={state}
            vouchers={vouchers}
            canEdit={canEdit}
            showCogs={config.showCogs}
            paymentLabel={getSalesPaymentLabel}
            emptyMessage={config.emptyMessage}
            onView={(v) => setPreviewId(v.id)}
            onEdit={(v) => {
              setEditingVoucher(v);
              setFormOpen(true);
            }}
            onDelete={setDeleteTarget}
            onBatchDelete={setBatchDeleteIds}
          />
        </CardContent>
      </Card>

      <SalesFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        config={config}
        voucher={editingVoucher}
      />

      <VoucherPreviewDialog
        open={Boolean(previewId)}
        onOpenChange={(open) => !open && setPreviewId(null)}
        voucherId={previewId}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa chứng từ"
        message={`Bạn có chắc chắn muốn xóa và hủy ghi sổ chứng từ "${deleteTarget?.id}"? Việc này sẽ tính toán lại toàn bộ giá trị tồn kho và công nợ.`}
        destructive
        confirmLabel="Xóa"
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={Boolean(batchDeleteIds?.length)}
        onOpenChange={(open) => !open && setBatchDeleteIds(null)}
        title="Xóa hàng loạt"
        message={`Bạn có chắc chắn muốn xóa ${batchDeleteIds?.length ?? 0} chứng từ đã chọn?`}
        destructive
        confirmLabel="Xóa"
        onConfirm={() => void handleBatchDelete()}
      />
    </>
  );
}
