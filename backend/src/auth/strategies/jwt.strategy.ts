import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

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
      secretOrKey: process.env.JWT_SECRET || 'DWES_JWT_SECRET_DEV_2026',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.users.findUnique({ where: { id: payload.sub } });
    if (!user || !user.is_active) throw new UnauthorizedException('User not found or disabled');
    const { hashed_password: _hashed_password, ...safe } = user;
    return safe;
  }
}
