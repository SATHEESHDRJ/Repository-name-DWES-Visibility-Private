import { useState, useEffect, useCallback, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { usersApi } from '../../../services/api';
import { useAuthStore } from '../../../store/useAuthStore';
import Modal from '../../../components/Modal';
import { InputField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';
import {
  Pencil, KeyRound, Lock, Unlock, Trash2, Search, Plus, User, UserCog,
  CheckCircle2, UserX, Phone, Calendar, Hash,
} from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';

const ROLES = ['system_admin', 'ops_director', 'prod_supervisor', 'qaqc_engineer', 'wiring_technician'];

const ROLE_LABELS: Record<string, string> = {
  system_admin: 'System Admin',
  ops_director: 'Ops Director',
  prod_supervisor: 'Supervisor',
  qaqc_engineer: 'QA/QC Engineer',
  wiring_technician: 'Technician',
};

function initials(name: string | null | undefined) {
  return (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '??';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtLogin(iso: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return fmtDate(iso);
}

function roleBadgeClass(role: string) {
  const map: Record<string, string> = {
    system_admin: 'bg-red-50 text-red-600 border-red-200',
    ops_director: 'bg-purple-50 text-purple-600 border-purple-200',
    prod_supervisor: 'bg-blue-50 text-blue-600 border-blue-200',
    qaqc_engineer: 'bg-orange-50 text-orange-600 border-orange-200',
    wiring_technician: 'bg-green-50 text-green-600 border-green-200',
  };
  return map[role] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

const EMPTY_NEW = {
  full_name: '', username: '', password: '', confirm: '',
  role: 'wiring_technician', employee_id: '', whatsapp_number: '',
};

type EditForm = {
  full_name: string;
  role: string;
  employee_id: string;
  whatsapp_number: string;
};

function editFormFromUser(user: any): EditForm {
  return {
    full_name: user.full_name,
    role: user.role,
    employee_id: user.employee_id || '',
    whatsapp_number: user.whatsapp_number || '',
  };
}

function normalizeUsers(data: unknown): any[] {
  return Array.isArray(data) ? data : [];
}

export default function UserMgmtTab() {
  const dialog = useAppDialog();
  const token = useAuthStore(s => s.token);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok');

  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [editData, setEditData] = useState<EditForm>({ full_name: '', role: '', employee_id: '', whatsapp_number: '' });
  const [resetUser, setResetUser] = useState<any | null>(null);
  const [deleteUser, setDeleteUser] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ ...EMPTY_NEW });
  const [saving, setSaving] = useState(false);

  const flash = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setMsg(text); setMsgTone(tone);
    setTimeout(() => setMsg(''), 4000);
  };

  const load = useCallback(async () => {
    const authToken = token || localStorage.getItem('dwes_token');
    if (!authToken) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await usersApi.list();
      setUsers(normalizeUsers(data));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      console.error('[UserMgmt] load failed', { status, err });
      setUsers([]);
      flash(
        status === 403
          ? 'Not authorized to load users — sign out and sign in again as System Admin.'
          : status === 401
            ? 'Session expired — please sign in again.'
            : 'Could not load users. Check that the backend is running, then refresh.',
        'err',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = users
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (u.full_name || '').toLowerCase().includes(q)
        || (u.username || '').toLowerCase().includes(q)
        || (u.employee_id || '').toLowerCase().includes(q);
    });

  const countByRole = (role: string) => users.filter(u => u.role === role).length;

  const openUserDetails = (user: any) => {
    // Defer one frame so the opening click cannot immediately hit the overlay
    requestAnimationFrame(() => {
      setDetailUser(user);
      setEditData(editFormFromUser(user));
    });
  };

  const openResetPassword = (user: any) => {
    requestAnimationFrame(() => setResetUser(user));
  };

  const openDeleteUser = (user: any) => {
    requestAnimationFrame(() => setDeleteUser(user));
  };

  const openAddUser = () => {
    setNewUser({ ...EMPTY_NEW });
    requestAnimationFrame(() => setAddOpen(true));
  };

  const closeUserDetails = () => {
    setDetailUser(null);
  };

  const handleEdit = async () => {
    if (!detailUser) return;
    setSaving(true);
    try {
      await usersApi.update(detailUser.id, {
        full_name: editData.full_name, role: editData.role,
        employee_id: editData.employee_id, whatsapp_number: editData.whatsapp_number,
      });
      flash(`Updated ${detailUser.username}`);
      closeUserDetails();
      load();
    } catch { flash('Failed to update user', 'err'); }
    finally { setSaving(false); }
  };

  const handleReset = async (password: string) => {
    if (!resetUser) return false;
    setSaving(true);
    try {
      await usersApi.resetPassword(resetUser.id, password);
      flash(`Password reset for ${resetUser.username}`);
      setResetUser(null);
      return true;
    } catch { flash('Failed to reset password', 'err'); return false; }
    finally { setSaving(false); }
  };

  const handleToggle = async (user: any) => {
    const ok = await dialog.confirm({
      title: user.is_active ? 'Block User' : 'Activate User',
      message: user.is_active
        ? `Block ${user.full_name}? They will be unable to log in until reactivated.`
        : `Activate ${user.full_name}? They will regain login access.`,
      tone: user.is_active ? 'warning' : 'info',
      confirmText: user.is_active ? 'Block' : 'Activate',
    });
    if (!ok) return;
    try {
      await usersApi.toggleStatus(user.id);
      flash(`${user.is_active ? 'Blocked' : 'Activated'} ${user.username}`);
      if (detailUser?.id === user.id) closeUserDetails();
      load();
    } catch { flash('Failed to update status', 'err'); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setSaving(true);
    try {
      const result = await usersApi.remove(deleteUser.id);
      if (result?.deactivated) {
        flash(`Blocked ${deleteUser.username} — cannot delete (has sessions/assignments on record)`);
      } else {
        flash(`Deleted ${deleteUser.username}`);
      }
      setDeleteUser(null);
      if (detailUser?.id === deleteUser.id) closeUserDetails();
      load();
    } catch { flash('Failed to delete user', 'err'); }
    finally { setSaving(false); }
  };

  const handleAdd = async () => {
    if (!newUser.full_name || !newUser.username || newUser.password.length < 6 || newUser.password !== newUser.confirm) return;
    setSaving(true);
    try {
      await usersApi.create({ full_name: newUser.full_name, username: newUser.username, password: newUser.password, role: newUser.role, employee_id: newUser.employee_id, whatsapp_number: newUser.whatsapp_number || '' });
      flash(`Created user ${newUser.username}`);
      setAddOpen(false);
      setNewUser({ ...EMPTY_NEW });
      load();
    } catch (e: any) {
      flash(e?.response?.data?.message || 'Failed to create user', 'err');
    }
    finally { setSaving(false); }
  };

  const modals = (
    <>
      {detailUser && (
        <UserDetailsModal
          user={detailUser}
          editData={editData}
          setEditData={setEditData}
          saving={saving}
          onClose={closeUserDetails}
          onSave={handleEdit}
          onResetPassword={() => openResetPassword(detailUser)}
          onToggleStatus={() => handleToggle(detailUser)}
          onDelete={() => openDeleteUser(detailUser)}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          saving={saving}
          onClose={() => setResetUser(null)}
          onReset={handleReset}
        />
      )}

      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          saving={saving}
          onClose={() => setDeleteUser(null)}
          onConfirm={handleDelete}
        />
      )}

      {addOpen && (
        <AddUserModal
          newUser={newUser}
          setNewUser={setNewUser}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onCreate={handleAdd}
        />
      )}
    </>
  );

  if (loading) {
    return (
      <>
        <div className="empty-state"><p className="empty-text">Loading users...</p></div>
        {modals}
      </>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="h-scroll-strip flex-1 pb-1">
          <button className={`tab-btn ${roleFilter === 'all' ? 'active' : ''}`} onClick={() => setRoleFilter('all')} type="button">
            All ({users.length})
          </button>
          {ROLES.map(role => (
            <button key={role} className={`tab-btn ${roleFilter === role ? 'active' : ''}`} onClick={() => setRoleFilter(role)} type="button">
              {ROLE_LABELS[role]} ({countByRole(role)})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full tablet-port:w-auto shrink-0">
          <Input
            icon={<Search />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name / ID"
            className="flex-1 min-w-0 tablet-port:w-[240px] tablet-port:flex-none"
          />
          <button className="btn-primary" onClick={openAddUser} type="button">
            <Plus size={16} />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {msg && <div className={msgTone === 'err' ? 'flash-err' : 'flash-ok'}>{msg}</div>}

      {/* User table */}
      <div className="border border-[#E2E8F0] rounded-[12px] bg-white shadow-sm flex flex-col mt-4 min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-white z-10 shadow-[0_2px_0_#E2E8F0]">
              <tr>
                <th className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] py-[12px] px-[16px] w-[160px]">Username</th>
                <th className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] py-[12px] px-[16px]">Full Name</th>
                <th className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] py-[12px] px-[16px] w-[180px]">Role</th>
                <th className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] py-[12px] px-[16px] w-[120px]">Status</th>
                <th className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] py-[12px] px-[16px] w-[140px]">Last Login</th>
                <th className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] py-[12px] px-[16px] w-[140px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <Search size={40} className="text-slate-400" strokeWidth={1} />
                      <div className="text-[14px]">
                        {users.length === 0
                          ? 'No users loaded. If this is unexpected, sign out and sign in again as System Admin.'
                          : 'No users found matching your filters.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((user, idx) => (
                  <tr
                    key={user.id}
                    onClick={() => openUserDetails(user)}
                    className={`h-[52px] cursor-pointer hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'} ${!user.is_active ? 'opacity-75' : ''}`}
                  >
                    <td className="px-[16px] py-[8px] text-[14px] font-mono font-medium text-slate-900 truncate">
                      @{user.username}
                    </td>
                    <td className="px-[16px] py-[8px]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[12px] font-bold text-slate-600 flex-shrink-0">
                          {initials(user.full_name)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[14px] font-medium text-slate-800 truncate">{user.full_name}</span>
                          <span className="text-[11px] text-slate-500 truncate">{user.employee_id || 'No ID'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-[16px] py-[8px]">
                      <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${roleBadgeClass(user.role)}`}>
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-[16px] py-[8px]">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border
                        ${user.is_active ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-300'}
                      `}>
                        {user.is_active ? <CheckCircle2 size={12} /> : <UserX size={12} />}
                        {user.is_active ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-[16px] py-[8px] text-[13px] text-slate-500 whitespace-nowrap">
                      {fmtLogin(user.last_login)}
                    </td>
                    <td className="px-[16px] py-[8px]">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <RowActionBtn icon={<Pencil size={16} strokeWidth={1.5} />} title="View / Edit" onClick={() => openUserDetails(user)} action="edit" />
                        <RowActionBtn icon={<KeyRound size={16} strokeWidth={1.5} />} title="Reset Password" onClick={() => openResetPassword(user)} action="reset" />
                        <RowActionBtn
                          icon={user.is_active ? <Lock size={16} strokeWidth={1.5} /> : <Unlock size={16} strokeWidth={1.5} />}
                          title={user.is_active ? 'Block User' : 'Activate User'}
                          onClick={() => handleToggle(user)}
                          action={user.is_active ? 'block' : 'activate'}
                        />
                        <RowActionBtn icon={<Trash2 size={16} strokeWidth={1.5} />} title="Delete User" onClick={() => openDeleteUser(user)} action="delete" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modals}
    </div>
  );
}

function RoleSelectField({ label, value, onChange, icon }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: ReactNode;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          title={label}
          className={`form-select ${icon ? 'pl-10' : ''}`}
        >
          {ROLES.map(role => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function RowActionBtn({ icon, title, onClick, action }: {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  action: 'edit' | 'reset' | 'delete' | 'block' | 'activate';
}) {
  return (
    <button
      title={title}
      type="button"
      onClick={onClick}
      className={`btn-action btn-action--icon btn-action--${action}`}
    >
      {icon}
    </button>
  );
}

function UserDetailsModal({ user, editData, setEditData, saving, onClose, onSave, onResetPassword, onToggleStatus, onDelete }: {
  user: any;
  editData: EditForm;
  setEditData: Dispatch<SetStateAction<EditForm>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onResetPassword: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      title="User Details"
      onClose={onClose}
      size="lg"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onResetPassword} className="btn-action btn-action--reset">
              <KeyRound size={16} />
              Reset Password
            </button>
            <button type="button" onClick={onToggleStatus} className={`btn-action ${user.is_active ? 'btn-action--block' : 'btn-action--activate'}`}>
              {user.is_active ? <Lock size={16} /> : <Unlock size={16} />}
              {user.is_active ? 'Block' : 'Activate'}
            </button>
            <button type="button" onClick={onDelete} className="btn-action btn-action--delete">
              <Trash2 size={16} />
              Delete
            </button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="button" onClick={onSave} disabled={saving || !editData.full_name} className="btn-primary">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-5">
        {/* Profile header */}
        <div className="flex items-start gap-4 p-4 rounded-[12px] border border-[#E2E8F0] bg-gradient-to-br from-slate-50 to-white">
          <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center text-[18px] font-bold text-slate-600 shrink-0">
            {initials(user.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold text-slate-900 truncate">{user.full_name}</div>
            <div className="text-[14px] font-mono text-blue-700 mt-0.5">@{user.username}</div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${roleBadgeClass(user.role)}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border
                ${user.is_active ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
                {user.is_active ? <CheckCircle2 size={12} /> : <UserX size={12} />}
                {user.is_active ? 'Active' : 'Blocked'}
              </span>
            </div>
          </div>
        </div>

        {/* Read-only metadata */}
        <div className="grid grid-cols-1 tablet-port:grid-cols-2 gap-3">
          <MetaChip icon={<Calendar size={16} />} label="Last login" value={fmtLogin(user.last_login)} />
          <MetaChip icon={<Hash size={16} />} label="User ID" value={`${String(user.id).slice(0, 8)}…`} mono />
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-1 tablet-port:grid-cols-2 gap-4">
          <InputField
            label="Full Name *"
            icon={<User size={16} />}
            value={editData.full_name}
            onChange={v => setEditData(d => ({ ...d, full_name: v }))}
            placeholder="Full name"
          />
          <div className="form-group">
            <label className="form-label">Username</label>
            <div className="form-input bg-slate-50 text-slate-500 font-mono cursor-default select-none">
              @{user.username}
            </div>
          </div>
          <InputField
            label="Employee ID"
            icon={<Hash size={16} />}
            value={editData.employee_id}
            onChange={v => setEditData(d => ({ ...d, employee_id: v }))}
            placeholder="EMP-001"
          />
          <RoleSelectField
            label="Role"
            icon={<UserCog size={16} />}
            value={editData.role}
            onChange={v => setEditData(d => ({ ...d, role: v }))}
          />
          <div className="col-span-2">
            <InputField
              label="WhatsApp Number"
              icon={<Phone size={16} />}
              value={editData.whatsapp_number}
              onChange={v => setEditData(d => ({ ...d, whatsapp_number: v }))}
              placeholder="+971 50 000 0000"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MetaChip({ icon, label, value, mono }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] border border-[#E2E8F0] bg-white">
      <div className="text-slate-400 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`text-[13px] font-medium text-slate-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, saving, onClose, onReset }: {
  user: any;
  saving: boolean;
  onClose: () => void;
  onReset: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (password.length < 6) { setError('Minimum password length is 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    const ok = await onReset(password);
    if (ok) setDone(true);
  };

  return (
    <Modal
      title={`Reset Password — ${user.full_name}`}
      onClose={onClose}
      footer={!done ? (
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving || password.length < 6 || password !== confirm} className="btn-warning">
            {saving ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      ) : (
        <div className="flex justify-end w-full">
          <button type="button" onClick={onClose} className="btn-primary">Done</button>
        </div>
      )}
    >
      {!done ? (
        <div className="flex flex-col gap-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-[10px] text-[13px] text-amber-700">
            Setting a new password for <strong>{user.full_name}</strong> (@{user.username}).
          </div>
          <InputField label="New Password" icon={<Lock size={16} />} type="password" value={password} onChange={setPassword} placeholder="Min. 6 characters" />
          <InputField label="Confirm Password" icon={<Lock size={16} />} type="password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" />
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium rounded-[10px]">{error}</div>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={48} className="text-green-500" />
          <div className="text-[16px] font-bold text-slate-800">Password reset</div>
          <div className="text-[13px] text-slate-500">{user.full_name} can now log in with the new password.</div>
        </div>
      )}
    </Modal>
  );
}

function DeleteUserModal({ user, saving, onClose, onConfirm }: {
  user: any;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Delete User"
      onClose={onClose}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={saving} className="btn-danger">
            {saving ? 'Deleting…' : 'Delete User'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 p-4 rounded-[12px] border border-red-200 bg-red-50">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-red-800">Permanently remove this account?</div>
            <div className="text-[13px] text-red-700 mt-1 leading-relaxed">
              Delete <strong>{user.full_name}</strong> (@{user.username})?
              Users with session or assignment history may be deactivated instead of deleted.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AddUserModal({ newUser, setNewUser, saving, onClose, onCreate }: {
  newUser: typeof EMPTY_NEW;
  setNewUser: Dispatch<SetStateAction<typeof EMPTY_NEW>>;
  saving: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const valid = newUser.full_name && newUser.username && newUser.password.length >= 6 && newUser.password === newUser.confirm;

  return (
    <Modal
      title="Add New User"
      onClose={onClose}
      size="lg"
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={onCreate} disabled={saving || !valid} className="btn-primary">
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 tablet-port:grid-cols-2 gap-4">
          <InputField label="Full Name *" icon={<User size={16} />} value={newUser.full_name} onChange={v => setNewUser(u => ({ ...u, full_name: v }))} placeholder="Full name" />
          <InputField label="Username *" icon={<User size={16} />} value={newUser.username} onChange={v => setNewUser(u => ({ ...u, username: v.toLowerCase().trim() }))} placeholder="username" />
          <InputField label="Password *" icon={<Lock size={16} />} type="password" value={newUser.password} onChange={v => setNewUser(u => ({ ...u, password: v }))} placeholder="Min 6 characters" />
          <InputField label="Confirm Password *" icon={<Lock size={16} />} type="password" value={newUser.confirm} onChange={v => setNewUser(u => ({ ...u, confirm: v }))} placeholder="Repeat password" />
          <RoleSelectField label="Role *" icon={<UserCog size={16} />} value={newUser.role} onChange={v => setNewUser(u => ({ ...u, role: v }))} />
          <InputField label="Employee ID" icon={<Hash size={16} />} value={newUser.employee_id} onChange={v => setNewUser(u => ({ ...u, employee_id: v }))} placeholder="EMP-001" />
        </div>
        <InputField label="WhatsApp Number" icon={<Phone size={16} />} value={newUser.whatsapp_number} onChange={v => setNewUser(u => ({ ...u, whatsapp_number: v }))} placeholder="+971 50 000 0000" />
        {newUser.confirm && newUser.password !== newUser.confirm && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium rounded-[10px]">Passwords do not match</div>
        )}
      </div>
    </Modal>
  );
}
