import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, Check, ClipboardCheck, ClipboardList,
  ChevronDown, Eye, EyeOff, Fingerprint, Lock, ShieldCheck, Star, User, UserCog, Wrench, Zap,
} from '../components/ui/icons';
import type { ComponentType } from 'react';
import type { IconProps } from '../components/ui/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';
import {
  DEMO_CREDENTIALS, SHOW_DEMO_CREDENTIALS,
  fetchDemoUsers, seedPasswordFor,
  type DemoUser, type DemoCredential,
} from '../data/demoCredentials';
import EnrollBiometricModal from '../components/biometric/EnrollBiometricModal';
import InstallAppButton from '../components/InstallAppButton';
import {
  BIOMETRIC_DISMISSED_KEY,
  useBiometricAvailable,
  useBiometricLogin,
  useEnrollBiometric,
} from '../hooks/useBiometric';

const FEATURES = [
  { Icon: Zap,           text: 'Real-time wiring progress tracking' },
  { Icon: ClipboardList, text: 'Digital schedules replace paper' },
  { Icon: ShieldCheck,   text: 'QA / QC verification & reports' },
];

/* ── Android-style live clock ── */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [hh, mm, ss] = now
    .toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .split(':');
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  const colon = <span className="login-clock-colon">:</span>;

  return (
    <div className="login-clock-widget select-none" role="timer" aria-label={`Current time ${hh}:${mm}`}>
      <span className="login-clock-live" aria-hidden="true">
        <span className="login-clock-dot" />
        Live
      </span>
      <div className="login-clock-time tabular-nums">
        {hh}{colon}{mm}{colon}{ss}
      </div>
      <div className="login-clock-date">{dateStr}</div>
    </div>
  );
}

