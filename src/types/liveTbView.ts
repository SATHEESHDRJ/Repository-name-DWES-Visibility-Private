import type { TBMarkerMatchCandidate } from './tbMarker';

export type LiveTbEndpointType = 'TB_GROUP' | 'DEVICE' | 'DEVICE_TERMINAL' | 'UNKNOWN';

/** Snapshot of the technician's current wiring focus for LIVE TB VIEW (frozen at open). */
export type ActiveWireSnapshot = {
  project_code: string;
  frame_id: string;
  assignment_id: number;
  panel_name: string;
  cable_index: number;
  wire_id: string;
  wire_number?: string;
  sno?: string;
  /**
   * Physical source TB header used for GA match (X-series only).
   * Kept as source_device for API compatibility with /tb-markers/match.
   * Empty when the schedule source end is equipment (e.g. 87STUB).
   */
  source_device: string;
  source_terminal: string;
  /** Physical destination TB header; empty when destination is equipment. */
  dest_device: string;
  dest_terminal: string;
  /** Explicit aliases of the physical TB headers used for match. */
  source_tb: string;
  dest_tb: string;
  /** False when neither schedule end resolves to a physical TB header. */
  tb_fields_present: boolean;
  source_tb_from?: 'DEV_TBLK_A' | 'source_device' | '';
  dest_tb_from?: 'DEV_TBLK_B' | 'dest_device' | '';
  /** Original schedule endpoints (equipment or TB) for display. */
  source_equipment?: string;
  source_equipment_terminal?: string;
  dest_equipment?: string;
  dest_equipment_terminal?: string;
  source_is_physical_tb?: boolean;
  dest_is_physical_tb?: boolean;
  /** Per-end classification before Match (TB_GROUP vs DEVICE). */
  source_endpoint_type?: LiveTbEndpointType;
  dest_endpoint_type?: LiveTbEndpointType;
  source_physical_lookup_key?: string;
  dest_physical_lookup_key?: string;
  source_terminal_reference?: string;
  dest_terminal_reference?: string;
  drawing_revision?: string | null;
  drawing_checksum?: string | null;
  /** When true, LIVE TB uses completion overview mode instead of active-wire colours. */
  panel_complete?: boolean;
};

export type LiveTbHighlight = {
  source: TBMarkerMatchCandidate | null;
  destination: TBMarkerMatchCandidate | null;
};
