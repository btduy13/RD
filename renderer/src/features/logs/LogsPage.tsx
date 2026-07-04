import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/ToastProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAppStore } from "@/store/app-store";
import type { ActionLog, User } from "@/types/app-state";

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  accountant: "Kế toán",
  viewer: "Người xem",
};

function formatLogTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function LogsPage() {
  const state = useAppStore((s) => s.state);
  const upsertUser = useAppStore((s) => s.upsertUser);
  const deleteUser = useAppStore((s) => s.deleteUser);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("accountant");

  const logs = useMemo(
    () => [...(state.actionLogs ?? [])] as ActionLog[],
    [state.actionLogs]
  );

  const users = useMemo(() => state.users ?? [], [state.users]);

  const logColumns = useMemo<ColumnDef<ActionLog>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: "Thời gian",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatLogTime(row.original.timestamp)}</span>
        ),
      },
      { accessorKey: "username", header: "Tài khoản" },
      { accessorKey: "name", header: "Họ tên" },
      {
        accessorKey: "action",
        header: "Hành động",
        cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
      },
      { accessorKey: "description", header: "Mô tả" },
    ],
    []
  );

  const openAddUser = () => {
    setEditingUser(null);
    setUsername("");
    setName("");
    setPassword("");
    setRole("accountant");
    setUserFormOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setUsername(u.username);
    setName(u.name);
    setPassword(u.password ?? "");
    setRole(u.role);
    setUserFormOpen(true);
  };

  const handleSaveUser = async () => {
    const trimmedUsername = username.trim();
    const trimmedName = name.trim();
    if (!trimmedUsername || !trimmedName) {
      toast("Vui lòng nhập tên đăng nhập và họ tên.", "error");
      return;
    }

    if (!editingUser && !password.trim()) {
      toast("Vui lòng nhập mật khẩu cho tài khoản mới.", "error");
      return;
    }

    const exists = users.some(
      (u) =>
        u.username.toLowerCase() === trimmedUsername.toLowerCase() &&
        u.username !== editingUser?.username
    );
    if (exists) {
      toast("Tên đăng nhập đã tồn tại.", "error");
      return;
    }

    const payload: User = {
      username: trimmedUsername,
      name: trimmedName,
      role,
      password: password.trim() || editingUser?.password || "",
    };

    const err = await upsertUser(payload, editingUser ? "edit" : "add");
    if (err) {
      toast(err, "error");
      return;
    }

    toast(
      editingUser ? "Đã cập nhật tài khoản." : "Đã thêm tài khoản mới.",
      "success"
    );
    setUserFormOpen(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    const err = await deleteUser(deleteTarget.username);
    if (err) {
      toast(err, "error");
      setDeleteTarget(null);
      return;
    }
    toast("Đã xóa tài khoản.", "success");
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nhật ký hoạt động</CardTitle>
          <CardDescription>Lịch sử thao tác quan trọng trên hệ thống</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={logColumns}
            data={logs}
            filterColumn="description"
            filterPlaceholder="Lọc theo mô tả, tài khoản..."
            pageSize={20}
            virtualScroll
            emptyMessage="Chưa có hoạt động nào được ghi nhận"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Quản lý người dùng</CardTitle>
            <CardDescription>Thêm, sửa, xóa tài khoản nhân viên</CardDescription>
          </div>
          <Button onClick={openAddUser}>
            <Plus className="h-4 w-4" />
            Thêm người dùng
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold">Họ tên</th>
                  <th className="px-4 py-3 text-left font-semibold">Tài khoản</th>
                  <th className="px-4 py-3 text-left font-semibold">Vai trò</th>
                  <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Không có người dùng
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isSelf = currentUser?.username === u.username;
                    const isAdmin = u.username.toLowerCase() === "admin";
                    return (
                      <tr key={u.username} className="border-b border-border/60">
                        <td className="px-4 py-3 font-semibold">{u.name}</td>
                        <td className="px-4 py-3">
                          <code>{u.username}</code>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              u.role === "admin"
                                ? "destructive"
                                : u.role === "accountant"
                                  ? "success"
                                  : "secondary"
                            }
                          >
                            {ROLE_LABELS[u.role] ?? u.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => openEditUser(u)}>
                              <Pencil className="h-3.5 w-3.5" />
                              Sửa
                            </Button>
                            {!isSelf && !isAdmin && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={userFormOpen} onOpenChange={setUserFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? `Chỉnh sửa: ${editingUser.name}` : "Thêm người dùng mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-username">Tên đăng nhập</Label>
              <Input
                id="user-username"
                value={username}
                disabled={Boolean(editingUser)}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Họ tên</Label>
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Mật khẩu</Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                placeholder={editingUser ? "Để trống nếu không đổi" : ""}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vai trò</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as User["role"])}
                disabled={editingUser?.username.toLowerCase() === "admin"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Quản trị viên</SelectItem>
                  <SelectItem value="accountant">Kế toán</SelectItem>
                  <SelectItem value="viewer">Người xem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserFormOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => void handleSaveUser()}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa tài khoản"
        message={`Bạn có chắc muốn xóa tài khoản "${deleteTarget?.username}"?`}
        destructive
        confirmLabel="Xóa"
        onConfirm={() => void handleDeleteUser()}
      />
    </div>
  );
}
