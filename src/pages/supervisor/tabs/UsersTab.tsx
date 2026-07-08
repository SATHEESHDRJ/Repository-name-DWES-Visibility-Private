import { useState, useEffect } from 'react';
import { usersApi, supervisorApi } from '../../../services/api';
import Modal from '../../../components/Modal';
import { InputField, SelectField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  User, Lock, UserCog, Search, Plus, Pencil, KeyRound, ShieldCheck, ShieldOff,
  CheckCircle2, UserX, Users,
} from '../../../components/ui/icons';

const TECHNICIAN_ROLE = 'wiring_technician';

const ROLES: { value: string; label: string }[] = [
  { value: 'wiring_technician', label: 'Wiring Technician' },
  { value: 'qaqc_engineer',     label: 'QA/QC Engineer'    },
  { value: 'prod_supervisor',   label: 'Supervisor'        },
  { value: 'ops_director',      label: 'Director'          },
  { value: 'system_admin',      label: 'System Admin'      },
];

function roleBadge(role: string) {
  const map: Record<string, string> = {
    system_admin:      'bg-purple-100 text-purple-700 border-purple-200',
    ops_director:      'bg-indigo-100 text-indigo-700 border-indigo-200',
    prod_supervisor:   'bg-blue-100 text-blue-700 border-blue-200',
    qaqc_engineer:     'bg-teal-100 text-teal-700 border-teal-200',
    wiring_technician: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const label = ROLES.find(r => r.value === role)?.label ?? role;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${map[role] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

function statusBadge(isActive: boolean) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
      {isActive ? <CheckCircle2 size={12} /> : <UserX size={12} />}
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// Active (non-completed) assignment statuses count as "assigned to a panel"
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'in_progress', 'paused']);

function AssignedPanelBadge({ panels }: { panels?: string[] }) {
  if (!panels || panels.length === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 text-slate-500 border-slate-200">
        Unassigned
      </span>
    );
  }
  const extra = panels.length - 1;
  const title = panels.join(', ');
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 max-w-[180px] px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-200"
    >
      <span className="shrink-0">Assigned ·</span>
      <span className="truncate">{panels[0]}</span>
      {extra > 0 && <span className="shrink-0">+{extra}</span>}
    </span>
  );
}

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Team tab: single trigger → one modal ──────────────────────────────────────

