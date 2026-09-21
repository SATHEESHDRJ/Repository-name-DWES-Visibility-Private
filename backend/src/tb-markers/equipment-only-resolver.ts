/**
 * EQUIPMENT-ONLY PHYSICAL MAPPING RESOLVER
 * 
 * Temporary diagnostic/acceptance test mode for pure equipment/device-based
 * physical endpoint location. This mode:
 * 
 * - Ignores terminal references (metadata only)
 * - Ignores TB_GROUP fallback
 * - Uses only DEVICE physical kinds
 * - Requires exact equipment tag match in drawing
 * - Rejects non-physical occurrences (BOM, legend, description tables)
 * - Works independently for Source and Destination
 * 
 * This is NOT permanent product logic. It is an isolated verification mode
 * controlled by DWES_LIVE_TB_EQUIPMENT_ONLY_TEST environment flag (default 0).
 * 
 * Production behavior is unchanged when flag = 0.
 */

import { Logger } from '@nestjs/common';

export interface EquipmentOnlyResolution {
  /**
   * Source: "87STUB", "74TCS1", etc.
   * From schedule: equipment/device tag
   */
  equipmentTag: string;

  /**
   * Physical search results
   */
  physicalKind: 'DEVICE' | 'UNRESOLVED';

  /**
   * If found, the exact equipment tag matched
   */
  physicalIdentity: string | null;

  /**
   * Location metadata
   */
  page: number | null;
  view: string | null;

  /**
   * Physical device bounding box (if found)
   * Not static coordinates. Derived from actual GA analysis.
   */
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  /**
   * Resolution status
   */
  status: 'VERIFIED' | 'UNRESOLVED';
  reason: string;

  /**
   * Evidence trail
   */
  nativePdfHits: string[];
  ocrHits: string[];
  candidatePages: number[];
  rejectedOccurrences: string[];
}

/**
 * Represents a potential device match in the GA
 */
interface DeviceCandidate {
  tag: string;
  page: number;
  view: string;
  isPhysical: boolean; // true if actual device, false if BOM/legend/table
  geometry: { x: number; y: number; width: number; height: number };
  source: 'native_pdf' | 'ocr';
  reason: string;
}

export class EquipmentOnlyResolver {
  private readonly logger = new Logger('EquipmentOnlyResolver');

