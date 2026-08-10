import type { Cable } from '../../../types';
import {
  displayValue,
  cableVisualLabel,
  resolveCableVisualData,
  wireColorHex,
  wireSizeCableDiameter,
  wireSizeStrokeWidth,
  parseLengthMeters,
  parseWireSizeSqMm,
} from './wiring-utils';

interface Props {
  cable: Cable;
  cableIndex: number;
  mapping?: Record<string, string>;
  /** Mid-row Excel slot (between IEC_FERR_A and IEC_FERR_B) — compact wire only. */
  variant?: 'full' | 'slot';
}

/**
 * Modern single-conductor cable illustration for Digital Wiring Schedule.
 * Driven by active schedule fields: colour, size (sq.mm), length, ferrule, sign mark.
 * Not Operational Twin. Not multi-core bend artwork.
 */
export default function CableVisualPath({
  cable,
  cableIndex,
  mapping = {},
  variant = 'full',
}: Props) {
  const visualData = resolveCableVisualData(cable, mapping);
  const { hex, hex2 } = wireColorHex(visualData.color);
  const strokeWidth = wireSizeStrokeWidth(visualData.size);
  const lengthM = parseLengthMeters(visualData.length);
  const sizeSq = parseWireSizeSqMm(visualData.size);

  const srcDevice = displayValue(cable.source_device || cable.source);
  const srcTerminal = displayValue(cable.source_terminal);
  const dstDevice = displayValue(cable.dest_device || cable.destination);
  const dstTerminal = displayValue(cable.dest_terminal);
  const wireNo = displayValue(String(cable.sno ?? cableIndex + 1));
  const wireSize = displayValue(visualData.size);
  const wireColor = displayValue(visualData.color);
  const wireLength = displayValue(visualData.length);
  const ferrule = displayValue(cable.ferrule);
  const sign = displayValue(cable.sign);

  const span = lengthM != null && lengthM > 0
    ? Math.min(0.92, Math.max(0.55, 0.5 + Math.min(lengthM, 8) / 20))
    : 0.78;
  const x0 = 50 - span * 42;
  const x1 = 50 + span * 42;
  const y = variant === 'slot' ? 26 : 30;
  const gradId = `dwf-wire-grad-${variant}-${String(wireNo).replace(/[^\w-]/g, '') || cableIndex}`;

  const srcLabel = srcTerminal !== '—' ? `${srcDevice} : ${srcTerminal}` : srcDevice;
  const dstLabel = dstTerminal !== '—' ? `${dstDevice} : ${dstTerminal}` : dstDevice;
  const compact = variant === 'slot';

  return (
    <section
      className={`dwf-cvp dwf-cvp--modern${compact ? ' dwf-cvp--slot' : ''}`}
      aria-label="Cable visual path"
      data-wire-color={visualData.color || undefined}
      data-wire-size={visualData.size || undefined}
      data-wire-length={visualData.length || undefined}
    >
      <header className="dwf-cvp-head">
        <span className="dwf-cvp-title">{compact ? 'Cable Visual' : 'Cable illustration'}</span>
        <span className="dwf-cvp-class dwf-cvp-class--info">
          Wire {wireNo}
          {sizeSq != null ? ` · ${sizeSq} sq.mm` : wireSize !== '—' ? ` · ${wireSize}` : ''}
        </span>
      </header>

      {!compact && (
        <div className="dwf-cvp-endpoints">
          <div className="dwf-cvp-endpoint dwf-cvp-endpoint--source">
            <span className="dwf-cvp-label">Source</span>
            <span className="dwf-cvp-value dwf-cvp-value--mono">{srcLabel}</span>
          </div>
          <div className="dwf-cvp-endpoint dwf-cvp-endpoint--dest">
            <span className="dwf-cvp-label">Destination</span>
            <span className="dwf-cvp-value dwf-cvp-value--mono">{dstLabel}</span>
          </div>
        </div>
      )}

      <div className="dwf-cvp-wire-viz" aria-hidden="true">
        <svg
          className={`dwf-cvp-wire-svg dwf-cvp-wire-svg--modern${compact ? ' dwf-cvp-wire-svg--slot' : ''}`}
          viewBox={compact ? '0 0 100 48' : '0 0 100 56'}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {hex2 ? (
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={hex} />
                <stop offset="50%" stopColor={hex} />
                <stop offset="50%" stopColor={hex2} />
                <stop offset="100%" stopColor={hex2} />
              </linearGradient>
            ) : null}
          </defs>
          <text x={x0} y="10" className="dwf-cvp-wire-ep">SRC</text>
          <text x={x1} y="10" textAnchor="end" className="dwf-cvp-wire-ep">DST</text>
          <line
            x1={x0}
            y1={y}
            x2={x1}
            y2={y}
            stroke={hex}
            strokeWidth={strokeWidth + 2.4}
            strokeLinecap="round"
            opacity={0.22}
          />
          <line
            x1={x0}
            y1={y}
            x2={x1}
            y2={y}
            stroke={hex2 ? `url(#${gradId})` : hex}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <circle cx={x0} cy={y} r={3.4} fill="#1d4ed8" stroke="#fff" strokeWidth={0.6} />
          <circle cx={x1} cy={y} r={3.4} fill="#c2410c" stroke="#fff" strokeWidth={0.6} />
          <text x="50" y={compact ? '42' : '48'} textAnchor="middle" className="dwf-cvp-wire-meta">
            {wireColor !== '—' ? wireColor : 'Colour?'}
            {wireSize !== '—' ? ` · ${wireSize}` : ''}
            {wireLength !== '—' ? ` · ${wireLength}` : ''}
          </text>
        </svg>
      </div>

      <div className={`dwf-cvp-meta-grid${compact ? ' dwf-cvp-meta-grid--slot' : ''}`} role="list">
        {!compact && (
          <div className="dwf-cvp-meta-item" role="listitem">
            <span className="dwf-cvp-label">Ferrule</span>
            <span className="dwf-cvp-value dwf-cvp-value--mono">{ferrule}</span>
          </div>
        )}
        <div className="dwf-cvp-meta-item" role="listitem">
          <span className="dwf-cvp-label">Wire colour</span>
          <span className="dwf-cvp-cable-row">
            <span
              className="dwf-swatch"
              style={{
                background: hex2
                  ? `linear-gradient(135deg, ${hex} 50%, ${hex2} 50%)`
                  : hex,
              }}
              title={wireColor}
            />
            <span className="dwf-cvp-value">{wireColor}</span>
          </span>
        </div>
        <div className="dwf-cvp-meta-item" role="listitem">
          <span className="dwf-cvp-label">Wire size</span>
          <span className="dwf-cvp-value dwf-cvp-value--strong">{wireSize}</span>
        </div>
        <div className="dwf-cvp-meta-item" role="listitem">
          <span className="dwf-cvp-label">Length</span>
          <span className="dwf-cvp-value dwf-cvp-value--strong">{wireLength}</span>
        </div>
        <div className="dwf-cvp-meta-item" role="listitem">
          <span className="dwf-cvp-label">Sign mark</span>
          <span className="dwf-cvp-value">{sign}</span>
        </div>
      </div>
    </section>
  );
}

