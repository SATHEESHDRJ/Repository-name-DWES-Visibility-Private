import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';

interface Props {
  children: React.ReactNode;
  allowedRole: UserRole;
}

export default function ProtectedRoute({ children, allowedRole }: Props) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== allowedRole) {
    return <Navigate to={ROLE_ROUTES[user.role as UserRole] ?? '/'} replace />;
  }
  return <>{children}</>;
}
