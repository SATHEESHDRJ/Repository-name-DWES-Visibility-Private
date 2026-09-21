import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GaDeviceLocationInput {
  drawing_id: number;
  drawing_checksum: string;
  device_identity: string;
  page: number;
  view_classification: string;
  geometry_bbox_x: number;
  geometry_bbox_y: number;
  geometry_bbox_width: number;
  geometry_bbox_height: number;
  analysis_run_id: string;
  pipeline_version: string;
  confidence_score?: number;
  detection_method?: string;
  candidates_total?: number;
  rank_position?: number;
}

export interface GaDeviceLocationQuery {
  device_identity: string;
  drawing_checksum: string;
  verification_statuses?: string[];
}

@Injectable()
export class GaDeviceLocationsRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: GaDeviceLocationInput) {
    return this.prisma.ga_device_locations.create({
      data: {
        ...data,
        verification_status: 'UNVERIFIED',
        grounding_available: false,
      },
    });
  }

  async findByDeviceAndDrawing(
    device_identity: string,
    drawing_checksum: string,
    page?: number,
  ) {
    return this.prisma.ga_device_locations.findFirst({
      where: {
        device_identity,
        drawing_checksum,
        ...(page !== undefined && { page }),
      },
      orderBy: [
        { rank_position: 'asc' },
        { confidence_score: { sort: 'desc', nulls: 'last' } },
      ],
    });
  }

  async findAll(query: GaDeviceLocationQuery) {
    return this.prisma.ga_device_locations.findMany({
      where: {
        device_identity: query.device_identity,
        drawing_checksum: query.drawing_checksum,
        ...(query.verification_statuses && {
          verification_status: { in: query.verification_statuses },
        }),
      },
      orderBy: [
        { page: 'asc' },
        { rank_position: 'asc' },
        { confidence_score: { sort: 'desc', nulls: 'last' } },
      ],
    });
  }

  async updateVerificationStatus(
    id: number,
    status: 'AUTO_VERIFIED' | 'SUPERVISOR_VERIFIED' | 'BLOCKED_GROUNDING',
  ) {
    const updateData: any = {
      verification_status: status,
    };

    if (status === 'AUTO_VERIFIED') {
      updateData.auto_verified_at = new Date();
    } else if (status === 'SUPERVISOR_VERIFIED') {
      updateData.supervisor_verified_at = new Date();
    }

    return this.prisma.ga_device_locations.update({
      where: { id },
      data: updateData,
    });
  }

  async markGroundingAvailable(id: number) {
    return this.prisma.ga_device_locations.update({
      where: { id },
      data: { grounding_available: true },
    });
  }

  async deleteOldByDrawing(drawing_checksum: string, device_identity: string) {
    return this.prisma.ga_device_locations.deleteMany({
      where: {
        drawing_checksum,
        device_identity,
      },
    });
  }
}