  /**
   * Resolve equipment endpoint to physical device in GA
   * 
   * For this test: ignore terminal references, ignore TB fallback,
   * use only DEVICE physical kind.
   */
  resolveEquipmentOnlyEndpoint(
    equipmentTag: string,
    gaMarkers: any[],
    drawingAnalysis?: any,
  ): EquipmentOnlyResolution {
    const nativePdfHits: string[] = [];
    const ocrHits: string[] = [];
    const candidatePages: number[] = [];
    const rejectedOccurrences: string[] = [];
    let bestCandidate: DeviceCandidate | null = null;

    // ============================================
    // STAGE 1: Search for exact equipment tag
    // ============================================

    // Look in GA markers
    if (gaMarkers && gaMarkers.length > 0) {
      for (const marker of gaMarkers) {
        // Check if this marker represents the equipment tag
        if (marker.tb_number === equipmentTag || marker.device === equipmentTag) {
          // Verify it's a physical device, not a table/BOM entry
          if (this.isPhysicalDeviceMarker(marker)) {
            if (!candidatePages.includes(marker.page_number)) {
              candidatePages.push(marker.page_number);
            }

            nativePdfHits.push(
              `Native PDF: ${equipmentTag} found on page ${marker.page_number}, view=${marker.view_name}`,
            );

            bestCandidate = {
              tag: equipmentTag,
              page: marker.page_number,
              view: marker.view_name,
              isPhysical: true,
              geometry: marker.geometry || { x: 0, y: 0, width: 0.1, height: 0.1 },
              source: 'native_pdf',
              reason: `Native PDF match: ${equipmentTag} in ${marker.view_name}`,
            };

            // Native PDF hit is best evidence, stop searching
            break;
          } else {
            rejectedOccurrences.push(
              `Rejected: ${equipmentTag} on page ${marker.page_number}, view ${marker.view_name} (not physical device)`,
            );
          }
        }
      }
    }

    // If not found in native PDF, check OCR (lower confidence)
    if (!bestCandidate && drawingAnalysis?.ocrResults) {
      const ocrMatches = drawingAnalysis.ocrResults.filter(
        (result: any) => result.text === equipmentTag && result.isPhysicalDevice,
      );

      for (const match of ocrMatches) {
        if (!candidatePages.includes(match.page)) {
          candidatePages.push(match.page);
        }

        ocrHits.push(
          `OCR: ${equipmentTag} found on page ${match.page}, view=${match.view}, confidence=${match.confidence}`,
        );

        if (!bestCandidate || match.confidence > (bestCandidate as any).confidence) {
          bestCandidate = {
            tag: equipmentTag,
            page: match.page,
            view: match.view,
            isPhysical: true,
            geometry: match.geometry,
            source: 'ocr',
            reason: `OCR match: ${equipmentTag} in ${match.view} (${match.confidence})`,
          };
        }
      }
    }

    // ============================================
    // STAGE 2: Build final resolution
    // ============================================

    if (bestCandidate) {
      return {
        equipmentTag,
        physicalKind: 'DEVICE',
        physicalIdentity: bestCandidate.tag,
        page: bestCandidate.page,
        view: bestCandidate.view,
        geometry: bestCandidate.geometry,
        status: 'VERIFIED',
        reason: bestCandidate.reason,
        nativePdfHits,
        ocrHits,
        candidatePages,
        rejectedOccurrences,
      };
    }

    // No physical match found
    return {
      equipmentTag,
      physicalKind: 'UNRESOLVED',
      physicalIdentity: null,
      page: null,
      view: null,
      geometry: null,
      status: 'UNRESOLVED',
      reason: `Equipment tag "${equipmentTag}" not found as physical device in current GA (native PDF: ${nativePdfHits.length} hits, OCR: ${ocrHits.length} hits)`,
      nativePdfHits,
      ocrHits,
      candidatePages,
      rejectedOccurrences,
    };
  }

  /**
   * Determine if a marker represents a physical device (not BOM/table/legend)
   */
  private isPhysicalDeviceMarker(marker: any): boolean {
    // Reject known non-physical views
    const nonPhysicalViews = [
      'LEGEND',
      'BOM',
      'DESCRIPTION_TABLE',
      'DEVICE_LIST',
      'TITLE_BLOCK',
      'NOTES',
    ];

    if (nonPhysicalViews.includes(marker.view_name?.toUpperCase())) {
      return false;
    }

    // Accept known physical device views
    const physicalViews = [
      'FRONT_VIEW',
      'FRONT',
      'INTERNAL_VIEW',
      'INTERNAL',
      'REAR_VIEW',
      'REAR',
      'SIDE_VIEW',
      'SIDE',
      'EQUIPMENT_MOUNTING_VIEW',
      'PHYSICAL_TB_BANK',
      'EQUIPMENT_DETAIL',
      'PANEL_LAYOUT',
    ];

    if (physicalViews.some(v => marker.view_name?.toUpperCase().includes(v))) {
      return true;
    }

    // Default: if marker has geometry and is marked as active, assume physical
    if (marker.marker_status === 'ACTIVE' && marker.geometry) {
      return true;
    }

    return false;
  }

  /**
   * Validate resolution doesn't use terminal-only references (equipment-only test)
   */
  validateEquipmentOnlyMode(resolution: EquipmentOnlyResolution): boolean {
    // Ensure we're using the equipment tag, not terminal reference
    if (!resolution.equipmentTag || resolution.equipmentTag.length === 0) {
      return false;
    }

    // Terminal references (X###, ###) should not be used for physical lookup
    // Example: X329:18, X5A-C, 13, 15 are terminals, not equipment
    const isTerminalReference = /^(X|[0-9]+)/.test(resolution.equipmentTag);
    if (isTerminalReference) {
      this.logger.warn(
        `Equipment-only mode: "${resolution.equipmentTag}" looks like terminal reference, not equipment tag`,
      );
    }

    return true;
  }
}

/**
 * Factory for creating equipment-only resolver instances
 */
export function createEquipmentOnlyResolver(): EquipmentOnlyResolver {
  return new EquipmentOnlyResolver();
}
