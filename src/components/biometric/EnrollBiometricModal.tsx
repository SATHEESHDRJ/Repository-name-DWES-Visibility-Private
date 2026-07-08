import { useState } from 'react';
import { Fingerprint, X } from '../ui/icons';

interface Props {
  onEnroll:  (deviceLabel?: string) => Promise<boolean>;
  onSkip:    () => void;
  enrolling: boolean;
  error:     string | null;
}

export default function EnrollBiometricModal({ onEnroll, onSkip, enrolling, error }: Props) {
  const [label, setLabel] = useState('');

  return (
    <div className="modal-overlay z-[210]">
      <div className="modal-box-sm p-6 tablet-land:p-8">

        <div className="flex justify-end mb-2">
          <button
            onClick={onSkip}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
            <Fingerprint size={32} className="text-blue-600" />
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Enable fingerprint sign-in?
          </h2>
          <p className="text-sm text-slate-500 mt-2 mb-6 leading-relaxed">
            Next time, sign in instantly with your fingerprint — no password needed
            on this device.
          </p>

          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Device name (optional — e.g. Xiaomi Pad)"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
          />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 mb-4 text-left">
              {error}
            </p>
          )}

          <button
            onClick={() => onEnroll(label.trim() || undefined)}
            disabled={enrolling}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl py-3 font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 mb-3 shadow-[0_4px_14px_rgba(37,99,235,0.35)]"
          >
            {enrolling ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <Fingerprint size={18} />
                Enable fingerprint
              </>
            )}
          </button>

          <button
            onClick={onSkip}
            disabled={enrolling}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
