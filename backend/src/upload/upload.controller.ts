import {
  Controller, Post, Put, Body, Param, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { DwesFileInterceptor, type DwesUploadedFile } from '../common/interceptors/fastify-file.interceptor';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { type User } from '../data/mock-store';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private svc: UploadService) {}

  @Post('check-hash')
  checkHash(@Body() body: { hash: string; file_name: string; file_type: string; project_code?: string }) {
    return this.svc.checkHash(body.hash, body.file_name, body.file_type, body.project_code);
  }

  @Post('upload/extract-metadata')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  extractMetadata(@UploadedFile() file: DwesUploadedFile) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.extractMetadata(file.buffer);
  }

  @Post('upload/read-headers/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  readHeaders(
    @Param('code') code: string,
    @UploadedFile() file: DwesUploadedFile,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.readHeaders(code, file.buffer, file.originalname);
  }

  @Post('upload/preview-mapped/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  previewMapped(
    @Param('code') code: string,
    @UploadedFile() file: DwesUploadedFile,
    @Body() body: { sheet_name: string; mapping: string; header_row?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    let mapping: Record<string, string>;
    try { mapping = typeof body.mapping === 'string' ? JSON.parse(body.mapping) : body.mapping; }
    catch { throw new BadRequestException('Invalid mapping JSON'); }
    const headerRow = body.header_row ? parseInt(body.header_row, 10) : undefined;
    return this.svc.previewMapped(file.buffer, body.sheet_name || '', mapping, headerRow);
  }

  @Post('upload/wiring-schedule-mapped/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  uploadMapped(
    @Param('code') code: string,
    @UploadedFile() file: DwesUploadedFile,
    @Body() body: { sheet_name: string; mapping: string; header_row?: string; frame_id?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    let mapping: Record<string, string>;
    try { mapping = typeof body.mapping === 'string' ? JSON.parse(body.mapping) : body.mapping; }
    catch { throw new BadRequestException('Invalid mapping JSON'); }
    const headerRow = body.header_row ? parseInt(body.header_row, 10) : undefined;
    return this.svc.uploadMapped(code, file.buffer, file.originalname, body.sheet_name || '', mapping, headerRow, body.frame_id?.trim() || undefined);
  }

  @Post('upload/drawing/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  uploadDrawing(
    @Param('code') code: string,
    @UploadedFile() file: DwesUploadedFile,
    @Body() body: { replace_drawing_id?: string; frame_id?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadDrawing(
      code,
      file.buffer,
      file.originalname,
      file.mimetype,
      body.replace_drawing_id,
      body.frame_id?.trim() || undefined,
    );
  }

  /** Stable panel drawing package slot upload/replacement. */
  @Put('projects/:code/frames/:frameId/drawing/:slot')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  uploadPanelDrawingAsset(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @Param('slot') slot: string,
    @UploadedFile() file: DwesUploadedFile,
    @CurrentUser() user: User,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (slot !== '2d' && slot !== '3d') throw new BadRequestException('Drawing slot must be 2d or 3d');
    return this.svc.uploadPanelDrawingAsset(
      code,
      frameId,
      slot,
      file.buffer,
      file.originalname,
      file.mimetype,
      user.id,
    );
  }

  @Post('upload/director-report/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(DwesFileInterceptor('file'))
  uploadDirectorReport(
    @Param('code') code: string,
    @UploadedFile() file: DwesUploadedFile,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadDirectorReport(code, file.buffer, file.originalname, file.mimetype);
  }
}
