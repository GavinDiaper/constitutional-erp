import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { ActorProvider } from "./context/ActorContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminEntityExplorerRoute from "./routes/AdminEntityExplorerRoute";
import AdminEventExplorerRoute from "./routes/AdminEventExplorerRoute";
import AdminHarnessRoute from "./routes/AdminHarnessRoute";
import AdminHypermediaRoute from "./routes/AdminHypermediaRoute";
import AdminMcpCatalogRoute from "./routes/AdminMcpCatalogRoute";
import AdminNavSessionsRoute from "./routes/AdminNavSessionsRoute";
import AdminProcessGraphsRoute from "./routes/AdminProcessGraphsRoute";
import AdminRoute from "./routes/AdminRoute";
import CanvasRoute from "./routes/CanvasRoute";
import EntityRoute from "./routes/EntityRoute";
import HomeRoute from "./routes/HomeRoute";
import LoginRoute from "./routes/LoginRoute";
import NavigatorSessionsRoute from "./routes/NavigatorSessionsRoute";
import NotFoundRoute from "./routes/NotFoundRoute";

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
}

function AdminShell() {
  return (
    <AdminRoute>
      <Outlet />
    </AdminRoute>
  );
}

export default function App() {
  return (
    <ActorProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/canvas" element={<CanvasRoute />} />
            <Route path="/canvas/:entityType/:entityId" element={<EntityRoute />} />
            <Route path="/navigator-sessions" element={<NavigatorSessionsRoute />} />
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<AdminRoute />} />
              <Route path="entities" element={<AdminEntityExplorerRoute />} />
              <Route path="events" element={<AdminEventExplorerRoute />} />
              <Route path="process-graphs" element={<AdminProcessGraphsRoute />} />
              <Route path="hypermedia" element={<AdminHypermediaRoute />} />
              <Route path="mcp-catalog" element={<AdminMcpCatalogRoute />} />
              <Route path="nav-sessions" element={<AdminNavSessionsRoute />} />
              <Route path="test-harness" element={<AdminHarnessRoute />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </AuthProvider>
    </ActorProvider>
  );
}
