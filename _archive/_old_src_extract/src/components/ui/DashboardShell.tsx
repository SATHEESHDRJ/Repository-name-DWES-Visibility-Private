import React, { useEffect, useState } from 'react';
import { LogOut, ChevronRight, Menu, Monitor, MonitorSmartphone, TabletSmartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import type { DeviceProfile } from '../../store/useUIStore';
import { ROLE_LABELS } from '../../types';
import type { UserRole } from '../../types';
import { useAppDialog } from '../AppDialogProvider';

interface NavTab {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface DashboardKpi {
  label: string;
  value: React.ReactNode;
  color?: string;
}

interface DashboardShellProps {
  title: string;
  subtitle: string;
  badge?: string;
  kpis?: DashboardKpi[];
  tabs?: NavTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  children: React.ReactNode;
}

export default function DashboardShell({
  title,
  subtitle,
  badge,
  kpis = [],
  tabs = [],
  activeTab,
  onTabChange,
  children
}: DashboardShellProps) {
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const { user, logout } = useAuthStore();
  const { sidebarExpanded, setSidebarExpanded, deviceProfile, setDeviceProfile } = useUIStore();
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    const ok = await dialog.confirm({
      title: 'Logout',
      message: 'Do you want to sign out from DWES?',
      tone: 'logout',
      confirmText: 'Logout',
    });
    if (!ok) return;
    await logout();
    navigate('/', { replace: true });
  };

  const getDeviceIcon = (profile: DeviceProfile) => {
    if (profile === 'desktop') return <Monitor size={18} />;
    if (profile === 'auto') return <MonitorSmartphone size={18} />;
    return <TabletSmartphone size={18} />;
  };

  const initials = user?.full_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'U';

  const resolveKpiColor = (color?: string) => {
    if (color?.includes('completed')) return 'text-[#16A34A] bg-[#16A34A]/10';
    if (color?.includes('danger')) return 'text-[#DC2626] bg-[#DC2626]/10';
    if (color?.includes('warning') || color?.includes('pending') || color?.includes('one-open')) return 'text-[#F59E0B] bg-[#F59E0B]/10';
    if (color?.includes('source') || color?.includes('progress')) return 'text-[#2563EB] bg-[#2563EB]/10';
    return 'text-slate-600 bg-slate-100';
  };

  return (
    <div className="flex h-full w-full bg-[#F8FAFC] overflow-hidden text-slate-800 font-sans">
      
      {/* SIDEBAR */}
      <aside 
        className={`bg-white border-r border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 z-20
          ${sidebarExpanded ? 'w-[280px]' : 'w-[72px]'}
        `}
      >
        <div className="h-[72px] flex items-center px-4 border-b border-[#E5E7EB] flex-shrink-0">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#2563EB] to-[#1E3A8A] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            W
          </div>
          {sidebarExpanded && (
            <div className="ml-3 flex flex-col overflow-hidden whitespace-nowrap animate-in fade-in zoom-in duration-300">
              <span className="font-bold tracking-wide text-slate-900">DWES</span>
              <span className="text-[11px] text-slate-500 font-medium">Digital Wiring System</span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-2 px-3 overflow-y-auto overflow-x-hidden">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange?.(tab.key)}
              className={`
                flex items-center h-12 rounded-[10px] px-3 transition-colors flex-shrink-0
                ${activeTab === tab.key 
                  ? 'bg-[#2563EB]/10 text-[#2563EB] font-semibold' 
                  : 'text-slate-600 hover:bg-slate-100'
                }
              `}
              title={sidebarExpanded ? undefined : tab.label}
            >
              <div className="flex-shrink-0">{tab.icon}</div>
              {sidebarExpanded && (
                <span className="ml-3 text-[14px] whitespace-nowrap overflow-hidden text-ellipsis">
                  {tab.label}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-[#E5E7EB] flex-shrink-0">
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="w-full h-10 rounded-[10px] flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* HEADER */}
        <header className="h-[72px] bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 flex-shrink-0 z-10 shadow-sm">
          
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium text-[14px]">Home</span>
            <ChevronRight size={16} className="text-slate-300" />
            <span className="text-slate-800 font-semibold text-[14px]">{title}</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-4">
              <span className="text-[13px] font-mono text-slate-500 bg-slate-100 px-3 py-1.5 rounded-[8px]">
                {clock.toLocaleTimeString('en-GB', { hour12: false })}
              </span>
              
              {/* Tablet Switcher */}
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

            <div className="w-px h-8 bg-[#E5E7EB] hidden lg:block" />

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[14px] font-bold text-slate-800 leading-none">
                  {user?.full_name.split(' ').slice(0, 2).join(' ')}
                </span>
                <span className="text-[12px] text-slate-500 mt-1">
                  {ROLE_LABELS[user?.role as UserRole] || user?.role}
                </span>
              </div>
              <div className="w-10 h-10 rounded-[10px] bg-[#F8FAFC] border border-[#E5E7EB] flex items-center justify-center text-[#2563EB] font-bold text-sm">
                {initials}
              </div>
              
              <button 
                onClick={handleLogout}
                title="Logout"
                className="w-10 h-10 ml-2 rounded-[10px] text-slate-400 hover:text-[#DC2626] hover:bg-red-50 flex items-center justify-center transition-colors"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {/* Header Info & KPIs */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-[28px] font-bold tracking-tight text-slate-900">{title}</h1>
                {badge && (
                  <span className="px-3 py-1 bg-[#2563EB]/10 text-[#2563EB] text-[12px] font-bold uppercase tracking-wider rounded-[8px]">
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-[15px] text-slate-500">{subtitle}</p>
            </div>

            {kpis.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {kpis.map((kpi, idx) => (
                  <div key={idx} className="bg-white border border-[#E5E7EB] rounded-[12px] p-3 shadow-sm min-w-[140px] flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center text-[20px] font-bold ${resolveKpiColor(kpi.color)}`}>
                      {kpi.value}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                        {kpi.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Content */}
          <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#E5E7EB] rounded-[16px] shadow-sm overflow-hidden p-6">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
}
