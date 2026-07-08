import {
  Controller, Post, Body, Param, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
  @UseInterceptors(FileInterceptor('file'))
  extractMetadata(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.extractMetadata(file.buffer);
  }

  @Post('upload/read-headers/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(FileInterceptor('file'))
  readHeaders(
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.readHeaders(code, file.buffer, file.originalname);
  }

  @Post('upload/preview-mapped/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(FileInterceptor('file'))
  previewMapped(
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File,
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
  @UseInterceptors(FileInterceptor('file'))
  uploadMapped(
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File,
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
  @UseInterceptors(FileInterceptor('file'))
  uploadDrawing(
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File,
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

  @Post('upload/director-report/:code')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @UseInterceptors(FileInterceptor('file'))
  uploadDirectorReport(
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadDirectorReport(code, file.buffer, file.originalname, file.mimetype);
  }
}
