import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DwesFileInterceptor, type DwesUploadedFile } from '../common/interceptors/fastify-file.interceptor';
import type { User } from '../data/mock-store';
import { GaFoundationService } from './ga-foundation.service';
import { JobQueueService } from './job-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertTechnicianAssignedToFrame } from '../common/technician-panel-access.helper';
import type { GaFace, SaveMappingCatalogInput } from './ga-foundation.types';

function parseJsonObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be JSON`);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException(`${label} must be a valid JSON object`);
  }
}

@Controller('api/projects/:projectCode/frames/:frameId/ga')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('prod_supervisor', 'system_admin', 'ops_director', 'qaqc_engineer')
export class GaFoundationController {
  constructor(
    private readonly ga: GaFoundationService,
    private readonly jobs: JobQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  status(@Param('projectCode') projectCode: string, @Param('frameId') frameId: string) {
    return this.ga.getStatus(projectCode, frameId);
  }

  @Get('sources')
  sources(@Param('projectCode') projectCode: string, @Param('frameId') frameId: string) {
    return this.ga.listSources(projectCode, frameId);
  }

  @Get('sources/:assetId/file')
  async sourceFile(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('assetId', ParseIntPipe) assetId: number,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.ga.sourceFile(projectCode, frameId, assetId);
    reply.header('Content-Type', file.contentType);
    reply.header('Content-Disposition', `attachment; filename="${file.filename.replace(/["\r\n]/g, '_')}"`);
    reply.header('Cache-Control', 'no-store');
    return reply.send(file.buffer);
  }

  @Post('sources/:assetId/retry-conversion')
  @Roles('prod_supervisor')
  retryConversion(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('assetId', ParseIntPipe) assetId: number,
    @CurrentUser() user: User,
  ) {
    return this.ga.queueCadConversion(projectCode, frameId, assetId, user.id);
  }

  @Post('faces/:face')
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  saveFace(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('face') face: GaFace,
    @UploadedFile() file: DwesUploadedFile,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    if (!file) throw new BadRequestException('Selected GA face image is required');
    const crop = parseJsonObject(body.crop, 'Crop');
    const viewport = parseJsonObject(body.viewport, 'Viewport');
    return this.ga.saveFaceSelection({
      projectCode,
      frameId,
      face,
      customLabel: typeof body.custom_label === 'string' ? body.custom_label : undefined,
      sourceAssetId: Number(body.source_asset_id),
      selectedPage: body.selected_page ? Number(body.selected_page) : undefined,
      crop: {
        x: Number(crop.x), y: Number(crop.y), width: Number(crop.width), height: Number(crop.height),
      },
      viewport: { width: Number(viewport.width), height: Number(viewport.height) },
      scale: Number(body.scale),
      image: file.buffer,
      userId: user.id,
    });
  }

  @Get('faces/:faceId/image')
  async faceImage(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('faceId') faceId: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.ga.faceImageById(projectCode, frameId, faceId);
    reply.header('Content-Type', file.contentType);
    reply.header('Content-Disposition', `inline; filename="${file.filename.replace(/["\r\n]/g, '_')}"`);
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(file.buffer);
  }

  @Patch('asset-set/dimensions')
  @Roles('prod_supervisor')
  dimensions(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    return this.ga.updateDimensions(projectCode, frameId, body, user.id);
  }

  @Post('asset-set/confirm')
  @Roles('prod_supervisor')
  confirmAssetSet(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    return this.ga.confirmAssetSet(projectCode, frameId, user.id);
  }

  @Get('mapping')
  mapping(@Param('projectCode') projectCode: string, @Param('frameId') frameId: string) {
    return this.ga.mappingDetail(projectCode, frameId);
  }

  @Post('mapping/draft')
  @Roles('prod_supervisor')
  saveMapping(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Body() body: SaveMappingCatalogInput,
    @CurrentUser() user: User,
  ) {
    return this.ga.saveMappingCatalog(projectCode, frameId, body, user.id);
  }

  @Post('mapping/:modelId/confirm')
  @Roles('prod_supervisor')
  confirmMapping(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('modelId', ParseIntPipe) modelId: number,
    @CurrentUser() user: User,
  ) {
    return this.ga.confirmMapping(projectCode, frameId, modelId, user.id);
  }

  @Get('correlation-map')
  @Roles('prod_supervisor', 'system_admin', 'ops_director', 'qaqc_engineer', 'wiring_technician')
  async correlationMap(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    await assertTechnicianAssignedToFrame(this.prisma, user, projectCode, frameId);
    return this.ga.correlationMap(projectCode, frameId);
  }

  @Post('correlation')
  @Roles('prod_supervisor')
  correlate(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    return this.ga.queueCorrelation(projectCode, frameId, user.id);
  }

  @Get('finalization')
  finalization(@Param('projectCode') projectCode: string, @Param('frameId') frameId: string) {
    return this.ga.finalizationQueue(projectCode, frameId);
  }

  @Post('finalization/:resultId')
  @Roles('prod_supervisor')
  decide(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('resultId') resultId: string,
    @Body() body: { decision: 'confirm_suggestion' | 'link_existing' | 'exception_hold'; target_terminal_id?: number; reason?: string },
    @CurrentUser() user: User,
  ) {
    return this.ga.decideFinalization({
      projectCode, frameId, resultId, decision: body.decision,
      targetTerminalId: body.target_terminal_id, reason: body.reason, userId: user.id,
    });
  }

  @Post('release')
  @Roles('prod_supervisor')
  release(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    return this.ga.releasePanel(projectCode, frameId, user.id);
  }

  @Get('jobs/:jobId')
  async job(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: User,
  ) {
    const job = await this.jobs.getOwned(jobId, user);
    if (job.project_code !== projectCode || job.frame_id !== frameId) throw new BadRequestException('Job does not belong to this panel');
    return job;
  }

  @Post('jobs/:jobId/cancel')
  @Roles('prod_supervisor')
  cancelJob(@Param('jobId') jobId: string, @CurrentUser() user: User) {
    return this.jobs.cancel(jobId, user);
  }
}
