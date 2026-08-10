import { isPhysicalTbHeader, normalizeDeviceName, classifyLiveTbEndpoint, LiveTbEndpointType } from './terminal-range';

/**
 * PHASE 4: Universal Physical Endpoint Resolver
 * 
 * Resolves Source/Destination endpoints to physical parent entities (TB_GROUP or DEVICE)
 * by examining drawing evidence (GA markers).
 * 
 * COMPLETELY GENERIC: Works for any project, any TB naming convention, any endpoint type.
 * Zero project-specific logic.
 */

/**
 * Location granularity: what level of physical entity was found in the GA
 */
export type LocationGranularity = 'TB_GROUP' | 'DEVICE' | 'UNRESOLVED';

/**
 * Generic resolution output for one endpoint (Source or Destination)
 */
export type EndpointResolution = {
  // Schedule metadata (what the schedule says)
  role: 'SOURCE' | 'DESTINATION';
  scheduleEquipment: string | null;
  scheduleTbHeader: string | null;
  terminalReference: string;

  // Endpoint type (from classification)
  endpointType: LiveTbEndpointType;

  // Physical location result
  locationGranularity: LocationGranularity;
  physicalIdentity: string | null;  // tb_number from marker (TB header or equipment tag)

  // Geometry for painting
  page: number | null;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  } | null;
  viewClassification: string | null;

  // Status and reasons
  status: 'VERIFIED' | 'UNRESOLVED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  reasons: string[];
  evidence: Record<string, unknown>;
};

/**
 * Represents a GA marker (from database)
 */
export type GaMarker = {
  id: number;
  tb_number: string;
  terminal_group: string;
  page_number: number;
  view_name?: string | null;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  } | null;
  view_classification?: string | null;
  detection_method?: string | null;
  marker_type?: string | null;
  marker_status?: string | null;
  drawing_checksum?: string | null;
};

/**
 * Valid view classifications for LIVE TB (where technician should find the physical entity)
 */
const VALID_TB_VIEWS = new Set(['INTERNAL', 'REAR', 'PHYSICAL']);
const VALID_DEVICE_VIEWS = new Set(['FRONT', 'INTERNAL', 'REAR', 'PHYSICAL']);

/**
 * Determine if a marker's view classification is valid for LIVE TB locating
 * 
 * TB_GROUP should be found in internal/rear/physical TB bank views
 * DEVICE should be found in any physical view (front/internal/rear)
 */
function isValidViewForGranularity(view: string | null | undefined, granularity: LocationGranularity): boolean {
  if (!view) return false; // Conservative: require explicit view classification
  if (granularity === 'TB_GROUP') return VALID_TB_VIEWS.has(view);
  if (granularity === 'DEVICE') return VALID_DEVICE_VIEWS.has(view);
  return false;
}

/**
 * Extract geometry bbox from GA marker
 */
function extractGeometry(marker: GaMarker): EndpointResolution['geometry'] {
  if (!marker.geometry) return null;
  const { x, y, width, height, rotation } = marker.geometry;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }
  // Validate bounding box has area
  if (width <= 0.001 || height <= 0.001) return null;
  return { x, y, width, height, ...(rotation != null && { rotation }) };
}

/**
 * GENERIC RESOLUTION: Map endpoint to physical parent entity in GA
 * 
 * Input:
 *   - endpoint: Schedule header/equipment/terminal from wire definition
 *   - gaMarkers: All markers from the GA drawing for this project/frame
 * 
 * Output:
 *   - EndpointResolution: What was found physically, or UNRESOLVED
 * 
 * Works for:
 *   - TB_GROUP endpoints (X5A-C, X9, etc.) → searches for TB header markers
 *   - DEVICE endpoints (87STUB, K01, 74IO, etc.) → searches for equipment tag markers
 *   - DEVICE_TERMINAL endpoints (equipment with terminal ref) → resolves to DEVICE
 *   - UNKNOWN/empty endpoints → returns UNRESOLVED
 */
