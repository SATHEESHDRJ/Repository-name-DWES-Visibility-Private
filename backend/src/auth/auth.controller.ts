import {
  Controller, Post, Get, Body, Request, UseGuards, HttpCode, NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';
import { isDemoMode } from '../common/demo-mode.util';
import { HealthService } from '../common/health.service';

@Controller('api')
export class AuthController {
  constructor(
    private authService: AuthService,
    private healthService: HealthService,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: { username: string; password: string; project_code?: string },
    @Request() req,
  ) {
    const ip = req.ip || req.raw?.socket?.remoteAddress || '127.0.0.1';
    return this.authService.login(
      body.username,
      body.password,
      ip,
      body.project_code || '',
    );
  }

  // ── Device Preview (DEMO_MODE only — 404 in production) ────────────────────
  // Lists active local users and issues genuine RBAC sessions without exposing
  // passwords. Both routes return 404 unless DEMO_MODE is explicitly enabled.

  @Get('auth/dev/demo-roles')
  async demoRoles() {
    if (!isDemoMode()) throw new NotFoundException();
    return this.authService.listActiveDemoUsers();
  }

  @Post('auth/dev/demo-login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async demoLogin(@Body() body: { username: string }, @Request() req) {
    if (!isDemoMode()) throw new NotFoundException();
    const ip = req.ip || req.raw?.socket?.remoteAddress || '127.0.0.1';
    return this.authService.loginDemoUser(body?.username, ip);
  }

  @Post('auth/refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Body() body: { refresh_token: string },
    @Request() req,
  ) {
    const ip = req.ip || req.raw?.socket?.remoteAddress || '127.0.0.1';
    return this.authService.refreshAccessToken(body.refresh_token, ip);
  }

  @Post('auth/logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(
    @CurrentUser() user: User,
    @Request() req,
    @Body() body: { refresh_token?: string },
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.authService.logout(user.id, user.role, ip, body?.refresh_token);
  }


  @Get('env')
  env() {
    if (!isDemoMode()) {
      return {
        mode: 'production',
        server_time: new Date().toISOString(),
      };
    }
    const devHardReset =
      isDemoMode() || process.env.ALLOW_DEV_HARD_RESET === 'true';
    return {
      env_label: 'Demo / Development',
      db_host: 'localhost:5432',
      db_name: 'WiringSchemeDB',
      ssl: false,
      version: '1.0.0',
      server_time: new Date().toISOString(),
      mode: 'demo',
      demo_mode: true,
      dev_hard_reset_allowed: devHardReset,
    };
  }

  @Get('time')
  time() {
    const now = new Date();
    return {
      utc: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: User) {
    const { hashed_password: _hashed_password, ...safe } = user as any;
    return safe;
  }

  @Post('auth/bootstrap/defer-webauthn')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async deferWebAuthnBootstrap(@CurrentUser() user: User) {
    return this.authService.deferWebAuthnBootstrap(user.id, user.role);
  }
}
