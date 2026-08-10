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
import { TeamInstallLinkStoreService } from './team-install-link-store.service';
import { TeamInstallLinkService } from './team-install-link.service';
import { InstallLinkController } from './install-link.controller';
import { InstallLinkAdminController } from './install-link-admin.controller';
import { HealthModule } from '../common/health.module';

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

function validateJwtSecret(secret: string | undefined): string {
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

function jwtSecret(): string {
  return validateJwtSecret(process.env.JWT_SECRET);
}

@Module({
  imports: [
    HealthModule,
    PassportModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' },
    }),
  ],
  providers: [
    AuthService, JwtStrategy, WebAuthnService, WebAuthnStoreService, AuthTokenStoreService,
    ProductionBootstrapService, TeamInstallLinkStoreService, TeamInstallLinkService,
  ],
  controllers: [AuthController, WebAuthnController, InstallLinkController, InstallLinkAdminController],
  exports: [
    AuthService, JwtModule, WebAuthnStoreService, AuthTokenStoreService, ProductionBootstrapService,
    TeamInstallLinkService,
  ],
})
export class AuthModule {}
