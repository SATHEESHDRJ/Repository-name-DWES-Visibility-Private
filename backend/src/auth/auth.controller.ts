import {
  Controller, Post, Get, Body, Request, UseGuards, HttpCode, NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';

@Controller('api')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() body: { username: string; password: string; project_code?: string },
    @Request() req,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    return this.authService.login(
      body.username,
      body.password,
      ip,
      body.project_code || '',
    );
  }

  @Post('auth/logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@CurrentUser() user: User, @Request() req) {
    const ip = req.ip || '127.0.0.1';
    return this.authService.logout(user.id, user.role, ip);
  }

  @Get('login-hints')
  getHints() {
    return this.authService.getLoginHints();
  }

  // DEMO_MODE-gated: returns only username / full_name / role — no secrets.
  // Returns 404 when DEMO_MODE !== 'true' so it is invisible in production.
  @Get('auth/demo-users')
  async demoUsers() {
    if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
    return this.authService.getDemoUsers();
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      db: 'postgresql',
      db_name: 'WiringSchemeDB',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('env')
  env() {
    const demo = process.env.DEMO_MODE === 'true';
    const devHardReset =
      demo || process.env.ALLOW_DEV_HARD_RESET === 'true';
    return {
      env_label: demo ? 'Demo / Development' : 'Production',
      db_host: 'localhost:5432',
      db_name: 'WiringSchemeDB',
      ssl: false,
      version: '1.0.0',
      server_time: new Date().toISOString(),
      mode: demo ? 'demo' : 'production',
      demo_mode: demo,
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
}
