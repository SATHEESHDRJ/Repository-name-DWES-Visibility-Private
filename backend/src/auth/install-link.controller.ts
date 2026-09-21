import {
  Controller, Post, Body, Request, HttpCode, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TeamInstallLinkService } from './team-install-link.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api/install')
export class InstallLinkController {
  constructor(private readonly installLinks: TeamInstallLinkService) {}

  /**
   * Validates a team installation token for an authenticated DWES employee.
   * Invalid tokens always receive the same generic 403 response.
   */
  @Post('validate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'system_admin',
    'ops_director',
    'prod_supervisor',
    'qaqc_engineer',
    'wiring_technician',
  )
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  validate(@Body() body: { token?: string }, @Request() req: { user: { id: number; role: string }; ip?: string; raw?: { socket?: { remoteAddress?: string } } }) {
    const ip = req.ip || req.raw?.socket?.remoteAddress || '127.0.0.1';
    const token = (body?.token || '').trim();
    const user = req.user;
    const result = this.installLinks.validateForAuthenticatedUser(token, ip, {
      id: user.id,
      role: user.role,
    });
    if (!result.ok) {
      throw new ForbiddenException('Access denied');
    }
    return {
      campaignLabel: result.campaignLabel,
      organizationName: result.organizationName,
      linkId: result.linkId,
    };
  }
}
