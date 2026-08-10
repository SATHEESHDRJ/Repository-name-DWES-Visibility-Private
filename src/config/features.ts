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
 * Panel 3D / Flat-3D surface features (Generated 3D View, Upload/Replace 3D,
 * Engineering 3D, Flat 3D plan tab in Cable Digital Twin, 3D generation and
 * dimension-entry controls, 3D revision history, side-by-side 3D verification).
 *
 * Hard-disabled for the GA workflow cleanup: Supervisor 3D Model access is removed.
 * Existing 3D/geometry data, uploaded models, and backend routes stay intact — this
 * only hides user-facing 3D-branded surfaces. Do not re-enable via env without an
 * explicit product decision.
 */
export const PANEL_3D_ENABLED: boolean = false;

/**
 * Live 3D Operational Twin feature flag.
 *
 * When enabled, the DigitalWiringFrame and SupervisorOperationalTwinMonitor show
 * the 3D twin pane alongside the 2D twin. The 2D twin is ALWAYS preserved as fallback.
 * Set `VITE_ENABLE_OPERATIONAL_TWIN_3D=true` to activate.
 *
 * Tablet quality preset: VITE_OT3D_QUALITY=tablet|desktop
 *   tablet  — reduced draw calls, no shadows, lower texture resolution.
 *   desktop — full quality (default).
 *
 * The current 3D implementation consumes the legacy GA Foundation contract.
 * Keep that integration isolated until the replacement GA plan is specified;
 * the implementation and stored GA data remain intact and can be reconnected
 * deliberately as part of that future work.
 */
const LEGACY_GA_FOUNDATION_INTEGRATION_ENABLED = false;

export const OPERATIONAL_TWIN_3D_ENABLED: boolean =
  LEGACY_GA_FOUNDATION_INTEGRATION_ENABLED
  && envFlag(import.meta.env.VITE_ENABLE_OPERATIONAL_TWIN_3D);

export const OT3D_QUALITY: 'tablet' | 'desktop' =
  String(import.meta.env.VITE_OT3D_QUALITY ?? '').trim().toLowerCase() === 'tablet'
    ? 'tablet'
    : 'desktop';

/**
 * QA/QC inspection workflow before Director submission.
 *
 * Default off: completed panels may be submitted by the Production Supervisor
 * without QA/QC review. Set `VITE_QA_QC_WORKFLOW_ENABLED=true` to restore gates.
 */
export const QA_QC_WORKFLOW_ENABLED: boolean = envFlag(import.meta.env.VITE_QA_QC_WORKFLOW_ENABLED);

/**
 * LIVE TB Director presentation Demo View (frontend-only overlays).
 * When false: DEMO VIEW button hidden; no demo code paths run.
 * Never influences Match API, analysis, or TB_GROUP persistence.
 */
export const LIVE_TB_DEMO_ENABLED: boolean = envFlag(import.meta.env.VITE_LIVE_TB_DEMO_ENABLED);
