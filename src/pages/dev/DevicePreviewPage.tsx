import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icons';
import { ROLE_ROUTES } from '../../types';
import type { UserRole } from '../../types';

/**
 * DEV-ONLY Device Preview (route /__device-preview, excluded from production builds).
 *
 * Renders the real DWES app inside an iframe with an exact simulated viewport so
 * CSS media/container queries behave as they would on a physical tablet, while the
 * frame is visually scaled to fit the laptop screen. This is a development preview
 * tool only — the production app adapts to real devices automatically and never
 * needs a manual size selector.
 *
 * Role switching uses the DEMO_MODE-gated /auth/dev/demo-login endpoint: the
 * backend holds the demo credentials and runs the normal password login, so the
 * preview always carries a genuine RBAC token (no bypass, no frontend secrets).
 */

interface Preset { id: string; label: string; w: number; h: number }

const PRESETS: Preset[] = [
  { id: 'mini-p', label: 'Mini Tablet Portrait', w: 600, h: 960 },
  { id: 'mini-l', label: 'Mini Tablet Landscape', w: 960, h: 600 },
  { id: 'small-p', label: 'Small Tablet Portrait', w: 720, h: 1080 },
  { id: 'small-l', label: 'Small Tablet Landscape', w: 1080, h: 720 },
  { id: 'std-p', label: 'Standard Tablet Portrait', w: 768, h: 1024 },
  { id: 'std-l', label: 'Standard Tablet Landscape', w: 1024, h: 768 },
  { id: 'med-p', label: 'Medium Tablet Portrait', w: 800, h: 1280 },
  { id: 'med-l', label: 'Medium Tablet Landscape', w: 1280, h: 800 },
  { id: 'large-p', label: 'Large Tablet Portrait', w: 834, h: 1194 },
  { id: 'large-l', label: 'Large Tablet Landscape', w: 1194, h: 834 },
  { id: 'xl-p', label: 'Extra-Large Tablet Portrait', w: 900, h: 1440 },
  { id: 'xl-l', label: 'Extra-Large Tablet Landscape', w: 1440, h: 900 },
  { id: 'pro-p', label: 'Professional Tablet Portrait', w: 1024, h: 1366 },
  { id: 'pro-l', label: 'Professional Tablet Landscape', w: 1366, h: 1024 },
  { id: 'max-p', label: 'Maximum Tablet Portrait', w: 1100, h: 1600 },
  { id: 'max-l', label: 'Maximum Tablet Landscape', w: 1600, h: 1100 },
  { id: 'desktop', label: 'Desktop Preview', w: 1280, h: 900 },
];

interface DemoRole { username: string; full_name: string; role: UserRole }

const ROLE_LABELS: Record<string, string> = {
  prod_supervisor: 'Production Supervisor',
  wiring_technician: 'Technician',
  system_admin: 'System Administrator',
  qaqc_engineer: 'QA/QC',
  ops_director: 'Director',
};

const STORE_KEY = 'dwes-device-preview';

interface PreviewState { presetId: string; customW: number; customH: number; rotated: boolean }

function loadState(): PreviewState {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return { presetId: 'std-l', customW: 1024, customH: 768, rotated: false, ...JSON.parse(raw) };
  } catch { /* fresh */ }
  return { presetId: 'std-l', customW: 1024, customH: 768, rotated: false };
}

