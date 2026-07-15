import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { DirectorService } from './director.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../data/mock-store';

const DIR_ROLES: UserRole[] = ['ops_director', 'sales_director', 'system_admin'];
// Endpoints that expose personnel identities or audit details — never sales_director.
const OPS_ONLY: UserRole[] = ['ops_director', 'system_admin'];

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
  @Roles(...OPS_ONLY)
  workforce() { return this.svc.workforce(); }

  @Get('projects-summary')
  @UseGuards(RolesGuard)
  @Roles(...DIR_ROLES)
  projectsSummary(@CurrentUser() user: User) {
    // Sales view is aggregate-only — technician identities are redacted server-side.
    return this.svc.projectsSummary(user.role === 'sales_director');
  }

  @Get('activity')
  @UseGuards(RolesGuard)
  @Roles(...OPS_ONLY)
  activity(@Query('limit') limit?: string) {
    return this.svc.activity(limit ? parseInt(limit) : 100);
  }

  @Get('export')
  @UseGuards(RolesGuard)
  @Roles(...OPS_ONLY)
  async export(@Query('format') format: string, @Res() res: FastifyReply) {
    if (format === 'csv') {
      const csv = await this.svc.exportCsv();
      res.headers({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=dwes-director-export.csv' });
      res.send(csv);
    } else if (format === 'pdf') {
      const buf = await this.svc.exportPdf();
      res.headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=dwes-director-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      res.send(buf);
    } else {
      const buf = await this.svc.exportXlsx();
      res.headers({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=dwes-director-export.xlsx',
      });
      res.send(buf);
    }
  }
}
