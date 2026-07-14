import type { Cable } from '../data/mock-store';

export interface ScheduleComparison {
  schedule_rows: number;
  schedule_references: string[];
  drawing_references: string[];
  matched_references: string[];
  schedule_only_references: string[];
  drawing_only_references: string[];
  ambiguous_references: string[];
  unmatched_schedule_rows: number;
  status: 'matched' | 'mismatch' | 'no_schedule' | 'no_drawing_text';
}

/** Normalize common DWES drawing/schedule variations without merging distinct tags. */
export function normalizeReference(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[=+\-\s]/g, '');
}

function refsFromCable(cable: Cable): string[] {
  return [cable.source_device, cable.dest_device, cable.source_terminal, cable.dest_terminal, cable.ref]
    .map(normalizeReference).filter(Boolean);
}

export function extractDrawingReferences(text: string): string[] {
  const refs = new Set<string>();
  const re = /(?:[=+-]\s*)?[A-Z]{1,5}\s*\d{1,4}[A-Z0-9]*/g;
  for (const m of text.matchAll(re)) {
    const ref = normalizeReference(m[0]);
    if (ref.length >= 2) refs.add(ref);
  }
  return [...refs].sort();
}

export function compareScheduleToDrawing(cables: Cable[], drawingText: string): ScheduleComparison {
  const schedule = new Set(cables.flatMap(refsFromCable));
  const drawing = new Set(extractDrawingReferences(drawingText));
  const matched = [...schedule].filter(r => drawing.has(r)).sort();
  const scheduleOnly = [...schedule].filter(r => !drawing.has(r)).sort();
  const drawingOnly = [...drawing].filter(r => !schedule.has(r)).sort();
  return {
    schedule_rows: cables.length,
    schedule_references: [...schedule].sort(),
    drawing_references: [...drawing].sort(),
    matched_references: matched,
    schedule_only_references: scheduleOnly,
    drawing_only_references: drawingOnly,
    ambiguous_references: [],
    unmatched_schedule_rows: scheduleOnly.length,
    status: !cables.length ? 'no_schedule' : !drawingText.trim() ? 'no_drawing_text' : scheduleOnly.length ? 'mismatch' : 'matched',
  };
}
