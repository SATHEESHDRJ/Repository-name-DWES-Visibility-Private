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
import { AppDialogProvider } from './components/AppDialogProvider';
import { DeviceSimulator } from './components/ui/DeviceSimulator';

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
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DeviceSimulator>
        <AppDialogProvider>
          <AppRoutes />
        </AppDialogProvider>
      </DeviceSimulator>
    </BrowserRouter>
  );
}