export default function DevicePreviewPage() {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<PreviewState>(loadState);
  const [roles, setRoles] = useState<DemoRole[]>([]);
  const [rolesError, setRolesError] = useState('');
  const [busyRole, setBusyRole] = useState(false);
  const [route, setRoute] = useState('/');
  const [activeUser, setActiveUser] = useState<{ full_name?: string; role?: string } | null>(null);
  const [stageSize, setStageSize] = useState({ w: 1200, h: 700 });

  useEffect(() => { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); }, [state]);

  // Demo roles (DEMO_MODE-gated; 404 means role switching is unavailable).
  useEffect(() => {
    fetch('/api/auth/dev/demo-roles')
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status));
        setRoles(await res.json());
      })
      .catch(() => setRolesError('Role switching unavailable — set DEMO_MODE=true in backend/.env and restart the backend.'));
  }, []);

  // Available stage space → visual scale factor.
  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (el) setStageSize({ w: el.clientWidth - 24, h: el.clientHeight - 24 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Poll the same-origin iframe for its current route + signed-in user.
  useEffect(() => {
    const read = () => {
      try {
        const pathname = iframeRef.current?.contentWindow?.location?.pathname;
        if (pathname) setRoute(pathname);
      } catch { /* cross-origin never happens (same origin) */ }
      try {
        const raw = localStorage.getItem('dwes_user');
        setActiveUser(raw ? JSON.parse(raw) : null);
      } catch { setActiveUser(null); }
    };
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const preset = PRESETS.find(p => p.id === state.presetId);
  const baseW = state.presetId === 'custom' ? state.customW : preset?.w ?? 1024;
  const baseH = state.presetId === 'custom' ? state.customH : preset?.h ?? 768;
  const w = Math.max(280, state.rotated ? baseH : baseW);
  const h = Math.max(280, state.rotated ? baseW : baseH);
  const scale = Math.min(1, stageSize.w / w, stageSize.h / h);
  const orientation = w >= h ? 'Landscape' : 'Portrait';

  const switchRole = useCallback(async (username: string) => {
    if (!username) return;
    setBusyRole(true);
    try {
      const res = await fetch('/api/auth/dev/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error(`demo-login ${res.status}`);
      const data = await res.json();
      // Same storage keys the real login flow writes — the iframe app picks them up.
      localStorage.setItem('dwes_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('dwes_refresh_token', data.refresh_token);
      localStorage.setItem('dwes_user', JSON.stringify(data.user));
      const target = ROLE_ROUTES[data.user.role as UserRole] || '/';
      if (iframeRef.current) iframeRef.current.src = target;
    } catch {
      setRolesError('Demo login failed — check the backend log.');
    } finally {
      setBusyRole(false);
    }
  }, []);

  const refresh = () => { try { iframeRef.current?.contentWindow?.location.reload(); } catch { /* noop */ } };
  const toLogin = () => { if (iframeRef.current) iframeRef.current.src = '/'; };
  const openFull = () => { window.open(route || '/', '_blank', 'noopener'); };

  const roleLabel = useMemo(() => {
    if (!activeUser) return 'Not signed in';
    const base = ROLE_LABELS[activeUser.role || ''] || activeUser.role || '';
    return activeUser.full_name ? `${activeUser.full_name} · ${base}` : base;
  }, [activeUser]);

  const chip = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-200';
  const ctrl = 'h-9 rounded-lg border border-slate-600 bg-slate-800 px-2.5 text-[12px] font-medium text-slate-100 outline-none focus:border-blue-400';
  const btn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 text-[12px] font-semibold text-slate-100 transition-colors hover:border-blue-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex h-dvh w-full flex-col bg-slate-950 text-slate-100">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold tracking-wide text-blue-300">
          <Icon name="devices" size={18} />
          Device Preview
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300">dev only</span>
        </span>

        <select
          className={ctrl}
          value={roles.some(r => r.username === activeUser?.['username' as never]) ? (activeUser as any)?.username : ''}
          onChange={e => void switchRole(e.target.value)}
          disabled={busyRole || roles.length === 0}
          aria-label="Preview role"
          title={rolesError || 'Sign in as a demo role (real RBAC login)'}
        >
          <option value="">{busyRole ? 'Signing in…' : 'Switch role…'}</option>
          {roles.map(r => (
            <option key={r.username} value={r.username}>
              {r.full_name} — {ROLE_LABELS[r.role] || r.role}
            </option>
          ))}
        </select>

        <select
          className={ctrl}
          value={state.presetId}
          onChange={e => setState(s => ({ ...s, presetId: e.target.value, rotated: false }))}
          aria-label="Viewport preset"
        >
          {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} ({p.w}×{p.h})</option>)}
          <option value="custom">Custom size…</option>
        </select>

        {state.presetId === 'custom' && (
          <span className="inline-flex items-center gap-1">
            <input
              type="number" min={280} max={4000} value={state.customW}
              onChange={e => setState(s => ({ ...s, customW: Number(e.target.value) || s.customW }))}
              className={`${ctrl} w-20`} aria-label="Custom width"
            />
            <span className="text-slate-500">×</span>
            <input
              type="number" min={280} max={4000} value={state.customH}
              onChange={e => setState(s => ({ ...s, customH: Number(e.target.value) || s.customH }))}
              className={`${ctrl} w-20`} aria-label="Custom height"
            />
          </span>
        )}

        <button type="button" className={btn} onClick={() => setState(s => ({ ...s, rotated: !s.rotated }))} title="Switch orientation">
          <Icon name="screen_rotation" size={16} /> Rotate
        </button>
        <button type="button" className={btn} onClick={refresh} title="Reload the preview frame">
          <Icon name="refresh" size={16} /> Refresh
        </button>
        <button type="button" className={btn} onClick={toLogin} title="Show the Login page inside the preview">
          <Icon name="login" size={16} /> Login page
        </button>
        <button type="button" className={btn} onClick={openFull} title="Open the current route in a full browser tab">
          <Icon name="open_in_new" size={16} /> Open full
        </button>
        <button type="button" className={btn} onClick={() => navigate(route || '/')} title="Leave the preview — normal laptop view">
          <Icon name="close_fullscreen" size={16} /> Exit preview
        </button>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className={chip} title="Signed-in preview role"><Icon name="person" size={13} />{roleLabel}</span>
          <span className={chip} title="Simulated viewport"><Icon name="aspect_ratio" size={13} />{w} × {h} · {orientation}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span>
          <span className={chip} title="Current app route"><Icon name="route" size={13} />{route}</span>
        </span>
      </div>

      {rolesError && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-200">
          {rolesError}
        </div>
      )}

      {/* ── Stage: centered, visually scaled, true internal viewport ── */}
      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        <div
          className="overflow-hidden rounded-2xl border-4 border-slate-700 bg-white shadow-2xl"
          style={{ width: w * scale, height: h * scale }}
        >
          <iframe
            ref={iframeRef}
            src="/"
            title="DWES device preview"
            style={{
              width: w,
              height: h,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: '0',
            }}
          />
        </div>
      </div>
    </div>
  );
}
