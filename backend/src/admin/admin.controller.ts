import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
@Controller('api/admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  // ── Diagnostics ────────────────────────────────────────────────────────────

  @Get('diagnostics')
  diagnostics() { return this.svc.diagnostics(); }

  @Post('diagnostics/db-ping')
  dbPing() { return this.svc.dbPing(); }

  @Post('diagnostics/clear-cache')
  clearCache() { return this.svc.clearCache(); }

  @Post('diagnostics/reset-counters')
  resetCounters() { return this.svc.resetCounters(); }

  // ── Sync ───────────────────────────────────────────────────────────────────

  @Get('sync/storage')
  syncStorage() { return this.svc.syncStorage(); }

  @Post('sync/inspect')
  syncInspect() { return this.svc.syncInspect(); }

  @Get('sync/status')
  syncStatus() { return this.svc.syncStatus(); }

  @Post('sync/execute')
  syncExecute(@Body('strategy') strategy: string) {
    return this.svc.syncExecute(strategy as any);
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  @Get('sessions')
  sessions(@Query('limit') limit?: string) {
    return this.svc.sessions(limit ? parseInt(limit) : 100);
  }

  @Get('sessions/clear-precheck')
  clearSessionsPrecheck() { return this.svc.clearSessionsPrecheck(); }

  @Post('sessions/clear')
  clearSessions(@Body('confirmed_phrase') phrase: string) {
    return this.svc.clearSessions((phrase || '').trim());
  }

  // ── Users (admin CRUD) ─────────────────────────────────────────────────────

  @Get('users')
  allUsers() { return this.svc.allUsers(); }

  @Post('users/:id/change-role')
  changeRole(@Param('id', ParseIntPipe) id: number, @Body('role') role: string) {
    return this.svc.changeRole(id, role);
  }

  // Bulk-set role by username pattern — idempotent, only updates rows where role != targetRole.
  // Example: POST /api/admin/users/bulk-role { "pattern": "tech", "role": "wiring_technician" }
  // This sets all users whose username contains "tech" to wiring_technician (skips already-correct).
  @Post('users/bulk-role')
  bulkSetRole(@Body('pattern') pattern: string, @Body('role') role: string) {
    return this.svc.bulkSetRole(pattern || '', role);
  }

  // ── Database Configuration ────────────────────────────────────────────────

  @Get('db-config')
  getDbConfig() { return this.svc.getDbConfig(); }

  @Post('db-config')
  setDbConfig(
    @Body('mode') mode: string,
    @Body('cloudUrl') cloudUrl?: string,
    @Body('notes') notes?: string,
  ) {
    return this.svc.setDbConfig(mode as any, cloudUrl, notes);
  }

  @Post('db-config/test')
  testDbConnection(@Body('url') url: string) {
    return this.svc.testDbConnection(url);
  }

  // ── Deployment Mode (Intranet vs Cloud hosting) ─────────────────────────────

  @Get('deployment-config')
  getDeploymentConfig() { return this.svc.getDeploymentConfig(); }

  @Post('deployment-config')
  setDeploymentConfig(
    @Body('mode') mode: string,
    @Body('cloudAppUrl') cloudAppUrl?: string,
    @Body('cloudTier') cloudTier?: string,
    @Body('cloudRegion') cloudRegion?: string,
    @Body('notes') notes?: string,
  ) {
    return this.svc.setDeploymentConfig(mode as any, cloudAppUrl, cloudTier as any, cloudRegion, notes);
  }

  @Post('restart')
  triggerRestart() { return this.svc.triggerRestart(); }

  // ── File Storage ──────────────────────────────────────────────────────────

  @Get('file-storage')
  fileStorageInfo() { return this.svc.fileStorageInfo(); }

  // ── Reset All Projects (DEMO_MODE only; system_admin only; backup-first) ──

  @Get('reset-all-projects')
  resetAllPrecheck() {
    if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
    return this.svc.resetAllProjectsPrecheck();
  }

  @Post('reset-all-projects')
  resetAllProjects(@Body('confirmed_phrase') phrase: string) {
    if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
    return this.svc.resetAllProjects((phrase || '').trim());
  }

  // ── Hard Delete (system_admin only; permanent — no backup, no restore) ────

  @Get('projects/:code/hard-delete')
  hardDeletePrecheck(@Param('code') code: string) {
    if (!code || code.trim() === '') throw new BadRequestException('Project code required');
    return this.svc.hardDeleteProjectPrecheck(code.trim());
  }

  @Post('projects/:code/hard-delete')
  hardDelete(@Param('code') code: string) {
    if (!code || code.trim() === '') throw new BadRequestException('Project code required');
    return this.svc.hardDeleteProject(code.trim());
  }

  // ── Hard Reset (system_admin only; backup-first; single project) ──────────

  @Get('projects/:code/hard-reset')
  resetPrecheck(@Param('code') code: string) {
    if (!code || code.trim() === '') throw new BadRequestException('Project code required');
    return this.svc.projectResetPrecheck(code.trim());
  }

  @Post('projects/:code/hard-reset')
  hardReset(
    @Param('code') code: string,
    @Body('confirmed_code') confirmedCode: string,
  ) {
    if (!code || code.trim() === '') throw new BadRequestException('Project code required');
    return this.svc.hardResetProject(code.trim(), (confirmedCode || '').trim());
  }
}
