import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { DirectorService } from './director.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../data/mock-store';

const DIR_ROLES: UserRole[] = ['ops_director', 'system_admin'];

@UseGuards(JwtAuthGuard)
@Controller('api/director')
export class DirectorController {
  constructor(private readonly svc: DirectorService) {}

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  stats() { return this.svc.stats(); }

  @Get('projects')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  projects() { return this.svc.projects(); }

  @Get('workforce')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  workforce() { return this.svc.workforce(); }

  @Get('projects-summary')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  projectsSummary() { return this.svc.projectsSummary(); }

  @Get('activity')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  activity(@Query('limit') limit?: string) {
    return this.svc.activity(limit ? parseInt(limit) : 100);
  }

  @Get('export')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  async export(@Query('format') format: string, @Res() res: Response) {
    if (format === 'csv') {
      const csv = await this.svc.exportCsv();
      res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=dwes-director-export.csv' });
      res.end(csv);
    } else if (format === 'pdf') {
      const buf = await this.svc.exportPdf();
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=dwes-director-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      res.end(buf);
    } else {
      const buf = await this.svc.exportXlsx();
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=dwes-director-export.xlsx',
      });
      res.end(buf);
    }
  }
}
