import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  const location = useLocation();
  const showSidebar = location.pathname.startsWith("/canvas") || location.pathname.startsWith("/admin");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <div className="mx-auto flex w-full max-w-[1400px] gap-4 px-4 py-4 lg:px-6">
        {showSidebar ? <Sidebar /> : null}
        <main className="min-h-[calc(100vh-120px)] flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
