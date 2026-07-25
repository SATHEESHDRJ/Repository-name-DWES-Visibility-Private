import { useRef, useState } from 'react';
import Modal from '../Modal';
import { useAppDialog } from '../AppDialogProvider';
import { CheckCircle, FileText, TriangleAlert, Upload, X } from '../ui/icons';
import { uploadApi } from '../../services/api';
import { emitDocumentsChanged } from '../../utils/projectDocumentsEvents';
import type { PanelDrawingAsset, PanelDrawingSlot } from '../../types/panelDrawing';

const SLOT_CONFIG: Record<'2d', {
  label: string;
  accept: string;
  extensions: string[];
}> = {
  '2d': {
    label: 'GA Drawing',
    accept: '.pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,.bmp,.svg,.tif,.tiff,application/pdf,image/*',
    extensions: ['pdf', 'dwg', 'dxf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'tif', 'tiff'],
  },
};

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PanelDrawingUploadModal({
  projectCode,
  projectName,
  frameId,
  panelName,
  slot,
  existingAsset,
  onClose,
  onUploaded,
}: {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelName: string;
  slot: PanelDrawingSlot;
  existingAsset?: PanelDrawingAsset | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const dialog = useAppDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  if (slot !== '2d') {
    throw new Error('Only the GA Drawing (2D) slot accepts uploads. 3D model uploads are no longer supported.');
  }
  const cfg = SLOT_CONFIG['2d'];
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const selectFile = (candidate: File) => {
    setError('');
    setDone(false);
    if (!cfg.extensions.includes(extension(candidate.name))) {
      setFile(null);
      setError(`Unsupported ${cfg.label} format. Choose ${cfg.extensions.map(ext => `.${ext}`).join(', ')}.`);
      return;
    }
    setFile(candidate);
  };

  const upload = async () => {
    if (!file || uploading) return;
    if (existingAsset) {
      const confirmed = await dialog.confirm({
        title: 'Replace GA Drawing?',
        message: `This replaces “${existingAsset.original_name}” for panel ${panelName}. The replacement remains linked only to project ${projectCode} and this panel.`,
        tone: 'warning',
        confirmText: 'Replace GA Drawing',
      });
      if (!confirmed) return;
    }

    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      await uploadApi.panelDrawingSlot(projectCode, frameId, '2d', form, setProgress);
      setDone(true);
      emitDocumentsChanged({ projectCode, frameId, kind: 'drawing', action: existingAsset ? 'replaced' : 'uploaded' });
      onUploaded();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to upload this GA drawing.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title={existingAsset ? 'Replace GA Drawing' : 'Upload GA Drawing'}
      subtitle={`${projectName || projectCode} · ${panelName}`}
      icon={<Upload />}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={!uploading}
      closeOnEscape={!uploading}
      footer={(
        <div className="panel-drawing-upload-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button type="button" className="btn-primary" onClick={() => void upload()} disabled={!file || uploading}>
              <Upload size={16} />
              {uploading ? `Uploading ${progress}%` : existingAsset ? `Replace ${cfg.label}` : `Upload ${cfg.label}`}
            </button>
          )}
        </div>
      )}
    >
      <div className="panel-drawing-upload">
        <div className="panel-drawing-target">
          <span>Selected project</span><strong>{projectName || projectCode}</strong>
          <span>Specific panel</span><strong>{panelName}</strong>
          <span>File slot</span><strong>{cfg.label}</strong>
        </div>

        {existingAsset && (
          <div className="panel-drawing-existing">
            <FileText size={20} />
            <div><span>Current {cfg.label}</span><strong>{existingAsset.original_name}</strong></div>
            {existingAsset.size != null && <small>{formatBytes(existingAsset.size)}</small>}
          </div>
        )}

        {!done ? (
          <>
            <button
              type="button"
              className={`panel-drawing-dropzone${dragOver ? ' is-dragging' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={event => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={event => {
                event.preventDefault();
                setDragOver(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) selectFile(dropped);
              }}
              disabled={uploading}
            >
              <Upload size={25} />
              <strong>Drop the actual {cfg.label.toLowerCase()} here or browse</strong>
              <span>{cfg.extensions.map(ext => `.${ext}`).join(' · ')}</span>
              <input
                ref={inputRef}
                type="file"
                accept={cfg.accept}
                className="sr-only"
                onChange={event => {
                  const selected = event.target.files?.[0];
                  if (selected) selectFile(selected);
                  event.target.value = '';
                }}
                aria-label={`Choose ${cfg.label}`}
              />
            </button>

            {file && (
              <div className="panel-drawing-selected-file">
                <FileText size={20} />
                <div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
                {!uploading && <button type="button" onClick={() => setFile(null)} aria-label="Remove selected file"><X size={16} /></button>}
              </div>
            )}

            {uploading && (
              <div className="panel-drawing-progress" aria-live="polite">
                <div><span style={{ width: `${progress}%` }} /></div>
                <small>{progress}% uploaded</small>
              </div>
            )}
          </>
        ) : (
          <div className="panel-drawing-upload-success" role="status">
            <CheckCircle size={30} />
            <strong>GA Drawing uploaded successfully.</strong>
            <span>The viewer will reload this panel’s shared GA drawing record.</span>
          </div>
        )}

        {error && (
          <div className="panel-drawing-upload-error" role="alert"><TriangleAlert size={17} />{error}</div>
        )}
      </div>
    </Modal>
  );
}
