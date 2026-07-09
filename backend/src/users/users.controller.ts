import {
  Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../data/mock-store';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('system_admin', 'prod_supervisor', 'ops_director')
  findAll(@CurrentUser() user: User) {
    return this.usersService.findAll(user);
  }

  @Get('technicians')
  @Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer')
  findTechs() {
    return this.usersService.findTechnicians();
  }

  @Get(':id')
  @Roles('system_admin', 'prod_supervisor', 'ops_director', 'wiring_technician')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.usersService.findOne(id, user);
  }

  @Post()
  @Roles('system_admin', 'prod_supervisor')
  create(@Body() dto: any, @CurrentUser() user: User) {
    return this.usersService.create(dto, user);
  }

  @Put(':id')
  @Roles('system_admin', 'prod_supervisor', 'ops_director', 'wiring_technician')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentUser() user: User,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Post(':id/toggle-status')
  @Roles('system_admin', 'prod_supervisor')
  toggleStatus(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.usersService.toggleStatus(id, user);
  }

  @Post(':id/reset-password')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { password: string },
    @CurrentUser() user: User,
  ) {
    return this.usersService.resetPassword(id, body.password, user);
  }

  @Delete(':id')
  @Roles('system_admin', 'prod_supervisor')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.usersService.remove(id, user);
  }
}
