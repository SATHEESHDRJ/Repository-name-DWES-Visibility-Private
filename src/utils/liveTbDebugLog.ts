/**
 * LIVE TB FE debug logger — optional gated API sink.
 * Enabled when localStorage DWES_LIVE_TB_DEBUG=1 or VITE_DWES_LIVE_TB_DEBUG=1.
 */
export function liveTbDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId = 'overlay',
) {
  try {
    const enabled =
      (typeof localStorage !== 'undefined' && localStorage.getItem('DWES_LIVE_TB_DEBUG') === '1')
      || (typeof import.meta !== 'undefined'
        && String((import.meta as any).env?.VITE_DWES_LIVE_TB_DEBUG || '') === '1');
    if (!enabled) return;
    const token = localStorage.getItem('dwes_token')
      || sessionStorage.getItem('dwes_token')
      || '';
    fetch('/api/debug/client-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        location,
        message,
        data,
        hypothesisId,
        runId: 'live-tb-debug',
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
