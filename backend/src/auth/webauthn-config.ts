import { Logger } from '@nestjs/common';

const logger = new Logger('WebAuthnConfig');

export interface WebAuthnConfig {
  rpName: string;
  rpId: string;
  /** Primary origin (first in RP_ORIGIN list). */
  rpOrigin: string;
  /** All allowed origins for verifyRegistration/verifyAuthentication. */
  rpOrigins: string[];
}

/** WebAuthn RP IDs must be a registrable domain suffix — not a raw IP. */
export function isValidRpId(rpId: string): boolean {
  if (!rpId || rpId.includes(':')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rpId)) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(rpId);
}

export function loadWebAuthnConfig(): WebAuthnConfig {
  const rpName = process.env.RP_NAME?.trim() || 'DWES';
  const rpId = process.env.RP_ID?.trim() || 'localhost';
  const rpOriginRaw = process.env.RP_ORIGIN?.trim() || 'https://localhost:5173';

  const rpOrigins = rpOriginRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!isValidRpId(rpId)) {
    logger.warn(
      `RP_ID="${rpId}" is not a valid WebAuthn hostname (IPs are rejected by browsers). ` +
        'Use a hostname like dwes.local with HTTPS — see DEPLOY-LAN.md.',
    );
  }

  for (const origin of rpOrigins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        logger.warn(
          `RP_ORIGIN "${origin}" is not HTTPS — WebAuthn on LAN requires https://hostname:port`,
        );
      }
      if (url.hostname !== rpId && !url.hostname.endsWith(`.${rpId}`)) {
        logger.warn(
          `RP_ORIGIN hostname "${url.hostname}" does not match RP_ID "${rpId}" — ` +
            'fingerprint enrollment will fail until they align.',
        );
      }
    } catch {
      logger.warn(`RP_ORIGIN "${origin}" is not a valid URL`);
    }
  }

  return {
    rpName,
    rpId,
    rpOrigin: rpOrigins[0] ?? 'https://localhost:5173',
    rpOrigins,
  };
}
