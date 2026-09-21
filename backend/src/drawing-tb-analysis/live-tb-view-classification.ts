/**
 * LIVE TB drawing-region / view classification.
 * Only rear/internal physical TB banks may become AUTO_VERIFIED HIGH.
 */

export type LiveTbViewClass =
  | 'FRONT_VIEW'
  | 'INTERNAL_VIEW'
  | 'REAR_WIRING_VIEW'
  | 'PHYSICAL_TB_BANK'
  /** Verified physical DEVICE footprint layout (not directory/BOM text). */
  | 'PHYSICAL_DEVICE'
  | 'EQUIPMENT_LAYOUT'
  | 'TERMINAL_DIAGRAM'
  | 'SCHEMATIC'
  | 'LEGEND_OR_BOM'
  | 'TITLE_BLOCK'
  | 'NOTES'
  | 'UNKNOWN';

const REJECT_VIEWS = new Set<LiveTbViewClass>([
  'FRONT_VIEW',
  'EQUIPMENT_LAYOUT',
  'TERMINAL_DIAGRAM',
  'SCHEMATIC',
  'LEGEND_OR_BOM',
  'TITLE_BLOCK',
  'NOTES',
]);

const ELIGIBLE_VIEWS = new Set<LiveTbViewClass>([
  'REAR_WIRING_VIEW',
  'INTERNAL_VIEW',
  'PHYSICAL_TB_BANK',
  'PHYSICAL_DEVICE',
]);

/** True when a candidate may become AUTO_VERIFIED HIGH for LIVE TB paint. */
export function isLiveTbEligibleView(view: LiveTbViewClass | string | null | undefined): boolean {
  const v = String(view || 'UNKNOWN').toUpperCase() as LiveTbViewClass;
  return ELIGIBLE_VIEWS.has(v);
}

export function isLiveTbRejectedView(view: LiveTbViewClass | string | null | undefined): boolean {
  const v = String(view || 'UNKNOWN').toUpperCase() as LiveTbViewClass;
  return REJECT_VIEWS.has(v);
}

/**
 * Classify a page from its compact uppercase text (glyphs or OCR).
 * Prefer explicit REAR/INTERNAL over FRONT; legend/title when those dominate.
 */
export function classifyPageView(compactUpperPage: string): LiveTbViewClass {
  const t = String(compactUpperPage || '').toUpperCase().replace(/\s+/g, '');
  if (!t) return 'UNKNOWN';

  const rearPlan =
    /(REARVIEW|REARWIRING|REARSIDE|REARPLAN|WIRINGSIDE)/.test(t);
  const internalView =
    /(INTERNALVIEW|INTERNALWIRING|TERMINALBLOCK|TBSTRIP|TERMINALSTRIP)/.test(t);
  const rear = rearPlan || internalView;
  const front =
    /(FRONTVIEW|FRONTELEVATION|FRONTPANEL|RACKLAYOUT|EQUIPMENTLAYOUT|U-?POSITION|DEVICEARRANGEMENT)/.test(
      t,
    );
  const legendHeavy =
    /(BILLOFMATERIALS|DEVICEREF|COMPONENTLIST|PARTSLIST|TB-?FEEDTHROUGH|SPARECIRCUIT)/.test(t);
  const schematic =
    /(SCHEMATIC|WIRINGDIAGRAM|SINGLELINE|SLD|CIRCUITDIAGRAM)/.test(t) && !rear;
  const terminalDiagram =
    /(TERMINALDIAGRAM|TERMINALSCHEDULE|CONNECTIONTABLE|WIRELIST)/.test(t) && !internalView;

  if (front && internalView) return 'INTERNAL_VIEW';
  if (front && rearPlan) return 'REAR_WIRING_VIEW';
  if (rearPlan && !front) return 'REAR_WIRING_VIEW';
  if (internalView && !front) return 'INTERNAL_VIEW';
  if (rear && front && /(TERMINAL|WIRING|STRIP)/.test(t)) return 'REAR_WIRING_VIEW';

  if (legendHeavy && !rear) return 'LEGEND_OR_BOM';
  if (schematic) return 'SCHEMATIC';
  if (terminalDiagram) return 'TERMINAL_DIAGRAM';
  if (front) return 'FRONT_VIEW';

  if (/(INTERNAL)/.test(t) && /(WIRING|TERMINAL)/.test(t)) return 'INTERNAL_VIEW';
  if (/(NOTE:|REMARKS|TYPICAL|SEEDRAWING)/.test(t.slice(0, 120))) return 'NOTES';
  if (/(RELAY|CONTACTOR|PUSHBUTTON|PILOT LIGHT)/.test(t) && !/(TERMINALBLOCK|X\d)/.test(t)) {
    return 'EQUIPMENT_LAYOUT';
  }

  return 'UNKNOWN';
}

/**
 * Refine a header hit's view using page class + neighborhood kind.
 */
export function classifyHeaderView(input: {
  pageView: LiveTbViewClass;
  neighborhoodKind: string;
  nearbyCompact?: string;
}): LiveTbViewClass {
  const kind = String(input.neighborhoodKind || '');
  if (kind === 'legend_or_table') return 'LEGEND_OR_BOM';
  if (kind === 'title_block') return 'TITLE_BLOCK';
  if (kind === 'drawing_note') return 'NOTES';
  if (kind === 'equipment_label') return 'EQUIPMENT_LAYOUT';

  if (input.pageView === 'FRONT_VIEW') return 'FRONT_VIEW';
  if (input.pageView === 'LEGEND_OR_BOM') return 'LEGEND_OR_BOM';
  if (input.pageView === 'EQUIPMENT_LAYOUT') return 'EQUIPMENT_LAYOUT';
  if (input.pageView === 'SCHEMATIC') return 'SCHEMATIC';
  if (input.pageView === 'TERMINAL_DIAGRAM') return 'TERMINAL_DIAGRAM';

  if (kind === 'strip_candidate') {
    if (
      input.pageView === 'REAR_WIRING_VIEW'
      || input.pageView === 'INTERNAL_VIEW'
      || input.pageView === 'PHYSICAL_TB_BANK'
    ) {
      return 'PHYSICAL_TB_BANK';
    }
    const near = String(input.nearbyCompact || '').toUpperCase();
    if (/(TERMINAL|STRIP|WIRING|REAR|INTERNAL)/.test(near)) {
      return 'PHYSICAL_TB_BANK';
    }
    return 'UNKNOWN';
  }

  return input.pageView || 'UNKNOWN';
}
