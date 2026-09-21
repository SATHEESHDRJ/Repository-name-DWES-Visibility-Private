/**
 * Drawing / OCR / oversized-preview job lifecycle helpers.
 * States: QUEUED | PROCESSING | READY | PARTIAL | FAILED
 */

import type { DrawingJobLifecycle } from './oversized-page.util';

export type DrawingProcessJob = {
  id: string;
  project_code: string;
  frame_id: string;
  drawing_checksum: string;
  status: DrawingJobLifecycle;
  stage: 'upload' | 'preview' | 'ocr' | 'classify' | 'persist' | 'done';
  reason: string | null;
  preview_cache_key: string | null;
  created_at: string;
  updated_at: string;
};

const jobs = new Map<string, DrawingProcessJob>();

export function makeJobId(project: string, frame: string, checksum: string): string {
  return `${project}::${frame}::${checksum || 'nochecksum'}`;
}

export function upsertDrawingJob(
  partial: Omit<DrawingProcessJob, 'created_at' | 'updated_at'> & {
    created_at?: string;
    updated_at?: string;
  },
): DrawingProcessJob {
  const now = new Date().toISOString();
  const existing = jobs.get(partial.id);
  const next: DrawingProcessJob = {
    id: partial.id,
    project_code: partial.project_code,
    frame_id: partial.frame_id,
    drawing_checksum: partial.drawing_checksum,
    status: partial.status,
    stage: partial.stage,
    reason: partial.reason ?? null,
    preview_cache_key: partial.preview_cache_key ?? null,
    created_at: existing?.created_at || partial.created_at || now,
    updated_at: now,
  };
  jobs.set(next.id, next);
  return next;
}

export function getDrawingJob(id: string): DrawingProcessJob | null {
  return jobs.get(id) || null;
}

export function listDrawingJobs(): DrawingProcessJob[] {
  return [...jobs.values()];
}

/** Test-only reset */
export function _resetDrawingJobsForTests(): void {
  jobs.clear();
}

export function advanceLifecycle(
  current: DrawingJobLifecycle,
  event: 'start' | 'preview_ready' | 'ocr_partial' | 'complete' | 'fail',
  reason?: string | null,
): { status: DrawingJobLifecycle; reason: string | null } {
  if (event === 'fail') return { status: 'FAILED', reason: reason || 'failed' };
  if (event === 'start') return { status: 'PROCESSING', reason: null };
  if (event === 'ocr_partial') return { status: 'PARTIAL', reason: reason || 'oversized_preview_ocr' };
  if (event === 'preview_ready') {
    if (current === 'FAILED') return { status: 'FAILED', reason: current === 'FAILED' ? reason || null : null };
    return { status: 'PARTIAL', reason: reason || 'preview_ready_awaiting_full' };
  }
  if (event === 'complete') return { status: 'READY', reason: null };
  return { status: current, reason: reason ?? null };
}
