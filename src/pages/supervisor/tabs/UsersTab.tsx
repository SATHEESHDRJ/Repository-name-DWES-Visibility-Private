import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { usersApi, supervisorApi, projectsApi, techApi } from '../../../services/api';
import type { Project } from '../../../types';
import type { FramePanel } from '../../../components/assignment/ProjectPanelSelect';
import Modal from '../../../components/Modal';
import { InputField, SelectField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';
import DeleteConfirmModal, { type DeleteScopeId } from '../../../components/ui/DeleteConfirmModal';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  User, Lock, UserCog, Search, Plus, Pencil, KeyRound, ShieldCheck, ShieldOff,
  CheckCircle2, UserX, Users, Trash2, UserPlus, FolderKanban, PanelTop,
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
    <span className={`um-badge ${map[role] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

function statusBadge(isActive: boolean) {
  return (
    <span className={`um-badge gap-0.5 ${isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
      {isActive ? <CheckCircle2 size={10} className="shrink-0" /> : <UserX size={10} className="shrink-0" />}
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// Active (non-completed) assignment statuses count as "assigned to a panel"
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'in_progress', 'paused']);

function AssignedPanelBadge({ panels }: { panels?: string[] }) {
  if (!panels || panels.length === 0) {
    return (
      <span className="um-badge bg-slate-100 text-slate-500 border-slate-200">
        Unassigned
      </span>
    );
  }
  const extra = panels.length - 1;
  const title = panels.join(', ');
  return (
    <span
      title={title}
      className="um-badge bg-amber-50 text-amber-700 border-amber-200"
    >
      <span className="break-words [overflow-wrap:anywhere]">{panels[0]}</span>
      {extra > 0 && <span className="shrink-0 ml-0.5">+{extra}</span>}
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

/** Percentage column widths — legacy helper removed; list uses responsive cards only. */

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

  const reloadPanelBadges = useCallback(() => {
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

  useEffect(() => {
    reloadPanelBadges();
  }, [reloadPanelBadges]);

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
        icon={<Users />}
        onClose={onClose}
        size="team"
        typography="user-management"
        bodyClassName="modal-body-flush"
        footer={
          <div className="um-footer">
            <span className="um-footer-stat">
              {loading ? 'Loading…' : `${filtered.length} user${filtered.length !== 1 ? 's' : ''}${filter ? ' matched' : ''}`}
            </span>
            <button type="button" onClick={onClose} className="pj-btn-secondary min-w-[96px]">
              Close
            </button>
          </div>
        }
      >
        <div className="um-shell">
          <div className="um-toolbar">
            <div className="um-search">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={techniciansOnly ? 'Search name or username…' : 'Search name, username or role…'}
                title="Search users"
                aria-label="Search users"
              />
            </div>
            {showActions && perms.canCreateUsers && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="pj-btn-primary shrink-0 !min-h-[40px]"
              >
                <Plus size={16} strokeWidth={1.5} />
                <span>New Technician</span>
              </button>
            )}
          </div>

          {!loading && filtered.length > 0 && (
            <div className="um-summary">
              <span className="um-summary-chip">{filtered.filter(u => u.is_active).length} active</span>
              <span className="um-summary-chip">{filtered.filter(u => !u.is_active).length} inactive</span>
              {(techniciansOnly || filtered.some(u => u.role === TECHNICIAN_ROLE)) && (
                <span className="um-summary-chip">
                  {filtered.filter(u => u.role === TECHNICIAN_ROLE && panelsByTech.has(u.id)).length} on panel
                </span>
              )}
            </div>
          )}

          {loading ? (
            <div className="um-empty">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="um-empty um-empty--bordered">{emptyMessage}</div>
          ) : (
            <div className="um-user-grid">
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
          onAssignmentsChanged={reloadPanelBadges}
          techniciansOnly={techniciansOnly}
        />
      )}
    </>
  );
}

// ── User card (responsive list) ───────────────────────────────────────────────

function TeamUserCard({ user, techniciansOnly, showActions, panels, canManage, onEdit }: {
  user: any;
  techniciansOnly: boolean;
  showActions: boolean;
  panels?: string[];
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <article className={`um-user-card ${!user.is_active ? 'is-inactive' : ''}`}>
      <div className="um-user-card-body">
        <div className="um-user-identity">
          <div className="um-user-avatar">{userInitials(user.full_name)}</div>
          <div className="um-user-text min-w-0">
            <h3 className="um-user-name" title={user.full_name}>{user.full_name}</h3>
            <p className="um-user-username">@{user.username}</p>
            {user.employee_id && (
              <p className="um-user-emp">{user.employee_id}</p>
            )}
          </div>
        </div>
        <div className="um-user-badges">
          {!techniciansOnly && roleBadge(user.role)}
          {statusBadge(user.is_active)}
          {user.role === TECHNICIAN_ROLE && <AssignedPanelBadge panels={panels} />}
        </div>
      </div>
      {showActions && canManage && (
        <button
          type="button"
          onClick={onEdit}
          className="um-user-edit-btn"
          aria-label={`Edit ${user.full_name}`}
        >
          <Pencil size={15} strokeWidth={1.75} />
          <span>Edit User</span>
        </button>
      )}
    </article>
  );
}

// ── Comprehensive user management (opened from list Edit) ───────────────────────

function EditUserModal({ user, panels, onClose, onSaved, onAssignmentsChanged, techniciansOnly }: {
  user: any;
  panels?: string[];
  onClose: () => void;
  onSaved: () => void;
  onAssignmentsChanged: () => void;
  techniciansOnly: boolean;
}) {
  const dialog = useAppDialog();
  const perms = usePermissions();
  const canManage = perms.canManageTargetUser(user);

  const [form, setForm] = useState({
    username:        user.username        || '',
    full_name:       user.full_name       || '',
    employee_id:     user.employee_id     || '',
    role:            user.role            || 'wiring_technician',
    whatsapp_number: user.whatsapp_number || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState('');

  const [isActive, setIsActive] = useState(user.is_active);

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSaveProfile = async () => {
    if (!form.full_name?.trim() || !form.employee_id?.trim() || !form.username?.trim()) {
      setProfileError('Username, full name, and employee ID are required.');
      return;
    }
    setSavingProfile(true);
    setProfileError('');
    try {
      const payload: Record<string, string> = {
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        employee_id: form.employee_id.trim(),
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

  const handleDeleteUser = () => {
    setDeleteError('');
    setShowDeleteConfirm(true);
  };

  const confirmDeleteUser = async (_scope: DeleteScopeId) => {
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await usersApi.remove(user.id);
      onSaved();
      setShowDeleteConfirm(false);
      onClose();
      if (result?.deactivated) {
        await dialog.alert({
          title: 'User Deactivated',
          message: result.message || 'User was deactivated because delete is not allowed while history exists.',
          tone: 'info',
        });
      }
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={`Edit User — ${user.full_name}`}
      icon={<Pencil />}
      onClose={onClose}
      size="wide"
      typography="user-management"
      bodyClassName="modal-body-flush"
      footer={
        <div className="um-footer">
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
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      }
    >
      <div className="um-edit">
        <header className="um-edit-hero">
          <div className="um-user-avatar um-user-avatar--lg">{userInitials(user.full_name)}</div>
          <div className="um-edit-hero-text min-w-0">
            <h2 className="um-edit-hero-name">{user.full_name}</h2>
            <p className="um-user-username">@{user.username}</p>
            <div className="um-user-badges mt-2">
              {roleBadge(user.role)}
              {statusBadge(isActive)}
              {user.role === TECHNICIAN_ROLE && <AssignedPanelBadge panels={panels} />}
            </div>
          </div>
        </header>

        <div className="um-edit-grid">
          <UmSection icon={<User size={18} />} title="User Details" subtitle="Name, username, employee ID, role, and contact.">
            <div className="um-field-grid">
              <InputField
                label="Full Name *"
                icon={<User size={16} />}
                value={form.full_name}
                onChange={set('full_name')}
                placeholder="e.g. Ahmed Al Farsi"
              />
              <InputField
                label="Username *"
                icon={<User size={16} />}
                value={form.username}
                onChange={set('username')}
                placeholder="e.g. tech25"
              />
              <InputField
                label="Employee ID *"
                icon={<User size={16} />}
                value={form.employee_id}
                onChange={set('employee_id')}
                placeholder="e.g. EMP-025"
              />
              {techniciansOnly ? (
                <div className="um-readonly-field">
                  <span className="um-field-label">Role</span>
                  <div className="um-readonly-value">Wiring Technician</div>
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
          </UmSection>

          {canManage && (
            <UmSection icon={<Lock size={18} />} title="Credentials" subtitle="Set a new password — current password is never shown.">
              {resetDone ? (
                <div className="um-success-banner">
                  <CheckCircle2 size={18} className="shrink-0 text-green-600" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[13px] text-green-800">Password updated</div>
                    <div className="text-[12px] text-green-700">{form.full_name} can log in with the new password.</div>
                  </div>
                  <button type="button" onClick={() => setResetDone(false)} className="um-link-btn">Set another</button>
                </div>
              ) : (
                <>
                  <div className="um-field-grid">
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
                  <div className="um-section-actions">
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetting || password.length < 6 || password !== confirm}
                      className="pj-btn-primary !min-h-[40px]"
                    >
                      <KeyRound size={16} />
                      {resetting ? 'Resetting…' : 'Reset Password'}
                    </button>
                  </div>
                  {resetError && <ErrorBanner message={resetError} />}
                </>
              )}
            </UmSection>
          )}

          {canManage && user.role === TECHNICIAN_ROLE && (
            <PanelAssignmentSection
              userId={user.id}
              onChanged={() => {
                onAssignmentsChanged();
                onSaved();
              }}
            />
          )}

          {canManage && (
            <UmSection icon={<ShieldCheck size={18} />} title="Account Status" subtitle={isActive ? 'User can log in and access assigned work.' : 'User is blocked from logging in.'}>
              <div className="um-status-card">
                <div className="um-status-copy">
                  {isActive
                    ? <ShieldCheck size={20} className="text-green-600 shrink-0" />
                    : <ShieldOff size={20} className="text-slate-400 shrink-0" />}
                  <div>
                    <div className="text-[14px] font-semibold text-slate-800">
                      {isActive ? 'Account is active' : 'Account is inactive'}
                    </div>
                    <div className="text-[12px] text-slate-500 mt-0.5">
                      {isActive ? 'Deactivate to revoke login access.' : 'Activate to restore login access.'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleStatus}
                  disabled={togglingStatus}
                  className={`um-status-btn ${isActive ? 'is-danger' : 'is-ok'}`}
                >
                  {togglingStatus ? 'Updating…' : isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              {statusError && <ErrorBanner message={statusError} />}
            </UmSection>
          )}

          {canManage && (
            <UmSection icon={<Trash2 size={18} />} title="Delete User" subtitle="Permanent removal when no history exists; otherwise deactivated." variant="danger">
              <div className="um-danger-card">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-red-800">Remove {form.full_name}</div>
                  <div className="text-[12px] text-red-700/80 mt-0.5">Cannot be undone when deletion succeeds.</div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="pj-btn-danger-ghost shrink-0 disabled:opacity-50"
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                  <span>{deleting ? 'Deleting…' : 'Delete User'}</span>
                </button>
              </div>
              {deleteError && <ErrorBanner message={deleteError} />}
            </UmSection>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          title="Delete User"
          subtitle="Permanent removal when allowed; otherwise deactivated."
          typography="user-management"
          resourceKind="user"
          itemLabel={form.full_name || form.username}
          fields={[
            { label: 'Username', value: `@${form.username}` },
            { label: 'Role', value: ROLES.find(r => r.value === form.role)?.label || form.role },
          ]}
          sections={[
            {
              id: 'impact',
              title: 'Impact',
              icon: 'users',
              items: [
                'Account removed when no assignment/session history exists',
                'If history exists, the account is deactivated instead of deleted',
              ],
            },
            {
              id: 'retained',
              title: 'Preserved when deactivated',
              icon: 'shield',
              defaultExpanded: false,
              badge: 'history',
              items: [
                'Assignment and session history stay for audit',
                'Wiring progress and project data are not wiped',
              ],
            },
          ]}
          scopes={[
            {
              id: 'item_only',
              label: 'Delete / deactivate selected user',
              description: 'Does not delete project files or wiring records.',
            },
          ]}
          defaultScope="item_only"
          backup={{
            status: 'skipped',
            note: 'User delete does not run a project file backup.',
          }}
          warningText={`Delete ${form.full_name} (@${form.username})? If the account has assignment or session history, it will be deactivated instead of permanently removed.`}
          confirmCheckboxLabel={`I confirm deleting or deactivating “${form.full_name}”.`}
          confirmButtonLabel="Delete User"
          deleting={deleting}
          error={deleteError}
          onClose={() => { if (!deleting) setShowDeleteConfirm(false); }}
          onConfirm={confirmDeleteUser}
        />
      )}
    </Modal>
  );
}

function PanelAssignmentSection({ userId, onChanged }: { userId: number; onChanged: () => void }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCode, setProjectCode] = useState('');
  const [panelId, setPanelId] = useState('');
  const [panels, setPanels] = useState<FramePanel[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: number; panelLabel: string } | null>(null);
  const [error, setError] = useState('');

  const loadAssignments = useCallback(() => {
    supervisorApi.allPanels()
      .then((all: any[]) => {
        setAssignments(
          all.filter(a => a.technician_id === userId && ACTIVE_ASSIGNMENT_STATUSES.has(a.status)),
        );
      })
      .catch(() => setAssignments([]));
  }, [userId]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!projectCode) {
      setPanels([]);
      setPanelId('');
      return;
    }
    setLoadingPanels(true);
    projectsApi.frames(projectCode)
      .then(data => {
        setPanels(data as FramePanel[]);
        setPanelId('');
      })
      .catch(() => setPanels([]))
      .finally(() => setLoadingPanels(false));
  }, [projectCode]);

  const handleAssign = async () => {
    if (!projectCode || !panelId) {
      setError('Select a project and panel to assign.');
      return;
    }
    setAssigning(true);
    setError('');
    try {
      await supervisorApi.assignFrame({
        project_code: projectCode,
        frame_id: panelId,
        technician_id: userId,
      });
      loadAssignments();
      onChanged();
      setProjectCode('');
      setPanelId('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = (assignmentId: number, panelLabel: string) => {
    setPendingRemove({ id: assignmentId, panelLabel });
  };

  const confirmRemoveAssignment = async (_scope: DeleteScopeId) => {
    if (!pendingRemove) return;
    setRemovingId(pendingRemove.id);
    setError('');
    try {
      await techApi.delete(pendingRemove.id);
      setPendingRemove(null);
      loadAssignments();
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not remove assignment');
    } finally {
      setRemovingId(null);
    }
  };

  const selectedProject = projects.find(p => p.code === projectCode);

  return (
    <UmSection icon={<UserCog size={18} />} title="Panel Assignment" subtitle="Assign or remove active panel work for this technician.">
      {assignments.length === 0 ? (
        <p className="um-empty-inline">No active panel assignments.</p>
      ) : (
        <ul className="um-assignment-list">
          {assignments.map(a => {
            const label = a.panel_display_name || a.panel_name || a.frame_id;
            return (
              <li key={a.id} className="um-assignment-item">
                <div className="min-w-0">
                  <div className="um-assignment-panel">{label}</div>
                  <div className="um-assignment-code">{a.project_code}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(a.id, label)}
                  disabled={removingId === a.id}
                  className="um-assignment-remove"
                >
                  {removingId === a.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="um-field-grid">
        <div className="um-native-field">
          <label className="um-field-label">Project</label>
          <div className="field-with-icon">
            <span className="field-lead-icon"><FolderKanban size={18} /></span>
            <select className="form-select w-full" value={projectCode} onChange={e => setProjectCode(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map(p => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="um-native-field">
          <label className="um-field-label">Panel</label>
          <div className="field-with-icon">
          <span className="field-lead-icon"><PanelTop size={18} /></span>
          <select
            className="form-select w-full"
            value={panelId}
            onChange={e => setPanelId(e.target.value)}
            disabled={!projectCode || loadingPanels}
          >
            <option value="">
              {loadingPanels ? 'Loading…' : !projectCode ? 'Select project first' : panels.length === 0 ? 'No panels' : 'Select panel…'}
            </option>
            {panels.map(p => (
              <option key={p.id} value={p.id}>{p.panel_name}</option>
            ))}
          </select>
          </div>
        </div>
      </div>
      {selectedProject && panelId && (
        <p className="um-hint">
          Assigning to <strong>{selectedProject.name}</strong>
          {' · '}
          <strong>{panels.find(p => p.id === panelId)?.panel_name}</strong>
        </p>
      )}
      <div className="um-section-actions">
        <button
          type="button"
          onClick={handleAssign}
          disabled={assigning || !projectCode || !panelId}
          className="pj-btn-primary !min-h-[40px] disabled:opacity-50"
        >
          {assigning ? 'Assigning…' : 'Assign Panel'}
        </button>
      </div>
      {error && <ErrorBanner message={error} />}

      {pendingRemove && (
        <DeleteConfirmModal
          title="Remove Panel Assignment"
          subtitle="Technician loses this panel from active work."
          typography="user-management"
          resourceKind="assignment"
          itemLabel={pendingRemove.panelLabel}
          sections={[
            {
              id: 'removed',
              title: 'Removed',
              icon: 'users',
              items: [
                `Assignment to “${pendingRemove.panelLabel}”`,
                'Technician will no longer see this panel',
              ],
            },
            {
              id: 'retained',
              title: 'Not affected',
              icon: 'shield',
              defaultExpanded: false,
              badge: 'kept',
              items: ['Panel wiring data and project files'],
            },
          ]}
          scopes={[
            {
              id: 'item_only',
              label: 'Delete selected assignment only',
              description: 'Removes this assignment row. Panel history stays.',
            },
          ]}
          defaultScope="item_only"
          backup={{ status: 'skipped', note: 'Assignment removal does not dump the database.' }}
          warningText={`Remove assignment to “${pendingRemove.panelLabel}”? The technician will no longer see this panel.`}
          confirmCheckboxLabel={`I confirm removing the assignment to “${pendingRemove.panelLabel}”.`}
          confirmButtonLabel="Remove Assignment"
          deleting={removingId === pendingRemove.id}
          error={error}
          onClose={() => { if (removingId == null) setPendingRemove(null); }}
          onConfirm={confirmRemoveAssignment}
        />
      )}
    </UmSection>
  );
}

function UmSection({
  icon,
  title,
  subtitle,
  variant,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  variant?: 'danger';
  children: ReactNode;
}) {
  return (
    <section className={`um-section ${variant === 'danger' ? 'um-section--danger' : ''}`}>
      <header className="um-section-head">
        <span className="um-section-icon">{icon}</span>
        <div className="min-w-0">
          <h3 className="um-section-title">{title}</h3>
          <p className="um-section-sub">{subtitle}</p>
        </div>
      </header>
      <div className="um-section-body">{children}</div>
    </section>
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
      icon={mode === 'create' ? <UserPlus /> : <Pencil />}
      onClose={onClose}
      size="lg"
      typography="user-management"
      footer={(
        <div className="um-footer">
          <button type="button" onClick={onClose} className="pj-btn-secondary">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="pj-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {mode === 'create' ? <UserPlus size={16} /> : <Pencil size={16} />}
            {saving ? 'Saving…' : mode === 'create' ? (techniciansOnly ? 'Create Technician' : 'Create User') : 'Save Changes'}
          </button>
        </div>
      )}
    >
      <div className="um-create-form">
        <div className="um-field-grid">
          <InputField label="Full Name *" icon={<User size={16} />} value={form.full_name} onChange={set('full_name')} placeholder="e.g. Ahmed Al Farsi" />
          {mode === 'create' ? (
            <InputField label="Username *" icon={<User size={16} />} value={form.username} onChange={set('username')} placeholder="e.g. tech25" />
          ) : (
            <div className="um-readonly-field">
              <span className="um-field-label">Username</span>
              <div className="um-readonly-value font-mono">{form.username}</div>
            </div>
          )}
          <InputField label="Employee ID *" icon={<User size={16} />} value={form.employee_id} onChange={set('employee_id')} placeholder="e.g. EMP-025" />
          {techniciansOnly ? (
            <div className="um-readonly-field">
              <span className="um-field-label">Role</span>
              <div className="um-readonly-value">Wiring Technician</div>
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
