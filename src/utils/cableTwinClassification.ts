/**
 * Cable Digital Twin route-classification (shared, framework-free).
 *
 * Every cable visualization carries exactly one explicit confidence class so the
 * viewer never presents a calculated or partial visualization as an approved
 * engineering route. Classification is derived only from what actually exists for
 * the panel — never from assumptions about what a drawing "should" contain.
 *
 * Hierarchy (best → worst):
 *  A `approved-exact`      verified structured geometry + approved route
 *  B `calculated-guidance` mapped endpoints + duct graph → deterministic route,
 *                          not an approved engineering route
 *  C `endpoint-guidance`   only source & destination are mapped; no internal route
 *  D `drawing-reference`   an approved drawing exists, but terminal mapping is
 *                          incomplete — the drawing is a reference document only
 *  E `unavailable`         no approved compatible drawing or geometry exists
 */

export type CableTwinClassification =
  | 'approved-exact'
  | 'calculated-guidance'
  | 'endpoint-guidance'
  | 'drawing-reference'
  | 'unavailable';

export interface CableTwinEvidence {
  /** An approved 2D drawing asset (PDF/image) exists for this panel. */
  hasApprovedDrawing: boolean;
  /** A structured 3D model (STEP/IFC/glTF/GLB or generated panel model) exists. */
  hasStructuredModel: boolean;
  /** BOTH the source and destination terminals are mapped to coordinates. */
  hasTerminalMap: boolean;
  /** A validated cable-duct routing graph exists for this panel. */
  hasDuctGraph: boolean;
  /** An authorized user approved the exact route for THIS cable + revision pair. */
  hasApprovedRoute: boolean;
}

export function classifyCableTwin(e: CableTwinEvidence): CableTwinClassification {
  if (e.hasApprovedRoute && e.hasTerminalMap && e.hasStructuredModel) return 'approved-exact';
  if (e.hasTerminalMap && e.hasDuctGraph) return 'calculated-guidance';
  if (e.hasTerminalMap) return 'endpoint-guidance';
  if (e.hasApprovedDrawing || e.hasStructuredModel) return 'drawing-reference';
  return 'unavailable';
}

/**
 * Human-readable list of the engineering inputs still missing for a panel,
 * derived from the same evidence used for classification. Shown in the twin
 * banner/fallback so the technician (and director review) can see exactly why
 * a higher confidence class is not available — never as a wiring blocker.
 */
export function missingTwinRequirements(e: CableTwinEvidence): string[] {
  const missing: string[] = [];
  if (!e.hasApprovedDrawing) missing.push('Approved 2D drawing');
  if (!e.hasStructuredModel) missing.push('Structured 3D model (STEP / IFC / glTF) or generated panel model');
  if (!e.hasTerminalMap) missing.push('Device & terminal coordinate mapping');
  if (!e.hasDuctGraph) missing.push('Cable duct nodes & segments (routing graph)');
  if (!e.hasApprovedRoute) missing.push('Approved cable route for this schedule revision');
  return missing;
}

export const CABLE_TWIN_CLASS_META: Record<CableTwinClassification, {
  label: string;
  description: string;
  tone: 'ok' | 'info' | 'warn' | 'muted';
}> = {
  'approved-exact': {
    label: 'Approved Exact Route',
    description: 'Route generated from verified structured geometry and approved by an authorized engineering user.',
    tone: 'ok',
  },
  'calculated-guidance': {
    label: 'Calculated Guidance Route',
    description: 'Route calculated from mapped terminals and duct geometry. Guidance only — not an approved engineering route.',
    tone: 'info',
  },
  'endpoint-guidance': {
    label: 'Endpoint Guidance',
    description: 'Source and destination are verified. The internal cable route is not available.',
    tone: 'info',
  },
  'drawing-reference': {
    label: 'Drawing Reference Only',
    description: 'The approved drawing is available, but source/destination terminal mapping is incomplete for this cable.',
    tone: 'warn',
  },
  unavailable: {
    label: 'Visualization Unavailable',
    description: 'No approved compatible drawing or panel geometry exists for this panel yet.',
    tone: 'muted',
  },
};
