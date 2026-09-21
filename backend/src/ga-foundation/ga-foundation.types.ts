export const GA_FACES = ['front', 'internal', 'rear', 'custom'] as const;
export type GaFace = (typeof GA_FACES)[number];

/** Per schedule-row correlation summary exposed to wiring schedule UI. */
export type WireRowMatchState = 'matched' | 'suggested' | 'unmatched' | 'exception' | 'unknown';

export interface WireRowCorrelationSummary {
  matchState: WireRowMatchState;
  srcCatalogRef: string | null;
  dstCatalogRef: string | null;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GaViewport {
  width: number;
  height: number;
}

export interface TerminalBlockInput {
  tag: string;
  count: number;
  firstTerminalNumber: string;
  pitch: number;
  orientation: 'horizontal' | 'vertical';
  reversed: boolean;
}

export interface MappingCatalogItemInput {
  stableItemId?: string;
  tag: string;
  type: string;
  description?: string;
  face: GaFace;
  rect: NormalizedRect;
  aliases?: string[];
  terminalBlock?: TerminalBlockInput;
}

export interface SaveMappingCatalogInput {
  gaAssetSetId: string;
  items: MappingCatalogItemInput[];
}

export type CorrelationState =
  | 'exact_match'
  | 'suggested_match'
  | 'not_matched'
  | 'duplicate_or_ambiguous'
  | 'exception_hold';

export type BackgroundJobStatus =
  | 'queued'
  | 'processing'
  | 'review_required'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BackgroundJobHandlerResult {
  status: 'completed' | 'review_required';
  result: Record<string, unknown>;
  providerName?: string;
  providerVersion?: string;
}

export interface BackgroundJobContext {
  id: string;
  jobType: string;
  projectCode: string;
  frameId: string;
  requestedBy: number;
  payload: Record<string, unknown>;
  attempt: number;
}

export type BackgroundJobHandler = (
  context: BackgroundJobContext,
) => Promise<BackgroundJobHandlerResult>;
