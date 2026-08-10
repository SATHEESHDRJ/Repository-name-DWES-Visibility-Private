import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { DevService } from './dev.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { assertDevHardResetAllowed } from '../common/dev-reset.util';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
@Controller('api/dev')
export class DevController {
  constructor(private readonly svc: DevService) {}

  @Get('hard-reset')
  hardResetPrecheck() {
    assertDevHardResetAllowed();
    return this.svc.hardResetPrecheck();
  }

  @Post('hard-reset')
  hardReset(@Body('confirmed_phrase') phrase: string) {
    assertDevHardResetAllowed();
    return this.svc.hardReset((phrase || '').trim());
  }
}
