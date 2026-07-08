import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type DeploymentMode = 'intranet' | 'cloud';
export type CloudTier = 'standard' | 'performance' | 'enterprise';

export interface DeploymentConfig {
  mode: DeploymentMode;
  cloudAppUrl: string;
  cloudTier: CloudTier;
  cloudRegion: string;
  lastSwitched: string | null;
  notes: string;
}

const CONFIG_PATH = path.resolve(process.cwd(), 'deployment-config.json');

const DEFAULTS: DeploymentConfig = {
  mode: 'intranet',
  cloudAppUrl: '',
  cloudTier: 'performance',
  cloudRegion: 'us-east-1',
  lastSwitched: null,
  notes: '',
};

/** Reference pricing (USD/month) — illustrative for admin planning; not billing integration. */
export const DEPLOYMENT_PRICING = {
  intranet: {
    tier: 'intranet' as const,
    label: 'Local Intranet',
    monthlyUsd: 0,
    setupUsd: 0,
    summary: 'Run on your own PC/server over Wi-Fi or LAN. No cloud hosting fees.',
    features: [
      'Zero recurring cloud cost',
      'Works offline on local network',
      'Full data stays on-premises',
      'HTTPS via local certificates',
    ],
    sla: 'Depends on your hardware & network',
    latency: '< 5 ms on LAN',
  },
  standard: {
    tier: 'standard' as const,
    label: 'Cloud Standard',
    monthlyUsd: 149,
    setupUsd: 0,
    summary: 'Managed cloud for small teams — TLS, daily backups, 99.5% uptime SLA.',
    features: [
      'TLS 1.3 + automatic certificate renewal',
      'Daily encrypted backups (7-day retention)',
      'Auto-scaling for up to 25 concurrent users',
      'DDoS protection & WAF baseline',
    ],
    sla: '99.5% uptime',
    latency: '< 80 ms regional',
  },
  performance: {
    tier: 'performance' as const,
    label: 'Cloud Performance',
    monthlyUsd: 349,
    setupUsd: 0,
    summary: 'Recommended for production floors — faster compute, HA, 99.9% SLA.',
    features: [
      'Multi-AZ high availability',
      'Priority compute & CDN edge caching',
      'Hourly backups (30-day retention)',
      '24/7 monitoring & incident response',
    ],
    sla: '99.9% uptime',
    latency: '< 40 ms regional',
  },
  enterprise: {
    tier: 'enterprise' as const,
    label: 'Cloud Enterprise',
    monthlyUsd: 799,
    setupUsd: 500,
    summary: 'Maximum reliability — dedicated resources, SSO, compliance, 99.95% SLA.',
    features: [
      'Dedicated VPC & isolated database',
      'SSO / SAML + audit log export',
      'Geo-redundant failover',
      'Named support engineer & custom SLA',
    ],
    sla: '99.95% uptime',
    latency: '< 25 ms regional',
  },
} as const;

function lanIpv4Addresses(): string[] {
  const addrs: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

export const DeploymentConfigStore = {
  load(): DeploymentConfig {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        this.save(DEFAULTS);
        return { ...DEFAULTS };
      }
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
    } catch {
      return { ...DEFAULTS };
    }
  },

  save(patch: Partial<DeploymentConfig>): void {
    const current = this.load();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8');
  },

  getRuntimeIntranetUrls() {
    const port = process.env.VITE_PORT || '5173';
    const redirectPort = process.env.HTTP_REDIRECT_PORT || '8080';
    const ips = lanIpv4Addresses();
    return {
      httpsPort: port,
      httpRedirectPort: redirectPort,
      lanIps: ips,
      localHttps: `https://localhost:${port}`,
      localHttpRedirect: `http://localhost:${port}`,
      lanUrls: ips.map(ip => ({
        ip,
        https: `https://${ip}:${port}`,
        httpRedirect: `http://${ip}:${redirectPort}`,
      })),
    };
  },
};
