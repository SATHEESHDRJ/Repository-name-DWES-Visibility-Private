/**
 * Panel 3D multi-source priority (technician Cable Digital Twin + supervisor workspace).
 *
 * When more than one source exists for the same panel, DWES uses this order.
 * Lower rank = higher priority for what technicians see as structured Flat/Engineering 3D.
 *
 * 1. Published Engineering Package (Prisma panel_models approved + published_at)
 *    -> twin-context availableModes: flat-3d / engineering-3d
 * 2. GA Foundation released asset set (secondary operational / mapping path)
 * 3. Generated Panel Model GLB from 2D (supervisor Generated 3D View only;
 *    does not unlock Flat/Engineering twin modes by itself)
 * 4. Approved 2D drawing package (drawing-reference / approved-2d)
 *
 * PDF-only or failed generated convert never fabricates Flat/Engineering geometry.
 */

export type Panel3dSourceKind =
  | 'engineering-published'
  | 'engineering-draft'
  | 'ga-foundation'
  | 'generated-panel-model'
  | 'approved-2d'
  | 'none';

export const PANEL_3D_SOURCE_RANK: Record<Panel3dSourceKind, number> = {
  'engineering-published': 1,
  'engineering-draft': 2,
  'ga-foundation': 3,
  'generated-panel-model': 4,
  'approved-2d': 5,
  none: 99,
};

export const PANEL_3D_SOURCE_LABEL: Record<Panel3dSourceKind, string> = {
  'engineering-published': 'Published Engineering Package (primary)',
  'engineering-draft': 'Engineering Package draft (pending approve)',
  'ga-foundation': 'GA Foundation (secondary)',
  'generated-panel-model': 'Generated Panel Model from 2D (secondary)',
  'approved-2d': 'Approved 2D drawing',
  none: 'No 3D source',
};

export interface Panel3dSourceSnapshot {
  engineeringPublished: boolean;
  engineeringDraft: boolean;
  gaReleased: boolean;
  generatedApproved: boolean;
  generatedPresent: boolean;
  hasDrawing2d: boolean;
}

/** Resolve the authoritative source for structured twin modes. */
export function resolvePrimaryPanel3dSource(s: Panel3dSourceSnapshot): Panel3dSourceKind {
  if (s.engineeringPublished) return 'engineering-published';
  if (s.engineeringDraft) return 'engineering-draft';
  if (s.gaReleased) return 'ga-foundation';
  if (s.generatedApproved || s.generatedPresent) return 'generated-panel-model';
  if (s.hasDrawing2d) return 'approved-2d';
  return 'none';
}

export function describePanel3dPriority(s: Panel3dSourceSnapshot): string {
  const primary = resolvePrimaryPanel3dSource(s);
  const parts = [
    s.engineeringPublished ? 'Engineering published' : null,
    s.engineeringDraft ? 'Engineering draft' : null,
    s.gaReleased ? 'GA released' : null,
    s.generatedApproved ? 'Generated approved' : s.generatedPresent ? 'Generated present' : null,
    s.hasDrawing2d ? 'Approved 2D' : null,
  ].filter(Boolean);
  return `Primary: ${PANEL_3D_SOURCE_LABEL[primary]}. Detected: ${parts.length ? parts.join(' · ') : 'none'}.`;
}