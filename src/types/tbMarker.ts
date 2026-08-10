export type TbMarkerType = 'SOURCE_GROUP' | 'DESTINATION_GROUP' | 'TB_GROUP';

export type TBMarkerGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type TBMarker = {
  id: number;
  project_code: string;
  frame_id: string;
  drawing_asset_id?: number | null;
  page_number: number;
  view_name?: string | null;
  marker_type: TbMarkerType;
  tb_number: string;
  terminal_group: string;
  geometry: TBMarkerGeometry;
  notes?: string | null;
  drawing_revision?: string | null;
  drawing_checksum?: string | null;
  detection_method?: string | null;
  confidence_score?: number | null;
  marker_status?: string | null;
};

export type TBMarkerMatchCandidate = {
  id: number;
  marker_type: TbMarkerType;
  tb_number: string;
  terminal_group: string;
  page_number: number;
  view_name?: string | null;
  notes?: string | null;
  geometry: TBMarkerGeometry & {
    paint_mode?: string;
    target_terminal?: string;
    view_classification?: string;
    terminal_cells?: Record<string, TBMarkerGeometry>;
    /** Complete physical TB strip/group bbox — preferred for LIVE TB paint. */
    strip_bbox?: TBMarkerGeometry | null;
    stripBbox?: TBMarkerGeometry | null;
    tb_header?: string;
  };
  matched_terminal?: string | null;
  view_classification?: string | null;
};

export type TBMarkerMatchResponse = {
  source_marker_candidates: TBMarkerMatchCandidate[];
  destination_marker_candidates: TBMarkerMatchCandidate[];
  best_source: TBMarkerMatchCandidate | null;
  best_destination: TBMarkerMatchCandidate | null;
  source_unmatched: boolean;
  destination_unmatched: boolean;
  source_match_reason: string;
  destination_match_reason: string;
  source_candidate_count?: number;
  destination_candidate_count?: number;
  drawing_checksum_applied?: string | null;
  superseded_excluded?: number;
  /** True when both ends resolve to the same physical TB group. */
  same_physical_group?: boolean;
};

export type TbCompletionOverviewGroup = {
  id: number;
  tb_number: string;
  terminal_group: string;
  page_number: number;
  geometry: TBMarkerGeometry;
  status: string;
  colour: string;
  total_wires: number;
  completed: number;
  skipped: number;
  open_ends: number;
  corrections: number;
};
