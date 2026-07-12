import type { Cable } from '../../../types';
import {
  displayValue,
  parseLengthMeters,
  wireColorHex,
} from '../../technician/wiring/wiring-utils';

interface Props {
  cable: Cable | null;
  index: number | null;
  readOnly?: boolean;
}

export default function CableInspectorPanel({
  cable,
  index,
  readOnly = true,
}: Props) {
  if (!cable || index == null) {
    return (
      <aside className="wsg-inspector" aria-label="Cable inspector">
        <div className="wsg-empty-hero">
          <p className="wsg-empty-title">Select a wire row</p>
          <p className="wsg-empty-sub">
            Click any row in the wiring schedule grid to preview source, destination, ferrule, and wire details.
          </p>
        </div>
      </aside>
    );
  }

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
      </div>

      <div className="wsg-insp-viz" aria-hidden>
        <div className="wsg-insp-ends">
          <div className="wsg-insp-end src">
            <span className="wsg-insp-end-tag">SOURCE</span>
            <span className="wsg-insp-end-dev" title={srcDev}>{srcDev}</span>
            <span className="wsg-insp-end-term">Term {srcTerm}</span>
          </div>
          <div className="wsg-insp-end dst">
            <span className="wsg-insp-end-tag">DEST</span>
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
        <div className="wsg-insp-field col-span-2">
          <span className="wsg-insp-field-h">Remarks</span>
          <span className="wsg-insp-field-v" title={cable.remarks}>{displayValue(cable.remarks)}</span>
        </div>
      </div>
    </aside>
  );
}
