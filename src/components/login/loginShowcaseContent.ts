/** Master UI-01 login showcase copy — presentation only (no auth logic). */

export type LoginShowcaseFeature = {
  id: 'realtime' | 'workflows' | 'traceability';
  title: string;
  body: string;
  icon: 'zap' | 'clipboard' | 'shield';
};

export const LOGIN_SHOWCASE_FEATURES: readonly LoginShowcaseFeature[] = [
  {
    id: 'realtime',
    title: 'REAL-TIME EXECUTION',
    body: 'Track field execution as work progresses.',
    icon: 'zap',
  },
  {
    id: 'workflows',
    title: 'DIGITAL WORKFLOWS',
    body: 'Replace paper-based wiring execution.',
    icon: 'clipboard',
  },
  {
    id: 'traceability',
    title: 'COMPLETE TRACEABILITY',
    body: 'Maintain wire-level execution history.',
    icon: 'shield',
  },
] as const;

export const LOGIN_SUPPORT_LINE =
  'Digital execution, verification and traceability for industrial wiring.';

export const LOGIN_TRUST_LINE =
  'Secure platform for industrial wiring execution teams.';

/** Map store/API messages to a calm inline error — never expose internals. */
export function formatLoginErrorMessage(raw: string | null | undefined): string {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econn') ||
    lower.includes('failed to fetch') ||
    lower.includes('backend is not available')
  ) {
    return 'Unable to sign in.\nA network or server problem occurred. Try again in a moment.';
  }
  return 'Unable to sign in.\nCheck your username and password and try again.';
}
