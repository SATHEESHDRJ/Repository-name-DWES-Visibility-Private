/** Background dashboard poll when tab is idle (events + focus still trigger sooner). */
export const DWES_BACKGROUND_POLL_MS = 45_000;

/** Active wiring workstation sync — longer interval; local state updates on each cable action. */
export const DWES_WIRING_SYNC_MS = 30_000;

/** Report preview modal — static until workflow/frames change. */
export const DWES_REPORT_PREVIEW_POLL_MS = 60_000;
