/**
 * Twin layout file store — Mode B schematic persistence.
 *
 * WiringSchemeDB schema is read-only (dwes-db-guard). TwinPanelLayout for
 * SCHEMATIC mode is therefore stored as JSON under uploads/, same pattern as
 * frames and drawing packages. GEOMETRY mode reuses published panel_models /
 * device_geometries / terminal_geometries / duct_* tables.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateSchematicLayout,
  SCHEMATIC_GENERATION_VERSION,
  type SchematicCableInput,
  type TwinPanelLayout,
} from './schematic-layout';

function uploadDir() {
  return process.env.UPLOAD_DIR
    ? path.isAbsolute(process.env.UPLOAD_DIR)
      ? process.env.UPLOAD_DIR
      : path.join(process.cwd(), process.env.UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');
}

function twinLayoutDir(projectCode: string) {
  return path.join(uploadDir(), projectCode, 'twin-layouts');
}

function schematicPath(projectCode: string, frameId: string) {
  return path.join(twinLayoutDir(projectCode), `${frameId}.schematic.json`);
}

function scheduleFingerprint(cables: SchematicCableInput[]): string {
  const parts = cables.map(c => [
    c.sno, c.source_device, c.source_terminal, c.dest_device, c.dest_terminal,
    c.source, c.destination, c.color, c.size,
  ].map(v => String(v ?? '')).join('\t'));
  return `v${SCHEMATIC_GENERATION_VERSION}:${parts.length}:${parts.join('|')}`;
}

export class TwinLayoutStore {
  static getSchematic(projectCode: string, frameId: string): TwinPanelLayout | null {
    const p = schematicPath(projectCode, frameId);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as TwinPanelLayout;
    } catch {
      return null;
    }
  }

  static saveSchematic(projectCode: string, frameId: string, layout: TwinPanelLayout): void {
    const dir = twinLayoutDir(projectCode);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = schematicPath(projectCode, frameId) + '.tmp';
    const final = schematicPath(projectCode, frameId);
    fs.writeFileSync(tmp, JSON.stringify(layout, null, 2), 'utf8');
    fs.renameSync(tmp, final);
  }

  /**
   * Return a cached schematic when the schedule fingerprint matches; otherwise
   * regenerate, persist, and return. Deterministic for identical schedules.
   */
  static getOrBuildSchematic(
    projectCode: string,
    frameId: string,
    cables: SchematicCableInput[],
    drawingRevision: string | null,
  ): TwinPanelLayout {
    const fingerprint = scheduleFingerprint(cables);
    const existing = TwinLayoutStore.getSchematic(projectCode, frameId);
    if (
      existing
      && existing.drawingMode === 'SCHEMATIC'
      && existing.generationVersion === SCHEMATIC_GENERATION_VERSION
      && existing.scheduleRevision === fingerprint
    ) {
      return existing;
    }
    const layout = generateSchematicLayout(frameId, cables, {
      scheduleRevision: fingerprint,
      drawingRevision,
    });
    TwinLayoutStore.saveSchematic(projectCode, frameId, layout);
    return layout;
  }
}
