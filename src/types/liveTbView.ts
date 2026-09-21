import type { TBMarkerMatchCandidate } from './tbMarker';

/**
 * V2 Tranche 2 endpoint classification.
 *
 * TB_TERMINAL       – Physical terminal-block terminal (X-series header, pin identified)
 * EQUIPMENT_CONNECTOR – Equipment with a connector sub-address (e.g. 87STUB → X420 pin 2)
 * EQUIPMENT_TERMINAL  – Equipment with a direct terminal pin (e.g. QDC1 → pin 4)
 * UNKNOWN           – Cannot classify from schedule data alone
 *
 * Legacy aliases (TB_GROUP / DEVICE / DEVICE_TERMINAL) are mapped automatically.
 */
export type EndpointKind =
  | 'TB_TERMINAL'
  | 'EQUIPMENT_CONNECTOR'
  | 'EQUIPMENT_TERMINAL'
  | 'UNKNOWN';

/** @deprecated Use EndpointKind. Kept for backward-compat with V1 match pipeline. */
export type LiveTbEndpointType = 'TB_GROUP' | 'DEVICE' | 'DEVICE_TERMINAL' | 'UNKNOWN';

/** Map V2 EndpointKind → V1 LiveTbEndpointType for backward-compat paint paths. */
export function endpointKindToLegacy(kind: EndpointKind): LiveTbEndpointType {
  switch (kind) {
    case 'TB_TERMINAL': return 'TB_GROUP';
    case 'EQUIPMENT_CONNECTOR': return 'DEVICE_TERMINAL';
    case 'EQUIPMENT_TERMINAL': return 'DEVICE_TERMINAL';
    case 'UNKNOWN': return 'UNKNOWN';
  }
}

/** Map V1 LiveTbEndpointType → best-effort V2 EndpointKind. */
export function legacyToEndpointKind(legacy: LiveTbEndpointType): EndpointKind {
  switch (legacy) {
    case 'TB_GROUP': return 'TB_TERMINAL';
    case 'DEVICE': return 'EQUIPMENT_TERMINAL';
    case 'DEVICE_TERMINAL': return 'EQUIPMENT_CONNECTOR';
    case 'UNKNOWN': return 'UNKNOWN';
  }
}

/** Provenance metadata for V2 classification. */
export interface EndpointProvenance {
  source: 'schedule_header' | 'embedded_terminal' | 'inferred' | 'manual_mapping';
  /** Original schedule DEV_TBLK value. */
  devTblk: string | null;
  /** Original schedule TERM value. */
  term: string | null;
  /** Connector sub-address extracted from TERM (e.g. X420 from X420:2). */
  connector: string | null;
  /** Pin extracted from TERM (e.g. 2 from X420:2). */
  pin: string | null;
}

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
  /* ── V2 Tranche 2: typed endpoint classification ── */
  source_endpoint_kind?: EndpointKind;
  dest_endpoint_kind?: EndpointKind;
  source_provenance?: EndpointProvenance;
  dest_provenance?: EndpointProvenance;
};

export type LiveTbHighlight = {
  source: TBMarkerMatchCandidate | null;
  destination: TBMarkerMatchCandidate | null;
};
