import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 120,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.DWES_BASE_URL || 'https://localhost';

export default function () {
  const res = http.get(`${BASE}/healthz`);
  check(res, { 'healthz 200': (r) => r.status === 200 });
  const api = http.get(`${BASE}/api/health`);
  check(api, { 'api health ok': (r) => r.status === 200 });
  sleep(1);
}
