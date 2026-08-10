import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../data/mock-store';
import { TbMarkerMatchService } from './tb-marker-match.service';
import { TbMarkersService } from './tb-markers.service';

const READ_ROLES = ['system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer', 'wiring_technician'] as const;
const WRITE_ROLES = ['system_admin', 'prod_supervisor'] as const;

@Controller('api/tb-markers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TbMarkersController {
  constructor(
    private readonly svc: TbMarkersService,
    private readonly matchSvc: TbMarkerMatchService,
  ) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query('project_code') project_code: string,
    @Query('frame_id') frame_id: string,
    @CurrentUser() user: User,
  ) {
    if (!project_code || !frame_id) throw new BadRequestException('project_code and frame_id are required.');
    return this.svc.listMarkers(project_code, frame_id, user);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    const required = ['project_code', 'frame_id', 'marker_type', 'tb_number', 'terminal_group', 'geometry'] as const;
    for (const k of required) {
      if (body?.[k] == null || body[k] === '') throw new BadRequestException(`${k} is required.`);
    }
    return this.svc.createMarker(body, user);
  }

  @Put(':markerId')
  @Roles(...WRITE_ROLES)
  update(
    @Param('markerId', ParseIntPipe) markerId: number,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.updateMarker(markerId, body, user);
  }

  @Delete(':markerId')
  @Roles(...WRITE_ROLES)
  delete(
    @Param('markerId', ParseIntPipe) markerId: number,
    @CurrentUser() user: User,
  ) {
    return this.svc.deleteMarker(markerId, user);
  }

  @Get('match')
  @Roles(...READ_ROLES)
  match(
    @Query('project_code') project_code: string,
    @Query('frame_id') frame_id: string,
    @Query('source_device') source_device: string,
    @Query('source_terminal') source_terminal: string,
    @Query('dest_device') dest_device: string,
    @Query('dest_terminal') dest_terminal: string,
    @Query('drawing_checksum') drawing_checksum: string | undefined,
    @CurrentUser() user: User,
  ) {
    if (!project_code || !frame_id) throw new BadRequestException('project_code and frame_id are required.');
    const srcDevice = String(source_device || '').trim();
    const dstDevice = String(dest_device || '').trim();
    const srcTerm = String(source_terminal || '').trim();
    const dstTerm = String(dest_terminal || '').trim();
    // At least one physical TB end is required. Equipment-only wires may omit an end.
    if (!srcDevice && !dstDevice) {
      throw new BadRequestException('At least one of source_device or dest_device (physical TB) is required.');
    }
    if (srcDevice && !srcTerm) {
      throw new BadRequestException('source_terminal is required when source_device is provided.');
    }
    if (dstDevice && !dstTerm) {
      throw new BadRequestException('dest_terminal is required when dest_device is provided.');
    }
    return this.matchSvc.matchWireEndpoints(
      project_code,
      frame_id,
      { device: srcDevice, terminal: srcTerm },
      { device: dstDevice, terminal: dstTerm },
      user,
      drawing_checksum || null,
    );
  }
}
