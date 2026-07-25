import { useEffect, useState } from 'react';
import {
  CheckCircle, Cloud, Globe, HardDrive, Loader, Shield, Wifi,
  DollarSign, Zap, AlertTriangle, ExternalLink, Lock,
} from '../../../components/ui/icons';
import { adminApi } from '../../../services/api';

type DeploymentMode = 'intranet' | 'cloud';
type CloudTier = 'standard' | 'performance' | 'enterprise';

interface PricingTier {
  tier: string;
  label: string;
  monthlyUsd: number;
  setupUsd: number;
  summary: string;
  features: string[];
  sla: string;
  latency: string;
}

interface DeploymentConfig {
  mode: DeploymentMode;
  cloudAppUrl: string;
  cloudTier: CloudTier;
  cloudRegion: string;
  lastSwitched: string | null;
  notes: string;
  httpsEnabled: boolean;
  intranet: {
    httpsPort: string;
    httpRedirectPort: string;
    localHttps: string;
    localHttpRedirect: string;
    lanUrls: { ip: string; https: string; httpRedirect: string }[];
  };
  pricing: Record<string, PricingTier>;
  activePricing: PricingTier;
}

const CLOUD_TIERS: CloudTier[] = ['standard', 'performance', 'enterprise'];

const REGION_OPTIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'EU West (Ireland)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
];

function fmtUsd(n: number) {
  return n === 0 ? 'Free' : `$${n.toLocaleString()}/mo`;
}

