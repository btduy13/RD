import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Partner } from "@/types/app-state";

export interface PartnerComboboxProps {
  partners: Partner[];
  value?: string;
  onChange: (partnerId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PartnerCombobox({
  partners,
  value,
  onChange,
  placeholder = "Chọn đối tác...",
  disabled = false,
  className,
}: PartnerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = partners.find((p) => p.id === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners.slice(0, 50);
    return partners
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.type ?? "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [partners, query]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="w-full justify-between font-normal"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{selected?.name ?? placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card p-2 shadow-md">
          <Input
            autoFocus
            placeholder="Tìm đối tác..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2"
          />
          <ul className="max-h-48 overflow-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">Không tìm thấy</li>
            ) : (
              filtered.map((partner) => (
                <li key={partner.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary",
                      value === partner.id && "bg-secondary"
                    )}
                    onClick={() => {
                      onChange(partner.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4 shrink-0", value === partner.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">
                      {partner.name}
                      {partner.type ? (
                        <span className="ml-1 text-muted-foreground">({partner.type})</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
