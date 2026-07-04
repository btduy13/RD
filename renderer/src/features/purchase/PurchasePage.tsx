import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_PATHS = {
  invoices: "/purchase",
  orders: "/purchase/orders",
  returns: "/purchase/returns",
} as const;

type PurchaseTab = keyof typeof TAB_PATHS;

function resolveTab(pathname: string): PurchaseTab {
  if (pathname.includes("/orders")) return "orders";
  if (pathname.includes("/returns")) return "returns";
  return "invoices";
}

export function PurchasePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveTab(location.pathname);

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => navigate(TAB_PATHS[value as PurchaseTab])}
      >
        <TabsList>
          <TabsTrigger value="invoices">Hóa đơn mua</TabsTrigger>
          <TabsTrigger value="orders">Đơn đặt hàng</TabsTrigger>
          <TabsTrigger value="returns">Trả lại mua</TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
