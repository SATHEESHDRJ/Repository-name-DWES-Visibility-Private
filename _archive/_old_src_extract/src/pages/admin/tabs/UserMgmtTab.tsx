import { useState, useEffect } from 'react';
import { adminApi, usersApi } from '../../../services/api';
import Modal from '../../../components/Modal';

const ROLES = ['system_admin', 'ops_director', 'prod_supervisor', 'qaqc_engineer', 'wiring_technician'];

const ROLE_LABELS: Record<string, string> = {
  system_admin: 'System Admin',
  ops_director: 'Ops Director',
  prod_supervisor: 'Supervisor',
  qaqc_engineer: 'QA/QC Engineer',
  wiring_technician: 'Technician',
};

function initials(name: string) {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '??';
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

const EMPTY_NEW = {
  full_name: '', username: '', password: '', confirm: '',
  role: 'wiring_technician', employee_id: '',
};

export default function UserMgmtTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok');

  // modals
  const [editModal, setEditModal] = useState<any | null>(null);
  const [editData, setEditData] = useState({ full_name: '', role: '', employee_id: '' });
  const [resetModal, setResetModal] = useState<any | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [deleteModal, setDeleteModal] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ ...EMPTY_NEW });
  const [saving, setSaving] = useState(false);

  const flash = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setMsg(text); setMsgTone(tone);
    setTimeout(() => setMsg(''), 4000);
  };

  const load = () => {
    setLoading(true);
    adminApi.allUsers().then(data => { setUsers(data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = users
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()) || (u.employee_id || '').toLowerCase().includes(search.toLowerCase()));

  const countByRole = (role: string) => users.filter(u => u.role === role).length;

  // handlers
  const handleEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await usersApi.update(editModal.id, { full_name: editData.full_name, role: editData.role, employee_id: editData.employee_id });
      flash(`Updated ${editModal.username}`);
      setEditModal(null);
      load();
    } catch { flash('Failed to update user', 'err'); }
    finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!resetModal || resetPw.length < 6 || resetPw !== resetConfirm) return;
    setSaving(true);
    try {
      await usersApi.resetPassword(resetModal.id, resetPw);
      flash(`Password reset for ${resetModal.username}`);
      setResetModal(null);
      setResetPw(''); setResetConfirm('');
    } catch { flash('Failed to reset password', 'err'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (user: any) => {
    try {
      await usersApi.toggleStatus(user.id);
      flash(`${user.is_active ? 'Blocked' : 'Activated'} ${user.username}`);
      load();
    } catch { flash('Failed to update status', 'err'); }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setSaving(true);
    try {
      await usersApi.remove(deleteModal.id);
      flash(`Deleted ${deleteModal.username}`);
      setDeleteModal(null);
      load();
    } catch { flash('Failed to delete user', 'err'); }
    finally { setSaving(false); }
  };

  const handleAdd = async () => {
    if (!newUser.full_name || !newUser.username || newUser.password.length < 6 || newUser.password !== newUser.confirm) return;
    setSaving(true);
    try {
      await usersApi.create({ full_name: newUser.full_name, username: newUser.username, password: newUser.password, role: newUser.role, employee_id: newUser.employee_id });
      flash(`Created user ${newUser.username}`);
      setAddOpen(false);
      setNewUser({ ...EMPTY_NEW });
      load();
    } catch (e: any) {
      flash(e?.response?.data?.message || 'Failed to create user', 'err');
    }
    finally { setSaving(false); }
  };

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading users...</div></div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="um-toolbar">
        <div className="um-filter-row">
          <button className={`um-filter-chip ${roleFilter === 'all' ? 'is-active' : ''}`} onClick={() => setRoleFilter('all')} type="button">
            All ({users.length})
          </button>
          {ROLES.map(role => (
            <button key={role} className={`um-filter-chip ${roleFilter === role ? 'is-active' : ''}`} data-role={role} onClick={() => setRoleFilter(role)} type="button">
              {ROLE_LABELS[role]} ({countByRole(role)})
            </button>
          ))}
        </div>

        <div className="um-toolbar-right">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / username / ID" className="dwes-input um-search" />
          <button className="um-add-btn" onClick={() => { setNewUser({ ...EMPTY_NEW }); setAddOpen(true); }} type="button">
            + Add User
          </button>
        </div>
      </div>

      {msg && <div className={`um-flash ${msgTone === 'err' ? 'is-error' : 'is-ok'}`}>{msg}</div>}

      {/* User cards / table */}
      <div className="um-list">
        {filtered.length === 0 && <div className="dwes-empty-state"><div className="dwes-empty-copy">No users found.</div></div>}
        {filtered.map(user => (
          <div key={user.id} className={`um-row ${!user.is_active ? 'is-blocked' : ''}`}>
            {/* Avatar */}
            <div className="um-avatar" data-role={user.role}>{initials(user.full_name)}</div>

            {/* Identity */}
            <div className="um-identity">
              <span className="um-name">{user.full_name}</span>
              <span className="um-username">@{user.username}</span>
            </div>

            {/* Role badge */}
            <span className="um-role-badge" data-role={user.role}>{ROLE_LABELS[user.role] || user.role}</span>

            {/* Employee ID */}
            <span className="um-empid">{user.employee_id || '—'}</span>

            {/* Status */}
            <span className={`um-status-badge ${user.is_active ? 'is-active' : 'is-blocked'}`}>
              {user.is_active ? 'Active' : 'Blocked'}
            </span>

            {/* Last login */}
            <span className="um-last-login">{fmtLogin(user.last_login)}</span>

            {/* Actions */}
            <div className="um-actions">
              <button className="um-btn um-btn-edit" type="button" onClick={() => { setEditModal(user); setEditData({ full_name: user.full_name, role: user.role, employee_id: user.employee_id || '' }); }}>Edit</button>
              <button className="um-btn um-btn-reset" type="button" onClick={() => { setResetModal(user); setResetPw(''); setResetConfirm(''); }}>Reset PW</button>
              <button className={`um-btn ${user.is_active ? 'um-btn-block' : 'um-btn-activate'}`} type="button" onClick={() => handleToggle(user)}>
                {user.is_active ? 'Block' : 'Activate'}
              </button>
              <button className="um-btn um-btn-delete" type="button" onClick={() => setDeleteModal(user)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Edit Modal ── */}
      {editModal && (
        <Modal title={`Edit User — ${editModal.username}`} onClose={() => setEditModal(null)} width={460}
          footer={<>
            <button className="dwes-button dwes-button-neutral" onClick={() => setEditModal(null)} type="button">Cancel</button>
            <button className="dwes-button dwes-button-primary" onClick={handleEdit} disabled={saving || !editData.full_name} type="button">{saving ? 'Saving...' : 'Save Changes'}</button>
          </>}
        >
          <div className="stack-grid">
            <div className="dwes-input-group">
              <label className="dwes-label">Full Name</label>
              <input className="dwes-input" value={editData.full_name} onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="dwes-input-group">
              <label className="dwes-label">Employee ID</label>
              <input className="dwes-input" value={editData.employee_id} onChange={e => setEditData(d => ({ ...d, employee_id: e.target.value }))} placeholder="EMP-001" />
            </div>
            <div className="dwes-input-group">
              <label className="dwes-label">Role</label>
              <select className="dwes-select" title="Role" value={editData.role} onChange={e => setEditData(d => ({ ...d, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Reset Password Modal ── */}
      {resetModal && (
        <Modal title={`Reset Password — ${resetModal.username}`} onClose={() => setResetModal(null)} width={440}
          footer={<>
            <button className="dwes-button dwes-button-neutral" onClick={() => setResetModal(null)} type="button">Cancel</button>
            <button className="dwes-button dwes-button-warning" onClick={handleReset} disabled={saving || resetPw.length < 6 || resetPw !== resetConfirm} type="button">{saving ? 'Saving...' : 'Reset Password'}</button>
          </>}
        >
          <div className="stack-grid">
            <div className="dwes-input-group">
              <label className="dwes-label">New Password</label>
              <input type="password" className="dwes-input" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
            <div className="dwes-input-group">
              <label className="dwes-label">Confirm Password</label>
              <input type="password" className="dwes-input" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="Repeat new password" />
              {resetConfirm && resetPw !== resetConfirm && <span className="um-pw-mismatch">Passwords do not match</span>}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Modal ── */}
      {deleteModal && (
        <Modal title="Delete User" onClose={() => setDeleteModal(null)} width={420}
          footer={<>
            <button className="dwes-button dwes-button-neutral" onClick={() => setDeleteModal(null)} type="button">Cancel</button>
            <button className="dwes-button dwes-button-danger" onClick={handleDelete} disabled={saving} type="button">{saving ? 'Deleting...' : 'Delete User'}</button>
          </>}
        >
          <p className="um-delete-warn">
            Delete user <strong>{deleteModal.username}</strong>?
            This cannot be undone and will remove all session history for this user.
          </p>
        </Modal>
      )}

      {/* ── Add New User Modal ── */}
      {addOpen && (
        <Modal title="Add New User" onClose={() => setAddOpen(false)} width={500}
          footer={<>
            <button className="dwes-button dwes-button-neutral" onClick={() => setAddOpen(false)} type="button">Cancel</button>
            <button className="dwes-button dwes-button-primary" onClick={handleAdd}
              disabled={saving || !newUser.full_name || !newUser.username || newUser.password.length < 6 || newUser.password !== newUser.confirm}
              type="button">{saving ? 'Creating...' : 'Create User'}</button>
          </>}
        >
          <div className="stack-grid">
            <div className="um-field-row">
              <div className="dwes-input-group">
                <label className="dwes-label">Full Name *</label>
                <input className="dwes-input" value={newUser.full_name} onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="dwes-input-group">
                <label className="dwes-label">Username *</label>
                <input className="dwes-input" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value.toLowerCase().trim() }))} placeholder="username" />
              </div>
            </div>
            <div className="um-field-row">
              <div className="dwes-input-group">
                <label className="dwes-label">Password *</label>
                <input type="password" className="dwes-input" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} placeholder="Min 6 characters" />
              </div>
              <div className="dwes-input-group">
                <label className="dwes-label">Confirm Password *</label>
                <input type="password" className="dwes-input" value={newUser.confirm} onChange={e => setNewUser(u => ({ ...u, confirm: e.target.value }))} placeholder="Repeat password" />
              </div>
            </div>
            <div className="um-field-row">
              <div className="dwes-input-group">
                <label className="dwes-label">Role *</label>
                <select className="dwes-select" title="Role" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div className="dwes-input-group">
                <label className="dwes-label">Employee ID</label>
                <input className="dwes-input" value={newUser.employee_id} onChange={e => setNewUser(u => ({ ...u, employee_id: e.target.value }))} placeholder="EMP-001" />
              </div>
            </div>
            {newUser.confirm && newUser.password !== newUser.confirm && <span className="um-pw-mismatch">Passwords do not match</span>}
          </div>
        </Modal>
      )}
    </div>
  );
}
