// Animated SVG cable schematic: SOURCE node → colored cable line → DESTINATION node.
// Nodes fill with the wire's real color as each end is marked done.
// Dashed marching-ants animation stops when both ends are complete.

interface SchematicCable {
  ferrule?: string;
  color?: string;
  size?: string;
  length?: string;
  source?: string;
  destination?: string;
  source_device?: string;
  source_terminal?: string;
  dest_device?: string;
  dest_terminal?: string;
  device?: string;
  terminal?: string;
}

interface SchematicStatus { src: boolean; dst: boolean; issue?: boolean; note?: string; }

const COLOR_MAP: Record<string, string> = {
  // Full names (IEC / industrial)
  RED: '#DC2626', BLACK: '#1C1917', BLUE: '#2563EB', YELLOW: '#EAB308',
  GREEN: '#16A34A', WHITE: '#F1F5F9', GREY: '#6B7280', GRAY: '#6B7280',
  BROWN: '#92400E', ORANGE: '#EA580C', VIOLET: '#7C3AED', PURPLE: '#7C3AED',
  PINK: '#EC4899', CYAN: '#0891B2', TURQUOISE: '#0D9488', SILVER: '#94A3B8',
  'LIGHT BLUE': '#60A5FA', 'DARK BLUE': '#1E3A8A',
  // Short codes
  R: '#DC2626', RD: '#DC2626', N: '#1C1917', BK: '#1C1917',
  L: '#2563EB', BU: '#2563EB', Y: '#EAB308', YL: '#EAB308',
  G: '#16A34A', GN: '#16A34A', W: '#F1F5F9', WH: '#F1F5F9',
  GY: '#6B7280', GR: '#6B7280', BR: '#92400E', BN: '#92400E',
  OR: '#EA580C', OG: '#EA580C', V: '#7C3AED', VI: '#7C3AED',
  PK: '#EC4899', CY: '#0891B2',
};

function parseLengthMeters(raw?: string): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '.').match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function resolveColor(raw?: string): { hex: string; hex2?: string; isWhite: boolean; isUnknown: boolean } {
  if (!raw) return { hex: '#94A3B8', isWhite: false, isUnknown: true };
  const n = raw.trim().toUpperCase();
  if (n.startsWith('#')) return { hex: n, isWhite: false, isUnknown: false };
  if (COLOR_MAP[n]) {
    return { hex: COLOR_MAP[n], isWhite: n === 'WHITE' || n === 'W' || n === 'WH', isUnknown: false };
  }
  if (n.includes('/')) {
    const [a, b] = n.split('/').map(s => s.trim());
    if (COLOR_MAP[a] && COLOR_MAP[b]) {
      return { hex: COLOR_MAP[a], hex2: COLOR_MAP[b], isWhite: false, isUnknown: false };
    }
  }
  return { hex: '#94A3B8', isWhite: false, isUnknown: true };
}

