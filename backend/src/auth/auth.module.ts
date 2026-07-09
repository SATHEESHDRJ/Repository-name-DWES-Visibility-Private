import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WebAuthnService } from './webauthn.service';
import { WebAuthnController } from './webauthn.controller';
import { WebAuthnStoreService } from './webauthn-store.service';
import { AuthTokenStoreService } from './auth-token-store.service';
import { ProductionBootstrapService } from './production-bootstrap.service';
import { HealthModule } from '../common/health.module';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }
  return secret || 'DWES_JWT_SECRET_DEV_2026';
}

@Module({
  imports: [
    HealthModule,
    PassportModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRES || '12h' },
    }),
  ],
  providers: [AuthService, JwtStrategy, WebAuthnService, WebAuthnStoreService, AuthTokenStoreService, ProductionBootstrapService],
  controllers: [AuthController, WebAuthnController],
  exports: [AuthService, JwtModule, WebAuthnStoreService, AuthTokenStoreService, ProductionBootstrapService],
})
export class AuthModule {}
