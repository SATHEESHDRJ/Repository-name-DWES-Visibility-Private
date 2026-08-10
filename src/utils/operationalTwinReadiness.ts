import type { Ot3dPayload } from '../types/ot3d';

/** True when at least one mapped device includes one or more terminals. */
function hasValidDeviceTerminalMapping(payload: Ot3dPayload): boolean {
  if (!Array.isArray(payload.devices) || payload.devices.length === 0) return false;
  return payload.devices.some(d => Array.isArray(d.terminals) && d.terminals.length > 0);
}

/**
 * 3D Operational Twin requires supervisor-confirmed GA faces, a released asset set,
 * and valid device/terminal mapping. Otherwise the UI shows Twin Not Ready and keeps 2D.
 */
export function isOperationalTwin3dReady(payload: Ot3dPayload | null | undefined): boolean {
  if (!payload) return false;
  if (payload.legacy) return false;
  if (!payload.gaAssetSetId) return false;
  if (!Array.isArray(payload.faces) || payload.faces.length === 0) return false;
  if (payload.releaseStatus && payload.releaseStatus !== 'released') return false;
  if (!hasValidDeviceTerminalMapping(payload)) return false;
  return true;
}
