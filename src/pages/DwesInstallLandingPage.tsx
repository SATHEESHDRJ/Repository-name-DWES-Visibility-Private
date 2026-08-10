import { useNavigate } from 'react-router-dom';
import { ArrowRight, InstallDesktop, Phone } from '../components/ui/icons';
import InstallAppButton from '../components/InstallAppButton';
import { useAuthStore } from '../store/useAuthStore';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';
import type { InstallCampaignContext } from './InstallEntryPage';

type Props = {
  campaign: InstallCampaignContext;
};

/**
 * Branded team-install page for authenticated employees — PWA guidance only.
 */
export default function DwesInstallLandingPage({ campaign }: Props) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const goToDashboard = () => {
    const role = user?.role as UserRole | undefined;
    navigate(ROLE_ROUTES[role ?? 'system_admin'] ?? '/', { replace: true });
  };

  return (
    <div className="login-page-root font-sans dwes-install-landing" data-ui-polish="saas">
      <aside className="login-panel-left login-panel-left--gradient" aria-label="DWES">
        <div className="login-aurora" aria-hidden="true" />
        <div className="login-panel-left-inner">
          <span className="login-hero-badge">Team installation</span>
          <div className="login-brand-lockup">
            <div className="login-logo-wrap">
              <img src="/logo-full.png" alt="Ingenious Network FZC" width={180} height={52} decoding="async" />
            </div>
          </div>
          <div className="login-brand-copy">
            <h1 className="login-brand-title">Digital Wiring Execution System</h1>
            <p className="login-brand-tagline">Install DWES on your device, then continue to your role dashboard.</p>
          </div>
        </div>
      </aside>

      <main className="login-panel-right min-w-0">
        <div className="login-panel-body dwes-install-landing-body">
          <div className="dwes-install-landing-card">
            <p className="dwes-install-landing-org m-0">
              <strong>{campaign.organizationName}</strong>
              <span className="login-team-install-guide-sep"> · </span>
              {campaign.campaignLabel}
            </p>

            <div className="dwes-install-landing-actions">
              <InstallAppButton />
            </div>

            <section className="dwes-install-landing-section" aria-labelledby="install-android-win">
              <h2 id="install-android-win" className="dwes-install-landing-h2">
                <InstallDesktop size={16} aria-hidden="true" />
                Android &amp; Windows
              </h2>
              <ol className="login-team-install-guide-steps">
                <li>Open this page in <strong>Chrome</strong> or <strong>Microsoft Edge</strong>.</li>
                <li>Tap <strong>Install</strong> above (or the browser menu → Install app / Apps → Install this site).</li>
                <li>Launch DWES from your home screen or Start menu when you are ready to work.</li>
              </ol>
            </section>

            <section className="dwes-install-landing-section" aria-labelledby="install-ios">
              <h2 id="install-ios" className="dwes-install-landing-h2">
                <Phone size={16} aria-hidden="true" />
                iPhone &amp; iPad
              </h2>
              <ol className="login-team-install-guide-steps">
                <li>Use <strong>Safari</strong> (required for Add to Home Screen).</li>
                <li>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → <strong>Add</strong>.</li>
                <li>Open DWES from your home screen when you are ready to work.</li>
              </ol>
            </section>

            <p className="dwes-install-landing-note m-0">
              You are signed in. This link does not replace your administrator-issued account or role permissions.
            </p>

            <button type="button" className="login-submit-btn dwes-install-landing-continue" onClick={goToDashboard}>
              Go to Dashboard
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