export default function DeploymentModeTab() {
  const [config, setConfig] = useState<DeploymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<DeploymentMode>('intranet');
  const [cloudAppUrl, setCloudAppUrl] = useState('');
  const [cloudTier, setCloudTier] = useState<CloudTier>('performance');
  const [cloudRegion, setCloudRegion] = useState('us-east-1');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ message?: string; error?: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const cfg = await adminApi.getDeploymentConfig();
      setConfig(cfg);
      setSelectedMode(cfg.mode);
      setCloudAppUrl(cfg.cloudAppUrl || '');
      setCloudTier(cfg.cloudTier || 'performance');
      setCloudRegion(cfg.cloudRegion || 'us-east-1');
      setNotes(cfg.notes || '');
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (selectedMode === 'cloud' && !cloudAppUrl.trim()) {
      setSaveResult({ error: 'Cloud app URL is required when switching to Cloud hosting.' });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await adminApi.setDeploymentConfig(
        selectedMode,
        cloudAppUrl.trim() || undefined,
        cloudTier,
        cloudRegion,
        notes,
      );
      if (r.error) setSaveResult({ error: r.error });
      else setSaveResult({ message: r.message });
      await load();
    } catch (e: any) {
      setSaveResult({ error: e?.response?.data?.error || e?.message || 'Failed to save.' });
    } finally { setSaving(false); }
  };

  const dirty = config
    ? selectedMode !== config.mode
      || (selectedMode === 'cloud' && (
        cloudAppUrl !== (config.cloudAppUrl || '')
        || cloudTier !== config.cloudTier
        || cloudRegion !== config.cloudRegion
      ))
      || notes !== (config.notes || '')
    : false;

  const previewTier = selectedMode === 'intranet' ? 'intranet' : cloudTier;
  const previewPricing = config?.pricing?.[previewTier];

  if (loading) {
    return <div className="empty-state"><p className="empty-text">Loading deployment configuration...</p></div>;
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Active mode banner */}
      <div className={`status-banner rounded-xl px-4 tablet-land:px-5 py-4 border ${
        config?.mode === 'cloud' ? 'bg-indigo-50 border-indigo-200' : 'bg-emerald-50 border-emerald-200'
      }`}>
        {config?.mode === 'cloud'
          ? <Cloud size={24} className="text-indigo-600 shrink-0" />
          : <Wifi size={24} className="text-emerald-600 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-bold uppercase tracking-wider select-none ${
            config?.mode === 'cloud' ? 'text-indigo-700' : 'text-emerald-700'
          }`}>
            Active: {config?.mode === 'cloud' ? 'Cloud Hosting' : 'Local Intranet'}
          </div>
          <div className="text-[12px] text-slate-600 mt-0.5 truncate select-none">
            {config?.mode === 'cloud'
              ? (config.cloudAppUrl || 'Cloud URL not configured')
              : 'Devices on the same Wi-Fi / LAN access this PC via HTTPS'}
          </div>
        </div>
        {config?.lastSwitched && (
          <div className="status-banner-meta">
            Switched {new Date(config.lastSwitched).toLocaleString()}
          </div>
        )}
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
      </div>

      {/* Mode selection */}
      <div className="rounded-xl border border-slate-200 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-[14px] font-bold text-slate-800 select-none">Deployment Mode</div>
          <div className="text-[12px] text-slate-500 mt-0.5 select-none">
            Switch between on-premises LAN access and cloud-hosted deployment.
          </div>
        </div>

        <div className="p-5 flex flex-col tablet-port:flex-row gap-3">
          <button
            type="button"
            onClick={() => { setSelectedMode('intranet'); setSaveResult(null); }}
            className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
              selectedMode === 'intranet'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-200 bg-[var(--t-surface-white)] hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedMode === 'intranet' ? 'bg-emerald-100' : 'bg-slate-100'
              }`}>
                <HardDrive size={16} className={selectedMode === 'intranet' ? 'text-emerald-700' : 'text-slate-500'} />
              </div>
              <span className={`text-[14px] font-bold select-none ${
                selectedMode === 'intranet' ? 'text-emerald-800' : 'text-slate-700'
              }`}>Local Intranet</span>
              {selectedMode === 'intranet' && (
                <span className="ml-auto text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full select-none">SELECTED</span>
              )}
            </div>
            <div className="text-[12px] text-slate-500 select-none">
              PCs, tablets, and phones on the same Wi-Fi reach this server. Best for shop-floor use with no cloud fees.
            </div>
            <div className="text-[11px] font-semibold text-emerald-700 mt-2 select-none">{fmtUsd(0)} infrastructure</div>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedMode('cloud'); setSaveResult(null); }}
            className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
              selectedMode === 'cloud'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-200 bg-[var(--t-surface-white)] hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedMode === 'cloud' ? 'bg-indigo-100' : 'bg-slate-100'
              }`}>
                <Globe size={16} className={selectedMode === 'cloud' ? 'text-indigo-700' : 'text-slate-500'} />
              </div>
              <span className={`text-[14px] font-bold select-none ${
                selectedMode === 'cloud' ? 'text-indigo-800' : 'text-slate-700'
              }`}>Cloud Hosting</span>
              {selectedMode === 'cloud' && (
                <span className="ml-auto text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full select-none">SELECTED</span>
              )}
            </div>
            <div className="text-[12px] text-slate-500 select-none">
              Fast, secure, managed hosting with TLS, backups, and high availability — accessible from anywhere.
            </div>
            <div className="text-[11px] font-semibold text-indigo-700 mt-2 select-none">From {fmtUsd(149)}</div>
          </button>
        </div>

        {/* Cloud options */}
        {selectedMode === 'cloud' && (
          <div className="px-5 pb-4 flex flex-col gap-4 border-t border-slate-100 pt-4">
            <div>
              <label className="text-[12px] font-bold text-slate-600 select-none block mb-1.5">Cloud App URL</label>
              <input
                type="url"
                value={cloudAppUrl}
                onChange={e => { setCloudAppUrl(e.target.value); setSaveResult(null); }}
                placeholder="https://dwes.yourcompany.com"
                className="form-input w-full font-mono text-[12px]"
                spellCheck={false}
              />
            </div>
            <div className="grid grid-cols-1 tablet-land:grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-bold text-slate-600 select-none block mb-1.5">Service Tier</label>
                <select
                  value={cloudTier}
                  onChange={e => setCloudTier(e.target.value as CloudTier)}
                  className="form-input w-full text-[13px]"
                >
                  {CLOUD_TIERS.map(t => (
                    <option key={t} value={t}>
                      {config?.pricing?.[t]?.label ?? t} — {fmtUsd(config?.pricing?.[t]?.monthlyUsd ?? 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-bold text-slate-600 select-none block mb-1.5">Region</label>
                <select
                  value={cloudRegion}
                  onChange={e => setCloudRegion(e.target.value)}
                  className="form-input w-full text-[13px]"
                >
                  {REGION_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Intranet URLs */}
        {selectedMode === 'intranet' && config?.intranet && (
          <div className="px-5 pb-4 border-t border-slate-100 pt-4">
            <div className="text-[12px] font-bold text-slate-700 select-none mb-2 flex items-center gap-2">
              <Lock size={14} /> LAN Access URLs (HTTPS)
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-col gap-1.5">
              <div className="text-[11px] font-mono text-slate-600">{config.intranet.localHttps}</div>
              <div className="text-[11px] text-slate-500 select-none">
                {config.intranet.localHttpRedirect} → auto-redirects to HTTPS
              </div>
              {config.intranet.lanUrls.map(u => (
                <div key={u.ip} className="text-[11px] font-mono text-emerald-700">{u.https}</div>
              ))}
              {config.intranet.lanUrls.length === 0 && (
                <div className="text-[11px] text-amber-600 select-none">No LAN IP detected — connect to Wi-Fi and restart dev server.</div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 select-none">
              Start with <span className="font-mono">npm run dev:https</span>. Run <span className="font-mono">npm run certs:trust</span> once to remove the browser certificate warning on this PC.
            </p>
          </div>
        )}

        <div className="px-5 pb-4">
          <label className="text-[12px] font-bold text-slate-600 select-none block mb-1.5">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Shop floor Wi-Fi only, pilot cloud Q3"
            className="form-input w-full text-[13px]"
          />
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn-primary"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : null}
            <span>Save Deployment Mode</span>
          </button>
        </div>
      </div>

      {/* Pricing comparison */}
      {previewPricing && (
        <div className="rounded-xl border border-slate-200 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <DollarSign size={18} className="text-slate-500 shrink-0" />
            <div>
              <div className="text-[14px] font-bold text-slate-800 select-none">Cost & Service Comparison</div>
              <div className="text-[12px] text-slate-500 select-none">Selected: {previewPricing.label}</div>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 tablet-port:grid-cols-2 tablet-wide:grid-cols-4 gap-3">
            {(['intranet', ...CLOUD_TIERS] as const).map(key => {
              const p = config?.pricing?.[key];
              if (!p) return null;
              const active = key === previewTier;
              return (
                <div
                  key={key}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    active ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="text-[12px] font-bold text-slate-700 select-none">{p.label}</div>
                  <div className={`text-[20px] font-bold mt-1 select-none ${active ? 'text-indigo-700' : 'text-slate-800'}`}>
                    {fmtUsd(p.monthlyUsd)}
                  </div>
                  {p.setupUsd > 0 && (
                    <div className="text-[10px] text-slate-500 select-none">+ ${p.setupUsd} setup</div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-2 select-none">{p.summary}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-3 select-none">SLA</div>
                  <div className="text-[11px] text-slate-600 select-none">{p.sla}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2 select-none">Latency</div>
                  <div className="text-[11px] text-slate-600 select-none">{p.latency}</div>
                </div>
              );
            })}
          </div>

          {previewPricing.features && (
            <div className="px-5 pb-5">
              <div className="text-[12px] font-bold text-slate-700 select-none mb-2 flex items-center gap-2">
                <Shield size={14} /> Included with {previewPricing.label}
              </div>
              <ul className="grid grid-cols-1 tablet-land:grid-cols-2 gap-2">
                {previewPricing.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-slate-600 select-none">
                    <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {selectedMode === 'cloud' && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
                  <Zap size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div className="text-[12px] text-indigo-800 select-none">
                    Cloud tiers include TLS 1.3, automated patching, encrypted backups, and global CDN edge caching for fast tablet and phone access outside the LAN.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {saveResult && (
        <div className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
          saveResult.error ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
        }`}>
          {saveResult.error
            ? <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            : <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />}
          <div className="text-[13px] select-none">
            {saveResult.error
              ? <span className="font-bold text-red-700">{saveResult.error}</span>
              : <span className="text-emerald-800">{saveResult.message}</span>}
          </div>
        </div>
      )}

      {selectedMode === 'cloud' && cloudAppUrl && (
        <a
          href={cloudAppUrl.startsWith('http') ? cloudAppUrl : `https://${cloudAppUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[13px] text-indigo-600 hover:text-indigo-800 select-none"
        >
          <ExternalLink size={14} />
          Open cloud app URL
        </a>
      )}
    </div>
  );
}
