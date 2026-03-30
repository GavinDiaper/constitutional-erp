import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import AdminDashboard from "../components/admin/AdminDashboard";
import { useActor } from "../context/ActorContext";

export default function AdminRoute({ children }: { children?: ReactNode }) {
  const { isAdmin } = useActor();
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children ?? <AdminDashboard />}</>;
}
