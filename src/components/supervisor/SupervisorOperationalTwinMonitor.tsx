import { lazy, Suspense, useMemo } from 'react';
import OperationalTwin2D, { type Ot2dLayoutPayload, type WireVisualStatus } from '../technician/wiring/OperationalTwin2D';
import { OPERATIONAL_TWIN_3D_ENABLED } from '../../config/features';
import type { ExtendedCableStatus } from '../technician/wiring/wiring-utils';

const OperationalTwin3D = lazy(() => import('../technician/wiring/OperationalTwin3D'));

interface Props {
  payload: Ot2dLayoutPayload | null;
  loading?: boolean;
  error?: string | null;
  wireStatus?: WireVisualStatus;
  projectLabel?: string;
  panelLabel?: string;
  technicianLabel?: string;
  progressLabel?: string;
  ot3dPayload?: any | null;
  ot3dLoading?: boolean;
  ot3dError?: string | null;
  projectCode?: string;
  frameId?: string;
}

export default function SupervisorOperationalTwinMonitor({
  payload, loading, error, wireStatus = 'pending',
  projectLabel, panelLabel, technicianLabel, progressLabel,
  ot3dPayload, ot3dLoading, ot3dError, projectCode, frameId,
}: Props) {
  const wireStatusesBySno = useMemo(() => {
    const raw = ot3dPayload?.executionBySno ?? {};
    const map: Record<string, ExtendedCableStatus> = {};
    Object.entries(raw).forEach(([k, v]) => {
      const entry = v as { src?: boolean; dst?: boolean; issue?: boolean; technicianId?: number };
      map[k] = {
        src: !!entry.src, dst: !!entry.dst, issue: !!entry.issue, note: '',
        ...(entry.technicianId != null ? { technicianId: entry.technicianId } : {}),
      };
    });
    return map;
  }, [ot3dPayload?.executionBySno]);

  return (
    <div className='ot2d-supervisor-monitor'>
      {(projectLabel || panelLabel || technicianLabel || progressLabel) && (
        <div className='ot2d-meta-row px-2 pt-2'>
          {projectLabel && <span className='ot2d-badge ot2d-badge--muted'>{projectLabel}</span>}
          {panelLabel && <span className='ot2d-badge ot2d-badge--muted'>{panelLabel}</span>}
          {technicianLabel && <span className='ot2d-badge ot2d-badge--info'>{technicianLabel}</span>}
          {progressLabel && <span className='ot2d-badge ot2d-badge--ok'>{progressLabel}</span>}
        </div>
      )}
      <OperationalTwin2D
        payload={payload}
        loading={loading}
        error={error}
        wireStatus={wireStatus}
        readOnly
        compact
      />
      {OPERATIONAL_TWIN_3D_ENABLED && (ot3dPayload || ot3dLoading) && (
        <Suspense fallback={null}>
          <OperationalTwin3D
            payload={ot3dPayload ?? null}
            loading={ot3dLoading}
            error={ot3dError}
            wireStatusesBySno={wireStatusesBySno}
            readOnly
            projectCode={projectCode}
            frameId={frameId}
            compact
          />
        </Suspense>
      )}
    </div>
  );
}
