import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Download,
  FileSpreadsheet,
  FolderOpen,
  Upload,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/shared/ToastProvider";
import { useAppStore } from "@/store/app-store";

type PreviewRow = Record<string, string | number>;

function parseWorkbookToPreview(buffer: ArrayBuffer, maxRows = 50): PreviewRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];

  const headerRow = rows[0].map((c) => String(c || "").trim() || "Cột");
  const preview: PreviewRow[] = [];

  for (let i = 1; i < Math.min(rows.length, maxRows + 1); i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const item: PreviewRow = {};
    headerRow.forEach((h, idx) => {
      item[h || `col_${idx}`] = row[idx] ?? "";
    });
    preview.push(item);
  }
  return preview;
}

function parseCsvToPreview(text: string, maxRows = 50): PreviewRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim() || "Cột");
  const preview: PreviewRow[] = [];

  for (let i = 1; i < Math.min(lines.length, maxRows + 1); i++) {
    const cells = lines[i].split(",");
    const item: PreviewRow = {};
    headers.forEach((h, idx) => {
      item[h] = cells[idx]?.trim() ?? "";
    });
    preview.push(item);
  }
  return preview;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExcelHubPage() {
  const state = useAppStore((s) => s.state);
  const exportState = useAppStore((s) => s.exportState);
  const importState = useAppStore((s) => s.importState);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewName, setPreviewName] = useState("");
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!window.electronAPI?.listTemplateFiles) return;
    const result = await window.electronAPI.listTemplateFiles();
    if (result?.ok && result.files) {
      setTemplates(result.files);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const showPreview = (name: string, rows: PreviewRow[]) => {
    setPreviewName(name);
    setPreviewRows(rows);
    setPreviewColumns(rows.length > 0 ? Object.keys(rows[0]) : []);
  };

  const handleFileImport = async (file: File | undefined) => {
    if (!file) return;

    try {
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && "products" in parsed && "vouchers" in parsed) {
          const ok = await importState(text);
          toast(
            ok ? "Nhập dữ liệu JSON thành công!" : "Cấu trúc JSON không tương thích.",
            ok ? "success" : "error"
          );
        } else {
          showPreview(file.name, [
            { message: "JSON hợp lệ — xem cấu trúc bên dưới", keys: Object.keys(parsed as object).join(", ") },
          ]);
        }
        return;
      }

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const rows = parseWorkbookToPreview(buffer);
        showPreview(file.name, rows);
        toast(`Đã đọc ${rows.length} dòng xem trước từ Excel`, "success");
        return;
      }

      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCsvToPreview(text);
        showPreview(file.name, rows);
        toast(`Đã đọc ${rows.length} dòng xem trước từ CSV`, "success");
        return;
      }

      toast("Định dạng file chưa được hỗ trợ. Dùng .xlsx, .csv hoặc .json", "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Không thể đọc file", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReadBundledExcel = async (filename: string) => {
    if (!window.electronAPI?.readExcelFile) {
      toast("Chỉ khả dụng trong ứng dụng Desktop", "error");
      return;
    }

    setLoadingTemplate(filename);
    try {
      const result = (await window.electronAPI.readExcelFile(filename)) as {
        ok?: boolean;
        data?: number[];
        error?: string;
      };
      if (!result?.ok || !result.data) {
        toast(result?.error || "Không đọc được file Excel", "error");
        return;
      }
      const buffer = new Uint8Array(result.data).buffer;
      const rows = parseWorkbookToPreview(buffer);
      showPreview(filename, rows);
      toast(`Đã tải ${rows.length} dòng từ ${filename}`, "success");
    } finally {
      setLoadingTemplate(null);
    }
  };

  const handleExportSubset = (kind: "vouchers" | "partners" | "products" | "full") => {
    const date = new Date().toISOString().slice(0, 10);
    if (kind === "full") {
      downloadJson(`RD_Accounting_Backup_${date}.json`, JSON.parse(exportState()));
      toast("Đã xuất toàn bộ dữ liệu JSON", "success");
      return;
    }
    const subset = {
      vouchers: state.vouchers ?? [],
      partners: state.partners ?? [],
      products: state.products ?? [],
    };
    downloadJson(`RD_${kind}_${date}.json`, { [kind]: subset[kind] });
    toast(`Đã xuất ${kind}`, "success");
  };

  const openLegacyExcel = () => {
    void window.electronAPI?.openLegacyUi?.("excel-hub");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Nhập dữ liệu
            </CardTitle>
            <CardDescription>
              Chọn file Excel (.xlsx), CSV hoặc JSON để xem trước. JSON đầy đủ có thể nhập trực tiếp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
              onChange={(e) => void handleFileImport(e.target.files?.[0])}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <FolderOpen className="h-4 w-4" />
              Chọn file
            </Button>
            <p className="text-xs text-muted-foreground">
              Thư viện xlsx có sẵn trong dự án — hỗ trợ đọc Excel qua electronAPI cho file tích hợp sẵn.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Xuất dữ liệu
            </CardTitle>
            <CardDescription>
              Tải JSON chứng từ, đối tác, sản phẩm hoặc toàn bộ state.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleExportSubset("vouchers")}>
              Chứng từ
            </Button>
            <Button variant="outline" onClick={() => handleExportSubset("partners")}>
              Đối tác
            </Button>
            <Button variant="outline" onClick={() => handleExportSubset("products")}>
              Sản phẩm
            </Button>
            <Button onClick={() => handleExportSubset("full")}>
              Toàn bộ JSON
            </Button>
            <Button variant="secondary" onClick={openLegacyExcel}>
              <ExternalLink className="h-4 w-4" />
              Excel nâng cao (legacy)
            </Button>
          </CardContent>
        </Card>
      </div>

      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Phiếu mẫu Excel
            </CardTitle>
            <CardDescription>File mẫu trong thư mục excel/phieu mau</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {templates.map((file) => (
              <Button
                key={file}
                variant="outline"
                size="sm"
                disabled={loadingTemplate === file}
                onClick={() => void handleReadBundledExcel(file)}
              >
                {loadingTemplate === file ? "Đang đọc..." : file}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {previewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Xem trước: {previewName}</CardTitle>
            <CardDescription>
              {previewRows.length} dòng · {previewColumns.length} cột
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewColumns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {previewColumns.map((col) => (
                        <TableCell key={col} className="max-w-[200px] truncate">
                          {String(row[col] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Badge variant="secondary" className="mt-3">
              Xem trước — nhập Excel đầy đủ dùng giao diện legacy hoặc JSON
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
