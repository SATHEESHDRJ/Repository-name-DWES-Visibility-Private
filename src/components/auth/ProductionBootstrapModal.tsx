import { useState } from 'react';
import Modal from '../Modal';
import { Fingerprint, Lock, Save } from '../ui/icons';
import { usersApi, authApi } from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';
import { useEnrollBiometric } from '../../hooks/useBiometric';
import type { BootstrapStatus } from '../../types';

interface Props {
  bootstrap: BootstrapStatus;
  onComplete: () => void;
}

export default function ProductionBootstrapModal({ bootstrap, onComplete }: Props) {
  const user = useAuthStore(s => s.user);
  const patchBootstrap = useAuthStore(s => s.patchBootstrap);
  const applyBootstrap = useAuthStore(s => s.applyBootstrap);
  const clearBootstrap = useAuthStore(s => s.clearBootstrap);
  const { enroll, enrolling, error: enrollError } = useEnrollBiometric();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stepPassword = bootstrap.needs_password_rotation;
  const stepWebAuthn = !stepPassword && bootstrap.needs_webauthn_enrollment;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await authApi.login(user.username, currentPassword);
      await usersApi.update(user.id, { password: newPassword });
      patchBootstrap({ needs_password_rotation: false });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      setPasswordError(ax.response?.data?.message ?? 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnroll = async () => {
    const ok = await enroll();
    if (ok) {
      patchBootstrap({ needs_webauthn_enrollment: false });
    }
  };

  const [deferring, setDeferring] = useState(false);
  const [deferError, setDeferError] = useState<string | null>(null);

  const handleDeferWebAuthn = async () => {
    setDeferError(null);
    setDeferring(true);
    try {
      const data = await authApi.deferWebAuthnBootstrap();
      applyBootstrap(data.bootstrap);
      if (!data.bootstrap?.required) {
        clearBootstrap();
        onComplete();
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      setDeferError(ax.response?.data?.message ?? 'Could not continue without fingerprint.');
    } finally {
      setDeferring(false);
    }
  };

  if (!bootstrap.required) {
    onComplete();
    return null;
  }

  if (!stepPassword && !stepWebAuthn) {
    onComplete();
    return null;
  }

  return (
    <Modal
      title={stepPassword ? 'Change your password' : 'Enroll fingerprint sign-in'}
      subtitle={
        stepPassword
          ? 'Production security requires a new password before you continue.'
          : 'Enroll WebAuthn when ready, or continue with password only for now.'
      }
      icon={stepPassword ? <Lock /> : <Fingerprint />}
      size="sm"
      onClose={() => { /* forced — no dismiss */ }}
      closeOnBackdrop={false}
      closeOnEscape={false}
      footer={
        stepPassword ? (
          <button
            type="submit"
            form="bootstrap-password-form"
            className="btn-primary"
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving…' : 'Update password'}
          </button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:justify-end">
            <button
              type="button"
              className="btn-secondary order-2 sm:order-1"
              onClick={handleDeferWebAuthn}
              disabled={enrolling || deferring}
            >
              {deferring ? 'Continuing…' : 'Continue with password only'}
            </button>
            <button
              type="button"
              className="btn-primary order-1 sm:order-2"
              onClick={handleEnroll}
              disabled={enrolling || deferring}
            >
              {enrolling ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>
                  <Fingerprint size={18} />
                  Enroll fingerprint
                </>
              )}
            </button>
          </div>
        )
      }
    >
      {stepPassword ? (
        <form id="bootstrap-password-form" onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted">
            <Lock size={18} aria-hidden />
            <span>Signed in as <strong>{user?.username}</strong></span>
          </div>
          <div>
            <label className="form-label" htmlFor="bootstrap-current">Current password</label>
            <div className="field-with-icon">
              <span className="field-lead-icon"><Lock size={18} /></span>
              <input
                id="bootstrap-current"
                type="password"
                className="form-input w-full"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="bootstrap-new">New password</label>
            <div className="field-with-icon">
              <span className="field-lead-icon"><Lock size={18} /></span>
              <input
                id="bootstrap-new"
                type="password"
                className="form-input w-full"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="bootstrap-confirm">Confirm new password</label>
            <div className="field-with-icon">
              <span className="field-lead-icon"><Lock size={18} /></span>
              <input
                id="bootstrap-confirm"
                type="password"
                className="form-input w-full"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          {passwordError && (
            <p className="form-error" role="alert">{passwordError}</p>
          )}
        </form>
      ) : (
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
            <Fingerprint size={32} className="text-blue-600" />
          </div>
          <p className="text-sm text-muted">
            Use your device fingerprint or security key when ready. You can enroll now or continue with password only and set up fingerprint later.
          </p>
          {enrollError && (
            <p className="form-error w-full text-left" role="alert">{enrollError}</p>
          )}
          {deferError && (
            <p className="form-error w-full text-left" role="alert">{deferError}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
