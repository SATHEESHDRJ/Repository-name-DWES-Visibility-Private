import { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, InstallDesktop, ShieldOff } from '../../../components/ui/icons';
import { adminApi } from '../../../services/api';

type Status = {
  configured: boolean;
  status: 'active' | 'disabled' | 'none';
  campaignLabel: string | null;
  organizationName: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  visitCount: number;
  lastVisitAt: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function TeamInstallLinkTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiryDays, setExpiryDays] = useState<string>('90');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.teamInstallLinkStatus();
      setStatus(data);
    } catch {
      setError('Could not load installation link status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRegenerate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const days = parseInt(expiryDays, 10);
      const result = await adminApi.teamInstallLinkRegenerate({
        expiryDays: Number.isFinite(days) && days > 0 ? days : undefined,
      });
      setShareUrl(result.shareUrl);
      await load();
    } catch {
      setError('Regenerate failed. Check your administrator session and try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.teamInstallLinkDisable();
      setShareUrl(null);
      await load();
    } catch {
      setError('Disable failed.');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select the link manually.');
    }
  };

  const statusLabel = status?.status === 'active'
    ? 'Active'
    : status?.status === 'disabled'
      ? 'Disabled'
      : 'Not configured';

  return (
    <div className="dash-module dash-module--wide">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <InstallDesktop size={18} className="shrink-0 mt-0.5 text-slate-600" aria-hidden="true" />
          <div className="min-w-0">
            <h4 className="text-[13px] font-bold text-primary m-0">DWES Team Installation Link</h4>
            <p className="text-[11px] text-muted mt-0.5 m-0">
              This link is intended only for authenticated Ingenious employees with an active DWES account.
              Opening the URL does not bypass login. Regenerating the link immediately invalidates the previous URL.
              Links use <code className="text-[10px]">https://dwes.ingenious-network.com/install/…</code> only.
            </p>
          </div>
        </div>

        {loading && <p className="text-xs text-muted m-0">Loading…</p>}
        {error && <p className="text-xs text-red-600 m-0" role="alert">{error}</p>}

        {!loading && status && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div><span className="text-muted">Status</span><div className="font-semibold">{statusLabel}</div></div>
            <div><span className="text-muted">Usage count</span><div className="font-semibold tabular-nums">{status.visitCount}</div></div>
            <div><span className="text-muted">Created</span><div className="font-semibold">{fmt(status.createdAt)}</div></div>
            <div><span className="text-muted">Expires</span><div className="font-semibold">{fmt(status.expiresAt)}</div></div>
            {status.organizationName && (
              <div className="sm:col-span-2">
                <span className="text-muted">Organisation</span>
                <div className="font-semibold">{status.organizationName}{status.campaignLabel ? ` · ${status.campaignLabel}` : ''}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            Expiry (days, optional)
            <input
              type="number"
              min={1}
              max={3650}
              className="login-input min-h-[40px] max-w-[7rem] text-sm"
              value={expiryDays}
              onChange={e => setExpiryDays(e.target.value)}
            />
          </label>
          <button type="button" className="btn-primary min-h-[40px] text-xs" disabled={busy} onClick={() => void onRegenerate()}>
            <RefreshCw size={14} className="inline mr-1" aria-hidden="true" />
            {status?.configured ? 'Regenerate' : 'Create link'}
          </button>
          <button type="button" className="btn-secondary min-h-[40px] text-xs" disabled={busy || status?.status !== 'active'} onClick={() => void onDisable()}>
            <ShieldOff size={14} className="inline mr-1" aria-hidden="true" />
            Disable
          </button>
        </div>

        {shareUrl && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-col gap-2">
            <p className="text-[11px] text-muted m-0">Copy this link now — the token is not shown again after you leave this page.</p>
            <code className="text-[11px] break-all text-slate-800">{shareUrl}</code>
            <button type="button" className="btn-primary min-h-[40px] text-xs self-start" onClick={() => void onCopy()}>
              <Copy size={14} className="inline mr-1" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
