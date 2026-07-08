import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DirectorDashboard from './pages/director/DirectorDashboard';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard';
import TechnicianDashboard from './pages/technician/TechnicianDashboard';
import QAQCDashboard from './pages/qaqc/QAQCDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagementPage from './pages/admin/UserManagementPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import { AppDialogProvider } from './components/AppDialogProvider';
import { DeviceSimulator } from './components/ui/DeviceSimulator';
import ThemeProvider from './components/layout/ThemeProvider';
import DataTableShowcase from './pages/dev/DataTableShowcase';

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
        <Route index element={<Navigate to="/admin/users" replace />} />
        <Route path="users" element={<UserManagementPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      {/* DEV-only component showcase (excluded from production builds) */}
      {import.meta.env.DEV && (
        <Route path="/ui-showcase" element={<DataTableShowcase />} />
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
          </AppDialogProvider>
        </ThemeProvider>
      </DeviceSimulator>
    </BrowserRouter>
  );
}
