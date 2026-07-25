import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, ClipboardList, Eye, EyeOff, Fingerprint, Lock, ShieldCheck, User, Zap,
} from '../components/ui/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';
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
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const pendingUserIdRef = useRef<number | null>(null);

  /* Redirect if already authenticated */
  useEffect(() => {
    if (user) navigate(ROLE_ROUTES[user.role as UserRole] ?? '/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    usernameRef.current?.focus();
    const ping = () => {
      authApi.health()
        .then(() => setServerOk(true))
        .catch(() => setServerOk(false));
    };
    ping();
    const id = setInterval(ping, 5000);
    return () => clearInterval(id);
  }, []);

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

                  {serverOk === false && (
                    <div className="login-error login-error--offline" role="status" aria-live="polite">
                      <AlertCircle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                      <span>
                        <strong>DWES backend is not available.</strong>{' '}
                        Start DWES manually when required. This page will reconnect automatically when the backend is ready.
                      </span>
                    </div>
                  )}

                  {error && (
                    <div className="login-error" role="alert">
                      <AlertCircle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!username.trim() || !password.trim() || isLoading || serverOk === false}
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

                {/* Required support information — accounts are issued, never self-registered. */}
                <p className="login-support-note">
                  <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    Accounts are issued by the <strong>System Administrator</strong>. Contact your
                    administrator for access or a password reset.
                  </span>
                </p>

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
            <span className="login-panel-footer-text">v1.0 · Ingenious Network FZC</span>
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
