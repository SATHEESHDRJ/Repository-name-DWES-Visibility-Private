import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { Cable, Boxes } from '../ui/icons';
import DigitalWiringMonitor from './digital-wiring-monitor/DigitalWiringMonitor';
import SupervisorOperationalTwinMonitor from './SupervisorOperationalTwinMonitor';
import { engineeringApi } from '../../services/api';
import { onWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { OPERATIONAL_TWIN_3D_ENABLED } from '../../config/features';
import { deriveWireVisualStatus } from '../technician/wiring/OperationalTwin2D';

interface Props {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelLabel: string;
  panelType?: string;
  voltageLevel?: string;
  onClose: () => void;
}

type MonitorTab = 'schedule' | 'twin';

/**
 * Fullscreen Digital Wiring Schedule for Production Supervisors — read-only schedule
 * plus optional Live Operational Twin monitor (2D + feature-flagged 3D).
 */
export default function PanelWiringViewModal({
  projectCode,
  projectName,
  frameId,
  panelLabel,
  panelType,
  voltageLevel,
  onClose,
}: Props) {
  const [tab, setTab] = useState<MonitorTab>('schedule');
  const [refreshTick, setRefreshTick] = useState(0);
  const [ot2d, setOt2d] = useState<any>(null);
  const [ot2dLoading, setOt2dLoading] = useState(false);
  const [ot2dError, setOt2dError] = useState<string | null>(null);
  const [ot3d, setOt3d] = useState<any>(null);
  const [ot3dLoading, setOt3dLoading] = useState(false);
  const [ot3dError, setOt3dError] = useState<string | null>(null);

  useEffect(() => {
    return onWorkflowChanged(detail => {
      if (detail.projectCode && detail.projectCode !== projectCode) return;
      if (detail.frameId && detail.frameId !== frameId) return;
      setRefreshTick(t => t + 1);
    });
  }, [projectCode, frameId]);

  useEffect(() => {
    if (tab !== 'twin') return;
    const ac = new AbortController();
    setOt2dLoading(true);
    setOt2dError(null);
    engineeringApi.operationalTwin(projectCode, frameId, undefined, ac.signal)
      .then(data => { if (!ac.signal.aborted) setOt2d(data); })
      .catch((e: any) => {
        if (!ac.signal.aborted) {
          setOt2d(null);
          setOt2dError(e?.response?.data?.message || 'Operational twin unavailable.');
        }
      })
      .finally(() => { if (!ac.signal.aborted) setOt2dLoading(false); });

    if (OPERATIONAL_TWIN_3D_ENABLED) {
      setOt3dLoading(true);
      setOt3dError(null);
      engineeringApi.operationalTwin3d(projectCode, frameId, undefined, ac.signal)
        .then(data => { if (!ac.signal.aborted) setOt3d(data); })
        .catch((e: any) => {
          if (!ac.signal.aborted) {
            setOt3d(null);
            setOt3dError(e?.response?.data?.message || '3D twin unavailable.');
          }
        })
        .finally(() => { if (!ac.signal.aborted) setOt3dLoading(false); });
    }
    return () => ac.abort();
  }, [tab, projectCode, frameId, refreshTick]);

  const progressLabel = useMemo(() => {
    const pct = ot2d?.progressPercent;
    return typeof pct === 'number' ? `${pct}% wired` : undefined;
  }, [ot2d]);

  const wireStatus = deriveWireVisualStatus({ src: false, dst: false, note: '', panelStatus: 'in_progress' });

  return (
    <Modal
      title="Digital Wiring Schedule"
      subtitle={`${panelLabel} · Read-only supervisor view`}
      icon={<Cable />}
      onClose={onClose}
      size="fullscreen"
      bodyClassName="modal-body-flush"
      footer={(
        <button type="button" className="btn-primary" onClick={onClose}>Close</button>
      )}
    >
      <div className="dwv-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedule'}
          className={`dwv-tab${tab === 'schedule' ? ' dwv-tab--active' : ''}`}
          onClick={() => setTab('schedule')}
        >
          <Cable size={14} /> Schedule
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'twin'}
          className={`dwv-tab${tab === 'twin' ? ' dwv-tab--active' : ''}`}
          onClick={() => setTab('twin')}
        >
          <Boxes size={14} /> Operational Twin
        </button>
      </div>
      {tab === 'schedule' ? (
        <DigitalWiringMonitor
          projectCode={projectCode}
          projectName={projectName}
          frameId={frameId}
          panelLabel={panelLabel}
          panelType={panelType}
          voltageLevel={voltageLevel}
        />
      ) : (
        <SupervisorOperationalTwinMonitor
          payload={ot2d}
          loading={ot2dLoading}
          error={ot2dError}
          wireStatus={wireStatus}
          projectLabel={projectCode}
          panelLabel={panelLabel}
          progressLabel={progressLabel}
          ot3dPayload={ot3d}
          ot3dLoading={ot3dLoading}
          ot3dError={ot3dError}
          projectCode={projectCode}
          frameId={frameId}
        />
      )}
    </Modal>
  );
}
