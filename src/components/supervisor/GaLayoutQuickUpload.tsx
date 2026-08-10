import { useRef, useState } from 'react';
import { FileText, Upload } from '../ui/icons';
import { gaApi } from '../../services/api';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';

const GA_EXT = ['pdf', 'dwg', 'dxf'];

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

interface GaLayoutQuickUploadProps {
  projectCode: string;
  frameId: string;
  onUploaded?: () => void;
}

type UploadMode = 'single' | 'separate';

/**
 * GA layout source upload — one multi-page PDF (front + rear pages) or separate files.
 * No wiring schedule. Face crop + page pick happens in GA enrollment below.
 */
export default function GaLayoutQuickUpload({ projectCode, frameId, onUploaded }: GaLayoutQuickUploadProps) {
  const singleRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const rearRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<UploadMode>('single');
  const [busy, setBusy] = useState<'single' | 'front' | 'rear' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const validateFile = (file: File): string | null => {
    const ext = extension(file.name);
    if (!GA_EXT.includes(ext)) {
      return `GA layout must be PDF, DWG, or DXF (.${GA_EXT.join(', .')}).`;
    }
    if (file.size > 200 * 1024 * 1024) {
      return 'GA layout file is too large — max 200 MB.';
    }
    return null;
  };

  const uploadFace = async (face: 'front' | 'rear', file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    await gaApi.uploadSource(projectCode, frameId, face, formData);
  };

  const uploadSinglePdf = async (file: File | null) => {
    if (!file || busy) return;
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy('single');
    setError('');
    setNotice('');
    try {
      // Same multi-page PDF enrolled as both front and rear sources.
      // User picks different page numbers when cropping faces below.
      await uploadFace('front', file);
      await uploadFace('rear', file);
      setNotice(
        `Uploaded “${file.name}” as Front and Rear sources. Below: open Front → Load the FRONT VIEW page → crop → Save face. Then Rear → Load the REAR / INTERNAL page → crop → Save face.`,
      );
      emitWorkflowChanged({ scope: 'general', projectCode, frameId });
      onUploaded?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'GA source upload failed.';
      setError(msg);
    } finally {
      setBusy('');
      if (singleRef.current) singleRef.current.value = '';
    }
  };

  const upload = async (face: 'front' | 'rear', file: File | null) => {
    if (!file || busy) return;
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(face);
    setError('');
    setNotice('');
    try {
      await uploadFace(face, file);
      setNotice(`${face === 'front' ? 'Front' : 'Rear'} GA source uploaded. Crop and save the face below.`);
      emitWorkflowChanged({ scope: 'general', projectCode, frameId });
      onUploaded?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'GA source upload failed.';
      setError(msg);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-raised,#0f172a0d)] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary,#0f172a)]">
        <Upload size={16} /> Step 1 — Upload GA layout (drawing only)
      </div>
      <p className="mb-3 mt-0 text-xs font-medium text-[var(--text-secondary)]">
        One multi-page PDF is enough (e.g. H00+R with front sheet + rear sheet inside). No separate front/back files required. No wiring schedule for convert.
      </p>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="GA upload mode">
        <button
          type="button"
          className={mode === 'single' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          onClick={() => setMode('single')}
          disabled={Boolean(busy)}
        >
          One PDF (front + rear pages)
        </button>
        <button
          type="button"
          className={mode === 'separate' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          onClick={() => setMode('separate')}
          disabled={Boolean(busy)}
        >
          Separate front / rear files
        </button>
      </div>

      {error && <p className="mb-2 mt-0 text-xs font-semibold text-red-600">{error}</p>}
      {notice && <p className="mb-2 mt-0 text-xs font-semibold text-emerald-700">{notice}</p>}

      {mode === 'single' ? (
        <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
            <FileText size={14} /> Panel GA PDF (all sheets)
          </div>
          <p className="mb-2 mt-0 text-[11px] text-[var(--text-secondary)]">
            Example: <code>33kV BUSBAR PROTECTION PANEL (=H00+R).pdf</code> — later pick the Front View page for Front and the Rear/Internal page for Rear.
          </p>
          <input
            ref={singleRef}
            type="file"
            accept=".pdf,.dwg,.dxf,application/pdf"
            className="sr-only"
            onChange={e => void uploadSinglePdf(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="btn-secondary w-full text-sm"
            onClick={() => singleRef.current?.click()}
            disabled={Boolean(busy)}
          >
            {busy === 'single' ? 'Uploading as Front + Rear…' : 'Choose one GA PDF'}
          </button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
              <FileText size={14} /> Front GA layout
            </div>
            <input
              ref={frontRef}
              type="file"
              accept=".pdf,.dwg,.dxf,application/pdf"
              className="sr-only"
              onChange={e => void upload('front', e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn-secondary w-full text-sm"
              onClick={() => frontRef.current?.click()}
              disabled={Boolean(busy)}
            >
              {busy === 'front' ? 'Uploading front…' : 'Choose front PDF'}
            </button>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-white p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
              <FileText size={14} /> Rear / back GA layout
            </div>
            <input
              ref={rearRef}
              type="file"
              accept=".pdf,.dwg,.dxf,application/pdf"
              className="sr-only"
              onChange={e => void upload('rear', e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn-secondary w-full text-sm"
              onClick={() => rearRef.current?.click()}
              disabled={Boolean(busy)}
            >
              {busy === 'rear' ? 'Uploading rear…' : 'Choose rear PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
