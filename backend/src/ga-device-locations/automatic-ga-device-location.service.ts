import { Injectable, Logger } from '@nestjs/common';
import { GaDeviceLocationsService } from './ga-device-locations.service';
import {
  analyseDeviceLocations,
  emptyDeviceMetrics,
  type DeviceAnalysisMetrics,
  type DeviceDrawingHit,
} from './device-location-analysis';

/**
 * Phase 9B orchestrator: schedule DEVICE targets + drawing hits →
 * GaDeviceLocationsService persistence (repository boundary).
 * Does not read Match Service / FE overlays.
 */
@Injectable()
export class AutomaticGaDeviceLocationService {
  private readonly logger = new Logger(AutomaticGaDeviceLocationService.name);

  constructor(private readonly gaDevices: GaDeviceLocationsService) {}

  async persistFromAnalysis(input: {
    cables: Array<{
      source_device?: string | null;
      source_terminal?: string | null;
      dest_device?: string | null;
      dest_terminal?: string | null;
      _raw?: Record<string, unknown> | null;
    }>;
    hits: DeviceDrawingHit[];
    currentDrawingChecksum: string;
    drawing_id: number;
    analysis_run_id: string;
    pipeline_version: string;
    groundingUnavailable: boolean;
  }): Promise<DeviceAnalysisMetrics> {
    const { metrics, decisions } = analyseDeviceLocations(input);
    let persisted = 0;
    let blocked = metrics.device_blocked_grounding;

    for (const d of decisions) {
      if (d.action !== 'persist') continue;
      try {
        const row = await this.gaDevices.persistDeviceGeometry(d.input);
        persisted += 1;
        if (d.verification === 'BLOCKED_GROUNDING') {
          await this.gaDevices.markGroundingRequired(row.id);
        } else if (d.verification === 'AUTO_VERIFIED') {
          await this.gaDevices.markAsVerified(row.id, 'AUTO_VERIFIED');
        }
      } catch (err: any) {
        this.logger.warn(
          `DEVICE persist skipped for ${d.input.device_identity}: ${err?.message || err}`,
        );
        metrics.device_unresolved += 1;
        metrics.device_locations_ready_for_persistence = Math.max(
          0,
          metrics.device_locations_ready_for_persistence - 1,
        );
      }
    }

    metrics.device_locations_persisted = persisted;
    metrics.device_blocked_grounding = blocked;
    return metrics;
  }

  emptyMetrics(): DeviceAnalysisMetrics {
    return emptyDeviceMetrics();
  }
}
