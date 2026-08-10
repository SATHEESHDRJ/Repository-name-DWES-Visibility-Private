import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { installLinkApi } from '../services/api';
import InstallAccessDeniedPage from './InstallAccessDeniedPage';
import DwesInstallLandingPage from './DwesInstallLandingPage';
import LoginPage from './LoginPage';
import { useAuthStore } from '../store/useAuthStore';
import { resolveSafeReturnPath } from '../utils/safeReturnPath';

export type InstallCampaignContext = {
  campaignLabel: string;
  organizationName: string;
  linkId: number;
};

/**
 * Team installation entry — login required before any token validation.
 */
export default function InstallEntryPage() {
  const { installToken } = useParams<{ installToken: string }>();
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const hydrateFromStorage = useAuthStore(s => s.hydrateFromStorage);
  const authHydrated = useAuthStore(s => s.authHydrated);

  const [campaign, setCampaign] = useState<InstallCampaignContext | null>(null);
  const [denied, setDenied] = useState(false);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const token = (installToken || '').trim();
  const returnPath = resolveSafeReturnPath(location.pathname) ?? undefined;

  useEffect(() => {
    if (!authHydrated || !user) return;
    if (!token) {
      setDenied(true);
      return;
    }

    let cancelled = false;
    setValidating(true);
    setDenied(false);
    setCampaign(null);

    installLinkApi.validate(token)
      .then((data) => {
        if (cancelled) return;
        setCampaign({
          campaignLabel: data.campaignLabel,
          organizationName: data.organizationName,
          linkId: data.linkId,
        });
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });

    return () => { cancelled = true; };
  }, [authHydrated, user, token]);

  if (!authHydrated) {
    return <div className="login-page-root font-sans min-h-[100svh]" aria-busy="true" />;
  }

  if (!user) {
    return <LoginPage returnToAfterLogin={returnPath} />;
  }

  if (validating) {
    return <div className="login-page-root font-sans min-h-[100svh]" aria-busy="true" />;
  }

  if (denied || !campaign) {
    return <InstallAccessDeniedPage />;
  }

  return <DwesInstallLandingPage campaign={campaign} />;
}
