/**
 * Formal LIVE TB debug channel (Phase 5).
 * Enabled only when DWES_LIVE_TB_DEBUG=1 (or true/yes).
 * Never dumps production PII to technicians; server-side NDJSON only.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { LiveTbDebugVerdict, LiveTbFailedStage } from './live-tb-contracts';

export function isLiveTbDebugEnabled(): boolean {
  const v = String(process.env.DWES_LIVE_TB_DEBUG || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export type LiveTbDebugEvent = {
  ts?: number;
  location: string;
  message: string;
  verdict?: LiveTbDebugVerdict | string;
  failed_stage?: LiveTbFailedStage | string;
  project_code?: string;
  frame_id?: string;
  data?: Record<string, unknown>;
};

function debugLogPath(): string {
  const override = process.env.DWES_LIVE_TB_DEBUG_LOG || '';
  if (override) return override;
  // Prefer container uploads mount; fall back to backend local uploads.
  const candidates = [
    '/app/uploads/live-tb-debug.ndjson',
    path.join(process.cwd(), 'uploads', 'live-tb-debug.ndjson'),
  ];
  return candidates[0];
}

/**
 * Always-on Cursor debug-session ingest (session 683e2a).
 * Posts to host ingest from Nest (Docker → host.docker.internal).
 */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre-fix',
): void {
  // #region agent log
  const payload = {
    sessionId: '683e2a',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);
  for (const base of [
    'http://host.docker.internal:7303/ingest/7a2db7e4-0cbf-4ef7-9ba6-83226f033989',
    'http://127.0.0.1:7303/ingest/7a2db7e4-0cbf-4ef7-9ba6-83226f033989',
  ]) {
    try {
      fetch(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '683e2a',
        },
        body,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  try {
    const line = body + '\n';
    for (const dest of [
      '/app/uploads/debug-683e2a.ndjson',
      path.join(process.cwd(), 'uploads', 'debug-683e2a.ndjson'),
    ]) {
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.appendFileSync(dest, line);
        break;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* ignore */
  }
  // #endregion
}

/** Structured NDJSON append — no-op unless DWES_LIVE_TB_DEBUG is on. */
export function liveTbServerDebug(event: LiveTbDebugEvent): void {
  if (!isLiveTbDebugEnabled()) return;
  try {
    const line =
      JSON.stringify({
        ...event,
        ts: event.ts || Date.now(),
        channel: 'DWES_LIVE_TB_DEBUG',
      }) + '\n';
    const dest = debugLogPath();
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
    } catch {
      /* ignore */
    }
    fs.appendFileSync(dest, line);
  } catch {
    /* never break product path */
  }
}

export function classifyLiveTbVerdict(input: {
  scheduleDrawingMismatch?: boolean;
  headersLegendOnly?: string[];
  headersUnresolved?: string[];
  hasPaint?: boolean;
  noGa?: boolean;
  analysisFailed?: boolean;
}): { verdict: LiveTbDebugVerdict; failed_stage: LiveTbFailedStage } {
  if (input.noGa) {
    return { verdict: 'E_DATA_CONFIGURATION_ISSUE', failed_stage: 'drawing_lookup' };
  }
  if (input.scheduleDrawingMismatch || (input.headersLegendOnly || []).length) {
    const failed_stage: LiveTbFailedStage = input.headersLegendOnly?.length
      ? 'legend_rejection'
      : 'excel_ga_cross_verification';
    return {
      verdict: 'A_SCHEDULE_DRAWING_MISMATCH',
      failed_stage,
    };
  }
  if ((input.headersUnresolved || []).length && !input.hasPaint) {
    return {
      verdict: 'B_DETECTION_PIPELINE_DEFECT',
      failed_stage: 'physical_strip_detection',
    };
  }
  if (input.analysisFailed && !input.hasPaint) {
    return { verdict: 'F_EXPECTED_SAFE_FAILURE', failed_stage: 'excel_ga_cross_verification' };
  }
  if (input.hasPaint) {
    return { verdict: 'F_EXPECTED_SAFE_FAILURE', failed_stage: 'none' };
  }
  return { verdict: 'F_EXPECTED_SAFE_FAILURE', failed_stage: 'match_api' };
}
