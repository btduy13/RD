import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { VoucherPreviewDialog } from "@/components/shared/VoucherPreviewDialog";
import { formatDisplayDate, formatVND } from "@/lib/formatters";
import { useAppStore } from "@/store/app-store";
import { buildPartnerLedger, getDebtTypeLabel, type PartnerDebtSummary } from "./debts-service";

export interface PartnerLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: PartnerDebtSummary | null;
}

export function PartnerLedgerDialog({ open, onOpenChange, debt }: PartnerLedgerDialogProps) {
  const state = useAppStore((s) => s.state);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [previewVoucherId, setPreviewVoucherId] = useState<string | null>(null);

  const ledger = useMemo(() => {
    if (!debt || debt.id.startsWith("__UNMATCHED")) {
      return {
        partner: undefined,
        debtRole: "customer" as const,
        openingText: "—",
        closingText: "—",
        openingVal: 0,
        closingVal: 0,
        rows: [],
        debitSum: 0,
        creditSum: 0,
      };
    }
    return buildPartnerLedger(state, debt.id, fromDate, toDate);
  }, [state, debt, fromDate, toDate]);

  if (!debt) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Sổ công nợ: {debt.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {debt.id} · {getDebtTypeLabel(debt.type)}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <DateRangeFilter
              fromDate={fromDate}
              toDate={toDate}
              onFromDateChange={setFromDate}
              onToDateChange={setToDate}
            />

            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Dư đầu kỳ</p>
                <p className="text-lg font-bold tabular-nums">{ledger.openingText}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Dư cuối kỳ</p>
                <p className="text-lg font-bold tabular-nums">{ledger.closingText}</p>
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Số CT</TableHead>
                    <TableHead>Diễn giải</TableHead>
                    <TableHead className="text-center">TK đối ứng</TableHead>
                    <TableHead className="text-right">Nợ</TableHead>
                    <TableHead className="text-right">Có</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Không có giao dịch công nợ trong kỳ
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger.rows.map((row) => (
                      <TableRow key={`${row.voucherId}-${row.date}`}>
                        <TableCell>{formatDisplayDate(row.date)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-bold text-primary"
                            onClick={() => setPreviewVoucherId(row.voucherId)}
                          >
                            {row.displayId}
                          </Button>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate" title={row.description}>
                          {row.description || "—"}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {row.offsetAccount || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.debit > 0 ? formatVND(row.debit) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.credit > 0 ? formatVND(row.credit) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VoucherPreviewDialog
        open={Boolean(previewVoucherId)}
        onOpenChange={(o) => !o && setPreviewVoucherId(null)}
        voucherId={previewVoucherId}
      />
    </>
  );
}
