import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_PATHS = {
  invoices: "/sales",
  returns: "/sales/returns",
  quotations: "/sales/quotations",
} as const;

type SalesTab = keyof typeof TAB_PATHS;

function resolveTab(pathname: string): SalesTab {
  if (pathname.includes("/returns")) return "returns";
  if (pathname.includes("/quotations")) return "quotations";
  return "invoices";
}

export function SalesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveTab(location.pathname);

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => navigate(TAB_PATHS[value as SalesTab])}
      >
        <TabsList>
          <TabsTrigger value="invoices">Hóa đơn bán</TabsTrigger>
          <TabsTrigger value="returns">Trả lại bán</TabsTrigger>
          <TabsTrigger value="quotations">Báo giá</TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
