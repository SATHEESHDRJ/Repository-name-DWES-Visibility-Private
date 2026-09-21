import {
  Controller, Get, Post, Body, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';
import { TeamInstallLinkService } from './team-install-link.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
@Controller('api/admin/team-install-link')
export class InstallLinkAdminController {
  constructor(private readonly installLinks: TeamInstallLinkService) {}

  @Get()
  status() {
    return this.installLinks.getAdminStatus();
  }

  @Post('regenerate')
  regenerate(
    @CurrentUser() user: User,
    @Body() body: { expiryDays?: number; campaignLabel?: string; organizationName?: string },
  ) {
    const expiryDays = body?.expiryDays != null ? Number(body.expiryDays) : null;
    return this.installLinks.regenerate({
      actorUserId: user.id,
      expiryDays: Number.isFinite(expiryDays) && expiryDays! > 0 ? expiryDays! : null,
      campaignLabel: body?.campaignLabel,
      organizationName: body?.organizationName,
    });
  }

  @Post('disable')
  disable(@CurrentUser() user: User) {
    return this.installLinks.disable(user.id);
  }
}
