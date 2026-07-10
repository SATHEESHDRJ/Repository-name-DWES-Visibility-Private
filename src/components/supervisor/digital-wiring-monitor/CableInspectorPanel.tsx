import { CheckCircle2, AlertTriangle, User } from '../../ui/icons';
import type { Cable } from '../../../types';
import {
  cableStatusChip,
  displayValue,
  parseLengthMeters,
  wireColorHex,
  type ExtendedCableStatus,
} from '../../technician/wiring/wiring-utils';
import {
  formatMonitorTimestamp,
  qaStatusLabel,
  type MonitorAssignmentContext,
} from './monitorUtils';

interface Props {
  cable: Cable | null;
  index: number | null;
  status: ExtendedCableStatus;
  assignment?: MonitorAssignmentContext | null;
  cableUpdatedAt?: string | null;
  readOnly?: boolean;
}

export default function CableInspectorPanel({
  cable,
  index,
  status,
  assignment,
  cableUpdatedAt,
  readOnly = true,
}: Props) {
  if (!cable || index == null) {
    return (
      <aside className="wsg-inspector" aria-label="Cable inspector">
        <div className="wsg-empty-hero">
          <p className="wsg-empty-title">Select a wire row</p>
          <p className="wsg-empty-sub">
            Click any row in the wiring schedule grid to preview source, destination, ferrule, and execution status.
          </p>
        </div>
      </aside>
    );
  }

  const chip = cableStatusChip(status);
  const { hex, hex2 } = wireColorHex(cable.color);
  const lenM = parseLengthMeters(cable.length);
  const pathRef = cable.ref || cable.path?.split('->')[0] || '—';
  const srcDev = displayValue(cable.source_device || cable.source?.split(':')[0]);
  const srcTerm = displayValue(cable.source_terminal || (cable.source?.includes(':') ? cable.source.split(':').pop() : ''));
  const dstDev = displayValue(cable.dest_device || cable.destination?.split(':')[0]);
  const dstTerm = displayValue(cable.dest_terminal || (cable.destination?.includes(':') ? cable.destination.split(':').pop() : ''));

  return (
    <aside className="wsg-inspector" aria-label="Cable inspector">
      <div className="wsg-insp-head">
        <span className="wsg-insp-sno">#{cable.sno ?? index + 1}</span>
        {readOnly && <span className="wsg-insp-preview">Read-only</span>}
        <span className={`wsg-status-chip ${chip.tone === 'done' ? 'done' : chip.tone === 'issue' ? 'issue' : chip.tone === 'progress' ? 'dst' : ''}`}>
          {chip.label}
        </span>
      </div>

      <div className="wsg-insp-viz" aria-hidden>
        <div className="wsg-insp-ends">
          <div className={`wsg-insp-end src${status.src ? ' done' : ''}`}>
            <span className="wsg-insp-end-tag">
              {status.src ? <CheckCircle2 size={12} /> : null}
              SOURCE
            </span>
            <span className="wsg-insp-end-dev" title={srcDev}>{srcDev}</span>
            <span className="wsg-insp-end-term">Term {srcTerm}</span>
          </div>
          <div className={`wsg-insp-end dst${status.dst ? ' done' : ''}`}>
            <span className="wsg-insp-end-tag">
              {status.dst ? <CheckCircle2 size={12} /> : null}
              DEST
            </span>
            <span className="wsg-insp-end-dev" title={dstDev}>{dstDev}</span>
            <span className="wsg-insp-end-term">Term {dstTerm}</span>
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="wsg-path-track">
            <span
              className="wsg-path-bar"
              style={{
                width: '100%',
                maxWidth: 240,
                background: hex2
                  ? `linear-gradient(90deg, ${hex} 0%, ${hex} 50%, ${hex2} 50%, ${hex2} 100%)`
                  : hex,
              }}
            />
          </div>
          <p className="wsg-path-ref mt-1">{pathRef}{lenM ? ` · ${cable.length}` : ''}</p>
        </div>
      </div>

      <div className="wsg-insp-fields">
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Ferrule</span>
          <span className="wsg-insp-field-v">{displayValue(cable.ferrule)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Wire color</span>
          <span className="wsg-insp-field-v">
            <span className="wsg-swatch" style={{ background: hex }} />
            {displayValue(cable.color)}
          </span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Wire size</span>
          <span className="wsg-insp-field-v">{displayValue(cable.size)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Length</span>
          <span className="wsg-insp-field-v">{displayValue(cable.length)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Sign</span>
          <span className="wsg-insp-field-v">{displayValue(cable.sign)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Rack</span>
          <span className="wsg-insp-field-v">{displayValue(cable.rack)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Remarks</span>
          <span className="wsg-insp-field-v" title={cable.remarks}>{displayValue(cable.remarks)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Note</span>
          <span className="wsg-insp-field-v" title={status.note}>{displayValue(status.note)}</span>
        </div>
      </div>

      <div className="wsg-insp-fields border-t">
        <div className="wsg-insp-field col-span-2">
          <span className="wsg-insp-field-h">Assigned technician</span>
          <span className="wsg-insp-field-v inline-flex items-center gap-1">
            <User size={12} aria-hidden />
            {assignment?.technician_name || 'Unassigned'}
          </span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Started</span>
          <span className="wsg-insp-field-v">{formatMonitorTimestamp(assignment?.started_at)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Completed</span>
          <span className="wsg-insp-field-v">{formatMonitorTimestamp(assignment?.completed_at)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">Last update</span>
          <span className="wsg-insp-field-v">{formatMonitorTimestamp(cableUpdatedAt)}</span>
        </div>
        <div className="wsg-insp-field">
          <span className="wsg-insp-field-h">QA status</span>
          <span className="wsg-insp-field-v">
            {qaStatusLabel(assignment?.qc_status, assignment?.review_status)}
          </span>
        </div>
        {assignment?.rework_requested && (
          <div className="wsg-insp-field col-span-2">
            <span className="wsg-insp-field-h inline-flex items-center gap-1 text-red-600">
              <AlertTriangle size={11} aria-hidden />
              Rework
            </span>
            <span className="wsg-insp-field-v">{assignment.rework_reason || 'Rework requested'}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
