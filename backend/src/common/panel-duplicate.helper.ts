import { ConflictException, NotFoundException } from '@nestjs/common';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';

/** Normalize panel names for duplicate comparison (case-insensitive, trimmed). */
export function normalizePanelName(name: string): string {
  return name.trim().toUpperCase();
}

function looksLikePanelToken(segment: string): boolean {
  const s = segment.trim();
  if (!s) return false;
  if (/^=[A-Za-z0-9][\w+&.-]*$/i.test(s)) return true;
  if (/^bay\s+\d+/i.test(s)) return true;
  return false;
}

/** Short label for panel tags — mirrors frontend compactPanelDisplayName. */
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

export function compactPanelKey(name: string): string {
  return normalizePanelName(compactPanelDisplayName(name));
}

export function getDuplicatePanelNameKeys(panels: { panel_name: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const panel of panels) {
    const key = compactPanelKey(panel.panel_name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

export function isPanelNameDuplicate(
  panelName: string,
  panels: { panel_name: string }[],
): boolean {
  if (!panelName.trim()) return false;
  return getDuplicatePanelNameKeys(panels).has(compactPanelKey(panelName));
}

export function duplicatePanelBlockMessage(panelDisplayName: string): string {
  const tag = compactPanelDisplayName(panelDisplayName).trim() || panelDisplayName.trim();
  return (
    `Duplicate Panel Name Detected — a panel named '${tag}' already exists. ` +
    'Each panel name must be unique so Wiring Schedule, Drawings, Reports, and Technician Assignments link to the correct panel. ' +
    'Please rename the duplicate panel or select the existing panel before continuing.'
  );
}

export function listProjectPanelNames(projectCode: string): { id: string; panel_name: string }[] {
  return MockStore.findFramesByProject(projectCode).map(f => ({
    id: f.id,
    panel_name: f.panel_name,
  }));
}

export function resolveProjectFrame(projectCode: string, frameId: string) {
  return MockStore.findFrameByProjectAndId(projectCode, frameId)
    ?? FrameStore.getFrameFromDisk(projectCode, frameId);
}

/**
 * Reject panel-linked writes when this frame's compact display tag is ambiguous
 * (shared by more than one panel in the project).
 */
export function assertPanelNameUniqueForWrite(projectCode: string, frameId: string): void {
  const frame = resolveProjectFrame(projectCode, frameId);
  if (!frame) throw new NotFoundException(`Panel ${frameId} not found`);
  const panels = listProjectPanelNames(projectCode);
  if (isPanelNameDuplicate(frame.panel_name, panels)) {
    throw new ConflictException(duplicatePanelBlockMessage(frame.panel_name));
  }
}

/** Block renames that collide with another panel's compact tag (resolution renames must be unique). */
export function assertPatchPanelNameAllowed(
  projectCode: string,
  frameId: string,
  newName: string,
): void {
  const trimmed = (newName || '').trim();
  if (!trimmed) return;
  const key = compactPanelKey(trimmed);
  if (!key) return;
  const panels = listProjectPanelNames(projectCode);
  const collision = panels.some(
    p => p.id !== frameId && compactPanelKey(p.panel_name) === key,
  );
  if (collision) {
    throw new ConflictException(
      `A panel named '${compactPanelDisplayName(trimmed)}' already exists in this project. Choose a unique name.`,
    );
  }
}
