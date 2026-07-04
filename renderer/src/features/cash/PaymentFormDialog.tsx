import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PartnerCombobox } from "@/components/shared/PartnerCombobox";
import { useToast } from "@/components/shared/ToastProvider";
import { getLocalDateString, parseVND } from "@/lib/formatters";
import { useAppStore } from "@/store/app-store";
import type { Voucher } from "@/types/app-state";
import {
  buildPaymentVoucher,
  generateNextPaymentVoucherId,
} from "./cash-service";

export interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher?: Voucher | null;
  prefill?: { partnerId?: string; amount?: number; description?: string };
}

export function PaymentFormDialog({ open, onOpenChange, voucher, prefill }: PaymentFormDialogProps) {
  const state = useAppStore((s) => s.state);
  const upsertVoucher = useAppStore((s) => s.upsertVoucher);
  const { toast } = useToast();

  const isEdit = Boolean(voucher);
  const [date, setDate] = useState(getLocalDateString());
  const [partnerId, setPartnerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("111");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    if (voucher) {
      setDate(voucher.date || getLocalDateString());
      setPartnerId(voucher.partnerId ?? "");
      setPaymentMethod(voucher.paymentMethod ?? voucher.entries?.[0]?.credit ?? "111");
      setAmount(String(voucher.amount ?? 0));
      setDescription(voucher.description ?? "");
    } else {
      setDate(getLocalDateString());
      setPartnerId(prefill?.partnerId ?? "");
      setPaymentMethod("111");
      setAmount(prefill?.amount ? String(prefill.amount) : "");
      setDescription(prefill?.description ?? "");
    }
  }, [open, voucher, prefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseVND(amount);
    if (parsedAmount <= 0) {
      toast("Số tiền phải lớn hơn 0!", "error");
      return;
    }

    const partner = state.partners.find((p) => p.id === partnerId);
    const id = voucher?.id ?? generateNextPaymentVoucherId(state.vouchers ?? []);
    const payload = buildPaymentVoucher({
      id,
      date,
      partnerId: partner?.id ?? partnerId,
      partnerName: partner?.name ?? "",
      amount: parsedAmount,
      paymentMethod,
      description: description.trim(),
    });

    await upsertVoucher(payload);
    toast(isEdit ? "Cập nhật phiếu chi thành công!" : "Lập phiếu chi thành công!", "success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Chỉnh sửa phiếu chi: ${voucher?.id}` : "Lập phiếu chi tiền"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Ngày chứng từ</Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Đối tác</Label>
            <PartnerCombobox
              partners={state.partners}
              value={partnerId}
              onChange={setPartnerId}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-method">Phương thức chi (TK Có)</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="111">Tiền mặt (111)</SelectItem>
                <SelectItem value="112">Ngân hàng (112)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Số tiền</Label>
            <Input
              id="payment-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-desc">Diễn giải</Label>
            <Textarea
              id="payment-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">{isEdit ? "Cập nhật" : "Ghi sổ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
