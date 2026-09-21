import { useState } from 'react';
import { authApi, usersApi } from '../../services/api';
import Modal from '../Modal';
import { InputField } from '../ui/TabletFields';
import { useAuthStore } from '../../store/useAuthStore';
import { Lock, User, Phone, CheckCircle2, Save, Check } from '../ui/icons';

export default function MyProfileModal({ onClose }: { onClose: () => void }) {
  const { user, token } = useAuthStore();
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    whatsapp_number: user?.whatsapp_number || '',
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!user) return null;

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError('Full name is required.');
      return;
    }
    if (password && (password.length < 6 || password !== confirm)) {
      setError(password.length < 6 ? 'Password must be at least 6 characters.' : 'Passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, string> = {
        full_name: form.full_name,
        whatsapp_number: form.whatsapp_number,
      };
      if (password) payload.password = password;
      await usersApi.update(user.id, payload);
      const fresh = await authApi.me();
      localStorage.setItem('dwes_user', JSON.stringify(fresh));
      useAuthStore.setState({ user: fresh, token });
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="My Profile"
      icon={<User />}
      onClose={onClose}
      size="lg"
      footer={!done ? (
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
            <Save size={16} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      ) : (
        <div className="flex justify-end w-full">
          <button type="button" onClick={onClose} className="btn-primary">
            <Check size={16} />
            Done
          </button>
        </div>
      )}
    >
      {!done ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Full Name *" icon={<User size={16} />} value={form.full_name} onChange={set('full_name')} placeholder="Your full name" />
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-muted uppercase tracking-[0.06em]">Username</label>
              <div className="h-[44px] px-3 flex items-center text-[14px] font-mono border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-muted select-none">
                {user.username}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-muted uppercase tracking-[0.06em]">Employee ID</label>
              <div className="h-[44px] px-3 flex items-center text-[14px] border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-muted select-none">
                {user.employee_id || '—'}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-muted uppercase tracking-[0.06em]">Role</label>
              <div className="h-[44px] px-3 flex items-center text-[14px] border border-[#E2E8F0] rounded-[10px] bg-slate-50 text-muted select-none">
                Wiring Technician
              </div>
            </div>
          </div>
          <InputField label="WhatsApp Number" icon={<Phone size={16} />} value={form.whatsapp_number}
            onChange={set('whatsapp_number')} placeholder="+971 50 000 0000" />
          <div className="border-t border-[#E2E8F0] pt-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-3">Change Password (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="New Password" icon={<Lock size={16} />} type="password" value={password} onChange={setPassword} placeholder="Min. 6 characters" />
              <InputField label="Confirm Password" icon={<Lock size={16} />} type="password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" />
            </div>
          </div>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium rounded-[10px]">{error}</div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={48} className="text-green-500" />
          <div className="text-[16px] font-bold text-primary">Profile updated</div>
          <div className="text-[13px] text-muted">Your changes have been saved.</div>
        </div>
      )}
    </Modal>
  );
}
