import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, ClipboardList, Eye, EyeOff, Fingerprint, Lock, Palette, ShieldCheck, User, Zap,
} from '../components/ui/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';
import EnrollBiometricModal from '../components/biometric/EnrollBiometricModal';
import InstallAppButton from '../components/InstallAppButton';
import BrowserFullscreenButton from '../components/BrowserFullscreenButton';
import { THEME_SWITCHER_THEMES, useTheme } from '../components/layout/ThemeProvider';
import DemoAccountSelector from '../components/login/DemoAccountSelector';
import {
  BIOMETRIC_DISMISSED_KEY,
  useBiometricAvailable,
  useBiometricLogin,
  useEnrollBiometric,
} from '../hooks/useBiometric';

const FEATURES = [
  { Icon: Zap,           text: 'Real-time wiring progress tracking' },
  { Icon: ClipboardList, text: 'Digital schedules replace paper' },
];

function ClockDigits({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="login-clock-digits" aria-hidden="true">
      {[...value].map((digit, index) => (
        <span className="login-clock-digit-slot" key={`${unit}-${index}`}>
          <span className="login-clock-digit" key={`${unit}-${index}-${digit}`}>
            {digit}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ── Live clock with per-digit rolling transitions ── */
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

  return (
    <div className="login-clock-widget select-none" role="timer" aria-label={`Current time ${hh}:${mm}:${ss}`}>
      <span className="login-clock-live" aria-hidden="true">
        <span className="login-clock-dot" />
        Live
      </span>
      <div className="login-clock-time tabular-nums" aria-hidden="true">
        <ClockDigits value={hh} unit="hour" />
        <span className="login-clock-colon">:</span>
        <ClockDigits value={mm} unit="minute" />
        <span className="login-clock-colon">:</span>
        <ClockDigits value={ss} unit="second" />
      </div>
      <div className="login-clock-date">{dateStr}</div>
    </div>
  );
}

import { postLoginDestination } from '../utils/safeReturnPath';

type LoginPageProps = {
  returnToAfterLogin?: string;
};

/* ── Main component ── */
export default function LoginPage({ returnToAfterLogin }: LoginPageProps = {}) {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, user } = useAuthStore();
  const { theme, setTheme } = useTheme();

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

  /* Redirect if already authenticated (unless returning to install deep link) */
  useEffect(() => {
    if (!user) return;
    const dest = postLoginDestination(returnToAfterLogin, ROLE_ROUTES[user.role as UserRole] ?? '/');
    navigate(dest, { replace: true });
  }, [user, navigate, returnToAfterLogin]);

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

  const navigateAfterLogin = useCallback(() => {
    const next = useAuthStore.getState().user;
    if (!next) return;
    const dest = postLoginDestination(returnToAfterLogin, ROLE_ROUTES[next.role as UserRole] ?? '/');
    navigate(dest, { replace: true });
  }, [navigate, returnToAfterLogin]);

  const navigateToDashboard = navigateAfterLogin;

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
        navigateAfterLogin();
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
      <div id="main-content" className="login-page-root font-sans" data-ui-polish="saas" tabIndex={-1}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL — Solid brand surface (instant, no entrance delay)
            ══════════════════════════════════════════════════════ */}
        <aside
          className="login-panel-left login-panel-left--gradient"
          aria-label="Product overview"
          data-login-theme={theme}
        >
          {/* Modern static gradient mesh — no entrance delay */}
          <div className="login-aurora" aria-hidden="true" />
          <div className="login-blob-layer" aria-hidden="true">
            <span className="login-blob login-blob--a" />
            <span className="login-blob login-blob--b" />
            <span className="login-blob login-blob--c" />
          </div>

          <div className="login-panel-left-inner">
            <div className="login-brand-lockup login-brand-lockup--official-stack">
              <span className="login-brand-platform login-brand-platform--smart">
                SMART WIRING PLATFORM
              </span>
              <div className="login-brand-lockup login-brand-lockup--horizontal login-brand-lockup--official-inline">
                <div className="login-logo-wrap login-logo-wrap--official login-logo-wrap--official-inline">
                  <img
                    src="/assets/ingenious-network-official-logo-color.png?v=20260725e"
                    alt="Ingenious Network"
                    width={352}
                    height={198}
                    decoding="async"
                    fetchPriority="high"
                  />
                </div>
                <span className="login-brand-text-col min-w-0">
                  <span className="login-brand-name">INGENIOUS NETWORK FZC</span>
                </span>
              </div>
            </div>

            <div className="login-brand-copy">
              <h2 className="login-brand-title">
                Digital Wiring Execution System
              </h2>
              <p className="login-brand-tagline">Paperless. Precise. Real-Time.</p>
            </div>

            {/* Mobile / tablet portrait — compact feature chips */}
            <div className="login-features-mobile" aria-label="Key features">
              {FEATURES.map(({ Icon, text }) => (
                <span key={text} className="login-feature-chip">
                  <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
                  {text.split(' ').slice(0, 3).join(' ')}
                </span>
              ))}
            </div>

            {/* Desktop — full feature list */}
            <div className="login-features-list" aria-label="Key features">
              {FEATURES.map(({ Icon, text }) => (
                <div key={text} className="login-feature-row">
                  <div className="login-feature-icon">
                    <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <span className="login-feature-text">{text}</span>
                </div>
              ))}
            </div>

          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL — Login form
            ══════════════════════════════════════════════════════ */}
        <main className="login-panel-right min-w-0">

          <header className="login-panel-topbar">
            <div className="login-panel-topbar-tools">
              <div className="login-theme-switcher" role="group" aria-label="Login page theme">
                {THEME_SWITCHER_THEMES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`login-theme-icon-btn${theme === t.id ? ' is-active' : ''}`}
                    onClick={() => setTheme(t.id)}
                    aria-label={`Use ${t.label} theme`}
                    aria-pressed={theme === t.id}
                    data-tooltip={t.label}
                  >
                    {t.id === 'ingenious' ? (
                      <img className="login-theme-brand-icon" src="/logo-icon.png" alt="" aria-hidden="true" width={22} height={22} />
                    ) : (
                      <Palette size={19} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
              <div className="login-panel-topbar-actions">
                <InstallAppButton />
                <BrowserFullscreenButton />
              </div>
              <LiveClock />
            </div>
          </header>

          <div className="login-panel-body">
            <div className="login-card-wrap">

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

                  <div className="login-field">
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

                  <div className="login-field">
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
                    className="login-btn"
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

                {import.meta.env.DEV && <DemoAccountSelector />}

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
                          onClick={() => { clearBioError(); loginWithBiometric(username.trim() || undefined, returnToAfterLogin); }}
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
            <span className="login-panel-footer-text">v1.0</span>
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