/* ── Main component ── */
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, user } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Biometric
  const { available: bioAvailable, isEnrolled: bioEnrolled } = useBiometricAvailable();
  const { loginWithBiometric, loading: bioLoading, error: bioError, clearError: clearBioError } = useBiometricLogin();
  const { enroll, enrolling, error: enrollError } = useEnrollBiometric();
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [, setDemoIdx] = useState(0);
  const [demoUsers, setDemoUsers] = useState<DemoUser[] | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const demoPopoverRef = useRef<HTMLDivElement>(null);
  const pendingUserIdRef = useRef<number | null>(null);

  // DEV/testing only: fill username + password from the 5-slot legacy list
  const fillDemo = (idx: number) => {
    const c = DEMO_CREDENTIALS[idx];
    if (!c) return;
    setDemoIdx(idx);
    setUsername(c.username);
    setPassword(c.password);
    clearError();
    clearBioError();
  };

  // DEV/testing only: fill from the full API-fetched user list
  const fillDemoUser = (username: string) => {
    if (!username) return;
    const pw = seedPasswordFor(username) ?? username; // seed pattern: password === username
    setUsername(username);
    setPassword(pw);
    clearError();
    clearBioError();
  };

  /* Redirect if already authenticated */
  useEffect(() => {
    if (user) navigate(ROLE_ROUTES[user.role as UserRole] ?? '/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    usernameRef.current?.focus();
    authApi.health().catch(() => {});
    if (SHOW_DEMO_CREDENTIALS) {
      // Try to fetch full demo user list from backend (DEMO_MODE=true required)
      fetchDemoUsers().then(users => {
        if (users && users.length > 0) {
          setDemoUsers(users);
          // Pre-fill with the first account (system_admin)
          fillDemoUser(users[0].username);
        } else if (DEMO_CREDENTIALS.length > 0) {
          // Fallback: use the 5-slot legacy list
          const c = DEMO_CREDENTIALS[0];
          setUsername(c.username);
          setPassword(c.password);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateToDashboard = useCallback(() => {
    const next = useAuthStore.getState().user;
    if (next) navigate(ROLE_ROUTES[next.role as UserRole] ?? '/', { replace: true });
  }, [navigate]);

  const doLogin = async (u: string, p: string) => {
    clearError();
    try {
      await login(u.trim(), p.trim());
      const next = useAuthStore.getState().user;
      if (!next) return;

      // Offer fingerprint enrolment if supported, not yet enrolled, not dismissed
      const dismissedKey    = `${BIOMETRIC_DISMISSED_KEY}-${next.id}`;
      const alreadyDismissed = localStorage.getItem(dismissedKey) === 'true';

      if (bioAvailable && !bioEnrolled && !alreadyDismissed) {
        pendingUserIdRef.current = next.id;
        setShowEnrollModal(true);
      } else {
        navigate(ROLE_ROUTES[next.role as UserRole] ?? '/', { replace: true });
      }
    } catch { /* error surfaced through store */ }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password.trim()) return;
    doLogin(username, password);
  };

  const handleEnroll = async (deviceLabel?: string) => {
    const ok = await enroll(deviceLabel);
    if (ok) {
      setShowEnrollModal(false);
      navigateToDashboard();
    }
    return ok;
  };

  const handleSkipEnroll = () => {
    if (pendingUserIdRef.current !== null)
      localStorage.setItem(`${BIOMETRIC_DISMISSED_KEY}-${pendingUserIdRef.current}`, 'true');
    setShowEnrollModal(false);
    navigateToDashboard();
  };

  useEffect(() => {
    if (!demoOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = demoPopoverRef.current;
      if (!node) return;
      if (!node.contains(event.target as Node)) setDemoOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDemoOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [demoOpen]);

  return (
    <>
      <div className="login-page-root font-sans overflow-x-hidden" data-ui-polish="saas">

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL — Brand / visual
            ══════════════════════════════════════════════════════ */}
        <aside className="login-panel-left lg:shrink-0" aria-label="Product overview">

          {/* Animated liquid mesh + flowing blobs (blue palette only) */}
          <div className="login-aurora" aria-hidden="true" />
          <div className="login-blob login-blob--morph w-[340px] h-[340px] bg-blue-500 opacity-[0.16] blur-[80px] top-[-70px] right-[-50px]" />
          <div className="login-blob login-blob--morph w-[260px] h-[260px] bg-cyan-400 opacity-[0.11] blur-[70px] bottom-[10px] left-[-50px] [animation-delay:3.5s] [animation-direction:reverse]" />
          <div className="login-blob login-blob--morph w-[220px] h-[220px] bg-sky-400 opacity-[0.10] blur-[60px] top-[42%] left-[34%] [animation-delay:6s]" />

          <div className="login-panel-left-inner">
            <span className="login-hero-badge">Enterprise Wiring Platform</span>

            <div className="login-brand-lockup">
              <div className="login-logo-wrap">
                <img
                  src="/logo-full.png"
                  alt="Ingenious Network FZC"
                />
              </div>
              <span className="leading-none min-w-0">
                <span className="login-brand-name">INGENIOUS NETWORK FZC</span>
              </span>
            </div>

            <div>
              <h2 className="login-brand-title">Digital Wiring Execution System</h2>
              <p className="login-brand-tagline">Paperless. Precise. Real-Time.</p>
            </div>

            {/* Mobile / tablet portrait — compact feature chips */}
            <div className="login-features-mobile" aria-label="Key features">
              {FEATURES.map(({ Icon, text }) => (
                <span key={text} className="login-feature-chip">
                  <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                  {text.split(' ').slice(0, 3).join(' ')}
                </span>
              ))}
            </div>

            {/* Desktop — full feature list */}
            <div className="login-features-list" aria-label="Key features">
              {FEATURES.map(({ Icon, text }) => (
                <div key={text} className="login-feature-row">
                  <div className="login-feature-icon">
                    <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <span className="login-feature-text">{text}</span>
                </div>
              ))}
            </div>

            <p className="login-version">v1.0 · Local Development</p>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL — Login form
            ══════════════════════════════════════════════════════ */}
        <main className="login-panel-right flex-1 min-w-0">

          <header className="login-panel-topbar items-start gap-3">
            <InstallAppButton />
            <LiveClock />
          </header>

          <div className="login-panel-body">
            <div className="login-card-enter">

              <article className="login-card-surface login-card-surface--modern">

                <header className="login-card-header">
                  <div className="login-card-mark" aria-hidden="true">
                    <Fingerprint size={24} strokeWidth={1.5} />
                  </div>
                  <div className="login-card-intro">
                    <h1 className="login-heading">Welcome back</h1>
                    <p className="login-subtext">Sign in to Digital Wiring Execution System</p>
                  </div>
                </header>

                <form onSubmit={handleSubmit} className="login-form">

                  <div className="login-field login-row-enter" style={{ animationDelay: '0.05s',}}>
                    <label htmlFor="username" className="login-label">Username</label>
                    <div className="login-input-wrap">
                      <User size={18} strokeWidth={1.5} className="login-input-icon" aria-hidden="true" />
                      <input
                        ref={usernameRef}
                        id="username"
                        className="login-input"
                        type="text"
                        value={username}
                        onChange={e => { setUsername(e.target.value); clearError(); clearBioError(); }}
                        placeholder="Enter your username"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div className="login-field login-row-enter" style={{ animationDelay: '0.1s',}}>
                    <label htmlFor="password" className="login-label">Password</label>
                    <div className="login-input-wrap">
                      <Lock size={18} strokeWidth={1.5} className="login-input-icon" aria-hidden="true" />
                      <input
                        id="password"
                        className="login-input login-input-pass"
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); clearError(); }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="login-input-toggle"
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                      >
                        {showPass
                          ? <EyeOff size={18} strokeWidth={1.5} />
                          : <Eye    size={18} strokeWidth={1.5} />
                        }
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="login-error" role="alert">
                      <AlertCircle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!username.trim() || !password.trim() || isLoading}
                    className="login-btn login-row-enter"
                    style={{ animationDelay: '0.15s', minHeight: '48px',}}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>

                {/* ── DEV/testing only: choosable demo account (prefills the fields above) ── */}
                {SHOW_DEMO_CREDENTIALS && (demoUsers !== null || DEMO_CREDENTIALS.length > 0) && (
                  <div className="login-section">
                    <div className="login-section-head">
                      <span className="login-section-label">Demo account</span>
                      <span className="login-dev-badge">DEV</span>
                    </div>

                    <div className="login-demo-popover-wrap" ref={demoPopoverRef}>
                      <button
                        type="button"
                        className="login-demo-trigger"
                        aria-haspopup="dialog"
                        aria-controls="login-demo-popover"
                        onClick={() => setDemoOpen(v => !v)}
                      >
                        <span className="login-demo-trigger-text">Demo Accounts</span>
                        <span className="login-demo-trigger-current">@{username}</span>
                        <ChevronDown
                          size={16}
                          strokeWidth={2.2}
                          className={`login-demo-trigger-caret ${demoOpen ? 'is-open' : ''}`}
                          aria-hidden="true"
                        />
                      </button>

                      {demoOpen && (
                        <div id="login-demo-popover" className="login-demo-popover" role="dialog" aria-label="Select demo account">
                          {demoUsers !== null ? (
                            <DemoUserSelect
                              users={demoUsers}
                              onSelect={(value) => {
                                fillDemoUser(value);
                                setDemoOpen(false);
                              }}
                              currentUsername={username}
                            />
                          ) : (
                            <DemoCredentialCards
                              creds={DEMO_CREDENTIALS}
                              currentUsername={username}
                              onSelect={(idx) => {
                                fillDemo(idx);
                                setDemoOpen(false);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Fingerprint login — visible only when device has enrolled credential ── */}
                {bioAvailable && bioEnrolled && (
                  <div className="login-section">
                    {bioError === 'not-enrolled' ? (
                      <p className="login-bio-hint">
                        No fingerprint set up on this device — sign in with your
                        password first, then enable it.
                      </p>
                    ) : (
                      <>
                        {bioError && (
                          <div className="login-error mb-3" role="alert">
                            <AlertCircle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                            <span>{bioError}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { clearBioError(); loginWithBiometric(username.trim() || undefined); }}
                          disabled={bioLoading}
                          className="login-bio-btn"
                        >
                          {bioLoading ? (
                            <div className="w-5 h-5 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" aria-hidden="true" />
                          ) : (
                            <>
                              <Fingerprint size={20} strokeWidth={1.5} aria-hidden="true" />
                              Sign in with fingerprint
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}

              </article>
            </div>
          </div>

          <footer className="login-panel-footer">
            <span className="login-panel-footer-text">v1.0 · Local Development</span>
          </footer>
        </main>
      </div>

      {showEnrollModal && (
        <EnrollBiometricModal
          onEnroll={handleEnroll}
          onSkip={handleSkipEnroll}
          enrolling={enrolling}
          error={enrollError}
        />
      )}
    </>
  );
}

// ── Demo account cards ─────────────────────────────────────────────────────────

interface RoleMeta { label: string; short: string; Icon: ComponentType<Omit<IconProps, 'name'>>; }

const ROLE_META: Record<string, RoleMeta> = {
  system_admin:      { label: 'System Admin',           short: 'Admin',      Icon: UserCog },
  ops_director:      { label: 'Operations Director',     short: 'Director',   Icon: Star },
  prod_supervisor:   { label: 'Production Supervisor',   short: 'Supervisor', Icon: ClipboardCheck },
  qaqc_engineer:     { label: 'QA / QC Engineer',        short: 'QA / QC',    Icon: ShieldCheck },
  wiring_technician: { label: 'Wiring Technician',       short: 'Technician', Icon: Wrench },
};

const ROLE_ORDER = ['system_admin', 'ops_director', 'prod_supervisor', 'qaqc_engineer', 'wiring_technician'];

// Map the legacy 5-slot fallback labels onto the same role visual system.
const LABEL_ROLE: Record<string, string> = {
  Admin: 'system_admin', Director: 'ops_director', Supervisor: 'prod_supervisor',
  QA: 'qaqc_engineer', Technician: 'wiring_technician',
};

// Seed full names spell numbers out ("Director Two"); the UI shows digits ("Director 2").
const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};

const displayName = (name: string) =>
  name.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    w => NUMBER_WORDS[w.toLowerCase()],
  );

/** Two-character avatar text: initials for real names, letter+number for seed usernames. */
function avatarText(fullName: string, username: string): string {
  if (fullName && fullName !== '[TBD]') {
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? '');
    return (first + second).toUpperCase();
  }
  const m = username.match(/^([a-zA-Z]+)(\d+)$/);
  if (m) return (m[1][0] + m[2]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

function DemoAccountCard({
  role, name, username, selected, chip, onSelect,
}: {
  role: string;
  name: string;
  username: string;
  selected: boolean;
  chip?: boolean;
  onSelect: () => void;
}) {
  const meta = ROLE_META[role] ?? { label: role, short: role, Icon: User };
  return (
    <button
      type="button"
      onClick={onSelect}
      className="login-demo-card"
      data-role={role}
      data-selected={selected || undefined}
    >
      <span className="login-demo-avatar" data-role={role} aria-hidden="true">
        {avatarText(name === username ? '' : name, username)}
      </span>
      <span className="login-demo-info">
        <span className="login-demo-name">{name}</span>
        <span className="login-demo-username">@{username}</span>
      </span>
      {chip && (
        <span className="login-demo-role-chip" data-role={role}>
          <meta.Icon size={11} strokeWidth={2} aria-hidden="true" />
          {meta.short}
        </span>
      )}
      <span className="login-demo-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    </button>
  );
}

function DemoUserSelect({
  users,
  onSelect,
  currentUsername,
}: {
  users: DemoUser[];
  onSelect: (username: string) => void;
  currentUsername: string;
}) {
  const grouped = ROLE_ORDER.reduce<Record<string, DemoUser[]>>((acc, role) => {
    const group = users.filter(u => u.role === role);
    if (group.length) acc[role] = group;
    return acc;
  }, {});

  return (
    <div className="login-demo-panel">
      <div className="login-demo-scroll">
        {Object.entries(grouped).map(([role, group]) => {
          const meta = ROLE_META[role] ?? { label: role, short: role, Icon: User };
          return (
            <div key={role} className="login-demo-group">
              <div className="login-demo-group-head">
                <span className="login-demo-group-icon" data-role={role} aria-hidden="true">
                  <meta.Icon size={12} strokeWidth={2} />
                </span>
                <span className="login-demo-group-label">{meta.label}</span>
                <span className="login-demo-group-count">{group.length}</span>
              </div>
              {group.map(u => {
                const name = u.full_name && u.full_name !== '[TBD]'
                  ? displayName(u.full_name)
                  : u.username;
                return (
                  <DemoAccountCard
                    key={u.username}
                    role={role}
                    name={name}
                    username={u.username}
                    selected={u.username === currentUsername}
                    onSelect={() => onSelect(u.username)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoCredentialCards({
  creds,
  currentUsername,
  onSelect,
}: {
  creds: DemoCredential[];
  currentUsername: string;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="login-demo-panel">
      <div className="login-demo-scroll login-demo-scroll--compact">
        {creds.map((c, i) => (
          <DemoAccountCard
            key={c.label}
            role={LABEL_ROLE[c.label] ?? 'system_admin'}
            name={c.label}
            username={c.username}
            selected={c.username === currentUsername}
            chip
            onSelect={() => onSelect(i)}
          />
        ))}
      </div>
    </div>
  );
}
