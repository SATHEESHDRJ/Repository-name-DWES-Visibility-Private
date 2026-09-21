import { useEffect, useState } from 'react';
import { Fingerprint, Trash2, CheckCircle2, AlertCircle } from '../ui/icons';
import { webAuthnApi } from '../../services/webauthnApi';
import type { CredentialInfo } from '../../services/webauthnApi';
import { useAuthStore } from '../../store/useAuthStore';
import {
  BIOMETRIC_ENROLLED_KEY,
  useBiometricAvailable,
  useEnrollBiometric,
} from '../../hooks/useBiometric';
import { fingerprintEntryUrl } from '../../utils/webauthnSupport';
import { DwesLoadingIndicator } from '../ui/DwesLoadingIndicator';

// Friendly "OS / Browser" label for the credential (e.g. "Windows / Chrome")
function deviceLabel(): string {
  const ua = navigator.userAgent;
  let os = 'Device';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return `${os} / ${browser}`;
}

export default function BiometricSettings() {
  const [creds,    setCreds]    = useState<CredentialInfo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [justEnrolled, setJustEnrolled] = useState(false);

  const token = useAuthStore(s => s.token);
  const isSignedIn = Boolean(token || localStorage.getItem('dwes_token'));

  const {
    available,
    checking,
    contextSupported,
    contextMessage,
    suggestedUrl,
  } = useBiometricAvailable();
  const { enroll, enrolling, error: enrollError, clearError } = useEnrollBiometric();

  const load = async () => {
    if (!isSignedIn) {
      setCreds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { credentials } = await webAuthnApi.status();
      setCreds(credentials);
    } catch {
      // session expired or unavailable
      setCreds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnroll = async () => {
    if (!isSignedIn) return;
    clearError();
    setJustEnrolled(false);
    const ok = await enroll(deviceLabel());
    if (ok) {
      setJustEnrolled(true);
      await load();
    }
  };

  const handleRemove = async (id: string) => {
    setRemoving(id);
    try {
      await webAuthnApi.removeCredential(id);
      const next = creds.filter(c => c.id !== id);
      setCreds(next);
      if (next.length === 0) localStorage.removeItem(BIOMETRIC_ENROLLED_KEY);
    } catch {
      // ignore — UI will stay unchanged
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <DwesLoadingIndicator label="Loading devices…" size="sm" />
      </div>
    );
  }

  if (!contextSupported) {
    return (
      <div className="space-y-2">
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5 leading-relaxed">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>
            {contextMessage ?? 'Fingerprint requires HTTPS and a hostname.'}
            {suggestedUrl && (
              <>
                {' '}
                <a href={suggestedUrl} className="underline font-medium">
                  {suggestedUrl}
                </a>
              </>
            )}
          </span>
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Currently: <code className="text-[10px]">{window.location.origin}</code>
          {' · '}
          Required: <code className="text-[10px]">{suggestedUrl ?? fingerprintEntryUrl()}</code>
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          1. <code className="text-[10px]">npm run hosts:install</code> (Admin) · 2.{' '}
          <code className="text-[10px]">npm run certs:trust</code> · 3. Stop{' '}
          <code className="text-[10px]">dev:all</code> →{' '}
          <code className="text-[10px]">npm run dev:fingerprint</code>
        </p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <AlertCircle size={14} className="shrink-0" />
        You must be signed in to enable fingerprint sign-in.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {creds.length > 0 ? (
        <div className="space-y-2">
          {creds.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Fingerprint size={18} className="text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-primary truncate">
                    {c.deviceLabel ?? 'Unknown device'}
                  </div>
                  <div className="text-xs text-muted">
                    Added {new Date(c.createdAt).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                    {c.lastUsedAt && (
                      <> · Last used {new Date(c.lastUsedAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short',
                      })}</>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemove(c.id)}
                disabled={removing === c.id}
                title="Remove this fingerprint"
                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors disabled:opacity-40 shrink-0"
              >
                {removing === c.id
                  ? <div className="w-4 h-4 rounded-full border-2 border-red-300 border-t-red-500 animate-spin" />
                  : <Trash2 size={16} />
                }
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Fingerprint size={16} className="shrink-0" />
          No fingerprint devices enrolled yet.
        </div>
      )}

      {available ? (
        <>
          <button
            type="button"
            onClick={handleEnroll}
            disabled={enrolling}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl border-2 border-blue-200 text-blue-700 font-semibold text-sm hover:bg-blue-50 hover:border-blue-300 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {enrolling ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" />
                Waiting for fingerprint…
              </>
            ) : (
              <>
                <Fingerprint size={18} strokeWidth={1.5} />
                Enable fingerprint on this device
              </>
            )}
          </button>

          {justEnrolled && !enrollError && (
            <p className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 size={14} className="shrink-0" />
              Fingerprint enabled on this device.
            </p>
          )}
          {enrollError && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle size={14} className="shrink-0" />
              {enrollError}
            </p>
          )}
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Your device will prompt for Windows Hello / its fingerprint sensor.
          </p>
        </>
      ) : !checking ? (
        <p className="text-xs text-slate-400 leading-relaxed">
          This device doesn’t support fingerprint / Windows Hello sign-in.
        </p>
      ) : null}
    </div>
  );
}
