import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DirectorDashboard from './pages/director/DirectorDashboard';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard';
import TechnicianDashboard from './pages/technician/TechnicianDashboard';
import QAQCDashboard from './pages/qaqc/QAQCDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import { AppDialogProvider } from './components/AppDialogProvider';
import { DeviceSimulator } from './components/ui/DeviceSimulator';
import ThemeProvider from './components/layout/ThemeProvider';
import DataTableShowcase from './pages/dev/DataTableShowcase';

// DEV-only Device Preview — lazy chunks that production builds never reference.
const DevicePreviewPage = import.meta.env.DEV
  ? lazy(() => import('./pages/dev/DevicePreviewPage'))
  : null;
const DevPreviewLauncher = import.meta.env.DEV
  ? lazy(() => import('./components/dev/DevPreviewLauncher'))
  : null;

function AppRoutes() {
  const { hydrateFromStorage } = useAuthStore();

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route path="/director" element={
        <ProtectedRoute allowedRole="ops_director">
          <DirectorDashboard />
        </ProtectedRoute>
      } />

      <Route path="/supervisor" element={
        <ProtectedRoute allowedRole="prod_supervisor">
          <SupervisorDashboard />
        </ProtectedRoute>
      } />

      <Route path="/technician" element={
        <ProtectedRoute allowedRole="wiring_technician">
          <TechnicianDashboard />
        </ProtectedRoute>
      } />

      <Route path="/qaqc" element={
        <ProtectedRoute allowedRole="qaqc_engineer">
          <QAQCDashboard />
        </ProtectedRoute>
      } />

      <Route path="/admin" element={
        <ProtectedRoute allowedRole="system_admin">
          <AdminDashboard />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/admin/settings" replace />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        {/* User management moved into Settings — authorized bookmark redirect.
            Nested inside the system_admin ProtectedRoute (not the catch-all),
            so admins land on Settings while other roles stay RBAC-blocked. */}
        <Route path="users" element={<Navigate to="/admin/settings" replace />} />
      </Route>

      {/* DEV-only component showcase (excluded from production builds) */}
      {import.meta.env.DEV && (
        <Route path="/ui-showcase" element={<DataTableShowcase />} />
      )}

      {/* DEV-only Device Preview — tablet viewport testing on a laptop.
          The production app adapts to real devices automatically; this manual
          selector exists only in local development builds. */}
      {import.meta.env.DEV && DevicePreviewPage && (
        <Route
          path="/__device-preview"
          element={(
            <Suspense fallback={null}>
              <DevicePreviewPage />
            </Suspense>
          )}
        />
      )}

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DeviceSimulator>
        <ThemeProvider>
          <AppDialogProvider>
            <AppRoutes />
            {/* DEV-only floating Device Preview launcher (Login page + after login) */}
            {import.meta.env.DEV && DevPreviewLauncher && (
              <Suspense fallback={null}>
                <DevPreviewLauncher />
              </Suspense>
            )}
          </AppDialogProvider>
        </ThemeProvider>
      </DeviceSimulator>
    </BrowserRouter>
  );
}
