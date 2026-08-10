import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

const WEAK_JWT_SECRETS = new Set([
  'DWES_JWT_SECRET_DEV_2026',
  'secret',
  'changeme',
  'jwt-secret',
  'dev-secret',
  'test-secret',
  'your-secret-key',
  'my-secret',
]);

function getValidatedSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('[DWES] JWT_SECRET environment variable is required but not set');
  }
  const trimmed = secret.trim();
  if (trimmed.length < 32) {
    throw new Error('[DWES] JWT_SECRET must be at least 32 characters long');
  }
  if (WEAK_JWT_SECRETS.has(trimmed)) {
    throw new Error('[DWES] JWT_SECRET must not be a known default or weak value');
  }
  return trimmed;
}

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  full_name: string;
  employee_id: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getValidatedSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.users.findUnique({ where: { id: payload.sub } });
    if (!user || !user.is_active) throw new UnauthorizedException('User not found or disabled');
    const { hashed_password: _hashed_password, ...safe } = user;
    return safe;
  }
}
