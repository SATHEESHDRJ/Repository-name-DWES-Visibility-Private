import type { Cable } from '../data/mock-store';
import { extractPdfText } from './pdf-text';
import {
  classifyDrawingRole,
  detectViews,
  extractComponents,
  extractDimensions,
} from './drawing-extract';
import { compareScheduleToDrawing } from './schedule-compare';

export type ExtractConfidence = 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'REVIEW_REQUIRED' | 'UNRESOLVED';

export interface SourcedField<T = string | number | boolean | null> {
  value: T;
  confidence: ExtractConfidence;
  source: string;
  source_page?: string | null;
  source_entity?: string | null;
}

export interface AutoExtractFormPayload {
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  doors: number | null;
  mounting_plate: boolean | null;
  gland_plate: boolean | null;
  base_frame: boolean | null;
  base_frame_height_mm: number | null;
  wire_troughs: number | null;
  terminal_rows: number | null;
  din_rails_detected: number | null;
  components: Array<{ label: string; type: string; confidence: ExtractConfidence; source: string }>;
}

export interface AutoExtractResult {
  scanned_sources: Array<{ drawing_id: string; original_name: string; role: string; pages_scanned: number; text_quality: number }>;
  views_detected: string[];
  fields: {
    width_mm: SourcedField<number | null>;
    height_mm: SourcedField<number | null>;
    depth_mm: SourcedField<number | null>;
    doors: SourcedField<number | null>;
    mounting_plate: SourcedField<boolean | null>;
    gland_plate: SourcedField<boolean | null>;
    base_frame: SourcedField<boolean | null>;
    base_frame_height_mm: SourcedField<number | null>;
    wire_troughs: SourcedField<number | null>;
    terminal_rows: SourcedField<number | null>;
    din_rails_detected: SourcedField<number | null>;
  };
  components: Array<SourcedField<string> & { type: string; label: string }>;
  schedule_match: {
    matched_tags: string[];
    missing_schedule_tags: string[];
    duplicate_drawing_tags: Record<string, number>;
    drawing_only_tags: string[];
  };
  form: AutoExtractFormPayload;
  notes: string[];
  auto_fix: AutoFixReport;
}

export interface AutoFixReport {
  issues: Array<{ code: string; severity: 'error' | 'warn'; message: string; field?: string }>;
  can_regenerate: boolean;
}

/** Exact schedule key — preserve = + - : / . ; only strip whitespace. */
export function exactTagKey(value: string): string {
  return String(value ?? '').replace(/\s+/g, '');
}

function scheduleTagsFromCables(cables: Cable[]): string[] {
  const tags = new Set<string>();
  for (const c of cables) {
    for (const raw of [c.source_device, c.dest_device, c.ref]) {
      const t = String(raw ?? '').trim();
      if (t) tags.add(t);
    }
  }
  return [...tags];
}

function dimConfidence(conf: number): ExtractConfidence {
  if (conf >= 0.85) return 'CONFIRMED';
  if (conf >= 0.65) return 'HIGH_CONFIDENCE';
  if (conf >= 0.35) return 'REVIEW_REQUIRED';
  return 'UNRESOLVED';
}

function textFeatureConfidence(found: boolean, strong: boolean): ExtractConfidence {
  if (!found) return 'UNRESOLVED';
  return strong ? 'HIGH_CONFIDENCE' : 'REVIEW_REQUIRED';
}

function emptyField<T>(value: T): SourcedField<T> {
  return { value, confidence: 'UNRESOLVED', source: 'not detected', source_page: null, source_entity: null };
}

function fieldFromDim(
  value: number | null,
  conf: number,
  sourceName: string,
  page?: string,
): SourcedField<number | null> {
  if (value === null) return emptyField(null);
  return {
    value,
    confidence: dimConfidence(conf),
    source: sourceName,
    source_page: page ?? null,
    source_entity: null,
  };
}

function splitPdfPages(text: string): string[] {
  if (!text) return [];
  const byFormFeed = text.split(/\f+/).filter(Boolean);
  if (byFormFeed.length > 1) return byFormFeed;
  const chunks = text.split(/\n{4,}/).filter(p => p.trim().length > 40);
  return chunks.length > 1 ? chunks : [text];
}

function pageLabel(index: number, role: string): string {
  return `page ${index + 1}${role !== 'unknown' ? ` (${role})` : ''}`;
}

