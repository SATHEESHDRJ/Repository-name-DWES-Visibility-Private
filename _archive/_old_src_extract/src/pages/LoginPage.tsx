import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Fingerprint,
  Monitor,
  ShieldCheck,
  TabletSmartphone,
  UserRound,
  ClipboardCheck,
  ImageIcon,
  BarChart3,
  MonitorSmartphone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';
import type { DeviceProfile } from '../store/useUIStore';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const FEATURE_CARDS = [
  {
    icon: <FileSpreadsheet size={20} className="text-[#2563EB]" />,
    title: 'Digital Wiring Schedule',
    desc: 'Import and manage structured wiring schedules with full cable metadata.',
  },
  {
    icon: <TabletSmartphone size={20} className="text-[#16A34A]" />,
    title: 'Tablet-First Workflow',
    desc: 'Glove-safe action buttons, large touch targets, portrait and landscape modes.',
  },
  {
    icon: <ImageIcon size={20} className="text-[#F59E0B]" />,
    title: 'Drawings & Frames',
    desc: 'Upload panel drawings, link SVG frames, and navigate with pan and zoom.',
  },
  {
    icon: <BarChart3 size={20} className="text-[#DC2626]" />,
    title: 'Real-Time Progress',
    desc: 'Live KPI cards track source and destination completions separately.',
  },
  {
    icon: <ClipboardCheck size={20} className="text-[#0284C7]" />,
    title: 'Digital Inspections',
    desc: 'QA/QC engineers submit structured inspection reports with photo hashing.',
  },
  {
    icon: <Monitor size={20} className="text-[#7C3AED]" />,
    title: 'Paperless Reports',
    desc: 'Auto-generated completion reports stamped with time, technician, and KPIs.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, user } = useAuthStore();
  const { deviceProfile, setDeviceProfile } = useUIStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [envLabel, setEnvLabel] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) navigate(ROLE_ROUTES[user.role as UserRole] ?? '/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    usernameRef.current?.focus();
    authApi.health()
      .then(() => setServerStatus('ok'))
      .catch(() => setServerStatus('error'));
    authApi.env()
      .then((data: { env_label?: string }) => setEnvLabel(data.env_label || 'Local Dev'))
      .catch(() => setEnvLabel('Local Dev'));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) return;
    clearError();
    try {
      await login(username.trim(), password.trim());
      const nextUser = useAuthStore.getState().user;
      if (nextUser) navigate(ROLE_ROUTES[nextUser.role as UserRole] ?? '/', { replace: true });
    } catch {
      // error is set in the store
    }
  };

  const getDeviceIcon = (profile: DeviceProfile) => {
    if (profile === 'desktop') return <Monitor size={18} />;
    if (profile === 'auto') return <MonitorSmartphone size={18} />;
    return <TabletSmartphone size={18} />;
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#F8FAFC] overflow-hidden font-sans text-slate-800">
      {/* HEADER */}
      <header className="h-[72px] bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 flex-shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#2563EB] to-[#1E3A8A] flex items-center justify-center text-white font-bold text-lg">
            W
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-wide text-slate-900 leading-none">DWES</span>
            <span className="text-[12px] text-slate-500 font-medium">Digital Wiring Execution System</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${serverStatus === 'ok' ? 'bg-[#16A34A]' : serverStatus === 'error' ? 'bg-[#DC2626]' : 'bg-[#F59E0B]'}`} />
            <span className="text-[13px] font-semibold text-slate-600">
              {serverStatus === 'ok' ? 'System Online' : serverStatus === 'error' ? 'System Offline' : 'Connecting...'}
            </span>
          </div>
          <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[12px] font-bold uppercase tracking-wider rounded-[8px]">
            {envLabel || 'Local Dev'}
          </span>
          <div className="w-px h-8 bg-[#E5E7EB]" />
          
          {/* Device Switcher */}
          <div className="flex items-center gap-1 bg-slate-50 border border-[#E5E7EB] rounded-[10px] p-1">
            {(['auto', '10.1', '10.9', '11.0', '12.4', 'desktop'] as DeviceProfile[]).map(profile => (
              <button
                key={profile}
                onClick={() => setDeviceProfile(profile)}
                title={`Switch to ${profile} layout`}
                className={`
                  w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors
                  ${deviceProfile === profile ? 'bg-white shadow-sm text-[#2563EB] ring-1 ring-[#2563EB]/20' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}
                `}
              >
                {getDeviceIcon(profile)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* LEFT PANEL */}
        <section className="flex-1 bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-white p-10 flex flex-col justify-center relative overflow-hidden">
          {/* Decorative Background Elements */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#2563EB] blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#38BDF8] blur-[120px]" />
          </div>

          <div className="max-w-xl mx-auto w-full relative z-10 flex flex-col gap-10">
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-[13px] font-semibold text-blue-200 tracking-wide mb-6">
                Tablet Wiring Workflow
              </span>
              <h1 className="text-[42px] leading-tight font-extrabold tracking-tight mb-4">
                Digital Wiring Execution System
              </h1>
              <p className="text-[20px] text-slate-300 font-medium">
                Paperless. Precise. Real-Time.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURE_CARDS.map(card => (
                <div key={card.title} className="bg-white/5 border border-white/10 rounded-[12px] p-5 backdrop-blur-sm transition-all hover:bg-white/10">
                  <div className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center mb-4">
                    {card.icon}
                  </div>
                  <h3 className="text-[16px] font-semibold mb-2">{card.title}</h3>
                  <p className="text-[13px] text-slate-400 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT PANEL - LOGIN */}
        <section className="flex-[0.8] bg-white p-10 flex flex-col items-center justify-center border-l border-[#E5E7EB] shadow-xl z-20">
          <div className="w-full max-w-[420px] flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <span className="inline-block px-3 py-1 bg-[#2563EB]/10 text-[#2563EB] text-[12px] font-bold uppercase tracking-wider rounded-[8px] self-start">
                Secure Sign-in
              </span>
              <h2 className="text-[32px] font-bold text-slate-900 tracking-tight">Welcome Back</h2>
              <p className="text-[15px] text-slate-500">
                Use your assigned credentials to access your workflow with live data.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Input
                ref={usernameRef}
                label="Username"
                icon={<UserRound size={18} />}
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); clearError(); }}
                placeholder="Enter your username"
                autoComplete="username"
              />

              <div className="relative">
                <Input
                  label="Password"
                  icon={<ShieldCheck size={18} />}
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearError(); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 focus:outline-none p-1 rounded-md"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <div className="bg-[#DC2626]/10 text-[#DC2626] p-3 rounded-[10px] text-[13px] font-medium flex items-center gap-2 border border-[#DC2626]/20">
                  <ShieldCheck size={16} />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full mt-2"
                icon={<Fingerprint size={18} />}
                isLoading={isLoading}
                disabled={!username.trim() || !password.trim()}
              >
                Sign In
              </Button>
            </form>

            <div className="mt-8 flex justify-center">
              <span className="flex items-center gap-2 text-[12px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-[#E5E7EB]">
                <Activity size={14} className="text-[#16A34A]" />
                DWES v1.0.0 Enterprise
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
