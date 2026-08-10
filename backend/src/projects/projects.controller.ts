import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectState, User } from '../data/mock-store';

@Controller('api/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private svc: ProjectsService) {}

  @Get()
  findAll() { return this.svc.findAll(); }

  /** Declared before ':code' so the literal segment is not captured as a project code. */
  @Get('code-available/:code')
  @Roles('prod_supervisor')
  codeAvailable(@Param('code') code: string) { return this.svc.codeAvailability(code); }

  @Get(':code')
  findOne(@Param('code') code: string) { return this.svc.findOne(code); }

  @Post()
  @Roles('prod_supervisor')
  create(@Body() dto: any) { return this.svc.create(dto); }

  @Put(':code')
  @Roles('prod_supervisor')
  update(@Param('code') code: string, @Body() dto: any) { return this.svc.update(code, dto); }

  @Delete(':code')
  @Roles('prod_supervisor', 'system_admin')
  remove(@Param('code') code: string, @CurrentUser() user: User) {
    return this.svc.remove(code, {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
    });
  }

  @Post(':code/state')
  @Roles('prod_supervisor')
  setState(@Param('code') code: string, @Body() body: { state: ProjectState }) {
    return this.svc.setState(code, body.state);
  }

  @Post(':code/assign')
  @Roles('prod_supervisor')
  assign(@Param('code') code: string, @Body() body: { technicians: string[] }) {
    return this.svc.assign(code, body.technicians);
  }

  @Post(':code/submit-to-director')
  @Roles('prod_supervisor')
  submit(
    @Param('code') code: string,
    @Body() body: { frameId?: string; assignmentId?: number },
    @CurrentUser() user: User,
  ) {
    return this.svc.submitToDirector(code, {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
    }, {
      frameId: body?.frameId,
      assignmentId: body?.assignmentId,
    });
  }

  // Reports are readable by production roles; technicians only for projects they are
  // assigned to (same policy as drawing file streaming in frames.controller.ts).
  // sales_director is excluded — the report tables embed technician names and
  // per-panel work detail that the sales view must not receive.
  @Get(':code/report-pdf')
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async reportPdf(@Param('code') code: string, @CurrentUser() user: User, @Res() res: FastifyReply) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToProject(code, user.id))) {
      res.status(403).send({ statusCode: 403, message: 'You are not assigned to this project' });
      return;
    }
    const { buffer, filename } = await this.svc.generateReportPdf(code, user.full_name || user.username || '');
    res.headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get(':code/report-xlsx')
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async reportXlsx(@Param('code') code: string, @CurrentUser() user: User, @Res() res: FastifyReply) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToProject(code, user.id))) {
      res.status(403).send({ statusCode: 403, message: 'You are not assigned to this project' });
      return;
    }
    const { buffer, filename } = await this.svc.generateReportXlsx(code, user.full_name || user.username || '');
    res.headers({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get(':code/stats')
  stats(@Param('code') code: string) { return this.svc.stats(code); }
}