export function resolvePhysicalParent(input: {
  role: 'SOURCE' | 'DESTINATION';
  scheduleHeader: string | null | undefined;
  scheduleEquipment: string | null | undefined;
  scheduleTerminal: string | null | undefined;
  gaMarkers: GaMarker[];
}): EndpointResolution {
  const { role, scheduleHeader, scheduleEquipment, scheduleTerminal, gaMarkers } = input;

  // Step 1: Classify using schedule TB header OR equipment tag.
  // Equipment ends must pass the equipment header so TERM X* stays DEVICE_TERMINAL
  // metadata (never inferred as TB_GROUP from string shape alone).
  const headerForClassify =
    (scheduleHeader && String(scheduleHeader).trim())
    || (scheduleEquipment && String(scheduleEquipment).trim())
    || null;
  const classification = classifyLiveTbEndpoint(headerForClassify, scheduleTerminal);
  const termRef = classification.terminalReference;
  const physicalLookupKey = classification.physicalLookupKey;

  // Base result structure
  const result: EndpointResolution = {
    role,
    scheduleEquipment: scheduleEquipment
      ? String(scheduleEquipment).trim()
      : (classification.equipmentTag || null),
    scheduleTbHeader: scheduleHeader
      ? String(scheduleHeader).trim()
      : (classification.tbHeader || null),
    terminalReference: termRef,
    endpointType: classification.endpointType,
    locationGranularity: 'UNRESOLVED',
    physicalIdentity: null,
    page: null,
    geometry: null,
    viewClassification: null,
    status: 'UNRESOLVED',
    confidence: 'NONE',
    reasons: [],
    evidence: {},
  };

  // Step 2: Early exit for UNKNOWN endpoints
  if (classification.endpointType === 'UNKNOWN' || !physicalLookupKey) {
    result.reasons.push('Endpoint classification is UNKNOWN or missing physical lookup key');
    return result;
  }

  // Step 3: Determine what we're searching for
  const lookupKey = normalizeDeviceName(physicalLookupKey);
  const isTbLookup = classification.endpointType === 'TB_GROUP';

  // Step 4: Search GA markers by physical lookup key and type
  const candidates = gaMarkers.filter(marker => {
    // Filter by status and checksum (assumed already done by caller)
    if (marker.marker_status && marker.marker_status !== 'ACTIVE') return false;

    // Normalize marker identity
    const markerTb = normalizeDeviceName(marker.tb_number);

    // Check if marker matches this endpoint type
    if (isTbLookup) {
      // TB_GROUP lookup: marker must be a TB header
      if (!isPhysicalTbHeader(markerTb)) return false;
    } else {
      // DEVICE lookup: marker must be equipment tag (not a TB header)
      if (isPhysicalTbHeader(markerTb)) return false;
    }

    // Check if identity matches
    if (markerTb !== lookupKey) return false;

    return true;
  });

  // Step 5: If no candidates found, return UNRESOLVED
  if (candidates.length === 0) {
    result.reasons.push(`No GA marker found for ${classification.endpointType === 'TB_GROUP' ? 'TB header' : 'equipment tag'} "${physicalLookupKey}"`);
    return result;
  }

  // Step 6: Choose best candidate by view validity and geometry quality
  // Prefer markers with:
  //   1. Valid view classification for this granularity
  //   2. Real geometry (width/height > 0.001)
  //   3. More recent/higher confidence (by insertion order)

  const scored = candidates
    .map(marker => {
      const view = marker.view_name || marker.view_classification || 'UNKNOWN';
      const geometry = extractGeometry(marker);
      const validView = isValidViewForGranularity(view, classification.endpointType as LocationGranularity);
      const score = (validView ? 100 : 0) + (geometry ? 50 : 0);
      return { marker, score, validView, geometry, view };
    })
    .sort((a, b) => {
      // Prefer higher scores
      if (a.score !== b.score) return b.score - a.score;
      // Tiebreak by marker ID (later = more recent)
      return b.marker.id - a.marker.id;
    });

  const best = scored[0];
  if (!best) {
    result.reasons.push('All markers for this endpoint failed validation');
    return result;
  }

  // Step 7: Validate view and geometry
  if (!best.validView) {
    result.reasons.push(`Marker view "${best.view}" is not valid for ${classification.endpointType}`);
    return result;
  }

  if (!best.geometry) {
    result.reasons.push('Marker has no valid geometry');
    return result;
  }

  // Step 8: SUCCESS - Return verified resolution
  // Map endpointType to locationGranularity (DEVICE_TERMINAL → DEVICE)
  const locationGranularity: LocationGranularity =
    classification.endpointType === 'TB_GROUP' ? 'TB_GROUP' : 'DEVICE';
  
  result.locationGranularity = locationGranularity;
  result.physicalIdentity = best.marker.tb_number;
  result.page = best.marker.page_number;
  result.geometry = best.geometry;
  result.viewClassification = best.view;
  result.status = 'VERIFIED';
  result.confidence = 'HIGH';  // If it passed validation, it's HIGH confidence
  result.reasons.push(`Verified ${locationGranularity} "${best.marker.tb_number}" on ${best.view} page ${best.marker.page_number}`);
  result.evidence = {
    marker_id: best.marker.id,
    marker_type: best.marker.marker_type,
    detection_method: best.marker.detection_method,
    terminal_group: best.marker.terminal_group,
  };

  return result;
}

/**
 * Resolve both Source and Destination endpoints independently
 * 
 * Returns both resolutions regardless of individual success/failure
 */
export function resolveBothEndpoints(input: {
  sourceHeader: string | null | undefined;
  sourceEquipment: string | null | undefined;
  sourceTerminal: string | null | undefined;
  destinationHeader: string | null | undefined;
  destinationEquipment: string | null | undefined;
  destinationTerminal: string | null | undefined;
  gaMarkers: GaMarker[];
}): {
  source: EndpointResolution;
  destination: EndpointResolution;
  bothResolved: boolean;
  sourceResolved: boolean;
  destinationResolved: boolean;
} {
  const source = resolvePhysicalParent({
    role: 'SOURCE',
    scheduleHeader: input.sourceHeader,
    scheduleEquipment: input.sourceEquipment,
    scheduleTerminal: input.sourceTerminal,
    gaMarkers: input.gaMarkers,
  });

  const destination = resolvePhysicalParent({
    role: 'DESTINATION',
    scheduleHeader: input.destinationHeader,
    scheduleEquipment: input.destinationEquipment,
    scheduleTerminal: input.destinationTerminal,
    gaMarkers: input.gaMarkers,
  });

  const sourceResolved = source.status === 'VERIFIED';
  const destinationResolved = destination.status === 'VERIFIED';

  return {
    source,
    destination,
    bothResolved: sourceResolved && destinationResolved,
    sourceResolved,
    destinationResolved,
  };
}
