import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenStoreService } from './auth-token-store.service';
import { ProductionBootstrapService } from './production-bootstrap.service';
import { WebAuthnStoreService } from './webauthn-store.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private tokenStore: AuthTokenStoreService,
    private bootstrap: ProductionBootstrapService,
    private webauthnStore: WebAuthnStoreService,
  ) {}

  private refreshExpiresDays(): number {
    const n = Number(process.env.JWT_REFRESH_EXPIRES_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 7;
  }

  // ── Shared token-issuance helper (used by password login AND WebAuthn login) ──

  async issueToken(userId: number, ip: string, projectCode = '') {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || !user.is_active) throw new UnauthorizedException('Account is disabled');

    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    await this.prisma.session_log.create({
      data: {
        user_id: user.id,
        action: 'login',
        project_code: projectCode || null,
        login_role: user.role,
        ip_address: ip,
      },
    });

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      employee_id: user.employee_id,
    };

    const access_token = this.jwtService.sign(payload);
    const refresh = this.tokenStore.createRefreshToken(user.id, this.refreshExpiresDays());
    const { hashed_password: _hp, ...safeUser } = user;
    const credCount = this.webauthnStore.byUserId(user.id).length;
    const bootstrap = this.bootstrap.statusForUser(user.id, user.role, credCount > 0);
    return {
      access_token,
      refresh_token: refresh.token,
      expires_in: process.env.JWT_ACCESS_EXPIRES || '12h',
      user: safeUser,
      bootstrap,
    };
  }

  async refreshAccessToken(refreshToken: string, ip: string) {
    if (!refreshToken?.trim()) throw new UnauthorizedException('Invalid refresh token');
    const userId = this.tokenStore.validateRefreshToken(refreshToken.trim());
    if (!userId) throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || !user.is_active) throw new UnauthorizedException('Account is disabled');

    // Rotate refresh token
    this.tokenStore.revokeRefreshToken(refreshToken.trim());
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      employee_id: user.employee_id,
    };
    const access_token = this.jwtService.sign(payload);
    const refresh = this.tokenStore.createRefreshToken(user.id, this.refreshExpiresDays());
    const { hashed_password: _hp, ...safeUser } = user;

    await this.prisma.session_log.create({
      data: {
        user_id: user.id,
        action: 'login',
        project_code: null,
        login_role: user.role,
        ip_address: ip,
      },
    });

    return {
      access_token,
      refresh_token: refresh.token,
      expires_in: process.env.JWT_ACCESS_EXPIRES || '12h',
      user: safeUser,
    };
  }

  // ── Password login (unchanged validation logic) ────────────────────────────

  async login(username: string, password: string, ip: string, projectCode = '') {
    const user = await this.prisma.users.findUnique({ where: { username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.is_active) throw new UnauthorizedException('Account is disabled');

    const match = await bcrypt.compare(password, user.hashed_password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    return this.issueToken(user.id, ip, projectCode);
  }

  async logout(userId: number, role: string, ip: string, refreshToken?: string) {
    if (refreshToken?.trim()) {
      this.tokenStore.revokeRefreshToken(refreshToken.trim());
    }
    await this.prisma.session_log.create({
      data: { user_id: userId, action: 'logout', login_role: role, ip_address: ip },
    });
    return { message: 'Logged out successfully' };
  }

  // ── Demo-mode only: safe user list (username / name / role, NO secrets) ────

  async getDemoUsers() {
    const ROLE_ORDER: Record<string, number> = {
      system_admin: 0, ops_director: 1, prod_supervisor: 2,
      qaqc_engineer: 3, wiring_technician: 4,
    };

    const DEMO_USERNAMES = [
      'sysadmin', 'director1', 'ops_director1', 'supervisor1',
      'qa1', 'qa2',
      'tech01', 'tech02', 'tech03', 'tech04', 'tech05',
      'tech1',  'tech2',  'tech3',  'tech4',  'tech5',  'tech6',
      'tech7',  'tech8',  'tech9',  'tech10', 'tech11', 'tech12',
      'tech13', 'tech14', 'tech15', 'tech16', 'tech17', 'tech18',
      'tech19', 'tech20', 'tech21', 'tech22', 'tech23', 'tech24',
    ];

    const rows = await this.prisma.users.findMany({
      where: { username: { in: DEMO_USERNAMES }, is_active: true },
      select: { username: true, full_name: true, role: true },
    });

    return rows.sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
      if (ro !== 0) return ro;
      return a.username.localeCompare(b.username, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  getLoginHints() {
    return {
      hint: 'Development seed credentials',
      accounts: [
        { role: 'system_admin',      username: 'sysadmin',      password: 'admin123'        },
        { role: 'ops_director',      username: 'director1',     password: 'dir123'          },
        { role: 'ops_director',      username: 'ops_director1', password: 'ops_director123' },
        { role: 'prod_supervisor',   username: 'supervisor1',   password: 'super123'        },
        { role: 'qaqc_engineer',     username: 'qa1',           password: 'qa1'             },
        { role: 'qaqc_engineer',     username: 'qa2',           password: 'qa2'             },
        { role: 'wiring_technician', username: 'tech1',         password: 'tech1'           },
      ],
    };
  }
}
