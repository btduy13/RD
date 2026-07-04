import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/app-state";

export interface ProductComboboxProps {
  products: Product[];
  value?: string;
  onChange: (productId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProductCombobox({
  products,
  value,
  onChange,
  placeholder = "Chọn sản phẩm...",
  disabled = false,
  className,
}: ProductComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.unit ?? "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [products, query]);

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
            placeholder="Tìm sản phẩm..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2"
          />
          <ul className="max-h-48 overflow-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">Không tìm thấy</li>
            ) : (
              filtered.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary",
                      value === product.id && "bg-secondary"
                    )}
                    onClick={() => {
                      onChange(product.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4 shrink-0", value === product.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">
                      {product.name}
                      {product.unit ? (
                        <span className="ml-1 text-muted-foreground">({product.unit})</span>
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