export function runAutoExtract(args: {
  sources: Array<{ id: string; original_name: string; buffer: Buffer }>;
  cables: Cable[];
  cadManifest?: Record<string, unknown> | null;
}): AutoExtractResult {
  const notes: string[] = [];
  const scanned_sources: AutoExtractResult['scanned_sources'] = [];
  let combinedText = '';
  let bestTextQuality = 0;
  const pageTexts: Array<{ page: string; role: string; text: string }> = [];

  for (const src of args.sources) {
    const name = src.original_name;
    if (/\.pdf$/i.test(name)) {
      const extracted = extractPdfText(src.buffer);
      const pages = splitPdfPages(extracted.text);
      pages.forEach((chunk, i) => {
        const role = classifyDrawingRole(name, chunk);
        pageTexts.push({ page: pageLabel(i, role), role, text: chunk });
        combinedText += (combinedText ? '\n\n' : '') + chunk;
      });
      bestTextQuality = Math.max(bestTextQuality, extracted.quality);
      notes.push(...extracted.notes.map(n => `${name}: ${n}`));
      scanned_sources.push({
        drawing_id: src.id,
        original_name: name,
        role: classifyDrawingRole(name, extracted.text),
        pages_scanned: Math.max(1, pages.length),
        text_quality: extracted.quality,
      });
    } else if (/\.(dwg|dxf)$/i.test(name)) {
      notes.push(`${name}: CAD geometry requires DXF parse — merge flat3d manifest when available.`);
      scanned_sources.push({
        drawing_id: src.id,
        original_name: name,
        role: 'ga',
        pages_scanned: 1,
        text_quality: 0,
      });
    } else {
      notes.push(`${name}: format not scanned for auto-fill (no text/CAD extract in this pass).`);
    }
  }

  const views = detectViews(combinedText);
  for (const pt of pageTexts) {
    if (pt.role !== 'unknown' && !views.includes(pt.role as typeof views[number])) {
      views.push(pt.role as typeof views[number]);
    }
  }

  const dims = extractDimensions(combinedText, bestTextQuality);
  let widthSource = 'drawing text';
  let heightSource = 'drawing text';
  let depthSource = 'drawing text';
  let widthPage: string | undefined;
  let heightPage: string | undefined;
  let depthPage: string | undefined;

  for (const pt of pageTexts) {
    if (!['ga', 'internal', 'construction', 'front'].includes(pt.role)) continue;
    const d = extractDimensions(pt.text, bestTextQuality);
    if (dims.width.value_mm === null && d.width.value_mm !== null) {
      dims.width = d.width;
      widthSource = pt.role;
      widthPage = pt.page;
    }
    if (dims.height.value_mm === null && d.height.value_mm !== null) {
      dims.height = d.height;
      heightSource = pt.role;
      heightPage = pt.page;
    }
    if (dims.depth.value_mm === null && d.depth.value_mm !== null) {
      dims.depth = d.depth;
      depthSource = pt.role;
      depthPage = pt.page;
    }
  }

  const manifest = args.cadManifest as {
    normalized?: { panel_extents_mm?: { width?: number; height?: number } };
    objects?: Array<{ kind?: string; device_tag?: string; confidence?: string; source_handle?: string; source_layer?: string }>;
    schedule_match?: { duplicate_tags?: Record<string, number>; unmatched_schedule_tags?: string[]; matched?: Array<{ object_tag: string }> };
  } | null;

  if (manifest?.normalized?.panel_extents_mm) {
    const pe = manifest.normalized.panel_extents_mm;
    if (pe.width && pe.width > 0) {
      dims.width = { value_mm: pe.width, source: 'extracted', confidence: 0.9 };
      widthSource = 'CAD panel envelope';
      widthPage = 'model space';
    }
    if (pe.height && pe.height > 0) {
      dims.height = { value_mm: pe.height, source: 'extracted', confidence: 0.9 };
      heightSource = 'CAD panel envelope';
      heightPage = 'model space';
    }
  }

  const internalDetected = views.includes('internal') || views.includes('apparatus_list');
  const glandDetected = /\bgland\s*plate\b/i.test(combinedText);
  const baseDetected = /\b(base\s*frame|plinth|base\s*channel)\b/i.test(combinedText);
  const troughDetected = /\b(trunking|wire\s*(trough|duct)|cable\s*duct)\b/i.test(combinedText);
  const dinCountText = (combinedText.match(/\bdin\s*rail\b/gi) || []).length;
  const dinCountCad = (manifest?.objects || []).filter(o => o.kind === 'din_rail').length;
  const dinCount = Math.max(dinCountText, dinCountCad);

  const terminalRowsText = (combinedText.match(/\bterminal\s*(row|block)s?\b/gi) || []).length;
  const terminalRowsCad = (manifest?.objects || []).filter(o => o.kind === 'terminal_block').length;
  const terminalRows = terminalRowsCad > 0 ? terminalRowsCad : terminalRowsText > 0 ? 1 : null;

  const extractedComponents = extractComponents(combinedText);
  const cadDevices = (manifest?.objects || [])
    .filter(o => o.device_tag && o.confidence === 'CONFIRMED')
    .map(o => ({
      label: String(o.device_tag),
      type: String(o.kind || 'device'),
      confidence: 'CONFIRMED' as ExtractConfidence,
      source: `CAD ${o.source_handle || ''} layer ${o.source_layer || ''}`.trim(),
    }));

  const scheduleTags = scheduleTagsFromCables(args.cables);
  const drawingTagCounts = new Map<string, number>();
  const drawingTagsDisplay: string[] = [];

  for (const comp of extractedComponents) {
    const key = exactTagKey(comp.label);
    if (!key) continue;
    drawingTagCounts.set(key, (drawingTagCounts.get(key) || 0) + 1);
    if (!drawingTagsDisplay.includes(comp.label)) drawingTagsDisplay.push(comp.label);
  }
  for (const d of cadDevices) {
    const key = exactTagKey(d.label);
    drawingTagCounts.set(key, (drawingTagCounts.get(key) || 0) + 1);
    if (!drawingTagsDisplay.includes(d.label)) drawingTagsDisplay.push(d.label);
  }

  const matched_tags: string[] = [];
  const missing_schedule_tags: string[] = [];
  for (const tag of scheduleTags) {
    if (drawingTagCounts.has(exactTagKey(tag))) matched_tags.push(tag);
    else missing_schedule_tags.push(tag);
  }

  const duplicate_drawing_tags: Record<string, number> = {};
  for (const [k, n] of drawingTagCounts) {
    if (n > 1) duplicate_drawing_tags[k] = n;
  }

  const comparison = compareScheduleToDrawing(args.cables, combinedText);
  const drawing_only_tags = comparison.drawing_only_references.map(r => r);

  const components: AutoExtractResult['components'] = [];
  const seenComp = new Set<string>();
  for (const c of [...cadDevices, ...extractedComponents.map(ec => ({
    label: ec.label,
    type: ec.type,
    confidence: scheduleTags.some(t => exactTagKey(t) === exactTagKey(ec.label))
      ? 'CONFIRMED' as ExtractConfidence
      : 'REVIEW_REQUIRED' as ExtractConfidence,
    source: 'drawing text',
  }))]) {
    const key = `${c.type}:${exactTagKey(c.label)}`;
    if (seenComp.has(key)) continue;
    seenComp.add(key);
    components.push({
      label: c.label,
      type: c.type,
      value: c.label,
      confidence: c.confidence,
      source: c.source,
      source_page: null,
      source_entity: null,
    });
  }

  const fields: AutoExtractResult['fields'] = {
    width_mm: fieldFromDim(dims.width.value_mm, dims.width.confidence, widthSource, widthPage),
    height_mm: fieldFromDim(dims.height.value_mm, dims.height.confidence, heightSource, heightPage),
    depth_mm: fieldFromDim(dims.depth.value_mm, dims.depth.confidence, depthSource, depthPage),
    doors: emptyField<number | null>(null),
    mounting_plate: {
      value: internalDetected ? true : null,
      confidence: textFeatureConfidence(internalDetected, internalDetected),
      source: internalDetected ? 'internal layout view detected' : 'not detected',
      source_page: null,
      source_entity: null,
    },
    gland_plate: {
      value: glandDetected ? true : null,
      confidence: textFeatureConfidence(glandDetected, glandDetected),
      source: glandDetected ? 'gland plate text' : 'not detected',
      source_page: null,
      source_entity: null,
    },
    base_frame: {
      value: baseDetected ? true : null,
      confidence: textFeatureConfidence(baseDetected, baseDetected),
      source: baseDetected ? 'base frame text' : 'not detected',
      source_page: null,
      source_entity: null,
    },
    base_frame_height_mm: {
      value: baseDetected ? 100 : null,
      confidence: (baseDetected ? 'REVIEW_REQUIRED' : 'UNRESOLVED') as ExtractConfidence,
      source: baseDetected ? 'typical 100 mm unless dimensioned' : 'not detected',
      source_page: null,
      source_entity: null,
    },
    wire_troughs: {
      value: troughDetected ? 2 : null,
      confidence: textFeatureConfidence(troughDetected, false),
      source: troughDetected ? 'duct/trunking keywords' : 'not detected',
      source_page: null,
      source_entity: null,
    },
    terminal_rows: {
      value: terminalRows,
      confidence: (terminalRows != null ? 'HIGH_CONFIDENCE' : 'UNRESOLVED') as ExtractConfidence,
      source: terminalRowsCad ? 'CAD terminal blocks' : terminalRowsText ? 'terminal row text' : 'not detected',
      source_page: null,
      source_entity: null,
    },
    din_rails_detected: {
      value: dinCount > 0 ? dinCount : null,
      confidence: (dinCount > 0 ? 'HIGH_CONFIDENCE' : 'UNRESOLVED') as ExtractConfidence,
      source: dinCountCad ? 'CAD DIN rails' : dinCountText ? 'DIN rail text' : 'not detected',
      source_page: null,
      source_entity: null,
    },
  };

  // Door count from text only — never assume a default door count.
  const doorMatch = combinedText.match(/\b(\d)\s*[- ]?\s*door/i);
  if (doorMatch) {
    fields.doors = {
      value: Number(doorMatch[1]),
      confidence: 'HIGH_CONFIDENCE',
      source: 'door count text',
      source_page: null,
      source_entity: null,
    };
  }

  const form: AutoExtractFormPayload = {
    width_mm: fields.width_mm.value,
    height_mm: fields.height_mm.value,
    depth_mm: fields.depth_mm.value,
    doors: fields.doors.value,
    mounting_plate: fields.mounting_plate.value,
    gland_plate: fields.gland_plate.value,
    base_frame: fields.base_frame.value,
    base_frame_height_mm: fields.base_frame_height_mm.value,
    wire_troughs: fields.wire_troughs.value,
    terminal_rows: fields.terminal_rows.value,
    din_rails_detected: fields.din_rails_detected.value,
    components: components.map(c => ({
      label: c.label,
      type: c.type,
      confidence: c.confidence,
      source: c.source,
    })),
  };

  const auto_fix = buildAutoFixReport(form, fields, duplicate_drawing_tags, missing_schedule_tags);

  return {
    scanned_sources,
    views_detected: views,
    fields,
    components,
    schedule_match: {
      matched_tags,
      missing_schedule_tags,
      duplicate_drawing_tags,
      drawing_only_tags,
    },
    form,
    notes: [...dims.notes, ...notes].slice(0, 40),
    auto_fix,
  };
}

