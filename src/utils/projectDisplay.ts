import type { Project } from '../types';

/** Machine-readable creation metadata stored in projects.description */
export interface ProjectCreationMeta {
  locationRegion: string;
  /** Optional on legacy projects created by the earlier month/year flow. */
  monthYear?: string;
  /** Creation-form values retained separately from the final display name. */
  substationName?: string;
  location?: string;
  region?: string;
  projectNumbering?: string;
}

const META_PREFIX = '@dwes-meta:';

export function encodeProjectMeta(meta: ProjectCreationMeta): string {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

export function decodeProjectMeta(description: string | null | undefined): {
  meta: ProjectCreationMeta | null;
  userNotes: string;
} {
  const raw = (description || '').trim();
  if (!raw.startsWith(META_PREFIX)) {
    return { meta: null, userNotes: raw };
  }
  try {
    const meta = JSON.parse(raw.slice(META_PREFIX.length)) as ProjectCreationMeta;
    if (meta && typeof meta.locationRegion === 'string') {
      return { meta, userNotes: '' };
    }
  } catch { /* fall through */ }
  return { meta: null, userNotes: raw };
}

export function mergeProjectDescription(
  meta: ProjectCreationMeta | null,
  userNotes: string,
): string {
  if (meta) return encodeProjectMeta(meta);
  return userNotes.trim();
}

export interface ProjectCodeParts {
  voltage: string;
  region: string;
  location: string;
  year: string;
  numbering: string;
  locationRegionLabel: string;
}

export function parseProjectCode(code: string | null | undefined): ProjectCodeParts | null {
  if (!code) return null;
  const parts = code.split('_').filter(Boolean);
  if (parts.length < 5) return null;
  const numbering = parts[parts.length - 1];
  const year = parts[parts.length - 2];
  const location = parts[parts.length - 3];
  const region = parts[parts.length - 4];
  const voltage = parts.slice(0, -4).join('_');
  const fmt = (s: string) => s.replace(/_/g, ' ');
  return {
    voltage,
    region,
    location,
    year,
    numbering,
    locationRegionLabel: `${fmt(location)} / ${region}`,
  };
}

function normalizeClient(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Parse legacy projects whose name was stored as a long dash-separated title. */
export function parseLegacyProjectName(name: string | null | undefined, client: string | null | undefined) {
  const safeName = (name || '').trim();
  const parts = safeName.split(/\s+[–—]\s+|\s+-\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { substationName: safeName };
  }
  const substationName = parts[0];
  let i = 1;
  if (parts[i] && client && normalizeClient(parts[i]) === normalizeClient(client || '')) {
    i += 1;
  }
  const rest = parts.slice(i);
  return {
    substationName,
    panelLabel: rest[0] || undefined,
    voltage: rest[1] || undefined,
    locationRegion: rest[2] || undefined,
    monthYear: rest[3] || undefined,
  };
}

export interface ProjectCardDetails {
  substationName: string;
  client: string;
  locationRegion: string;
  monthYear: string;
  projectCode: string;
  projectNumbering: string;
  /** User-facing Project State (derived from project_state). */
  stateLabel: string;
  /** @deprecated Use stateLabel — kept for brief compatibility. */
  statusLabel: string;
}

export function resolveProjectCardDetails(project: Project): ProjectCardDetails {
  const codeParts = parseProjectCode(project.code);
  const { meta } = decodeProjectMeta(project.description);
  const legacy = parseLegacyProjectName(project.name, project.client);

  const substationName =
    meta?.substationName?.trim()
    || legacy.substationName
    || (project.name || '').trim()
    || project.code;
  const client = project.client?.trim() || 'Not set';
  const locationRegion =
    meta?.locationRegion?.trim()
    || [meta?.location?.trim(), meta?.region?.trim()].filter(Boolean).join(' / ')
    || legacy.locationRegion?.trim()
    || codeParts?.locationRegionLabel
    || 'Not set';
  const monthYear =
    meta?.monthYear?.trim()
    || legacy.monthYear?.trim()
    || codeParts?.year
    || 'Not set';

  return {
    substationName,
    client,
    locationRegion,
    monthYear,
    projectCode: project.code,
    projectNumbering:
      meta?.projectNumbering?.trim()
      || codeParts?.numbering
      || project.code?.trim()
      || project.sequence?.toString().padStart(3, '0')
      || '—',
    stateLabel: (project.project_state || 'not_started').replace(/_/g, ' '),
    statusLabel: (project.project_state || 'not_started').replace(/_/g, ' '),
  };
}

/** Short label for dropdowns: substation name + client (no repeated segments). */
export function projectSelectLabel(project: Project): string {
  const { substationName, client } = resolveProjectCardDetails(project);
  return client && client !== 'Not set'
    ? `${substationName} · ${client}`
    : substationName;
}

/** True when a dash-separated segment looks like a panel tag (=H001, =E01, Bay 1, …). */
function looksLikePanelToken(segment: string): boolean {
  const s = segment.trim();
  if (!s) return false;
  if (/^=[A-Za-z0-9][\w+&.-]*$/i.test(s)) return true;
  if (/^bay\s+\d+/i.test(s)) return true;
  return false;
}

/**
 * Short label for panel dropdowns — strips legacy full reference titles
 * (e.g. "ENOWA … – =H001 – 132KV …" → "=H001"). Already-compact names pass through.
 */
export function compactPanelDisplayName(panelName: string): string {
  const raw = (panelName || '').trim();
  if (!raw) return raw;
  if (!/[\u2013\u2014]/.test(raw) && !/\s+-\s+/.test(raw)) return raw;

  const parts = raw.split(/\s+[–—]\s+|\s+-\s+/).map(p => p.trim()).filter(Boolean);
  const panelPart = parts.find(looksLikePanelToken);
  if (panelPart) return panelPart;
  if (parts.length >= 3) return parts[2];
  return raw;
}

/** Full reference title for previews and optional exports (single line). */
export function buildProjectReferenceTitle(
  substationName: string,
  client: string,
  panelLabel: string,
  voltage: string,
  locationRegion: string,
  monthYear: string,
): string {
  return [
    substationName.trim(),
    client.trim(),
    panelLabel.trim(),
    voltage.trim(),
    locationRegion.trim(),
    monthYear.trim(),
  ].filter(Boolean).join(' – ');
}

/**
 * Canonical project name for the current creation flow. Panels stay as their own
 * project-scoped records, so adding another panel never changes the project name.
 */
export function buildProjectFullName(
  substationName: string,
  client: string,
  location: string,
  region: string,
  projectNumbering: string,
): string {
  const locationRegion = [location.trim(), region.trim()].filter(Boolean).join(' / ');
  return [
    substationName.trim(),
    client.trim(),
    locationRegion,
    projectNumbering.trim(),
  ].filter(Boolean).join(' – ');
}

/** Technician assignment row fields used for the Panels workspace header. */
export interface TechnicianAssignmentHeaderSource {
  project_code: string;
  project_name?: string | null;
  project_client?: string | null;
  panel_name?: string | null;
}

export function technicianAssignmentToProject(source: TechnicianAssignmentHeaderSource): Project {
  return {
    id: 0,
    code: source.project_code,
    name: String(source.project_name || source.project_code || '').trim(),
    client: String(source.project_client || '').trim(),
    description: '',
    sequence: 0,
    is_active: true,
    created_at: '',
    project_state: 'active',
    assigned_technicians: '',
  };
}

function splitLocationRegionLabel(label: string): { location: string; region: string } {
  if (!label || label === 'Not set') return { location: '', region: '' };
  const idx = label.indexOf(' / ');
  if (idx === -1) return { location: label.trim(), region: '' };
  return {
    location: label.slice(0, idx).trim(),
    region: label.slice(idx + 3).trim(),
  };
}

/** Plain-text Panels section title: canonical project name + panel (creation-flow format). */
export function buildTechnicianPanelsSectionTitle(
  source: TechnicianAssignmentHeaderSource | null | undefined,
): string {
  if (!source?.project_code) return 'Panels';
  const details = resolveProjectCardDetails(technicianAssignmentToProject(source));
  const { location, region } = splitLocationRegionLabel(details.locationRegion);
  const projectPart = buildProjectFullName(
    details.substationName,
    details.client !== 'Not set' ? details.client : '',
    location,
    region,
    details.projectNumbering !== '—' ? details.projectNumbering : '',
  );
  const panel = source.panel_name ? compactPanelDisplayName(source.panel_name) : '';
  if (panel && projectPart) return `${projectPart} — ${panel}`;
  return projectPart || panel || 'Panels';
}

export interface TechnicianPanelsSectionTitleParts {
  plain: string;
  substationName: string;
  projectSuffix: string;
  panelName: string;
}

/** Structured title for emphasis styling (bold substation + panel names). */
export function buildTechnicianPanelsSectionTitleParts(
  source: TechnicianAssignmentHeaderSource | null | undefined,
): TechnicianPanelsSectionTitleParts {
  const plain = buildTechnicianPanelsSectionTitle(source);
  if (!source?.project_code) {
    return { plain: 'Panels', substationName: 'Panels', projectSuffix: '', panelName: '' };
  }
  const details = resolveProjectCardDetails(technicianAssignmentToProject(source));
  const { location, region } = splitLocationRegionLabel(details.locationRegion);
  const projectPart = buildProjectFullName(
    details.substationName,
    details.client !== 'Not set' ? details.client : '',
    location,
    region,
    details.projectNumbering !== '—' ? details.projectNumbering : '',
  );
  const panelName = source.panel_name ? compactPanelDisplayName(source.panel_name) : '';
  const projectSuffix = projectPart.startsWith(details.substationName)
    ? projectPart.slice(details.substationName.length)
    : '';
  return {
    plain,
    substationName: details.substationName,
    projectSuffix,
    panelName,
  };
}

