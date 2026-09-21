import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { FullPageCenter } from '../components/layout/FullPageCenter';
import { Button } from '../components/ui/Button';

export default function InstallAccessDeniedPage() {
  const authHydrated = useAuthStore(s => s.authHydrated);
  const navigate = useNavigate();

  useEffect(() => {
    if (authHydrated) {
      const isLoggedIn = useAuthStore.getState().isLoggedIn;
      if (!isLoggedIn) {
        navigate('/login', { replace: true, state: { from: window.location.pathname } });
      }
    }
  }, [authHydrated, navigate]);

  if (!authHydrated) {
    return null;
  }

  return (
    <FullPageCenter>
      <div className="flex flex-col items-center justify-center space-y-4">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-gray-500">You do not have permission to access this installation link.</p>
        <Button onClick={() => navigate('/login')}>Go to Login</Button>
      </div>
    </FullPageCenter>
  );
}