import { Injectable, Logger } from '@nestjs/common';
import { GaDeviceLocationsRepository, GaDeviceLocationInput, GaDeviceLocationQuery } from './ga-device-locations.repository';

export interface DeviceGeometryResult {
  id: number;
  device_identity: string;
  page: number;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  view_classification: string;
  verification_status: string;
  confidence_score?: number;
  detection_method?: string;
}

@Injectable()
export class GaDeviceLocationsService {
  private readonly logger = new Logger(GaDeviceLocationsService.name);

  constructor(private repository: GaDeviceLocationsRepository) {}

  /**
   * Persist DEVICE geometry detected from drawing analysis
   */
  async persistDeviceGeometry(input: GaDeviceLocationInput) {
    this.logger.debug(
      `Persisting DEVICE geometry for ${input.device_identity} on drawing ${input.drawing_checksum}`,
    );

    try {
      const result = await this.repository.create(input);
      this.logger.debug(`Created ga_device_location id=${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to persist device geometry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Query DEVICE geometry for endpoint resolution
   * Returns the best valid geometry candidate for a DEVICE endpoint
   */
  async queryDeviceGeometry(
    device_identity: string,
    drawing_checksum: string,
    page?: number,
  ): Promise<DeviceGeometryResult | null> {
    this.logger.debug(
      `Querying DEVICE geometry for ${device_identity} on drawing ${drawing_checksum}`,
    );

    const location = await this.repository.findByDeviceAndDrawing(
      device_identity,
      drawing_checksum,
      page,
    );

    if (!location) {
      this.logger.debug(
        `No DEVICE geometry found for ${device_identity} on ${drawing_checksum}`,
      );
      return null;
    }

    // Only return locations with valid verification status
    const validStatuses = ['AUTO_VERIFIED', 'SUPERVISOR_VERIFIED'];
    if (!validStatuses.includes(location.verification_status)) {
      this.logger.debug(
        `DEVICE geometry found but not verified (status=${location.verification_status})`,
      );
      // Return null for unverified, let caller handle as UNRESOLVED
      return null;
    }

    return {
      id: location.id,
      device_identity: location.device_identity,
      page: location.page,
      geometry: {
        x: location.geometry_bbox_x,
        y: location.geometry_bbox_y,
        width: location.geometry_bbox_width,
        height: location.geometry_bbox_height,
      },
      view_classification: location.view_classification,
      verification_status: location.verification_status,
      confidence_score: location.confidence_score || undefined,
      detection_method: location.detection_method || undefined,
    };
  }

  /**
   * Get all DEVICE geometries for a device/drawing pair
   * (for testing, reporting, and verification workflows)
   */
  async getAllDeviceGeometries(query: GaDeviceLocationQuery) {
    return this.repository.findAll(query);
  }

  /**
   * Mark DEVICE geometry as verified
   */
  async markAsVerified(
    id: number,
    status: 'AUTO_VERIFIED' | 'SUPERVISOR_VERIFIED',
  ) {
    this.logger.debug(`Marking ga_device_location id=${id} as ${status}`);
    return this.repository.updateVerificationStatus(id, status);
  }

  /**
   * Mark as blocked pending LocateAnything grounding
   */
  async markGroundingRequired(id: number) {
    this.logger.debug(`Marking ga_device_location id=${id} as BLOCKED_GROUNDING`);
    return this.repository.updateVerificationStatus(id, 'BLOCKED_GROUNDING');
  }

  /**
   * Grounding service called this location (may lead to AUTO_VERIFIED or stay BLOCKED)
   */
  async recordGroundingAttempt(id: number, available: boolean) {
    if (available) {
      this.logger.debug(`Grounding available for id=${id}`);
      return this.repository.markGroundingAvailable(id);
    }
    return null;
  }
}