/** Compact colour + length bar for schedule table cells (supervisor + Full View). */
export function CableVisualMiniCell({
  cable,
  mapping = {},
  maxLen = 0,
  emphasis = false,
  zoom = 1,
  openEnd = null,
  statusNote = '',
  hideLabel = false,
}: {
  cable: Cable;
  mapping?: Record<string, string>;
  maxLen?: number;
  /** Larger active-wire treatment with visible SRC/DST labels. */
  emphasis?: boolean;
  /** Active-row zoom factor (emphasis view); scales the wire stroke with the row. */
  zoom?: number;
  /** Intentionally open end from cable_status (persisted). */
  openEnd?: 'source' | 'destination' | 'both' | null;
  /** Full cable_status.note — used to show both ends when both open-end notes exist. */
  statusNote?: string;
  /** When true, omit the colour·size·length caption (shown elsewhere once). */
  hideLabel?: boolean;
}) {
  const visualData = resolveCableVisualData(cable, mapping);
  const { hex, hex2 } = wireColorHex(visualData.color);
  const lenM = parseLengthMeters(visualData.length);
  const barPct = lenM && maxLen > 0 ? Math.max(48, Math.round((lenM / maxLen) * 100)) : 74;
  const zoomFactor = Math.min(2, Math.max(0.5, zoom));
  const label = cableVisualLabel(visualData);
  const src = displayValue(cable.source || [cable.source_device, cable.source_terminal].filter(Boolean).join(':'));
  const dst = displayValue(cable.destination || [cable.dest_device, cable.dest_terminal].filter(Boolean).join(':'));
  const note = statusNote || '';
  const srcOpen = openEnd === 'source' || openEnd === 'both' || /\[SOURCE END OPEN /.test(note);
  const dstOpen = openEnd === 'destination' || openEnd === 'both' || /\[DESTINATION END OPEN /.test(note);
  const openParts: string[] = [];
  if (srcOpen) openParts.push('SRC OPEN');
  if (dstOpen) openParts.push('DST OPEN');
  const openLabel = openParts.length ? ` · ${openParts.join(' · ')}` : '';

  /* 3D-style straight single-core cable (active row only): insulation cylinder
     in the row's WIRE COLOR with stripped copper conductor at SRC and DST ends.
     Diameter is proportional to WIRE SIZE; width stays length-proportional.
     Pure CSS gradients — no external image or 3D library. */
  const diameter = Math.round(wireSizeCableDiameter(visualData.size) * zoomFactor * (emphasis ? 1.15 : 1));
  const tipHeight = Math.max(5, Math.round(diameter * 0.42));
  const tipWidth = Math.max(8, Math.round(11 * zoomFactor));
  const pathHeight = Math.max(diameter + 6, Math.round((emphasis ? 28 : 24) * zoomFactor));
  const cylinderShade =
    'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.14) 24%, rgba(255,255,255,0) 46%, rgba(0,0,0,0.14) 76%, rgba(0,0,0,0.32) 100%)';
  const cutEnds =
    'linear-gradient(90deg, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0) 3.5%, rgba(0,0,0,0) 96.5%, rgba(0,0,0,0.24) 100%)';
  const insulation = hex2
    ? `linear-gradient(180deg, ${hex} 0% 30%, ${hex2} 30% 70%, ${hex} 70% 100%)`
    : hex;
  const bodyBackground = `${cylinderShade}, ${cutEnds}, ${insulation}`;

  return (
    <div
      className={[
        'dwf-cable-visual-mini',
        emphasis ? 'dwf-cable-visual-mini--active' : '',
        srcOpen ? 'dwf-cable-visual-mini--open-src' : '',
        dstOpen ? 'dwf-cable-visual-mini--open-dst' : '',
        srcOpen && dstOpen ? 'dwf-cable-visual-mini--open-both' : '',
      ].filter(Boolean).join(' ')}
      title={`${src} → ${dst} · ${label}${openLabel}`}
      aria-label={`Cable visual path from ${src} to ${dst}: ${label}${openLabel}`}
      data-wiring-record-id={cable.record_id || undefined}
      data-excel-row={cable.excel_row || undefined}
      data-wire-color={visualData.color || undefined}
      data-wire-size={visualData.size || undefined}
      data-wire-length={visualData.length || undefined}
      data-open-end={srcOpen && dstOpen ? 'both' : (openEnd || (srcOpen ? 'source' : dstOpen ? 'destination' : undefined))}
    >
      {(srcOpen || dstOpen) && (
        <div className="dwf-cable-visual-mini__open-badges" aria-live="polite">
          {srcOpen && <span className="dwf-cable-open-badge dwf-cable-open-badge--src">OPEN SOURCE</span>}
          {dstOpen && <span className="dwf-cable-open-badge dwf-cable-open-badge--dst">OPEN DESTINATION</span>}
        </div>
      )}
      <span className="dwf-cable-visual-mini__path" aria-hidden="true" style={{ height: `${pathHeight}px` }}>
        <span className={`dwf-cable-visual-mini__endpoint-label${srcOpen ? ' is-open is-open--src' : ''}`}>
          {srcOpen ? 'SRC OPEN' : 'SRC'}
        </span>
        <span className="dwf-cable3d" style={{ width: `${Math.min(92, Math.max(barPct, emphasis ? 70 : barPct))}%`, height: `${diameter}px` }}>
          <span
            className={`dwf-cable3d__tip dwf-cable3d__tip--src${srcOpen ? ' is-open' : ''}`}
            style={{ height: `${tipHeight}px`, width: `${tipWidth}px` }}
          />
          <span className="dwf-cable3d__body" style={{ background: bodyBackground }} />
          <span
            className={`dwf-cable3d__tip dwf-cable3d__tip--dst${dstOpen ? ' is-open' : ''}`}
            style={{ height: `${tipHeight}px`, width: `${tipWidth}px` }}
          />
        </span>
        <span className={`dwf-cable-visual-mini__endpoint-label${dstOpen ? ' is-open is-open--dst' : ''}`}>
          {dstOpen ? 'DST OPEN' : 'DST'}
        </span>
      </span>
      {!hideLabel && <span className="dwf-cable-visual-mini__label">{label}</span>}
    </div>
  );
}
