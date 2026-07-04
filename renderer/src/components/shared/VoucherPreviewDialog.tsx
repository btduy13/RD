import { useMemo, useState } from "react";
import { Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/shared/ToastProvider";
import {
  exportVoucherPdf,
  printVoucher,
  renderVoucherHtml,
  wrapVoucherHtmlDocument,
} from "@/core/voucher-print";
import { useAppStore } from "@/store/app-store";

export interface VoucherPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherId: string | null | undefined;
}

export function VoucherPreviewDialog({
  open,
  onOpenChange,
  voucherId,
}: VoucherPreviewDialogProps) {
  const state = useAppStore((s) => s.state);
  const { toast } = useToast();
  const [busy, setBusy] = useState<"print" | "pdf" | null>(null);

  const previewDoc = useMemo(() => {
    if (!voucherId) return "";
    const body = renderVoucherHtml(state, voucherId);
    return body ? wrapVoucherHtmlDocument(body) : "";
  }, [state, voucherId]);

  const handlePrint = async () => {
    if (!voucherId) return;
    setBusy("print");
    try {
      const result = await printVoucher(voucherId);
      if (result.ok) {
        toast("Đã mở hộp thoại in", "success");
      } else {
        toast(result.error || "Không thể in chứng từ", "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleExportPdf = async () => {
    if (!voucherId) return;
    setBusy("pdf");
    try {
      const result = await exportVoucherPdf(voucherId);
      if (result.ok) {
        toast(
          result.filePath ? `Đã lưu PDF tại: ${result.filePath}` : "Đã lưu PDF",
          "success"
        );
      } else if (result.error === "Hủy lưu PDF") {
        toast("Hủy lưu file PDF", "info");
      } else {
        toast(result.error || "Không thể xuất PDF", "error");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Xem Chứng từ Kế toán</DialogTitle>
        </DialogHeader>

        <div className="min-h-[420px] flex-1 overflow-hidden rounded-md border border-border bg-white">
          {previewDoc ? (
            <iframe
              title="Voucher preview"
              srcDoc={previewDoc}
              className="h-[min(62vh,720px)] w-full border-0 bg-white"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex h-[min(62vh,720px)] items-center justify-center p-6 text-sm text-muted-foreground">
              Không tìm thấy chứng từ hoặc loại chứng từ chưa được hỗ trợ in.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            variant="outline"
            disabled={!previewDoc || busy !== null}
            onClick={() => void handlePrint()}
          >
            <Printer className="h-4 w-4" />
            {busy === "print" ? "Đang in..." : "In"}
          </Button>
          <Button disabled={!previewDoc || busy !== null} onClick={() => void handleExportPdf()}>
            <FileDown className="h-4 w-4" />
            {busy === "pdf" ? "Đang xuất..." : "Xuất PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
