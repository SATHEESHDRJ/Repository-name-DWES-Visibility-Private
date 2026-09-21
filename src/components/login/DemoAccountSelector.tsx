import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Users } from '../ui/icons';
import { useDemoMode } from '../../hooks/useDemoMode';
import { useAuthStore } from '../../store/useAuthStore';
import { ROLE_ROUTES, type UserRole } from '../../types';

interface DemoAccount {
  username: string;
  full_name: string;
  role: UserRole;
}

const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: 'System Admin',
  ops_director: 'Operations Director',
  prod_supervisor: 'Production Supervisor',
  qaqc_engineer: 'QA/QC Engineer',
  wiring_technician: 'Wiring Technician',
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export default function DemoAccountSelector() {
  const enabled = useDemoMode();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/auth/dev/demo-roles', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        setAccounts(await response.json() as DemoAccount[]);
      })
      .catch(fetchError => {
        if (fetchError?.name !== 'AbortError') setError('Demo accounts are not available on this server.');
      });
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!enabled) return null;

  const signIn = async (account: DemoAccount) => {
    if (busy) return;
    setBusy(account.username);
    setError('');
    try {
      const response = await fetch('/api/auth/dev/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      localStorage.setItem('dwes_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('dwes_refresh_token', data.refresh_token);
      else localStorage.removeItem('dwes_refresh_token');
      localStorage.setItem('dwes_user', JSON.stringify(data.user));
      localStorage.removeItem('dwes_bootstrap');
      useAuthStore.getState().hydrateFromStorage();
      navigate(ROLE_ROUTES[data.user.role as UserRole] ?? '/', { replace: true });
    } catch {
      setError('Demo sign-in failed. Confirm demo mode is enabled and the selected user is active.');
      setBusy('');
    }
  };

  return (
    <section className="login-section" aria-label="Demo account access">
      <div className="login-section-head">
        <span className="login-section-label">Demo accounts</span>
        <span className="login-dev-badge">Local demo only</span>
      </div>
      <div className="login-demo-popover-wrap" ref={rootRef}>
        <button
          type="button"
          className="login-demo-trigger"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={accounts.length === 0 || Boolean(busy)}
        >
          <span className="login-demo-trigger-text">{busy ? 'Opening dashboard…' : 'Choose a role dashboard'}</span>
          <span className="login-demo-trigger-current">{accounts.length || '—'} roles</span>
          <ChevronDown className={`login-demo-trigger-caret${open ? ' is-open' : ''}`} size={18} aria-hidden="true" />
        </button>

        {open && (
          <div className="login-demo-popover login-demo-panel" role="listbox" aria-label="Predefined demo accounts">
            <div className="login-demo-scroll login-demo-scroll--compact">
              <div className="login-demo-group-head">
                <span className="login-demo-group-icon"><Users size={14} aria-hidden="true" /></span>
                <span className="login-demo-group-label">Open dashboard as</span>
                <span className="login-demo-group-count">{accounts.length}</span>
              </div>
              {accounts.map(account => (
                <button
                  type="button"
                  role="option"
                  aria-selected={busy === account.username}
                  className="login-demo-card"
                  data-selected={busy === account.username || undefined}
                  data-role={account.role}
                  key={account.username}
                  onClick={() => void signIn(account)}
                  disabled={Boolean(busy)}
                >
                  <span className="login-demo-avatar" data-role={account.role}>{initials(account.full_name)}</span>
                  <span className="login-demo-info">
                    <span className="login-demo-name">{account.full_name}</span>
                    <span className="login-demo-username">@{account.username}</span>
                  </span>
                  <span className="login-demo-role-chip" data-role={account.role}>{ROLE_LABELS[account.role]}</span>
                  <span className="login-demo-check"><Check size={13} aria-hidden="true" /></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <div className="login-error mt-2" role="alert">{error}</div>}
    </section>
  );
}