export function buildAutoFixReport(
  form: AutoExtractFormPayload,
  fields: Pick<AutoExtractResult['fields'], 'width_mm' | 'height_mm' | 'depth_mm'>,
  duplicateTags: Record<string, number>,
  missingSchedule: string[],
): AutoFixReport {
  const issues: AutoFixReport['issues'] = [];
  for (const key of ['width_mm', 'height_mm', 'depth_mm'] as const) {
    const f = fields[key];
    if (f.value === null) {
      issues.push({ code: 'missing_dimension', severity: 'error', message: `${key.replace('_mm', '')} not resolved — enter manually or upload GA/CAD with dimensions.`, field: key });
    } else if (f.confidence === 'REVIEW_REQUIRED' || f.confidence === 'UNRESOLVED') {
      issues.push({ code: 'low_confidence_dimension', severity: 'warn', message: `${key} is ${f.confidence} (${f.source}).`, field: key });
    }
  }
  for (const [tag, n] of Object.entries(duplicateTags)) {
    issues.push({ code: 'duplicate_tag', severity: 'warn', message: `Drawing tag "${tag}" appears ${n} times.`, field: 'components' });
  }
  for (const tag of missingSchedule.slice(0, 20)) {
    issues.push({ code: 'missing_schedule_tag', severity: 'warn', message: `Schedule tag "${tag}" not found on drawing.`, field: 'components' });
  }
  if (form.width_mm && form.height_mm && form.depth_mm) {
    if (form.width_mm > 4000 || form.height_mm > 3200 || form.depth_mm > 2500) {
      issues.push({ code: 'out_of_bounds', severity: 'warn', message: 'One or more enclosure dimensions exceed typical panel bounds — check units (mm vs inches).', field: 'enclosure' });
    }
  }
  const can_regenerate = form.width_mm != null && form.height_mm != null && form.depth_mm != null
    && fields.width_mm.confidence !== 'UNRESOLVED'
    && fields.height_mm.confidence !== 'UNRESOLVED'
    && fields.depth_mm.confidence !== 'UNRESOLVED';

  return { issues, can_regenerate };
}
