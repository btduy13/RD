import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface DateRangeFilterProps {
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangeFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  fromLabel = "Từ ngày",
  toLabel = "Đến ngày",
  className,
  disabled = false,
}: DateRangeFilterProps) {
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="space-y-1.5">
        <Label htmlFor="date-range-from">{fromLabel}</Label>
        <Input
          id="date-range-from"
          type="date"
          value={fromDate}
          disabled={disabled}
          onChange={(e) => onFromDateChange(e.target.value)}
          className="w-[160px]"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="date-range-to">{toLabel}</Label>
        <Input
          id="date-range-to"
          type="date"
          value={toDate}
          disabled={disabled}
          min={fromDate || undefined}
          onChange={(e) => onToDateChange(e.target.value)}
          className="w-[160px]"
        />
      </div>
    </div>
  );
}