function parseMm2(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function strokeForMm2(mm2: number | null): number {
  if (mm2 === null) return 5;
  if (mm2 <= 1.0) return 3;
  if (mm2 <= 1.5) return 4;
  if (mm2 <= 2.5) return 5;
  if (mm2 <= 4)   return 6;
  if (mm2 <= 6)   return 8;
  if (mm2 <= 10)  return 10;
  return 12;
}

function tr(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// SVG layout constants
const W = 480, H = 130;
const SRC_X = 58, DST_X = 422, LINE_Y = 62;
const NODE_R = 22;
const MAX_SPAN = DST_X - SRC_X - NODE_R * 2 - 6;

export default function CableSchematic({
  cable, status, maxLengthMeters = 0, highlight = false,
}: {
  cable: SchematicCable;
  status: SchematicStatus;
  maxLengthMeters?: number;
  /** Hover-sync emphasis: glow + thicker stroke + full opacity. */
  highlight?: boolean;
}) {
  const { hex, hex2, isWhite, isUnknown } = resolveColor(cable.color);
  const mm2 = parseMm2(cable.size);
  const sw  = strokeForMm2(mm2) + (highlight ? 1.5 : 0);
  const lengthM = parseLengthMeters(cable.length);
  const lengthRatio = lengthM && maxLengthMeters > 0
    ? Math.max(0.35, Math.min(1, lengthM / maxLengthMeters))
    : 1;
  const spanPx = Math.round(MAX_SPAN * lengthRatio);
  const lx1 = SRC_X + NODE_R + 3;
  const lx2 = lx1 + spanPx;
  const mid = Math.round((lx1 + lx2) / 2);

  const { src: srcDone, dst: dstDone, issue: hasIssue, note: issueNote } = status;
  const bothDone = srcDone && dstDone;

  // Cable opacity scales with progress; hover-highlight always reads at full strength
  const opacity  = highlight ? 1 : bothDone ? 1 : (srcDone || dstDone) ? 0.72 : 0.38;
  const dashLen  = sw * 4;
  const gapLen   = sw * 3;
  const dashArr  = bothDone || REDUCED_MOTION ? '' : `${dashLen} ${gapLen}`;
  const animFrom = `${dashLen + gapLen}`;

  // Visual line color: white wire gets a grey stroke so it's visible on light bg
  const strokeHex = isWhite ? '#94A3B8' : hex;

  // Node fill + ring
  const srcFill = srcDone ? hex   : '#F8FAFC';
  const dstFill = dstDone ? hex   : '#F8FAFC';
  const srcRing = srcDone ? hex   : '#CBD5E1';
  const dstRing = dstDone ? hex   : '#CBD5E1';
  // Checkmark color: grey on white wire, white otherwise
  const checkClr = isWhite ? '#475569' : '#FFFFFF';

  // Labels
  const ferrTxt  = tr(cable.ferrule, 16);
  const sizeText = [cable.size, cable.length].filter(Boolean).join(' · ');
  const colorLabel = cable.color ? (isUnknown ? `${cable.color} (?)` : cable.color) : '';
  const metaLine = [colorLabel, sizeText].filter(Boolean).join(' · ');

  const srcLabel = tr(cable.source_terminal || cable.terminal, 16) || tr(cable.source, 18);
  const srcDev   = tr(cable.source_device   || cable.device, 18);
  const dstLabel = tr(cable.dest_terminal, 16) || tr(cable.destination, 18);
  const dstDev   = tr(cable.dest_device, 18);

  // SVG checkmark path relative to node center
  const ckPath = (cx: number, cy: number) =>
    `M${cx - 7} ${cy + 1} L${cx - 2} ${cy + 7} L${cx + 8} ${cy - 7}`;

  return (
    <div className={`wire-schematic-wrap${hasIssue ? ' wire-schematic-issue' : ''}`}>
      {hasIssue && (
        <div className="wire-schematic-issue-banner">
          <span aria-hidden="true">&#9888;</span>
          <span>{issueNote ? issueNote : 'Issue flagged'}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="wire-schematic-svg"
        role="img"
        aria-label={`Cable schematic: ${cable.source || '—'} → ${cable.destination || '—'}`}
      >
        {/* SRC / DST header labels */}
        <text
          x={SRC_X} y={LINE_Y - NODE_R - 7}
          textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="0.06em"
          fill={srcDone ? '#16A34A' : '#94A3B8'}
        >
          SRC
        </text>
        <text
          x={DST_X} y={LINE_Y - NODE_R - 7}
          textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="0.06em"
          fill={dstDone ? '#EA580C' : '#94A3B8'}
        >
          DST
        </text>

        {/* Cable line with flowing-dash animation */}
        <line
          x1={lx1} y1={LINE_Y} x2={lx2} y2={LINE_Y}
          stroke={strokeHex} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={dashArr} opacity={opacity}
          filter={highlight ? 'drop-shadow(0 0 4px currentColor)' : undefined}
          color={strokeHex}
        >
          {!REDUCED_MOTION && !bothDone && dashArr && (
            <animate
              attributeName="stroke-dashoffset"
              values={`${animFrom};0`}
              dur="1.1s"
              repeatCount="indefinite"
            />
          )}
        </line>
        {hex2 && (
          <line
            x1={lx1} y1={LINE_Y + sw * 0.35} x2={lx2} y2={LINE_Y + sw * 0.35}
            stroke={hex2} strokeWidth={Math.max(2, sw * 0.45)} strokeLinecap="round"
            opacity={opacity * 0.85}
          />
        )}

        {/* Source node */}
        <circle cx={SRC_X} cy={LINE_Y} r={NODE_R}
          fill={srcFill} stroke={srcRing} strokeWidth="2.5" />
        {srcDone && (
          <path
            d={ckPath(SRC_X, LINE_Y)}
            stroke={checkClr} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        )}

        {/* Destination node */}
        <circle cx={DST_X} cy={LINE_Y} r={NODE_R}
          fill={dstFill} stroke={dstRing} strokeWidth="2.5" />
        {dstDone && (
          <path
            d={ckPath(DST_X, LINE_Y)}
            stroke={checkClr} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        )}

        {/* Ferrule pill — white background box on the cable */}
        {ferrTxt && (
          <>
            <rect
              x={mid - 56} y={LINE_Y - 13} width={112} height={22}
              rx="5" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.2"
            />
            <text
              x={mid} y={LINE_Y + 5}
              textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#1E293B"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {ferrTxt}
            </text>
          </>
        )}

        {/* Color swatch + size/length label below the cable line */}
        {metaLine && (
          <>
            {colorLabel && (
              <circle
                cx={mid - 46} cy={LINE_Y + 21} r={4.5}
                fill={hex} stroke={isWhite ? '#94A3B8' : hex} strokeWidth="1"
              />
            )}
            <text
              x={colorLabel ? mid - 38 : mid}
              y={LINE_Y + 25}
              textAnchor={colorLabel ? 'start' : 'middle'}
              fontSize="9" fill={isUnknown ? '#94A3B8' : '#64748B'}
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {metaLine}
            </text>
          </>
        )}

        {/* Source terminal / device below left node */}
        {srcLabel && (
          <text
            x={SRC_X} y={LINE_Y + NODE_R + 16}
            textAnchor="middle" fontSize="9" fontWeight="600" fill="#334155"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            {srcLabel}
          </text>
        )}
        {srcDev && (
          <text
            x={SRC_X} y={LINE_Y + NODE_R + 28}
            textAnchor="middle" fontSize="8" fill="#94A3B8"
          >
            {srcDev}
          </text>
        )}

        {/* Destination terminal / device below right node */}
        {dstLabel && (
          <text
            x={DST_X} y={LINE_Y + NODE_R + 16}
            textAnchor="middle" fontSize="9" fontWeight="600" fill="#334155"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            {dstLabel}
          </text>
        )}
        {dstDev && (
          <text
            x={DST_X} y={LINE_Y + NODE_R + 28}
            textAnchor="middle" fontSize="8" fill="#94A3B8"
          >
            {dstDev}
          </text>
        )}
      </svg>
    </div>
  );
}
