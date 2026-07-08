/** Canonical demo seed projects — imported on startup and after dev hard reset. */
export const CANONICAL_SEED_PROJECTS = [
  { code: 'DEWA_Project_001', client: 'DEWA', name: 'DEWA Protection Panel 001', description: 'DEWA substation protection panel', sequence: 1, project_state: 'not_started' },
  { code: 'DEWA_Project_002', client: 'DEWA', name: 'DEWA Control Panel 002', description: 'DEWA control panel installation', sequence: 2, project_state: 'not_started' },
  { code: 'SEWA_Project_001', client: 'SEWA', name: 'SEWA Distribution Panel 001', description: 'SEWA distribution board project', sequence: 1, project_state: 'not_started' },
  { code: 'HITACHI_Project_001', client: 'HITACHI', name: 'Hitachi Control System 001', description: 'Hitachi control system wiring', sequence: 1, project_state: 'not_started' },
  { code: 'FEWA_Project_001', client: 'FEWA', name: 'FEWA Substation Panel 001', description: 'FEWA substation panel wiring', sequence: 1, project_state: 'not_started' },
] as const;
