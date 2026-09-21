/**
 * DWES — >=70 concurrent technician-like sessions (local / staging only).
 *
 * Models a technician session rhythm:
 *   health -> login -> assigned panels -> operational twin peek
 *
 * Default target: http://localhost:3001 (Nest API). Do NOT point at production.
 *
 * Usage:
 *   k6 run -e DWES_BASE_URL=http://localhost:3001 infra/load/k6/tech-70vus.js
 *   npm run load:tech70
 *
 * Optional env:
 *   DWES_TECH_USER / DWES_TECH_PASS — demo technician credentials (local only)
 *   If login fails, VU still exercises health paths.
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const loginFail = new Rate('tech_login_fail');
const panelLatency = new Trend('tech_panels_ms');

export const options = {
  scenarios: {
    tech_sessions: {
      executor: 'constant-vus',
      vus: 70,
      duration: '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1200'],
    http_req_failed: ['rate<0.05'],
    tech_login_fail: ['rate<0.5'],
  },
};

const BASE = (__ENV.DWES_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const USER = __ENV.DWES_TECH_USER || 'tech1';
const PASS = __ENV.DWES_TECH_PASS || '';

export default function () {
  group('health', () => {
    const hz = http.get(`${BASE}/healthz`);
    check(hz, { 'healthz 200': (r) => r.status === 200 });
    const api = http.get(`${BASE}/api/health`);
    check(api, { 'api health ok': (r) => r.status === 200 || r.status === 503 });
  });

  let token = '';
  group('login', () => {
    if (!PASS) {
      loginFail.add(1);
      sleep(0.5);
      return;
    }
    const res = http.post(
      `${BASE}/api/auth/login`,
      JSON.stringify({ username: USER, password: PASS }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    const ok = check(res, {
      'login 200/201': (r) => r.status === 200 || r.status === 201,
    });
    loginFail.add(ok ? 0 : 1);
    if (ok) {
      try {
        const body = res.json();
        token = body.access_token || body.accessToken || body.token || '';
      } catch (_) {
        token = '';
      }
    }
  });

  if (token) {
    const headers = { Authorization: `Bearer ${token}` };
    group('technician_session', () => {
      const panels = http.get(`${BASE}/api/tech/my-panels`, { headers });
      panelLatency.add(panels.timings.duration);
      check(panels, {
        'panels ok': (r) => r.status === 200 || r.status === 403 || r.status === 404,
      });

      const twin = http.get(`${BASE}/api/engineering/operational-twin/DEMO/FRAME1?cableRef=1`, {
        headers,
      });
      check(twin, {
        'twin reachable': (r) => r.status === 200 || r.status === 403 || r.status === 404,
      });
    });
  }

  sleep(1 + Math.random());
}