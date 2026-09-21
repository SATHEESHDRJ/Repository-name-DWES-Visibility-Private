import { useState, useEffect } from 'react';
import { usersApi } from '../../../services/api';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';
import { InputField, SelectField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';

const ROLES = ['wiring_technician', 'qaqc_engineer', 'prod_supervisor', 'ops_director', 'system_admin'];

export default function UsersTab() {
  const dialog = useAppDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [showReset, setShowReset] = useState<any>(null);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    usersApi.list().then(data => {
      setUsers(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggle = async (user: any) => {
    const ok = await dialog.confirm({
      title: `${user.is_active ? 'Disable' : 'Enable'} User`,
      message: `${user.is_active ? 'Disable' : 'Enable'} user ${user.full_name}?`,
      tone: 'warning',
      confirmText: user.is_active ? 'Disable' : 'Enable',
    });
    if (!ok) return;
    await usersApi.toggleStatus(user.id).catch(() => {});
    load();
  };

  const handleDelete = async (user: any) => {
    const ok = await dialog.confirm({
      title: 'Delete User',
      message: `Delete user ${user.full_name}? This cannot be undone.`,
      tone: 'delete',
      confirmText: 'Delete User',
    });
    if (!ok) return;
    await usersApi.remove(user.id).catch(() => {});
    load();
  };

  const filtered = users.filter(user =>
    !filter ||
      user.full_name.toLowerCase().includes(filter.toLowerCase()) ||
      user.username.toLowerCase().includes(filter.toLowerCase()) ||
      user.role.toLowerCase().includes(filter.toLowerCase()),
  );

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading users...</div></div>;

  return (
    <div>
      <div className="table-toolbar">
        <input
          value={filter}
          onChange={event => setFilter(event.target.value)}
          placeholder="Search name, username or role"
          className="dwes-input"
          data-layout="grow"
        />
        <button className="dwes-button dwes-button-primary" onClick={() => setShowCreate(true)} type="button">New User</button>
      </div>

      <div className="dwes-table-wrap">
        <table className="dwes-table">
          <thead>
            <tr>
              {['Name', 'Username', 'Employee ID', 'Role', 'Status', 'Last Login', 'Actions'].map(header => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id}>
                <td className="table-cell-strong">{user.full_name}</td>
                <td className="table-cell-mono table-cell-progress">{user.username}</td>
                <td className="table-cell-mono table-cell-soft">{user.employee_id}</td>
                <td><Badge label={user.role} /></td>
                <td>
                  <span className={`table-status ${user.is_active ? 'is-active' : 'is-inactive'}`}>
                    {user.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="table-cell-soft">{user.last_login ? new Date(user.last_login).toLocaleString() : '--'}</td>
                <td>
                  <div className="touch-action-row">
                    <button className="button-compact" onClick={() => setShowEdit(user)} type="button">Edit</button>
                    <button className="button-compact" onClick={() => setShowReset(user)} type="button">Password</button>
                    <button className="button-compact" onClick={() => handleToggle(user)} type="button">{user.is_active ? 'Disable' : 'Enable'}</button>
                    <button className="button-compact" onClick={() => handleDelete(user)} type="button">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <UserFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={load} />}
      {showEdit && <UserFormModal mode="edit" user={showEdit} onClose={() => setShowEdit(null)} onSaved={load} />}
      {showReset && <ResetPasswordModal user={showReset} onClose={() => setShowReset(null)} />}
    </div>
  );
}

function UserFormModal({ mode, user, onClose, onSaved }: { mode: 'create' | 'edit'; user?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    full_name: user?.full_name || '',
    employee_id: user?.employee_id || '',
    role: user?.role || 'wiring_technician',
    password: '',
    department: user?.department || '',
    email: user?.email || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.username || !form.full_name || !form.employee_id) {
      setError('Username, full name and employee ID are required.');
      return;
    }
    if (mode === 'create' && !form.password) {
      setError('Password is required for new users.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (mode === 'create') {
        await usersApi.create(form);
      } else {
        await usersApi.update(user.id, {
          full_name: form.full_name,
          role: form.role,
          department: form.department,
          email: form.email,
        });
      }
      onSaved();
      onClose();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === 'create' ? 'New User' : `Edit ${user?.full_name}`}
      onClose={onClose}
      width={560}
      footer={(
        <>
          <button className="dwes-button dwes-button-neutral" onClick={onClose} type="button">Cancel</button>
          <button className="dwes-button dwes-button-primary" onClick={handleSave} disabled={saving} type="button">{saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}</button>
        </>
      )}
    >
      <div className="form-grid-2">
        <InputField label="Full Name *" value={form.full_name} onChange={value => setForm(state => ({ ...state, full_name: value }))} />
        <InputField label="Username *" value={form.username} onChange={value => setForm(state => ({ ...state, username: value }))} />
        <InputField label="Employee ID *" value={form.employee_id} onChange={value => setForm(state => ({ ...state, employee_id: value }))} />
        <SelectField label="Role" value={form.role} onChange={value => setForm(state => ({ ...state, role: value }))} options={ROLES} placeholder="Select role" />
      </div>

      <div className="form-grid-2 mt-sm">
        <InputField label="Department" value={form.department} onChange={value => setForm(state => ({ ...state, department: value }))} />
        <InputField label="Email" type="email" value={form.email} onChange={value => setForm(state => ({ ...state, email: value }))} />
      </div>

      {mode === 'create' && (
        <div className="mt-sm">
          <InputField label="Password *" type="password" value={form.password} onChange={value => setForm(state => ({ ...state, password: value }))} />
        </div>
      )}

      {error && <div className="dwes-error mt-sm">{error}</div>}
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (password.length < 6) {
      setError('Minimum password length is 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await usersApi.resetPassword(user.id, password);
      setDone(true);
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Reset Password ${user.full_name}`}
      onClose={onClose}
      footer={!done ? (
        <>
          <button className="dwes-button dwes-button-neutral" onClick={onClose} type="button">Cancel</button>
          <button className="dwes-button dwes-button-warning" onClick={handleReset} disabled={saving} type="button">{saving ? 'Resetting...' : 'Reset Password'}</button>
        </>
      ) : (
        <button className="dwes-button dwes-button-primary" onClick={onClose} type="button">Close</button>
      )}
    >
      {!done ? (
        <>
          <InputField label="New Password" type="password" value={password} onChange={setPassword} />
          <div className="mt-sm">
            <InputField label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          </div>
          {error && <div className="dwes-error mt-sm">{error}</div>}
        </>
      ) : (
        <div className="dwes-empty-state dwes-empty-state-compact">
          <div className="dwes-empty-title">Password reset successful</div>
        </div>
      )}
    </Modal>
  );
}
