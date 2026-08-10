import { Injectable } from '@nestjs/common';
import { TeamInstallLinkStoreService } from './team-install-link-store.service';

const TOKEN_MIN_LEN = 32;
const TOKEN_MAX_LEN = 64;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export const INSTALL_LINK_ALLOWED_ROLES = new Set([
  'system_admin',
  'ops_director',
  'prod_supervisor',
  'qaqc_engineer',
  'wiring_technician',
]);

function normalizeInstallClientIp(raw: string): string {
  const t = (raw || '').trim();
  if (t.startsWith('::ffff:')) return t.slice(7);
  return t;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split('/');
  const bits = bitsStr ? Number(bitsStr) : 32;
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function parseInstallLinkIpAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function isInstallLinkIpAllowed(clientIp: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const ip = normalizeInstallClientIp(clientIp);
  for (const entry of allowlist) {
    if (entry.includes('/')) {
      if (ipv4InCidr(ip, entry)) return true;
      continue;
    }
    if (ip === entry) return true;
  }
  return false;
}

export type InstallValidateSuccess = {
  ok: true;
  campaignLabel: string;
  organizationName: string;
  linkId: number;
};

export type InstallValidateFailure = { ok: false };

export type InstallValidateResult = InstallValidateSuccess | InstallValidateFailure;

export type AdminInstallLinkStatus = {
  configured: boolean;
  status: 'active' | 'disabled' | 'none';
  campaignLabel: string | null;
  organizationName: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  visitCount: number;
  lastVisitAt: string | null;
};

@Injectable()
export class TeamInstallLinkService {
  private readonly ipAllowlist = parseInstallLinkIpAllowlist(process.env.INSTALL_LINK_IP_ALLOWLIST);

  constructor(private readonly store: TeamInstallLinkStoreService) {}

  isTokenFormatValid(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const t = token.trim();
    if (t.length < TOKEN_MIN_LEN || t.length > TOKEN_MAX_LEN) return false;
    return TOKEN_PATTERN.test(t);
  }

  resolvePublicOrigin(): string {
    const fromEnv = (process.env.RP_ORIGIN || process.env.CORS_ORIGINS || '').split(',')[0]?.trim();
    if (fromEnv && fromEnv.startsWith('https://')) return fromEnv.replace(/\/$/, '');
    const domain = process.env.DWES_DOMAIN || 'dwes.ingenious-network.com';
    return `https://${domain}`;
  }

  buildShareUrl(token: string): string {
    return `${this.resolvePublicOrigin()}/install/${token}`;
  }

  validateForAuthenticatedUser(
    token: string,
    ip: string,
    actor: { id: number; role: string },
  ): InstallValidateResult {
    const ipHash = this.store.hashIp(ip);
    const actorDetail = `actor_role:${actor.role}`;

    if (!INSTALL_LINK_ALLOWED_ROLES.has(actor.role)) {
      this.store.audit({
        linkId: null,
        action: 'validate_fail_role',
        actorUserId: actor.id,
        ipHash,
        detail: actorDetail,
      });
      return { ok: false };
    }

    if (!isInstallLinkIpAllowed(ip, this.ipAllowlist)) {
      this.store.audit({
        linkId: null,
        action: 'validate_fail_ip',
        actorUserId: actor.id,
        ipHash,
        detail: actorDetail,
      });
      return { ok: false };
    }

    const core = this.evaluateStoredToken(token, ip, actor.id, ipHash, actorDetail);
    if (!core.ok) return { ok: false };

    this.store.recordVisit(core.linkId);
    this.store.audit({
      linkId: core.linkId,
      action: 'validate_success',
      actorUserId: actor.id,
      ipHash,
      detail: actorDetail,
    });

    return {
      ok: true,
      campaignLabel: core.campaignLabel,
      organizationName: core.organizationName,
      linkId: core.linkId,
    };
  }

  private evaluateStoredToken(
    token: string,
    _ip: string,
    actorUserId: number,
    ipHash: string,
    actorDetail: string,
  ):
    | { ok: true; campaignLabel: string; organizationName: string; linkId: number }
    | { ok: false } {
    if (!this.isTokenFormatValid(token)) {
      this.store.audit({
        linkId: null,
        action: 'validate_fail_malformed',
        actorUserId,
        ipHash,
        detail: actorDetail,
      });
      return { ok: false };
    }

    const hash = this.store.hashToken(token.trim());
    const row = this.store.findByTokenHash(hash);
    if (!row || !this.store.tokenMatches(row.token_hash, hash)) {
      this.store.audit({
        linkId: null,
        action: 'validate_fail_unknown',
        actorUserId,
        ipHash,
        detail: actorDetail,
      });
      return { ok: false };
    }

    if (row.status !== 'active') {
      this.store.audit({
        linkId: row.id,
        action: 'validate_fail_disabled',
        actorUserId,
        ipHash,
        detail: actorDetail,
      });
      return { ok: false };
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      this.store.audit({
        linkId: row.id,
        action: 'validate_fail_expired',
        actorUserId,
        ipHash,
        detail: actorDetail,
      });
      return { ok: false };
    }

    return {
      ok: true,
      campaignLabel: row.campaign_label,
      organizationName: row.organization_name,
      linkId: row.id,
    };
  }

  getAdminStatus(): AdminInstallLinkStatus {
    const row = this.store.getActiveLink();
    if (!row) {
      return {
        configured: false,
        status: 'none',
        campaignLabel: null,
        organizationName: null,
        createdAt: null,
        expiresAt: null,
        visitCount: 0,
        lastVisitAt: null,
      };
    }
    const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
    const effectiveStatus = row.status === 'active' && !expired ? 'active' : 'disabled';
    return {
      configured: true,
      status: effectiveStatus,
      campaignLabel: row.campaign_label,
      organizationName: row.organization_name,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      visitCount: row.visit_count,
      lastVisitAt: row.last_visit_at,
    };
  }

  regenerate(params: {
    actorUserId: number;
    expiryDays?: number | null;
    campaignLabel?: string;
    organizationName?: string;
  }): { shareUrl: string; expiresAt: string | null; createdAt: string } {
    this.store.disableAllActive();
    const token = this.store.generateToken();
    const tokenHash = this.store.hashToken(token);
    const expiresAt = params.expiryDays && params.expiryDays > 0
      ? new Date(Date.now() + params.expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const linkId = this.store.insertLink({
      tokenHash,
      campaignLabel: (params.campaignLabel || 'DWES Team Installation').trim(),
      organizationName: (params.organizationName || 'Ingenious Network FZC').trim(),
      createdByUserId: params.actorUserId,
      expiresAt,
    });

    this.store.audit({
      linkId,
      action: 'regenerated',
      actorUserId: params.actorUserId,
    });

    const createdAt = new Date().toISOString();
    return {
      shareUrl: this.buildShareUrl(token),
      expiresAt,
      createdAt,
    };
  }

  disable(actorUserId: number): { ok: true } {
    const active = this.store.getActiveLink();
    if (active) {
      this.store.disableById(active.id);
      this.store.audit({
        linkId: active.id,
        action: 'disabled',
        actorUserId,
      });
    }
    return { ok: true };
  }
}