export default function UsersTab() {
  const perms = usePermissions();
  const [open, setOpen] = useState(false);

  if (!perms.canViewUserList) return null;

  const readOnly = perms.canViewUsersReadOnly;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 p-8">
      <div className="w-[72px] h-[72px] rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
        <Users size={32} className="text-blue-600" strokeWidth={1.5} />
      </div>

      <div className="text-center max-w-xs">
        <p className="text-[16px] font-semibold text-slate-800 mb-1.5">
          {readOnly ? 'User Directory' : 'Team Management'}
        </p>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          {readOnly
            ? 'View user accounts across the organization.'
            : 'Create, edit, activate/deactivate, and reset passwords for technicians on your team.'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2.5 h-[56px] px-8 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-[15px] rounded-[12px] transition-colors shadow-sm"
      >
        <Users size={20} strokeWidth={1.5} />
        {readOnly ? 'View Users' : 'User Management'}
      </button>

      {open && <TeamManagementModal onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── Team management modal (full user workflow in one place) ───────────────────

export function TeamManagementModal({ onClose }: { onClose: () => void }) {
  const perms = usePermissions();
  const readOnly = perms.canViewUsersReadOnly;
  const techniciansOnly = perms.canManageTeamTechnicians;
  const showActions = !readOnly;
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [panelsByTech, setPanelsByTech] = useState<Map<number, string[]>>(new Map());

  useEffect(() => {
    supervisorApi.allPanels()
      .then((assignments: any[]) => {
        const map = new Map<number, string[]>();
        for (const a of assignments) {
          if (!ACTIVE_ASSIGNMENT_STATUSES.has(a.status)) continue;
          const name = a.panel_display_name || a.panel_name || a.frame_id;
          if (!name) continue;
          const list = map.get(a.technician_id) ?? [];
          if (!list.includes(name)) list.push(name);
          map.set(a.technician_id, list);
        }
        setPanelsByTech(map);
      })
      .catch(() => { /* badge simply shows Unassigned if panels can't load */ });
  }, []);

  const load = () => {
    setLoading(true);
    usersApi.list()
      .then(data => { setUsers(data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const scoped = techniciansOnly
    ? users.filter(u => u.role === TECHNICIAN_ROLE)
    : users;

  const filtered = scoped.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (!techniciansOnly && u.role.toLowerCase().includes(q))
    );
  });

  const modalTitle = readOnly ? 'User Directory' : 'User Management';
  const emptyMessage = filter
    ? 'No users match your search.'
    : techniciansOnly
      ? 'No technicians found.'
      : 'No users found.';

  return (
    <>
      <Modal
        title={modalTitle}
        onClose={onClose}
        size="wide"
        footer={
          <div className="flex items-center justify-between w-full gap-4">
            <span className="text-[13px] text-slate-500">
              {loading ? 'Loading…' : `${filtered.length} user${filtered.length !== 1 ? 's' : ''}${filter ? ' matched' : ''}`}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="pj-btn-secondary min-w-[100px]"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={techniciansOnly ? 'Search name or username…' : 'Search name, username or role…'}
                title="Search users"
                className="w-full h-11 pl-10 pr-4 text-sm border border-[#E2E8F0] rounded-[10px] bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              />
            </div>
            {showActions && perms.canCreateUsers && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="pj-btn-primary shrink-0"
              >
                <Plus size={18} strokeWidth={1.5} />
                <span>New Technician</span>
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-slate-500">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm border border-[#E2E8F0] rounded-[12px] bg-[#FAFAFA]">
              {emptyMessage}
            </div>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block border border-[#E2E8F0] rounded-[12px] bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[min(480px,62vh)]">
                  <table className="pj-table w-full text-left border-collapse min-w-[560px]">
                    <thead className="sticky top-0 bg-white z-10 border-b border-[#E2E8F0]">
                      <tr>
                        <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-4">Name</th>
                        <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-4 w-[116px]">Username</th>
                        {!techniciansOnly && (
                          <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-4 w-[120px]">Role</th>
                        )}
                        <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-4 w-[96px]">Status</th>
                        <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-4 w-[150px]">Panel</th>
                        {showActions && (
                          <th className="text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-4 w-[84px] text-right" />
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {filtered.map((user, idx) => (
                        <TeamUserRow
                          key={user.id}
                          user={user}
                          idx={idx}
                          techniciansOnly={techniciansOnly}
                          showActions={showActions}
                          panels={panelsByTech.get(user.id)}
                          canManage={perms.canManageTargetUser(user)}
                          onEdit={() => setEditUser(user)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden flex flex-col gap-3 max-h-[min(520px,65vh)] overflow-y-auto pr-0.5">
                {filtered.map(user => (
                  <TeamUserCard
                    key={user.id}
                    user={user}
                    techniciansOnly={techniciansOnly}
                    showActions={showActions}
                    panels={panelsByTech.get(user.id)}
                    canManage={perms.canManageTargetUser(user)}
                    onEdit={() => setEditUser(user)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>

      {showCreate && (
        <UserFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={load}
          techniciansOnly={techniciansOnly}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          panels={panelsByTech.get(editUser.id)}
          onClose={() => setEditUser(null)}
          onSaved={load}
          techniciansOnly={techniciansOnly}
        />
      )}
    </>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────

function TeamUserRow({ user, idx, techniciansOnly, showActions, panels, canManage, onEdit }: {
  user: any;
  idx: number;
  techniciansOnly: boolean;
  showActions: boolean;
  panels?: string[];
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <tr
      className={`transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'} ${!user.is_active ? 'opacity-65' : 'hover:bg-blue-50/60'}`}
    >
      <td className="px-4 py-2.5 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-[12px] font-bold text-slate-500">
            {userInitials(user.full_name)}
          </div>
          <span className="text-sm font-semibold text-slate-900 truncate" title={user.full_name}>
            {user.full_name}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-[13px] text-blue-700 truncate">@{user.username}</td>
      {!techniciansOnly && (
        <td className="px-4 py-2.5">{roleBadge(user.role)}</td>
      )}
      <td className="px-4 py-2.5">{statusBadge(user.is_active)}</td>
      <td className="px-4 py-2.5">
        {user.role === TECHNICIAN_ROLE
          ? <AssignedPanelBadge panels={panels} />
          : <span className="text-slate-300 text-[12px]">—</span>}
      </td>
      {showActions && (
        <td className="px-4 py-2.5 text-right">
          {canManage && (
            <button
              type="button"
              onClick={onEdit}
              className="btn-action btn-action--edit"
            >
              <Pencil size={14} />
              Edit
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function TeamUserCard({ user, techniciansOnly, showActions, panels, canManage, onEdit }: {
  user: any;
  techniciansOnly: boolean;
  showActions: boolean;
  panels?: string[];
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <div className={`rounded-[12px] border border-[#E2E8F0] bg-white p-4 shadow-sm ${!user.is_active ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-[13px] font-bold text-slate-500">
          {userInitials(user.full_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 truncate">{user.full_name}</div>
          <div className="font-mono text-[13px] text-blue-700 mt-0.5 truncate">@{user.username}</div>
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {!techniciansOnly && roleBadge(user.role)}
            {statusBadge(user.is_active)}
            {user.role === TECHNICIAN_ROLE && <AssignedPanelBadge panels={panels} />}
          </div>
        </div>
        {showActions && canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="btn-action btn-action--edit shrink-0"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

// ── Unified edit user modal ───────────────────────────────────────────────────

function EditUserModal({ user, panels, onClose, onSaved, techniciansOnly }: {
  user: any;
  panels?: string[];
  onClose: () => void;
  onSaved: () => void;
  techniciansOnly: boolean;
}) {
  const dialog = useAppDialog();
  const perms = usePermissions();
  const canManage = perms.canManageTargetUser(user);

  const [form, setForm] = useState({
    full_name:       user.full_name       || '',
    employee_id:     user.employee_id     || '',
    role:            user.role            || 'wiring_technician',
    whatsapp_number: user.whatsapp_number || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [statusError, setStatusError] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState('');

  const [isActive, setIsActive] = useState(user.is_active);

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSaveProfile = async () => {
    if (!form.full_name || !form.employee_id) {
      setProfileError('Full name and employee ID are required.');
      return;
    }
    setSavingProfile(true);
    setProfileError('');
    try {
      const payload: Record<string, string> = {
        full_name: form.full_name,
        employee_id: form.employee_id,
        whatsapp_number: form.whatsapp_number,
      };
      if (!techniciansOnly) payload.role = form.role;
      await usersApi.update(user.id, payload);
      onSaved();
      onClose();
    } catch (e: any) {
      setProfileError(e?.response?.data?.message || 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleStatus = async () => {
    const ok = await dialog.confirm({
      title: isActive ? 'Deactivate User' : 'Activate User',
      message: isActive
        ? `Deactivate ${form.full_name}? They will be unable to log in until reactivated.`
        : `Activate ${form.full_name}? They will regain login access.`,
      tone: isActive ? 'warning' : 'info',
      confirmText: isActive ? 'Deactivate' : 'Activate',
    });
    if (!ok) return;
    setTogglingStatus(true);
    setStatusError('');
    try {
      await usersApi.toggleStatus(user.id);
      setIsActive((prev: boolean) => !prev);
      onSaved();
    } catch (e: any) {
      setStatusError(e?.response?.data?.message || 'Status update failed');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleResetPassword = async () => {
    if (password.length < 6) { setResetError('Minimum password length is 6 characters.'); return; }
    if (password !== confirm) { setResetError('Passwords do not match.'); return; }
    setResetting(true);
    setResetError('');
    try {
      await usersApi.resetPassword(user.id, password);
      setResetDone(true);
      setPassword('');
      setConfirm('');
    } catch (e: any) {
      setResetError(e?.response?.data?.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  return (
    <Modal
      title={`Edit User — ${user.full_name}`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="pj-btn-secondary">
            Close
          </button>
          {canManage && (
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="pj-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* User summary header */}
        <div className="flex items-start gap-4 p-4 rounded-[12px] border border-[#E2E8F0] bg-gradient-to-br from-slate-50 to-white">
          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-[15px] font-bold text-slate-600 shrink-0">
            {userInitials(user.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold text-slate-900 truncate">{user.full_name}</div>
            <div className="text-[13px] font-mono text-blue-700 mt-0.5">@{user.username}</div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {roleBadge(user.role)}
              {statusBadge(isActive)}
              {user.role === TECHNICIAN_ROLE && <AssignedPanelBadge panels={panels} />}
            </div>
          </div>
        </div>

        {/* Profile details */}
        <section className="flex flex-col gap-4">
          <SectionHeading title="Profile Details" subtitle="Update name, employee ID, and contact info." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              label="Full Name *"
              icon={<User size={16} />}
              value={form.full_name}
              onChange={set('full_name')}
              placeholder="e.g. Ahmed Al Farsi"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 uppercase tracking-[0.06em]">Username</label>
              <div className="h-[44px] px-3 flex items-center text-[14px] font-mono border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-slate-500 select-none">
                @{user.username}
              </div>
            </div>
            <InputField
              label="Employee ID *"
              icon={<User size={16} />}
              value={form.employee_id}
              onChange={set('employee_id')}
              placeholder="e.g. EMP-025"
            />
            {techniciansOnly ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-slate-600 uppercase tracking-[0.06em]">Role</label>
                <div className="h-[44px] px-3 flex items-center text-[14px] border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-slate-500 select-none">
                  Wiring Technician
                </div>
              </div>
            ) : (
              <SelectField
                label="Role"
                icon={<UserCog size={16} />}
                value={form.role}
                onChange={set('role')}
                options={ROLES.map(r => r.value)}
                placeholder="Select role"
              />
            )}
          </div>
          <InputField
            label="WhatsApp Number"
            icon={<User size={16} />}
            value={form.whatsapp_number}
            onChange={set('whatsapp_number')}
            placeholder="+971 50 000 0000"
          />
          {profileError && <ErrorBanner message={profileError} />}
        </section>

        {/* Account status */}
        {canManage && (
          <section className="flex flex-col gap-4 pt-2 border-t border-[#F1F5F9]">
            <SectionHeading
              title="Account Status"
              subtitle={isActive
                ? 'User can log in and access assigned work.'
                : 'User is blocked from logging in.'}
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[12px] border border-[#E2E8F0] bg-[#FAFAFA]">
              <div className="flex items-center gap-3">
                {isActive
                  ? <ShieldCheck size={20} className="text-green-600 shrink-0" />
                  : <ShieldOff size={20} className="text-slate-400 shrink-0" />}
                <div>
                  <div className="text-[14px] font-semibold text-slate-800">
                    {isActive ? 'Account is active' : 'Account is inactive'}
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {isActive
                      ? 'Deactivate to revoke login access immediately.'
                      : 'Activate to restore login access.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                className={`btn-action shrink-0 ${isActive ? 'btn-action--block' : 'btn-action--activate'}`}
              >
                {togglingStatus ? 'Updating…' : isActive ? 'Deactivate Account' : 'Activate Account'}
              </button>
            </div>
            {statusError && <ErrorBanner message={statusError} />}
          </section>
        )}

        {/* Reset password */}
        {canManage && (
          <section className="flex flex-col gap-4 pt-2 border-t border-[#F1F5F9]">
            <SectionHeading
              title="Reset Password"
              subtitle="Set a new password. The current password is never shown."
            />
            {resetDone ? (
              <div className="flex items-center gap-3 p-4 rounded-[12px] border border-green-200 bg-green-50">
                <CheckCircle2 size={20} className="text-green-600 shrink-0" />
                <div>
                  <div className="text-[14px] font-semibold text-green-800">Password updated</div>
                  <div className="text-[12px] text-green-700 mt-0.5">
                    {form.full_name} can now log in with the new password.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setResetDone(false)}
                  className="ml-auto text-[12px] font-semibold text-green-700 hover:text-green-900 shrink-0"
                >
                  Set another
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField
                    label="New Password"
                    icon={<Lock size={16} />}
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Min. 6 characters"
                  />
                  <InputField
                    label="Confirm Password"
                    icon={<Lock size={16} />}
                    type="password"
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="Re-enter password"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetting || password.length < 6 || password !== confirm}
                    className="btn-action btn-action--reset"
                  >
                    <KeyRound size={16} />
                    {resetting ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
                {resetError && <ErrorBanner message={resetError} />}
              </>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-[14px] font-bold text-slate-800">{title}</h3>
      <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium rounded-[10px]">
      {message}
    </div>
  );
}

// ── Create user modal ─────────────────────────────────────────────────────────

function UserFormModal({ mode, user, onClose, onSaved, techniciansOnly = false }: {
  mode: 'create' | 'edit'; user?: any; onClose: () => void; onSaved: () => void; techniciansOnly?: boolean;
}) {
  const [form, setForm] = useState({
    username:        user?.username        || '',
    full_name:       user?.full_name       || '',
    employee_id:     user?.employee_id     || '',
    role:            user?.role            || 'wiring_technician',
    password:        '',
    whatsapp_number: user?.whatsapp_number || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.username || !form.full_name || !form.employee_id) {
      setError('Username, full name and employee ID are required.'); return;
    }
    if (mode === 'create' && !form.password) {
      setError('Password is required for new users.'); return;
    }
    setSaving(true); setError('');
    try {
      if (mode === 'create') {
        await usersApi.create({
          username: form.username, full_name: form.full_name, password: form.password,
          employee_id: form.employee_id, role: techniciansOnly ? 'wiring_technician' : form.role,
          whatsapp_number: form.whatsapp_number,
        });
      } else {
        const payload: Record<string, string> = {
          full_name: form.full_name,
          employee_id: form.employee_id,
          whatsapp_number: form.whatsapp_number,
        };
        if (!techniciansOnly) payload.role = form.role;
        await usersApi.update(user.id, payload);
      }
      onSaved(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === 'create' ? (techniciansOnly ? 'New Technician' : 'New User') : `Edit — ${user?.full_name}`}
      onClose={onClose}
      size="lg"
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="pj-btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="pj-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : mode === 'create' ? (techniciansOnly ? 'Create Technician' : 'Create User') : 'Save Changes'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Full Name *" icon={<User size={16} />} value={form.full_name} onChange={set('full_name')} placeholder="e.g. Ahmed Al Farsi" />
          {mode === 'create' ? (
            <InputField label="Username *" icon={<User size={16} />} value={form.username} onChange={set('username')} placeholder="e.g. tech25" />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 uppercase tracking-[0.06em]">Username</label>
              <div className="h-[44px] px-3 flex items-center text-[14px] font-mono border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-slate-500 select-none">
                {form.username}
              </div>
            </div>
          )}
          <InputField label="Employee ID *" icon={<User size={16} />} value={form.employee_id} onChange={set('employee_id')} placeholder="e.g. EMP-025" />
          {techniciansOnly ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 uppercase tracking-[0.06em]">Role</label>
              <div className="h-[44px] px-3 flex items-center text-[14px] border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-slate-500 select-none">
                Wiring Technician
              </div>
            </div>
          ) : (
            <SelectField label="Role" icon={<UserCog size={16} />} value={form.role} onChange={set('role')}
              options={ROLES.map(r => r.value)} placeholder="Select role" />
          )}
        </div>

        <InputField label="WhatsApp Number" icon={<User size={16} />} value={form.whatsapp_number}
          onChange={set('whatsapp_number')} placeholder="+971 50 000 0000" />

        {mode === 'create' && (
          <InputField label="Password *" icon={<Lock size={16} />} type="password" value={form.password}
            onChange={set('password')} placeholder="Min. 6 characters" />
        )}

        {error && <ErrorBanner message={error} />}
      </div>
    </Modal>
  );
}
