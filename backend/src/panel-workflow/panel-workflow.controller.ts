import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { PanelWorkflowService } from './panel-workflow.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';

const READ_ROLES = ['system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer'] as const;
const WRITE_ROLES = ['system_admin', 'prod_supervisor'] as const;

@Controller('api/panel-workflow')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PanelWorkflowController {
  constructor(private readonly svc: PanelWorkflowService) {}

  @Get('by-panel')
  @Roles(...READ_ROLES)
  byPanel(
    @Query('project_code') project_code: string,
    @Query('frame_id') frame_id: string,
  ) {
    return this.svc.getByPanel(project_code, frame_id);
  }

  @Get('estimate')
  @Roles(...READ_ROLES)
  estimate(
    @Query('project_code') project_code?: string,
    @Query('frame_id') frame_id?: string,
    @Query('total_wires') total_wires?: string,
    @Query('technician_count') technician_count?: string,
    @Query('efficiency_factor') efficiency_factor?: string,
    @Query('target_wires_per_hour') target_wires_per_hour?: string,
    @Query('productive_hours_per_day') productive_hours_per_day?: string,
  ) {
    return this.svc.estimateWiring({
      project_code,
      frame_id,
      total_wires,
      technician_count,
      efficiency_factor,
      target_wires_per_hour,
      productive_hours_per_day,
    });
  }

  @Post('ensure')
  @Roles(...WRITE_ROLES)
  ensure(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.ensureWorkflow(body || {}, user);
  }

  @Get('productivity-defaults')
  @Roles(...READ_ROLES)
  productivityDefaults(@Query('project_code') project_code?: string) {
    return this.svc.getProductivityDefaults(project_code);
  }

  @Put('productivity-defaults')
  @Roles(...WRITE_ROLES)
  putProductivityDefaults(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.putProductivityDefaults(body || {}, user);
  }

  @Get('templates')
  @Roles(...READ_ROLES)
  listTemplates() {
    return this.svc.listTemplates();
  }

  @Post('templates')
  @Roles(...WRITE_ROLES)
  createTemplate(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.createTemplate(body || {}, user);
  }

  @Delete('templates/:id')
  @Roles(...WRITE_ROLES)
  deleteTemplate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.deleteTemplate(id, user);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.createWorkflow(body || {}, user);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getWorkflow(id);
  }

  @Put(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() user: User) {
    return this.svc.updateWorkflow(id, body || {}, user);
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.deleteWorkflow(id, user);
  }

  @Get(':id/history')
  @Roles(...READ_ROLES)
  history(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listHistory(id);
  }

  @Post(':id/apply-template')
  @Roles(...WRITE_ROLES)
  applyTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.applyTemplate(id, body || {}, user);
  }

  @Get(':id/director-upgrade-preview')
  @Roles(...READ_ROLES)
  directorUpgradePreview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.previewDirectorUpgrade(id);
  }

  @Post(':id/director-upgrade')
  @Roles(...WRITE_ROLES)
  directorUpgrade(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.applyDirectorUpgrade(id, body || {}, user);
  }

  @Post(':id/stages')
  @Roles(...WRITE_ROLES)
  addStage(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() user: User) {
    return this.svc.addStage(id, body || {}, user);
  }

  @Put('stages/:stageId')
  @Roles(...WRITE_ROLES)
  updateStage(
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.updateStage(stageId, body || {}, user);
  }

  @Delete('stages/:stageId')
  @Roles(...WRITE_ROLES)
  removeStage(@Param('stageId', ParseIntPipe) stageId: number, @CurrentUser() user: User) {
    return this.svc.removeStage(stageId, user);
  }

  @Post(':id/dependencies')
  @Roles(...WRITE_ROLES)
  addDependency(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.addDependency(id, body || {}, user);
  }

  @Delete('dependencies/:depId')
  @Roles(...WRITE_ROLES)
  removeDependency(@Param('depId', ParseIntPipe) depId: number, @CurrentUser() user: User) {
    return this.svc.removeDependency(depId, user);
  }

  @Post('stages/:stageId/assignees')
  @Roles(...WRITE_ROLES)
  assignStage(
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    return this.svc.assignStageUser(stageId, body || {}, user);
  }

  @Delete('assignees/:assigneeId')
  @Roles(...WRITE_ROLES)
  removeAssignee(
    @Param('assigneeId', ParseIntPipe) assigneeId: number,
    @CurrentUser() user: User,
  ) {
    return this.svc.removeStageAssignee(assigneeId, user);
  }
}
