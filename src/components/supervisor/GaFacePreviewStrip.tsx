import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader, TriangleAlert } from '../ui/icons';
import { gaApi } from '../../services/api';
import { onWorkflowChanged } from '../../utils/dwesRefreshEvents';

type GaFaceKind = 'front' | 'internal' | 'rear' | 'custom';

interface GaFaceRecord {
  id: string;
  face: GaFaceKind;
  custom_label?: string | null;
  status: string;
}

const PREVIEW_FACES: GaFaceKind[] = ['front', 'rear'];

const FACE_LABELS: Record<GaFaceKind, string> = {
  front: 'Front view',
  internal: 'Internal view',
  rear: 'Rear / back view',
  custom: 'Custom face',
};

interface FaceSlot {
  face: GaFaceKind;
  record: GaFaceRecord | null;
  imageUrl: string;
  loading: boolean;
  error: string;
}

interface GaFacePreviewStripProps {
  projectCode: string;
  frameId: string;
  /** Bump to force reload after enrollment actions. */
  refreshKey?: number;
}

/**
 * Visible 2D enrolled GA face thumbnails (front + rear) for supervisor eye verification
 * before Preview 3D Operational Twin and Approve & release.
 */
export default function GaFacePreviewStrip({ projectCode, frameId, refreshKey = 0 }: GaFacePreviewStripProps) {
  const [slots, setSlots] = useState<FaceSlot[]>(
    PREVIEW_FACES.map(face => ({ face, record: null, imageUrl: '', loading: true, error: '' })),
  );
  const [loadError, setLoadError] = useState('');
  const objectUrlsRef = useRef<string[]>([]);

  const revokeAllUrls = () => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  const loadFaces = useCallback(async (signal?: AbortSignal) => {
    setLoadError('');
    revokeAllUrls();
    setSlots(PREVIEW_FACES.map(face => ({ face, record: null, imageUrl: '', loading: true, error: '' })));
    try {
      const status = await gaApi.status(projectCode, frameId, signal);
      if (signal?.aborted) return;
      const faces = (Array.isArray(status?.faces) ? status.faces : []) as GaFaceRecord[];

      const nextSlots = await Promise.all(
        PREVIEW_FACES.map(async (faceKind): Promise<FaceSlot> => {
          const record = faces.find(f => f.face === faceKind) ?? null;
          if (!record) {
            return { face: faceKind, record: null, imageUrl: '', loading: false, error: '' };
          }
          try {
            const blob = await gaApi.faceImage(projectCode, frameId, record.id);
            if (signal?.aborted) return { face: faceKind, record, imageUrl: '', loading: false, error: '' };
            const imageUrl = URL.createObjectURL(blob);
            objectUrlsRef.current.push(imageUrl);
            return { face: faceKind, record, imageUrl, loading: false, error: '' };
          } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || 'Could not load face image.';
            return { face: faceKind, record, imageUrl: '', loading: false, error: msg };
          }
        }),
      );
      if (!signal?.aborted) setSlots(nextSlots);
    } catch (e: unknown) {
      if (signal?.aborted) return;
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'Could not load GA face previews.';
      setLoadError(msg);
      setSlots(PREVIEW_FACES.map(face => ({ face, record: null, imageUrl: '', loading: false, error: '' })));
    }
  }, [frameId, projectCode]);

  useEffect(() => {
    const ac = new AbortController();
    void loadFaces(ac.signal);
    return () => {
      ac.abort();
      revokeAllUrls();
    };
  }, [loadFaces, refreshKey]);

  useEffect(() => {
    return onWorkflowChanged(detail => {
      if (detail.projectCode && detail.projectCode !== projectCode) return;
      if (detail.frameId && detail.frameId !== frameId) return;
      void loadFaces();
    });
  }, [frameId, loadFaces, projectCode]);

  const enrolledCount = slots.filter(s => s.record && s.imageUrl).length;

  return (
    <section
      className="overflow-hidden rounded-md border border-[var(--border)] bg-white"
      aria-label="Enrolled GA layout face previews"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-raised,#0f172a0d)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary,#0f172a)]">
          <FileText size={16} />
          Flat 2D GA layout — verify front &amp; back before 3D
        </div>
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {enrolledCount}/{PREVIEW_FACES.length} faces ready
        </span>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid gap-3 p-3 sm:grid-cols-2">
        {slots.map(slot => (
          <div
            key={slot.face}
            className="flex min-h-[200px] flex-col overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface,#fff)]"
          >
            <div className="border-b border-[var(--border)] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-primary,#0f172a)]">
              {FACE_LABELS[slot.face]}
            </div>
            <div className="relative flex min-h-[180px] flex-1 items-center justify-center bg-slate-50 p-2">
              {slot.loading ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                  <Loader size={16} /> Loading…
                </span>
              ) : slot.imageUrl ? (
                <img
                  src={slot.imageUrl}
                  alt={`${FACE_LABELS[slot.face]} enrolled GA layout`}
                  className="max-h-[280px] w-full object-contain"
                />
              ) : (
                <div className="px-3 text-center text-sm font-medium text-[var(--text-secondary)]">
                  {slot.error || (
                    <>
                      Not enrolled yet.
                      <br />
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        Upload GA source below, crop this face, then save.
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            {slot.record && (
              <div className="border-t border-[var(--border)] px-2.5 py-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                Status: {slot.record.status}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="m-0 border-t border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
        Cover sheets are not valid geometry. Use front / internal / rear GA layout sheets only.
        Wiring schedule is separate — not required for this convert step.
      </p>
    </section>
  );
}
