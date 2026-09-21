import type { ExtendedCableStatus } from '../components/technician/wiring/wiring-utils';

export type WireVisualState = 'pending' | 'in_progress' | 'completed' | 'issue';

export type WireLayerFilter = 'all' | 'completed' | 'pending' | 'in_progress' | 'issues' | 'my_wires';

export const WIRE_STATE_COLORS: Record<WireVisualState, string> = {
  pending: '#6b7280',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  issue: '#ef4444',
};

export const ENDPOINT_COLORS: Record<WireVisualState, string> = {
  pending: '#9ca3af',
  in_progress: '#fbbf24',
  completed: '#16a34a',
  issue: '#dc2626',
};

export function deriveWireVisualState(st: ExtendedCableStatus | undefined): WireVisualState {
  if (!st) return 'pending';
  if (st.issue) return 'issue';
  if (st.src && st.dst) return 'completed';
  if (st.src || st.dst) return 'in_progress';
  return 'pending';
}

export function passesLayerFilter(
  _sno: string | number,
  state: WireVisualState,
  _st: ExtendedCableStatus | undefined,
  filter: WireLayerFilter,
  _currentUserId?: number,
): boolean {
  switch (filter) {
    case 'all': return true;
    case 'completed': return state === 'completed';
    case 'pending': return state === 'pending';
    case 'in_progress': return state === 'in_progress';
    case 'issues': return state === 'issue';
    case 'my_wires':
      if (!_currentUserId) return false;
      if (_st?.technicianId != null && _st.technicianId !== _currentUserId) return false;
      return state !== 'pending';
    default: return true;
  }
}

export function resolveCompletionState(
  st: ExtendedCableStatus | undefined,
): { show: boolean; state: WireVisualState; rework: boolean } {
  if (!st) return { show: false, state: 'pending', rework: false };
  const state = deriveWireVisualState(st);
  const rework = Boolean(st.issue);
  return { show: state === 'completed' || state === 'issue', state, rework };
}

export function buildWireStateMap(
  cables: Array<{ sno?: string | number }>,
  statusMap: Record<string, ExtendedCableStatus>,
): Map<string, WireVisualState> {
  const result = new Map<string, WireVisualState>();
  cables.forEach((cable, i) => {
    const key = String(cable.sno ?? i);
    result.set(key, deriveWireVisualState(statusMap[key]));
  });
  return result;
}
