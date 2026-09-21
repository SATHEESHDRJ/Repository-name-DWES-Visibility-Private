/**
 * Drawing element index — process each uploaded drawing once; cache OCR/geometry.
 * Additive JSON under uploads/drawing-index/<project>/<drawingHash>.json
 * No DDL. Used by LIVE ENDPOINT mapping (TB_GROUP / DEVICE), never invents prep events.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type DrawingElementType = 'TB_GROUP' | 'DEVICE';

export type DrawingViewClass =
  | 'REAR_WIRING_VIEW'
  | 'INTERNAL_VIEW'
  | 'PHYSICAL_TB_BANK'
  | 'PHYSICAL_DEVICE'
  | 'FRONT_VIEW'
  | 'LEGEND_OR_BOM'
  | 'TITLE_BLOCK'
  | 'NOTES'
  | 'EQUIPMENT_LAYOUT'
  | 'UNKNOWN';

export interface DrawingIndexElement {
  element_type: DrawingElementType;
  normalized_reference: string;
  page_number: number;
  bbox: { x: number; y: number; width: number; height: number };
  view_classification: DrawingViewClass;
  extraction_method: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  evidence: {
    region_kind?: string | null;
    nearby?: string | null;
    rejected_reason?: string | null;
    tag_bbox?: { x: number; y: number; width: number; height: number } | null;
  };
}

export interface DrawingIndexDocument {
  drawing_hash: string;
  drawing_path?: string | null;
  project_code: string;
  frame_id?: string | null;
  page_count: number;
  created_at: string;
  updated_at: string;
  searchable: boolean;
  elements: DrawingIndexElement[];
  ocr_cache_key?: string | null;
  notes: string[];
}

function uploadsRoot(): string {
  const dir = process.env.UPLOAD_DIR;
  if (dir) {
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  }
  return path.join(process.cwd(), 'uploads');
}

function indexDir(projectCode: string): string {
  return path.join(uploadsRoot(), 'drawing-index', projectCode);
}

function indexFile(projectCode: string, drawingHash: string): string {
  return path.join(indexDir(projectCode), `${drawingHash}.json`);
}

@Injectable()
export class DrawingIndexService {
  private readonly logger = new Logger(DrawingIndexService.name);

  hashDrawingBytes(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  get(projectCode: string, drawingHash: string): DrawingIndexDocument | null {
    const file = indexFile(projectCode, drawingHash);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as DrawingIndexDocument;
    } catch (err: any) {
      this.logger.warn(`read drawing index ${file}: ${err?.message || err}`);
      return null;
    }
  }

  /** True when a usable cache exists (skip repeating OCR for every wire). */
  hasUsableCache(projectCode: string, drawingHash: string): boolean {
    const doc = this.get(projectCode, drawingHash);
    return !!(doc && Array.isArray(doc.elements));
  }

  upsert(doc: DrawingIndexDocument): DrawingIndexDocument {
    const dir = indexDir(doc.project_code);
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date().toISOString();
    const existing = this.get(doc.project_code, doc.drawing_hash);
    const merged: DrawingIndexDocument = {
      ...doc,
      created_at: existing?.created_at || doc.created_at || now,
      updated_at: now,
      elements: Array.isArray(doc.elements) ? doc.elements : [],
      notes: Array.isArray(doc.notes) ? doc.notes : [],
    };
    fs.writeFileSync(
      indexFile(doc.project_code, doc.drawing_hash),
      JSON.stringify(merged, null, 2),
      'utf8',
    );
    this.logger.log(
      `Drawing index upserted ${doc.project_code}/${doc.drawing_hash.slice(0, 12)} elements=${merged.elements.length}`,
    );
    return merged;
  }

  /**
   * Filter elements eligible for automatic LIVE paint.
   * Rejects directory/BOM/legend/title/notes/front-only reference hits.
   */
  eligibleForAutoPaint(el: DrawingIndexElement): boolean {
    const view = String(el.view_classification || 'UNKNOWN').toUpperCase();
    const rejectViews = new Set([
      'LEGEND_OR_BOM',
      'TITLE_BLOCK',
      'NOTES',
      'EQUIPMENT_LAYOUT',
      'TERMINAL_DIAGRAM',
      'SCHEMATIC',
    ]);
    if (rejectViews.has(view)) return false;
    if (el.evidence?.rejected_reason) return false;
    const region = String(el.evidence?.region_kind || '').toLowerCase();
    if (
      /legend|bom|directory|device_ref|reference_table|title_block|notes/.test(region)
    ) {
      return false;
    }
    if (el.element_type === 'TB_GROUP') {
      return ['REAR_WIRING_VIEW', 'INTERNAL_VIEW', 'PHYSICAL_TB_BANK'].includes(view);
    }
    // DEVICE: verified physical-device layout (incl. FRONT when body geometry verified)
    return ['REAR_WIRING_VIEW', 'INTERNAL_VIEW', 'PHYSICAL_TB_BANK', 'PHYSICAL_DEVICE', 'FRONT_VIEW'].includes(view)
      && el.confidence !== 'NONE'
      && el.confidence !== 'LOW';
  }

  listEligible(
    projectCode: string,
    drawingHash: string,
    normalizedRef?: string,
  ): DrawingIndexElement[] {
    const doc = this.get(projectCode, drawingHash);
    if (!doc) return [];
    const norm = String(normalizedRef || '').replace(/\s+/g, '').toUpperCase();
    return doc.elements.filter(el => {
      if (!this.eligibleForAutoPaint(el)) return false;
      if (!norm) return true;
      return String(el.normalized_reference || '').replace(/\s+/g, '').toUpperCase() === norm;
    });
  }
}
