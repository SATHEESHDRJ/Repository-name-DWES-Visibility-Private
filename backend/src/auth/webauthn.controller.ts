import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WebAuthnService } from './webauthn.service';

interface AuthUser { id: number; username: string; role: string; }

@Controller('api/auth/webauthn')
export class WebAuthnController {
  constructor(private readonly wa: WebAuthnService) {}

  // ── Registration (auth required — call after password sign-in) ───────────

  @Post('register/options')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  regOptions(@CurrentUser() user: AuthUser) {
    return this.wa.regOptions(user.id, user.username);
  }

  @Post('register/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  regVerify(
    @CurrentUser() user: AuthUser,
    @Body() body: { credential: RegistrationResponseJSON; device_label?: string },
  ) {
    return this.wa.regVerify(user.id, body.credential, body.device_label);
  }

  // ── Authentication (public) ───────────────────────────────────────────────

  @Post('login/options')
  @HttpCode(200)
  loginOptions(@Body() body?: { username?: string }) {
    return this.wa.loginOptions(body?.username);
  }

  @Post('login/verify')
  @HttpCode(200)
  loginVerify(
    @Body() body: { sessionId: string; credential: AuthenticationResponseJSON },
    @Request() req: { ip?: string },
  ) {
    const ip = req.ip ?? '127.0.0.1';
    return this.wa.loginVerify(body.sessionId, body.credential, ip);
  }

  // ── Public context (no secrets — helps clients confirm RP_ID alignment) ───

  @Get('config')
  config() {
    return this.wa.publicConfig();
  }

  // ── Device management (auth required) ─────────────────────────────────────

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.wa.status(user.id);
  }

  @Delete('credentials/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  remove(@Param('id') credentialId: string, @CurrentUser() user: AuthUser) {
    return this.wa.remove(credentialId, user.id);
  }
}
