import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, Eye, EyeOff, Fingerprint, Lock, Palette, ShieldCheck, User,
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
import LoginHeroAtmosphere from '../components/login/LoginHeroAtmosphere';
import LoginShowcaseFeatures from '../components/login/LoginShowcaseFeatures';
import {
  formatLoginErrorMessage,
  LOGIN_SUPPORT_LINE,
  LOGIN_TRUST_LINE,
} from '../components/login/loginShowcaseContent';
import {
  BIOMETRIC_DISMISSED_KEY,
  useBiometricAvailable,
  useBiometricLogin,
  useEnrollBiometric,
} from '../hooks/useBiometric';
import { postLoginDestination } from '../utils/safeReturnPath';

/* ── Compact live clock (secondary utility) ── */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('en-GB', {
    hour12: false, hour: '2-digit', minute: '2-digit',
  });
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
  const rest = now
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  return (
    <div
      className="login-clock-widget login-clock-widget--rail select-none"
      role="timer"
      aria-label={`Current time ${timeStr}, ${weekday} ${rest}`}
    >
      <div className="login-clock-time tabular-nums" aria-hidden="true">{timeStr}</div>
      <div className="login-clock-date" aria-hidden="true">
        {weekday}
        <span className="login-clock-sep" aria-hidden="true"> · </span>
        {rest}
      </div>
    </div>
  );
}

type LoginPageProps = {
  returnToAfterLogin?: string;
};

/* ── Main component — auth logic frozen; presentation only changes ── */
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

  const friendlyError = formatLoginErrorMessage(error);
  const canSubmit = Boolean(username.trim() && password.trim()) && !isLoading && serverOk !== false;

  return (
    <>
      <div
        id="main-content"
        className="login-page-root login-page-root--master font-sans"
        data-ui-polish="saas"
        data-ui01-login-showcase="master"
        tabIndex={-1}
      >

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL — Premium product hero (no wiring diagram)
            ══════════════════════════════════════════════════════ */}
        <aside
          className="login-panel-left login-panel-left--master"
          aria-label="Product overview"
          data-login-theme={theme}
        >
          <LoginHeroAtmosphere />

          <div className="login-panel-left-inner login-panel-left-inner--master">
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
                <span className="login-brand-text-col login-brand-text-col--accent min-w-0">
                  <span className="login-brand-name">INGENIOUS NETWORK FZC</span>
                  <span className="login-brand-descriptor">DIGITAL ENGINEERING PLATFORM</span>
                </span>
              </div>
            </div>

            <div className="login-brand-copy login-brand-copy--master">
              <p className="login-product-id">DWES</p>
              <h2 className="login-brand-title">DIGITAL WIRING EXECUTION SYSTEM</h2>
              <p className="login-brand-tagline">Paperless. Precise. Real-Time.</p>
              <p className="login-brand-support">{LOGIN_SUPPORT_LINE}</p>
            </div>

            <LoginShowcaseFeatures />

            <p className="login-trust-line">{LOGIN_TRUST_LINE}</p>

            <p className="login-showcase-footer">
              <span>© 2026 Ingenious Network FZC</span>
              <span aria-hidden="true">·</span>
              <span>DWES</span>
            </p>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL — Authentication environment
            ══════════════════════════════════════════════════════ */}
        <main className="login-panel-right login-panel-right--master min-w-0">

          <header className="login-panel-topbar">
            <div
              className="login-utility-rail"
              role="toolbar"
              aria-label="Login utilities"
            >
              <div className="login-theme-switcher" role="group" aria-label="Appearance">
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
                      <Palette size={18} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
              <div className="login-panel-topbar-actions">
                <InstallAppButton />
                <BrowserFullscreenButton />
              </div>
              <span className="login-utility-divider" aria-hidden="true" />
              <LiveClock />
            </div>
          </header>

          <div className="login-panel-body">
            <div className="login-card-wrap">

              <article className="login-card-surface login-card-surface--master">

                <header className="login-card-header">
                  <div className="login-card-mark" aria-hidden="true">
                    <Fingerprint size={22} strokeWidth={1.5} />
                  </div>
                  <div className="login-card-intro">
                    <h1 className="login-heading">Welcome back</h1>
                    <p className="login-subtext">Sign in to continue to DWES</p>
                  </div>
                </header>

                <form onSubmit={handleSubmit} className="login-form" noValidate>

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
                        aria-invalid={Boolean(error) || undefined}
                        aria-describedby={error ? 'login-error-msg' : undefined}
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
                        aria-invalid={Boolean(error) || undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="login-input-toggle"
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                        aria-pressed={showPass}
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
                    <div id="login-error-msg" className="login-error" role="alert">
                      <AlertCircle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                      <span className="login-error-text">
                        {friendlyError.split('\n').map((line, i) => (
                          <span key={i} className={i === 0 ? 'login-error-title' : 'login-error-detail'}>
                            {line}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="login-btn"
                    aria-busy={isLoading || undefined}
                  >
                    {isLoading ? (
                      <>
                        <span className="login-btn-spinner" aria-hidden="true" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        SIGN IN
                        <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>

                {import.meta.env.DEV && <DemoAccountSelector />}

                <p className="login-support-note login-support-note--secure">
                  <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    Accounts are issued by the <strong>System Administrator</strong>. Contact your
                    administrator for access or password reset.
                  </span>
                </p>

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
                            <span className="login-btn-spinner login-btn-spinner--accent" aria-hidden="true" />
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
            <span className="login-panel-footer-text">DWES</span>
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
