import { useState } from 'react';
import Modal from '../Modal';
import { Fingerprint } from '../ui/icons';

interface Props {
  onEnroll:  (deviceLabel?: string) => Promise<boolean>;
  onSkip:    () => void;
  enrolling: boolean;
  error:     string | null;
}

export default function EnrollBiometricModal({ onEnroll, onSkip, enrolling, error }: Props) {
  const [label, setLabel] = useState('');

  return (
    <Modal
      title="Enable fingerprint sign-in?"
      subtitle="Next time, sign in instantly with your fingerprint — no password needed on this device."
      size="sm"
      onClose={onSkip}
      closeOnBackdrop={!enrolling}
      closeOnEscape={!enrolling}
      footer={(
        <>
          <button
            type="button"
            onClick={onSkip}
            disabled={enrolling}
            className="btn-secondary"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => onEnroll(label.trim() || undefined)}
            disabled={enrolling}
            className="btn-primary"
          >
            {enrolling ? (
              <span className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <Fingerprint size={18} />
                Enable fingerprint
              </>
            )}
          </button>
        </>
      )}
    >
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <Fingerprint size={32} className="text-blue-600" />
        </div>

        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Device name (optional — e.g. Xiaomi Pad)"
          className="form-input w-full"
          aria-label="Device name"
        />

        {error && (
          <p className="form-error w-full text-left" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
