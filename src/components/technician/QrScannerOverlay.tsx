import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, QrCode, Hash, Search } from '../ui/icons';
import { decodeQrFromImage, loadJsQR } from '../../utils/jsqrLoader';

interface Props {
  title?: string;
  subtitle?: string;
  onResult: (data: string) => void;
  onClose: () => void;
}

export default function QrScannerOverlay({
  title = 'Scan Panel QR Code',
  subtitle = 'Point your camera at the physical QR label on the panel',
  onResult,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('Initializing camera…');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        await loadJsQR();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus('Scanning…');

        const tick = async () => {
          if (cancelled || !videoRef.current || !canvasRef.current) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.readyState >= video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const jsQR = window.jsQR;
              if (jsQR) {
                const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                if (result?.data) {
                  stopCamera();
                  onResult(result.data);
                  return;
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setStatus('Camera unavailable — use upload or manual entry');
      }
    };

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [onResult, stopCamera]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setStatus('Decoding image…');
    try {
      const data = await decodeQrFromImage(file);
      if (data) {
        stopCamera();
        onResult(data);
      } else {
        setError('No QR code found in image');
        setStatus('Try another image or enter code manually');
      }
    } catch {
      setError('Could not decode QR image');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleManual = () => {
    const v = manual.trim();
    if (!v) return;
    stopCamera();
    onResult(v);
  };

  return (
    <div className="qr-scan-overlay show" role="presentation">
      <div className="qr-scan-box" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-center gap-2 mb-0.5">
          <span className="modal-title-icon" aria-hidden="true"><QrCode /></span>
          <span className="text-[15px] font-bold text-primary">{title}</span>
        </div>
        <div className="text-[12px] text-muted mb-2">{subtitle}</div>
        <video ref={videoRef} autoPlay playsInline muted className="mx-auto block max-w-[320px] w-full rounded-[10px] border-[3px] border-teal-500 bg-black" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="qr-status text-[12px] font-semibold mt-2 text-muted">{status}</div>
        {error && <div className="form-error mt-2 text-center">{error}</div>}

        <div className="mt-3 flex gap-2">
          <div className="field-with-icon flex-1">
            <span className="field-lead-icon"><Hash size={18} /></span>
            <input
              type="text"
              value={manual}
              onChange={e => setManual(e.target.value)}
              placeholder="Type panel code…"
              className="form-input w-full text-[13px]"
              onKeyDown={e => { if (e.key === 'Enter') handleManual(); }}
            />
          </div>
          <button type="button" className="btn-primary" onClick={handleManual}><Search size={16} />Find Panel</button>
        </div>

        <div
          className="qr-upload-area mt-3"
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter') fileRef.current?.click(); }}
          role="button"
          tabIndex={0}
        >
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-muted">
            <Upload size={14} />
            Upload QR Image (desktop test)
          </div>
        </div>

        <button type="button" className="btn-secondary mt-3 w-full" onClick={() => { stopCamera(); onClose(); }}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
