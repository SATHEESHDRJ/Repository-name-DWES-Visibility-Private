/**
 * DWES frontend feature flags.
 *
 * Flags hide a feature from users without deleting code, data, or files, so the
 * feature can be restored by flipping the flag back on — no re-implementation.
 */

/** Read a Vite env flag; anything other than an explicit "true" is off. */
function envFlag(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

/**
 * Panel 3D model features (Generated 3D View, Upload/Replace 3D, 3D generation and
 * dimension-entry controls, 3D revision history, side-by-side 3D verification).
 *
 * Disabled by default: the Projects area shows a 2D-only drawing viewer. Existing
 * 3D data, uploaded models, and the backend routes are left intact — this only
 * hides the user-facing surface. Set `VITE_ENABLE_PANEL_3D=true` to restore it.
 */
export const PANEL_3D_ENABLED: boolean = envFlag(import.meta.env.VITE_ENABLE_PANEL_3D);
