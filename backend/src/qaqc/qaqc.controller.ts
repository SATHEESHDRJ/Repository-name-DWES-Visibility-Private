import { Controller, Get, Post, Param, ParseIntPipe, Body, UseGuards } from '@nestjs/common';
import { QAQCService } from './qaqc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../data/mock-store';

const QC_ROLES: UserRole[] = ['qaqc_engineer', 'prod_supervisor', 'ops_director', 'system_admin'];

@UseGuards(JwtAuthGuard)
@Controller('api/qaqc')
export class QAQCController {
  constructor(private readonly svc: QAQCService) {}

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(...QC_ROLES)
  stats() { return this.svc.stats(); }

  @Get('ready-panels')
  @UseGuards(RolesGuard)
  @Roles(...QC_ROLES)
  readyPanels() { return this.svc.readyPanels(); }

  @Get('all-completed')
  @UseGuards(RolesGuard)
  @Roles(...QC_ROLES)
  allCompleted() { return this.svc.allCompletedPanels(); }

  @Get('panel-detail/:id')
  @UseGuards(RolesGuard)
  @Roles(...QC_ROLES)
  panelDetail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.panelDetail(id);
  }

  @Post('inspect-panel/:id')
  @UseGuards(RolesGuard)
  @Roles('qaqc_engineer')
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.submitInspection(id, dto, user);
  }

  @Get('inspection/:id')
  @UseGuards(RolesGuard)
  @Roles(...QC_ROLES)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getInspection(id);
  }

  @Get('inspections')
  @UseGuards(RolesGuard)
  @Roles(...QC_ROLES)
  all() { return this.svc.allInspections(); }

  @Get('my-inspections')
  @UseGuards(RolesGuard)
  @Roles('qaqc_engineer', 'system_admin')
  mine(@CurrentUser() user: User) {
    return this.svc.myInspections(user.id);
  }
}
