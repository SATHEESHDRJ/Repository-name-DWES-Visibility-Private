import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { ProductionBootstrapService } from './production-bootstrap.service';
import { loadWebAuthnConfig } from './webauthn-config';
import { WebAuthnStoreService } from './webauthn-store.service';

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);

  private readonly config = loadWebAuthnConfig();
  private readonly rpName   = this.config.rpName;
  private readonly rpId     = this.config.rpId;
  private readonly rpOrigins = this.config.rpOrigins;

  // In-memory challenge stores (key: userId string for reg, sessionId for login)
  private readonly regChallenges   = new Map<string, ChallengeEntry>();
  private readonly loginChallenges = new Map<string, ChallengeEntry>();

  constructor(
    private readonly store:       WebAuthnStoreService,
    private readonly prisma:      PrismaService,
    private readonly authService: AuthService,
    private readonly bootstrap:   ProductionBootstrapService,
  ) {}

  // ── Registration (requires prior password auth) ───────────────────────────

  async regOptions(userId: number, username: string) {
    const existing = this.store.byUserId(userId);

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID:   this.rpId,
      userName: username,
      userID:   Buffer.from(String(userId)),
      excludeCredentials: existing.map(c => ({
        id: c.credential_id,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
    });

    this.regChallenges.set(String(userId), {
      challenge:  options.challenge,
      expiresAt:  Date.now() + CHALLENGE_TTL,
    });
    this.purge(this.regChallenges);
    return options;
  }

  async regVerify(
    userId: number,
    response: RegistrationResponseJSON,
    deviceLabel?: string,
  ) {
    const entry = this.regChallenges.get(String(userId));
    if (!entry || Date.now() > entry.expiresAt)
      throw new BadRequestException('Registration challenge expired or not found');
    this.regChallenges.delete(String(userId));

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge:      entry.challenge,
      expectedOrigin:         this.rpOrigins,
      expectedRPID:           this.rpId,
      requireUserVerification: true,
    });

    if (!result.verified || !result.registrationInfo)
      throw new BadRequestException('Registration verification failed');

    const { credential } = result.registrationInfo;

    this.store.insert({
      credentialId: credential.id,
      userId,
      publicKey:    Buffer.from(credential.publicKey),
      counter:      credential.counter,
      transports:   credential.transports as string[] | undefined,
      deviceLabel,
    });

    this.bootstrap.recordWebAuthnEnrollment(userId);

    this.logger.log(`Registered passkey for user ${userId} — device: ${deviceLabel ?? 'unlabelled'}`);
    return { success: true };
  }

  // ── Authentication (public — no session required) ─────────────────────────

  async loginOptions(username?: string) {
    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] | undefined;

    if (username) {
      const user = await this.prisma.users.findUnique({ where: { username } });
      if (user) {
        const creds = this.store.byUserId(user.id);
        allowCredentials = creds.map(c => ({
          id: c.credential_id,
          transports: c.transports
            ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
            : undefined,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID:             this.rpId,
      allowCredentials,
      userVerification: 'required',
      timeout:          60_000,
    });

    const sessionId = uuidv4();
    this.loginChallenges.set(sessionId, {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL,
    });
    this.purge(this.loginChallenges);
    return { sessionId, options };
  }

  async loginVerify(
    sessionId: string,
    response: AuthenticationResponseJSON,
    ip: string,
  ) {
    const entry = this.loginChallenges.get(sessionId);
    if (!entry || Date.now() > entry.expiresAt)
      throw new BadRequestException('Login challenge expired or not found');
    this.loginChallenges.delete(sessionId);

    const row = this.store.byId(response.id);
    if (!row)
      throw new UnauthorizedException('Credential not enrolled on this server');

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge:       entry.challenge,
      expectedOrigin:          this.rpOrigins,
      expectedRPID:            this.rpId,
      credential: {
        id:         row.credential_id,
        publicKey:  new Uint8Array(row.public_key),
        counter:    row.counter,
        transports: row.transports
          ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
      requireUserVerification: true,
    });

    if (!result.verified)
      throw new UnauthorizedException('Biometric authentication failed');

    this.store.updateCounter(row.credential_id, result.authenticationInfo.newCounter);
    this.logger.log(`Biometric login: userId=${row.user_id} credId=${row.credential_id}`);

    // Issue the exact same JWT/session as a password login
    return this.authService.issueToken(row.user_id, ip);
  }

  // ── Status & management ───────────────────────────────────────────────────

  publicConfig() {
    return {
      rpId:      this.rpId,
      rpName:    this.rpName,
      origins:   this.rpOrigins,
    };
  }

  status(userId: number) {
    const creds = this.store.byUserId(userId);
    return {
      enrolled: creds.length > 0,
      count:    creds.length,
      credentials: creds.map(c => ({
        id:          c.credential_id,
        deviceLabel: c.device_label,
        createdAt:   c.created_at,
        lastUsedAt:  c.last_used_at,
      })),
    };
  }

  remove(credentialId: string, userId: number) {
    this.store.remove(credentialId, userId);
    return { success: true };
  }

  private purge(map: Map<string, ChallengeEntry>) {
    const now = Date.now();
    for (const [k, v] of map) {
      if (now > v.expiresAt) map.delete(k);
    }
  }
}
